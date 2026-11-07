import { init, ConfigError, normalizeChatConfig } from '/src/index.js';
import { createChatRenderer } from '/src/ui/chat-renderer.js';
import { createChatState } from '/src/ui/chat-state.js';
import { registerRemoteConfigTests } from './remote-config-tests.js';
import { registerDiscoverTests } from './discover-tests.js';

const sdk = init({ socialUrl: 'http://localhost:8082', getPlayerToken: () => { throw new Error('Shell must not request a token'); } });
const sandbox = document.querySelector('#sandbox');
const results = document.querySelector('#results');
const cases = [];
const test = (name, run) => cases.push({ name, run });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const config = (extra = {}) => ({ schemaVersion: 1, ...extra });
const container = () => sandbox.appendChild(document.createElement('div'));
const host = target => target.querySelector('[data-clan-sdk-widget="chat"]');
const fail = (run, predicate) => {
  try { run(); } catch (error) { assert(predicate(error), error.message); return; }
  throw new Error('Expected rejection');
};

test('mount creates an isolated, explicitly disconnected shell', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  assert(host(target).shadowRoot.querySelector('h2').textContent === 'Chat', 'Missing neutral heading');
  assert(host(target).shadowRoot.querySelector('[role="tab"]').textContent === 'Chats', 'Missing configured tab');
  assert(host(target).shadowRoot.textContent.includes('Chat is not connected.'), 'Must report disconnected');
  assert(host(target).shadowRoot.querySelector('button[type="submit"]').disabled, 'Messaging must be unavailable');
  assert(host(target).shadowRoot.querySelector('ol').children.length === 0, 'No fake messages');
  widget.destroy();
});

test('all four corners position the shell eight pixels from viewport edges', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    widget.updateConfig(config({ layout: { position, width: 120, height: 100 } }));
    const bounds = host(target).getBoundingClientRect();
    assert(Math.abs((position.startsWith('top') ? bounds.top : innerHeight - bounds.bottom) - 8) < 1, 'Wrong vertical placement');
    assert(Math.abs((position.endsWith('left') ? bounds.left : innerWidth - bounds.right) - 8) < 1, 'Wrong horizontal placement');
  }
  widget.destroy();
});

test('rejects second mount across SDK instances, preserving the first', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const original = host(target);
  const other = init({ socialUrl: 'https://other.example.test', getPlayerToken: () => 'token' });
  fail(() => other.mountChatWidget({ container: target, config: config() }), error => error.message.includes('already has'));
  assert(host(target) === original, 'Original mount changed');
  widget.destroy();
});

test('invalid config does not mount anything or reserve the container', () => {
  const target = container();
  fail(() => sdk.mountChatWidget({ container: target, config: config({ theme: { primaryColor: 'red' } }) }), error => error instanceof ConfigError);
  assert(!host(target), 'Invalid mount left a node');
  sdk.mountChatWidget({ container: target, config: config() }).destroy();
});

test('invalid container is rejected; CSS selectors are not containers', () => {
  for (const value of [null, {}, '#sandbox', document, document.createTextNode('text')]) {
    fail(() => sdk.mountChatWidget({ container: value, config: config() }), error => error instanceof TypeError);
  }
});

test('invalid update is atomic across style and text', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const original = host(target);
  const before = original.outerHTML + original.shadowRoot.innerHTML;
  fail(() => widget.updateConfig(config({ layout: { width: 123 }, theme: { textColor: 'bad' } })), error => error instanceof ConfigError);
  assert(original.outerHTML + original.shadowRoot.innerHTML === before, 'Invalid update partially changed DOM');
  widget.destroy();
});

test('valid appearance updates preserve nodes and apply new values', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const original = host(target);
  const heading = original.shadowRoot.querySelector('h2');
  widget.updateConfig(config({ theme: { backgroundColor: '#ffffff', borderRadius: 0 }, layout: { width: 200 } }));
  assert(host(target) === original && original.shadowRoot.querySelector('h2') === heading, 'Replaced stable nodes');
  assert(getComputedStyle(original.shadowRoot.querySelector('section')).backgroundColor === 'rgb(255, 255, 255)', 'Theme not applied');
  assert(original.getBoundingClientRect().width === 200, 'Width not applied');
  widget.destroy();
});

test('two mounted widgets keep independent config and lifecycle', () => {
  const first = container();
  const second = container();
  const firstWidget = sdk.mountChatWidget({ container: first, config: config({ theme: { primaryColor: '#ff0000' } }) });
  const secondWidget = sdk.mountChatWidget({ container: second, config: config({ theme: { primaryColor: '#00ff00' } }) });
  firstWidget.updateConfig(config({ theme: { primaryColor: '#0000ff' } }));
  assert(host(second).style.getPropertyValue('--clan-primary') === '#00ff00', 'Shared configuration');
  firstWidget.destroy();
  assert(host(second)?.isConnected, 'Destroy removed another widget');
  secondWidget.destroy();
});

