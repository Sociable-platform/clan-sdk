// Development-only local browser test server. No SDK/backend mock is installed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = pathname === '/' ? '/test/browser/index.html' : pathname;
    const target = resolve(root, `.${requested}`);
    const local = relative(root, target);
    if (req.method !== 'GET' || local.startsWith(`..${sep}`) || local === '..'
        || !(local.startsWith(`src${sep}`) || local.startsWith(`test${sep}browser${sep}`))) {
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
  console.log('Open the page to run real DOM assertions. Stop this server with Ctrl+C.');
});
