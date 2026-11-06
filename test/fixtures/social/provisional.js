// PROVISIONAL TEST FIXTURES ONLY. Envelopes, member ID/name keys, join result
// and unspecified success statuses are not confirmed backend contracts.
// The production client must return JSON without depending on these shapes.
export const provisionalClan = {
  id: 'clan-1', name: 'Dragons', memberCount: 1, maxMembers: 10,
};
export const provisionalSuccess = {
  list: { clans: [provisionalClan] },
  create: provisionalClan,
  join: { joined: true },
  mine: { clan: provisionalClan, role: 'owner' },
  members: { members: [{ id: 'player-1', displayName: 'Player One', role: 'owner' }] },
};
