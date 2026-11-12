const sessions = new WeakMap();
export const bindPlayerSession = (sdk,session) => sessions.set(sdk,session);
export const playerSession = sdk => sessions.get(sdk);

export function createPlayerSession() {
  let generation = 0;
  const listeners = new Set();
  return {
    capture: () => generation,
    assert(ticket) {
      if (ticket !== generation) throw new DOMException('Player session changed.', 'AbortError');
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reset() { generation++; for (const listener of [...listeners]) listener(); },
  };
}
