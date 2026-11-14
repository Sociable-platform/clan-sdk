// Synthetic HTTP/WS fixtures exercising the real installed shared UI.
import {init} from '/src/index.js';
import {currentConfig,sharedRoot,json,waitFor,type,sleep,clan,deferred} from './helpers.js';
const dm={id:'room-dm',kind:'dm',clanId:null,members:[{id:'me',name:'Me',online:true},{id:'peer',name:'Peer',online:false}],lastMessage:null,unread:0};
const room={...dm,id:'room-clan',kind:'clan',clanId:clan.id};
const message=(id,body)=>({id,body,senderId:'peer',senderName:'Peer',createdAt:'2026-11-14T10:00:00Z'});
export function registerClanChatTests({test,assert,container}) {
 async function fixture(run){
  const oldFetch=window.fetch,oldSocket=window.WebSocket,sockets=[],handles=[],store={clan,rooms:[dm,room],history:{'room-dm':[message('dm','Keep DM')],'room-clan':[]},page:null};
  class Socket{constructor(){this.readyState=1;this.sent=[];sockets.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){this.closed=true;}frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:'game',data})});}hello(){this.frame('hello',{playerId:'me',configVersion:0,onlineFriends:[]});}}
  window.WebSocket=Socket;
  window.fetch=async url=>{
   if(url.endsWith('/players/me/clan'))return store.clan?json({clan:store.clan,role:'member'}):json({error:{code:'not_in_clan',message:'No clan'}},404);
   if(url.includes('/api/v1/clans'))return json({clans:[]});
   if(url.endsWith('/conversations'))return json({conversations:store.rooms});
   const id=url.includes('room-clan')?'room-clan':'room-dm';return id==='room-clan'&&store.page?store.page.promise:json({messages:store.history[id],hasMore:false});
  };
  const sdk=init({socialUrl:'https://social.test',realtimeUrl:'https://realtime.test',getPlayerToken:async()=> 'test-token'});
  const mount=()=>{const cfg=currentConfig();cfg.friends.enabled=false;cfg.layout.startCollapsed=false;const target=container(),handle=sdk.mountExperience({container:target,config:cfg});handles.push(handle);return {target,handle,root:sharedRoot(target)};};
  try{await run({sdk,mount,store,sockets,hello:async()=>{await waitFor(()=>sockets.length);sockets.at(-1).hello();}});}finally{handles.forEach(h=>h.destroy());window.fetch=oldFetch;window.WebSocket=oldSocket;}
 }
 test('clan Home history/live race dedupes, uses actual room and renders final text safely',()=>fixture(async({mount,store,sockets,hello})=>{
  store.page=deferred();const a=mount();await hello();await waitFor(()=>a.root.textContent.includes('Loading messages'));sockets[0].frame('message.new',{conversationId:room.id,message:message('m','<img src=x>')});store.page.resolve(json({messages:[message('m','<img src=x>')],hasMore:false}));await waitFor(()=>a.root.textContent.includes('<img src=x>'));assert(a.root.querySelectorAll('.sk-msg').length===1&&!a.root.querySelector('.sk-chat img'),'Duplicate or HTML message');
  type(a.root,'message','draft');await waitFor(()=>!a.root.querySelector('.sk-composer button').disabled);a.root.querySelector('.sk-composer button').click();const sent=sockets[0].sent.find(f=>f.type==='message.send');assert(sent.data.conversationId===room.id&&sent.data.conversationId!==clan.id,'Clan ID substituted');sockets[0].frame('error',{replyTo:sent.id,code:'internal',message:'Retry later'});await waitFor(()=>a.root.textContent.includes('Retry later'));assert(a.root.querySelector('[data-key="message"]').value==='draft','Failed draft lost');
 }));
 test('clan removal clears its composer and cached history while DM remains connected',()=>fixture(async({mount,store,sockets,hello})=>{
  const a=mount();await hello();await waitFor(()=>a.root.querySelector('[data-key="message"]'));[...a.root.querySelectorAll('.sk-tab')].find(e=>e.textContent==='Chat').click();await waitFor(()=>a.root.textContent.includes('Keep DM'));[...a.root.querySelectorAll('.sk-chip')].find(e=>e.textContent===clan.name).click();await waitFor(()=>a.root.textContent.includes('No messages yet'));type(a.root,'message','Old clan draft');store.clan=null;store.rooms=[dm];sockets[0].frame('conversation.removed',{conversationId:room.id});
  await waitFor(()=>a.root.textContent.includes('Keep DM'));assert(a.root.querySelector('[data-key="message"]').value===''&&!a.root.textContent.includes(clan.name),'Clan draft/state leaked to DM');assert(sockets.length===1&&!sockets[0].closed,'DM socket closed');sockets[0].frame('message.new',{conversationId:room.id,message:message('late','Old clan message')});await sleep(20);assert(!a.root.textContent.includes('Old clan message'),'Removed room restored');
 }));
 test('suspension before hello removes mounted panel and session reset cannot revive it',()=>fixture(async({sdk,mount,sockets})=>{
  const a=mount();await waitFor(()=>sockets.length);sockets[0].onclose({code:4403});await waitFor(()=>!sharedRoot(a.target));sdk.resetPlayerSession();await sleep(20);assert(!sharedRoot(a.target)&&sockets.length===1,'Suspension reconnected/remounted');
 }));
 test('clan capability updates control the composer without reconnecting DMs',()=>fixture(async({mount,hello,sockets})=>{
  const a=mount();await hello();await waitFor(()=>a.root.querySelector('[data-key="message"]'));type(a.root,'message','Old draft');
  const cfg=currentConfig();cfg.friends.enabled=false;cfg.layout.startCollapsed=false;cfg.chat.clanChat=false;a.handle.updateConfig(cfg);assert(!a.root.querySelector('[data-key="message"]'),'Disabled clan composer visible');
  cfg.chat.clanChat=true;a.handle.updateConfig(cfg);await waitFor(()=>a.root.querySelector('[data-key="message"]'));assert(a.root.querySelector('[data-key="message"]').value===''&&sockets.length===1,`Capability toggle: draft=${a.root.querySelector('[data-key="message"]').value}, sockets=${sockets.length}`);
 }));
}
