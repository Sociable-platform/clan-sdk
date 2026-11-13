// Confirmed Realtime wire shapes; identities and data are synthetic tests only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatController} from '../src/chat/controller.js';
import {init} from '../src/index.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';
const config={clan:{enabled:true},chat:{enabled:true,clanChat:true,directMessages:true,maxMessageLength:300}};
const clan={id:'room-clan',kind:'clan',clanId:'social-clan',members:[{id:'me',name:'Me',online:true}],lastMessage:null,unread:0};
const dm={...clan,id:'room-dm',kind:'dm',clanId:null,members:[{id:'me',name:'Me',online:true},{id:'peer',name:'Peer',online:false}]};
const msg=(id,body=id)=>({id,senderId:'me',senderName:'Me',body,createdAt:'2026-11-14T10:00:00Z'});
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('unrelated-player history rejection remains authoritative 403 without retry',async t=>{
 const calls=recordingFetch(t,jsonResponse({error:{code:'not_member',message:'You are not a member of this conversation'}},403));
 const sdk=init({socialUrl:'https://social.test',realtimeUrl:'https://realtime.test',getPlayerToken:async()=> 'synthetic-outsider-token'});
 await assert.rejects(sdk.listMessages('other-clan-room'),e=>e.status===403&&e.code==='not_member');assert.equal(calls.length,1);
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
async function world(t,options={}){
 const sockets=[],changes=[],events=[],flags=[],reads=[];
 const client={acquire:async force=>{flags.push(force);return {token:'test-token',version:flags.length};},socketUrl:()=> 'ws://test.invalid',listConversations:async()=>({conversations:[clan,dm]}),listMessages:async(id,args)=>{reads.push({id,args});return {messages:[],hasMore:false};},...options.client};
 const c=createChatController({...options,client,onChange:s=>changes.push(s),onMembership:e=>events.push(e),socketFactory:()=>{const s={readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw));},close(){this.closed=true;},frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:'game',data})});}};sockets.push(s);return s;}});
 t.after(()=>c.destroy());c.configure(config,'social-clan');await settle();
 const hello=(version=0)=>sockets.at(-1).frame('hello',{playerId:'me',configVersion:version,onlineFriends:[]});
 return {c,client,sockets,changes,events,flags,reads,hello,state:()=>changes.at(-1)};
}
test('clan selection uses matching actual room ID; history/live/ACK merge by message ID',async t=>{
 const page=deferred(),w=await world(t,{client:{listMessages:()=>page.promise}});assert.equal(w.state().status,'connecting');w.hello();await settle();w.c.select('clan');await settle();
 w.sockets[0].frame('message.new',{conversationId:clan.id,message:msg('m2','Final *** text')});page.resolve({messages:[msg('m2','Final *** text'),msg('m1')],hasMore:false});await settle();
 const send=w.c.send('clan','raw');const frame=w.sockets[0].sent.find(f=>f.type==='message.send');assert.equal(frame.data.conversationId,clan.id);assert.notEqual(frame.data.conversationId,clan.clanId);
 w.sockets[0].frame('message.ack',{replyTo:frame.id,messageId:'m2',createdAt:msg('m2').createdAt});await send;await settle();assert.deepEqual(w.state().messages[clan.id].map(m=>m.id),['m1','m2']);assert.equal(w.state().messages[clan.id][1].body,'Final *** text');
});
test('wrong clan room cannot be selected; duplicate added is idempotent',async t=>{
 const w=await world(t,{client:{listConversations:async()=>({conversations:[{...clan,clanId:'other'},dm]})}});w.hello();await settle();assert.equal(w.c.resolve('clan'),undefined);
 w.client.listConversations=async()=>({conversations:[clan,dm]});w.sockets[0].frame('conversation.added',{conversation:clan});await settle();const count=w.events.length;w.sockets[0].frame('conversation.added',{conversation:clan});await settle();assert.equal(w.state().conversations.filter(c=>c.id===clan.id).length,1);assert.equal(w.events.length,count);
});
test('removed clan rejects pending send and late history/list/add without affecting DM',async t=>{
 const page=deferred(),w=await world(t,{client:{listMessages:()=>page.promise}});w.hello();await settle();w.c.select('clan');await settle();const send=w.c.send('clan','pending'),rejected=assert.rejects(send,e=>e.code==='not_member');
 w.sockets[0].frame('conversation.removed',{conversationId:clan.id});await rejected;page.resolve({messages:[msg('late')],hasMore:false});await settle();await w.c.refresh();w.sockets[0].frame('conversation.added',{conversation:clan});await settle();assert.equal(w.c.resolve('clan'),undefined);assert.equal(w.state().messages[clan.id],undefined);assert.equal(w.state().history[clan.id],undefined);assert.ok(w.c.resolve('peer'));assert.equal(w.sockets.length,1);
 w.c.configure(config,null);w.c.configure(config,clan.clanId);await settle();assert.ok(w.c.resolve('clan'),'authoritatively confirmed rejoin permits old room again');
});
for(const kind of ['clan_kicked','clan_disbanded'])test(`${kind} clears clan only and ignores unknown kinds`,async t=>{
 const w=await world(t);w.hello();await settle();w.sockets[0].frame('notification',{kind:'future_kind',payload:{clanId:clan.clanId}});assert.equal(w.events.length,0);w.sockets[0].frame('notification',{kind,payload:{clanId:clan.clanId}});await settle();assert.equal(w.c.resolve('clan'),undefined);assert.ok(w.c.resolve('peer'));assert.equal(w.events.at(-1).kind,kind);
});
test('presence updates only friends, and read markers require a visible selected conversation',async t=>{
 let visible=false;const w=await world(t,{isVisible:()=>visible,client:{listMessages:async()=>({messages:[msg('m')],hasMore:false})}});w.hello();await settle();w.c.select('clan');await settle();assert.equal(w.sockets[0].sent.length,0);visible=true;w.c.markRead();w.c.markRead();assert.equal(w.sockets[0].sent.length,1);assert.equal(w.sockets[0].sent[0].data.lastMessageId,'m');w.c.select(null);w.sockets[0].frame('message.new',{conversationId:clan.id,message:msg('m2')});assert.equal(w.sockets[0].sent.length,1);
 w.sockets[0].frame('presence.update',{playerId:'me',status:'offline'});assert.equal(w.state().conversations.find(c=>c.id===clan.id).members[0].online,true);assert.equal(w.state().conversations.find(c=>c.id===dm.id).members[0].online,false);
});
test('4403 before hello stops permanently, ignores late work and manual reconnect',async t=>{
 let suspended=0;const w=await world(t,{onSuspend:()=>suspended++});const old=w.sockets[0].onmessage;w.sockets[0].onclose({code:4403});w.c.reconnect();w.c.configure(config,'social-clan');await settle();old({data:JSON.stringify({type:'hello',game_id:'game',data:{playerId:'me'}})});assert.equal(suspended,1);assert.equal(w.sockets.length,1);assert.equal(w.state().status,'suspended');
});
test('backoff starts at one second, 1008 waits thirty, and 4001 forces token refresh',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const w=await world(t,{random:()=>0});w.hello();await settle();w.sockets[0].onclose({code:4002});t.mock.timers.tick(999);await settle();assert.equal(w.sockets.length,1);t.mock.timers.tick(1);await settle();assert.equal(w.sockets.length,2);w.hello();await settle();w.sockets[1].onclose({code:1008});t.mock.timers.tick(29999);await settle();assert.equal(w.sockets.length,2);t.mock.timers.tick(1);await settle();w.hello();await settle();w.sockets[2].onclose({code:4001});t.mock.timers.tick(0);await settle();assert.equal(w.flags.at(-1),true);assert.equal(w.sockets.length,4);
});
for(const code of ['rate_limited','feature_disabled','not_member','blocked','empty','too_long','slow_mode','bad_frame','internal'])test(`clan send rejection ${code} does not fabricate or replay`,async t=>{
 const w=await world(t);w.hello();await settle();const send=w.c.send('clan','draft'),rejection=assert.rejects(send,e=>e.code===code),frame=w.sockets[0].sent.at(-1);w.sockets[0].frame('error',{replyTo:frame.id,code,message:'Rejected',...(code==='slow_mode'?{retryAfterMs:1200}:{})});await rejection;assert.equal(w.state().pending,null);assert.equal(w.state().messages[clan.id],undefined);assert.equal(w.sockets[0].sent.filter(f=>f.type==='message.send').length,1);if(code==='slow_mode')assert.ok(w.state().cooldownUntil>Date.now());
});
test('history failure waits for explicit refresh instead of render-driven retry loop',async t=>{
 let count=0;const w=await world(t,{client:{listMessages:async()=>{count++;throw new Error('offline');}}});w.hello();await settle();w.c.select('clan');await settle();for(let i=0;i<10;i++)w.c.select('clan');await settle();assert.equal(count,1);await w.c.refresh();assert.equal(count,2);
});

