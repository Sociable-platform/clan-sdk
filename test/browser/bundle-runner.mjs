import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import * as publicApi from '../../src/index.js';

const root=new URL('../../',import.meta.url);
const liveFonts=process.env.BUNDLE_LIVE_FONTS==='1';
const {version}=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const expectedExports=[...Object.keys(publicApi),'version'].sort();
for(const name of ['clan-sdk.js','clan-sdk.esm.js']) {
  const body=await readFile(new URL(`dist/${name}`,root),'utf8');
  assert.ok(body.startsWith(`/*! Clan SDK v${version} */`),`${name}: package version banner missing`);
}

const server=spawn(process.execPath,['test/browser/server.js'],{
  cwd:fileURLToPath(root),env:{...process.env,BROWSER_TEST_BUNDLE:'1',BROWSER_TEST_PORT:'0'},stdio:['ignore','pipe','pipe'],
});
let browser;
try {
  const origin=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('HTTP test server did not start')),10000);
    let output='';
    server.stdout.on('data',data=>{
      output+=data;
      const match=output.match(/Browser tests: (http:\/\/127\.0\.0\.1:\d+)/);
      if(match){clearTimeout(timer);resolve(match[1]);}
    });
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',code=>{clearTimeout(timer);reject(new Error(`HTTP server exited: ${code}`));});
    server.stderr.on('data',data=>process.stderr.write(data));
  });
  // Prefer an installed Playwright browser, then installed Chrome/Edge. No
  // download or persistent browser profile is needed on developer machines.
  const channels=process.env.BROWSER_CHANNEL?[process.env.BROWSER_CHANNEL]:[undefined,'chrome','msedge'];
  const launchErrors=[];
  for(const channel of channels) {
    try {browser=await chromium.launch({channel,headless:true});break;}
    catch(error){launchErrors.push(error.message);}
  }
  if(!browser)throw new Error(`Install a browser with npx playwright install chromium or set BROWSER_CHANNEL.\n${launchErrors.join('\n')}`);
  await mkdir(new URL('test/browser/artifacts/',root),{recursive:true});
  for(const format of ['iife','esm']) {
    const context=await browser.newContext({viewport:{width:1000,height:760}});
    try {
      const page=await context.newPage(),requests=[],errors=[],blocked=[];
      const filename=format==='iife'?'clan-sdk.js':'clan-sdk.esm.js';
      const allowed=new Set([`/test/browser/bundle-${format}.html`,'/test/browser/bundle-checks.js',`/dist/${filename}`]);
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin===origin&&(allowed.has(url.pathname)||url.pathname.startsWith('/__bundle__/')))return route.continue();
        // Font network delivery is checked separately against Google. Keep the
        // bundle/service regression deterministic while asserting its font URL.
        if(url.origin==='https://fonts.googleapis.com'&&url.pathname==='/css2')return liveFonts?route.continue():route.fulfill({contentType:'text/css',body:''});
        if(liveFonts&&url.origin==='https://fonts.gstatic.com'&&route.request().resourceType()==='font')return route.continue();
        blocked.push(url.href);return route.abort();
      });
      page.on('request',request=>requests.push(new URL(request.url()).pathname));
      page.on('pageerror',error=>errors.push(error.message));
      page.on('requestfailed',request=>errors.push(`${request.url()}: ${request.failure()?.errorText}`));
      await page.goto(`${origin}/test/browser/bundle-${format}.html`);
      await page.waitForSelector('#summary[data-result]',{timeout:15000});
      assert.equal(await page.locator('#summary').getAttribute('data-result'),'passed',await page.locator('#summary').textContent());
      const result=await page.evaluate(()=>window.bundleResult);
      if(liveFonts){
        await page.waitForFunction(()=>Boolean(document.querySelector('link[data-clan-sdk-fonts]')?.sheet),{},{timeout:15000});
        const loaded=await page.evaluate(async()=>{
          await Promise.all([document.fonts.load('600 15px Bangers'),document.fonts.load('400 13px Silkscreen')]);
          return ['Bangers','Silkscreen'].every(family=>[...document.fonts].some(face=>face.family.replace(/['"]/g,'')===family&&face.status==='loaded'));
        });
        assert.equal(loaded,true,'Configured webfont files did not load');
        assert.ok(requests.some(path=>path.startsWith('/s/bangers/'))&&requests.some(path=>path.startsWith('/s/silkscreen/')),'Actual font files were not downloaded');
      }
      assert.equal(result.version,version);
      assert.deepEqual(result.exports,expectedExports);
      assert.deepEqual(blocked,[],'Unexpected external/source/style dependency');
      assert.deepEqual(errors,[],'Browser errors');
      assert.deepEqual(requests.filter(path=>path.startsWith('/dist/')),[`/dist/${filename}`]);
      for(const suffix of ['/platform/api/v1/public/games/bundle-test/widget-config','/social/api/v1/players/me/clan','/social/api/v1/clans','/realtime/api/v1/conversations']) {
        assert.ok(requests.includes(`/__bundle__${suffix}`),`Missing service request: ${suffix}`);
      }
      await page.screenshot({path:fileURLToPath(new URL(`test/browser/artifacts/bundle-${format}.png`,root))});
      console.log(`PASS ${filename}: classic/global or direct named import, version/API parity, styled visible panel (${result.width}x${result.height}), published fonts, token and service URLs; UI code/styles bundled (${liveFonts?'real Bangers/Silkscreen files loaded':'font CSS mocked'})`);
    } finally {await context.close();}
  }
  const page=await browser.newPage();
  const sourceRequests=[],errors=[];
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/src/'))sourceRequests.push(request.url());});
  page.on('pageerror',error=>errors.push(error.message));
  // Optional source-preview font requests are irrelevant to the renderer parity
  // fixtures; keep the regression run deterministic and independent of Google.
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.goto(`${origin}/?sdk=bundle`);
  await page.waitForSelector('#summary[data-result]',{timeout:120000});
  const summary=await page.locator('#summary').textContent();
  const failures=await page.locator('#results li').allTextContents();
  console.log(`${summary} against built ESM (mocked services; bundle-loading/regression tests, not live backend verification)`);
  assert.equal(await page.locator('#summary').getAttribute('data-result'),'passed',failures.filter(text=>text.startsWith('FAIL:')).join('\n'));
  assert.deepEqual(errors,[],'Regression browser errors');
  assert.deepEqual(sourceRequests,[],'Regression suite fetched SDK source');
} finally {
  await browser?.close();
  server.kill();
}
