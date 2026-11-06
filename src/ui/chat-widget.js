import { normalizeChatConfig } from '../config/chat.js';

// Shared across SDK instances, but keyed by actual containers (never player data).
const activeMounts = new WeakMap();

/** Mount a disconnected visual shell. No tokens, HTTP, timers or sockets. */
export function mountChatWidget({ container, config } = {}) {
  const view = container?.ownerDocument?.defaultView;
  if (!view || !(container instanceof view.HTMLElement)) {
    throw new TypeError('mountChatWidget requires an HTML element container.');
  }
  if (activeMounts.has(container)) {
    throw new Error('This container already has an active SDK widget. Destroy it before mounting again.');
  }
  const normalized = normalizeChatConfig(config);
  const doc = container.ownerDocument;
  const host = doc.createElement('div');
  host.setAttribute('data-clan-sdk-widget', 'chat');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    section {
      width: 100%; height: 100%; overflow: auto;
      border: 1px solid var(--clan-primary); border-radius: var(--clan-radius);
      background: var(--clan-background); color: var(--clan-text);
      padding: 16px; font: 14px/1.5 system-ui, sans-serif;
    }
    h2 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
    p { margin: 0; }
  `;
  const region = doc.createElement('section');
  region.setAttribute('role', 'region');
  const heading = doc.createElement('h2');
  const status = doc.createElement('p');
  status.textContent = 'Chat is not connected.';
  region.append(heading, status);
  shadow.append(style, region);

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
    set('--clan-primary', next.theme.primaryColor);
    set('--clan-background', next.theme.backgroundColor);
    set('--clan-text', next.theme.textColor);
    set('--clan-radius', `${next.theme.borderRadius}px`);
    const chats = next.tabs.find(tab => tab.id === 'chats');
    heading.textContent = chats.label;
    region.setAttribute('aria-label', chats.label);
  }

  apply(normalized);
  let destroyed = false;
  const handle = {
    updateConfig(nextConfig) {
      if (destroyed) throw new Error('Cannot update a destroyed SDK widget.');
      // Validate the entire replacement before changing a single DOM/style value.
      const next = normalizeChatConfig(nextConfig);
      apply(next);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      host.remove();
      activeMounts.delete(container);
    },
  };
  container.append(host);
  activeMounts.set(container, handle);
  return handle;
}
