// Opt-in real local integration, never imported by production SDK code.
import {readFile} from 'node:fs/promises';
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {init} from '../../src/index.js';
export async function prepareLiveLeave() {
 if(!process.env.LIVE_LEAVE_DEV_KEY)throw new Error('Set LIVE_LEAVE_DEV_KEY for the opt-in dedicated-player test.');
 const key=createPrivateKey(await readFile(process.env.LIVE_LEAVE_DEV_KEY)),game=randomUUID(),prefix='sdk-leave-test-'+randomUUID();
 const token=role=>{const now=Math.floor(Date.now()/1000),h=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({sub:prefix+role,gid:game,name:'SDK Leave '+role,typ:'player',iat:now,exp:now+900})).toString('base64url'),p=h+'.'+b;return p+'.'+sign(null,Buffer.from(p),key).toString('base64url');};
 const owner=init({socialUrl:'http://localhost:8082',getPlayerToken:async()=>token('owner')}),member=init({socialUrl:'http://localhost:8082',getPlayerToken:async()=>token('member')});
 const clan=await owner.createClan({name:'SDK Leave '+randomUUID().slice(0,8)});await member.joinClan(clan.id);
 console.log('Live Leave setup PASS: dedicated member joined dedicated owner clan.');
 return {handle(req,res,url){if(url.pathname!=='/__live__/leave-token')return false;res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'http://localhost:5174'});res.end(JSON.stringify({token:token('member')}));return true;},async cleanup(){await owner.leaveClan(clan.id);console.log('Dedicated test clan cleaned; player records retained.');}};
}
