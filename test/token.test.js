import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init} from '../src/index.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const tick=()=>new Promise(done=>setTimeout(done,0));
const unauthorized=()=>jsonResponse({error:{code:'token_expired',message:'Expired'}},401);
test('parallel Friends reads retain all HTTP calls but share one normal acquisition',async t=>{
 const token=deferred(),flags=[];const calls=recordingFetch(t,jsonResponse({}),jsonResponse({}),jsonResponse({}));
 const sdk=init({socialUrl:'https://social.test',getPlayerToken:options=>{flags.push(options);return token.promise;}});
 const results=[sdk.getMyPlayer(),sdk.listFriends(),sdk.listFriendRequests()];assert.deepEqual(flags,[{forceRefresh:false}]);token.resolve('cached');await Promise.all(results);assert.equal(calls.length,3);
});
test('concurrent and delayed 401s share the same forced refresh, preserve POST body, and retry once',async t=>{
 const delayed=deferred(),refresh=deferred(),flags=[];let refreshed=false;
 const calls=recordingFetch(t,unauthorized(),()=>delayed.promise,jsonResponse({ok:true}),jsonResponse({ok:true}));
 const sdk=init({socialUrl:'https://social.test',getPlayerToken:({forceRefresh})=>{flags.push(forceRefresh);if(forceRefresh){refreshed=true;return refresh.promise;}return 'old';}});
 const a=sdk.sendFriendRequest({playerId:'social-id'}),b=sdk.listFriends();await tick();assert.equal(refreshed,true);refresh.resolve('new');await a;delayed.resolve(unauthorized());await b;
 assert.deepEqual(flags,[false,true]);assert.equal(calls.length,4);assert.equal(calls[2].body,calls[0].body);assert.equal(calls[2].headers.Authorization,'Bearer new');assert.equal(calls[3].headers.Authorization,'Bearer new');
});
test('two 401 responses maximum and legacy callbacks still work',async t=>{
 const calls=recordingFetch(t,unauthorized(),unauthorized());let n=0;
 await assert.rejects(init({socialUrl:'https://social.test',getPlayerToken:()=>{n++;return 'legacy';}}).listFriends(),e=>e.status===401);assert.equal(n,2);assert.equal(calls.length,2);
});
test('failed shared acquisition clears pending references for a later retry',async t=>{
 let n=0;const calls=recordingFetch(t,jsonResponse({}));const sdk=init({socialUrl:'https://social.test',getPlayerToken:()=>++n===1?Promise.reject(new Error('Token unavailable')):'retry-token'});
 await Promise.all([assert.rejects(sdk.listFriends(),/unavailable/),assert.rejects(sdk.listFriendRequests(),/unavailable/)]);await sdk.listFriends();assert.equal(n,2);assert.equal(calls.length,1);
});
test('session reset isolates new acquisition from an old pending callback',async t=>{
 const old=deferred();let n=0;const calls=recordingFetch(t,jsonResponse({}));const sdk=init({socialUrl:'https://social.test',getPlayerToken:()=>++n===1?old.promise:'new-session'});
 const pending=assert.rejects(sdk.listFriends(),e=>e.name==='AbortError');sdk.resetPlayerSession();await sdk.listFriends();old.resolve('old-session');await pending;assert.equal(calls.length,1);assert.equal(calls[0].headers.Authorization,'Bearer new-session');
});
