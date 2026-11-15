// Explicit local-development browser check. No credentials are written or logged.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {init} from '../../dist/clan-sdk.esm.js';

const gameId=process.env.LIVE_BADGE_GAME_ID,keyPath=process.env.LIVE_BADGE_DEV_KEY;
if(!gameId||!keyPath)throw new Error('Set LIVE_BADGE_GAME_ID and LIVE_BADGE_DEV_KEY for local development services.');
const key=createPrivateKey(await readFile(keyPath)),externalId='sdk-badge-test-'+randomUUID(),name='SDK Badge '+randomUUID().slice(0,8);
const socialUrl=process.env.LIVE_BADGE_SOCIAL_URL??'http://localhost:8082',platformUrl=process.env.LIVE_BADGE_PLATFORM_URL??'http://localhost:8081';
const token=()=>{const now=Math.floor(Date.now()/1000),h=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({sub:externalId,gid:gameId,name:'SDK Badge Test',typ:'player',iat:now,exp:now+900})).toString('base64url'),p=h+'.'+b;return p+'.'+sign(null,Buffer.from(p),key).toString('base64url');};
const client=init({socialUrl,getPlayerToken:async()=>token()}),bundle=await readFile(new URL('../../dist/clan-sdk.js',import.meta.url));
const origin='http://localhost:'+Number(process.env.LIVE_BADGE_PORT??5174);
const html=`<!doctype html><title>Live saved badge verification</title><div id="widget"></div><script src="/sdk.js"></script><script>
window.sdk=ClanSDK.init({...${JSON.stringify({gameId,platformUrl,socialUrl})},getPlayerToken:async()=>{const r=await fetch('/token',{cache:'no-store'});return (await r.json()).token;}});
window.widget=sdk.mountExperience({container:document.querySelector('#widget')});window.root=()=>document.querySelector('[data-clan-ui]')?.shadowRoot;
</script>`;
const server=createServer((req,res)=>{
 const path=new URL(req.url,origin).pathname;res.setHeader('Cache-Control','no-store');
 if(path==='/sdk.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(bundle);return;}
 if(path==='/token'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({token:token()}));return;}
 if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 res.writeHead(404).end();
});
let browser;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(new URL(origin).port,'127.0.0.1',resolve);});
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});const page=await browser.newPage();
 // Real Platform/Social; Google delivery is covered by BUNDLE_LIVE_FONTS.
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.goto(origin);await page.evaluate(()=>widget.ready);
 await page.waitForFunction(()=>root()?.querySelector('.sk-btn-dashed'));
 await page.evaluate(()=>root().querySelector('.sk-btn-dashed').click());
 await page.locator('[data-key="name"]').fill(name);
 await page.locator('[data-key="badge-trigger"]').click();
 const choices=page.locator('[role="dialog"] [role="radio"]');assert.ok(await choices.count()>1,'Development game needs at least two allowed badges');
 const choice=choices.nth(1),badge=(await choice.getAttribute('data-key')).slice('badge-'.length),glyph=await choice.textContent();
 await choice.click();assert.equal(await page.locator('[role="dialog"]').count(),0);
 await page.locator('.sk-spacer.sk-actions button').last().click();
 await page.waitForFunction(()=>Boolean(root()?.querySelector('.sk-card-head .sk-badge')));
 const saved=await client.myClan();assert.equal(saved.clan.name,name);assert.equal(saved.clan.badge,badge);
 assert.equal(await page.locator('.sk-card-head .sk-badge').textContent(),glyph);assert.equal(await page.locator('.sk-card-head .sk-badge').isVisible(),true);
 console.log('PASS real published config + built classic SDK: selected non-default badge persisted in Social and rendered on Home');
 const list=await client.listClans({q:name});assert.equal(list.clans.find(c=>c.id===saved.clan.id).badge,badge);
 await page.reload();await page.evaluate(()=>widget.ready);await page.waitForFunction(()=>Boolean(root()?.querySelector('.sk-card-head .sk-badge')));
 assert.equal(await page.locator('.sk-card-head .sk-badge').textContent(),glyph);assert.equal(await page.locator('.sk-card-head .sk-badge').isVisible(),true);
 console.log('PASS real badge survived browser reload and appeared in the backend Discover response');
}catch(error){console.error('FAIL live badge verification: '+(error.code??error.name));process.exitCode=1;}
finally{
 await browser?.close();
 try{const current=await client.myClan();assert.equal(current.clan.name,name);await client.leaveClan(current.clan.id);console.log('PASS disposable test clan cleaned; existing accounts/progress untouched');}
 catch(error){if(error.code!=='not_in_clan'){console.error('FAIL disposable clan cleanup: '+(error.code??error.name));process.exitCode=1;}}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
