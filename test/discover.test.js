import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { discoverConfig } from '../src/config/discover.js';
import { widgetConfig } from '../src/config/widget.js';
import { createDiscoverController, clanViewModels } from '../src/experience/discover-controller.js';
const reference = JSON.parse(await readFile(new URL('./fixtures/config/complete-experience-v1.json', import.meta.url)));
const published = JSON.parse(await readFile(new URL('./browser/fixtures/platform-widget-v1.json', import.meta.url))).config;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
// Provisional test-only response adapter, not a Social wire contract.
const models = [{ id:'a', name:'Example' }];
function setup(extra = {}) {
  const states = [], navigation = [], joined = [];
  const controller = createDiscoverController({ listClans:async () => models, joinClan:async () => undefined,
    clanAdapter:raw => raw, debounceMs:1, onChange:s => states.push(s), onNavigate:e => navigation.push(e), onJoined:e => joined.push(e), ...extra });
  return { controller, states, navigation, joined, state:() => states.at(-1) };
}
test('Discover consumes authentic theme, section order/copy/visibility without modifying config', () => {
  const copy = structuredClone(reference); const before = structuredClone(copy);
  copy.screens.discover.sections[1].visible = false;
  const config = discoverConfig(copy);
  assert.equal(config.theme.accent, '#E779AA'); assert.equal(config.width, 390);
  assert.deepEqual(config.sections.map(s => s.id), ['intro','search','list','create']);
  assert.equal(config.sections[1].visible, false);
  before.screens.discover.sections[1].visible = false; assert.deepEqual(copy, before);
});
test('Discover rendering guards are separate from structural validation and reject invalid updates', () => {
  for (const [change, path] of [
    [c => c.schemaVersion=2, 'schemaVersion'], [c => c.theme.accent='red', 'theme.accent'],
    [c => c.screens.discover.width=-1, 'screens.discover.width'],
    [c => c.screens.discover.sections[0].visible='yes', 'screens.discover.sections[0].visible'],
    [c => c.screens.discover.sections[0].type='script', 'screens.discover.sections[0].type'],
    [c => delete c.screens.discover, 'screens.discover'],
  ]) { const c=structuredClone(reference); change(c); assert.throws(() => discoverConfig(c), e => e.path === path); }
});
test('current Platform config reaches the shared renderer without a prototype conversion', () => {
  const input=structuredClone(published),before=structuredClone(input);
  const view=widgetConfig(input,{validate:true});
  assert.deepEqual(view,input);assert.notEqual(view,input);assert.equal(view.screens,undefined);
  assert.equal(view.theme.colors.background,'#171923');assert.equal(view.clan.screens.discover.enabled,true);
  assert.deepEqual(input,before);
});
test('nested published feature flags and terms are mapped without inventing label keys', () => {
  const input=structuredClone(published);input.clan.screens.create.enabled=false;
  input.texts.terms={clan:'Guild',clans:'Guilds'};
  const view=widgetConfig(input,{validate:true});assert.equal(view.clan.screens.create.enabled,false);
  assert.deepEqual(view.texts.terms,{clan:'Guild',clans:'Guilds'});assert.deepEqual(view.texts.labels,{});
  input.clan.screens.discover.enabled=false;assert.equal(widgetConfig(input).clan.screens.discover.enabled,false);
});
test('partial published config is passed through without SDK defaults or schema validation', () => {
  const input={clan:{screens:{discover:{enabled:true}}}},view=widgetConfig(input);
  assert.deepEqual(view,input);assert.equal(view.theme,undefined);assert.equal(view.sections,undefined);
});
test('Discover screen background overrides the shared theme without mutating either', () => {
  const config = structuredClone(reference);
  config.screens.discover.background = '#21338c';
  const before = structuredClone(config);
  assert.equal(discoverConfig(config).theme.background, '#21338c');
  assert.deepEqual(config, before);
  delete config.screens.discover.background;
  assert.equal(discoverConfig(config).theme.background, config.theme.background);
  delete config.theme.background;
  assert.equal(discoverConfig(config).theme.background, '#171923');
});
test('Discover rejects invalid screen background with its field path', () => {
  for (const background of [null, '', 'blue', '#abc', '#12345678', '#123456\n', 123, {}, []]) {
    const config = structuredClone(reference);
    config.screens.discover.background = background;
    assert.throws(() => discoverConfig(config), error => error.path === 'screens.discover.background');
  }
});
test('view model mapping never supplies missing counts/emblems/availability', () => {
  assert.deepEqual(clanViewModels(models), models);
  assert.throws(() => clanViewModels({ clans:models }));
  assert.throws(() => clanViewModels([...models,...models]));
  assert.throws(() => clanViewModels([{...models[0],canJoin:'yes'}]));
});
test('initial load, empty and error/retry states', async () => {
  let calls=0;
  const t=setup({listClans:async () => { calls++; if(calls===1) throw new Error('Unavailable'); return []; }});
  const first=t.controller.start(); assert.equal(t.state().status,'loading'); await first;
  assert.equal(t.state().error,'Unavailable'); await t.controller.retry(); assert.equal(t.state().status,'empty');
  t.controller.destroy();
});
test('search debounce and races invalidate responses immediately', async () => {
  const first=deferred(), second=deferred(); const queries=[];
  const t=setup({listClans:options => { queries.push(options); return queries.length===1 ? first.promise : second.promise; }});
  const loading=t.controller.start(); t.controller.search('old'); t.controller.search('new');
  first.resolve([{id:'stale',name:'Stale'}]); await loading; assert.equal(t.state().status,'loading');
  await tick(); assert.deepEqual(queries,[{}, {q:'new'}]); second.resolve(models); await tick();
  assert.equal(t.state().clans[0].id,'a'); t.controller.destroy();
});
test('newer completed search cannot be overwritten by an older search', async () => {
  const old=deferred(), latest=deferred(); let calls=0;
  const t=setup({listClans:() => (++calls===1 ? old.promise : latest.promise)});
  const initial=t.controller.start(); t.controller.search('new'); await tick(); latest.resolve(models); await tick();
  old.resolve([{id:'old',name:'Old'}]); await initial; assert.equal(t.state().clans[0].id,'a'); t.controller.destroy();
});
test('join uses selected id once, preserves server failure and reports success without DTO assumptions', async () => {
  const pending=deferred(); let calls=0;
  const t=setup({joinClan:id => { assert.equal(id,'a'); calls++; return calls===1 ? pending.promise : Promise.resolve(); }});
  await t.controller.start(); const join=t.controller.join('a'); await t.controller.join('a'); assert.equal(calls,1);
  pending.reject(new Error('Clan is full')); await join; assert.equal(t.state().joinError,'Clan is full');
  await t.controller.join('a'); assert.deepEqual(t.joined,[{clanId:'a'}]); assert.equal(t.state().screen,'discover'); t.controller.destroy();
});
test('full and explicitly unavailable clans cannot be joined', async () => {
  let calls=0;
  const t=setup({listClans:async()=>[{id:'f',name:'Full',memberCount:2,maxMembers:2},{id:'u',name:'Locked',canJoin:false}],joinClan:async()=>calls++});
  await t.controller.start(); await t.controller.join('f'); await t.controller.join('u'); assert.equal(calls,0); t.controller.destroy();
});
test('navigation and destroy clear timers and ignore pending list results', async () => {
  const pending=deferred(); let calls=0;
  const t=setup({listClans:()=>{calls++; return pending.promise;}});
  const load=t.controller.start(); t.controller.search('discard'); t.controller.navigate('create');
  pending.resolve(models); await load; await tick(); assert.equal(calls,1); assert.equal(t.state().screen,'create');
  t.controller.navigate('discover'); await tick(); assert.equal(calls,2);
  assert.deepEqual(t.navigation.map(e=>e.screen),['create','discover']);
  t.controller.search('later'); t.controller.destroy(); const count=t.states.length; await tick(); assert.equal(calls,2); assert.equal(t.states.length,count);
});
test('destroy during join produces no updates or success event; instances remain independent', async () => {
  const pending=deferred(); const a=setup({joinClan:()=>pending.promise}), b=setup();
  await a.controller.start(); await b.controller.start(); const joining=a.controller.join('a'); a.controller.destroy(); const count=a.states.length;
  pending.resolve(); await joining; assert.equal(a.states.length,count); assert.equal(a.joined.length,0);
  assert.equal(b.state().pendingJoin,null); b.controller.destroy();
});
test('joining across navigation does not apply a stale success to a new Discover visit', async () => {
  const pending=deferred(); const t=setup({joinClan:()=>pending.promise});
  await t.controller.start(); const joining=t.controller.join('a');
  t.controller.navigate('create'); t.controller.navigate('discover'); await tick();
  pending.resolve(); await joining;
  assert.equal(t.joined.length,0); assert.equal(t.state().joinedClanId,null); assert.equal(t.state().pendingJoin,null); t.controller.destroy();
});
test('disabled Discover avoids requests and ignores results from before disabling', async () => {
  const pending=deferred();let calls=0;
  const t=setup({enabled:false,listClans:()=>++calls===1?pending.promise:Promise.resolve(models)});
  await t.controller.start();assert.equal(calls,0);
  t.controller.setEnabled(true);await tick();assert.equal(calls,1);
  t.controller.setEnabled(false);const count=t.states.length;pending.resolve(models);await tick();
  assert.equal(t.states.length,count);
  t.controller.search('ignored');await tick();assert.equal(calls,1);
  t.controller.setEnabled(true);await tick();assert.equal(calls,2);assert.equal(t.state().status,'ready');t.controller.destroy();
});
