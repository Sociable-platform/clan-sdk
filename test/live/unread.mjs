// TEAM-264 opt-in real-service/browser verification: unread counts, the
// clan-sdk:unread event and conversation.read against local Social/Realtime.
// Credentials stay in this Node process and a no-store test endpoint, never the
// bundle, logs or a persisted artifact.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {init} from '../../dist/clan-sdk.esm.js';

const game=process.env.LIVE_UNREAD_GAME_ID,keyPath=process.env.LIVE_UNREAD_DEV_KEY;
if(!game||!keyPath)throw new Error('Set LIVE_UNREAD_GAME_ID and LIVE_UNREAD_DEV_KEY explicitly for local development services.');
const key=createPrivateKey(await readFile(keyPath)),tag='sdk-unread-test-'+randomUUID();
const social=process.env.LIVE_UNREAD_SOCIAL_URL??'http://localhost:8082';
const realtime=process.env.LIVE_UNREAD_REALTIME_URL??'http://localhost:8083';
const origin='http://localhost:'+Number(process.env.LIVE_UNREAD_PORT??5174);
const token=role=>{
 const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url');
 const body=Buffer.from(JSON.stringify({sub:tag+'-'+role,gid:game,name:'SDK Unread '+role+' '+tag.slice(-6),typ:'player',iat:now,exp:now+900})).toString('base64url');
 const input=head+'.'+body;return input+'.'+sign(null,Buffer.from(input),key).toString('base64url');
};
const clients=Object.fromEntries(['A','B'].map(role=>[role,init({socialUrl:social,realtimeUrl:realtime,getPlayerToken:async()=>token(role)})]));
const config=JSON.parse(await readFile(new URL('../browser/fixtures/platform-widget-v1.json',import.meta.url))).config;
config.clan.enabled=false;config.chat.clanChat=false;config.layout.startCollapsed=false;
const bundle=await readFile(new URL('../../dist/clan-sdk.esm.js',import.meta.url));
const html=`<!doctype html><meta charset="utf-8"><title>TEAM-264 live bundle check</title><div id="widget"></div><script type="module">
import {init} from '/dist/clan-sdk.esm.js';
const role=new URL(location.href).searchParams.get('player');
window.sdk=init({socialUrl:${JSON.stringify(social)},realtimeUrl:${JSON.stringify(realtime)},getPlayerToken:async()=>{const r=await fetch('/token?player='+role,{cache:'no-store'});return (await r.json()).token;}});
window.events=[];
document.querySelector('#widget').addEventListener('clan-sdk:unread',e=>events.push(e.detail));
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
const wait=async(fn,what='live service state')=>{for(let i=0;i<75;i++){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw new Error('Timed out waiting for '+what);};
let browser,players={},friends=false,step='setup';
try {
 for(const r of ['A','B'])players[r]=await clients[r].getMyPlayer();
 const sent=await clients.A.sendFriendRequest({playerId:players.B.id});await clients.B.acceptFriendRequest(sent.id);friends=true;
 // Realtime makes the DM from friend.accepted, asynchronously.
 const dm=async role=>(await clients[role].listConversations()).conversations.find(c=>c.kind==='dm'&&c.members.some(m=>m.id===players[role==='A'?'B':'A'].id));
 await wait(async()=>await dm('A')&&await dm('B'),'the DM conversation');
 const unreadOnServer=async()=>(await dm('A')).unread;
 pass('two disposable players became friends; Realtime made their DM');

 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(new URL(origin).port,'127.0.0.1',resolve);});
 // This server listens on 127.0.0.1; a dev server on [::1] with the same port must not answer for localhost.
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true,args:['--host-resolver-rules=MAP localhost 127.0.0.1']});
 const open=async role=>{step='open widget '+role;const p=await browser.newPage();await p.goto(origin+'/?player='+role);await p.waitForFunction(()=>window.root?.()?.querySelector('.sk-tabs'));return p;};
 const [pa,pb]=[await open('A'),await open('B')];
 const last=()=>pa.evaluate(()=>events.at(-1)??null);
 const tab=(p,name)=>p.evaluate(name=>[...root().querySelectorAll('.sk-tab')].find(b=>b.textContent.startsWith(name)).click(),name);
 const openConvo=(p,id)=>(step='open the DM',p).waitForFunction(id=>{const row=root().querySelector(`[data-key="convo-${id}"]`);if(!row)return false;row.click();return Boolean(root().querySelector('[data-key="message"]'));},id);
 // B types and presses Send until Realtime has the message: Send is enabled only after the widget sees the draft,
 // and the game's published config may have slow mode (Realtime answers slow_mode and the draft stays).
 const delivered=async text=>(await clients.B.listMessages((await dm('B')).id)).messages.some(m=>m.body===text);
 const say=async text=>{
  step='B sends '+text;
  for(let i=0;i<60;i++){
   await pb.evaluate(text=>{const input=root().querySelector('[data-key="message"]');if(input.value!==text){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));return;}
    const button=root().querySelector('.sk-composer button');if(!button.disabled)button.click();},text);
   await new Promise(r=>setTimeout(r,500));
   if(await delivered(text))return;
  }
  throw new Error('Timed out waiting for B to send');
 };
 const chatBadge=()=>pa.evaluate(()=>[...root().querySelectorAll('.sk-tab')].find(b=>b.textContent.startsWith('Chat'))?.querySelector('.sk-badge-count')?.textContent??null);

 // B opens the DM and writes while A is on another tab.
 await tab(pb,'Chat');await openConvo(pb,players.A.id);
 step='first clan-sdk:unread';await pa.waitForFunction(()=>events.length>0);
 assert.equal((await last()).total,0);
 await say('first unread');
 step='count 1 after first message';await pa.waitForFunction(id=>events.at(-1)?.direct?.[id]===1,players.B.id);
 assert.deepEqual(await last(),{total:1,requests:0,clan:0,direct:{[players.B.id]:1}});
 assert.equal(await chatBadge(),'1');
 assert.equal(await unreadOnServer(),1);
 pass('a message from B while A is elsewhere: Chat tab badge 1, clan-sdk:unread total 1, Realtime unread 1');

 // Hidden container: still counted, nothing read.
 await pa.evaluate(()=>{document.querySelector('#widget').style.display='none';});
 await say('second unread');
 await pa.waitForFunction(id=>events.at(-1)?.direct?.[id]===2,players.B.id);
 assert.equal(await unreadOnServer(),2);
 await pa.evaluate(()=>{document.querySelector('#widget').style.display='';});
 pass('while A hides the widget, the next message counts too (2) and is not read');

 // Opening the conversation reads it on Realtime.
 await tab(pa,'Chat');await openConvo(pa,players.B.id);
 await pa.waitForFunction(()=>events.at(-1)?.total===0);
 await wait(async()=>await unreadOnServer()===0,'Realtime to store the read');
 assert.equal(await chatBadge(),null);
 pass('opening the DM sends conversation.read: event total 0, no badge, Realtime unread 0');

 // With the DM open but the container hidden, a new message waits until shown.
 await pa.evaluate(()=>{document.querySelector('#widget').style.display='none';});
 await say('while hidden');
 await pa.waitForFunction(id=>events.at(-1)?.direct?.[id]===1,players.B.id);
 await new Promise(r=>setTimeout(r,500));
 assert.equal(await unreadOnServer(),1);
 await pa.evaluate(()=>{document.querySelector('#widget').style.display='';});
 await pa.waitForFunction(()=>events.at(-1)?.total===0);
 await wait(async()=>await unreadOnServer()===0,'Realtime to store the read after showing');
 pass('open DM in a hidden widget: counted and not read until the widget is shown again, then read');

 // Read positions live on the server.
 await pa.reload();await pa.waitForFunction(()=>window.root?.()?.querySelector('.sk-tabs')&&events.length>0);
 assert.equal((await last()).total,0);
 await say('after reload');
 await pa.waitForFunction(id=>events.at(-1)?.direct?.[id]===1,players.B.id);
 pass('after a reload A starts at 0 (server read position), and a new message counts 1');
} catch(error) {
 // Browser/transport error strings may contain authenticated websocket URLs.
 console.error('FAIL live TEAM-264 check at "'+step+'": '+(error.code??error.name??'verification_error')+(error instanceof assert.AssertionError||/^Timed out waiting for [a-zA-Z .]+$/.test(error.message)?' '+error.message:''));process.exitCode=1;
} finally {
 await browser?.close();
 if(friends){try{await clients.A.removeFriend(players.B.id);pass('disposable friendship removed; no accounts deleted');}catch{console.error('FAIL disposable friendship cleanup');process.exitCode=1;}}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
