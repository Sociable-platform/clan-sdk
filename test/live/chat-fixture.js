// Opt-in development verification only. No production import or persisted token.
import {readFile} from 'node:fs/promises';
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {init} from '../../src/index.js';
export async function prepareLiveChat() {
 const key=createPrivateKey(await readFile(process.env.LIVE_CHAT_DEV_KEY??'C:/Users/Nicat/GolandProjects/clan-backend/secrets/platform_jwt_private.pem'));
 const gameId=randomUUID(),tag='sdk-chat-test-'+randomUUID();
 const token=role=>{const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({sub:tag+'-'+role,gid:gameId,name:'SDK Live Chat '+role,typ:'player',iat:now,exp:now+900})).toString('base64url'),payload=head+'.'+body;return payload+'.'+sign(null,Buffer.from(payload),key).toString('base64url');};
 const clients=Object.fromEntries(['A','B'].map(role=>[role,init({socialUrl:'http://localhost:8082',realtimeUrl:'http://localhost:8083',getPlayerToken:async()=>token(role)})]));
 const [a,b]=await Promise.all([clients.A.getMyPlayer(),clients.B.getMyPlayer()]);
 const request=await clients.A.sendFriendRequest({playerId:b.id});await clients.B.acceptFriendRequest(request.id);
 let conversation;
 for(let i=0;i<40;i++){const result=await clients.A.listConversations();conversation=result.conversations.find(c=>c.kind==='dm'&&c.members.some(m=>m.id===b.id));if(conversation)break;await new Promise(done=>setTimeout(done,250));}
 console.log(JSON.stringify({liveChatSetup:conversation?'PASS':'BLOCKED',detail:conversation?'Two dedicated Social players are friends; Realtime returned their DM conversation.':'No DM conversation after friendship; check Realtime RabbitMQ consumer.',gameId}));
 return {handle(req,res,url){
  if(url.pathname!=='/__live__/chat-token')return false;
  const role=url.searchParams.get('player');if(!['A','B'].includes(role)){res.writeHead(400).end();return true;}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'http://localhost:5174'});res.end(JSON.stringify({token:token(role),gameId}));return true;
 },async cleanup(){try{await clients.A.removeFriend(b.id);console.log('Live chat dedicated-pair relationship cleaned; player records retained.');}catch{console.log('Live chat cleanup failed; only dedicated test pair affected.');}}};
}
