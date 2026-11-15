// Mock browser integration. Wire fields follow confirmed Social contracts; this
// composite multi-player state and synthetic extra UUIDs are test-only.
import {player,friend,sent,incoming} from '/test/fixtures/social/friends.js';
import {currentConfig,sharedRoot,json,waitFor,type,deferred,sleep,withSocial} from './helpers.js';
export function registerFriendsTests({test,assert,container}) {
 const stranger={id:'22222222-2222-4222-8222-222222222222',displayName:'New Player',relation:'none'};
 const outgoing={...sent,id:'11111111-1111-4111-8111-111111111111',player:{id:stranger.id,displayName:stranger.displayName}};
 const config=()=>{const c=currentConfig();c.clan.enabled=false;return c;};
 const assertPlayerRow=(row,name,canChat)=>{
  const select=row.querySelector('.sk-friend-select');
  assert(select&&!select.hidden&&getComputedStyle(select).display!=='none','Player identity hidden');
  for(const selector of ['.sk-friend-name','.sk-avatar']){
   const node=select.querySelector(selector);
   assert(node&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0,`${selector} not visible`);
  }
  assert(select.querySelector('.sk-friend-name').textContent===name,'Wrong player name');
  if(canChat)assert(!select.disabled,'Shared friend management is disabled');
  else {select.click();assert(!row.querySelector('.sk-member-panel')&&select.disabled,'Non-friend opened friend management');}
  const chat=row.querySelector('.sk-friend-row > .sk-btn');
  assert(chat&&chat.hidden===!canChat,'Wrong Chat visibility');
 };
 async function fixture(run,override) {
  const store={friends:[friend],incoming:[incoming],outgoing:[outgoing],players:[stranger]};
  return withSocial(container,async(url,opt,calls)=>{
   if(override){const response=override(url,opt,calls,store);if(response!==undefined)return response;}
   const path=new URL(url).pathname;
   if(path.endsWith('/players/me'))return json(player);
   if(path.endsWith('/players/me/blocks'))return json({blocks:[]});
   if(path==='/api/v1/players')return json({players:store.players});
   if(opt.method==='GET'&&path.endsWith('/friends'))return json({friends:store.friends});
   if(opt.method==='GET'&&path.endsWith('/friends/requests'))return json({incoming:store.incoming,outgoing:store.outgoing});
   if(path.endsWith('/accept')){store.incoming=[];store.friends.push({id:incoming.player.id,displayName:incoming.player.displayName,since:friend.since});return json(store.friends.at(-1));}
   if(path.endsWith('/decline')){store.incoming=[];return new Response(null,{status:204});}
   if(opt.method==='DELETE'&&path.includes('/requests/')){store.outgoing=[];return new Response(null,{status:204});}
   if(opt.method==='DELETE'){store.friends=[];return new Response(null,{status:204});}
   if(opt.method==='POST'&&path.endsWith('/requests')){store.outgoing=[{...outgoing,player:{id:stranger.id,displayName:stranger.displayName}}];store.players=[{...stranger,relation:'request_sent',requestId:outgoing.id}];return json(store.outgoing[0],201);}
   throw new Error('Unexpected route '+path);
  },async context=>run({...context,store}));
 }
 test('Friends-only widget bootstraps/list maps Social IDs, both directions and no fabricated presence',()=>fixture(async({mount,calls})=>{
  const cfg=config();cfg.texts.labels.accept='Approve';cfg.texts.labels.cancel='Undo';const {root}=mount(cfg);await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));
  assert(calls[0].url.endsWith('/players/me')&&calls.length===4,'Wrong bootstrap/reads');assert(root.textContent.includes('Aysel')&&root.textContent.includes('Murad')&&root.textContent.includes('Request sent'),'Missing lists');assert(root.querySelector('[data-friend-action="accept"]').textContent==='Approve'&&root.querySelector('[data-friend-action="cancel"]').textContent==='Undo','Configured action labels ignored');assert(root.querySelector('[data-friend-action="accept"]').dataset.friendId===incoming.id,'Accept used player ID');assert(root.querySelector('[data-friend-action="cancel"]').dataset.friendId===outgoing.id,'Cancel used player ID');assert(root.querySelector('.sk-friend-select').dataset.key===`friend-${friend.id}`,'Wrong friend identity');assert(!root.querySelector('.sk-presence'),'Invented online state');assert(!root.textContent.includes('Friends service is unavailable'),'Old unavailable placeholder');
  assert(!root.querySelector('[data-friend-action="remove"], [data-friend-refresh]')&&!root.textContent.includes('Refresh friends'),'Standalone action added');
  assert(root.querySelector('.sk-friend').children.length===1&&!root.querySelector('.sk-member-panel'),'Closed menu leaves an extra row');
  assert(!root.querySelector('[data-sdk-status]'),'Empty status leaves extra spacing');
 }));
 test('Friends search sends debounced server q, Add sends Social playerId then refreshes requests/search',()=>fixture(async({mount,calls})=>{
  const {root}=mount(config());await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));type(root,'player-search','New & Player');await waitFor(()=>root.querySelector('[data-friend-action="send"]'));
  assertPlayerRow(root.querySelector('.sk-content > .sk-friend'),stranger.displayName,false);
  root.querySelector('[data-friend-action="send"]').click();await waitFor(()=>root.querySelector('[data-friend-action="cancel"]')&&!root.querySelector('[data-friend-action="send"]'));
  assertPlayerRow(root.querySelector('.sk-content > .sk-friend'),stranger.displayName,false);
  const post=calls.find(c=>c.method==='POST');assert(post.body===JSON.stringify({playerId:stranger.id}),'Wrong namespace/body');assert(calls.some(c=>c.url.endsWith('?q=New+%26+Player')),'Search query not encoded');assert(calls.filter(c=>c.url.endsWith('/friends/requests')&&c.method==='GET').length===2,'Requests not refreshed');
 }));
 test('Outgoing requests only offer Cancel while incoming requests offer Accept and Decline',()=>fixture(async({mount})=>{
  const {root}=mount(config());await waitFor(()=>root.querySelector('[data-friend-action="cancel"]'));
  const outgoingRow=root.querySelector('[data-friend-action="cancel"]').closest('.sk-row');
  const incomingRow=root.querySelector('[data-friend-action="accept"]').closest('.sk-row');
  assert(outgoingRow.querySelectorAll('button').length===1,'Outgoing request has recipient actions');
  assert(outgoingRow.querySelector('button').dataset.friendAction==='cancel','Missing sender Cancel');
  assert(incomingRow.querySelectorAll('button').length===2,'Incoming request has duplicate actions');
  assert(incomingRow.querySelector('[data-friend-action="accept"]')&&incomingRow.querySelector('[data-friend-action="decline"]'),'Missing recipient actions');
 }));
 test('Friends search keeps names/avatars visible for every relation and only friends can Chat',()=>fixture(async({mount,store})=>{
  store.players=[
   stranger,
   {id:friend.id,displayName:friend.displayName,relation:'friend'},
   {...stranger,id:incoming.player.id,displayName:incoming.player.displayName,relation:'request_received',requestId:incoming.id},
   {...stranger,id:'33333333-3333-4333-8333-333333333333',displayName:'Pending Player',relation:'request_sent',requestId:outgoing.id},
  ];
  const cfg=config();cfg.chat.enabled=true;cfg.chat.directMessages=true;
  const {root,handle}=mount(cfg);await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));
  assertPlayerRow(root.querySelector('.sk-content > .sk-friend'),friend.displayName,true);
  type(root,'player-search','server query');
  await waitFor(()=>root.querySelectorAll('.sk-content > .sk-friend').length===store.players.length);
  const rows=[...root.querySelectorAll('.sk-content > .sk-friend')];
  rows.forEach((row,index)=>{
   const p=store.players[index];assert(!row.hidden,'Server result hidden by local filter');
   assertPlayerRow(row,p.displayName,p.relation==='friend');
  });
  assert(rows[0].querySelector('[data-friend-action="send"]'),'Missing Add friend');
  assert(!rows[1].querySelector('[data-friend-action="remove"]')&&!rows[1].querySelector('.sk-friend-select').disabled,'Friend management missing or standalone Remove rendered');
  assert(rows[2].querySelector('[data-friend-action="accept"]')&&rows[2].querySelector('[data-friend-action="decline"]'),'Missing incoming request actions');
  assert(rows[3].querySelector('[data-friend-action="cancel"]'),'Missing outgoing request action');
  cfg.chat.directMessages=false;handle.updateConfig(cfg);
  root.querySelectorAll('.sk-content > .sk-friend').forEach(row=>{
   assert(!row.querySelector('.sk-friend-row > .sk-btn'),'Chat rendered with direct messages disabled');
   assert(row.querySelector('.sk-friend-name').getBoundingClientRect().width>0,'Disabling Chat hid player identity');
  });
 }));
 test('Friends Accept prevents duplicate clicks while pending and refetches shared lists',()=>{const pending=deferred();let posts=0;return fixture(async({mount,store,calls})=>{
  const {root}=mount(config());await waitFor(()=>root.querySelector('[data-friend-action="accept"]'));const accept=root.querySelector('[data-friend-action="accept"]');accept.click();accept.click();await waitFor(()=>posts===1);assert(root.querySelector('[data-friend-action="accept"]').disabled,'Pending Accept enabled');store.incoming=[];pending.resolve(json(friend));await waitFor(()=>!root.querySelector('[data-friend-action="accept"]'));assert(posts===1&&calls.filter(c=>c.url.endsWith('/friends')&&c.method==='GET').length===2,'Duplicate mutation or missing refetch');
 },(url,opt)=>{if(url.endsWith('/accept')){posts++;return pending.promise;}});});
 for(const action of ['decline','cancel'])test(`Friends ${action} uses its confirmed route and removes stale rows after refetch`,()=>fixture(async({mount,calls})=>{
  const {root}=mount(config());await waitFor(()=>root.querySelector(`[data-friend-action="${action}"]`));root.querySelector(`[data-friend-action="${action}"]`).click();await waitFor(()=>!root.querySelector(`[data-friend-action="${action}"]`));const call=calls.find(c=>c.method===(action==='decline'?'POST':'DELETE'));assert(call?.body===undefined,'Unexpected body');assert(call?.url.endsWith(action==='decline'?`/${incoming.id}/decline`:action==='cancel'?`/${outgoing.id}`:`/${friend.id}`),'Wrong ID/route');
 }));
 test('friend name/avatar menu offers Remove and Block; confirmed Remove refreshes counts without standalone controls',()=>fixture(async({mount,calls})=>{
  const cfg=config();cfg.chat.enabled=true;cfg.chat.directMessages=true;
  const {root}=mount(cfg);await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));
  const select=()=>root.querySelector('.sk-friend-select');
  select().querySelector('.sk-avatar').click();
  assert(root.querySelector('.sk-member-panel')&&[...root.querySelectorAll('.sk-member-panel button')].map(b=>b.textContent).join(',')==='Remove friend,Block','Menu actions missing');
  assert(root.querySelector('.sk-friend-row > .sk-btn')&&!root.querySelector('.sk-friend-row > .sk-btn').hidden,'Chat missing');
  select().querySelector('.sk-friend-name').click();
  assert(!root.querySelector('.sk-member-panel')&&root.querySelector('.sk-friend').children.length===1,'Closing menu leaves buttons or empty row');
  select().click();[...root.querySelectorAll('.sk-member-panel button')].find(b=>b.textContent==='Remove friend').click();
  const confirm=[...root.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Remove');confirm.click();confirm.click();
  await waitFor(()=>root.querySelector('.sk-section').textContent==='Friends · 0'&&!root.textContent.includes('Loading friends'));
  const writes=calls.filter(c=>c.method==='DELETE');
  assert(writes.length===1&&writes[0].url.endsWith(`/friends/${friend.id}`)&&writes[0].body===undefined,'Wrong/duplicate Remove request');
  assert(!root.querySelector('.sk-friend, .sk-member-panel, [data-friend-refresh]')&&root.querySelector('[data-key="player-search"]')&&root.querySelector('[data-key="blocked-toggle"]'),'Removed rows remain or persistent controls missing');
 }));
 test('returning to the visible game reloads friends/counts automatically and destroy removes that listener',()=>fixture(async({mount,store,calls})=>{
  const {root,handle}=mount(config());await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));
  store.friends=[];store.incoming=[];store.outgoing=[];
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(()=>root.textContent.includes('No friends or requests yet'));
  assert(root.querySelector('.sk-section').textContent==='Friends · 0'&&calls.filter(c=>c.url.endsWith('/friends')).length===2,'Foreground refresh missing');
  assert(!root.querySelector('[data-friend-refresh]'),'Manual refresh rendered');handle.destroy();const count=calls.length;
  document.dispatchEvent(new Event('visibilitychange'));await sleep(20);assert(calls.length===count,'Destroyed widget refreshed');
 }));
 test('Friends empty/error/Retry and server mutation rejection stay explicit',()=>{let fail=true;return fixture(async({mount,store})=>{
  store.friends=[];store.incoming=[];store.outgoing=[];const {root}=mount(config());await waitFor(()=>root.querySelector('[data-sdk-retry]'));assert(root.textContent.includes('Synthetic unavailable'),'Error hidden');fail=false;root.querySelector('[data-sdk-retry]').click();await waitFor(()=>root.textContent.includes('No friends or requests yet'));type(root,'player-search','New');await waitFor(()=>root.querySelector('[data-friend-action="send"]'));root.querySelector('[data-friend-action="send"]').click();await waitFor(()=>root.textContent.includes('Player unavailable'));assert(!root.textContent.includes('Request sent'),'Rejection became success');
 },(url,opt)=>{if(url.endsWith('/friends')&&fail)throw new TypeError('Synthetic unavailable');if(url.endsWith('/requests')&&opt.method==='POST')return json({error:{code:'player_not_found',message:'Player unavailable'}},404);});});
 test('Friends hidden/disabled config makes no requests until enabled; disabling ignores pending results',()=>{const pending=deferred();return fixture(async({mount,calls})=>{
  const cfg=config();cfg.friends.enabled=false;const {root,handle}=mount(cfg);await sleep(20);assert(calls.length===0,'Disabled Friends requested');cfg.friends.enabled=true;handle.updateConfig(cfg);[...root.querySelectorAll('.sk-tab')].find(el=>el.textContent==='Friends').click();await waitFor(()=>calls.length===4);cfg.friends.enabled=false;handle.updateConfig(cfg);pending.resolve(json({friends:[friend]}));await sleep(20);assert(!root.querySelector('[data-friend-action]'),'Disabled feature received late data');
 },(url)=>url.endsWith('/friends')?pending.promise:undefined);});
 test('Friends session reset clears old state/draft and rejects late responses; independent widget survives',()=>{const pending=deferred();let waiting=false,nextPlayer=false;return fixture(async({mount,sdk})=>{
  const a=mount(config()),b=mount(config());await waitFor(()=>a.root.querySelector('.sk-friend-select:not(:disabled)')&&b.root.querySelector('.sk-friend-select:not(:disabled)'));type(a.root,'player-search','old draft');waiting=true;const refresh=a.handle.refreshFriends();await sleep(10);nextPlayer=true;waiting=false;sdk.resetPlayerSession();pending.resolve(json({friends:[friend]}));await refresh;assert(a.root!==sharedRoot(a.target)&&b.root!==sharedRoot(b.target),'Session did not replace old UI roots');await waitFor(()=>sharedRoot(a.target).textContent.includes('No friends or requests yet'));assert((await sdk.getMyPlayer()).id===stranger.id,'Session retained the old player identity');assert(sharedRoot(a.target).querySelector('[data-key="player-search"]').value===''&&!sharedRoot(a.target).textContent.includes('Aysel'),'Old player draft/friends leaked');a.handle.destroy();assert(sharedRoot(b.target),'One widget destroy affected another');
 },url=>{
  if(nextPlayer&&url.endsWith('/players/me'))return json({...player,id:stranger.id,externalId:'second-game-account',displayName:'New account'});
  if(nextPlayer&&url.endsWith('/friends'))return json({friends:[]});
  if(nextPlayer&&url.endsWith('/friends/requests'))return json({incoming:[],outgoing:[]});
  return waiting&&url.endsWith('/friends')?pending.promise:undefined;
 });});
 test('Friends navigation/destroy cancels search timer and late load cannot recreate DOM',()=>{const pending=deferred();return fixture(async({mount,calls})=>{
  const {root,handle,target}=mount(config());await waitFor(()=>calls.length===4);type(root,'player-search','cancel search');handle.destroy();pending.resolve(json({friends:[friend]}));await sleep(300);assert(!sharedRoot(target)&&calls.length===4,'Destroyed widget leaked requests/DOM');
 },url=>url.endsWith('/friends')?pending.promise:undefined);});
 test('session reset cannot route detached old clan controls into the next player controllers',()=>withSocial(container,(url,opt)=>{
  if(url.endsWith('/players/me/clan'))return json({error:{code:'not_in_clan',message:'None'}},404);
  if(opt.method==='POST')return json({id:'unexpected',name:'Old draft',memberCount:1,maxMembers:10},201);
  return json({clans:[]});
 },async({mount,sdk,calls})=>{
  const {root,target}=mount(currentConfig());await waitFor(()=>root.textContent.includes('No clans found'));
  [...root.querySelectorAll('button')].find(el=>el.textContent.includes('Create')).click();type(root,'name','Old draft');
  const oldCreate=[...root.querySelectorAll('button')].find(el=>el.textContent==='Create clan');
  sdk.resetPlayerSession();await waitFor(()=>sharedRoot(target).textContent.includes('No clans found'));
  oldCreate.click();await sleep(20);assert(!calls.some(c=>c.method==='POST'),'Detached old UI acted as new player');
 }));
}
