// Development-only sample service, never imported by production src. Prefix is
// provisional. DTOs/routes mirror the inspected Social API; data is fabricated.
const clans=[{id:'nightfall',name:'Nightfall Guild',memberCount:3,maxMembers:10},{id:'full',name:'Full demo clan',memberCount:10,maxMembers:10}];
let membership=null;
export function handleDevDiscoverRequest(req,res,url){
  if(!url.pathname.startsWith('/__dev__/social/'))return false;
  const route=url.pathname.slice('/__dev__/social'.length);
  const send=(status,data)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
  setTimeout(()=>{
    if(req.method==='GET'&&route==='/api/v1/players/me/clan')return membership?send(200,{clan:membership,role:'member'}):send(404,{error:{code:'not_in_clan',message:'Mock player is not in a clan'}});
    if(req.method==='GET'&&route==='/api/v1/clans'){const q=(url.searchParams.get('q')??'').toLowerCase();return q==='error'?send(503,{error:{code:'demo_error',message:'Explicit mock failure'}}):send(200,{clans:clans.filter(c=>c.name.toLowerCase().includes(q))});}
    if(req.method==='POST'&&/^\/api\/v1\/clans\/[^/]+\/join$/.test(route)){const clan=clans.find(c=>c.id===decodeURIComponent(route.split('/')[4]));if(!clan)return send(404,{error:{code:'clan_not_found',message:'Mock clan not found'}});if(clan.memberCount>=clan.maxMembers)return send(409,{error:{code:'clan_full',message:'Mock clan is full'}});membership={...clan,memberCount:clan.memberCount+1};return send(200,membership);}
    send(501,{error:{code:'demo_unsupported',message:'This development mock does not implement this action'}});
  },150);
  return true;
}
