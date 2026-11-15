// TEAM-264: unread counts from Realtime through the real @clan/ui. Frames follow
// openapi/realtime.yaml and realtime-ws.md; identities and messages are test-only.
import {init} from '/src/index.js';
import {currentConfig,sharedRoot,json,waitFor,sleep,openDm} from './helpers.js';
const me='7f1e0c2a-5b3d-4e8f-9a10-2b3c4d5e6f70',peer='5a2b3c4d-1e2f-4a3b-8c9d-0e1f2a3b4c5d';
const message=(id,senderId=peer)=>({id,body:'Message '+id,senderId,senderName:senderId===me?'Ali':'Rashad',createdAt:'2026-11-09T18:20:00Z'});
const config=()=>{const c=currentConfig();c.clan.enabled=false;c.friends.enabled=false;c.chat.enabled=true;c.chat.directMessages=true;c.chat.clanChat=false;c.layout.startCollapsed=false;return c;};
export function registerUnreadTests({test,assert,container}) {
 async function fixture(run,{unread=0,history=[]}={}) {
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
  window.fetch=async url=>json(url.endsWith('/conversations')?{conversations:[room]}:{messages:[...history].reverse(),hasMore:false});
  const sdk=init({socialUrl:'https://social.test',realtimeUrl:'https://realtime.test',getPlayerToken:async()=>'test-token'});
  const target=container(),events=[];
  target.addEventListener('clan-sdk:unread',event=>events.push(event.detail));
  handles.push(sdk.mountExperience({container:target,config:config()}));
  const root=sharedRoot(target),reads=()=>sockets.flatMap(s=>s.sent).filter(f=>f.type==='conversation.read');
  try{await waitFor(()=>sockets.length);sockets[0].hello();await run({root,target,room,socket:sockets[0],events,reads});}
  finally{handles.forEach(h=>h.destroy());window.fetch=oldFetch;window.WebSocket=oldSocket;}
 }
 test('server unread count is badged on the conversation, reported to the game, and opening it reads it',()=>fixture(async({root,room,events,reads})=>{
  await waitFor(()=>root.querySelector(`[data-key="convo-${peer}"] .sk-badge-count`));
  assert(root.querySelector(`[data-key="convo-${peer}"] .sk-badge-count`).textContent==='3','Wrong conversation badge');
  await waitFor(()=>events.length);
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
  socket.frame('message.new',{conversationId:room.id,message:message('hidden-1')});
  await waitFor(()=>events.at(-1)?.total===1);
  socket.frame('message.new',{conversationId:room.id,message:message('own',me)});await sleep(30);
  assert(events.at(-1).total===1,'Own message counted as unread');
  assert(reads().length===before,'Read while the container was hidden');
  target.style.display='';
  await waitFor(()=>reads().length>before);
  assert(reads().at(-1).data.lastMessageId==='own','Showing again did not read up to the newest message');
  await waitFor(()=>events.at(-1).total===0);
 },{history:[message('m1')]}));
}
