// Development-only server. Its provisional HTTP config mock is never in src.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, sep } from 'node:path';
import { handleDevConfigRequest } from '../dev-config-endpoint.js';
import { handleDevDiscoverRequest } from '../dev-discover-endpoint.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (handleDevConfigRequest(req, res, url)) return;
    if (handleDevDiscoverRequest(req, res, url)) return;
    const pathname = decodeURIComponent(url.pathname);
    if(pathname.startsWith('/__clan_ui__/')) {
      const shared=resolve(root,'clan-frontend/packages/ui/src');
      const file=resolve(shared,pathname.slice('/__clan_ui__/'.length));
      const inside=relative(shared,file);
      if(req.method!=='GET'||inside==='..'||inside.startsWith(`..${sep}`)) {res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(file));return;
    }
    const requested = pathname === '/' ? '/test/browser/index.html'
      : ['/preview', '/preview/'].includes(pathname) ? '/preview/index.html'
      : ['/preview/discover', '/preview/discover/'].includes(pathname) ? '/preview/discover/index.html' : pathname;
    const target = resolve(root, `.${requested}`);
    const local = relative(root, target);
    if (req.method !== 'GET' || local.startsWith(`..${sep}`) || local === '..'
        || !(local.startsWith(`src${sep}`) || local.startsWith(`test${sep}browser${sep}`) || local.startsWith(`preview${sep}`)
          || local === ['test', 'fixtures', 'config', 'complete-experience-v1.json'].join(sep)
          || local === ['test','fixtures','social','friends.js'].join(sep))) {
      res.writeHead(404).end();
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': `${types[extname(target)] ?? 'text/plain'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(Number(process.env.BROWSER_TEST_PORT ?? 5174), '127.0.0.1', () => {
  console.log(`Browser tests: http://127.0.0.1:${server.address().port}/`);
  console.log(`Temporary UI preview: http://127.0.0.1:${server.address().port}/preview/`);
  console.log(`Shared SDK/UI preview: http://127.0.0.1:${server.address().port}/test/browser/shared-preview.html`);
  console.log('Open the page to run real DOM assertions. Stop this server with Ctrl+C.');
});
