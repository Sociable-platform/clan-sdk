// Development-only server. Its provisional HTTP config mock is never in src.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, sep } from 'node:path';
import { handleDevConfigRequest } from '../dev-config-endpoint.js';
import { handleDevDiscoverRequest } from '../dev-discover-endpoint.js';
import {installedUiPackage,uiPackageHandler} from './ui-package.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ui=await installedUiPackage();
const handleUi=uiPackageHandler(ui);
// Run the existing regression pages against the distribution without changing
// their source-mode imports or the separate dashboard-renderer comparison.
const bundleMode=process.env.BROWSER_TEST_BUNDLE==='1';
const bundleConfig=JSON.parse(await readFile(new URL('./fixtures/platform-widget-v1.json',import.meta.url),'utf8'));
bundleConfig.config.theme.colors.background='#123456';
bundleConfig.config.theme.fonts.heading.family='Bangers';
bundleConfig.config.theme.fonts.body.family='Silkscreen';
bundleConfig.config.friends.enabled=false;
bundleConfig.config.chat.enabled=false;
const liveChat=process.env.LIVE_CHAT_TEST==='1'?await (await import('../live/chat-fixture.js')).prepareLiveChat():null;
const liveLeave=process.env.LIVE_LEAVE_TEST==='1'?await (await import('../live/leave-fixture.js')).prepareLiveLeave():null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/__bundle__/')) {
      const auth=req.headers.authorization==='Bearer bundle-test-token';
      const body=url.pathname==='/__bundle__/platform/api/v1/public/games/bundle-test/widget-config'?bundleConfig
        :!auth?{error:{code:'unauthorized',message:'Synthetic token required'}}
        :url.pathname==='/__bundle__/social/api/v1/players/me/clan'?{error:{code:'not_in_clan',message:'Synthetic player has no clan'}}
        :url.pathname==='/__bundle__/social/api/v1/clans'?{clans:[]}
        :url.pathname==='/__bundle__/realtime/api/v1/conversations'?{conversations:[]}:null;
      const status=!body?404:body.error?.code==='unauthorized'?401:body.error?404:200;
      res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(body));return;
    }
    if(liveChat?.handle(req,res,url))return;
    if(liveLeave?.handle(req,res,url))return;
    if (handleDevConfigRequest(req, res, url)) return;
    if (handleDevDiscoverRequest(req, res, url)) return;
    const pathname = decodeURIComponent(url.pathname);
    if(await handleUi(req,res,url))return;
    const requested = pathname === '/' ? '/test/browser/index.html'
      : ['/preview', '/preview/'].includes(pathname) ? '/preview/index.html'
      : ['/preview/discover', '/preview/discover/'].includes(pathname) ? '/preview/discover/index.html' : pathname;
    const target = resolve(root, `.${requested}`);
    const local = relative(root, target);
    if (req.method !== 'GET' || local.startsWith(`..${sep}`) || local === '..'
        || !(local.startsWith(`src${sep}`) || local.startsWith(`dist${sep}`) || local.startsWith(`test${sep}browser${sep}`) || local.startsWith(`preview${sep}`)
          || local === ['test', 'fixtures', 'config', 'complete-experience-v1.json'].join(sep)
          || local === ['test','fixtures','social','friends.js'].join(sep))) {
      res.writeHead(404).end();
      return;
    }
    let body = await readFile(target);
    if(bundleMode && extname(target)==='.js' && (local.startsWith(`test${sep}browser${sep}`)||local.startsWith(`preview${sep}`))) {
      body=body.toString().replaceAll('/src/index.js','/dist/clan-sdk.esm.js').replaceAll('../../src/index.js','/dist/clan-sdk.esm.js');
    }
    res.writeHead(200, { 'Content-Type': `${types[extname(target)] ?? 'text/plain'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(Number(process.env.BROWSER_TEST_PORT ?? 5174), '127.0.0.1', () => {
  console.log(`Shared renderer: installed @clan/ui ${ui.version}`);
  console.log(`SDK under test: ${bundleMode?'dist/clan-sdk.esm.js':'src/index.js'}`);
  console.log(`Browser tests: http://127.0.0.1:${server.address().port}/`);
  console.log(`Temporary UI preview: http://127.0.0.1:${server.address().port}/preview/`);
  console.log(`Shared SDK/UI preview: http://127.0.0.1:${server.address().port}/test/browser/shared-preview.html`);
  console.log('Open the page to run real DOM assertions. Stop this server with Ctrl+C.');
});
if(liveChat)process.once('SIGINT',()=>{void liveChat.cleanup().finally(()=>server.close(()=>process.exit(0)));});
if(liveLeave)process.once('SIGINT',()=>{void liveLeave.cleanup().finally(()=>server.close(()=>process.exit(0)));});
