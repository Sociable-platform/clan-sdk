// Explicit development mock HTTP service. Route prefix and response envelope are
// provisional; this is not a backend implementation or a confirmed DTO contract.
const clans = [
  {key:'nightfall',title:'Nightfall Guild',badge:'♜',count:32,limit:50,open:true},
  {key:'dawn',title:'Dawn Travelers',badge:'☀',count:50,limit:50,open:true},
  {key:'moon',title:'Moon Guardians',badge:'☾',count:18,limit:50,open:true},
  {key:'rejected',title:'Server rejection example',badge:'◇',count:9,limit:10,open:true},
];
export function handleDevDiscoverRequest(req,res,url) {
  if (!url.pathname.startsWith('/__dev__/social/')) return false;
  const send=(status,data) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
  const route=url.pathname.slice('/__dev__/social'.length);
  setTimeout(() => {
    if (res.destroyed) return;
    if (req.method==='GET' && route==='/api/v1/clans') {
      const q=(url.searchParams.get('q')??'').toLowerCase();
      if (q==='error') send(503,{error:{code:'demo_unavailable',message:'Provisional demo error. Change the search and retry.'}});
      else send(200,{demoClans:clans.filter(clan=>clan.title.toLowerCase().includes(q))});
    } else if (req.method==='POST' && /^\/api\/v1\/clans\/[^/]+\/join$/.test(route)) {
      const id=decodeURIComponent(route.split('/')[4]); const clan=clans.find(c=>c.key===id);
      if (!clan) send(404,{error:{code:'demo_not_found',message:'Demo clan not found.'}});
      else if (clan.count>=clan.limit || id==='rejected') send(409,{error:{code:'clan_full',message:'Demo rejection: this clan is now full.'}});
      else { res.writeHead(204).end(); } // Provisional success status, no invented result DTO.
    } else send(404,{error:{code:'demo_route_missing',message:'Unknown provisional demo route.'}});
  },300);
  return true;
}
