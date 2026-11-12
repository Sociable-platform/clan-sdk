import { ConfigError } from './errors.js';

// Defaults are private and immutable. Output objects are always constructed anew.
const DEFAULT_LAYOUT = Object.freeze({
  mode: 'floating', position: 'bottom-right', width: 380, height: 520,
});
const DEFAULT_THEME = Object.freeze({
  primaryColor: '#8B65EE', backgroundColor: '#171923', textColor: '#F4F4F9', borderRadius: 14,
});
const DEFAULT_TAB = Object.freeze({
  id: 'chats', label: 'Chats', icon: 'message-circle', enabled: true, order: 0,
});
const POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const TAB_IDS = new Set(['chats', 'invites', 'members']);

/** Normalize the SDK's chat-v1 subset only; no rendering or network effects. */
export function normalizeChatConfig(input) {
  requireObject(input, '$');
  if (own(input, 'kind') === 'clan-complete-ui') {
    throw new ConfigError('kind', 'Complete-experience configuration is a separate format; use validateExperienceConfig for structural validation.', 'unsupported_config_format');
  }
  if (own(input, 'kind') === 'clan-experience-design-proposal') {
    throw new ConfigError('kind', 'Clan design is a separate format; its adapter is deferred.', 'unsupported_config_format');
  }
  if (own(input, 'schemaVersion') !== 1) {
    throw new ConfigError('schemaVersion', 'Required version is the number 1.', 'unsupported_version');
  }

  const layout = optionalObject(input, 'layout');
  const theme = optionalObject(input, 'theme');
  const mode = withDefault(layout, 'mode', DEFAULT_LAYOUT);
  const position = withDefault(layout, 'position', DEFAULT_LAYOUT);
  if (mode !== 'floating') {
    throw new ConfigError('layout.mode', 'Only floating mode is supported.', 'unsupported_capability');
  }
  if (!POSITIONS.has(position)) {
    throw new ConfigError('layout.position', 'Expected top-left, top-right, bottom-left or bottom-right.');
  }

  // Explicit mapping intentionally drops unknown fields at every level.
  return {
    schemaVersion: 1,
    layout: {
      mode,
      position,
      width: dimension(withDefault(layout, 'width', DEFAULT_LAYOUT), 'layout.width'),
      height: dimension(withDefault(layout, 'height', DEFAULT_LAYOUT), 'layout.height'),
    },
    theme: {
      primaryColor: color(withDefault(theme, 'primaryColor', DEFAULT_THEME), 'theme.primaryColor'),
      backgroundColor: color(withDefault(theme, 'backgroundColor', DEFAULT_THEME), 'theme.backgroundColor'),
      textColor: color(withDefault(theme, 'textColor', DEFAULT_THEME), 'theme.textColor'),
      borderRadius: dimension(withDefault(theme, 'borderRadius', DEFAULT_THEME), 'theme.borderRadius', true),
    },
    tabs: normalizeTabs(Object.hasOwn(input, 'tabs') ? input.tabs : [{ ...DEFAULT_TAB }]),
  };
}

function requireObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new ConfigError(path, 'Expected a plain object.');
  }
}

function own(object, key) {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

function optionalObject(input, key) {
  if (!Object.hasOwn(input, key)) return {};
  requireObject(input[key], key);
  return input[key];
}

function withDefault(object, key, defaults) {
  return Object.hasOwn(object, key) ? object[key] : defaults[key];
}

function dimension(value, path, allowZero = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new ConfigError(path, `Expected a finite ${allowZero ? 'non-negative' : 'positive'} number in pixels.`);
  }
  return value;
}

function color(value, path) {
  if (typeof value !== 'string' || value.length !== 7 || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new ConfigError(path, 'Expected a six-digit hexadecimal color (#RRGGBB).');
  }
  return value;
}

function nonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(path, 'Expected a non-empty string.');
  }
  return value;
}

function normalizeTabs(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ConfigError('tabs', 'Expected a non-empty array containing one enabled chats tab.');
  }
  const seen = new Set();
  const tabs = Array.from(input, (tab, index) => {
    const path = `tabs[${index}]`;
    requireObject(tab, path);
    const id = own(tab, 'id');
    if (!TAB_IDS.has(id)) {
      throw new ConfigError(`${path}.id`, 'Expected chats, invites or members.');
    }
    if (seen.has(id)) {
      throw new ConfigError(`${path}.id`, `Duplicate tab ID: ${id}.`);
    }
    seen.add(id);
    const enabled = own(tab, 'enabled');
    if (typeof enabled !== 'boolean') {
      throw new ConfigError(`${path}.enabled`, 'Expected a boolean.');
    }
    if (id !== 'chats' && enabled) {
      throw new ConfigError(`${path}.enabled`, `Enabled ${id} tabs are not supported.`, 'unsupported_capability');
    }
    if (id === 'chats' && !enabled) {
      throw new ConfigError(`${path}.enabled`, 'The chats tab must be enabled.');
    }
    const label = nonEmptyString(own(tab, 'label'), `${path}.label`);
    const icon = nonEmptyString(own(tab, 'icon'), `${path}.icon`);
    if (id === 'chats' && icon !== 'message-circle') {
      throw new ConfigError(`${path}.icon`, 'Only message-circle is supported for chats.', 'unsupported_capability');
    }
    const order = own(tab, 'order');
    if (!Number.isInteger(order) || order < 0) {
      throw new ConfigError(`${path}.order`, 'Expected a non-negative integer.');
    }
    // Disabled invites/members icons are inert non-empty strings, not rendered capabilities.
    return { id, label, icon, enabled, order };
  });
  if (!seen.has('chats')) {
    throw new ConfigError('tabs', 'Exactly one enabled chats tab is required.');
  }
  return tabs;
}
