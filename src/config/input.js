import {ConfigError} from './errors.js';

// One envelope boundary for caller JSON, published config and updates. Unwrap
// exactly one own top-level field; never merge envelope metadata into config.
export function unwrapConfig(input) {
  if (input && typeof input === 'object' && !Array.isArray(input) && Object.hasOwn(input, 'config')) {
    const config = input.config;
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new ConfigError('config', 'Expected a non-null configuration object.');
    }
    return config;
  }
  return input;
}
