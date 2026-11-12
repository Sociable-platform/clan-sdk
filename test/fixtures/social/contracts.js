// Synthetic test values in the confirmed wire shapes from the local backend
// feat/TEAM-96-my-clan-and-members@6d05bceb, openapi/social.yaml and handlers.
// These are recording-fetch fixtures, not evidence of an authenticated live run.
const clan = { id:'3b0c7a52-6d1e-4f0a-9c2b-1e2d3c4b5a69', name:'Wolves', memberCount:3, maxMembers:10 };
export const socialContracts = {
  list:{clans:[clan]},
  create:{...clan,memberCount:1},
  join:{...clan,memberCount:4},
  mine:{clan,role:'owner'},
  members:{members:[{playerId:'7f1e0c2a-5b3d-4e8f-9a10-2b3c4d5e6f70',displayName:'Ali',role:'owner',joinedAt:'2026-11-07T10:00:00Z'}]},
};
