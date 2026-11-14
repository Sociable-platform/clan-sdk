import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = new URL('../', import.meta.url);
const {version} = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('package.json version must be a release version safe for an asset path');
}
if (!process.argv[2]) throw new Error('Usage: node scripts/prepare-image.mjs <output-directory>');
const output = resolve(process.argv[2]);
for (const path of [version, 'v1']) {
  const directory = resolve(output, 'html', path);
  await mkdir(directory, {recursive: true});
  for (const filename of ['clan-sdk.js', 'clan-sdk.esm.js']) {
    await copyFile(new URL(`dist/${filename}`, root), resolve(directory, filename));
  }
}
const template = await readFile(new URL('nginx.conf', root), 'utf8');
await writeFile(resolve(output, 'default.conf'), template.replaceAll('__SDK_VERSION__', version));
console.log(`Prepared /${version}/ and /v1/ SDK assets for nginx on port 8080`);
