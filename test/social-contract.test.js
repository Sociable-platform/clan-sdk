import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, ApiError } from '../src/index.js';
import { socialClanAdapter } from '../src/social/clan-adapter.js';
import {clanViewModels} from '../src/experience/discover-controller.js';
import { socialContracts } from './fixtures/social/contracts.js';
import { recordingFetch, jsonResponse } from './helpers/recording-fetch.js';

test('confirmed ClanList maps runtime counts and ignores unsupported decoration/rules', () => {
  const response=structuredClone(socialContracts.list);
  Object.assign(response.clans[0],{emblem:'not-a-supported-field',canJoin:false});
  const before=structuredClone(response);
  const mapped=socialClanAdapter(response);
  assert.deepEqual(mapped,socialContracts.list.clans);
  assert.deepEqual(response,before);
  assert.notEqual(mapped[0],response.clans[0]);
  assert.deepEqual(socialClanAdapter({clans:[]}),[]);
});
test('default Social adapter rejects wrong envelopes and incomplete DTOs instead of mocking data', () => {
  for(const response of [null,[],{}, {demoClans:[]},{clans:null},{clans:[{}]},
    {clans:[{...socialContracts.join,memberCount:'3'}]}, {clans:[{...socialContracts.join,maxMembers:0}]}]) {
    assert.throws(()=>socialClanAdapter(response),TypeError);
  }
});

test('saved clan badge, description and tag survive DTO mapping without inventing missing values',()=>{
  const clan={...socialContracts.join,badge:'moon',description:'Moon growers',tag:'MOON'};
  assert.deepEqual(socialClanAdapter({clans:[clan]})[0],clan);
  assert.deepEqual(clanViewModels(socialClanAdapter({clans:[clan]}))[0],clan);
  for(const field of ['badge','description','tag'])assert.throws(()=>socialClanAdapter({clans:[{...clan,[field]:{}}]}),TypeError);
});

test('createClan sends optional badge/details with current player authentication and preserves backend validation errors',async t=>{
  const body={name:'Moon growers',badge:'moon',description:'Fresh harvests',tag:'MOON'};
  const calls=recordingFetch(t,jsonResponse({...socialContracts.create,...body},201),jsonResponse({error:{code:'invalid_clan_badge',message:'Invalid badge ID'}},400));
  const sdk=init({socialUrl:'https://social.test',getPlayerToken:()=> 'current-player-token'});
  assert.equal((await sdk.createClan({...body,unrelated:'ignored'})).badge,'moon');
  assert.deepEqual(JSON.parse(calls[0].body),body);
  assert.equal(calls[0].headers.Authorization,'Bearer current-player-token');
  await assert.rejects(sdk.createClan({name:'Bad clan',badge:'../invalid'}),e=>e.code==='invalid_clan_badge'&&e.status===400);
  for(const field of ['badge','description','tag'])assert.throws(()=>sdk.createClan({name:'Invalid', [field]:null}),TypeError);
});
test('myClan preserves the confirmed not_in_clan error without bootstrap or retry',async t=>{
  const calls=recordingFetch(t,jsonResponse({error:{code:'not_in_clan',message:'You are not in a clan'}},404));
  const sdk=init({socialUrl:'http://localhost:8082',getPlayerToken:()=> 'test-token'});
  await assert.rejects(sdk.myClan(),e=>e instanceof ApiError&&e.status===404&&e.code==='not_in_clan');
  assert.equal(calls.length,1);assert.equal(calls[0].url,'http://localhost:8082/api/v1/players/me/clan');
});
test('confirmed auth rejection refreshes callback once and preserves token_expired',async t=>{
  const error={error:{code:'token_expired',message:'The player token has expired; get a new one from the game'}};
  const calls=recordingFetch(t,jsonResponse(error,401),jsonResponse(error,401));
  const token=t.mock.fn(()=> 'expired-test-token');
  await assert.rejects(init({socialUrl:'http://localhost:8082',getPlayerToken:token}).listClans(),e=>e instanceof ApiError&&e.code==='token_expired');
  assert.equal(calls.length,2);assert.equal(token.mock.callCount(),2);
});
