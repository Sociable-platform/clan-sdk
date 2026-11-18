import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExperienceController} from '../src/experience/shared-controller.js';
import {socialClanAdapter} from '../src/social/clan-adapter.js';
import {widgetConfig} from '../src/config/widget.js';
import {normalizeWidgetConfig,ConfigError} from '../src/index.js';
const current=JSON.parse(await readFile(new URL('./browser/fixtures/platform-widget-v1.json',import.meta.url))).config;
test('wrapped/unwrapped current configs normalize identically with all inner fields preserved',()=>{
  const input=structuredClone(current);input.extension={nested:['kept']};
  const wrapped={config:input,version:7};const before=structuredClone(wrapped);
  const normalized=normalizeWidgetConfig(wrapped);
  assert.deepEqual(normalized,normalizeWidgetConfig(input));assert.deepEqual(normalized,input);
  assert.equal(normalized.config,undefined);assert.equal(normalized.version,undefined);
  normalized.extension.nested.push('changed');assert.deepEqual(wrapped,before);
});
test('explicit invalid config wrapper fails at config instead of falling through to root fields',()=>{
  for(const config of [null,[],1,'json',false,undefined]) {
    assert.throws(()=>normalizeWidgetConfig({...current,config}),e=>e instanceof ConfigError&&e.path==='config');
    assert.throws(()=>widgetConfig({config}),e=>e.path==='config');
  }
});
test('wrapped versions and nested fields retain existing validation and paths',()=>{
  for(const version of [undefined,null,0,2,'1'])assert.throws(()=>normalizeWidgetConfig({schemaVersion:1,config:{...current,schemaVersion:version}}),e=>e.path==='schemaVersion');
  assert.throws(()=>normalizeWidgetConfig({config:{...current,theme:{colors:{brand:'red'}}}}),e=>e.path==='theme.colors.brand');
});
const clan={id:'clan-id',name:'Actual clan',memberCount:1,maxMembers:10};
const noClan=()=>Object.assign(new Error('Not in a clan'),{status:404,code:'not_in_clan'});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const tick=()=>new Promise(done=>setTimeout(done,0));
function fixture(overrides={}){const states=[],events=[],calls=[];const sdk={myClan:async()=>{calls.push('myClan');throw noClan();},listClans:async()=>{calls.push('listClans');return {clans:[clan]};},joinClan:async id=>{calls.push(['joinClan',id]);return clan;},createClan:async input=>{calls.push(['createClan',input]);return clan;},clanMembers:async id=>{calls.push(['clanMembers',id]);return {members:[]};},...overrides};const controller=createExperienceController({sdk,clanAdapter:socialClanAdapter,onChange:s=>states.push(s),onEvent:(name,detail)=>events.push({name,detail})});return {controller,states,events,calls,state:()=>states.at(-1),sdk};}
test('current config is cloned whole, preserving all current fields without prototype conversion',()=>{const input=structuredClone(current),before=structuredClone(input),out=widgetConfig(input,{validate:true});assert.deepEqual(out,input);assert.notEqual(out.theme,input.theme);out.clan.screens.discover.enabled=false;assert.deepEqual(input,before);assert.equal(out.kind,undefined);assert.equal(out.screens,undefined);});
test('minimal direct-update checks reject broken objects, colors and actual layout types with paths',()=>{for(const [input,path] of [[null,'$'],[[], '$'],[{...current,schemaVersion:2},'schemaVersion'],[{...current,theme:null},'theme'],[{...current,theme:{colors:[]}},'theme.colors'],[{...current,theme:{colors:{brand:'url(secret)'}}},'theme.colors.brand'],[{...current,clan:{screens:{home:null}}},'clan.screens.home'],[{...current,layout:{position:'top-left'}},'layout.position'],[{...current,chat:{enabled:1}},'chat.enabled']])assert.throws(()=>widgetConfig(input,{validate:true}),e=>e.path===path);});
test('backend payload remains unvalidated and no SDK defaults are merged into it',()=>{const input={schemaVersion:99,clan:{enabled:true},theme:{colors:{brand:'unsupported'}}};assert.deepEqual(widgetConfig(input),input);});
test('membership 404 not_in_clan leads to one list request; no profile registration/bootstrap',async()=>{const f=fixture();await f.controller.start();await tick();assert.deepEqual(f.calls,['myClan','listClans']);assert.equal(f.state().screen,'discover');assert.equal(f.state().clans[0].name,clan.name);f.controller.destroy();});
test('another membership 404 is an error and does not masquerade as no clan',async()=>{const f=fixture({myClan:async()=>{throw Object.assign(new Error('Missing endpoint'),{status:404,code:'not_found'});}});await f.controller.start();assert.equal(f.state().error,'Missing endpoint');assert.equal(f.state().membershipKnown,false);assert.equal(f.calls.length,0);f.controller.destroy();});
test('existing membership opens Home without a list request and maps member DTOs on navigation',async()=>{const f=fixture({myClan:async()=>({clan,role:'owner'}),clanMembers:async()=>({members:[{playerId:'p1',displayName:'Member',role:'owner',joinedAt:'2026-01-01'}]})});await f.controller.start();assert.equal(f.state().screen,'home');assert.equal(f.state().role,'owner');assert.equal(f.calls.length,0);f.controller.navigate('members');await tick();assert.deepEqual(f.state().members,[{id:'p1',name:'Member',role:'owner'}]);assert.equal(f.state().members[0].isYou,undefined);f.controller.destroy();});
test('join pending blocks duplicates then refreshes real membership before opening Home',async()=>{const pending=deferred();let joined=false;const f=fixture({joinClan:async()=>{joined=true;return pending.promise;},myClan:async()=>{if(!joined)throw noClan();return {clan,role:'member'};}});await f.controller.start();await tick();f.controller.join(clan.id);f.controller.join(clan.id);assert.equal(f.state().pendingJoin,clan.id);pending.resolve(clan);await tick();assert.equal(f.events.filter(e=>e.name==='joined').length,1);assert.equal(f.state().screen,'home');assert.equal(f.state().role,'member');f.controller.destroy();});
test('Create action sends supported details and suppresses duplicate writes',async()=>{const pending=deferred();const f=fixture({createClan:async input=>{f.calls.push(input);return pending.promise;}});await f.controller.start();await tick();f.controller.navigate('create');const first=f.controller.create({name:'New clan',tag:'TAG',description:'Saved description',badge:'star',previewOnly:true});await f.controller.create({name:'Duplicate'});assert.deepEqual(f.calls.at(-1),{name:'New clan',badge:'star',description:'Saved description',tag:'TAG'});pending.resolve(clan);await first;assert.equal(f.events.filter(e=>e.name==='created').length,1);f.controller.destroy();});
test('navigation/destroy ignore late members/list results and remove pending search timer',async()=>{const pending=deferred();const f=fixture({myClan:async()=>({clan,role:'member'}),clanMembers:()=>pending.promise});await f.controller.start();f.controller.navigate('members');f.controller.navigate('home');pending.resolve({members:[{playerId:'late',displayName:'Late',role:'member'}]});await tick();assert.deepEqual(f.state().members,[]);const count=f.states.length;f.controller.destroy();f.controller.navigate('discover');f.controller.tab('chat');assert.equal(f.states.length,count);});
test('destroy during membership prevents subsequent UI emissions or list requests',async()=>{const pending=deferred();const f=fixture({myClan:()=>pending.promise});const load=f.controller.start(),count=f.states.length;f.controller.destroy();pending.resolve({clan,role:'owner'});await load;assert.equal(f.states.length,count);assert.equal(f.calls.length,0);});
test('disabling and re-enabling clan invalidates pending data without duplicate loads',async()=>{const f=fixture();await f.controller.start();await tick();f.controller.setEnabled(false);f.controller.setEnabled(true);await tick();assert.deepEqual(f.calls,['myClan','listClans','myClan','listClans']);f.controller.destroy();});
test('Members Retry reloads members rather than navigating away or refetching membership',async()=>{
  let loads=0;
  const f=fixture({myClan:async()=>({clan,role:'member'}),clanMembers:async()=>{if(++loads===1)throw new Error('Roster unavailable');return {members:[{playerId:'actual',displayName:'Recovered',role:'member'}]};}});
  await f.controller.start();f.controller.navigate('members');await tick();assert.equal(f.state().error,'Roster unavailable');
  await f.controller.retry();assert.equal(f.state().screen,'members');assert.equal(f.state().members[0].name,'Recovered');assert.equal(f.state().error,'');assert.equal(loads,2);f.controller.destroy();
});
const suspended=()=>Object.assign(new Error('This game is suspended'),{status:403,code:'game_suspended'});
test('a suspended game is flagged when membership cannot be read, and a retry that works clears it',async()=>{let down=true;const f=fixture({myClan:async()=>{if(down)throw suspended();throw noClan();}});await f.controller.start();assert.equal(f.state().suspended,true);assert.equal(f.state().error,'This game is suspended');down=false;await f.controller.retry();await tick();assert.equal(f.state().suspended,false);assert.equal(f.state().error,'');f.controller.destroy();});
test('a game token endpoint that answers game_suspended is flagged the same way; other errors are not',async()=>{const f=fixture({myClan:async()=>{throw suspended();}});await f.controller.start();assert.equal(f.state().suspended,true);f.controller.destroy();const g=fixture({myClan:async()=>{throw Object.assign(new Error('Down'),{status:502,code:'clan_upstream_error'});}});await g.controller.start();assert.equal(g.state().suspended,false);assert.equal(g.state().error,'Down');g.controller.destroy();});
test('a suspension that starts while the clans are listed is flagged',async()=>{const f=fixture({listClans:async()=>{throw suspended();}});await f.controller.start();await tick();assert.equal(f.state().status,'error');assert.equal(f.state().suspended,true);f.controller.destroy();});