test('host content survives destroy, which is idempotent and permits remount', () => {
  const target = container();
  const existing = target.appendChild(document.createElement('span'));
  existing.textContent = 'Game-owned content';
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  widget.destroy(); widget.destroy();
  assert(target.firstChild === existing && target.childNodes.length === 1, 'Host content changed');
  const next = sdk.mountChatWidget({ container: target, config: config() });
  widget.destroy();
  fail(() => sdk.mountChatWidget({ container: target, config: config() }), error => error.message.includes('already has'));
  assert(host(target)?.isConnected, 'Old destroy affected new mount');
  next.destroy();
});

test('post-destroy updates reject and cannot recreate UI', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  widget.destroy();
  fail(() => widget.updateConfig(config()), error => error.message.includes('destroyed'));
  assert(!host(target), 'Late update recreated UI');
});

test('hostile light-DOM CSS cannot restyle the host or shadow text', () => {
  const target = container();
  target.className = 'hostile';
  const style = sandbox.appendChild(document.createElement('style'));
  style.textContent = '.hostile > * { display:none!important; width:1px!important; position:static!important; color:red!important } .hostile h2 { display:none!important; color:red!important }';
  const widget = sdk.mountChatWidget({ container: target, config: config({ layout: { width: 200 } }) });
  const element = host(target);
  assert(getComputedStyle(element).position === 'fixed' && getComputedStyle(element).display === 'block', 'Host style escaped isolation');
  assert(element.getBoundingClientRect().width === 200, 'Host width was overridden');
  const heading = element.shadowRoot.querySelector('h2');
  assert(getComputedStyle(heading).color !== 'rgb(255, 0, 0)' && getComputedStyle(heading).display !== 'none', 'Shadow text was restyled');
  widget.destroy(); style.remove();
});

test('labels are textContent, including HTML-like input', () => {
  const target = container();
  const label = '<img src=x onerror="throw new Error()">';
  const widget = sdk.mountChatWidget({ container: target, config: config({ tabs: [{ id: 'chats', label, icon: 'message-circle', enabled: true, order: 0 }] }) });
  assert(host(target).shadowRoot.querySelector('[data-tab-label]').textContent === label, 'Label changed');
  assert(host(target).shadowRoot.querySelectorAll('img,script').length === 0, 'Unsafe markup was created');
  widget.destroy();
});

test('config input mutation cannot change mounted state', () => {
  const target = container();
  const input = config({ layout: { width: 200 }, theme: { primaryColor: '#000000' } });
  const widget = sdk.mountChatWidget({ container: target, config: input });
  input.layout.width = 100;
  input.theme.primaryColor = '#ffffff';
  assert(host(target).getBoundingClientRect().width === 200, 'Shared input state');
  assert(host(target).style.getPropertyValue('--clan-primary') === '#000000', 'Shared input theme');
  widget.destroy();
});

test('small viewports clamp dimensions and work with another document realm', async () => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:320px;height:480px;border:0';
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  frame.src = '/test/browser/frame.html';
  sandbox.append(frame);
  await loaded;
  const target = frame.contentDocument.body.appendChild(frame.contentDocument.createElement('div'));
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const check = () => {
    const bounds = host(target).getBoundingClientRect();
    const view = frame.contentWindow;
    assert(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= view.innerWidth && bounds.bottom <= view.innerHeight, 'Widget overflowed viewport');
    const shadow = host(target).shadowRoot;
    for (const control of shadow.querySelectorAll('textarea,button[type="submit"]')) {
      const controlBounds = control.getBoundingClientRect();
      assert(controlBounds.top >= bounds.top && controlBounds.bottom <= bounds.bottom, 'Composer escaped the mobile widget');
      assert(controlBounds.left >= bounds.left && controlBounds.right <= bounds.right, 'Composer overflowed horizontally');
    }
  };
  check();
  frame.style.width = '220px'; frame.style.height = '180px';
  await new Promise(resolve => requestAnimationFrame(resolve));
  check();
  widget.destroy(); frame.remove();
});

