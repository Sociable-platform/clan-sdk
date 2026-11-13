import {currentConfig,withSocial,json,clan,noClan,waitFor,button,deferred,sleep} from './helpers.js';
const leaveButton=root=>{if(!button(root,'Leave'))button(root,'Show clan info')?.click();return button(root,'Leave');};
export function registerLeaveTests({test,assert,container}) {
 async function fixture(run,{failure=false}={}) {
  let inClan=true,posts=0;const pending=deferred();
  return withSocial(container,(url,opt)=>{
   if(url.endsWith('/leave')){posts++;return pending.promise.then(()=>{if(failure)return json({error:{code:'origin_not_allowed',message:'Origin rejected'}},403);inClan=false;return new Response(null,{status:204});});}
   if(url.endsWith('/players/me/clan'))return inClan?json({clan,role:'owner'}):noClan();
   if(url.endsWith('/members'))return json({members:[{playerId:'p',displayName:'Member',role:'owner'}]});
   return json({clans:[]});
  },async ctx=>run({...ctx,pending,posts:()=>posts}));
 }
 test('shared Leave confirmation calls actual SDK, shows pending, clears membership and opens Discover',()=>fixture(async({mount,pending,posts,calls})=>{
  const {root,target}=mount();await waitFor(()=>root.querySelector('.sk-card-title'));const events=[];target.addEventListener('clan-sdk:left',e=>events.push(e.detail));
  leaveButton(root).click();const dialog=root.querySelector('[role="alertdialog"]');assert(dialog,'Shared confirmation absent');button(dialog,'Leave').click();
  await waitFor(()=>posts()===1);assert(root.textContent.includes('Leaving clan'),'Pending missing');leaveButton(root);await waitFor(()=>leaveButton(root).disabled);leaveButton(root).click();pending.resolve();
  await waitFor(()=>root.querySelector('[data-key="search"]')&&root.textContent.includes('No clans found'));assert(posts()===1&&events[0].clanId===clan.id,'Duplicate/event wrong');assert(calls.find(c=>c.url.endsWith('/leave')).url.endsWith('/clans/a%2Fb/leave'),'Wrong leave route');
 }));
 test('failed shared Leave shows server error and preserves owner membership',()=>fixture(async({mount,pending,posts})=>{
  const {root}=mount();await waitFor(()=>root.querySelector('.sk-card-title'));leaveButton(root).click();button(root.querySelector('[role="alertdialog"]'),'Leave').click();await waitFor(()=>posts());pending.resolve();await waitFor(()=>root.textContent.includes('Origin rejected'));assert(root.querySelector('.sk-card-title').textContent.includes(clan.name),'Membership cleared on failure');assert(!leaveButton(root).disabled,'Retry unavailable');
 },{failure:true}));
 test('destroy/reset during leave ignores old completion and detached shared action',()=>fixture(async({mount,pending,sdk,posts})=>{
  const a=mount();await waitFor(()=>a.root.querySelector('.sk-card-title'));leaveButton(a.root).click();const old=button(a.root.querySelector('[role="alertdialog"]'),'Leave');old.click();await waitFor(()=>posts());a.handle.destroy();pending.resolve();await sleep(20);assert(!a.target.querySelector('[data-clan-ui]'),'Late leave restored DOM');
  const b=mount();await waitFor(()=>b.root.querySelector('[data-key="search"]'));sdk.resetPlayerSession();old.click();await sleep(20);assert(posts()===1,'Detached old action reached new session');
 }));
}
