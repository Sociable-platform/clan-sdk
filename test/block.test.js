import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init,ApiError} from '../src/index.js';
import {createFriendsController} from '../src/friends/controller.js';
import {blockedPlayers,playerResults} from '../src/social/friends-adapter.js';
import {createChatController} from '../src/chat/controller.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';
import {player,friend} from './fixtures/social/friends.js';
const tick=()=>new Promise(done=>setTimeout(done,10));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(extra={}) {
  const store={friends:[friend],blocks:[],requests:{incoming:[],outgoing:[]}},states=[],writes=[],mutations=[];
  const sdk={getMyPlayer:async()=>player,listFriends:async()=>({friends:store.friends}),listBlocks:async()=>({blocks:store.blocks}),listFriendRequests:async()=>store.requests,
    searchPlayers:async()=>({players:store.blocks.length?[{...friend,relation:'blocked'}]:[]}),
    blockPlayer:async id=>{writes.push(['block',id]);store.friends=[];store.blocks=[friend];store.requests={incoming:[],outgoing:[]};},
    unblockPlayer:async id=>{writes.push(['unblock',id]);store.blocks=[];},...extra};
  const controller=createFriendsController({sdk,onChange:s=>states.push(s),onMutation:(...args)=>mutations.push(args),debounceMs:1});
  controller.setView(true,true);
  return {controller,sdk,store,states,writes,mutations,state:()=>states.at(-1)};
}

test('block endpoints preserve backend errors and token refresh, with no invented request body',async t=>{
  let tokens=0;
  const calls=recordingFetch(t,jsonResponse({error:{code:'expired',message:'Expired'}},401),new Response(null,{status:204}),jsonResponse({error:{code:'cannot_block_self',message:'You cannot block yourself'}},400));
  const sdk=init({socialUrl:'https://social.test',getPlayerToken:async()=>++tokens===1?'old':'fresh'});
  await sdk.blockPlayer('target/id #');
  assert.equal(calls[1].url,'https://social.test/api/v1/players/target%2Fid%20%23/block');
  assert.equal(calls[1].headers.Authorization,'Bearer fresh');assert.equal(calls[1].body,undefined);
  await assert.rejects(sdk.unblockPlayer(player.id),e=>e instanceof ApiError&&e.status===400&&e.code==='cannot_block_self');
  assert.equal(calls.length,3);
});

test('blocked DTOs and search relations use the Social player ID and require authoritative data',()=>{
  assert.deepEqual(blockedPlayers({blocks:[friend]}),[{id:friend.id,name:friend.displayName,since:friend.since,relation:'blocked'}]);
  assert.equal(playerResults({players:[{...friend,relation:'blocked'}]})[0].relation,'blocked');
  assert.throws(()=>blockedPlayers({}));assert.throws(()=>blockedPlayers({blocks:[{id:friend.id}]}));
});

test('block refreshes all lists; unblock never restores the old friendship or requests',async()=>{
  const f=fixture();await tick();
  await f.controller.action('block',friend.id);
  assert.deepEqual(f.state().friends,[]);assert.equal(f.state().blocked[0].id,friend.id);
  assert.deepEqual(f.state().incoming,[]);assert.deepEqual(f.state().outgoing,[]);
  await f.controller.action('unblock',friend.id);
  assert.deepEqual(f.state().blocked,[]);assert.deepEqual(f.state().friends,[]);
  assert.deepEqual(f.writes,[['block',friend.id],['unblock',friend.id]]);f.controller.destroy();
});

test('a realtime refresh cannot release a pending block or create duplicate requests',async()=>{
  const pending=deferred();let writes=0;
  const f=fixture({blockPlayer:()=>{writes++;return pending.promise;}});await tick();
  const first=f.controller.action('block',friend.id);
  await f.controller.refresh({background:true});await f.controller.action('block',friend.id);
  assert.equal(writes,1);assert.equal(f.state().pending.action,'block');
  f.store.friends=[];f.store.blocks=[friend];pending.resolve();await first;
  assert.equal(f.state().blocked.length,1);assert.equal(f.state().pending,null);f.controller.destroy();
});

test('failed block and unblock retain readable errors and backend counts',async()=>{
  const f=fixture({blockPlayer:async()=>{throw new Error('Block service unavailable');}});await tick();
  await f.controller.action('block',friend.id);
  assert.equal(f.state().actionError,'Block service unavailable');assert.equal(f.state().friends.length,1);assert.equal(f.state().blocked.length,0);
  f.store.blocks=[friend];f.store.friends=[];await f.controller.refresh();
  f.sdk.unblockPlayer=async()=>{throw new Error('Unblock service unavailable');};
  await f.controller.action('unblock',friend.id);
  assert.equal(f.state().actionError,'Unblock service unavailable');assert.equal(f.state().blocked.length,1);assert.equal(f.state().pending,null);f.controller.destroy();
});

test('failed blocked-list reads are errors, and retry hydrates the actual blocked list',async()=>{
  let fail=true;const f=fixture({listBlocks:async()=>{if(fail)throw new Error('Cannot load blocked players');return {blocks:[friend]};}});await tick();
  assert.equal(f.state().status,'error');assert.equal(f.state().error,'Cannot load blocked players');
  fail=false;await f.controller.refresh();assert.equal(f.state().blocked.length,1);f.controller.destroy();
});

test('successful block after tab navigation updates chat and refreshes hidden lists',async()=>{
  const pending=deferred();const f=fixture({blockPlayer:()=>pending.promise});await tick();
  const block=f.controller.action('block',friend.id);f.controller.setView(true,false);
  f.store.friends=[];f.store.blocks=[friend];pending.resolve();await block;
  assert.deepEqual(f.mutations,[['block',friend.id]]);assert.equal(f.state().blocked.length,1);f.controller.destroy();
});