test('configured colors, radius and dimensions reach computed styles', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config({
    layout: { width: 240, height: 300 },
    theme: { primaryColor: '#123456', backgroundColor: '#abcdef', textColor: '#102030', borderRadius: 23 },
  }) });
  const element = host(target);
  const surface = getComputedStyle(element.shadowRoot.querySelector('section'));
  assert(surface.backgroundColor === 'rgb(171, 205, 239)', 'Background ignored');
  assert(surface.color === 'rgb(16, 32, 48)', 'Text color ignored');
  assert(surface.borderTopColor === 'rgb(18, 52, 86)', 'Primary color ignored');
  assert(surface.borderTopLeftRadius === '23px', 'Radius ignored');
  assert(element.getBoundingClientRect().width === 240 && element.getBoundingClientRect().height === 300, 'Configured dimensions ignored');
  widget.destroy();
});

test('omitted optional appearance fields use the existing normalized defaults', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const element = host(target);
  const surface = getComputedStyle(element.shadowRoot.querySelector('section'));
  assert(element.style.width === '380px' && element.style.height === '520px', 'Size defaults changed');
  assert(surface.backgroundColor === 'rgb(23, 25, 35)' && surface.color === 'rgb(244, 244, 249)', 'Theme defaults changed');
  assert(surface.borderTopColor === 'rgb(139, 101, 238)' && surface.borderTopLeftRadius === '14px', 'Accent/radius defaults changed');
  widget.destroy();
});

test('Chats label and explicit icon mapping render; disabled tabs remain hidden', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config({ tabs: [
    { id: 'chats', label: 'Game messages', icon: 'message-circle', enabled: true, order: 0 },
    { id: 'members', label: 'Members', icon: 'users', enabled: false, order: 1 },
  ] }) });
  const shadow = host(target).shadowRoot;
  assert(shadow.querySelectorAll('[role="tab"]').length === 1, 'Rendered unsupported tab');
  assert(shadow.querySelector('[role="tab"]').textContent === 'Game messages', 'Configured label missing');
  const icon = shadow.querySelector('[role="tab"] svg');
  assert(icon?.dataset.icon === 'message-circle' && icon.querySelector('path'), 'Supported icon missing');
  assert(icon.getAttribute('aria-hidden') === 'true', 'Decorative icon must not duplicate tab name');
  assert(shadow.querySelector('h2').textContent === 'Chat', 'Header must remain neutral');
  widget.destroy();
});

test('appearance updates preserve draft, focus and selection', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const shadow = host(target).shadowRoot;
  const input = shadow.querySelector('textarea');
  input.value = 'unfinished message';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.setSelectionRange(2, 7);
  widget.updateConfig(config({ theme: { backgroundColor: '#ffffff', textColor: '#000000' } }));
  assert(shadow.querySelector('textarea') === input && input.value === 'unfinished message', 'Draft/node replaced');
  assert(shadow.activeElement === input, 'Appearance update lost focus');
  assert(input.selectionStart === 2 && input.selectionEnd === 7, 'Appearance update lost selection');
  fail(() => widget.updateConfig(config({ theme: { borderRadius: -1 } })), error => error instanceof ConfigError);
  assert(input.value === 'unfinished message' && shadow.activeElement === input, 'Invalid update changed draft/focus');
  assert(getComputedStyle(shadow.querySelector('section')).backgroundColor === 'rgb(255, 255, 255)', 'Invalid update changed appearance');
  widget.destroy();
});

test('independent widgets never share drafts', () => {
  const first = container(); const second = container();
  const one = sdk.mountChatWidget({ container: first, config: config() });
  const two = sdk.mountChatWidget({ container: second, config: config({ theme: { primaryColor: '#00ff00' } }) });
  const input = host(first).shadowRoot.querySelector('textarea');
  input.value = 'Only player one'; input.dispatchEvent(new Event('input'));
  assert(host(second).shadowRoot.querySelector('textarea').value === '', 'Draft leaked between instances');
  two.updateConfig(config({ layout: { position: 'top-right' } }));
  assert(input.value === 'Only player one', 'Other widget update cleared draft');
  one.destroy(); two.destroy();
});

test('Send and form submissions never fabricate messages or clear unavailable drafts', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const shadow = host(target).shadowRoot;
  const input = shadow.querySelector('textarea');
  const send = shadow.querySelector('button[type="submit"]');
  for (const draft of [' \n ', 'hello']) {
    input.value = draft; input.dispatchEvent(new Event('input'));
    assert(send.disabled, 'Send enabled without transport');
    send.click();
    const submitted = new Event('submit', { bubbles: true, cancelable: true });
    shadow.querySelector('form').dispatchEvent(submitted);
    assert(submitted.defaultPrevented, 'Submission could navigate the host');
    assert(input.value === draft, 'Unavailable send cleared the draft');
    assert(shadow.querySelector('ol').children.length === 0, 'Fabricated a sent message');
  }
  assert(shadow.querySelector('[data-message-area]').textContent.includes('No messages yet.'), 'Empty state missing');
  assert(shadow.querySelector('[data-availability]').textContent.includes('unavailable'), 'Unavailable state missing');
  widget.destroy();
});

