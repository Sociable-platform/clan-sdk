import { validateExperienceConfig } from './experience.js';
import { ConfigError } from './errors.js';

// Rendering capability check, separate from the deliberately minimal structural
// validator. These defaults describe this SDK renderer, not backend storage.
export function discoverConfig(input) {
  validateExperienceConfig(input);
  const fail = (path, message) => { throw new ConfigError(path, message); };
  if (input.schemaVersion !== 1) fail('schemaVersion', 'Discover rendering supports version 1 only.');
  const screen = input.screens.discover;
  if (!screen) fail('screens.discover', 'Discover configuration is required.');
  const number = (value, fallback, path, minimum = 0) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail(path, `Expected a finite number >= ${minimum}.`);
    return value;
  };
  const text = (value, fallback, path) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string') fail(path, 'Expected a string.');
    return value;
  };
  const requireColor = (value, path) => {
    if (typeof value !== 'string' || value.length !== 7 || !/^#[0-9a-f]{6}$/i.test(value)) fail(path, 'Discover supports #RRGGBB colors.');
    return value;
  };
  const color = (key, fallback) => requireColor(input.theme[key] === undefined ? fallback : input.theme[key], `theme.${key}`);
  const sharedBackground = color('background', '#171923');
  const background = screen.background === undefined ? sharedBackground
    : requireColor(screen.background, 'screens.discover.background');
  const align = screen.align === undefined ? 'left' : screen.align;
  if (!['left', 'center', 'right'].includes(align)) fail('screens.discover.align', 'Expected left, center or right.');
  const sections = screen.sections.map((section, index) => {
    const path = `screens.discover.sections[${index}]`;
    if (section.visible !== undefined && typeof section.visible !== 'boolean') fail(`${path}.visible`, 'Expected boolean.');
    if (!['hero', 'search', 'clans', 'button'].includes(section.type)) {
      if (section.visible !== false) fail(`${path}.type`, 'Unsupported Discover section type.');
    }
    // A button represents only the configured Create navigation affordance.
    if (section.type === 'button' && section.text !== undefined && section.text !== 'create') fail(`${path}.text`, 'Only the create navigation action is supported.');
    return { id: section.id, type: section.type, visible: section.visible !== false,
      label: text(section.label, '', `${path}.label`), text: text(section.text, '', `${path}.text`) };
  });
  if (sections.filter(s => s.visible && s.type === 'search').length > 1) fail('screens.discover.sections', 'Only one visible search section is supported.');
  return {
    name: text(screen.name, 'Discover clans', 'screens.discover.name'), sections, align,
    width: number(screen.width, 390, 'screens.discover.width', 1),
    padding: number(screen.padding, 20, 'screens.discover.padding'),
    headingSize: number(screen.headingSize, 23, 'screens.discover.headingSize', 1),
    bodySize: number(screen.bodySize, 12, 'screens.discover.bodySize', 1),
    theme: { accent: color('accent', '#E779AA'), background, text: color('text', '#F4F4F9'),
      radius: number(input.theme.radius, 16, 'theme.radius'),
      buttonRadius: number(input.theme.buttonRadius, 8, 'theme.buttonRadius'),
      inputRadius: number(input.theme.inputRadius, 8, 'theme.inputRadius'),
      // CSSOM assignment is used; font strings never become stylesheet source.
      font: text(input.theme.font, 'Inter, Arial, sans-serif', 'theme.font') },
  };
}
