// Synthetic Social/Realtime responses, real published UI and built SDK.
import {init} from '/src/index.js';
import {player,friend} from '/test/fixtures/social/friends.js';
import {currentConfig,sharedRoot,json,waitFor,type,sleep,deferred} from './helpers.js';

export function registerBlockTests({test,assert,container}) {
 const room={id:'block-dm',kind:'dm',clanId:null,members:[{id:player.id,name:player.displayName,online:true},{id:friend.id,name:friend.displayName,online:false}]};
 const history={messages:[{id:'block-message',senderId:friend.id,senderName:friend.displayName,body:'Existing direct message',createdAt:'2026-11-15T00:00:00Z'}],hasMore:false};
 const clickBlock=root=>{
  root.querySelector('.sk-friend-select').click();
  [...root.querySelectorAll('.sk-member-panel button')].find(b=>b.textContent==='Block').click();
  const confirm=[...root.querySelectorAll('.sk-member-panel [role="alertdialog"] button')].find(b=>b.textContent==='Block');
  confirm.click();confirm.click();
 };
 async function fixture(run,override,{blocked=false,chat=false}={}) {
  const oldFetch=window.fetch,oldSocket=window.WebSocket,handles=[],calls=[],sockets=[];
  const store={friends:blocked?[]:[friend],blocks:blocked?[friend]:[],rooms:blocked?[]:[room]};
  class Socket {constructor(){this.readyState=1;this.sent=[];sockets.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){this.closed=true;}frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:player.gameId,data})});}hello(){this.frame('hello',{playerId:player.id,configVersion:0});}}
  window.WebSocket=Socket;
  window.fetch=async(url,options)=>{
   calls.push({url,...options});const path=new URL(url).pathname;
   const value=override?.(path,options,store);if(value!==undefined)return value;
   if(path.endsWith('/players/me'))return json(player);
   if(path.endsWith('/players/me/blocks'))return json({blocks:store.blocks});
   if(path.endsWith('/friends'))return json({friends:store.friends});
   if(path.endsWith('/friends/requests'))return json({incoming:[],outgoing:[]});
   if(path.endsWith('/block')){
    if(options.method==='POST'){store.friends=[];store.blocks=[friend];store.rooms=[];}
    else store.blocks=[];
    return new Response(null,{status:204});
   }
   if(path==='/api/v1/players')return json({players:[{...friend,relation:store.blocks.length?'blocked':'none'}]});
   if(path.endsWith('/conversations'))return json({conversations:store.rooms});
   if(path.endsWith('/messages'))return json(history);
   throw new Error('Unexpected mock route '+path);
  };
  const sdk=init({socialUrl:'https://social.block.test',...(chat?{realtimeUrl:'https://realtime.block.test'}:{}),getPlayerToken:async()=> 'synthetic-block-token'});
  const mount=()=>{const config=currentConfig();config.clan.enabled=false;config.chat.enabled=chat;const target=container(),handle=sdk.mountExperience({container:target,config});handles.push(handle);return {target,handle,root:sharedRoot(target)};};
  try {await run({sdk,mount,store,calls,sockets,clickBlock});}
  finally {handles.forEach(h=>h.destroy());window.fetch=oldFetch;window.WebSocket=oldSocket;}
 }
 test('shared Block confirmation updates friends/blocked counts; Unblock does not restore friendship',()=>fixture(async({mount,calls,clickBlock})=>{
  const {root}=mount();await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));clickBlock(root);
  await waitFor(()=>root.querySelector('[data-key="blocked-toggle"]').textContent.includes('1'));
  assert(root.querySelector('.sk-section').textContent==='Friends · 0','Friend count stale');
  assert(!root.querySelector('[data-friend-action="remove"], [data-friend-refresh]')&&!root.textContent.includes('Refresh friends'),'Standalone actions rendered after Block');
  const posts=calls.filter(c=>c.method==='POST');assert(posts.length===1&&posts[0].url.endsWith(`/players/${friend.id}/block`)&&posts[0].body===undefined,'Wrong block request or duplicate');
  assert(posts[0].headers.Authorization==='Bearer synthetic-block-token','Player token not used');
  root.querySelector('[data-key="blocked-toggle"]').click();const unblock=root.querySelector('.sk-blocked-list button');unblock.click();unblock.click();
  await waitFor(()=>root.querySelector('[data-key="blocked-toggle"]').textContent.includes('0'));
  assert(root.querySelector('.sk-section').textContent==='Friends · 0'&&!root.querySelector('.sk-friend'),'Unblock restored old friendship');
  assert(calls.filter(c=>c.method==='DELETE').length===1,'Duplicate Unblock');
 }));
 test('blocked players hydrate after remount and blocked search results offer Unblock',()=>fixture(async({mount})=>{
  const first=mount();await waitFor(()=>first.root.querySelector('[data-key="blocked-toggle"]').textContent.includes('1'));first.handle.destroy();
  const {root}=mount();await waitFor(()=>root.querySelector('[data-key="blocked-toggle"]').textContent.includes('1'));
  root.querySelector('[data-key="blocked-toggle"]').click();assert(root.querySelector('.sk-blocked-list button').textContent.includes(friend.displayName),'Blocked identity missing');
  type(root,'player-search',friend.displayName);await waitFor(()=>root.querySelector('[data-friend-action="unblock"]'));
  root.querySelector('[data-friend-action="unblock"]').click();await waitFor(()=>root.querySelector('[data-friend-action="send"]'));
  assert(root.querySelector('[data-key="blocked-toggle"]').textContent.includes('0'),'Blocked count not refreshed after search Unblock');
 },undefined,{blocked:true}));
 for(const action of ['block','unblock'])test(`${action} failures stay readable without fake list/count changes`,()=>fixture(async({mount,clickBlock,calls})=>{
  const {root}=mount();await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)')||root.querySelector('[data-key="blocked-toggle"]').textContent.includes('1'));
  if(action==='block')clickBlock(root);else{root.querySelector('[data-key="blocked-toggle"]').click();root.querySelector('.sk-blocked-list button').click();}
  await waitFor(()=>root.textContent.includes('Synthetic '+action+' failed'));
  assert(root.querySelector('.sk-section').textContent===`Friends · ${action==='block'?1:0}`,'Failed action changed friend count');
  assert(root.querySelector('[data-key="blocked-toggle"]').textContent.includes(action==='block'?'0':'1'),'Failed action changed block count');
  assert(calls.filter(c=>c.url.endsWith('/block')&&c.method!=='GET').length===1,'Failed mutation retried');
 },path=>path.endsWith('/block')?json({error:{code:'unavailable',message:'Synthetic '+action+' failed'}},503):undefined,{blocked:action==='unblock'}));
 test('pending block stays guarded during realtime refresh and cannot update a destroyed widget',()=>{
  const pending=deferred();return fixture(async({mount,calls,clickBlock,store})=>{
   const {root,handle,target}=mount();await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));clickBlock(root);
   await sleep(10);assert(root.querySelector('.sk-friend-select').disabled,'Pending management enabled');
   void handle.refreshFriends();assert(calls.filter(c=>c.method==='POST').length===1,'Duplicate pending Block');
   handle.destroy();store.friends=[];store.blocks=[friend];pending.resolve(new Response(null,{status:204}));await sleep(30);
   assert(!sharedRoot(target),'Late block recreated UI');
  },(path,options)=>path.endsWith('/block')&&options.method==='POST'?pending.promise:undefined);
 });
 test('blocking clears an open DM/draft, ignores stale room events, and Unblock does not reopen it',()=>fixture(async({mount,sockets,clickBlock})=>{
  const wait=async(label,predicate)=>{try{await waitFor(predicate);}catch{throw new Error(`${label}: ${root.querySelector('.sk-content')?.textContent}`);}};
  const {root,handle}=mount();await waitFor(()=>sockets.length);sockets[0].hello();await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));
  const tab=name=>[...root.querySelectorAll('.sk-tab')].find(b=>b.textContent===name).click();
  tab('Chat');await wait('open DM',()=>root.textContent.includes('Existing direct message'));type(root,'message','Private unsent draft');
  tab('Friends');await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));clickBlock(root);
  await wait('block completion',()=>root.querySelector('[data-key="blocked-toggle"]').textContent.includes('1'));tab('Chat');
  assert(!root.querySelector('.sk-chip')&&!root.querySelector('[data-key="message"]'),'Blocked DM remained open');
  sockets[0].frame('conversation.added',{conversation:room});await sleep(20);assert(!root.querySelector('.sk-chip'),'Stale event restored blocked DM');
  tab('Friends');await waitFor(()=>!root.textContent.includes('Loading friends'));root.querySelector('[data-key="blocked-toggle"]').click();root.querySelector('.sk-blocked-list button').click();
  await wait('unblock completion',()=>root.querySelector('[data-key="blocked-toggle"]').textContent.includes('0'));tab('Chat');assert(!root.querySelector('.sk-chip'),'Unblock restored DM membership');
 },undefined,{chat:true}));
 test('reconnect refreshes blocked state while Chat is visible, using current server collections',()=>fixture(async({mount,store,sockets})=>{
  const {root,handle}=mount();await waitFor(()=>sockets.length);sockets[0].hello();await waitFor(()=>root.querySelector('.sk-friend-select:not(:disabled)'));
  [...root.querySelectorAll('.sk-tab')].find(b=>b.textContent==='Chat').click();await waitFor(()=>root.querySelector('[data-key="message"]'));
  store.friends=[];store.blocks=[friend];store.rooms=[];
  handle.reconnectChat();await waitFor(()=>sockets.length===2);sockets[1].hello();await waitFor(()=>!root.querySelector('.sk-chip'));
  [...root.querySelectorAll('.sk-tab')].find(b=>b.textContent==='Friends').click();await waitFor(()=>root.querySelector('[data-key="blocked-toggle"]').textContent.includes('1'));
  assert(root.querySelector('.sk-section').textContent==='Friends · 0','Reconnect kept stale friendship');
 },undefined,{chat:true}));
}
