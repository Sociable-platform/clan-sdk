// TEMPORARY UI. Replace through chat-renderer.js when the frontend's shared
// dashboard/game components arrive. Do not grow a second permanent chat design.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = Object.freeze({
  'message-circle': doc => {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('data-icon', 'message-circle');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z');
    svg.append(path);
    return svg;
  },
});

export function createPlaceholderChatRenderer(shadow, actions) {
  const doc = shadow.ownerDocument;
  const node = (tag, text) => {
    const result = doc.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const style = node('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    section {
      width: 100%; height: 100%; min-width: 0; min-height: 0;
      display: flex; flex-direction: column; gap: 4px; overflow: auto;
      border: 1px solid var(--clan-primary); border-radius: var(--clan-radius);
      background: var(--clan-background); color: var(--clan-text);
      padding: 8px; font: 14px/1.4 system-ui, sans-serif;
    }
    header { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; flex: 0 0 auto; }
    h2 { margin: 0; font-size: 16px; line-height: 20px; font-weight: 600; }
    p { margin: 0; }
    [data-connection] { font-size: 10px; line-height: 12px; }
    [role="tablist"] { flex: 0 0 auto; }
    button, textarea { font: inherit; color: inherit; }
    [role="tab"] { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 6px;
      border: 0; border-bottom: 2px solid var(--clan-primary); background: transparent; font-size: 12px; }
    [data-tab-label] { overflow-wrap: anywhere; }
    svg { flex-shrink: 0; }
    [data-message-area] { flex: 1 1 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
    [data-message-area] p { font-size: 12px; }
    ol { padding: 0; margin: 0; list-style: none; }
    form { flex: 0 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px; margin: 0; }
    label, [data-availability] { grid-column: 1 / -1; font-size: 11px; line-height: 14px; }
    textarea { min-width: 0; width: 100%; height: 36px; padding: 4px; resize: none;
      border: 1px solid var(--clan-primary); border-radius: 4px;
      background: var(--clan-background); }
    textarea::placeholder { color: inherit; opacity: .65; }
    button[type="submit"] { border: 1px solid currentColor; border-radius: 4px; padding: 4px 8px;
      background: var(--clan-primary); color: var(--clan-text); }
    button:disabled { cursor: not-allowed; opacity: .65; }
    :focus-visible { outline: 2px solid var(--clan-primary); outline-offset: 2px; }
  `;
  const region = node('section');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Chat');
  region.setAttribute('data-renderer', 'temporary-placeholder');
  const header = node('header');
  const heading = node('h2', 'Chat');
  const connection = node('p');
  connection.setAttribute('role', 'status');
  connection.setAttribute('data-connection', '');
  header.append(heading, connection);

  const tabs = node('div');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Chat views');
  const tab = node('button');
  tab.type = 'button';
  tab.id = 'chat-tab';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'true');
  tab.setAttribute('aria-controls', 'chat-messages');
  const icon = node('span');
  const tabLabel = node('span');
  tabLabel.setAttribute('data-tab-label', '');
  tab.append(icon, tabLabel);
  tabs.append(tab);

  const messageArea = node('div');
  messageArea.id = 'chat-messages';
  messageArea.tabIndex = 0;
  messageArea.setAttribute('role', 'tabpanel');
  messageArea.setAttribute('aria-labelledby', tab.id);
  messageArea.setAttribute('data-message-area', '');
  const empty = node('p');
  const messages = node('ol');
  messages.setAttribute('aria-label', 'Messages');
  messageArea.append(empty, messages);

  const form = node('form');
  const label = node('label', 'Message');
  label.htmlFor = 'chat-draft';
  const input = node('textarea');
  input.id = label.htmlFor;
  input.name = 'message';
  input.rows = 1;
  input.placeholder = 'Write a message';
  input.setAttribute('aria-describedby', 'chat-availability');
  const send = node('button', 'Send');
  send.type = 'submit';
  send.title = 'Messaging is unavailable until transport is connected.';
  const availability = node('p');
  availability.id = 'chat-availability';
  availability.setAttribute('role', 'status');
  availability.setAttribute('data-availability', '');
  form.append(label, input, send, availability);
  region.append(header, tabs, messageArea, form);

  const onInput = () => actions.onDraftChange(input.value);
  const onSubmit = event => { event.preventDefault(); actions.onSend(); };
  input.addEventListener('input', onInput);
  form.addEventListener('submit', onSubmit);
  shadow.append(style, region);
  let destroyed = false;
  let currentIcon;
  return {
    update({ config, state }) {
      if (destroyed) return;
      // Configuration is normalized by the SDK. No defaults/schema/transport here.
      const chats = config.tabs.find(entry => entry.id === 'chats');
      tabLabel.textContent = chats.label;
      if (chats.icon !== currentIcon) {
        icon.replaceChildren(ICONS[chats.icon](doc));
        currentIcon = chats.icon;
      }
      connection.textContent = state.connection === 'disconnected' ? 'Chat is not connected.' : '';
      empty.textContent = state.messageState === 'empty' ? 'No messages yet.' : '';
      availability.textContent = state.availability === 'unavailable' ? 'Messaging unavailable.' : '';
      if (input.value !== state.draft) input.value = state.draft;
      send.disabled = !state.canSend;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      input.removeEventListener('input', onInput);
      form.removeEventListener('submit', onSubmit);
      region.remove();
      style.remove();
    },
  };
}
