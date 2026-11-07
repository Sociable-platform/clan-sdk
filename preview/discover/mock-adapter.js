// DEVELOPMENT ONLY. These wire keys and sample values are provisional, not
// confirmed Social DTOs. Never import this adapter from the production entrypoint.
export function mockClanAdapter(response) {
  return response.demoClans.map(clan => ({ id:clan.key, name:clan.title, emblemText:clan.badge,
    memberCount:clan.count, maxMembers:clan.limit, canJoin:clan.open }));
}
