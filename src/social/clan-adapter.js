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
    return { id:clan.id, name:clan.name, memberCount:clan.memberCount, maxMembers:clan.maxMembers,...details };
  });
}
