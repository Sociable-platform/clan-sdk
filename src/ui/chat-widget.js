import { normalizeChatConfig } from '../config/chat.js';
import { createChatRenderer } from './chat-renderer.js';
import { assertContainerAvailable, reserveContainer, releaseContainer } from './mount-registry.js';

// Shared across SDK instances, but keyed by actual containers (never player data).

/** Legacy normalization/lifecycle; @clan/ui owns local visual state, never transport. */
export function assertChatContainerAvailable(container) {
  assertContainerAvailable(container);
}

export function mountChatWidget({ container, config } = {}) {
  assertChatContainerAvailable(container);
  let normalized = normalizeChatConfig(config);
  let destroyed = false;
  const doc = container.ownerDocument;
  const host = doc.createElement('div');
  host.setAttribute('data-clan-sdk-widget', 'chat');
  const shadow = host.attachShadow({ mode: 'open' });
  const renderer = createChatRenderer(shadow);

  // Inline important host rules resist ordinary host-page rules, including !important.
  // Ancestor transforms/containment still obey normal browser fixed-position rules.
  const set = (name, value) => host.style.setProperty(name, value, 'important');
  set('all', 'initial');
  set('display', 'block');
  set('position', 'fixed');
  set('box-sizing', 'border-box');
  set('margin', '0');
  set('padding', '0');
  set('border', '0');
  set('z-index', '1000');
  set('max-width', 'max(0px, calc(100vw - 16px))');
  set('max-height', 'max(0px, calc(100dvh - 16px))');

  function apply(next) {
    set('width', `${next.layout.width}px`);
    set('height', `${next.layout.height}px`);
    for (const edge of ['top', 'right', 'bottom', 'left']) set(edge, 'auto');
    const [vertical, horizontal] = next.layout.position.split('-');
    set(vertical, '8px');
    set(horizontal, '8px');
    renderer.update({ config: next });
  }

  apply(normalized);
  const handle = {
    updateConfig(nextConfig) {
      if (destroyed) throw new Error('Cannot update a destroyed SDK widget.');
      // Validate the entire replacement before changing a single DOM/style value.
      const next = normalizeChatConfig(nextConfig);
      apply(next);
      normalized = next;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
      host.remove();
      releaseContainer(container);
    },
  };
  container.append(host);
  reserveContainer(container);
  return handle;
}
