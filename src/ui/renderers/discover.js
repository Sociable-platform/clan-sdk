import { isFull } from '../../experience/discover-controller.js';

/** Temporary visual implementation. Receives data/actions, never fetches. */
export function createDiscoverRenderer(shadow, actions) {
  const doc = shadow.ownerDocument;
  const listeners = [];
  const node = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const listen = (element, event, fn) => {
    element.addEventListener(event, fn);
    listeners.push(() => element.removeEventListener(event, fn));
  };
  const style = node('style');
  style.textContent = `
    :host { color-scheme:dark; } * { box-sizing:border-box; } [hidden] { display:none!important; }
    .widget { color-scheme:dark; color:var(--text); background:var(--background); border:1px solid #ffffff22;
      border-radius:var(--radius); padding:var(--padding); font-family:var(--font); font-size:var(--body);
      overflow:auto; max-height:calc(100dvh - 24px); line-height:1.5; }
    header { display:flex; gap:10px; align-items:center; padding-bottom:18px; border-bottom:1px solid #ffffff18; margin-bottom:24px; }
    header strong { font-size:14px; } header span:last-child { margin-left:auto; font-size:11px; opacity:.7; }
    .sections { display:flex; flex-direction:column; gap:20px; }
    h2,h3,p { margin:0; } h2 { font-size:var(--heading); line-height:1.25; margin-top:14px; margin-bottom:8px; }
    h3 { font-size:12px; margin-bottom:4px; } p { opacity:.78; overflow-wrap:anywhere; }
    .hero { text-align:var(--align); } .hero-icon { display:inline-grid; place-items:center; width:46px; height:46px; background:var(--accent); color:#171923; border-radius:12px; font-size:28px; }
    input,button { font:inherit; color:inherit; } input { width:100%; min-width:0; padding:12px; margin-top:6px; background:#ffffff08; border:1px solid #ffffff35; border-radius:var(--input-radius); }
    button { cursor:pointer; border:1px solid #ffffff35; border-radius:var(--button-radius); background:transparent; padding:10px 14px; min-height:40px; }
    button:hover:enabled { border-color:var(--accent); } button:disabled { cursor:default; opacity:.5; }
    button:focus-visible,input:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
    .cards { display:flex; flex-direction:column; gap:10px; list-style:none; padding:0; margin:14px 0 0; }
    .card { display:flex; align-items:center; gap:10px; border:1px solid #ffffff25; border-radius:12px; padding:12px; }
    .clan-copy { flex:1; min-width:0; } .clan-name { display:block; font-size:13px; overflow-wrap:anywhere; } .metadata { font-size:11px; opacity:.7; }
    .emblem { font-size:23px; max-width:50px; overflow:hidden; } .join { color:var(--accent); padding:7px 11px; }
    .create { width:100%; background:var(--accent); color:#171923; border-color:transparent; font-weight:700; }
    .feedback { margin-top:12px; } .feedback p { margin-bottom:10px; } .handoff p { margin-bottom:16px; }
    @media(max-width:350px) { .card { flex-wrap:wrap; } .join { margin-left:auto; } }
  `;
  const widget = node('section', 'widget');
  widget.setAttribute('aria-label', 'Clan experience');
  const header = node('header');
  const brand = node('strong', '', '♜  Clan hub');
  const title = node('span');
  header.append(brand, title);
  const content = node('div', 'sections');
  const feedback = node('div', 'feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  // Navigation handoff only: there is no Create screen/form implementation.
  const handoff = node('div', 'handoff');
  handoff.hidden = true;
  handoff.append(node('p', '', 'Create navigation requested. This screen is not installed.'));
  const back = node('button', '', 'Back to Discover');
  back.type = 'button';
  listen(back, 'click', () => actions.onNavigate('discover'));
  handoff.append(back);
  widget.append(header, content, feedback, handoff);
  shadow.append(style, widget);
  const sections = new Map();
  let lastConfig;
  let lastState;
  let dead = false;
  function sectionView(section) {
    const root = node('div', section.type);
    root.dataset.sectionId = section.id;
    const view = { root, type: section.type, cleanup: [] };
    const bind = (element, event, fn) => {
      element.addEventListener(event, fn);
      view.cleanup.push(() => element.removeEventListener(event, fn));
    };
    if (section.type === 'hero') {
      const icon = node('span', 'hero-icon', '♜'); // Explicit decorative brand glyph, not a clan emblem.
      icon.setAttribute('aria-hidden', 'true');
      view.label = node('h2'); view.text = node('p'); root.append(icon, view.label, view.text);
    } else if (section.type === 'search') {
      const label = node('label');
      view.label = node('span'); view.input = node('input');
      view.input.type = 'search';
      view.input.autocomplete = 'off';
      bind(view.input, 'input', () => actions.onSearch(view.input.value));
      label.append(view.label, view.input); root.append(label);
    } else if (section.type === 'clans') {
      view.label = node('h3'); view.text = node('p'); view.cards = node('ul', 'cards');
      // Delegation avoids retaining listeners for removed cards.
      bind(view.cards, 'click', event => {
        const button = event.target.closest('button[data-clan-id]');
        if (button && !button.disabled) actions.onJoin(button.dataset.clanId);
      });
      root.append(view.label, view.text, view.cards);
    } else if (section.type === 'button') {
      view.button = node('button', 'create'); view.button.type = 'button';
      bind(view.button, 'click', () => actions.onNavigate('create')); root.append(view.button);
    }
    return view;
  }
  function applyConfig(config) {
    for (const [name, value] of Object.entries({ accent:config.theme.accent, background:config.theme.background, text:config.theme.text,
      radius:`${config.theme.radius}px`, 'button-radius':`${config.theme.buttonRadius}px`, 'input-radius':`${config.theme.inputRadius}px`,
      padding:`${config.padding}px`, heading:`${config.headingSize}px`, body:`${config.bodySize}px`, align:config.align })) {
      widget.style.setProperty(`--${name}`, value);
    }
    widget.style.setProperty('--font', config.theme.font);
    title.textContent = config.name;
    const visible = config.sections.filter(section => section.visible);
    for (const [id, view] of sections) {
      const next = visible.find(section => section.id === id);
      if (!next || next.type !== view.type) {
        view.cleanup.forEach(remove => remove()); view.root.remove(); sections.delete(id);
      }
    }
    let cursor = content.firstChild;
    for (const section of visible) {
      let view = sections.get(section.id);
      if (!view) { view = sectionView(section); sections.set(section.id, view); }
      if (view.root !== cursor) content.insertBefore(view.root, cursor);
      cursor = view.root.nextSibling;
      if (view.label) view.label.textContent = section.label;
      if (view.text) view.text.textContent = section.text;
      if (view.input) {
        view.input.placeholder = section.text;
        view.input.setAttribute('aria-label', section.label || 'Search clans');
      }
      if (view.button) view.button.textContent = `${section.label} →`;
    }
  }
  function applyState(state) {
    const discovering = state.screen === 'discover';
    content.hidden = !discovering; feedback.hidden = !discovering; handoff.hidden = discovering;
    for (const view of sections.values()) {
      if (view.input && view.input.value !== state.query) view.input.value = state.query;
      if (!view.cards) continue;
      view.cards.replaceChildren();
      view.cards.setAttribute('aria-busy', String(state.status === 'loading'));
      if (state.status !== 'ready') continue;
      for (const clan of state.clans) {
        const card = node('li', 'card');
        if (clan.emblemText) { const emblem = node('span', 'emblem', clan.emblemText); emblem.setAttribute('aria-hidden', 'true'); card.append(emblem); }
        const copy = node('div', 'clan-copy'); copy.append(node('strong', 'clan-name', clan.name));
        const details = [];
        if (clan.memberCount !== undefined && clan.maxMembers !== undefined) details.push(`${clan.memberCount}/${clan.maxMembers} members`);
        else if (clan.memberCount !== undefined) details.push(`${clan.memberCount} members`);
        else if (clan.maxMembers !== undefined) details.push(`Capacity ${clan.maxMembers}`);
        if (isFull(clan)) details.push('Full');
        else if (clan.canJoin === false) details.push('Unavailable');
        else if (clan.canJoin === true) details.push('Open');
        if (details.length) copy.append(node('p', 'metadata', details.join(' · ')));
        const joined = state.joinedClanId === clan.id;
        const button = node('button', 'join', state.pendingJoin === clan.id ? 'Joining…' : joined ? 'Joined' : 'Join');
        button.type = 'button'; button.dataset.clanId = clan.id;
        button.setAttribute('aria-label', `${button.textContent} ${clan.name}`);
        button.disabled = Boolean(state.pendingJoin || state.joinedClanId || isFull(clan) || clan.canJoin === false);
        card.append(copy, button); view.cards.append(card);
      }
    }
    feedback.replaceChildren();
    if (state.status === 'loading') feedback.append(node('p', '', 'Loading clans…'));
    if (state.status === 'empty') feedback.append(node('p', '', 'No clans found. Try another search.'));
    if (state.status === 'error') {
      feedback.append(node('p', '', state.error));
      const retry = node('button', '', 'Retry'); retry.type = 'button'; retry.dataset.action = 'retry'; feedback.append(retry);
    }
    if (state.joinError) feedback.append(node('p', '', state.joinError));
    if (state.joinedClanId) feedback.append(node('p', '', 'Joined successfully. Waiting for the game to continue.'));
  }
  listen(feedback, 'click', event => { if (event.target.closest('[data-action="retry"]')) actions.onRetry(); });
  return {
    update({ config, state }) {
      if (dead) return;
      if (config !== lastConfig) { applyConfig(config); lastConfig = config; }
      lastState = state ?? lastState;
      if (lastState) applyState(lastState);
    },
    destroy() {
      dead = true;
      listeners.forEach(remove => remove());
      sections.forEach(view => view.cleanup.forEach(remove => remove())); sections.clear();
      widget.remove(); style.remove();
    },
  };
}
