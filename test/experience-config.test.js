import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateExperienceConfig, normalizeChatConfig, ConfigError } from 'clan-sdk';

// Authentic user-supplied example; only schemaVersion was changed from 2 to 1.
const example = JSON.parse(readFileSync(new URL('./fixtures/config/complete-experience-v1.json', import.meta.url), 'utf8'));
const minimal = () => ({
  kind: 'clan-complete-ui', schemaVersion: 1, theme: {}, screens: { custom: { sections: [] } },
});

function rejects(input, path) {
  assert.throws(() => validateExperienceConfig(input), error => {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.path, path);
    assert.equal(error.code, 'invalid_config');
    assert.ok(error.message.startsWith(`${path}: `));
    return true;
  });
}

test('attached complete UI example with schemaVersion 1 is accepted unchanged', () => {
  assert.equal(example.schemaVersion, 1);
  assert.equal(Object.keys(example.screens).length, 7);
  const input = structuredClone(example);
  const before = structuredClone(input);
  assert.equal(validateExperienceConfig(input), input);
  assert.deepEqual(input, before);
  assert.equal(input.chat.tabs.find(tab => tab.id === 'invites').enabled, true);
});

test('minimal config needs only one arbitrary screen; sections may be empty', () => {
  const input = minimal();
  assert.equal(validateExperienceConfig(input), input);
  assert.deepEqual(Object.keys(input.screens), ['custom']);
  assert.deepEqual(input.theme, {});
  assert.deepEqual(input.screens.custom.sections, []);
});

test('unknown screen names, section IDs and section types are not capability-checked', () => {
  const input = minimal();
  input.screens.custom.sections.push({ id: 'future-section', type: 'unknown-feature' });
  assert.equal(validateExperienceConfig(input), input);
});

test('invalid roots fail with a root field path', () => {
  for (const input of [undefined, null, [], false, 42, 'config', () => {}]) rejects(input, '$');
});

test('kind is required and distinguishes this format from chat/proposals', () => {
  const missing = minimal(); delete missing.kind;
  rejects(missing, 'kind');
  for (const kind of [undefined, null, '', 'CLAN-COMPLETE-UI', 'clan-experience-design-proposal', 'chat', 1, [], {}]) {
    rejects({ ...minimal(), kind }, 'kind');
  }
  rejects({ schemaVersion: 1 }, 'kind');
});

test('schemaVersion must be a finite positive number, without coercion', () => {
  const missing = minimal(); delete missing.schemaVersion;
  rejects(missing, 'schemaVersion');
  for (const version of [undefined, null, false, '1', 0, -1, NaN, Infinity, -Infinity, [], {}]) {
    rejects({ ...minimal(), schemaVersion: version }, 'schemaVersion');
  }
  // This is a structural numeric check, not a renderer/version capability promise.
  for (const version of [1, 2, 0.5]) {
    const input = { ...minimal(), schemaVersion: version };
    assert.equal(validateExperienceConfig(input), input);
    assert.equal(input.schemaVersion, version);
  }
});

test('theme is a required non-null object, not an array', () => {
  const missing = minimal(); delete missing.theme;
  rejects(missing, 'theme');
  for (const theme of [undefined, null, [], false, 1, 'theme']) rejects({ ...minimal(), theme }, 'theme');
});

test('screens must be a non-empty object, not an array', () => {
  const missing = minimal(); delete missing.screens;
  rejects(missing, 'screens');
  for (const screens of [undefined, null, [], {}, false, 1, 'screens']) rejects({ ...minimal(), screens }, 'screens');
});

test('every supplied screen must be an object with a sections array', () => {
  for (const screen of [undefined, null, [], false, 1, 'screen']) {
    rejects({ ...minimal(), screens: { create: screen } }, 'screens.create');
  }
  for (const screen of [{}, { sections: null }, { sections: {} }, { sections: 'sections' }, { sections: false }]) {
    rejects({ ...minimal(), screens: { create: screen } }, 'screens.create.sections');
  }
});

