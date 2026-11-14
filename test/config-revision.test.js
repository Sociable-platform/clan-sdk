import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformConfigLoader,publishedConfigInfo} from '../src/config/platform.js';
import {recordingFetch,jsonResponse} from './helpers/recording-fetch.js';
test('published revision metadata stays separate from schemaVersion and survives ETag304',async t=>{
 const config={schemaVersion:1,theme:{colors:{background:'#171923'}}};const response=jsonResponse({version:9,config});response.headers.set('ETag','W/"v9"');const calls=recordingFetch(t,response,new Response(null,{status:304}));
 const load=createPlatformConfigLoader({gameId:'revision-test',platformUrl:'https://platform.test'});const a=await load(),b=await load();assert.deepEqual(a,config);assert.deepEqual(b,config);assert.equal(publishedConfigInfo(a).version,9);assert.equal(publishedConfigInfo(b).version,9);assert.equal(calls[1].headers['If-None-Match'],'W/"v9"');
});
test('strict refresh failure rejects while default initial fallback remains compatible',async t=>{
 recordingFetch(t,jsonResponse({version:2,config:{schemaVersion:1}}),new Response(null,{status:503}),new TypeError('offline'));t.mock.method(console,'warn',()=>{});
 const load=createPlatformConfigLoader({gameId:'refresh-test',platformUrl:'https://platform.test'});const first=await load();await assert.rejects(load({fallbackOnError:false}),e=>e.status===503);assert.equal(publishedConfigInfo(first).version,2);const fallback=await load();assert.equal(fallback.schemaVersion,1);assert.equal(publishedConfigInfo(fallback),undefined);
});
