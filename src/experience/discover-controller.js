// No DOM or DTO assumptions here. The adapter maps an agreed response to the
// internal view model. The SDK has no default mapping until Social publishes it.
export function clanViewModels(value) {
  if (!Array.isArray(value)) throw new TypeError('clanAdapter must return an array of clan view models.');
  const ids = new Set();
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.name !== 'string' || !item.name.trim() || ids.has(item.id)) {
      throw new TypeError('Clan view models require unique non-empty string id and name.');
    }
    ids.add(item.id);
    const result = { id: item.id, name: item.name };
    for (const key of ['memberCount', 'maxMembers']) {
      if (item[key] !== undefined) {
        if (!Number.isSafeInteger(item[key]) || item[key] < (key === 'maxMembers' ? 1 : 0)) throw new TypeError(`Invalid clan view model ${key}.`);
        result[key] = item[key];
      }
    }
    if (item.emblemText !== undefined) {
      if (typeof item.emblemText !== 'string') throw new TypeError('Invalid emblemText.');
      result.emblemText = item.emblemText;
    }
    if (item.canJoin !== undefined) {
      if (typeof item.canJoin !== 'boolean') throw new TypeError('Invalid canJoin.');
      result.canJoin = item.canJoin;
    }
    return Object.freeze(result);
  });
}
export const isFull = clan => clan.memberCount !== undefined && clan.maxMembers !== undefined && clan.memberCount >= clan.maxMembers;

export function createDiscoverController({ listClans, joinClan, clanAdapter, onChange, onNavigate, onJoined, debounceMs = 250 }) {
  let state = { screen: 'discover', query: '', status: 'idle', clans: [], error: '', joinError: '', pendingJoin: null, joinedClanId: null };
  let dead = false;
  let revision = 0;
  let timer;
  let visit = 0;
  const emit = () => { if (!dead) onChange({ ...state, clans: [...state.clans] }); };
  const invalidate = () => { revision += 1; clearTimeout(timer); };
  async function load() {
    if (dead || state.screen !== 'discover') return;
    invalidate();
    const ticket = revision;
    state = { ...state, status: 'loading', error: '' };
    emit();
    try {
      const raw = await listClans(state.query ? { q: state.query } : {});
      if (dead || ticket !== revision) return;
      const clans = clanViewModels(clanAdapter(raw));
      state = { ...state, clans, status: clans.length ? 'ready' : 'empty' };
    } catch (error) {
      if (dead || ticket !== revision) return;
      state = { ...state, status: 'error', error: error?.message || 'Could not load clans.' };
    }
    emit();
  }
  return {
    start: load,
    retry: load,
    search(query) {
      if (dead || state.screen !== 'discover') return;
      invalidate(); // Invalidate now, not after the debounce delay.
      state = { ...state, query, status: 'loading', error: '' };
      emit();
      timer = setTimeout(load, debounceMs);
    },
    navigate(screen) {
      if (dead || !['discover', 'create'].includes(screen) || screen === state.screen) return;
      const previousScreen = state.screen;
      invalidate();
      visit += 1;
      state = { ...state, screen, error: '', joinError: '' };
      emit();
      onNavigate({ screen, previousScreen });
      if (screen === 'discover') void load();
    },
    async join(id) {
      if (dead || state.screen !== 'discover' || state.status !== 'ready' || state.pendingJoin || state.joinedClanId) return;
      const clan = state.clans.find(item => item.id === id);
      if (!clan || clan.canJoin === false || isFull(clan)) return;
      const currentVisit = visit;
      state = { ...state, pendingJoin: id, joinError: '' };
      emit();
      try {
        await joinClan(id); // Success is the HTTP outcome; no invented response DTO.
        if (dead) return;
        if (currentVisit !== visit) {
          state = { ...state, pendingJoin: null };
          emit(); // Release the guard, but do not apply a result to another visit.
          return;
        }
        state = { ...state, pendingJoin: null, joinedClanId: id };
        emit();
        if (currentVisit === visit && state.screen === 'discover') onJoined({ clanId: id });
      } catch (error) {
        if (dead) return;
        state = { ...state, pendingJoin: null, joinError: currentVisit === visit ? error?.message || 'Could not join clan.' : '' };
        emit();
      }
    },
    destroy() { dead = true; invalidate(); visit += 1; },
  };
}
