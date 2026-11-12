import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init} from '../src/index.js';
import {createPlatformConfigLoader} from '../src/config/platform.js';
import {defaultExperienceConfig} from '../src/config/default-experience.js';
import {widgetConfig} from '../src/config/widget.js';

let sequence=0;
const fresh=()=>({platformUrl:`https://platform.example.test/case-${++sequence}`,gameId:'a6c1e2f0-1111-4222-8333-944455556666'});
const config=()=>({...defaultExperienceConfig(),extra:{preserved:true}});
const json=(config,etag='"v3"')=>new Response(JSON.stringify({version:3,config}),{headers:{ETag:etag,'Content-Type':'application/json'}});
const noBody304=()=>({status:304,get ok(){throw new Error('304 must precede ok check');},json(){throw new Error('Do not parse 304');}});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function setup(t,steps,settings=fresh()) {
  const calls=[],logs=[];
  t.mock.method(console,'warn',(...args)=>logs.push(args));
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,...options});assert.ok(steps.length,'Unexpected extra request');
    const next=steps.shift();if(next instanceof Error)throw next;return typeof next==='function'?next():next;
  });
  return {load:createPlatformConfigLoader(settings),calls,logs,settings};
}
test('W6 load uses actual envelope/route with no credentials or config schema validation',async t=>{
  const input=config();const {load,calls}=setup(t,[json(input)]);
  assert.deepEqual(await load(),input);
  assert.ok(calls[0].url.endsWith('/api/v1/public/games/a6c1e2f0-1111-4222-8333-944455556666/widget-config'));
  assert.deepEqual(calls[0].headers,{Accept:'application/json'});
  assert.equal(calls[0].credentials,'omit');assert.equal(calls[0].redirect,'error');assert.equal(calls[0].cache,'no-store');
});
test('W6 uses shared envelope handling, preserves inner fields and reuses normalized cache on 304',async t=>{
  const input=config();input.extension={nested:[1,2]};
  const {load,calls}=setup(t,[json(input,'"wrapped"'),noBody304()]);
  const first=await load();assert.deepEqual(first,input);assert.equal(first.config,undefined);
  first.extension.nested.push(3);assert.deepEqual(await load(),input);
  assert.equal(calls[1].headers['If-None-Match'],'"wrapped"');
});
test('invalid W6 config wrapper falls back with a clear diagnostic and does not poison cache',async t=>{
  const {load,logs,calls}=setup(t,[json(config(),'"valid"'),json(null,'"invalid"'),noBody304()]);
  await load();assert.deepEqual(await load(),defaultExperienceConfig());
  assert.equal(logs[0][1].code,'config_invalid_wrapper');assert.equal(logs[0][1].field,'config');
  assert.deepEqual(await load(),config());assert.equal(calls[2].headers['If-None-Match'],'"valid"');
});
test('init remains network/token free, preserves Social methods, canonicalizes Platform trailing slash',async t=>{
  const settings=fresh();const {calls}=setup(t,[json(config())],settings);
  let tokens=0;const sdk=init({...settings,platformUrl:settings.platformUrl+'/',socialUrl:'http://localhost:8082',getPlayerToken:()=>{tokens++;throw new Error('Not public');}});
  assert.equal(calls.length,0);assert.equal(tokens,0);
  assert.deepEqual(Object.keys(sdk),['listClans','createClan','joinClan','myClan','clanMembers']);
  await sdk.loadConfig();assert.equal(tokens,0);assert.equal(calls[0].url.includes('//api'),false);
});
test('fallback is fresh and uses the current shared widget format',()=>{
  const a=defaultExperienceConfig(),b=defaultExperienceConfig();widgetConfig(a,{validate:true});
  a.clan.screens.discover.enabled=false;assert.equal(b.clan.screens.discover.enabled,true);
});
for(const [name,response] of [
  ['404',()=>new Response('not published',{status:404})],['503',()=>new Response('failure',{status:503})],
  ['offline',()=>new TypeError('secret-token-must-not-be-logged')],['JSON',()=>new Response('{malformed')],
  ['envelope',()=>new Response(JSON.stringify({config:config()}))],
]) test(`${name} uses validated defaults, logs safe diagnostics and does not cache failure`,async t=>{
  const {load,calls,logs}=setup(t,[response(),json(config())]);
  assert.deepEqual(await load(),defaultExperienceConfig());assert.equal(logs.length,1);
  assert.ok(!JSON.stringify(logs).includes('secret-token'));
  await load();assert.equal(calls[1].headers['If-None-Match'],undefined);
});
test('ETag is sent unchanged and 304 reuses cache without inspecting its body or ok',async t=>{
  const input=config(),etag='W/"opaque-v3"';const {load,calls}=setup(t,[json(input,etag),noBody304()]);
  const first=await load();first.theme.background='#ffffff';
  const second=await load();assert.deepEqual(second,input);assert.equal(calls[1].headers['If-None-Match'],etag);
});
test('304 without cache retries once without conditional header then stores backend config',async t=>{
  const {load,calls}=setup(t,[noBody304(),json(config())]);assert.deepEqual(await load(),config());
  assert.equal(calls.length,2);assert.equal(calls[0].headers['If-None-Match'],undefined);assert.equal(calls[1].headers['If-None-Match'],undefined);
});
test('repeated cacheless 304 falls back after exactly two attempts',async t=>{
  const {load,calls}=setup(t,[noBody304(),noBody304()]);assert.deepEqual(await load(),defaultExperienceConfig());assert.equal(calls.length,2);
});
test('cache is shared across instances for same pair, isolated between games and Platform URLs',async t=>{
  const pair=fresh();const {calls}=setup(t,[json(config()),noBody304(),json(config()),json(config())],pair);
  await createPlatformConfigLoader(pair)();await createPlatformConfigLoader(pair)();
  await createPlatformConfigLoader({...pair,gameId:'b6c1e2f0-1111-4222-8333-944455556666'})();
  await createPlatformConfigLoader({...pair,platformUrl:pair.platformUrl+'/other'})();
  assert.equal(calls[1].headers['If-None-Match'],'"v3"');
  assert.equal(calls[2].headers['If-None-Match'],undefined);assert.equal(calls[3].headers['If-None-Match'],undefined);
});
test('malformed JSON refresh does not replace last config/ETag; failure renders defaults',async t=>{
  const input=config();input.theme.background='#123456';
  const {load,calls}=setup(t,[json(input,'"valid"'),new Response('{malformed',{headers:{ETag:'"invalid"'}}),noBody304()]);
  await load();assert.deepEqual(await load(),defaultExperienceConfig());assert.deepEqual(await load(),input);
  assert.equal(calls[2].headers['If-None-Match'],'"valid"');
});
test('backend JSON without SDK kind/theme/screens is returned and cached unchanged',async t=>{
  const input={schemaVersion:99,serverExtension:{keep:true}};
  const {load,calls,logs}=setup(t,[json(input,'"backend"'),noBody304()]);
  assert.deepEqual(await load(),input);assert.deepEqual(await load(),input);
  assert.equal(calls[1].headers['If-None-Match'],'"backend"');assert.equal(logs.length,0);
});
test('refresh accepts a new backend config even when it does not match the SDK schema',async t=>{
  const input={backendOwnsThis:true};
  const {load,calls,logs}=setup(t,[json(config(),'"old"'),json(input,'"new"'),noBody304()]);
  await load();assert.deepEqual(await load(),input);assert.deepEqual(await load(),input);
  assert.equal(calls[2].headers['If-None-Match'],'"new"');assert.equal(logs.length,0);
});
test('offline after prior success renders defaults rather than stale cached config',async t=>{
  const input=config();input.theme.background='#123456';const {load}=setup(t,[json(input),new TypeError('offline')]);
  await load();assert.deepEqual(await load(),defaultExperienceConfig());
});
test('timeout falls back even if fetch ignores cancellation and late response never enters cache',async t=>{
  const slow=deferred();const settings={...fresh(),timeoutMs:5};
  const {load,calls}=setup(t,[()=>slow.promise,noBody304(),json(config())],settings);
  assert.deepEqual(await load(),defaultExperienceConfig());slow.resolve(json(config(),'"late"'));
  await load();assert.equal(calls[1].headers['If-None-Match'],undefined);assert.equal(calls.length,3);
});
test('caller cancellation rejects without fallback or late cache writes',async t=>{
  const slow=deferred();const {load,calls,logs}=setup(t,[()=>slow.promise,noBody304(),json(config())]);
  const controller=new AbortController();const request=load({signal:controller.signal});await Promise.resolve();controller.abort();
  await assert.rejects(request,e=>e.name==='AbortError');assert.equal(logs.length,0);
  slow.resolve(json(config()));await load();assert.equal(calls[1].headers['If-None-Match'],undefined);
});
test('older successful response cannot replace newer cache/ETag',async t=>{
  const old=deferred(),latest=config();latest.theme.background='#123456';
  const {load,calls}=setup(t,[()=>old.promise,json(latest,'"new"'),noBody304()]);
  const pending=load();await load();old.resolve(json(config(),'"old"'));await pending;
  assert.deepEqual(await load(),latest);assert.equal(calls[2].headers['If-None-Match'],'"new"');
});
test('invalid initialization fails before requests; Social-only initialization remains valid',t=>{
  const {calls}=setup(t,[]);const social={socialUrl:'http://localhost:8082',getPlayerToken:()=> 'token'};
  for(const extra of [{gameId:'game'}, {platformUrl:'https://platform.test'}, {gameId:'',platformUrl:'https://platform.test'},
    {gameId:'game',platformUrl:'https://user:secret@platform.test'},{gameId:'game',platformUrl:'https://platform.test?key=secret'}]) {
    assert.throws(()=>init({...social,...extra}),TypeError);
  }
  const sdk=init(social);assert.throws(()=>sdk.loadConfig(),TypeError);assert.equal(calls.length,0);
});