test('re-enabling clan chat recovers a paginated gap without reconnecting DMs',async t=>{
 let phase=0,pages=0;const w=await world(t,{client:{listMessages:async()=>phase===0?{messages:[msg('m1')],hasMore:false}:++pages===1?{messages:[msg('m4'),msg('m3')],hasMore:true}:{messages:[msg('m2'),msg('m1')],hasMore:false}}});w.hello();await settle();w.c.select('clan');await settle();
 w.c.configure({...config,chat:{...config.chat,clanChat:false}},clan.clanId);w.sockets[0].frame('message.new',{conversationId:clan.id,message:msg('m4')});phase=1;w.c.configure(config,clan.clanId);await settle();assert.equal(pages,2);assert.deepEqual(w.state().messages[clan.id].map(m=>m.id),['m1','m2','m3','m4']);assert.equal(w.sockets.length,1);
});

test('published capability refresh releases feature_disabled; backend still decides send',async t=>{
 const w=await world(t);w.hello();await settle();const sending=w.c.send('clan','draft'),failed=assert.rejects(sending,e=>e.code==='feature_disabled');w.sockets[0].frame('error',{replyTo:w.state().pending.id,code:'feature_disabled',message:'Disabled'});await failed;await assert.rejects(w.c.send('clan','disabled'));
 w.c.configure({...config,chat:{...config.chat}},clan.clanId);const retry=w.c.send('clan','retry');assert.ok(w.state().pending);w.sockets[0].frame('error',{replyTo:w.state().pending.id,code:'internal',message:'Server still authoritative'});await assert.rejects(retry,e=>e.code==='internal');
});
