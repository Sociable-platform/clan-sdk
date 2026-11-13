// Explicit live integration runner, never part of npm test. Local-dev signing
// stays in this Node-only test file; no key/token is logged or shipped in src.
import {readFile} from 'node:fs/promises';
import {createPrivateKey,sign,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {init} from '../../src/index.js';
const checks=[],http=[];
const original=globalThis.fetch;
const base=process.env.FRIENDS_LIVE_SOCIAL_URL??'http://localhost:8082';
let a,b,pa,pb;
const report=(name,status,detail)=>{checks.push({name,status,...(detail?{detail}:{})});};
const check=async(name,fn)=>{await fn();report(name,'PASS');};
const errorCode=async(promise,code)=>{await assert.rejects(promise,e=>e.code===code);};
try {
  const health=await original(base+'/ready',{signal:AbortSignal.timeout(3000)});
  if(!health.ok)throw Object.assign(new Error(),{code:'service_not_ready'});
  let tokens;
  if(process.argv.includes('--local-dev-key')) {
    if(!process.env.FRIENDS_LIVE_DEV_KEY)throw Object.assign(new Error(),{code:'friends_live_dev_key_path_required'});
    const key=createPrivateKey(await readFile(process.env.FRIENDS_LIVE_DEV_KEY));
    const game=randomUUID(),tag='sdk-friends-test-'+randomUUID(),now=Math.floor(Date.now()/1000);
    const token=(suffix)=>{const head=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url');const claims=Buffer.from(JSON.stringify({sub:tag+'-'+suffix,gid:game,name:'SDK Friends Test '+suffix,typ:'player',iat:now,exp:now+600})).toString('base64url');const input=head+'.'+claims;return input+'.'+sign(null,Buffer.from(input),key).toString('base64url');};
    tokens=[token('A'),token('B')];
  }else {
    if(process.env.FRIENDS_LIVE_DEDICATED!=='1'||!process.env.FRIENDS_LIVE_TOKEN_A||!process.env.FRIENDS_LIVE_TOKEN_B)throw Object.assign(new Error(),{code:'dedicated_player_tokens_required'});
    tokens=[process.env.FRIENDS_LIVE_TOKEN_A,process.env.FRIENDS_LIVE_TOKEN_B];
  }
  globalThis.fetch=async(url,options)=>{const response=await original(url,{...options,signal:AbortSignal.timeout(5000)});http.push({method:options.method,path:new URL(url).pathname,status:response.status});return response;};
  a=init({socialUrl:base,getPlayerToken:async()=>tokens[0]});b=init({socialUrl:base,getPlayerToken:async()=>tokens[1]});
  await check('two dedicated players/bootstrap',async()=>{[pa,pb]=await Promise.all([a.getMyPlayer(),b.getMyPlayer()]);assert.ok(pa.externalId.startsWith('sdk-friends-test-')&&pb.externalId.startsWith('sdk-friends-test-'),'Dedicated players required');assert.equal(pa.gameId,pb.gameId);assert.notEqual(pa.id,pb.id);assert.notEqual(pa.id,pa.externalId);});
  await check('list/search/initial empty',async()=>{assert.deepEqual(await a.listFriends(),{friends:[]});assert.deepEqual(await b.listFriendRequests(),{incoming:[],outgoing:[]});const found=await a.searchPlayers({q:pb.displayName,limit:10});assert.ok(found.players.some(p=>p.id===pb.id&&p.relation==='none'));assert.ok(found.players.every(p=>p.id!==pa.id));});
  await check('send/incoming/outgoing/search relations',async()=>{const req=await a.sendFriendRequest({playerId:pb.id});assert.equal(req.player.id,pb.id);assert.equal((await b.listFriendRequests()).incoming[0].id,req.id);assert.equal((await a.listFriendRequests()).outgoing[0].id,req.id);assert.equal((await b.searchPlayers({q:pa.displayName})).players.find(p=>p.id===pa.id).relation,'request_received');});
  await check('duplicate/self/unavailable errors',async()=>{await errorCode(a.sendFriendRequest({playerId:pb.id}),'friend_request_exists');await errorCode(a.sendFriendRequest({playerId:pa.id}),'cannot_friend_yourself');await errorCode(a.sendFriendRequest({playerId:randomUUID()}),'player_not_found');});
  await check('decline and cancel',async()=>{let req=(await b.listFriendRequests()).incoming[0];assert.equal(await b.declineFriendRequest(req.id),undefined);assert.deepEqual((await a.listFriendRequests()).outgoing,[]);req=await a.sendFriendRequest({playerId:pb.id});assert.equal(await a.cancelFriendRequest(req.id),undefined);assert.deepEqual((await b.listFriendRequests()).incoming,[]);});
  await check('accept/list/already-friends/remove',async()=>{const req=await a.sendFriendRequest({playerId:pb.id});assert.equal((await b.acceptFriendRequest(req.id)).id,pa.id);assert.equal((await a.listFriends()).friends[0].id,pb.id);await errorCode(a.sendFriendRequest({playerId:pb.id}),'already_friends');assert.equal(await a.removeFriend(pb.id),undefined);assert.deepEqual(await b.listFriends(),{friends:[]});await errorCode(a.removeFriend(pb.id),'not_friends');});
  await check('reciprocal send accepts with friend DTO',async()=>{await a.sendFriendRequest({playerId:pb.id});const result=await b.sendFriendRequest({playerId:pa.id});assert.equal(result.id,pa.id);assert.equal(typeof result.since,'string');assert.equal(result.player,undefined);});
}catch(error){report('live verification',checks.length?'FAIL':'BLOCKED',error.code??error.cause?.code??'assertion_or_service_failure');process.exitCode=1;}
finally {
  // Only the two identified dedicated players; never remove unrelated friends.
  if(pa&&pb&&pa.externalId.startsWith('sdk-friends-test-')&&pb.externalId.startsWith('sdk-friends-test-')){
    try{if((await a.listFriends()).friends.some(p=>p.id===pb.id))await a.removeFriend(pb.id);
      for(const client of [a,b]){const requests=await client.listFriendRequests();for(const r of requests.outgoing)if([pa.id,pb.id].includes(r.player.id))await client.cancelFriendRequest(r.id);}
      report('dedicated-pair cleanup','PASS','No player records deleted.');
    }catch(error){report('dedicated-pair cleanup','FAIL',error.code??'cleanup_failed');process.exitCode=1;}
  }
  globalThis.fetch=original;
  console.log(JSON.stringify({checks,http},null,2));
}
