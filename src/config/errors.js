/** Validation error with a stable field path and machine-readable category. */
export class ConfigError extends Error {
  constructor(path, message, code = 'invalid_config') {
    super(`${path}: ${message}`);
    this.name = 'ConfigError';
    this.path = path;
    this.code = code;
  }
}
