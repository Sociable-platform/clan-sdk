// Closed clans: a player asks to join, the clan's leaders accept or decline. The server decides who may; the SDK carries the calls,
// keeps the list of requests for a leader, and tells @clan/ui what is asked of the player.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init} from '../src/index.js';
import {socialClanAdapter,joinRequestsAdapter} from '../src/social/clan-adapter.js';
import {clanViewModels,createDiscoverController} from '../src/experience/discover-controller.js';
import {createExperienceController} from '../src/experience/shared-controller.js';
import {createChatController} from '../src/chat/controller.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';

const social=()=>init({socialUrl:'https://social.test/',getPlayerToken:()=> 'token'});
const tick=()=>new Promise(done=>setTimeout(done,0));
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const apiError=(status,code,message='Server rejection')=>Object.assign(new Error(message),{status,code});

const wolves={id:'wolves',name:'Wolves',memberCount:3,maxMembers:10,joinPolicy:'closed'};
const foxes={id:'foxes',name:'Foxes',memberCount:2,maxMembers:10,joinPolicy:'open'};

// ---- the wire

test('createClan sends joinPolicy, and the other calls are what Social documents',async t=>{
  const calls=recordingFetch(t,jsonResponse({id:'c'},201),jsonResponse({id:'r1'},201),new Response(null,{status:204}),jsonResponse({requests:[]}),
    new Response(null,{status:204}),new Response(null,{status:204}),jsonResponse({id:'c',joinPolicy:'open'}));
  const sdk=social();
  await sdk.createClan({name:'Wolves',joinPolicy:'closed'});
  assert.deepEqual(JSON.parse(calls[0].body),{name:'Wolves',joinPolicy:'closed'});
  await sdk.requestClanJoin('c/1');
  assert.equal(calls[1].url,'https://social.test/api/v1/clans/c%2F1/requests');assert.equal(calls[1].method,'POST');assert.equal(calls[1].body,undefined);
  await sdk.cancelClanJoinRequest('c');
  assert.equal(calls[2].url,'https://social.test/api/v1/clans/c/requests/me');assert.equal(calls[2].method,'DELETE');
  await sdk.listClanJoinRequests('c');
  assert.equal(calls[3].url,'https://social.test/api/v1/clans/c/requests');assert.equal(calls[3].method,'GET');
  await sdk.acceptClanJoinRequest('c','r 1');
  assert.equal(calls[4].url,'https://social.test/api/v1/clans/c/requests/r%201/accept');assert.equal(calls[4].method,'POST');
  await sdk.declineClanJoinRequest('c','r1');
  assert.equal(calls[5].url,'https://social.test/api/v1/clans/c/requests/r1/decline');assert.equal(calls[5].method,'POST');
  await sdk.setClanJoinPolicy('c','open');
  assert.equal(calls[6].url,'https://social.test/api/v1/clans/c');assert.equal(calls[6].method,'PATCH');assert.deepEqual(JSON.parse(calls[6].body),{joinPolicy:'open'});
  for(const call of calls.slice(1))assert.equal(call.headers.Authorization,'Bearer token');
});

test('the request calls refuse a bad clan or request ID before any request',t=>{
  const calls=recordingFetch(t,jsonResponse({}));
  const sdk=social();
  for(const bad of ['','..','.',' '])assert.throws(()=>sdk.requestClanJoin(bad),/clanId/);
  assert.throws(()=>sdk.acceptClanJoinRequest('c',' '),/requestId/);
  assert.throws(()=>sdk.declineClanJoinRequest('c','..'),/requestId/);
  assert.equal(calls.length,0);
});

test('createClan refuses a joinPolicy that is not text',()=>{
  assert.throws(()=>social().createClan({name:'Wolves',joinPolicy:true}),/joinPolicy must be a string/);
});

// ---- the adapters

test('the clan list keeps joinPolicy and requested, and leaves out what it cannot read',()=>{
  const base={id:'c',name:'Wolves',memberCount:1,maxMembers:10};
  const [a,b,c,d,e]=socialClanAdapter({clans:[{...base,joinPolicy:'closed',requested:true},{...base,id:'d',joinPolicy:'open'},{...base,id:'e'},
    {...base,id:'f',joinPolicy:'secret',requested:'yes'},{...base,id:'g',requested:false}]});
  assert.equal(a.joinPolicy,'closed');assert.equal(a.requested,true);
  assert.equal(b.joinPolicy,'open');assert.equal('requested' in b,false);
  assert.equal('joinPolicy' in c,false); // a Social from before closed clans: the clan reads as open
  assert.equal('joinPolicy' in d,false);assert.equal('requested' in d,false);
  assert.equal('requested' in e,false); // only ever true
});

