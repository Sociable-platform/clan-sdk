// TEAM-257: clan member promote/demote/kick and the Members-panel Add friend.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init} from '../src/index.js';
import {createExperienceController} from '../src/experience/shared-controller.js';
import {createFriendsController} from '../src/friends/controller.js';
import {roleStep} from '../src/config/roles.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';
import {player,friend} from './fixtures/social/friends.js';

const clan={id:'clan-id',name:'Wolves',memberCount:3,maxMembers:10};
const roster=[{playerId:'owner-id',displayName:'Ali',role:'owner',joinedAt:'2026-11-07T17:30:00Z'},
  {playerId:'elder-id',displayName:'Leyla',role:'elder',joinedAt:'2026-11-07T17:31:00Z'},
  {playerId:'member-id',displayName:'Aysel',role:'member',joinedAt:'2026-11-07T17:32:00Z'}];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(done=>setTimeout(done,0));
const apiError=(status,code,message='Server rejection')=>Object.assign(new Error(message),{status,code});
const social=()=>init({socialUrl:'https://social.test/',getPlayerToken:()=> 'token'});

async function fixture(t,overrides={}) {
  const states=[],events=[],calls=[];
  const sdk={myClan:async()=>{calls.push('myClan');return {clan,role:'owner'};},clanMembers:async id=>{calls.push(['clanMembers',id]);return {members:roster};},listClans:async()=>({clans:[]}),
    kickClanMember:async(...a)=>{calls.push(['kick',...a]);},promoteClanMember:async(c,id)=>{calls.push(['promote',c,id]);return {playerId:id,displayName:'Aysel',role:'elder'};},
    demoteClanMember:async(c,id)=>{calls.push(['demote',c,id]);return {playerId:id,displayName:'Leyla',role:'member'};},...overrides};
  const c=createExperienceController({sdk,onChange:s=>states.push(s),onEvent:(...e)=>events.push(e),clanAdapter:r=>r.clans});
  t.after(()=>c.destroy());
  await c.start();c.navigate('members');await tick();calls.length=0;
  return {c,sdk,calls,events,state:()=>states.at(-1)};
}

test('kick is a bodyless DELETE with encoded IDs, Bearer auth and 204 → undefined',async t=>{
  const calls=recordingFetch(t,new Response(null,{status:204}));
  assert.equal(await social().kickClanMember('c/1','p 2'),undefined);
  assert.equal(calls[0].url,'https://social.test/api/v1/clans/c%2F1/members/p%202');
  assert.equal(calls[0].method,'DELETE');assert.equal(calls[0].body,undefined);assert.equal(calls[0].headers.Authorization,'Bearer token');
});
for(const action of ['promote','demote'])test(`${action} is a bodyless POST returning the MemberRole DTO`,async t=>{
  const dto={playerId:'p',displayName:'Leyla',role:'elder'};const calls=recordingFetch(t,jsonResponse(dto));
  assert.deepEqual(await social()[`${action}ClanMember`]('c','p'),dto);
  assert.equal(calls[0].url,`https://social.test/api/v1/clans/c/members/p/${action}`);assert.equal(calls[0].method,'POST');assert.equal(calls[0].body,undefined);
});
test('member operations retry one 401 with a fresh token and reject dot/empty IDs before any request',async t=>{
  const calls=recordingFetch(t,jsonResponse({error:{code:'token_expired',message:'Expired'}},401),new Response(null,{status:204}));
  const sdk=init({socialUrl:'https://social.test',getPlayerToken:({forceRefresh})=>forceRefresh?'fresh':'old'});
  await sdk.kickClanMember('c','p');assert.equal(calls.length,2);assert.equal(calls[1].headers.Authorization,'Bearer fresh');assert.equal(calls[1].method,'DELETE');
  for(const bad of ['','..','.',' '])assert.throws(()=>sdk.promoteClanMember('c',bad),/playerId/);
  assert.throws(()=>sdk.kickClanMember('..','p'),/clanId/);assert.equal(calls.length,2);
});
for(const [method,status,code]of [['kickClanMember',400,'cannot_kick_self'],['kickClanMember',403,'not_allowed'],['promoteClanMember',404,'member_not_found'],['demoteClanMember',409,'already_lowest_role']])
  test(`${method} preserves ${status} ${code} without retry`,async t=>{
    const calls=recordingFetch(t,jsonResponse({error:{code,message:'Server rejection'}},status));
    await assert.rejects(social()[method]('c','p'),e=>e.status===status&&e.code===code&&e.message==='Server rejection');assert.equal(calls.length,1);
  });

test('roleStep maps the renderer target role to one Social step, including legacy owner/member',()=>{
  const config={clan:{roles:[{id:'member'},{id:'elder'},{id:'co-leader'},{id:'leader'}]}};
  assert.equal(roleStep(config,'member','elder'),'promote');assert.equal(roleStep(config,'co-leader','elder'),'demote');
  assert.equal(roleStep(config,'member','co-leader'),null);assert.equal(roleStep(config,'elder','elder'),null);assert.equal(roleStep(config,'ghost','elder'),null);
  assert.equal(roleStep({},'member','leader'),'promote');assert.equal(roleStep(config,'owner','co-leader'),'demote');
});

