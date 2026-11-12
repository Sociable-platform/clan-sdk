import {createRequest} from '../social/request.js';
const clients=new WeakMap();
export const chatClient=sdk=>clients.get(sdk);
export function bindChatClient(sdk,options,auth) {
  if(options.realtimeUrl===undefined)return;
  let url;try{url=new URL(options.realtimeUrl);}catch{throw new TypeError('realtimeUrl must be an absolute HTTP(S) service URL.');}
  if(typeof options.realtimeUrl!=='string'||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new TypeError('realtimeUrl must use HTTP(S), without credentials, query or fragment.');
  const base=url.href.replace(/\/+$/,'');
  const request=createRequest(base,auth.getPlayerToken,auth.session,auth.acquire);
  clients.set(sdk,{
    acquire:auth.acquire,session:auth.session,
    socketUrl(token){const ws=new URL(base+'/api/v1/ws');ws.protocol=ws.protocol==='https:'?'wss:':'ws:';ws.searchParams.set('token',token);return ws.href;},
    listConversations:()=>request('/api/v1/conversations'),
    listMessages(id,{before,limit=50}={}) {
      if(typeof id!=='string'||!id.trim()||['.','..'].includes(id))throw new TypeError('conversationId must be a non-empty ID.');
      if(!Number.isInteger(limit)||limit<1||limit>100)throw new TypeError('limit must be an integer from 1 to 100.');
      if(before!==undefined&&(typeof before!=='string'||!before.trim()))throw new TypeError('before must be a message ID.');
      const query=new URLSearchParams({limit:String(limit)});if(before!==undefined)query.set('before',before);
      return request(`/api/v1/conversations/${encodeURIComponent(id)}/messages?${query}`);
    },
  });
}
