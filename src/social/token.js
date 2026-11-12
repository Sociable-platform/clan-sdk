// Acquisitions and 401 retry-wave coordination. The game owns normal expiry caching.
export function createTokenAcquisition(callback, session) {
  const fresh = () => ({normal:null, refresh:null, version:0, latest:null});
  let state = fresh();
  session?.subscribe(() => {
    state.normal = state.refresh = state.latest = null;
    state = fresh();
  });
  function acquire(forceRefresh = false, rejectedVersion) {
    const current = state, ticket = session?.capture();
    if (current.refresh) return current.refresh;
    if (forceRefresh && current.latest && rejectedVersion < current.version) return Promise.resolve(current.latest);
    if (!forceRefresh && current.normal) return current.normal;
    const key = forceRefresh ? 'refresh' : 'normal';
    if (forceRefresh) current.latest = null;
    let supplied;
    try {
      session?.assert(ticket);
      supplied = callback({forceRefresh});
    } catch (error) { supplied = Promise.reject(error); }
    const pending = Promise.resolve(supplied).then(async token => {
      session?.assert(ticket);
      if (typeof token !== 'string' || !token || /\s/.test(token)) throw new TypeError('getPlayerToken must return a non-empty token string without whitespace.');
      if (!forceRefresh && current.refresh) return current.refresh;
      if (forceRefresh) {
        current.latest = {token, version:++current.version};
        return current.latest;
      }
      // A late normal callback must not restore a token superseded by a refresh.
      return current.latest && current.version > version ? current.latest : {token,version:current.version};
    }).finally(() => { if (current[key] === pending) current[key] = null; });
    const version = current.version;
    current[key] = pending;
    return pending;
  }
  return acquire;
}