test('clan view models validate the two new fields',()=>{
  assert.deepEqual(clanViewModels([{id:'c',name:'Wolves',joinPolicy:'closed',requested:true}])[0],{id:'c',name:'Wolves',joinPolicy:'closed',requested:true});
  assert.throws(()=>clanViewModels([{id:'c',name:'Wolves',joinPolicy:'secret'}]),/joinPolicy/);
  assert.throws(()=>clanViewModels([{id:'c',name:'Wolves',requested:'yes'}]),/requested/);
});

test('join requests are read as the widget shows them',()=>{
  assert.deepEqual(joinRequestsAdapter({requests:[{id:'r1',playerId:'p1',displayName:'Rashad',createdAt:'2026-11-17T09:12:00Z'},{id:'r2',playerId:'p2',displayName:'Leyla'}]}),
    [{id:'r1',playerId:'p1',name:'Rashad',at:'2026-11-17T09:12:00Z'},{id:'r2',playerId:'p2',name:'Leyla'}]);
  assert.deepEqual(joinRequestsAdapter({requests:[]}),[]);
  for(const bad of [null,{},{requests:{}},{requests:[null]},{requests:[{id:'r',playerId:'p'}]},{requests:[{id:'',playerId:'p',displayName:'x'}]}])
    assert.throws(()=>joinRequestsAdapter(bad),TypeError);
});

// ---- the player: Join on a closed clan is a request

function discover(t,overrides={}) {
  const states=[],calls=[],events=[];
  const deps={listClans:async()=>({clans:[wolves,foxes]}),joinClan:async id=>{calls.push(['join',id]);},requestJoin:async id=>{calls.push(['request',id]);},
    cancelRequest:async id=>{calls.push(['cancel',id]);},clanAdapter:r=>r.clans,onChange:s=>states.push(s),onNavigate(){},onJoined:d=>events.push(['joined',d]),
    onRequested:d=>events.push(['requested',d]),debounceMs:0,...overrides};
  const c=createDiscoverController(deps);t.after(()=>c.destroy());
  return {c,calls,events,state:()=>states.at(-1)};
}
const clanOf=(f,id)=>f.state().clans.find(c=>c.id===id);

test('joining a closed clan sends a request, marks the clan, and does not join',async t=>{
  const f=discover(t);await f.c.start();
  await f.c.join('wolves');
  assert.deepEqual(f.calls,[['request','wolves']]);
  assert.equal(clanOf(f,'wolves').requested,true);assert.equal('requested' in clanOf(f,'foxes'),false);
  assert.equal(f.state().pendingJoin,null);assert.equal(f.state().joinedClanId,null);
  assert.deepEqual(f.events,[['requested',{clanId:'wolves'}]]);
  // Asking again changes nothing.
  await f.c.join('wolves');
  assert.deepEqual(f.calls,[['request','wolves']]);
});

test('an open clan is still joined directly',async t=>{
  const f=discover(t);await f.c.start();
  await f.c.join('foxes');
  assert.deepEqual(f.calls,[['join','foxes']]);
  assert.deepEqual(f.events,[['joined',{clanId:'foxes'}]]);
});

test('a clan from a Social without closed clans has no policy and is joined directly',async t=>{
  const f=discover(t,{listClans:async()=>({clans:[{id:'old',name:'Old Timers'}]})});await f.c.start();
  await f.c.join('old');
  assert.deepEqual(f.calls,[['join','old']]);
});

test('a request that was already sent marks the clan; a clan that opened meanwhile is read again',async t=>{
  let reads=0;
  const f=discover(t,{listClans:async()=>{reads++;return {clans:[wolves,foxes]};},requestJoin:async()=>{throw apiError(409,'already_requested','You already asked to join this clan');}});
  await f.c.start();await f.c.join('wolves');
  assert.equal(clanOf(f,'wolves').requested,true);assert.equal(f.state().joinError,'You already asked to join this clan');

  const g=discover(t,{listClans:async()=>{reads++;return {clans:[wolves]};},requestJoin:async()=>{throw apiError(409,'clan_open','This clan is open; join it directly');}});
  await g.c.start();const before=reads;await g.c.join('wolves');await settle();
  assert.equal(g.state().joinError,'This clan is open; join it directly');
  assert.equal(reads,before+1,'the list is read again to show the clan as it is');
});

