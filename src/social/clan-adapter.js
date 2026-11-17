/** Social's MemberRole DTO returned by promote/demote. */
export function memberRoleAdapter(value) {
  if (!value || typeof value !== 'object'
    || typeof value.playerId !== 'string' || !value.playerId.trim()
    || typeof value.role !== 'string' || !value.role.trim()) {
    throw new TypeError('Social member role response must contain playerId and role.');
  }
  return {id:value.playerId, role:value.role, ...(typeof value.displayName === 'string' && value.displayName.trim() ? {name:value.displayName} : {})};
}

/** Discover mapping for Social's ClanList DTO, confirmed in
 * services/social/internal/handler/clans.go and openapi/social.yaml.
 * Core HTTP methods still return successful JSON unchanged.
 */
export function socialClanAdapter(response) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.clans)) {
    throw new TypeError('Social clan list must contain a clans array.');
  }
  return response.clans.map((clan, index) => {
    if (!clan || typeof clan !== 'object'
      || typeof clan.id !== 'string' || !clan.id.trim()
      || typeof clan.name !== 'string' || !clan.name.trim()
      || !Number.isSafeInteger(clan.memberCount) || clan.memberCount < 0
      || !Number.isSafeInteger(clan.maxMembers) || clan.maxMembers <= 0) {
      throw new TypeError(`Invalid Social clan at clans[${index}]: expected id, name, memberCount and maxMembers.`);
    }
    const details={};
    for(const field of ['badge','description','tag'])if(clan[field]!==undefined){
      if(typeof clan[field]!=='string')throw new TypeError(`Invalid Social clan at clans[${index}].${field}: expected string.`);
      details[field]=clan[field];
    }
    // joinPolicy: 'open' or 'closed' (a player of a closed clan asks, and a leader accepts). Anything else, or nothing from a
    // Social before closed clans, is left out and the clan reads as open. requested: only ever true, the caller asked this clan.
    if(['open','closed'].includes(clan.joinPolicy))details.joinPolicy=clan.joinPolicy;
    if(clan.requested===true)details.requested=true;
    return { id:clan.id, name:clan.name, memberCount:clan.memberCount, maxMembers:clan.maxMembers,...details };
  });
}

/** Social's JoinRequestList: the players who asked to join the caller's closed clan, oldest first. */
export function joinRequestsAdapter(response) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.requests)) {
    throw new TypeError('Social join request list must contain a requests array.');
  }
  return response.requests.map((request, index) => {
    if (!request || typeof request !== 'object' || typeof request.id !== 'string' || !request.id.trim()
      || typeof request.playerId !== 'string' || !request.playerId.trim() || typeof request.displayName !== 'string') {
      throw new TypeError(`Invalid Social join request at requests[${index}]: expected id, playerId and displayName.`);
    }
    return {id:request.id, playerId:request.playerId, name:request.displayName, ...(typeof request.createdAt==='string'?{at:request.createdAt}:{})};
  });
}
