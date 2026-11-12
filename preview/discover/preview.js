import { init } from '/src/index.js';

// Development host only. Production callers supply their own getPlayerToken.
// Live mode is the default: never fall back to mock data after a real API error.
const mockMode = new URL(location.href).searchParams.get('mode') === 'mock';
const container = document.querySelector('#experience');
const events = document.querySelector('#events');
const form = document.querySelector('#connection');
const tokenInput = document.querySelector('#player-token');
const urlInput = document.querySelector('#social-url');
const connectButton = document.querySelector('#connect');
const disconnectButton = document.querySelector('#disconnect');
const status = document.querySelector('#connection-status');
let config;
let widget;
let closed = false;

for (const name of ['navigate', 'joined']) {
  container.addEventListener(`clan-sdk:${name}`, event => {
    events.textContent = `${name}: ${JSON.stringify(event.detail)}`;
  });
}

function disconnect() {
  widget?.destroy(); widget = undefined;
  tokenInput.value = '';
  urlInput.disabled = false;
  connectButton.disabled = !config;
  disconnectButton.disabled = true;
  status.textContent = 'Widget destroyed; token cleared.';
}

function mount() {
  if (closed || !config || widget) return;
  try {
    if (!mockMode && (!tokenInput.value.trim() || /\s/.test(tokenInput.value.trim()))) {
      throw new Error('Paste only the player token, without the Bearer prefix.');
    }
    const sdk = init({
      socialUrl: mockMode ? `${location.origin}/__dev__/social` : urlInput.value.trim(),
      getPlayerToken: mockMode ? async () => 'development-mock-player-token' : async () => tokenInput.value.trim(),
    });
    widget = sdk.mountExperience({ container, config });
    connectButton.disabled = true; disconnectButton.disabled = false; urlInput.disabled = true;
    status.textContent = mockMode ? 'Mounted with explicit mock data.'
      : 'Mounted with real Social requests. Loading and API errors appear in the widget. You can replace the token and use Retry.';
  } catch (error) { status.textContent = error.message; }
}

form.addEventListener('submit', event => { event.preventDefault(); mount(); });
disconnectButton.addEventListener('click', disconnect);
window.addEventListener('pagehide', () => { closed = true; disconnect(); }, { once: true });

async function start() {
  if (mockMode) {
    document.querySelector('#mode').textContent = 'MOCK DATA · provisional HTTP adapter';
    document.querySelector('#live-help').hidden = true;
    form.hidden = true; document.querySelector('#mock-help').hidden = false;
  } else {
    document.querySelector('#origin-help').textContent = `Current origin: ${location.origin}. It must be allowed by SOCIAL_CORS_ORIGINS. Backend default: http://localhost:5174.`;
    if (location.hostname === '127.0.0.1') {
      const link = document.querySelector('#canonical-origin');
      const canonical = new URL(location.href); canonical.hostname = 'localhost';
      link.href = canonical.href; link.hidden = false;
    }
  }
  const response = await fetch('./config.json');
  if (!response.ok) throw new Error(`Preview config HTTP ${response.status}`);
  config = await response.json();
  if (closed) return;
  connectButton.disabled = false;
  status.textContent = 'Ready. Paste your player token and mount. No Social request has been made.';
  if (mockMode) mount();
}
start().catch(error => { if (!closed) status.textContent = error.message; });