test('opening Members re-reads own role and clan count alongside the roster',async t=>{
  let role='owner';const f=await fixture(t,{myClan:async()=>({clan:{...clan,memberCount:4},role})});
  role='elder';f.c.navigate('home');f.c.navigate('members');await tick();
  assert.equal(f.state().role,'elder');assert.equal(f.state().clan.memberCount,4);assert.equal(f.state().members.length,3);
});
test('kick removes the member only after 204, emits member-kicked and refreshes roster + role',async t=>{
  const pending=deferred();const f=await fixture(t,{kickClanMember:(...a)=>{f.calls.push(['kick',...a]);return pending.promise;}});
  f.sdk.clanMembers=async()=>({members:roster.slice(0,2)});
  const task=f.c.manageMember('kick','member-id');
  assert.deepEqual(f.state().memberPending,{action:'kick',id:'member-id'});assert.equal(f.state().members.length,3);
  pending.resolve();await task;
  assert.deepEqual(f.calls[0],['kick','clan-id','member-id']);assert.equal(f.state().memberPending,null);
  assert.deepEqual(f.state().members.map(m=>m.id),['owner-id','elder-id']);
  assert.deepEqual(f.events.filter(e=>e[0]==='member-kicked'),[['member-kicked',{clanId:'clan-id',playerId:'member-id'}]]);
  assert.ok(f.calls.some(c=>c==='myClan'));
});
test('promote/demote apply the server role and emit member-role-changed',async t=>{
  const f=await fixture(t);f.sdk.clanMembers=()=>new Promise(()=>{}); // keep the post-action refresh pending
  await Promise.race([f.c.manageMember('promote','member-id'),tick()]);
  assert.equal(f.state().members.find(m=>m.id==='member-id').role,'elder');
  assert.deepEqual(f.events.at(-1),['member-role-changed',{clanId:'clan-id',playerId:'member-id',role:'elder'}]);
});
test('one member action at a time; unknown members never reach Social',async t=>{
  const pending=deferred();let calls=0;const f=await fixture(t,{promoteClanMember:()=>{calls++;return pending.promise;}});
  const first=f.c.manageMember('promote','member-id');await f.c.manageMember('kick','elder-id');await f.c.manageMember('promote','member-id');await f.c.manageMember('kick','stranger');await f.c.manageMember('ban','member-id');
  assert.equal(calls,1);assert.ok(!f.calls.some(c=>c[0]==='kick'));pending.resolve({playerId:'member-id',role:'elder'});await first;
});
test('server rejection keeps the confirmed roster, shows its text and re-reads state',async t=>{
  const f=await fixture(t,{kickClanMember:async()=>{throw apiError(403,'not_allowed','Your clan role does not allow this');}});
  await f.c.manageMember('kick','elder-id');
  assert.equal(f.state().memberError,'Your clan role does not allow this');assert.equal(f.state().members.length,3);assert.equal(f.state().memberPending,null);
  assert.ok(f.calls.some(c=>c==='myClan'));assert.equal(f.events.filter(e=>e[0]==='member-kicked').length,0);
});
test('network failure keeps state and does not refetch or retry',async t=>{
  const f=await fixture(t,{demoteClanMember:async()=>{throw new TypeError('Failed to fetch');}});
  await f.c.manageMember('demote','elder-id');
  assert.equal(f.state().memberError,'Failed to fetch');assert.deepEqual(f.calls,[]);assert.equal(f.state().members.find(m=>m.id==='elder-id').role,'elder');
});
test('a late member response after being kicked, leaving or destroy cannot write state',async t=>{
  const pending=deferred();const f=await fixture(t,{promoteClanMember:()=>pending.promise});
  const task=f.c.manageMember('promote','member-id');f.c.invalidateClan('clan-id');
  pending.resolve({playerId:'member-id',role:'elder'});await task;
  assert.equal(f.state().clan,null);assert.deepEqual(f.state().members,[]);assert.equal(f.state().memberPending,null);assert.equal(f.events.filter(e=>e[0]==='member-role-changed').length,0);
  const late=deferred(),g=await fixture(t,{kickClanMember:()=>late.promise});const kick=g.c.manageMember('kick','member-id'),before=g.state();g.c.destroy();late.resolve();await kick;assert.equal(g.state(),before);
});
test('Members re-read showing the player is no longer in the clan returns to Discover',async t=>{
  let inClan=true;const f=await fixture(t,{myClan:async()=>{if(inClan)return {clan,role:'member'};throw apiError(404,'not_in_clan');}});
  inClan=false;f.c.navigate('home');f.c.navigate('members');await tick();await tick();
  assert.equal(f.state().clan,null);assert.equal(f.state().screen,'discover');
});

function friends(t,{members=[],extra={}}={}) {
  const states=[],calls=[];
  const sdk={getMyPlayer:async()=>player,listFriends:async()=>({friends:[friend]}),listFriendRequests:async()=>({incoming:[],outgoing:[]}),listBlocks:async()=>({blocks:[{id:'blocked-id',displayName:'B',since:'2026-11-10T08:00:00Z'}]}),
    sendFriendRequest:async input=>{calls.push(input);return {id:'req',player:{id:input.playerId,displayName:'X'},createdAt:'2026-11-10T08:00:00Z'};},...extra};
  const c=createFriendsController({sdk,onChange:s=>states.push(s),clanPlayers:()=>members,debounceMs:1});t.after(()=>c.destroy());
  return {c,calls,state:()=>states.at(-1)};
}
test('Members-panel Add friend sends to a confirmed clan member without a player search',async t=>{
  const f=friends(t,{members:['member-id',friend.id,'blocked-id',player.id]});f.c.setView(true,true);await tick();await tick();
  await f.c.action('send','member-id');assert.deepEqual(f.calls,[{playerId:'member-id'}]);
  for(const id of [friend.id,'blocked-id',player.id,'stranger'])await f.c.action('send',id);
  assert.equal(f.calls.length,1,'friends, blocked, self and non-members are not offered');
});