test('destroy/player replacement ignores late block writes and blocked-list reads',async()=>{
  const pending=deferred();const f=fixture({blockPlayer:()=>pending.promise});await tick();
  const block=f.controller.action('block',friend.id);f.controller.destroy();const count=f.states.length;
  const next=fixture();pending.resolve();await block;await tick();
  assert.equal(f.states.length,count);assert.deepEqual(f.mutations,[]);assert.deepEqual(next.state().blocked,[]);next.controller.destroy();
  const read=deferred(),old=fixture({listBlocks:()=>read.promise});await tick();old.controller.destroy();const n=old.states.length;
  read.resolve({blocks:[friend]});await tick();assert.equal(old.states.length,n);
});

test('block write from an old SDK session rejects after reset',async t=>{
  const pending=deferred();recordingFetch(t,()=>pending.promise);
  const sdk=init({socialUrl:'https://social.test',getPlayerToken:async()=> 'token'});
  const request=sdk.blockPlayer(friend.id);await tick();sdk.resetPlayerSession();pending.resolve(new Response(null,{status:204}));
  await assert.rejects(request,e=>e.name==='AbortError');
});

test('a block keeps the DM readable and read-only; it stays so after unblocking until the two are friends again (TEAM-284)',async t=>{
  const room={id:'dm-room',kind:'dm',clanId:null,members:[{id:player.id,name:'Me',online:true},{id:friend.id,name:'Friend',online:false}]};
  const late=deferred(),sockets=[],states=[];
  const client={acquire:async()=>({token:'token'}),socketUrl:()=> 'ws://unused.test',listConversations:async()=>({conversations:[room]}),listMessages:()=>late.promise};
  const controller=createChatController({client,onChange:s=>states.push(s),socketFactory:()=>{
    const socket={readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw));},close(){},frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:'game',data})});}};sockets.push(socket);return socket;
  }});t.after(()=>controller.destroy());
  controller.configure({chat:{enabled:true,directMessages:true}},null);await tick();
  sockets[0].frame('hello',{playerId:player.id,configVersion:0});await tick();controller.select(friend.id);await tick();
  // The local block (before Realtime's update): the DM and its history stay; nothing can be sent.
  controller.setPlayerBlocked(friend.id,true);
  assert.deepEqual(states.at(-1).blockedPeers,[friend.id]);
  late.resolve({messages:[{id:'old',senderId:friend.id,senderName:'Friend',body:'Old history',createdAt:'2026-11-15T00:00:00Z'}],hasMore:false});await tick();
  assert.equal(controller.resolve(friend.id)?.id,room.id);assert.equal(states.at(-1).messages[room.id]?.[0]?.body,'Old history');
  await assert.rejects(controller.send(friend.id,'must not send'),e=>e.code==='not_friends');
  assert.equal(sockets[0].sent.filter(f=>f.type==='message.send').length,0);
  // Realtime's update: the DM is read-only for both. Unblocking does not make them friends: it stays read-only.
  sockets[0].frame('conversation.updated',{conversation:{...room,readOnly:true}});
  client.listConversations=async()=>({conversations:[{...room,readOnly:true}]});
  controller.setPlayerBlocked(friend.id,false);await controller.refresh();
  assert.equal(controller.resolve(friend.id)?.readOnly,true);
  await assert.rejects(controller.send(friend.id,'still not'),e=>e.code==='not_friends');
  // Friends again: Realtime sends the same conversation as conversation.added without readOnly; it replaces the old one.
  sockets[0].frame('conversation.added',{conversation:room});await tick();
  assert.equal(states.at(-1).conversations.filter(c=>c.id===room.id).length,1);
  assert.equal(controller.resolve(friend.id)?.readOnly,undefined);
  void controller.send(friend.id,'hello again').catch(()=>{});
  assert.equal(sockets[0].sent.filter(f=>f.type==='message.send').length,1);
});

test('removing a friend makes the DM read-only at once; an older list cannot undo it, friends again can (TEAM-284)',async t=>{
  const room={id:'dm-room',kind:'dm',clanId:null,members:[{id:player.id,name:'Me',online:true},{id:friend.id,name:'Friend',online:true}]};
  let answer=null;const sockets=[],states=[];
  const client={acquire:async()=>({token:'token'}),socketUrl:()=> 'ws://unused.test',listMessages:async()=>({messages:[],hasMore:false}),
    listConversations:()=>answer?answer.promise:Promise.resolve({conversations:[room]})};
  const controller=createChatController({client,onChange:s=>states.push(s),socketFactory:()=>{
    const socket={readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw));},close(){},frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:'game',data})});}};sockets.push(socket);return socket;
  }});t.after(()=>controller.destroy());
  controller.configure({chat:{enabled:true,directMessages:true}},null);await tick();
  sockets[0].frame('hello',{playerId:player.id,configVersion:0});await tick();
  // A list request is on its way (from before Realtime handled the removal) when the player removes the friend.
  answer=deferred();const late=controller.refresh();
  controller.endFriendship(friend.id);
  assert.equal(controller.resolve(friend.id)?.readOnly,true);
  answer.resolve({conversations:[room]});await late;answer=null;await controller.refresh();
  assert.equal(controller.resolve(friend.id)?.readOnly,true,'an older list made the DM writable again');
  await assert.rejects(controller.send(friend.id,'no'),e=>e.code==='not_friends');
  // Friends again: Realtime sends conversation.added.
  sockets[0].frame('conversation.added',{conversation:room});await tick();await controller.refresh();
  assert.equal(controller.resolve(friend.id)?.readOnly,undefined);
});
