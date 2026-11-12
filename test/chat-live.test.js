import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init} from '../src/index.js';
import {createChatController} from '../src/chat/controller.js';
import {chatClient} from '../src/chat/client.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';
const me='7f1e0c2a-5b3d-4e8f-9a10-2b3c4d5e6f70',peer='5a2b3c4d-1e2f-4a3b-8c9d-0e1f2a3b4c5d',id='0193a6b4-7c1e-7d2a-9f10-2b3c4d5e6f70';
const conversation={id,kind:'dm',clanId:null,members:[{id:me,name:'Ali',online:true},{id:peer,name:'Rashad',online:false}],lastMessage:null,unread:0};
const message=(n=1)=>({id:`message-${n}`,senderId:peer,senderName:'Rashad',body:'gg',createdAt:`2026-11-09T18:20:${String(n).padStart(2,'0')}Z`});
const cfg={clan:{enabled:true},chat:{enabled:true,directMessages:true,clanChat:true,maxMessageLength:300}};
const tick=()=>new Promise(done=>setTimeout(done,0));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function setup(t,extra={}) {
 const states=[],sockets=[],flags=[],reads=[];
 const client={acquire:async force=>{flags.push(force);return {token:force?'fresh':'normal'};},socketUrl:token=>'ws://realtime.test/api/v1/ws?token='+token,listConversations:async()=>({conversations:[conversation]}),listMessages:async(room,args)=>{reads.push({room,args});return {messages:[message()],hasMore:false};},...extra};
 const controller=createChatController({client,onChange:s=>states.push(s),ackTimeout:50,handshakeTimeout:500,socketFactory:url=>{
  const ws={url,readyState:1,sent:[],send(text){this.sent.push(JSON.parse(text));},close(){},frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:'game',data})});}};sockets.push(ws);return ws;
 }});
 t.after(()=>controller.destroy());controller.configure(cfg,null);
 return {controller,client,sockets,flags,reads,state:()=>states.at(-1),hello:()=>sockets.at(-1).frame('hello',{playerId:me,configVersion:0,onlineFriends:[]})};
}
test('Realtime init is optional, validates URLs and makes no requests',t=>{
 const calls=recordingFetch(t);const options={socialUrl:'https://social.test',getPlayerToken:()=> 'token'};
 for(const realtimeUrl of ['ws://realtime.test','not-url','https://name:pass@host','https://host?token=x'])assert.throws(()=>init({...options,realtimeUrl}));
 const sdk=init({...options,realtimeUrl:'http://localhost:8083/'});assert.equal(calls.length,0);assert.equal(typeof sdk.listMessages,'function');assert.throws(()=>init(options).listConversations(),/realtimeUrl/);
});
test('confirmed REST routes preserve JSON, Bearer retry and encoded history cursor',async t=>{
 const calls=recordingFetch(t,jsonResponse({error:{code:'token_expired',message:'Expired'}},401),jsonResponse({conversations:[conversation]}),jsonResponse({messages:[message()],hasMore:true}));const flags=[];
 const sdk=init({socialUrl:'https://social.test',realtimeUrl:'https://realtime.test/',getPlayerToken:o=>{flags.push(o.forceRefresh);return 'token';}});
 assert.deepEqual(await sdk.listConversations(),{conversations:[conversation]});assert.deepEqual(await sdk.listMessages('room/a',{before:'cursor/a',limit:20}),{messages:[message()],hasMore:true});assert.deepEqual(flags,[false,true,false]);assert.equal(calls[0].url,'https://realtime.test/api/v1/conversations');assert.equal(calls[2].url,'https://realtime.test/api/v1/conversations/room%2Fa/messages?limit=20&before=cursor%2Fa');assert.equal(calls[2].headers.Authorization,'Bearer token');
});
test('socket open does not create membership or permit send; hello drives list/history',async t=>{
 const f=setup(t);await tick();f.sockets[0].onopen();assert.equal(f.state().status,'connecting');await assert.rejects(f.controller.send(peer,'hello'));f.hello();await tick();f.controller.select(peer);await tick();assert.equal(f.reads[0].room,id);assert.equal(f.state().messages[id][0].body,'gg');
});
test('ack plus broadcast/history duplicates render once; actual conversation UUID is sent',async t=>{
 const f=setup(t);await tick();f.hello();await tick();f.controller.select(peer);await tick();
 const sending=f.controller.send(peer,' hello ');const frame=f.sockets[0].sent.find(f=>f.type==='message.send');assert.equal(frame.data.conversationId,id);assert.notEqual(frame.data.conversationId,peer);
 f.sockets[0].frame('message.ack',{replyTo:frame.id,messageId:message().id,createdAt:message().createdAt});await sending;f.sockets[0].frame('message.new',{conversationId:id,message:message()});await tick();assert.equal(f.state().messages[id].length,1);assert.equal(f.state().messages[id][0].body,'gg');
});
test('incoming messages update state immediately and whitespace/pending sends are guarded',async t=>{
 const f=setup(t);await tick();f.hello();await tick();f.controller.select(peer);await tick();await assert.rejects(f.controller.send(peer,'  '));f.sockets[0].frame('message.new',{conversationId:id,message:message(2)});assert.equal(f.state().messages[id].length,2);
 const pending=f.controller.send(peer,'send');await assert.rejects(f.controller.send(peer,'duplicate'));f.sockets[0].frame('error',{replyTo:f.state().pending.id,code:'blocked',message:'Cannot message this player'});await assert.rejects(pending,e=>e.code==='blocked');assert.match(f.state().error,/Cannot/);
});
test('missing clan conversation stays unavailable; a real returned clan UUID works',async t=>{
 const room={...conversation,id:'clan-conversation',kind:'clan',clanId:'social-clan'};const f=setup(t);await tick();f.hello();await tick();f.controller.configure(cfg,'social-clan');await assert.rejects(f.controller.send('clan','no room'));
 f.client.listConversations=async()=>({conversations:[room]});await f.controller.refresh();const send=f.controller.send('clan','hello');assert.equal(f.sockets[0].sent.at(-1).data.conversationId,room.id);f.sockets[0].frame('error',{replyTo:f.state().pending.id,code:'feature_disabled',message:'Clan chat disabled'});await assert.rejects(send,e=>e.code==='feature_disabled');
});
test('disconnect during send is unknown, never automatically resends; 4001 refreshes token',async t=>{
 const f=setup(t);await tick();f.hello();await tick();const send=f.controller.send(peer,'one');const reject=assert.rejects(send,e=>e.code==='delivery_unknown');f.sockets[0].onclose({code:4001});await reject;await tick();await tick();assert.deepEqual(f.flags,[false,true]);assert.equal(f.sockets[1].sent.length,0);f.hello();await tick();assert.equal(f.state().status,'connected');
});
test('reconnect catchup pages through all missed history and merges broadcast race by message ID',async t=>{
 const f=setup(t);await tick();f.hello();await tick();f.controller.select(peer);await tick();f.controller.reconnect();await tick();let pages=0;f.client.listMessages=async()=>++pages===1?{messages:[message(3),message(2)],hasMore:true}:{messages:[message()],hasMore:false};f.hello();await tick();await tick();assert.equal(pages,2);assert.deepEqual(f.state().messages[id].map(m=>m.id),['message-1','message-2','message-3']);
});

