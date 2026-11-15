import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init,ApiError} from '../src/index.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';
import {player,friend,sent,incoming,search} from './fixtures/social/friends.js';
import {friendPlayer,friendList,friendRequests,playerResults} from '../src/social/friends-adapter.js';
const sdk=()=>init({socialUrl:'https://social.test/',getPlayerToken:async()=>'player-token'});
const cases=[
 ['getMyPlayer',[], 'GET','/players/me',player,200],
 ['listFriends',[],'GET','/friends',{friends:[friend]},200],
 ['listFriendRequests',[],'GET','/friends/requests',{incoming:[incoming],outgoing:[]},200],
 ['listBlocks',[],'GET','/players/me/blocks',{blocks:[friend]},200],
 ['blockPlayer',[friend.id],'POST',`/players/${friend.id}/block`,undefined,204],
 ['unblockPlayer',[friend.id],'DELETE',`/players/${friend.id}/block`,undefined,204],
 ['searchPlayers',[{q:'ay',limit:5}],'GET','/players?q=ay&limit=5',search,200],
 ['sendFriendRequest',[{playerId:friend.id}],'POST','/friends/requests',sent,201,{playerId:friend.id}],
 ['sendFriendRequest',[{playerId:friend.id}],'POST','/friends/requests',friend,200,{playerId:friend.id}],
 ['acceptFriendRequest',[sent.id],'POST',`/friends/requests/${sent.id}/accept`,{...friend,id:incoming.player.id,displayName:'Murad',since:'2026-11-10T08:05:00Z'},200],
 ['declineFriendRequest',[sent.id],'POST',`/friends/requests/${sent.id}/decline`,undefined,204],
 ['cancelFriendRequest',[sent.id],'DELETE',`/friends/requests/${sent.id}`,undefined,204],
 ['removeFriend',[friend.id],'DELETE',`/friends/${friend.id}`,undefined,204],
];
for(const [method,args,http,path,result,status,body] of cases)test(`${method} ${status} follows confirmed contract without changing JSON`,async t=>{
 const calls=recordingFetch(t,status===204?new Response(null,{status}):jsonResponse(result,status));
 assert.deepEqual(await sdk()[method](...args),result);
 assert.equal(calls[0].url,'https://social.test/api/v1'+path);assert.equal(calls[0].method,http);
 assert.deepEqual(calls[0].headers,{Accept:'application/json',Authorization:'Bearer player-token',...(body?{'Content-Type':'application/json'}:{})});
 assert.equal(calls[0].body,body?JSON.stringify(body):undefined);assert.equal(calls.length,1);
});
for(const [status,code,message,method,args] of [
 [400,'cannot_friend_yourself','You cannot send a friend request to yourself','sendFriendRequest',[{playerId:player.id}]],
 [400,'invalid_query','Search text (q) is required','searchPlayers',[{q:''}]],
 [404,'player_not_found','Player not found','sendFriendRequest',[{playerId:friend.id}]],
 [409,'already_friends','You are already friends','sendFriendRequest',[{playerId:friend.id}]],
 [409,'friend_request_exists','You already sent this player a friend request','sendFriendRequest',[{playerId:friend.id}]],
 [403,'not_request_receiver','Only the player who received this request can accept it','acceptFriendRequest',[sent.id]],
 [403,'not_request_sender','Only the player who sent this request can cancel it','cancelFriendRequest',[sent.id]],
 [404,'friend_request_not_found','Friend request not found','declineFriendRequest',[sent.id]],
 [404,'not_friends','You are not friends with this player','removeFriend',[friend.id]],
])test(`${method} retains ${status} ${code} without retry`,async t=>{
 const calls=recordingFetch(t,jsonResponse({error:{code,message}},status));await assert.rejects(sdk()[method](...args),e=>e instanceof ApiError&&e.status===status&&e.code===code&&e.message===message);assert.equal(calls.length,1);
});
test('encoded search and request path; no external ID substitution',async t=>{
 const calls=recordingFetch(t,jsonResponse(search),new Response(null,{status:204}));const s=sdk();await s.searchPlayers({q:'a &%_ /'});await s.cancelFriendRequest('request/id #');assert.ok(calls[0].url.endsWith('?q=a+%26%25_+%2F'));assert.ok(calls[1].url.endsWith('/request%2Fid%20%23'));assert.ok(!calls[1].url.includes(player.externalId));
});
test('Friends uses same 401 fresh-token retry retaining POST JSON',async t=>{
 const calls=recordingFetch(t,jsonResponse({error:{code:'token_expired',message:'Expired'}},401),jsonResponse(sent,201));let n=0;
 await init({socialUrl:'https://social.test',getPlayerToken:async()=>++n===1?'old-token':'new-token'}).sendFriendRequest({playerId:friend.id});assert.equal(n,2);assert.equal(calls[1].headers.Authorization,'Bearer new-token');assert.equal(calls[0].body,calls[1].body);assert.equal(calls[1].method,'POST');
});
test('invalid Friends inputs and init do not acquire tokens/network',t=>{
 const calls=recordingFetch(t);let tokens=0;const s=init({socialUrl:'https://social.test',getPlayerToken:()=>{tokens++;return 'token';}});
 for(const method of ['acceptFriendRequest','declineFriendRequest','cancelFriendRequest','removeFriend','blockPlayer','unblockPlayer'])for(const id of [null,undefined,'','.','..',3])assert.throws(()=>s[method](id),TypeError);
 assert.throws(()=>s.sendFriendRequest({playerId:''}),TypeError);assert.throws(()=>s.searchPlayers({}),TypeError);assert.throws(()=>s.searchPlayers({q:'a',limit:0}),TypeError);assert.equal(calls.length,0);assert.equal(tokens,0);
});
test('Friends callback/network failures never retry or fetch unauthenticated',async t=>{
 const calls=recordingFetch(t,new TypeError('offline'));await assert.rejects(sdk().listFriends(),/offline/);assert.equal(calls.length,1);
 await assert.rejects(init({socialUrl:'https://social.test',getPlayerToken:async()=>{throw new Error('Token unavailable');}}).listFriends(),/Token unavailable/);assert.equal(calls.length,1);
});
test('session reset rejects late responses and callbacks before new account requests',async t=>{
 let resolve;const pending=new Promise(done=>resolve=done);const calls=recordingFetch(t,()=>pending,jsonResponse({friends:[]}));const s=sdk();const old=s.listFriends();await new Promise(done=>setTimeout(done,0));s.resetPlayerSession();resolve(jsonResponse({friends:[friend]}));await assert.rejects(old,e=>e.name==='AbortError');assert.deepEqual(await s.listFriends(),{friends:[]});assert.equal(calls.length,2);
});
test('session reset while token callback awaits prevents old-session fetch',async t=>{
 let resolve;const calls=recordingFetch(t);const s=init({socialUrl:'https://social.test',getPlayerToken:()=>new Promise(done=>resolve=done)});const old=s.listFriends();s.resetPlayerSession();resolve('old-session-token');await assert.rejects(old,e=>e.name==='AbortError');assert.equal(calls.length,0);
});
test('default adapters distinguish player/request IDs without invented online state',()=>{
 assert.equal(friendPlayer(player).id,player.id);assert.notEqual(player.id,player.externalId);
 const f=friendList({friends:[friend]});assert.equal(f[0].name,'Aysel');assert.equal(f[0].online,undefined);
 const r=friendRequests({incoming:[incoming],outgoing:[sent]});assert.equal(r.incoming[0].id,incoming.id);assert.equal(r.incoming[0].playerId,incoming.player.id);assert.equal(r.outgoing[0].direction,'outgoing');assert.equal(playerResults(search)[0].requestId,sent.id);
 assert.throws(()=>friendList({demoFriends:[]}));assert.throws(()=>playerResults({players:[{...search.players[0],requestId:null}]}));
});
test('resetting one SDK does not invalidate another player SDK session',async t=>{
 let resolveA,resolveB;const pendingA=new Promise(done=>resolveA=done),pendingB=new Promise(done=>resolveB=done);
 recordingFetch(t,()=>pendingA,()=>pendingB);const a=sdk(),b=sdk();const old=a.listFriends(),other=b.listFriends();
 await new Promise(done=>setTimeout(done,0));a.resetPlayerSession();resolveB(jsonResponse({friends:[friend]}));assert.deepEqual(await other,{friends:[friend]});resolveA(jsonResponse({friends:[]}));await assert.rejects(old,e=>e.name==='AbortError');
});
