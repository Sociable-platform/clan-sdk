// Opt-in real-service/browser verification. Credentials stay in this Node process
// and a no-store test endpoint, never the bundle, logs or a persisted artifact.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {init} from '../../dist/clan-sdk.esm.js';

const game=process.env.LIVE_BLOCK_GAME_ID,keyPath=process.env.LIVE_BLOCK_DEV_KEY;
if(!game||!keyPath)throw new Error('Set LIVE_BLOCK_GAME_ID and LIVE_BLOCK_DEV_KEY explicitly for local development services.');
const key=createPrivateKey(await readFile(keyPath)),tag='sdk-block-test-'+randomUUID();
const social=process.env.LIVE_BLOCK_SOCIAL_URL??'http://localhost:8082';
const realtime=process.env.LIVE_BLOCK_REALTIME_URL??'http://localhost:8083';
const origin='http://localhost:'+Number(process.env.LIVE_BLOCK_PORT??5174);
const token=role=>{
 const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url');
 const body=Buffer.from(JSON.stringify({sub:tag+'-'+role,gid:game,name:'SDK Block '+role+' '+tag.slice(-6),typ:'player',iat:now,exp:now+900})).toString('base64url');
 const input=head+'.'+body;return input+'.'+sign(null,Buffer.from(input),key).toString('base64url');
};
const clients=Object.fromEntries(['A','B'].map(role=>[role,init({socialUrl:social,realtimeUrl:realtime,getPlayerToken:async()=>token(role)})]));
const config=JSON.parse(await readFile(new URL('../browser/fixtures/platform-widget-v1.json',import.meta.url))).config;
config.clan.enabled=false;config.chat.clanChat=false;config.layout.startCollapsed=false;
const bundle=await readFile(new URL('../../dist/clan-sdk.esm.js',import.meta.url));
const html=`<!doctype html><meta charset="utf-8"><title>TEAM-250 live bundle check</title><div id="widget"></div><script type="module">
import {init} from '/dist/clan-sdk.esm.js';
const role=new URL(location.href).searchParams.get('player');
window.sdk=init({socialUrl:${JSON.stringify(social)},realtimeUrl:${JSON.stringify(realtime)},getPlayerToken:async()=>{const r=await fetch('/token?player='+role,{cache:'no-store'});return (await r.json()).token;}});
window.widget=sdk.mountExperience({container:document.querySelector('#widget'),config:${JSON.stringify(config)}});
window.root=()=>document.querySelector('[data-clan-ui]')?.shadowRoot;
</script>`;
const server=createServer((req,res)=>{
 const url=new URL(req.url,origin);
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/dist/clan-sdk.esm.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(bundle);return;}
 if(url.pathname==='/token'&&['A','B'].includes(url.searchParams.get('player'))){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({token:token(url.searchParams.get('player'))}));return;}
 if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 res.writeHead(404).end();
});
const pass=name=>console.log('PASS '+name);
const wait=async(fn)=>{for(let i=0;i<60;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Timed out waiting for live service state');};
let browser,a,b;
async function blockedSend(role,room) {
 const url=new URL(realtime+'/api/v1/ws');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('token',token(role));
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(url),timer=setTimeout(()=>{ws.close();reject(new Error('Realtime block check timed out'));},8000);
  ws.onerror=()=>{clearTimeout(timer);reject(new Error('Realtime test connection unavailable'));};
  ws.onmessage=event=>{const frame=JSON.parse(event.data);if(frame.type==='hello')ws.send(JSON.stringify({type:'message.send',id:'blocked-send',data:{conversationId:room,body:'TEAM-250 blocked message must be rejected'}}));
   if(frame.type==='error'&&frame.data.replyTo==='blocked-send'){clearTimeout(timer);ws.close();resolve(frame.data.code);}
   if(frame.type==='message.ack'){clearTimeout(timer);ws.close();reject(new Error('Backend accepted a blocked message'));}
  };
 });
}
try {
 [a,b]=await Promise.all([clients.A.getMyPlayer(),clients.B.getMyPlayer()]);
 assert.ok(a.externalId.startsWith(tag)&&b.externalId.startsWith(tag));
 const request=await clients.A.sendFriendRequest({playerId:b.id});await clients.B.acceptFriendRequest(request.id);
 let room;await wait(async()=>{room=(await clients.A.listConversations()).conversations.find(c=>c.kind==='dm'&&c.members.some(m=>m.id===b.id));return room;});
 pass('two new disposable players accepted friendship and received a real DM');
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(new URL(origin).port,'127.0.0.1',resolve);});
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});
 const pages=await Promise.all(['A','B'].map(async role=>{const page=await browser.newPage();await page.goto(origin+'/?player='+role);await page.waitForFunction(()=>window.root?.()?.querySelector('.sk-friend-select:not(:disabled)'));return page;}));
 const [pa,pb]=pages;
 for(const page of pages)assert.equal(await page.evaluate(()=>!root().querySelector('[data-friend-action="remove"], [data-friend-refresh], [data-sdk-status]')&&root().querySelector('.sk-friend').children.length===1),true);
 pass('compact Friends rows have no standalone Remove/Refresh controls or empty status row');
 const tab=async(page,name)=>page.evaluate(name=>[...root().querySelectorAll('.sk-tab')].find(b=>b.textContent===name).click(),name);
 const openDm=async(page,id)=>{
  await page.waitForFunction(id=>root().querySelector(`[data-key="convo-${id}"]`)||root().querySelector('[data-key="message"]'),id);
  const row=page.locator(`[data-key="convo-${id}"]`);if(await row.count())await row.click();
  await page.waitForFunction(()=>root().querySelector('[data-key="message"]')&&!root().textContent.includes('Loading messages'));
 };
 await tab(pa,'Chat');await tab(pb,'Chat');
 await openDm(pa,b.id);await openDm(pb,a.id);
 await pa.waitForFunction(()=>root().querySelector('[data-key="message"]')&&!root().textContent.includes('Loading messages'));
 const body='TEAM-250 live DM '+randomUUID();
 await pa.evaluate(body=>{const input=root().querySelector('[data-key="message"]');input.value=body;input.dispatchEvent(new Event('input',{bubbles:true}));root().querySelector('.sk-composer button').click();},body);
 await pb.waitForFunction(body=>root().querySelector('.sk-chat')?.textContent.includes(body),body);
 pass('built ESM rendered both players and delivered a real message over websocket');
 await tab(pa,'Friends');await pa.waitForFunction(()=>root().querySelector('.sk-friend-select:not(:disabled)'));
 await pa.evaluate(()=>{root().querySelector('.sk-friend-select').click();[...root().querySelectorAll('.sk-member-panel button')].find(b=>b.textContent==='Block').click();[...root().querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Block').click();});
 await pa.waitForFunction(()=>root().querySelector('[data-key="blocked-toggle"]')?.textContent.includes('1'));
 assert.equal((await clients.A.listBlocks()).blocks[0].id,b.id);
 assert.equal((await clients.A.listFriends()).friends.length,0);assert.equal((await clients.B.listFriends()).friends.length,0);
 await pb.waitForFunction(()=>!root().querySelector('.sk-convo, [data-conversation]')&&!root().querySelector('[data-key="message"]'));
 pass('shared Block action persisted; both friend lists and open remote DM updated');
 await pa.reload();await pa.waitForFunction(()=>root()?.querySelector('[data-key="blocked-toggle"]')?.textContent.includes('1'));
 assert.equal(await pa.evaluate(()=>root().querySelector('.sk-section').textContent),'Friends · 0');
 pass('blocked list/count survived browser reload');
 for(const role of ['A','B'])assert.ok(['blocked','not_member'].includes(await blockedSend(role,room.id)));
 pass('Realtime rejected message.send in both directions while blocked');
 await pa.evaluate(()=>{root().querySelector('[data-key="blocked-toggle"]').click();});
 await pa.waitForFunction(()=>root().querySelector('.sk-blocked-list button:not(:disabled)'));
 await pa.evaluate(()=>root().querySelector('.sk-blocked-list button').click());
 await pa.waitForFunction(()=>!root().querySelector('[data-key="blocked-toggle"]'));
 assert.equal((await clients.A.listFriends()).friends.length,0);assert.equal((await clients.A.listBlocks()).blocks.length,0);
 await tab(pa,'Chat');await pa.waitForFunction(()=>!root().querySelector('.sk-convo, [data-conversation]'));
 await pa.reload();await pa.waitForFunction(()=>root()?.textContent.includes('No friends or requests yet')&&!root().querySelector('[data-key="blocked-toggle"]'));
 assert.equal((await clients.A.listConversations()).conversations.some(c=>c.id===room.id),false);
 pass('shared Unblock persisted after reload without restoring friendship or DM membership');
 const again=await clients.A.sendFriendRequest({playerId:b.id});await clients.B.acceptFriendRequest(again.id);
 await wait(async()=> (await clients.A.listConversations()).conversations.some(c=>c.id===room.id));
 await tab(pa,'Chat');await openDm(pa,b.id);await pa.waitForFunction(body=>root().querySelector('.sk-chat')?.textContent.includes(body),body);
 pass('explicit re-friending restored the existing DM/history per backend contract');
 await tab(pa,'Friends');await pa.waitForFunction(()=>root().querySelector('.sk-friend-select:not(:disabled)'));
 await pa.evaluate(()=>{root().querySelector('.sk-friend-select .sk-avatar').click();[...root().querySelectorAll('.sk-member-panel button')].find(b=>b.textContent==='Remove friend').click();[...root().querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Remove').click();});
 await pa.waitForFunction(()=>root().querySelector('.sk-section').textContent==='Friends · 0'&&!root().textContent.includes('Loading friends'));
 await pb.waitForFunction(()=>!root().querySelector('.sk-convo, [data-conversation]'));
 assert.equal((await clients.A.listFriends()).friends.length,0);assert.equal((await clients.B.listFriends()).friends.length,0);
 pass('native Remove menu updates both friend lists/counts and removes the remote DM without manual refresh');
} catch(error) {
 // Browser/transport error strings may contain authenticated websocket URLs.
 console.error('FAIL live TEAM-250 check: '+(error.code??error.name??'verification_error'));process.exitCode=1;
} finally {
 await browser?.close();
 if(a&&b){try{
  await clients.A.unblockPlayer(b.id);await clients.B.unblockPlayer(a.id);
  if((await clients.A.listFriends()).friends.some(p=>p.id===b.id))await clients.A.removeFriend(b.id);
  for(const [client,other]of [[clients.A,b],[clients.B,a]])for(const r of (await client.listFriendRequests()).outgoing)if(r.player.id===other.id)await client.cancelFriendRequest(r.id);
  pass('only disposable pair relationships cleaned; no accounts or progress deleted');
 }catch{console.error('FAIL disposable pair cleanup');process.exitCode=1;}}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
