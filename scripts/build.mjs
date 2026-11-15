import {build} from 'esbuild';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const {version} = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const limit = 60 * 1000;
await mkdir(new URL('dist/', root), {recursive: true});

for (const [format, filename] of [['iife', 'clan-sdk.js'], ['esm', 'clan-sdk.esm.js']]) {
  const result = await build({
    absWorkingDir: fileURLToPath(root),
    stdin: {
      contents: `export * from './src/index.js'; export const version = ${JSON.stringify(version)};`,
      resolveDir: fileURLToPath(root),
      sourcefile: 'browser-entry.js',
    },
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format,
    ...(format === 'iife' ? {globalName: 'ClanSDK'} : {}),
    minify: true,
    legalComments: 'inline',
    banner: {js: `/*! Clan SDK v${version} */`},
    outfile: `dist/${filename}`,
    write: false,
    metafile: true,
  });
  // UI code/styles stay in one file. Curated fonts load at runtime from Google.
  if (result.outputFiles.length !== 1 || Object.values(result.metafile.outputs).some(output => output.imports.length)) {
    throw new Error(`${filename} is not self-contained`);
  }
  const output = result.outputFiles[0].contents;
  await writeFile(new URL(`dist/${filename}`, root), output);
  const bytes = gzipSync(output).length;
  console.log(`dist/${filename}: ${bytes.toLocaleString('en-US')} bytes gzip (${(bytes / 1000).toFixed(2)} KB; target <60 KB)`);
  if (bytes >= limit) throw new Error(`${filename} exceeds the gzip size budget`);
}