test('every section is an object and sparse entries are rejected', () => {
  for (const section of [undefined, null, [], false, 1, 'section']) {
    rejects({ ...minimal(), screens: { create: { sections: [section] } } }, 'screens.create.sections[0]');
  }
  rejects({ ...minimal(), screens: { create: { sections: new Array(1) } } }, 'screens.create.sections[0]');
});

test('section id/type are required non-empty strings with precise field paths', () => {
  for (const field of ['id', 'type']) {
    const section = { id: 'name', type: 'input' }; delete section[field];
    rejects({ ...minimal(), screens: { create: { sections: [section] } } }, `screens.create.sections[0].${field}`);
    for (const value of [undefined, null, false, 42, '', ' \n\t ', [], {}]) {
      rejects({ ...minimal(), screens: { create: { sections: [{ id: 'name', type: 'input', [field]: value }] } } }, `screens.create.sections[0].${field}`);
    }
  }
});

test('duplicate section IDs are rejected at the second ID within a screen', () => {
  const input = minimal();
  input.screens = { create: { sections: [{ id: 'name', type: 'input' }, { id: 'name', type: 'button' }] } };
  const before = structuredClone(input);
  rejects(input, 'screens.create.sections[1].id');
  assert.deepEqual(input, before);
});

test('the same section ID in different screens is allowed', () => {
  const input = minimal();
  input.screens = {
    create: { sections: [{ id: 'intro', type: 'hero' }] },
    home: { sections: [{ id: 'intro', type: 'hero' }] },
  };
  assert.equal(validateExperienceConfig(input), input);
});

test('required:true is retained as metadata, never an inclusion rule', () => {
  const input = structuredClone(example);
  for (const screen of Object.values(input.screens)) {
    screen.sections = screen.sections.filter(section => section.required !== true);
  }
  assert.equal(validateExperienceConfig(input), input);
  const another = minimal();
  another.screens.custom.sections = [{ id: 'arbitrary', type: 'future', required: true, visible: false }];
  assert.equal(validateExperienceConfig(another), another);
});

test('additional and deliberately unchecked fields are preserved without normalization', () => {
  const input = minimal();
  input.theme = { accent: 'not-a-validated-color', font: { arbitrary: true }, radius: -50 };
  input.chat = { tabs: [{ id: 'unknown-tab', enabled: 'unchecked' }] };
  input.rules = { capacity: -1, adminEdit: true };
  input.emblems = { allowUpload: true, maxMB: 'unchecked' };
  input.customMetadata = { nested: ['kept', { flag: true }] };
  input.screens.custom.layout = { width: 'unchecked', align: 'arbitrary' };
  input.screens.custom.sections.push({ id: ' intro ', type: ' future ', label: '<b>unchecked</b>', required: 'unchecked', custom: [1, 2] });
  const before = structuredClone(input);
  const result = validateExperienceConfig(input);
  assert.equal(result, input);
  assert.equal(result.customMetadata, input.customMetadata);
  assert.deepEqual(result, before);
  assert.equal(result.screens.custom.sections[0].id, ' intro ');
});

test('frozen input validates without mutation or cloning', () => {
  const input = minimal();
  input.screens.custom.sections.push({ id: 'one', type: 'future' });
  for (const value of [input, input.theme, input.screens, input.screens.custom, input.screens.custom.sections, input.screens.custom.sections[0]]) Object.freeze(value);
  assert.equal(validateExperienceConfig(input), input);
});

test('legacy chat normalizer rejects complete-experience kind despite version 1', () => {
  assert.throws(() => normalizeChatConfig({ ...minimal() }), error => {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.path, 'kind');
    assert.equal(error.code, 'unsupported_config_format');
    return true;
  });
  assert.equal(normalizeChatConfig({ schemaVersion: 1 }).schemaVersion, 1);
});
