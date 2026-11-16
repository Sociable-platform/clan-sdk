// TEAM-264: unread counts from Realtime through the real @clan/ui. Frames follow
// openapi/realtime.yaml and realtime-ws.md; identities and messages are test-only.
import {init} from '/src/index.js';
import {currentConfig,sharedRoot,json,waitFor,sleep,openDm,noClan} from './helpers.js';
import {player} from '/test/fixtures/social/friends.js';
const me='7f1e0c2a-5b3d-4e8f-9a10-2b3c4d5e6f70',peer='5a2b3c4d-1e2f-4a3b-8c9d-0e1f2a3b4c5d';
const message=(id,senderId=peer)=>({id,body:'Message '+id,senderId,senderName:senderId===me?'Ali':'Rashad',createdAt:'2026-11-09T18:20:00Z'});
const config=()=>{const c=currentConfig();c.clan.enabled=false;c.friends.enabled=false;c.chat.enabled=true;c.chat.directMessages=true;c.chat.clanChat=false;c.layout.startCollapsed=false;return c;};
export function registerUnreadTests({test,assert,container}) {
 async function fixture(run,{unread=0,history=[],social,cfg=config()}={}) {
  const room={id:'0193a6b4-7c1e-7d2a-9f10-2b3c4d5e6f70',kind:'dm',clanId:null,members:[{id:me,name:'Ali',online:true},{id:peer,name:'Rashad',online:true}],lastMessage:history.at(-1)??null,unread};
  const oldFetch=window.fetch,oldSocket=window.WebSocket,sockets=[],handles=[];
  class Socket {
   constructor(){this.readyState=1;this.sent=[];sockets.push(this);}
   send(text){this.sent.push(JSON.parse(text));}
   close(){this.closed=true;this.readyState=3;}
   frame(type,data){this.onmessage?.({data:JSON.stringify({event_id:'test-event',type,game_id:'game',data})});}
   hello(){this.frame('hello',{playerId:me,configVersion:0,onlineFriends:[]});}
  }
  window.WebSocket=Socket;
  window.fetch=async url=>{
   if(new URL(url).origin==='https://social.test'){const r=social?.(new URL(url).pathname);if(r)return r;throw new Error('Unexpected Social route '+url);}
   return json(url.endsWith('/conversations')?{conversations:[room]}:{messages:[...history].reverse(),hasMore:false});
  };
  const sdk=init({socialUrl:'https://social.test',realtimeUrl:'https://realtime.test',getPlayerToken:async()=>'test-token'});
  const target=container(),events=[];
  target.addEventListener('clan-sdk:unread',event=>events.push(event.detail));
  handles.push(sdk.mountExperience({container:target,config:cfg}));
  const root=sharedRoot(target),reads=()=>sockets.flatMap(s=>s.sent).filter(f=>f.type==='conversation.read');
  try{await waitFor(()=>sockets.length);sockets[0].hello();await run({root,target,room,socket:sockets[0],events,reads,sdk});}
  finally{handles.forEach(h=>h.destroy());window.fetch=oldFetch;window.WebSocket=oldSocket;}
 }
 test('server unread count is badged on the conversation, reported to the game, and opening it reads it',()=>fixture(async({root,room,events,reads})=>{
  await waitFor(()=>root.querySelector(`[data-key="convo-${peer}"] .sk-badge-count`));
  assert(root.querySelector(`[data-key="convo-${peer}"] .sk-badge-count`).textContent==='3','Wrong conversation badge');
  assert(events[0]&&events[0].total===0,'No clan-sdk:unread when mounted: '+JSON.stringify(events[0]));
  await waitFor(()=>events.at(-1).total===3);
  assert(JSON.stringify(events.at(-1))===JSON.stringify({total:3,requests:0,clan:0,direct:{[peer]:3}}),'Wrong clan-sdk:unread detail: '+JSON.stringify(events.at(-1)));
  assert(reads().length===0,'Read before the conversation was open');
  await openDm(root,peer);
  await waitFor(()=>reads().length===1);
  assert(reads()[0].data.conversationId===room.id&&reads()[0].data.lastMessageId==='m3','Read did not go up to the newest message');
  await waitFor(()=>events.at(-1).total===0);
  assert(JSON.stringify(events.at(-1).direct)==='{}','Direct count not cleared');
 },{unread:3,history:[message('m1'),message('m2'),message('m3')]}));
 test('nothing is read while the container is hidden; showing it again reads what is on screen',()=>fixture(async({root,target,room,socket,events,reads})=>{
  await openDm(root,peer);await waitFor(()=>root.querySelector('.sk-msg'));
  const before=reads().length;
  target.style.display='none';await sleep(30);
  socket.frame('message.new',{conversationId:room.id,message:message('n-hidden-1')});
  socket.frame('message.new',{conversationId:room.id,message:message('n-hidden-2')});
  await waitFor(()=>events.at(-1)?.total===2);await sleep(30);
  assert(reads().length===before,'Read while the container was hidden');
  target.style.display='';
  await waitFor(()=>reads().length>before);
  assert(reads().at(-1).data.lastMessageId==='n-hidden-2','Showing again did not read up to the newest message');
  await waitFor(()=>events.at(-1).total===0);
 },{history:[message('m1')]}));
 test('the player\'s own reply clears the unread count and reads the conversation up to the reply',()=>fixture(async({root,room,socket,events,reads})=>{
  // The reply arrives as Realtime's message.new for the player (from this tab or another one).
  await waitFor(()=>events.at(-1)?.total===2);
  socket.frame('message.new',{conversationId:room.id,message:message('reply',me)});
  await waitFor(()=>events.at(-1).total===0);
  assert(reads().at(-1)?.data.lastMessageId==='reply','Reply did not read the conversation up to it');
  assert(!root.querySelector(`[data-key="convo-${peer}"] .sk-badge-count`),'Conversation still badged after the reply');
 },{unread:2,history:[message('m1'),message('m2')]}));
 const tabBadge=(root,name)=>[...root.querySelectorAll('.sk-tab')].find(b=>b.textContent.startsWith(name))?.querySelector('.sk-badge-count')?.textContent??null;
 test('on the Clan tab, before Friends has loaded, the Chat tab still counts unread direct messages',()=>{
  const cfg=currentConfig();cfg.clan.enabled=true;cfg.friends.enabled=true;cfg.chat.enabled=true;cfg.chat.directMessages=true;cfg.chat.clanChat=true;cfg.layout.startCollapsed=false;
  return fixture(async({root,socket,room,events})=>{
   await waitFor(()=>tabBadge(root,'Chat')==='2');
   assert([...root.querySelectorAll('.sk-tab')].find(b=>b.getAttribute('aria-selected')==='true').textContent.startsWith('Clan'),'Not on the Clan tab');
   socket.frame('message.new',{conversationId:room.id,message:message('m3')});
   await waitFor(()=>tabBadge(root,'Chat')==='3'&&events.at(-1).total===3);
  },{unread:2,history:[message('m1'),message('m2')],cfg,social:path=>path==='/api/v1/players/me/clan'?noClan():path==='/api/v1/clans'?json({clans:[]}):undefined});
 });
 test('Friends shows the online dot from Realtime for friends with a DM, live; a friend without one gets no dot',()=>{
  const cfg=config();cfg.friends.enabled=true;
  const other={id:'44444444-4444-4444-8444-444444444444',displayName:'No DM',since:'2026-11-10T08:00:00Z'};
  return fixture(async({root,socket})=>{
   const tab=[...root.querySelectorAll('.sk-tab')].find(b=>b.textContent.startsWith('Friends'));tab.click();
   const dot=id=>root.querySelector(`[data-key="friend-${id}"] .sk-presence`);
   await waitFor(()=>dot(peer)?.dataset.online==='true');
   assert(root.querySelector(`[data-key="friend-${other.id}"]`)&&!dot(other.id),'Invented online state for a friend without a DM');
   socket.frame('presence.update',{playerId:peer,status:'offline'});
   await waitFor(()=>dot(peer)?.dataset.online==='false');
  },{cfg,social:path=>path==='/api/v1/players/me'?json(player):path==='/api/v1/friends'?json({friends:[{id:peer,displayName:'Rashad',since:'2026-11-10T08:00:00Z'},other]})
   :path==='/api/v1/friends/requests'?json({incoming:[],outgoing:[]}):path==='/api/v1/players/me/blocks'?json({blocks:[]}):undefined});
 });
 test('the Chat list shows a conversation\'s last message before its history is loaded, not "No messages yet"',()=>fixture(async({root})=>{
  await waitFor(()=>root.querySelector(`[data-key="convo-${peer}"] .sk-badge-count`)?.textContent==='1');
  const row=root.querySelector(`[data-key="convo-${peer}"]`);
  assert(row.textContent.includes('Message m2')&&!row.textContent.includes('No messages yet'),'Row preview: '+row.textContent);
 },{unread:1,history:[message('m1'),message('m2')]}));
}
