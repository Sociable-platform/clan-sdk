// TEAM-257: synthetic Social responses, real published Members screen and built SDK.
import {player,friend} from '/test/fixtures/social/friends.js';
import {currentConfig,withSocial,json,clan,waitFor,button,deferred,sleep} from './helpers.js';

const memberId='5a2b3c4d-1111-4222-8333-944455556666';
const roles=[{id:'member',name:'Member'},{id:'elder',name:'Elder'},{id:'leader',name:'Leader',canPromote:true,canKick:true}];

export function registerClanManageTests({test,assert,container}) {
 async function fixture(run,{role='owner',gate,failure,requests}={}) {
  const store={members:[{playerId:player.id,displayName:player.displayName,role},{playerId:memberId,displayName:'Leyla',role:'member'},{playerId:friend.id,displayName:friend.displayName,role:'member'}],outgoing:[]};
  const sent={kick:0,promote:0,send:0,cancel:0};
  return withSocial(container,async(url,options)=>{
   const path=new URL(url).pathname,method=options?.method??'GET';
   if(path.endsWith('/players/me/clan'))return json({clan:{...clan,memberCount:store.members.length},role});
   if(path.endsWith('/players/me'))return json(player);
   if(path.endsWith('/players/me/blocks'))return json({blocks:[]});
   if(path==='/api/v1/friends')return json({friends:[{...friend,since:'2026-11-10T08:00:00Z'}]});
   if(path==='/api/v1/friends/requests'&&method==='GET')return json({incoming:[],outgoing:store.outgoing});
   if(path==='/api/v1/friends/requests'&&method==='POST'){sent.send++;const {playerId}=JSON.parse(options.body);store.outgoing=[{id:'req-1',player:{id:playerId,displayName:'Leyla'},createdAt:'2026-11-15T00:00:00Z'}];return json(store.outgoing[0],201);}
   if(path==='/api/v1/friends/requests/req-1'&&method==='DELETE'){sent.cancel++;store.outgoing=[];return new Response(null,{status:204});}
   if(path.endsWith('/members')&&method==='GET')return json({members:store.members});
   const target=path.match(/\/members\/([^/]+)(\/promote|\/demote)?$/);
   if(target){
    const id=decodeURIComponent(target[1]),action=target[2]?target[2].slice(1):'kick';sent[action]=(sent[action]??0)+1;
    if(gate)await gate.promise;
    if(failure)return json({error:{code:'not_allowed',message:failure}},403);
    if(action==='kick'){store.members=store.members.filter(m=>m.playerId!==id);return new Response(null,{status:204});}
    const m=store.members.find(x=>x.playerId===id);m.role=action==='promote'?'elder':'member';return json({playerId:id,displayName:m.displayName,role:m.role});
   }
   if(requests)return requests(path,options);
   throw new Error('Unexpected mock route '+method+' '+path);
  },async ctx=>{
   const mountMembers=async(config=currentConfig())=>{config.clan.roles??=roles;const out=ctx.mount(config);await waitFor(()=>out.root.querySelector('.sk-card-title'));out.handle.navigate('members');await waitFor(()=>out.root.querySelector(`[data-key="member-${memberId}"]`));return out;};
   await run({...ctx,store,sent,mountMembers});
  });
 }
 const open=(root,id=memberId)=>{const row=root.querySelector(`[data-key="member-${id}"]`);if(row.getAttribute('aria-expanded')!=='true')row.click();return root.querySelector('.sk-member-panel');};
 const pill=(root,id=memberId)=>root.querySelector(`[data-key="member-${id}"] .sk-role`)?.textContent;

 test('owner promotes then demotes one step via Social; role pill follows the server',()=>{const gate=deferred();return fixture(async({mountMembers,calls,sent})=>{
  const {root,target}=await mountMembers(),events=[];target.addEventListener('clan-sdk:member-role-changed',e=>events.push(e.detail));
  await waitFor(()=>button(open(root),'Promote to Elder'));const promote=button(open(root),'Promote to Elder');assert(!promote.disabled,'Promote disabled by SDK');promote.click();
  await waitFor(()=>sent.promote===1);await waitFor(()=>button(open(root),'Promote')?.disabled);assert(root.textContent.includes('Promoting member'),'Pending missing');button(open(root),'Promote')?.click();
  gate.resolve();await waitFor(()=>pill(root)==='Elder');assert(sent.promote===1,'Duplicate promote');
  const post=calls.find(c=>c.url.endsWith('/promote'));assert(post.method==='POST'&&post.body===undefined&&post.url.endsWith(`/clans/a%2Fb/members/${memberId}/promote`),'Wrong promote wire format');
  assert(events[0]?.playerId===memberId&&events[0].role==='elder','role event missing');
  await waitFor(()=>button(open(root),'Demote to Member')&&!button(open(root),'Demote to Member').disabled);button(open(root),'Demote to Member').click();await waitFor(()=>pill(root)==='Member');assert(calls.some(c=>c.url.endsWith('/demote')&&c.method==='POST'),'Demote not sent');
 },{gate});});

 test('owner Kick uses the shared confirmation, DELETEs once and removes the row',()=>fixture(async({mountMembers,calls,sent})=>{
  const {root,target}=await mountMembers(),events=[];target.addEventListener('clan-sdk:member-kicked',e=>events.push(e.detail));
  button(open(root),'Kick').click();const dialog=root.querySelector('.sk-member-panel [role="alertdialog"]');assert(dialog,'Kick confirmation absent');
  const confirm=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Kick');confirm.click();confirm.click();
  await waitFor(()=>!root.querySelector(`[data-key="member-${memberId}"]`));assert(sent.kick===1,'Duplicate kick');
  const del=calls.find(c=>c.method==='DELETE');assert(del.url.endsWith(`/clans/a%2Fb/members/${memberId}`)&&del.body===undefined,'Wrong kick wire format');
  assert(events[0]?.clanId===clan.id&&events[0].playerId===memberId,'kick event missing');
 }));

 test('a plain member gets no Promote/Demote/Kick, only the friend offer',()=>fixture(async({mountMembers})=>{
  const {root}=await mountMembers();const panel=open(root);
  await waitFor(()=>button(open(root),'Add Leyla as a friend'));assert(!button(panel,'Promote')&&!button(panel,'Demote')&&!button(panel,'Kick'),'Management offered to a member');
 },{role:'member'}));

 test('server rejection shows its text and keeps the member',()=>fixture(async({mountMembers})=>{
  const {root}=await mountMembers();button(open(root),'Kick').click();[...root.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Kick').click();
  await waitFor(()=>root.textContent.includes('Your clan role does not allow this'));assert(root.querySelector(`[data-key="member-${memberId}"]`),'Member removed on failure');
 },{failure:'Your clan role does not allow this'}));

 test('member-panel Add friend sends a request, turns into Cancel, and Cancel takes it back',()=>fixture(async({mountMembers,calls,sent})=>{
  const {root}=await mountMembers();await waitFor(()=>button(open(root),'Add Leyla as a friend')&&!button(open(root),'Add Leyla as a friend').disabled);
  button(open(root),'Add Leyla as a friend').click();await waitFor(()=>button(open(root),'Cancel friend request to Leyla'));
  const post=calls.find(c=>c.url.endsWith('/friends/requests')&&c.method==='POST');assert(JSON.parse(post.body).playerId===memberId&&sent.send===1,'Wrong friend request');
  await waitFor(()=>!button(open(root),'Cancel friend request to Leyla').disabled);button(open(root),'Cancel friend request to Leyla').click();
  await waitFor(()=>button(open(root),'Add Leyla as a friend'));assert(sent.cancel===1&&calls.some(c=>c.url.endsWith('/friends/requests/req-1')&&c.method==='DELETE'),'Cancel not sent');
  assert(open(root,friend.id).textContent.includes('are friends'),'Existing friend offered Add friend');
 }));

 test('destroy during a pending kick ignores the late answer',()=>{const gate=deferred();return fixture(async({mountMembers,sent})=>{
  const {root,handle,target}=await mountMembers();button(open(root),'Kick').click();[...root.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Kick').click();
  await waitFor(()=>sent.kick===1);handle.destroy();gate.resolve();await sleep(20);assert(!target.querySelector('[data-clan-ui]'),'Late kick restored DOM');
 },{gate});});
}