test('mount/update/send/destroy never call fetch or construct WebSocket', () => {
  const oldFetch = window.fetch; const oldSocket = window.WebSocket;
  let calls = 0;
  window.fetch = () => { calls += 1; throw new Error('Unexpected HTTP'); };
  window.WebSocket = class { constructor() { calls += 1; throw new Error('Unexpected socket'); } };
  let widget;
  try {
    const target = container();
    widget = sdk.mountChatWidget({ container: target, config: config() });
    widget.updateConfig(config({ theme: { primaryColor: '#abcdef' } }));
    host(target).shadowRoot.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    widget.destroy();
    assert(calls === 0, 'Visual lifecycle used a network transport');
  } finally {
    widget?.destroy(); window.fetch = oldFetch; window.WebSocket = oldSocket;
  }
});

test('renderer delegates actions and removes listeners on destruction', () => {
  const target = container();
  const shadow = target.attachShadow({ mode: 'open' });
  let drafts = 0; let submits = 0;
  const renderer = createChatRenderer(shadow, { onDraftChange: () => { drafts += 1; }, onSend: () => { submits += 1; } });
  renderer.update({ config: normalizeChatConfig(config()), state: createChatState() });
  const input = shadow.querySelector('textarea'); const form = shadow.querySelector('form');
  input.dispatchEvent(new Event('input')); form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert(drafts === 1 && submits === 1, 'Renderer did not delegate actions');
  renderer.destroy(); renderer.destroy();
  input.dispatchEvent(new Event('input')); form.dispatchEvent(new Event('submit', { cancelable: true }));
  renderer.update({ config: normalizeChatConfig(config()), state: createChatState() });
  assert(drafts === 1 && submits === 1 && shadow.childNodes.length === 0, 'Destroyed renderer retained listeners or DOM');
});

test('message area scrolls while composer stays within the widget', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config({ layout: { width: 280, height: 320 } }) });
  const shadow = host(target).shadowRoot;
  // Test-only DOM content checks overflow, not a fake production message schema.
  for (let index = 0; index < 50; index += 1) {
    const line = document.createElement('li');
    line.textContent = `Browser overflow fixture ${index}`;
    shadow.querySelector('ol').append(line);
  }
  const area = shadow.querySelector('[data-message-area]');
  assert(getComputedStyle(area).overflowY === 'auto' && area.scrollHeight > area.clientHeight, 'Message area does not scroll');
  area.scrollTop = 100;
  assert(area.scrollTop > 0, 'Scroll position did not change');
  const composer = shadow.querySelector('form').getBoundingClientRect();
  const surface = host(target).getBoundingClientRect();
  assert(composer.bottom <= surface.bottom && composer.top >= surface.top, 'Messages pushed composer out of widget');
  widget.destroy();
});

test('composer labels, tab relationships and keyboard focus are accessible', () => {
  const target = container();
  const widget = sdk.mountChatWidget({ container: target, config: config() });
  const shadow = host(target).shadowRoot;
  const input = shadow.querySelector('textarea');
  assert(input.labels[0]?.textContent === 'Message', 'Message input is not labeled');
  assert(shadow.getElementById(input.getAttribute('aria-describedby')).textContent.includes('unavailable'), 'Input lacks unavailable description');
  const tab = shadow.querySelector('[role="tab"]');
  assert(shadow.getElementById(tab.getAttribute('aria-controls')).getAttribute('aria-labelledby') === tab.id, 'Tab/panel relationship missing');
  input.focus();
  assert(shadow.activeElement === input && input.matches(':focus-visible'), 'Input has no keyboard-visible focus');
  const focusStyle = getComputedStyle(input);
  // Browser/device scaling may round a 2px rule to a fractional CSS pixel width.
  assert(focusStyle.outlineStyle === 'solid' && parseFloat(focusStyle.outlineWidth) > 0, 'Keyboard focus outline is not visible');
  widget.destroy();
});

registerRemoteConfigTests({ test, assert, sdk, config, container, host });
registerDiscoverTests({ test, assert, container });

let failures = 0;
for (const entry of cases) {
  const result = document.createElement('li');
  try {
    await entry.run();
    result.textContent = `PASS: ${entry.name}`;
  } catch (error) {
    failures += 1;
    result.textContent = `FAIL: ${entry.name}: ${error.message}`;
  }
  results.append(result);
}
const summary = document.querySelector('#summary');
summary.textContent = `${cases.length - failures} passed, ${failures} failed (${cases.length} browser tests)`;
summary.dataset.result = failures ? 'failed' : 'passed';
