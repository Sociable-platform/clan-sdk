// Integration check against a running SDK nginx image, not a mock HTTP server.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const {version} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const origin = (process.argv[2] ?? 'http://127.0.0.1:18080').replace(/\/$/, '');
for (const filename of ['clan-sdk.js', 'clan-sdk.esm.js']) {
  const bodies = [];
  for (const [path, cache] of [['v1', 'no-cache'], [version, 'public, max-age=31536000, immutable']]) {
    const url = `${origin}/${path}/${filename}`;
    const headers = await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(10000)});
    assert.equal(headers.status, 200, url);
    assert.match(headers.headers.get('content-type') ?? '', /^(application|text)\/javascript(?:;|$)/);
    assert.equal(headers.headers.get('access-control-allow-origin'), '*');
    assert.equal(headers.headers.get('cache-control'), cache);
    console.log(`HEAD /${path}/${filename}: ${headers.status}; Content-Type: ${headers.headers.get('content-type')}; Access-Control-Allow-Origin: *; Cache-Control: ${cache}`);
    const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('cache-control'), cache);
    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(body.toString().startsWith(`/*! Clan SDK v${version} */`), 'Release banner mismatch');
    bodies.push(body);
  }
  assert.deepEqual(bodies[0], bodies[1], `${filename}: alias/version bytes differ`);
  console.log(`PASS ${filename}: ${bodies[0].length} identical bytes; SHA256 ${createHash('sha256').update(bodies[0]).digest('hex')}`);
}
for (const path of [`/v1/missing.js`, `/${version}/missing.js`, '/999.999.999/clan-sdk.js', '/src/index.js', '/node_modules/@clan/ui/src/index.js', '/.env', '/index.html']) {
  const response = await fetch(`${origin}${path}`, {signal: AbortSignal.timeout(10000)});
  assert.equal(response.status, 404, path);
  assert.notEqual(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', 'Cached missing asset');
  await response.body?.cancel();
  console.log(`PASS ${path}: 404`);
}
