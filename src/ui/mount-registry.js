// One SDK-owned mount per actual element, across widget kinds and SDK instances.
const mounts = new WeakSet();
export function assertContainerAvailable(container) {
  const view = container?.ownerDocument?.defaultView;
  if (!view || !(container instanceof view.HTMLElement)) {
    throw new TypeError('SDK mounting requires an HTML element container.');
  }
  if (mounts.has(container)) {
    throw new Error('This container already has an active SDK widget. Destroy it before mounting again.');
  }
}
export const reserveContainer = container => mounts.add(container);
export const releaseContainer = container => mounts.delete(container);
