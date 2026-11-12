import { loadChatConfig, checkAbort, abortError } from '../config/load.js';
import { mountChatWidget, assertChatContainerAvailable } from './chat-widget.js';

/** Remote config orchestration, separate from the visual renderer and Social auth. */
export async function mountChatWidgetFromUrl({ container, configUrl, signal } = {}) {
  assertChatContainerAvailable(container);
  // Freeze URL resolution at mount time; later host base-URL changes do not retarget refreshes.
  const baseUrl = container.ownerDocument.baseURI;
  const config = await loadChatConfig(configUrl, { signal, baseUrl });
  checkAbort(signal);
  const widget = mountChatWidget({ container, config });
  let revision = 0;
  let pending;
  let destroyed = false;

  function invalidate(message) {
    revision += 1;
    pending?.abort(abortError(message));
    pending = undefined;
  }
  function requireActive() {
    if (destroyed) throw abortError('Remote configuration widget was destroyed.');
  }

  return {
    updateConfig(nextConfig) {
      requireActive();
      // A failed local update must not change config or cancel a valid pending refresh.
      widget.updateConfig(nextConfig);
      invalidate('Configuration loading was superseded by a local update.');
    },
    async refreshConfig() {
      requireActive();
      invalidate('Configuration loading was superseded by a newer refresh.');
      const ticket = revision;
      const controller = new AbortController();
      pending = controller;
      try {
        const next = await loadChatConfig(configUrl, { signal: controller.signal, baseUrl });
        if (destroyed || ticket !== revision) throw abortError('Configuration loading was superseded.');
        widget.updateConfig(next);
      } finally {
        if (pending === controller) pending = undefined;
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      invalidate('Remote configuration widget was destroyed.');
      widget.destroy();
    },
  };
}
