// Builds the hosted SDK into dist/:
//   clan-sdk.js      IIFE exposing window.ClanSDK, for a plain <script> tag
//   clan-sdk.esm.js  ES module, for projects with their own bundler
// @clan/ui is bundled in, so each file is self-contained (one request, no dependencies).
import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const common = {
  entryPoints: ['src/bundle.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  platform: 'browser',
  legalComments: 'none',
  banner: { js: `/*! clan-sdk v${version} */` },
  define: { __CLAN_SDK_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
};

await rm('dist', { recursive: true, force: true });
await Promise.all([
  build({ ...common, format: 'iife', globalName: 'ClanSDK', outfile: 'dist/clan-sdk.js' }),
  build({ ...common, format: 'esm', outfile: 'dist/clan-sdk.esm.js' }),
]);