test('a request that is refused keeps the clan unmarked and shows the answer',async t=>{
  const f=discover(t,{requestJoin:async()=>{throw apiError(409,'too_many_requests','You have too many open requests; take one back first');}});
  await f.c.start();await f.c.join('wolves');
  assert.equal('requested' in clanOf(f,'wolves'),false);
  assert.equal(f.state().joinError,'You have too many open requests; take one back first');
  assert.equal(f.state().pendingJoin,null);
});

test('a full closed clan is not asked',async t=>{
  const f=discover(t,{listClans:async()=>({clans:[{...wolves,memberCount:10}]})});await f.c.start();
  await f.c.join('wolves');
  assert.deepEqual(f.calls,[]);
});

test('taking a request back clears the mark; one a leader already answered clears it too',async t=>{
  const f=discover(t);await f.c.start();await f.c.join('wolves');
  await f.c.cancelRequest('wolves');
  assert.deepEqual(f.calls,[['request','wolves'],['cancel','wolves']]);
  assert.equal(clanOf(f,'wolves').requested,false);

  const g=discover(t,{cancelRequest:async()=>{throw apiError(404,'request_not_found','This join request does not exist any more');}});
  await g.c.start();await g.c.join('wolves');await g.c.cancelRequest('wolves');
  assert.equal(clanOf(g,'wolves').requested,false);assert.equal(g.state().joinError,'');

  const h=discover(t,{cancelRequest:async()=>{throw apiError(500,'internal_error','Something went wrong');}});
  await h.c.start();await h.c.join('wolves');await h.c.cancelRequest('wolves');
  assert.equal(clanOf(h,'wolves').requested,true,'a failure keeps the request');assert.equal(h.state().joinError,'Something went wrong');
  // Nothing to take back from a clan that was not asked.
  const before=f.calls.length;await f.c.cancelRequest('foxes');assert.equal(f.calls.length,before);
});

test('a clan already marked as requested in the list is not asked again',async t=>{
  const f=discover(t,{listClans:async()=>({clans:[{...wolves,requested:true}]})});await f.c.start();
  await f.c.join('wolves');
  assert.deepEqual(f.calls,[]);
});

// ---- the leader: the requests, and deciding on them

const asked=[{id:'r1',playerId:'p1',displayName:'Rashad',createdAt:'2026-11-17T09:12:00Z'},{id:'r2',playerId:'p2',displayName:'Leyla',createdAt:'2026-11-17T09:13:00Z'}];

async function leader(t,{role='owner',policy='closed',overrides={}}={}) {
  const states=[],events=[],calls=[];
  let requests=[...asked];
  const sdk={
    myClan:async()=>{calls.push('myClan');return {clan:{id:'clan-id',name:'Wolves',memberCount:3,maxMembers:10,joinPolicy:policy},role};},
    clanMembers:async()=>({members:[]}),listClans:async()=>({clans:[]}),
    listClanJoinRequests:async id=>{calls.push(['list',id]);return {requests};},
    acceptClanJoinRequest:async(c,r)=>{calls.push(['accept',c,r]);requests=requests.filter(x=>x.id!==r);},
    declineClanJoinRequest:async(c,r)=>{calls.push(['decline',c,r]);requests=requests.filter(x=>x.id!==r);},
    setClanJoinPolicy:async(c,p)=>{calls.push(['policy',c,p]);return {id:c,name:'Wolves',memberCount:3,maxMembers:10,joinPolicy:p};},
    ...overrides};
  const c=createExperienceController({sdk,onChange:s=>states.push(s),onEvent:(...e)=>events.push(e),clanAdapter:r=>r.clans,rosterDelay:0});
  t.after(()=>c.destroy());
  await c.start();await settle();
  return {c,calls,events,sdk,state:()=>states.at(-1),setRequests:list=>{requests=list;}};
}

test('a leader of a closed clan gets the requests, oldest first, with the names the widget shows',async t=>{
  const f=await leader(t);
  assert.deepEqual(f.state().joinRequests,[{id:'r1',playerId:'p1',name:'Rashad',at:'2026-11-17T09:12:00Z'},{id:'r2',playerId:'p2',name:'Leyla',at:'2026-11-17T09:13:00Z'}]);
  assert.deepEqual(f.calls.filter(c=>c[0]==='list'),[['list','clan-id']]);
});

