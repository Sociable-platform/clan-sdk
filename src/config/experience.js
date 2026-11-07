import { ConfigError } from './errors.js';

/** Structural check only. Returns the original input without normalizing it. */
export function validateExperienceConfig(input) {
  requireObject(input, '$');
  if (input.kind !== 'clan-complete-ui') {
    throw new ConfigError('kind', 'Expected clan-complete-ui.');
  }
  if (typeof input.schemaVersion !== 'number' || !Number.isFinite(input.schemaVersion) || input.schemaVersion <= 0) {
    throw new ConfigError('schemaVersion', 'Expected a finite positive number.');
  }
  requireObject(input.theme, 'theme');
  requireObject(input.screens, 'screens');
  const screens = Object.entries(input.screens);
  if (screens.length === 0) {
    throw new ConfigError('screens', 'Expected at least one screen.');
  }
  for (const [name, screen] of screens) {
    const screenPath = `screens.${name}`;
    requireObject(screen, screenPath);
    if (!Array.isArray(screen.sections)) {
      throw new ConfigError(`${screenPath}.sections`, 'Expected an array.');
    }
    const ids = new Set();
    for (let index = 0; index < screen.sections.length; index += 1) {
      const section = screen.sections[index];
      const path = `${screenPath}.sections[${index}]`;
      requireObject(section, path);
      requireText(section.id, `${path}.id`);
      requireText(section.type, `${path}.type`);
      if (ids.has(section.id)) {
        throw new ConfigError(`${path}.id`, 'Section ID must be unique within this screen.');
      }
      ids.add(section.id);
    }
  }
  return input;
}

function requireObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(path, 'Expected a non-null object, not an array.');
  }
}

function requireText(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigError(path, 'Expected a non-empty string.');
  }
}
