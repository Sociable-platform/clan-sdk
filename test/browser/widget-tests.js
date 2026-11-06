import { init, ConfigError } from '/src/index.js';

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
  assert(host(target).shadowRoot.querySelector('h2').textContent === 'Chats', 'Missing heading');
  assert(host(target).shadowRoot.textContent.includes('Chat is not connected.'), 'Must report disconnected');
  assert(host(target).shadowRoot.querySelectorAll('input,button,textarea').length === 0, 'No fake chat controls');
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
  assert(host(target).shadowRoot.querySelector('h2').textContent === label, 'Label changed');
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
  };
  check();
  frame.style.width = '220px'; frame.style.height = '180px';
  await new Promise(resolve => requestAnimationFrame(resolve));
  check();
  widget.destroy(); frame.remove();
});

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
