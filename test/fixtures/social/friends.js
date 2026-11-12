// Copied from openapi/social.yaml examples, verified on backend origin/develop
// bdfc3d3f5d7360f7ada55c1b9622a3787989c49d (2026-11-11). Not live players.
export const player={id:'7f1e0c2a-5b3d-4e8f-9a10-2b3c4d5e6f70',gameId:'a6c1e2f0-1111-4222-8333-944455556666',externalId:'u_42',displayName:'Ali',createdAt:'2026-11-07T10:00:00Z'};
export const friend={id:'3b0c7a52-6d1e-4f0a-9c2b-1e2d3c4b5a69',displayName:'Aysel',since:'2026-11-10T08:00:00Z'};
export const sent={id:'9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',player:{id:friend.id,displayName:'Aysel'},createdAt:'2026-11-10T08:00:00Z'};
export const incoming={id:sent.id,player:{id:'7d2f1c0e-2b5a-4e8f-9a61-3c4d5e6f7a8b',displayName:'Murad'},createdAt:sent.createdAt};
export const search={players:[{id:friend.id,displayName:'Aysel',relation:'request_received',requestId:sent.id},{id:incoming.player.id,displayName:'Ayten',relation:'none'}]};
