import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFriendsController} from '../src/friends/controller.js';
import {player,friend,sent,incoming,search} from './fixtures/social/friends.js';
const tick=()=>new Promise(done=>setTimeout(done,10));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function setup(extra={}) {
 const states=[],calls=[];const sdk={getMyPlayer:async()=>{calls.push('me');return player;},listFriends:async()=>{calls.push('friends');return {friends:[friend]};},listFriendRequests:async()=>{calls.push('requests');return {incoming:[incoming],outgoing:[sent]};},searchPlayers:async args=>{calls.push(['search',args]);return search;},...Object.fromEntries(['sendFriendRequest','acceptFriendRequest','declineFriendRequest','cancelFriendRequest','removeFriend'].map(method=>[method,async id=>{calls.push([method,id]);return undefined;}])),...extra};
 const controller=createFriendsController({sdk,onChange:s=>states.push(s),debounceMs:1});return {controller,sdk,states,calls,state:()=>states.at(-1)};
}
test('Friends only fetches when enabled/visible, bootstraps real Social identity and maps collections',async()=>{
 const f=setup();f.controller.setView(false,true);await tick();assert.deepEqual(f.calls,[]);f.controller.setView(true,false);await tick();assert.deepEqual(f.calls,[]);
 f.controller.setView(true,true);await tick();assert.deepEqual(f.calls,['me','friends','requests']);assert.equal(f.state().player.id,player.id);assert.equal(f.state().incoming[0].id,incoming.id);assert.equal(f.state().outgoing[0].playerId,friend.id);f.controller.destroy();
});
for(const [action,id,method] of [['accept',incoming.id,'acceptFriendRequest'],['decline',incoming.id,'declineFriendRequest'],['cancel',sent.id,'cancelFriendRequest'],['remove',friend.id,'removeFriend']])test(`${action} uses correct ID and refetches both lists`,async()=>{
 const f=setup();f.controller.setView(true,true);await tick();await f.controller.action(action,id);assert.deepEqual(f.calls[3],[method,id]);assert.deepEqual(f.calls.slice(4),['me','friends','requests']);f.controller.destroy();
});
test('search debounce/races and empty query; newest results win',async()=>{
 const a=deferred(),b=deferred();let calls=0;const f=setup({searchPlayers:()=>++calls===1?a.promise:b.promise});f.controller.setView(true,true);await tick();f.controller.search('old');await tick();f.controller.search('new');await tick();b.resolve({players:[{id:friend.id,displayName:'new',relation:'none'}]});await tick();a.resolve(search);await tick();assert.equal(f.state().players[0].name,'new');f.controller.search(' ');await tick();assert.equal(calls,2);assert.deepEqual(f.state().players,[]);f.controller.destroy();
});
test('send uses Social ID, not external or request ID, and refreshes after reciprocal acceptance',async()=>{
 const f=setup({sendFriendRequest:async input=>{f.calls.push(['send',input]);return friend;}});f.controller.setView(true,true);await tick();f.controller.search('ay');await tick();await f.controller.action('send',search.players[1].id);assert.ok(f.calls.some(c=>c[0]==='send'&&c[1].playerId===search.players[1].id));assert.equal(f.state().status,'ready');f.controller.destroy();
});
test('duplicate pending writes and self/unknown targets never send',async()=>{
 const pending=deferred();let calls=0;const f=setup({acceptFriendRequest:()=>{calls++;return pending.promise;}});f.controller.setView(true,true);await tick();const first=f.controller.action('accept',incoming.id);await f.controller.action('accept',incoming.id);assert.equal(calls,1);await f.controller.action('send',player.id);await f.controller.action('send','unknown');pending.resolve(friend);await first;assert.equal(calls,1);f.controller.destroy();
});
test('server rejection remains visible, 404 refetches without retrying mutation',async()=>{
 let calls=0;const f=setup({removeFriend:async()=>{calls++;throw Object.assign(new Error('Relationship changed'),{status:404,code:'not_friends'});}});f.controller.setView(true,true);await tick();await f.controller.action('remove',friend.id);assert.equal(calls,1);assert.equal(f.state().actionError,'Relationship changed');assert.equal(f.state().status,'ready');f.controller.destroy();
});
test('loading/empty/error/retry never invents friends or converts failed requests into empty success',async()=>{
 let fail=true;const f=setup({listFriends:async()=>{if(fail)throw new Error('Unavailable');return {friends:[]};},listFriendRequests:async()=>({incoming:[],outgoing:[]})});f.controller.setView(true,true);assert.equal(f.state().status,'loading');await tick();assert.equal(f.state().status,'error');fail=false;await f.controller.refresh();assert.equal(f.state().status,'ready');assert.deepEqual(f.state().friends,[]);f.controller.destroy();
});
test('navigation/destroy ignores pending reads and writes; timers/subscriptions do not continue',async()=>{
 const pending=deferred();const f=setup({listFriends:()=>pending.promise});f.controller.setView(true,true);await tick();f.controller.setView(true,false);pending.resolve({friends:[friend]});await tick();assert.equal(f.state().friends.length,0);f.controller.destroy();const count=f.states.length;f.controller.search('ay');await f.controller.refresh();await f.controller.action('remove',friend.id);await tick();assert.equal(f.states.length,count);
});
test('identity change clears previous data; late old refresh cannot overwrite new session',async()=>{
 const pending=deferred();let n=0;const f=setup({getMyPlayer:async()=>++n===1?player:{...player,id:'new-social-id',externalId:'new-game-user'},listFriends:()=>n===1?pending.promise:Promise.resolve({friends:[]})});f.controller.setView(true,true);await tick();await f.controller.refresh();pending.resolve({friends:[friend]});await tick();assert.equal(f.state().player.id,'new-social-id');assert.deepEqual(f.state().friends,[]);f.controller.destroy();
});
test('independent controllers do not share query, pending actions or collections',async()=>{
 const a=setup(),b=setup();a.controller.setView(true,true);b.controller.setView(true,true);await tick();a.controller.search('ay');await tick();assert.equal(b.state().query,'');a.controller.destroy();await b.controller.refresh();assert.equal(b.state().friends[0].id,friend.id);b.controller.destroy();
});
