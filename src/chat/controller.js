const string=(value)=>typeof value==='string'&&value.length>0;
export function messageDTO(m) {
  if(!m||!['id','senderId','createdAt'].every(key=>string(m[key]))||typeof m.senderName!=='string'||typeof m.body!=='string'||!Number.isFinite(Date.parse(m.createdAt)))throw new Error('Invalid Realtime message.');
  return {id:m.id,senderId:m.senderId,senderName:m.senderName,body:m.body,createdAt:m.createdAt};
}
export function conversationDTO(c) {
  if(!c||!string(c.id)||!['dm','clan'].includes(c.kind)||!Array.isArray(c.members)||c.kind==='clan'&&!string(c.clanId))throw new Error('Invalid Realtime conversation.');
  return {...c,members:c.members.map(m=>{if(!string(m.id)||typeof m.name!=='string'||typeof m.online!=='boolean')throw new Error('Invalid Realtime member.');return {...m};})};
}
const fault=(message,code='chat_unavailable')=>Object.assign(new Error(message),{code});
export function createChatController({client,onChange,onNotification=()=>{},onConfig=()=>{},socketFactory=url=>new WebSocket(url),random=Math.random,now=Date.now,ackTimeout=10000,handshakeTimeout=10000}) {
  let dead=false,enabled=false,config={},clanId=null,socket,epoch=0,attempt=0,authTried=false,forceNext=false;
  let reconnectTimer,helloTimer,stableTimer,cooldownTimer,sequence=0,listRevision=0,selectedKey=null,rejectedVersion;
  let state={status:client?'idle':'unavailable',playerId:null,gameId:null,conversations:[],messages:{},history:{},error:'',pending:null,cooldownUntil:0};
  const pending=new Map(),loading=new Map(),recoveryAnchors=new Map();
  const emit=()=>{if(!dead)onChange({...state});};
  const valid=ticket=>!dead&&enabled&&ticket===epoch;
  const allowed=c=>config.chat?.enabled===true&&(c.kind==='dm'?config.chat.directMessages===true:config.chat.clanChat===true&&config.clan?.enabled===true&&c.clanId===clanId);
  const room=key=>state.conversations.find(c=>allowed(c)&&(key==='clan'?c.kind==='clan'&&c.clanId===clanId:c.kind==='dm'&&c.members.some(p=>p.id===key&&p.id!==state.playerId)));
  const sorted=messages=>[...new Map(messages.map(m=>[m.id,m])).values()].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
  function merge(id,messages){state={...state,messages:{...state.messages,[id]:sorted([...(state.messages[id]??[]),...messages])}};}
  function finishPending(error) {
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();state={...state,pending:null};
  }
  function detach() {
    clearTimeout(helloTimer);clearTimeout(stableTimer);
    if(socket){const old=socket;socket=null;old.onopen=old.onmessage=old.onerror=old.onclose=null;try{old.close(1000,'SDK cleanup');}catch{}}
  }
  function stop() {
    epoch++;clearTimeout(reconnectTimer);clearTimeout(cooldownTimer);detach();loading.clear();
    if(pending.size)state={...state,warning:'Delivery is unknown. Check history before retrying.'};
    finishPending(fault('Connection closed; delivery may be unknown. Check history before retrying.','delivery_unknown'));
  }
  async function history(id,{older=false,recover=false}={}) {
    if(dead||!enabled||state.status!=='connected'||!state.conversations.some(c=>c.id===id&&allowed(c)))return;
    if(loading.has(id))return loading.get(id);
    // Live frames can arrive before the first recovery read. Anchor recovery at
    // the last pre-disconnect message, not a just-arrived frame at the head.
    const anchor=recoveryAnchors.get(id);
    recover ||= Boolean(anchor);
    const ticket=epoch,known=new Set(anchor?[anchor]:(state.messages[id]??[]).map(m=>m.id));
    const task=Promise.resolve().then(async()=>{
      if(!valid(ticket))return;
      state={...state,history:{...state.history,[id]:{...state.history[id],loading:true,error:''}}};emit();
      try {
        let before=older?state.messages[id]?.[0]?.id:undefined,hasMore=false;
        do {
          const limit=Number.isInteger(config.chat?.historyLimit)&&config.chat.historyLimit>0?Math.min(100,config.chat.historyLimit):50;
          const page=await client.listMessages(id,{...(before?{before}:{}),limit});
          if(!valid(ticket)||!state.conversations.some(c=>c.id===id&&allowed(c)))return;
          if(!Array.isArray(page.messages)||typeof page.hasMore!=='boolean')throw fault('Invalid Realtime history.');
          const batch=page.messages.map(messageDTO);merge(id,batch);hasMore=page.hasMore;
          const reached=known.size&&batch.some(m=>known.has(m.id));
          const next=batch.at(-1)?.id;
          if(!recover||older||!known.size||reached||!hasMore||!next||next===before)break;
          before=next;
        }while(valid(ticket));
        if(!valid(ticket))return;
        recoveryAnchors.delete(id);
        state={...state,history:{...state.history,[id]:{loading:false,error:'',hasMore:older||!known.size?hasMore:state.history[id]?.hasMore??hasMore,loaded:true}}};
        read();emit();
      }catch(error){
        if(!valid(ticket))return;
        if(error.code==='not_member')remove(id);
        state={...state,history:{...state.history,[id]:{...state.history[id],loading:false,error:error.message}},error:error.message};emit();
      }
    });
    loading.set(id,task);try{await task;}finally{if(loading.get(id)===task)loading.delete(id);}
  }
  function read() {
    const current=room(selectedKey),last=current&&state.messages[current.id]?.at(-1);
    if(last&&socket?.readyState===1&&state.status==='connected')socket.send(JSON.stringify({type:'conversation.read',data:{conversationId:current.id,lastMessageId:last.id}}));
  }
  function remove(id) {
    recoveryAnchors.delete(id);
    const messages={...state.messages},histories={...state.history};delete messages[id];delete histories[id];
    state={...state,conversations:state.conversations.filter(c=>c.id!==id),messages,history:histories};
    for(const [key,item]of pending)if(item.conversationId===id){clearTimeout(item.timer);pending.delete(key);item.reject(fault('You are no longer a member.','not_member'));state={...state,pending:null};}
  }
  async function refresh() {
    if(dead||!enabled||state.status!=='connected')return;
    const ticket=epoch,revision=++listRevision;
    try {
      const raw=await client.listConversations();if(!valid(ticket))return;
      if(revision!==listRevision)return; // An event/read already replaced this snapshot.
      if(!Array.isArray(raw.conversations))throw fault('Invalid Realtime conversation list.');
      const conversations=raw.conversations.map(conversationDTO);
      const ids=new Set(conversations.map(c=>c.id));for(const id of Object.keys(state.messages))if(!ids.has(id))remove(id);
      state={...state,conversations,error:'',listLoading:false};emit();
      const current=room(selectedKey);if(current)await history(current.id,{recover:true});
    }catch(error){if(valid(ticket)){state={...state,error:error.message,listLoading:false};emit();}}
  }
  function retry(code,wasHello) {
    if(dead||!enabled)return;
    if(code===1000||code===4003){state={...state,status:'disconnected'};emit();return;}
    let delay=code===1008?30000:Math.min(30000,1000*2**Math.min(attempt++,5))*(0.8+random()*0.2);
    if(code===4001||!wasHello&&!authTried){if(!authTried){forceNext=true;authTried=true;delay=0;}}
    state={...state,status:'disconnected'};emit();reconnectTimer=setTimeout(connect,delay);
  }
  async function connect() {
    if(dead||!enabled||!client)return;
    clearTimeout(reconnectTimer);detach();const ticket=++epoch;loading.clear();
    for(const [id,messages]of Object.entries(state.messages))if(messages.length&&!recoveryAnchors.has(id))recoveryAnchors.set(id,messages.at(-1).id);
    state={...state,status:'connecting',error:'',conversations:[],listLoading:true};emit();let wasHello=false;
    try {
      const acquired=await client.acquire(forceNext,rejectedVersion);forceNext=false;if(!valid(ticket))return;
      rejectedVersion=acquired.version;
      const ws=socketFactory(client.socketUrl(acquired.token));socket=ws;
      helloTimer=setTimeout(()=>{if(valid(ticket)){state={...state,error:'Realtime did not complete authentication.'};try{ws.close();}catch{};}},handshakeTimeout);
      ws.onopen=()=>{}; // A socket open is not authentication or a conversation.
      ws.onerror=()=>{}; // Browser error/URL may contain credentials; never log/forward it.
      ws.onclose=event=>{
        if(!valid(ticket))return;clearTimeout(helloTimer);clearTimeout(stableTimer);socket=null;epoch++;loading.clear();
        const uncertain=pending.size>0;finishPending(fault('Disconnected; delivery is unknown. Check history before retrying.','delivery_unknown'));
        state={...state,error:uncertain?'Delivery is unknown. Reconnect and check history before retrying.':'Disconnected from chat.',warning:uncertain?'Delivery is unknown. Check history before retrying.':state.warning};retry(event.code,wasHello);
      };
      ws.onmessage=event=>{
        if(!valid(ticket))return;
        try {
          const frame=JSON.parse(event.data),d=frame.data;
          if(!d||typeof d!=='object')return;
          if(frame.type==='hello'){
            if(wasHello||typeof d.playerId!=='string'||typeof frame.game_id!=='string')return;
            wasHello=true;clearTimeout(helloTimer);
            if(state.playerId&&(state.playerId!==d.playerId||state.gameId!==frame.game_id)){recoveryAnchors.clear();state={...state,conversations:[],messages:{},history:{}};}
            state={...state,playerId:d.playerId,gameId:frame.game_id,status:'connected',error:'',history:Object.fromEntries(Object.entries(state.history).map(([id,h])=>[id,{...h,loaded:false}]))};
            stableTimer=setTimeout(()=>{attempt=0;authTried=false;},10000);emit();void refresh();if(d.configVersion>0)onConfig({version:d.configVersion});return;
          }
          if(!wasHello||frame.game_id!==state.gameId)return;
          if(frame.type==='message.new'){
            if(!state.conversations.some(c=>c.id===d.conversationId&&allowed(c)))return;
            const message=messageDTO(d.message);merge(d.conversationId,[message]);
            state={...state,conversations:state.conversations.map(c=>c.id===d.conversationId?{...c,lastMessage:message}:c)};read();emit();
          }else if(frame.type==='message.ack'){
            const item=pending.get(d.replyTo);if(!item||typeof d.messageId!=='string')return;
            clearTimeout(item.timer);pending.delete(d.replyTo);state={...state,pending:null,error:''};emit();item.resolve(d);void history(item.conversationId,{recover:true});
          }else if(frame.type==='error'){
            const item=pending.get(d.replyTo);if(!item)return;
            clearTimeout(item.timer);pending.delete(d.replyTo);state={...state,pending:null,error:typeof d.message==='string'?d.message:'Message rejected.'};
            if(d.code==='slow_mode'||d.code==='rate_limited'){
              const ms=d.code==='rate_limited'?5000:Number.isFinite(d.retryAfterMs)?Math.max(0,d.retryAfterMs):1000;
              state={...state,cooldownUntil:now()+ms};clearTimeout(cooldownTimer);cooldownTimer=setTimeout(()=>{state={...state,cooldownUntil:0};emit();},ms);
            }
            if(['not_member','feature_disabled','blocked'].includes(d.code)){item.blocked=true;state={...state,blocked:{...state.blocked,[item.conversationId]:true}};if(d.code==='not_member')void refresh();}
            emit();item.reject(fault(state.error,d.code));
          }else if(frame.type==='conversation.added'||frame.type==='conversation.removed'){
            listRevision++;if(frame.type==='conversation.removed')remove(d.conversationId);
            else{const c=conversationDTO(d.conversation);state={...state,conversations:[...state.conversations.filter(old=>old.id!==c.id),c]};}
            emit();void refresh();
          }else if(frame.type==='presence.update'){
            if(!['online','offline'].includes(d.status))return;
            state={...state,conversations:state.conversations.map(c=>({...c,members:c.members.map(m=>m.id===d.playerId?{...m,online:d.status==='online'}:m)}))};emit();
          }else if(frame.type==='notification')onNotification(d);
          else if(frame.type==='config.updated')onConfig(d);
        }catch{state={...state,error:'Invalid Realtime frame.'};emit();}
      };
    }catch{if(valid(ticket)){state={...state,error:'Unable to connect to Realtime.'};retry(1006,false);}}
  }
  return {
    configure(next,nextClanId) {
      config=next;const changedClan=clanId!==nextClanId;clanId=nextClanId;
      const nextEnabled=Boolean(client&&config.chat?.enabled===true&&(config.chat.directMessages===true||config.chat.clanChat===true&&config.clan?.enabled===true));
      if(enabled!==nextEnabled){enabled=nextEnabled;if(enabled)void connect();else{stop();recoveryAnchors.clear();state={...state,status:'unavailable',conversations:[],messages:{},history:{},blocked:{}};emit();}}
      else if(enabled&&changedClan){const current=room(selectedKey);if(current)void history(current.id);}
    },
    select(key) {const changed=selectedKey!==key;selectedKey=key;const current=room(key);if(current&&(changed||!state.history[current.id]?.loaded))void history(current.id);},
    resolve:key=>room(key),
    refresh,
    loadEarlier(){const current=room(selectedKey);if(current)return history(current.id,{older:true});},
    reconnect(){if(dead||!enabled)return;stop();attempt=0;authTried=false;state={...state,blocked:{}};void connect();},
    send(key,body) {
      const current=room(key),text=typeof body==='string'?body.trim():'';
      if(dead||state.status!=='connected'||!current||socket?.readyState!==1||!allowed(current))return Promise.reject(fault('This conversation is unavailable.'));
      if(state.pending||state.cooldownUntil>now()||state.blocked?.[current.id])return Promise.reject(fault('Sending is currently unavailable.'));
      if(!text)return Promise.reject(fault('Enter a message.','empty'));
      if([...text].length>(config.chat.maxMessageLength??1000))return Promise.reject(fault('Message exceeds the configured limit.','too_long'));
      const id=`sdk-${++sequence}`,frame=JSON.stringify({type:'message.send',id,data:{conversationId:current.id,body:text}});
      if(new TextEncoder().encode(frame).length>8192)return Promise.reject(fault('Message frame is too large.','too_long'));
      return new Promise((resolve,reject)=>{
        const item={resolve,reject,conversationId:current.id,timer:setTimeout(()=>{
          pending.delete(id);state={...state,pending:null,error:'Delivery was not confirmed. Check history before retrying.',warning:'Delivery was not confirmed. Check history before retrying.'};emit();reject(fault(state.error,'delivery_unknown'));void history(current.id,{recover:true});
        },ackTimeout)};
        pending.set(id,item);state={...state,pending:{id,conversationId:current.id},error:'',warning:''};emit();
        try{socket.send(frame);}catch{clearTimeout(item.timer);pending.delete(id);state={...state,pending:null,error:'Unable to send. The draft was kept.'};emit();reject(fault(state.error));}
      });
    },
    destroy(){if(dead)return;dead=true;enabled=false;stop();},
  };
}
