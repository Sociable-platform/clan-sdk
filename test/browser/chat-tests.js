// Mock protocol integration in a real browser. DTO shapes/events follow
// openapi/realtime.yaml and realtime-ws.md; these identities/messages are test-only.
import {init} from '/src/index.js';
import {currentConfig,sharedRoot,json,waitFor,type,sleep,deferred} from './helpers.js';
const me='7f1e0c2a-5b3d-4e8f-9a10-2b3c4d5e6f70',peer='5a2b3c4d-1e2f-4a3b-8c9d-0e1f2a3b4c5d';
const room={id:'0193a6b4-7c1e-7d2a-9f10-2b3c4d5e6f70',kind:'dm',clanId:null,members:[{id:me,name:'Ali',online:true},{id:peer,name:'Rashad',online:true}],lastMessage:null,unread:0};
const message=(id,body,senderId=peer)=>({id,body,senderId,senderName:senderId===me?'Ali':'Rashad',createdAt:'2026-11-09T18:20:00Z'});
const config=()=>{const c=currentConfig();c.clan.enabled=false;c.friends.enabled=false;c.chat.enabled=true;c.chat.directMessages=true;c.chat.clanChat=false;c.layout.startCollapsed=false;return c;};
export function registerChatTests({test,assert,container}) {
 async function fixture(run,fetcher) {
  const oldFetch=window.fetch,oldSocket=window.WebSocket,sockets=[],handles=[],calls=[],messages=[];
  class Socket {
   constructor(){this.readyState=1;this.sent=[];sockets.push(this);}
   send(text){this.sent.push(JSON.parse(text));}
   close(){this.closed=true;this.readyState=3;}
   frame(type,data){this.onmessage?.({data:JSON.stringify({event_id:'test-event',type,game_id:'game',data})});}
   hello(){this.frame('hello',{playerId:me,configVersion:0,onlineFriends:[]});}
  }
  window.WebSocket=Socket;
  window.fetch=async(url,options)=>{
   calls.push({url,...options});
   const response=fetcher?.(url,options);if(response!==undefined)return response;
   return json(url.endsWith('/conversations')?{conversations:[room]}:{messages:[...messages].reverse(),hasMore:false});
  };
  const sdk=init({socialUrl:'https://social.test',realtimeUrl:'https://realtime.test',getPlayerToken:async()=> 'test-token'});
  const mount=(cfg=config())=>{const target=container(),handle=sdk.mountExperience({container:target,config:cfg});handles.push(handle);return {target,handle,root:sharedRoot(target)};};
  const ready=async mounted=>{await waitFor(()=>sockets.length);sockets.at(-1).hello();await waitFor(()=>mounted.root.querySelector('[data-key="message"]')&&!mounted.root.textContent.includes('Loading messages'));};
  try{await run({sdk,mount,ready,sockets,calls,messages});}finally{handles.forEach(h=>h.destroy());window.fetch=oldFetch;window.WebSocket=oldSocket;}
 }
 test('live Chat waits for hello, loads actual conversation/history and incoming frames repaint immediately',()=>fixture(async({mount,sockets,calls})=>{
  const a=mount();await waitFor(()=>sockets.length);assert(a.root.textContent.includes('Connecting'),'Socket open treated as authentication');sockets[0].hello();await waitFor(()=>a.root.textContent.includes('No messages yet'));
  assert(!a.root.querySelector('[data-chat-action]'),'SDK injected extra chat buttons');assert(calls.some(c=>c.url.includes('/'+room.id+'/messages')),'History used peer ID');
  sockets[0].frame('message.new',{conversationId:room.id,message:message('live','Immediate live message')});await waitFor(()=>a.root.textContent.includes('Immediate live message'));assert(a.root.querySelectorAll('.sk-msg').length===1,'Incoming message duplicated');sockets[0].frame('message.new',{conversationId:room.id,message:message('mine','Authenticated own message',me)});await waitFor(()=>a.root.querySelector('[data-mine="true"] .sk-bubble')?.textContent==='Authenticated own message');assert(a.root.querySelectorAll('.sk-msg').length===2,'Authenticated player ID did not classify own messages');
 }));
 test('a full chat stays pinned to the newest message after load, own send and SDK status changes; a reader who scrolled up stays put',()=>fixture(async({mount,ready,sockets,messages})=>{
  for(let i=0;i<30;i++)messages.push(message('fill'+i,'Earlier message '+i+' with enough text to wrap inside its bubble',i%2?me:peer));
  const a=mount();await ready(a);await waitFor(()=>a.root.querySelectorAll('.sk-msg').length===30);await sleep(50);
  const chat=()=>a.root.querySelector('[data-key="chat"]'),gap=()=>{const c=chat();return c.scrollHeight-c.scrollTop-c.clientHeight;};
  assert(chat().scrollHeight>chat().clientHeight,'Fixture does not overflow the message list');assert(gap()<1,`Loaded list stops ${gap()}px short of the newest message`);
  type(a.root,'message','A long own message that wraps over several lines in its bubble so a clipped bottom edge is easy to see');a.root.querySelector('.sk-composer button').click();
  const ws=sockets[0],sent=ws.sent.filter(f=>f.type==='message.send').at(-1),own=message('own-new',sent.data.body,me);
  ws.frame('message.ack',{replyTo:sent.id,messageId:own.id,createdAt:own.createdAt});ws.frame('message.new',{conversationId:room.id,message:own});
  await waitFor(()=>a.root.querySelector('[data-key="message"]').value==='');await sleep(50);assert(gap()<1,`Own message is clipped by ${gap()}px`);
  chat().scrollTop=0;await sleep(20);ws.frame('message.new',{conversationId:room.id,message:message('reply','A reply while reading history')});
  await waitFor(()=>a.root.textContent.includes('A reply while reading history'));await sleep(50);assert(chat().scrollTop<5,'Reader who scrolled up was pulled to the end');
 }));
 test('live Chat retains draft during pending/error, prevents duplicates and only clears on ACK',()=>fixture(async({mount,ready,sockets,messages})=>{
  const a=mount();await ready(a);const input=type(a.root,'message','Draft to send');input.focus();a.root.querySelector('.sk-composer button').click();a.root.querySelector('.sk-composer button').click();
  const ws=sockets[0],sent=ws.sent.filter(f=>f.type==='message.send');assert(sent.length===1&&sent[0].data.conversationId===room.id,'Duplicate/wrong room');assert(a.root.querySelector('[data-key="message"]').value==='Draft to send','Pending draft lost');
  ws.frame('error',{replyTo:sent[0].id,code:'internal',message:'Please retry'});await waitFor(()=>a.root.textContent.includes('Please retry'));assert(a.root.querySelector('[data-key="message"]').value==='Draft to send','Failed send lost draft');
  a.root.querySelector('.sk-composer button').click();const second=ws.sent.filter(f=>f.type==='message.send').at(-1),stored=message('stored','Final server body',me);messages.push(stored);ws.frame('message.ack',{replyTo:second.id,messageId:stored.id,createdAt:stored.createdAt});ws.frame('message.new',{conversationId:room.id,message:stored});
  await waitFor(()=>a.root.querySelector('[data-key="message"]').value==='');assert(a.root.querySelectorAll('.sk-msg').length===1&&a.root.textContent.includes('Final server body'),'ACK/broadcast/history duplicated or fabricated body');
 }));
 test('long DM histories keep friend chips and the composer visible while messages scroll independently',()=>{
  const other={...room,id:'room-other',members:[room.members[0],{id:'peer-other',name:'Leyla',online:false}]};
  return fixture(async({mount,ready,messages,calls})=>{
   messages.push(...Array.from({length:100},(_,i)=>message(`history-${String(i).padStart(3,'0')}`,`History message ${i}`)));
   const a=mount();await ready(a);await waitFor(()=>a.root.querySelectorAll('.sk-msg').length===100);
   const chips=a.root.querySelector('.sk-chips'),chat=a.root.querySelector('.sk-chat'),panel=a.root.querySelector('.sk-panel'),composer=a.root.querySelector('.sk-composer');
   const row=chips.getBoundingClientRect(),box=panel.getBoundingClientRect(),input=composer.getBoundingClientRect();
   assert(row.height>=30,'Friend selector collapsed under long history');
   assert(row.top>=box.top&&row.bottom<=box.bottom,'Friend selector clipped outside panel');
   assert(chat.scrollHeight>chat.clientHeight,'Message history does not scroll independently');
   assert(input.top>=box.top&&input.bottom<=box.bottom,'Composer clipped outside panel');
   const names=[...chips.querySelectorAll('.sk-chip')];assert(names.map(node=>node.textContent).join(',')==='Rashad,Leyla','DM peers missing');
   names[1].click();await waitFor(()=>a.root.textContent.includes('Other DM history'));
   assert(calls.some(call=>call.url.includes('/room-other/messages')),'Friend selection requested the wrong conversation');
  },url=>url.endsWith('/conversations')?json({conversations:[room,other]}):url.includes('/room-other/messages')?json({messages:[{...message('other','Other DM history'),senderId:'peer-other',senderName:'Leyla'}],hasMore:false}):undefined);
 });
 test('live Chat theme update retains draft/focus and invalid update leaves UI unchanged',()=>fixture(async({mount,ready})=>{
  const a=mount();await ready(a);type(a.root,'message','Keep draft').focus();const next=config();next.theme.colors.brand='#123456';a.handle.updateConfig(next);
  const input=a.root.querySelector('[data-key="message"]');assert(input.value==='Keep draft'&&a.root.activeElement===input,'Theme update lost draft/focus');const before=a.root.innerHTML;
  next.schemaVersion=2;let failed=false;try{a.handle.updateConfig(next);}catch{failed=true;}assert(failed&&a.root.innerHTML===before,'Invalid config changed live UI');
 }));
 test('live Chat list/history error and public reconnect recover without invented messages',()=>{let fail=true;return fixture(async({mount,sockets})=>{
  const a=mount();await waitFor(()=>sockets.length);sockets[0].hello();await waitFor(()=>a.root.textContent.includes('Service unavailable'));assert(!a.root.querySelector('.sk-msg'),'Error fabricated messages');assert(!a.root.querySelector('[data-chat-action]'),'SDK injected recovery buttons');fail=false;a.handle.reconnectChat();await waitFor(()=>sockets.length===2);sockets[1].hello();await waitFor(()=>a.root.textContent.includes('No messages yet'));
 },()=>fail?json({error:{code:'unavailable',message:'Service unavailable'}},503):undefined);});
 test('live Chat disconnect retains draft; reconnect refetches missed messages and never resends',()=>fixture(async({mount,ready,sockets,messages})=>{
  const a=mount();await ready(a);type(a.root,'message','Uncertain send');a.root.querySelector('.sk-composer button').click();sockets[0].onclose({code:1000});await waitFor(()=>a.root.textContent.includes('unknown'));
  messages.push(message('missed','Recovered from history'));a.handle.reconnectChat();await waitFor(()=>sockets.length===2);sockets[1].hello();await waitFor(()=>a.root.textContent.includes('Recovered from history'));assert(a.root.querySelector('[data-key="message"]').value==='Uncertain send'&&!sockets[1].sent.some(f=>f.type==='message.send'),'Reconnect lost/replayed draft');
 }));
 test('live Chat instances stay independent; session reset detaches old socket/DOM and destroy cleans up',()=>fixture(async({sdk,mount,ready,sockets})=>{
  const a=mount();await ready(a);const b=mount();await waitFor(()=>sockets.length===2);sockets[1].hello();await waitFor(()=>b.root.querySelector('[data-key="message"]'));
  type(a.root,'message','Only A');assert(b.root.querySelector('[data-key="message"]').value==='','Draft leaked');const old=sockets[0].onmessage;
  sdk.resetPlayerSession();await waitFor(()=>sockets.length===4);assert(sockets[0].closed&&sockets[1].closed,'Session did not close sockets');old({data:JSON.stringify({type:'message.new',game_id:'game',data:{conversationId:room.id,message:message('old','Old player data')}})});
  sockets[2].hello();sockets[3].hello();await waitFor(()=>sharedRoot(a.target).querySelector('[data-key="message"]'));assert(!sharedRoot(a.target).textContent.includes('Old player data')&&sharedRoot(a.target).querySelector('[data-key="message"]').value==='','Previous session leaked');a.handle.destroy();assert(!sharedRoot(a.target)&&sharedRoot(b.target)&&sockets[2].closed,'Destroy leaked or affected other widget');
 }));
 test('live Chat destroy during pending history cannot recreate DOM',()=>{const pending=deferred();return fixture(async({mount,sockets,calls})=>{
  const a=mount();await waitFor(()=>sockets.length);sockets[0].hello();await waitFor(()=>calls.some(c=>c.url.includes('/messages')));a.handle.destroy();pending.resolve(json({messages:[message('late','Late message')],hasMore:false}));await sleep(20);assert(!sharedRoot(a.target)&&sockets[0].closed,'Late history mounted destroyed widget');
 },url=>url.includes('/messages')?pending.promise:undefined);});
}