test('an open clan has no requests to read',async t=>{
  const f=await leader(t,{policy:'open'});
  assert.deepEqual(f.state().joinRequests,[]);
  assert.equal(f.calls.some(c=>c[0]==='list'),false);
});

test('a member whose role may not decide is turned away once, and not asked again',async t=>{
  const f=await leader(t,{role:'member',overrides:{listClanJoinRequests:async()=>{throw apiError(403,'not_allowed','Your clan role does not allow this');}}});
  assert.deepEqual(f.state().joinRequests,[]);
  // A notice, a roster change and the like read again: the answer is remembered for this clan and role.
  f.c.requestsChanged('clan-id');f.c.rosterChanged('clan-id');await settle();
  assert.deepEqual(f.state().joinRequests,[]);
});

test('Realtime says somebody asked: the requests are read again, and only for the player\'s own clan',async t=>{
  const f=await leader(t);
  f.setRequests([...asked,{id:'r3',playerId:'p3',displayName:'Aysel',createdAt:'2026-11-17T09:14:00Z'}]);
  f.c.requestsChanged('some-other-clan');await settle();
  assert.equal(f.state().joinRequests.length,2);
  f.c.requestsChanged('clan-id');await settle();
  assert.deepEqual(f.state().joinRequests.map(r=>r.name),['Rashad','Leyla','Aysel']);
});

test('accepting a request removes it, tells the host, and reads the roster again',async t=>{
  const f=await leader(t);
  f.calls.length=0;
  await f.c.acceptRequest('r1');await tick();await settle();
  assert.deepEqual(f.calls.filter(c=>c[0]==='accept'),[['accept','clan-id','r1']]);
  assert.deepEqual(f.state().joinRequests.map(r=>r.id),['r2']);
  assert.equal(f.state().requestPending,null);assert.equal(f.state().requestError,'');
  assert.deepEqual(f.events.filter(e=>e[0]==='join-request-accepted'),[['join-request-accepted',{clanId:'clan-id',playerId:'p1',requestId:'r1'}]]);
  assert.ok(f.calls.includes('myClan'),'the clan is read again for the new member count');
});

test('declining a request removes it and tells the host',async t=>{
  const f=await leader(t);
  await f.c.declineRequest('r2');await settle();
  assert.deepEqual(f.calls.filter(c=>c[0]==='decline'),[['decline','clan-id','r2']]);
  assert.deepEqual(f.state().joinRequests.map(r=>r.id),['r1']);
  assert.deepEqual(f.events.filter(e=>e[0]==='join-request-declined'),[['join-request-declined',{clanId:'clan-id',playerId:'p2',requestId:'r2'}]]);
});

test('one answer at a time, and only for a request on the list',async t=>{
  let release;
  const f=await leader(t,{overrides:{acceptClanJoinRequest:()=>new Promise(r=>{release=r;})}});
  const first=f.c.acceptRequest('r1');await settle();
  assert.deepEqual(f.state().requestPending,{action:'accept',id:'r1'});
  await f.c.declineRequest('r2');await f.c.acceptRequest('r2');
  assert.equal(f.state().joinRequests.length,2,'nothing else is answered while one is');
  release();await first;await settle();
  assert.equal(f.state().requestPending,null);
  const calls=f.calls.length;await f.c.acceptRequest('nope');assert.equal(f.calls.length,calls,'an ID that is not on the list is not sent');
});

test('a request that is gone shows the answer and is read again from the server',async t=>{
  let gone=false;
  const f=await leader(t,{overrides:{
    acceptClanJoinRequest:async()=>{gone=true;throw apiError(404,'request_not_found','This join request does not exist any more');},
  }});
  f.sdk.listClanJoinRequests=async()=>({requests:gone?[asked[1]]:asked});
  await f.c.acceptRequest('r1');await settle();
  assert.equal(f.state().requestError,'This join request does not exist any more');
  assert.deepEqual(f.state().joinRequests.map(r=>r.id),['r2']);
  assert.equal(f.state().requestPending,null);
});

test('a full clan keeps the request and says so',async t=>{
  const f=await leader(t,{overrides:{acceptClanJoinRequest:async()=>{throw apiError(409,'clan_full','This clan has no free places');}}});
  await f.c.acceptRequest('r1');await settle();
  assert.equal(f.state().requestError,'This clan has no free places');
  assert.ok(f.state().joinRequests.some(r=>r.id==='r1'));
});

