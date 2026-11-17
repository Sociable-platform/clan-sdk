// TEAM-294: when a player joins, leaves or is removed from the clan, every member online sees the new member count
// without opening Members. Realtime's member line in the clan chat is the signal; the clan is then read again.
// Identities and data are synthetic.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatController} from '../src/chat/controller.js';
import {createExperienceController} from '../src/experience/shared-controller.js';

const DELAY=5;
const wait=(ms=DELAY*4)=>new Promise(done=>setTimeout(done,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const apiError=(status,code)=>Object.assign(new Error('Server rejection'),{status,code});
const clanOf=memberCount=>({id:'clan-id',name:'Wolves',memberCount,maxMembers:10});
const roster=n=>Array.from({length:n},(_,i)=>({playerId:`p${i}`,displayName:`Player ${i}`,role:i?'member':'owner',joinedAt:'2026-11-07T17:30:00Z'}));

// The clan side: a Social API whose member count the test moves, and the controller reading it.
async function clanWorld(t,{screen='home'}={}) {
  const states=[],calls=[];
  const server={count:3,myClan:null};
  const sdk={
    myClan:()=>{calls.push('myClan');return server.myClan?server.myClan():Promise.resolve({clan:clanOf(server.count),role:'member'});},
    clanMembers:async()=>{calls.push('clanMembers');return {members:roster(server.count)};},
    listClans:async()=>({clans:[]}),
  };
  const c=createExperienceController({sdk,onChange:s=>states.push(s),onEvent:()=>{},clanAdapter:r=>r.clans,rosterDelay:DELAY});
  t.after(()=>c.destroy());
  await c.start();
  if(screen==='members'){c.navigate('members');await wait();}
  calls.length=0;states.length=0;
  return {c,server,calls,states,state:()=>states.at(-1)};
}

test('a member change reads the clan again, so the banner shows the new count',async t=>{
  const w=await clanWorld(t);
  w.server.count=4;w.c.rosterChanged('clan-id');
  assert.deepEqual(w.calls,[],'it waits a moment, for changes that come together');
  await wait();
  assert.deepEqual(w.calls,['myClan']);
  assert.equal(w.state().clan.memberCount,4);
  assert.equal(w.state().screen,'home');
  // In the background: no loading state and no error on the way.
  assert.ok(w.states.every(s=>!s.profilePending&&s.error===''));
});

test('a leave lowers the count the same way',async t=>{
  const w=await clanWorld(t);
  w.server.count=2;w.c.rosterChanged('clan-id');await wait();
  assert.equal(w.state().clan.memberCount,2);
});

test('several changes close together cause one read',async t=>{
  const w=await clanWorld(t);
  for(let i=0;i<5;i++){w.server.count++;w.c.rosterChanged('clan-id');}
  await wait();
  assert.deepEqual(w.calls,['myClan']);
  assert.equal(w.state().clan.memberCount,8);
});

test('a change during a read is not lost: one more read follows it',async t=>{
  const w=await clanWorld(t),first=deferred();
  w.server.myClan=()=>first.promise;
  w.c.rosterChanged('clan-id');await wait();
  assert.deepEqual(w.calls,['myClan']);
  // Another player joins while the first read is on its way; that read answers with the count before them.
  w.server.myClan=null;w.server.count=5;w.c.rosterChanged('clan-id');w.c.rosterChanged('clan-id');
  first.resolve({clan:clanOf(4),role:'member'});await wait();
  assert.deepEqual(w.calls,['myClan','myClan']);
  assert.equal(w.state().clan.memberCount,5);
});

test('on Members, the member list is read again too',async t=>{
  const w=await clanWorld(t,{screen:'members'});
  w.server.count=4;w.c.rosterChanged('clan-id');await wait();
  assert.deepEqual([...w.calls].sort(),['clanMembers','myClan']);
  assert.equal(w.state().members.length,4);
  assert.equal(w.state().clan.memberCount,4);
});

test('a change in another clan, or with no clan, reads nothing',async t=>{
  const w=await clanWorld(t);
  w.c.rosterChanged('other-clan');w.c.rosterChanged(undefined);await wait();
  assert.deepEqual(w.calls,[]);
});

test('a failed read keeps the last count and shows no error, on Home and on Members',async t=>{
  for(const screen of ['home','members']){
    const w=await clanWorld(t,{screen});
    w.server.myClan=()=>Promise.reject(apiError(503,'unavailable'));
    w.c.rosterChanged('clan-id');await wait();
    assert.ok(w.states.every(s=>s.clan.memberCount===3&&s.error===''),screen);
  }
});

test('a read that finds the player is no longer in the clan moves the panel on',async t=>{
  const w=await clanWorld(t);
  w.server.myClan=()=>Promise.reject(apiError(404,'not_in_clan'));
  w.c.rosterChanged('clan-id');await wait();
  assert.equal(w.state().clan,null);
  assert.equal(w.state().screen,'discover');
});

test('while the player\'s own clan read is running, the roster read waits for it, then goes',async t=>{
  const w=await clanWorld(t),own=deferred();
  w.server.myClan=()=>own.promise;
  void w.c.refreshMembership();
  w.server.myClan=null;w.server.count=6;w.c.rosterChanged('clan-id');await wait();
  assert.deepEqual(w.calls,['myClan'],'only the player\'s own read so far');
  own.resolve({clan:clanOf(5),role:'member'});await wait();
  assert.deepEqual(w.calls,['myClan','myClan']);
  assert.equal(w.state().clan.memberCount,6);
});

test('nothing is read after the panel is closed',async t=>{
  const w=await clanWorld(t);
  w.c.rosterChanged('clan-id');w.c.destroy();await wait();
  assert.deepEqual(w.calls,[]);
});

// The chat side: which Realtime messages say the clan's members changed.
const config={clan:{enabled:true},chat:{enabled:true,clanChat:true,directMessages:true,maxMessageLength:300}};
const clanRoom={id:'room-clan',kind:'clan',clanId:'social-clan',members:[{id:'me',name:'Me',online:true}],lastMessage:null,unread:0};
const dmRoom={...clanRoom,id:'room-dm',kind:'dm',clanId:null,members:[{id:'me',name:'Me',online:true},{id:'peer',name:'Peer',online:false}]};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const message=(id,kind,senderId='peer')=>({id,kind,senderId,senderName:'Peer',body:kind==='text'?'hi':'',createdAt:'2026-11-17T10:00:00Z'});

async function chatWorld(t) {
  const sockets=[],events=[];
  const client={acquire:async()=>({token:'test-token',version:1}),socketUrl:()=> 'ws://test.invalid',listConversations:async()=>({conversations:[clanRoom,dmRoom]}),listMessages:async()=>({messages:[],hasMore:false})};
  const c=createChatController({client,onChange:()=>{},onMembership:e=>events.push(e),socketFactory:()=>{const s={readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw));},close(){},frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:'game',data})});}};sockets.push(s);return s;}});
  t.after(()=>c.destroy());c.configure(config,'social-clan');await settle();
  sockets[0].frame('hello',{playerId:'me',configVersion:0,onlineFriends:[]});await settle();
  events.length=0;
  const send=(conversationId,m)=>sockets[0].frame('message.new',{conversationId,message:m});
  return {send,rosterEvents:()=>events.filter(e=>e.kind==='roster')};
}

for(const kind of ['member_joined','member_left','member_kicked'])test(`a ${kind} line in the clan chat says the clan's members changed`,async t=>{
  const w=await chatWorld(t);
  w.send(clanRoom.id,message('m1',kind));
  assert.deepEqual(w.rosterEvents(),[{kind:'roster',clanId:'social-clan'}]);
});

test('the player\'s own join line says so too, for their other tabs',async t=>{
  const w=await chatWorld(t);
  w.send(clanRoom.id,message('m1','member_joined','me'));
  assert.deepEqual(w.rosterEvents(),[{kind:'roster',clanId:'social-clan'}]);
});

test('a written message, a kind the SDK does not know, or a direct message does not',async t=>{
  const w=await chatWorld(t);
  w.send(clanRoom.id,message('m1','text'));
  w.send(clanRoom.id,{...message('m2','text'),kind:undefined});
  w.send(clanRoom.id,message('m3','member_promoted'));
  w.send(dmRoom.id,message('m4','member_joined'));
  w.send('room-unknown',message('m5','member_joined'));
  assert.deepEqual(w.rosterEvents(),[]);
});
