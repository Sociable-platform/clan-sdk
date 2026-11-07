// DEVELOPMENT ONLY. PROVISIONAL route and bare chat-v1 JSON response contract.
// This is an HTTP mock, not backend storage, a publishing API or chat transport.
let rotatingRequest = 0;
export function handleDevConfigRequest(req, res, url) {
  if (url.pathname !== '/__dev__/chat-config') return false;
  if (req.method !== 'GET') { res.writeHead(405).end(); return true; }
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Dev-Contract': 'provisional' };
  if (url.searchParams.get('failure') === 'http') {
    res.writeHead(503, headers).end('{"developmentError":"provisional failure"}');
  } else if (url.searchParams.get('failure') === 'json') {
    res.writeHead(200, headers).end('{malformed');
  } else if (url.searchParams.get('failure') === 'config') {
    res.writeHead(200, headers).end('{"schemaVersion":99}');
  } else {
    const variant = url.searchParams.get('variant');
    const alternate = variant === 'alternate' || (variant !== 'reference' && ++rotatingRequest % 2 === 0);
    const config = alternate ? {
      schemaVersion: 1,
      layout: { width: 340, height: 420 },
      theme: { primaryColor: '#3758A8', backgroundColor: '#FFFFFF', textColor: '#171923', borderRadius: 8 },
      tabs: [{ id: 'chats', label: 'Game messages', icon: 'message-circle', enabled: true, order: 0 }],
    } : { schemaVersion: 1 };
    res.writeHead(200, headers).end(JSON.stringify(config));
  }
  return true;
}