test('the owner closes and opens the clan; closing starts the list, opening drops it',async t=>{
  const f=await leader(t,{policy:'open'});
  await f.c.setJoinPolicy('closed');await settle();
  assert.deepEqual(f.calls.filter(c=>c[0]==='policy'),[['policy','clan-id','closed']]);
  assert.equal(f.state().clan.joinPolicy,'closed');
  assert.equal(f.state().joinRequests.length,2);
  assert.deepEqual(f.events.filter(e=>e[0]==='join-policy-changed'),[['join-policy-changed',{clanId:'clan-id',joinPolicy:'closed'}]]);
  await f.c.setJoinPolicy('open');await settle();
  assert.equal(f.state().clan.joinPolicy,'open');assert.deepEqual(f.state().joinRequests,[]);
  // The same policy again, or one that is not one, asks nothing.
  const n=f.calls.length;await f.c.setJoinPolicy('open');await f.c.setJoinPolicy('secret');assert.equal(f.calls.length,n);
});

test('a refused policy change shows the answer and keeps the clan as it was',async t=>{
  const f=await leader(t,{overrides:{setClanJoinPolicy:async()=>{throw apiError(403,'not_clan_owner','Only the clan owner can open or close the clan');}}});
  await f.c.setJoinPolicy('open');await settle();
  assert.equal(f.state().requestError,'Only the clan owner can open or close the clan');
  assert.equal(f.state().clan.joinPolicy,'closed');
});

test('leaving the clan drops the requests',async t=>{
  const f=await leader(t,{overrides:{leaveClan:async()=>{}}});
  assert.equal(f.state().joinRequests.length,2);
  await f.c.leave();await settle();
  assert.deepEqual(f.state().joinRequests,[]);
});

test('the clan form sends joinPolicy when it has one',async t=>{
  const created=[];
  const f=await leader(t,{overrides:{myClan:async()=>{throw apiError(404,'not_in_clan','You are not in a clan');},createClan:async body=>{created.push(body);return {id:'c'};}}});
  await f.c.create({name:'Wolves',joinPolicy:'closed'});await settle();
  await f.c.create({name:'Foxes'});
  assert.deepEqual(created[0],{name:'Wolves',joinPolicy:'closed'});
});

// ---- Realtime: the two notifications

test('Realtime\'s clan_join_request and clan_join_declined notifications reach the host as membership events',async t=>{
  const memberships=[];
  const client={acquire:async()=>({token:'t',version:1}),socketUrl:()=> 'ws://test.invalid',listConversations:async()=>({conversations:[]}),listMessages:async()=>({messages:[],hasMore:false})};
  let socket;
  const c=createChatController({client,onChange(){},onMembership:e=>memberships.push(e),socketFactory:()=>{socket={readyState:1,sent:[],send(){},close(){},frame(type,data){this.onmessage?.({data:JSON.stringify({type,data,game_id:'g'})});}};return socket;}});
  t.after(()=>c.destroy());
  c.configure({clan:{enabled:true},chat:{enabled:true,clanChat:true,directMessages:true,maxMessageLength:300}},'clan');await settle();
  socket.frame('hello',{playerId:'me',configVersion:0,onlineFriends:[]});await settle();
  socket.frame('notification',{kind:'clan_join_request',payload:{clanId:'clan',clanName:'Wolves',requestId:'r1',player:{id:'p',name:'Rashad'}}});
  socket.frame('notification',{kind:'clan_join_declined',payload:{clanId:'clan',clanName:'Wolves'}});
  socket.frame('notification',{kind:'clan_join_request',payload:{}}); // no clan: ignored
  await settle();
  assert.deepEqual(memberships.filter(e=>e.kind.startsWith('clan_join')),[{kind:'clan_join_request',clanId:'clan'},{kind:'clan_join_declined',clanId:'clan'}]);
});

test('a player whose request was declined sees the clan list read again, and the host hears it',async t=>{
  const states=[],events=[];let reads=0;
  const sdk={myClan:async()=>{throw apiError(404,'not_in_clan','You are not in a clan');},listClans:async()=>{reads++;return {clans:[wolves]};}};
  const c=createExperienceController({sdk,onChange:s=>states.push(s),onEvent:(...e)=>events.push(e),clanAdapter:r=>r.clans});
  t.after(()=>c.destroy());
  await c.start();await settle();
  const before=reads;
  c.joinRequestDeclined('wolves');await settle();
  assert.deepEqual(events.filter(e=>e[0]==='join-declined'),[['join-declined',{clanId:'wolves'}]]);
  assert.equal(reads,before+1);
});
