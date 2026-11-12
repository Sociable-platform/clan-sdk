// Development host: production remote-loading API, provisional dev HTTP endpoint.
import { init, normalizeChatConfig } from '/src/index.js';

const sdk = init({
  socialUrl: 'http://localhost:8082',
  getPlayerToken: () => { throw new Error('Configuration loading must not acquire a Social token.'); },
});
const editor = document.querySelector('#config');
const result = document.querySelector('#result');
const mountButton = document.querySelector('#mount');
const destroyButton = document.querySelector('#destroy');
const refreshButton = document.querySelector('#refresh');
const urlInput = document.querySelector('#config-url');
const viewport = document.querySelector('#widget-viewport');
const viewportReady = viewport.contentDocument?.getElementById('chat-root')
  ? Promise.resolve()
  : new Promise(resolve => viewport.addEventListener('load', resolve, { once: true }));
const defaultConfig = () => normalizeChatConfig({ schemaVersion: 1 });
editor.value = JSON.stringify(defaultConfig(), null, 2);
let widget;
let initialLoad;
let feedbackRevision = 0;

function syncButtons() {
  mountButton.disabled = Boolean(widget || initialLoad);
  refreshButton.disabled = !widget;
  destroyButton.disabled = !widget && !initialLoad;
}
async function attempt(action) {
  const ticket = ++feedbackRevision;
  try {
    const message = await action();
    if (ticket === feedbackRevision) result.textContent = message;
  } catch (error) {
    if (ticket === feedbackRevision) result.textContent = error.message;
  }
}
async function mount() {
  const controller = new AbortController();
  initialLoad = controller;
  syncButtons();
  result.textContent = 'Loading configuration over HTTP…';
  try {
    await viewportReady;
    const mounted = await sdk.mountChatWidgetFromUrl({
      container: viewport.contentDocument.getElementById('chat-root'), configUrl: urlInput.value, signal: controller.signal,
    });
    if (initialLoad !== controller) { mounted.destroy(); return 'Loading cancelled.'; }
    widget = mounted;
    return 'Mounted from remote configuration. Chat messaging remains unavailable.';
  } finally {
    if (initialLoad === controller) initialLoad = undefined;
    syncButtons();
  }
}
document.querySelector('#apply').addEventListener('click', () => attempt(() => {
  if (!widget) throw new Error('Mount the widget before applying configuration.');
  widget.updateConfig(JSON.parse(editor.value));
  return 'Local debug configuration applied; draft preserved. Refresh restores the HTTP source.';
}));
document.querySelector('#reset').addEventListener('click', () => attempt(() => {
  editor.value = JSON.stringify(defaultConfig(), null, 2);
  if (widget) widget.updateConfig(JSON.parse(editor.value));
  return 'Local debug defaults restored.';
}));
refreshButton.addEventListener('click', () => attempt(async () => {
  await widget.refreshConfig();
  return 'Configuration fetched again and applied; the draft is preserved.';
}));
destroyButton.addEventListener('click', () => {
  feedbackRevision += 1;
  initialLoad?.abort();
  initialLoad = undefined;
  widget?.destroy();
  widget = undefined;
  syncButtons();
  result.textContent = 'Widget destroyed. Mount again to start with an empty draft.';
});
mountButton.addEventListener('click', () => attempt(mount));
attempt(mount);
