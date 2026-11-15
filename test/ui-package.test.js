// Synthetic file-layout fixtures test only the dev server's package routing.
// They are not the registry artifact and do not substitute for its installation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {installedUiPackage,uiPackageHandler} from './browser/ui-package.js';

async function fixture(t) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'clan-ui-layout-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'dist'));await mkdir(join(root,'assets'));
  await writeFile(join(root,'package.json'),JSON.stringify({name:'@clan/ui',version:'0.0.0-test',exports:{'.':'./dist/widget.mjs'}}));
  await writeFile(join(root,'dist/package.json'),'{}');
  await writeFile(join(root,'dist/widget.mjs'),"import './theme.mjs';");
  await writeFile(join(root,'dist/theme.mjs'),'export const testOnly=true;');
  await writeFile(join(root,'assets/panel.css'),'.test-only {color:red}');
  await writeFile(join(root,'assets/icon.svg'),'<svg/>');
  await writeFile(join(root,'.npmrc'),'test-only-private-file');
  const pkg=await installedUiPackage(()=>pathToFileURL(join(root,'dist/widget.mjs')).href);
  return {pkg,handle:uiPackageHandler(pkg)};
}
async function request(handle,pathname,method='GET') {
  const res={writeHead(status,headers={}){this.status=status;this.headers=headers;return this;},end(body){this.body=body?.toString();}};
  const handled=await handle({method},res,{pathname});return {handled,...res};
}

test('registry configuration keeps the exact literal placeholder and registry range',async()=>{
  const config=await readFile(new URL('../.npmrc',import.meta.url),'utf8');
  assert.equal(config.replace(/\r\n/g,'\n'),'@clan:registry=https://gitlab.com/api/v4/groups/146782114/-/packages/npm/\n//gitlab.com/api/v4/groups/146782114/-/packages/npm/:_authToken=${GITLAB_NPM_TOKEN}\n');
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.dependencies['@clan/ui'],'^0.1.30');
});
test('dev resolver uses the public export and package metadata, not a hardcoded src layout',async t=>{
  const {pkg}=await fixture(t);assert.equal(pkg.entry,'dist/widget.mjs');assert.equal(pkg.version,'0.0.0-test');
});
test('missing installed package gives a clear setup error',async()=>{
  await assert.rejects(installedUiPackage(()=>{throw new Error('not installed');}),/GITLAB_NPM_TOKEN.*npm ci/);
});
test('import-map URL redirects to the actual entry so relative module imports work',async t=>{
  const {handle}=await fixture(t),redirect=await request(handle,'/__clan_ui__/');
  assert.equal(redirect.status,302);assert.equal(redirect.headers.Location,'/__clan_ui__/dist/widget.mjs');
  const entry=await request(handle,redirect.headers.Location);assert.equal(entry.status,200);assert.match(entry.body,/theme.mjs/);
  const dependency=await request(handle,'/__clan_ui__/dist/theme.mjs');assert.equal(dependency.status,200);assert.equal(dependency.headers['Content-Type'],'text/javascript');
});
test('installed CSS and image assets keep their MIME types',async t=>{
  const {handle}=await fixture(t);
  for(const [path,type]of [['panel.css','text/css'],['icon.svg','image/svg+xml']]){
    const response=await request(handle,'/__clan_ui__/assets/'+path);assert.equal(response.status,200);assert.equal(response.headers['Content-Type'],type);
  }
});
test('package route rejects traversal, hidden files, missing files and mutations',async t=>{
  const {handle}=await fixture(t);
  for(const path of ['..%2Foutside.js','%2e%2e%5coutside.js','.npmrc','dist/missing.js'])assert.equal((await request(handle,'/__clan_ui__/'+path)).status,404);
  assert.equal((await request(handle,'/__clan_ui__/','POST')).status,405);
  assert.equal((await request(handle,'/src/index.js')).handled,false);
});
