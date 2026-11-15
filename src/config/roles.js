// The role order @clan/ui uses for `clan.roles` (lowest power first), so a
// Members-screen setRole(target) maps to Social's one-step promote/demote.
// The renderer does not export its helper; keep this in step with
// @clan/ui src/data/roles.js. The server stays the permission authority.
const FALLBACK = ['member', 'leader'];

export function roleOrder(config) {
  const raw = Array.isArray(config?.clan?.roles) ? config.clan.roles : [];
  const seen = new Set();
  const ids = raw.map(role => role?.id).filter(id => typeof id === 'string' && id !== '' && !seen.has(id) && seen.add(id));
  return ids.length >= 2 ? ids : FALLBACK;
}

export function roleIndex(order, id) {
  const found = order.indexOf(id);
  if (found >= 0) return found;
  if (id === 'owner') return order.length - 1;
  if (id === 'member') return 0;
  return -1;
}

/** 'promote' or 'demote' when target is exactly one step from the current role; otherwise null. */
export function roleStep(config, currentRole, targetRole) {
  const order = roleOrder(config);
  const from = roleIndex(order, currentRole), to = roleIndex(order, targetRole);
  if (from < 0 || to < 0) return null;
  return to === from + 1 ? 'promote' : to === from - 1 ? 'demote' : null;
}