test('live frame before reconnect history cannot hide a gap and selection still performs recovery',async t=>{
 const f=setup(t);await tick();f.hello();await tick();f.controller.select(peer);await tick();f.controller.select(null);
 f.controller.reconnect();await tick();f.hello();await tick();
 f.sockets[1].frame('message.new',{conversationId:id,message:message(4)});
 let pages=0;f.client.listMessages=async()=>++pages===1?{messages:[message(4),message(3)],hasMore:true}:{messages:[message(2),message()],hasMore:false};
 f.controller.select(peer);await tick();await tick();assert.equal(pages,2);assert.deepEqual(f.state().messages[id].map(m=>m.id),['message-1','message-2','message-3','message-4']);
});

test('initial history reads one page and exposes older history instead of loading everything',async t=>{
 const f=setup(t,{listMessages:async()=>({messages:[message(3),message(2)],hasMore:true})});await tick();f.hello();await tick();f.controller.select(peer);await tick();assert.equal(f.state().messages[id].length,2);assert.equal(f.state().history[id].hasMore,true);
});
test('conversation removal ignores late history and forbids future send',async t=>{
 const pending=deferred();const f=setup(t,{listMessages:()=>pending.promise});await tick();f.hello();await tick();f.controller.select(peer);await tick();f.client.listConversations=async()=>({conversations:[]});f.sockets[0].frame('conversation.removed',{conversationId:id});pending.resolve({messages:[message()],hasMore:false});await tick();assert.equal(f.state().messages[id],undefined);await assert.rejects(f.controller.send(peer,'removed'));
});
test('disabled config and destroy clean sockets/timers and ignore old completions',async t=>{
 const f=setup(t);await tick();const old=f.sockets[0].onmessage;f.controller.configure({...cfg,chat:{enabled:false}},null);old({data:JSON.stringify({type:'hello',game_id:'game',data:{playerId:me}})});assert.equal(f.state().status,'unavailable');f.controller.destroy();await assert.rejects(f.controller.send(peer,'late'));
});

test('ACK timeout reports unknown delivery, retains server history and never replays',async t=>{
 const f=setup(t);await tick();f.hello();await tick();f.controller.select(peer);await tick();
 await assert.rejects(f.controller.send(peer,'uncertain'),error=>error.code==='delivery_unknown');
 assert.match(f.state().warning,/not confirmed/);assert.equal(f.sockets[0].sent.filter(frame=>frame.type==='message.send').length,1);assert.equal(f.state().messages[id].length,1);
});

test('slow-mode retry delay expires and configured history page size is respected',async t=>{
 const f=setup(t);f.controller.configure({...cfg,chat:{...cfg.chat,historyLimit:20}},null);await tick();f.hello();await tick();f.controller.select(peer);await tick();assert.equal(f.reads[0].args.limit,20);
 const send=f.controller.send(peer,'slow');f.sockets[0].frame('error',{replyTo:f.state().pending.id,code:'slow_mode',message:'Wait',retryAfterMs:10});await assert.rejects(send,e=>e.code==='slow_mode');await assert.rejects(f.controller.send(peer,'too soon'));await new Promise(done=>setTimeout(done,15));assert.equal(f.state().cooldownUntil,0);
});

test('Social and Realtime share acquisition and a completed 401 refresh wave',async t=>{
 const tokens=[];
 const calls=recordingFetch(t,jsonResponse({error:{code:'token_expired',message:'Expired'}},401),jsonResponse({friends:[]}));
 const sdk=init({socialUrl:'https://social.test',realtimeUrl:'https://realtime.test',getPlayerToken:async({forceRefresh})=>{tokens.push(forceRefresh);return forceRefresh?'fresh':'old';}});
 const client=chatClient(sdk),old=await client.acquire(false);await sdk.listFriends();
 const refreshed=await client.acquire(true,old.version);assert.equal(refreshed.token,'fresh');assert.deepEqual(tokens,[false,false,true]);assert.equal(calls.length,2);
});
