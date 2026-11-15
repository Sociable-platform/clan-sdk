// TEAM-257 opt-in real-service/browser verification: Members-panel promote,
// demote, kick and Add friend. Credentials stay in this Node process and a
// no-store test endpoint, never the bundle, logs or a persisted artifact.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {init} from '../../dist/clan-sdk.esm.js';

const game=process.env.LIVE_CLAN_GAME_ID,keyPath=process.env.LIVE_CLAN_DEV_KEY;
if(!game||!keyPath)throw new Error('Set LIVE_CLAN_GAME_ID and LIVE_CLAN_DEV_KEY explicitly for local development services.');
const key=createPrivateKey(await readFile(keyPath)),tag='sdk-clan-test-'+randomUUID();
const social=process.env.LIVE_CLAN_SOCIAL_URL??'http://localhost:8082';
const realtime=process.env.LIVE_CLAN_REALTIME_URL??'http://localhost:8083';
const origin='http://localhost:'+Number(process.env.LIVE_CLAN_PORT??5174);
const roles=['A','B','C'];
const token=role=>{
 const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url');
 const body=Buffer.from(JSON.stringify({sub:tag+'-'+role,gid:game,name:'SDK Clan '+role+' '+tag.slice(-6),typ:'player',iat:now,exp:now+900})).toString('base64url');
 const input=head+'.'+body;return input+'.'+sign(null,Buffer.from(input),key).toString('base64url');
};
const clients=Object.fromEntries(roles.map(role=>[role,init({socialUrl:social,realtimeUrl:realtime,getPlayerToken:async()=>token(role)})]));
const config=JSON.parse(await readFile(new URL('../browser/fixtures/platform-widget-v1.json',import.meta.url))).config;
config.clan.enabled=true;config.layout.startCollapsed=false;
const bundle=await readFile(new URL('../../dist/clan-sdk.esm.js',import.meta.url));
const page=widgetConfig=>`<!doctype html><meta charset="utf-8"><title>TEAM-257 live bundle check</title><div id="widget"></div><script type="module">
import {init} from '/dist/clan-sdk.esm.js';
const role=new URL(location.href).searchParams.get('player');
window.sdk=init({socialUrl:${JSON.stringify(social)},realtimeUrl:${JSON.stringify(realtime)},getPlayerToken:async()=>{const r=await fetch('/token?player='+role,{cache:'no-store'});return (await r.json()).token;}});
window.events=[];
window.widget=sdk.mountExperience({container:document.querySelector('#widget'),config:${JSON.stringify(widgetConfig)}});
for(const name of ['member-kicked','member-role-changed'])document.addEventListener('clan-sdk:'+name,e=>events.push([name,e.detail]));
window.root=()=>document.querySelector('[data-clan-ui]')?.shadowRoot;
</script>`;
let html=page(config);
const server=createServer((req,res)=>{
 const url=new URL(req.url,origin);
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/dist/clan-sdk.esm.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(bundle);return;}
 if(url.pathname==='/token'&&roles.includes(url.searchParams.get('player'))){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({token:token(url.searchParams.get('player'))}));return;}
 if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 res.writeHead(404).end();
});
const pass=name=>console.log('PASS '+name);
const wait=async fn=>{for(let i=0;i<60;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Timed out waiting for live service state');};
const role=async(client,clanId,id)=>(await client.clanMembers(clanId)).members.find(m=>m.playerId===id)?.role;
let browser,players={},clan;
try {
 for(const r of roles)players[r]=await clients[r].getMyPlayer();
 clan=await clients.A.createClan({name:'Mod '+tag.slice(-6)});
 await clients.B.joinClan(clan.id);await clients.C.joinClan(clan.id);
 const {role:ownerRole}=await clients.A.myClan(),base=await role(clients.A,clan.id,players.B.id);
 pass('three disposable players: A created a clan, B and C joined');

 // Promote needs a role between member and owner, i.e. published clan.roles.
 let promoted=null;
 try{promoted=(await clients.A.promoteClanMember(clan.id,players.B.id)).role;await clients.A.demoteClanMember(clan.id,players.B.id);}
 catch(error){if(error.status!==403)throw error;}
 if(promoted)config.clan.roles=[{id:base,name:'Base'},{id:promoted,name:'Promoted'},{id:ownerRole,name:'Owner',canPromote:true,canKick:true}];
 html=page(config);

 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(new URL(origin).port,'127.0.0.1',resolve);});
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});
 const [pa,pb]=await Promise.all(['A','B'].map(async r=>{const p=await browser.newPage();await p.goto(origin+'/?player='+r);await p.waitForFunction(()=>window.root?.()?.querySelector('.sk-card-title'));return p;}));
 const members=async()=>{await pa.evaluate(()=>widget.navigate('members'));};
 const openRow=(id)=>pa.evaluate(id=>{const row=root().querySelector(`[data-key="member-${id}"]`);if(row&&row.getAttribute('aria-expanded')!=='true')row.click();return Boolean(row);},id);
 const press=(id,label)=>pa.waitForFunction(({id,label})=>{const row=root().querySelector(`[data-key="member-${id}"]`);if(row?.getAttribute('aria-expanded')!=='true')row?.click();
   const b=[...root().querySelectorAll('.sk-member-panel button')].find(b=>(b.getAttribute('aria-label')??b.textContent).startsWith(label));if(!b||b.disabled)return false;b.click();return true;},{id,label});
 await members();await pa.waitForFunction(id=>root().querySelector(`[data-key="member-${id}"]`),players.C.id);

 if(promoted){
  await press(players.B.id,'Promote');await wait(async()=>await role(clients.A,clan.id,players.B.id)===promoted);
  await pa.waitForFunction(id=>root().querySelector(`[data-key="member-${id}"] .sk-role`)?.textContent==='Promoted',players.B.id);
  await press(players.B.id,'Demote');await wait(async()=>await role(clients.A,clan.id,players.B.id)===base);
  pass(`shared Promote/Demote moved B ${base} → ${promoted} → ${base} on Social and in the pill`);
 }else console.log('SKIP promote/demote: this game has no published clan.roles between member and owner (Social answers 403)');

 await press(players.C.id,'Add ');
 await wait(async()=>(await clients.C.listFriendRequests()).incoming.some(r=>r.player.id===players.A.id));
 await pa.waitForFunction(()=>[...root().querySelectorAll('.sk-member-panel button')].some(b=>b.getAttribute('aria-label')?.startsWith('Cancel friend request')));
 await press(players.C.id,'Cancel friend request');
 await wait(async()=>!(await clients.C.listFriendRequests()).incoming.some(r=>r.player.id===players.A.id));
 pass('member-panel Add friend sent a real request; Cancel took it back');

 await openRow(players.B.id);await press(players.B.id,'Kick');
 await pa.evaluate(()=>[...root().querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent==='Kick').click());
 await pa.waitForFunction(id=>!root().querySelector(`[data-key="member-${id}"]`),players.B.id);
 await assert.rejects(clients.B.myClan(),e=>e.status===404&&e.code==='not_in_clan');
 assert.ok((await pa.evaluate(()=>events)).some(([name,d])=>name==='member-kicked'&&d.playerId!=null));
 pass('shared Kick removed B on Social and from the roster');
 await pb.waitForFunction(()=>root()?.querySelector('[data-key="search"]')||!root()?.querySelector('.sk-card-title'));
 pass("B's open widget left the clan after the realtime clan_kicked notice");
 await pa.reload();await pa.waitForFunction(()=>window.root?.()?.querySelector('.sk-card-title'));await members();
 await pa.waitForFunction(id=>root().querySelector(`[data-key="member-${id}"]`),players.C.id);
 assert.equal(await openRow(players.B.id),false);
 pass('kick persisted after reload');
} catch(error) {
 // Browser/transport error strings may contain authenticated websocket URLs.
 console.error('FAIL live TEAM-257 check: '+(error.code??error.name??'verification_error'));process.exitCode=1;
} finally {
 await browser?.close();
 if(clan){try{
  for(const r of ['C','B','A'])try{if((await clients[r].myClan()).clan.id===clan.id)await clients[r].leaveClan(clan.id);}catch(e){if(e.status!==404)throw e;}
  for(const r of (await clients.A.listFriendRequests()).outgoing)if(r.player.id===players.C?.id)await clients.A.cancelFriendRequest(r.id);
  pass('disposable clan emptied (Social deletes it) and requests cleaned; no accounts or progress deleted');
 }catch{console.error('FAIL disposable clan cleanup');process.exitCode=1;}}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
