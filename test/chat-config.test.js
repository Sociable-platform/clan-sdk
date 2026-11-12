import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeChatConfig, ConfigError } from 'clan-sdk';

// The user-supplied SDK MVP reference, not a claimed full dashboard schema.
const reference = {
  schemaVersion: 1,
  layout: { mode: 'floating', position: 'bottom-right', width: 380, height: 520 },
  theme: { primaryColor: '#8B65EE', backgroundColor: '#171923', textColor: '#F4F4F9', borderRadius: 14 },
  tabs: [{ id: 'chats', label: 'Chats', icon: 'message-circle', enabled: true, order: 0 }],
};
const copy = () => structuredClone(reference);
const disabled = id => ({ id, label: id, icon: `${id}-icon`, enabled: false, order: 1 });

function rejectsConfig(input, path, code = 'invalid_config') {
  assert.throws(() => normalizeChatConfig(input), error => {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.name, 'ConfigError');
    assert.equal(error.path, path);
    assert.equal(error.code, code);
    assert.ok(error.message.startsWith(`${path}: `));
    return true;
  });
}

test('reference is accepted with fresh nested output and no fetch', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network call'); });
  const result = normalizeChatConfig(reference);
  assert.deepEqual(result, reference);
  assert.notEqual(result, reference);
  assert.notEqual(result.layout, reference.layout);
  assert.notEqual(result.theme, reference.theme);
  assert.notEqual(result.tabs, reference.tabs);
  assert.notEqual(result.tabs[0], reference.tabs[0]);
  assert.equal(fetch.mock.callCount(), 0);
});

test('omitted optional objects and tabs receive reference defaults', () => {
  assert.deepEqual(normalizeChatConfig({ schemaVersion: 1 }), reference);
  assert.deepEqual(normalizeChatConfig({ schemaVersion: 1, layout: {}, theme: {} }), reference);
});

test('partial layout/theme override only supplied fields', () => {
  assert.deepEqual(normalizeChatConfig({
    schemaVersion: 1, layout: { width: 240.5 }, theme: { textColor: '#aAbB09', borderRadius: 0 },
  }), {
    ...copy(),
    layout: { ...reference.layout, width: 240.5 },
    theme: { ...reference.theme, textColor: '#aAbB09', borderRadius: 0 },
  });
});

test('schemaVersion is required and must be the number 1', () => {
  rejectsConfig({}, 'schemaVersion', 'unsupported_version');
  for (const version of [undefined, null, false, '1', 0, 2, NaN, Infinity, {}, []]) {
    rejectsConfig({ schemaVersion: version }, 'schemaVersion', 'unsupported_version');
  }
});

test('invalid root values are ConfigErrors', () => {
  for (const value of [undefined, null, [], 1, true, 'config', () => {}, new Date()]) {
    rejectsConfig(value, '$');
  }
});

for (const field of ['layout', 'theme']) {
  test(`${field}: explicit invalid objects never become defaults`, () => {
    for (const value of [undefined, null, [], false, 42, 'object', new Date()]) {
      rejectsConfig({ schemaVersion: 1, [field]: value }, field);
    }
  });
}

test('layout supports only floating mode', () => {
  for (const value of [undefined, null, '', 'inline', 'Floating', 1, {}, []]) {
    rejectsConfig({ schemaVersion: 1, layout: { mode: value } }, 'layout.mode', 'unsupported_capability');
  }
});

test('all four corner positions are accepted', () => {
  for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    assert.equal(normalizeChatConfig({ schemaVersion: 1, layout: { position } }).layout.position, position);
  }
});

test('invalid and explicitly undefined positions are rejected', () => {
  for (const position of [undefined, null, '', 'center', 'BOTTOM-RIGHT', 0, [], {}]) {
    rejectsConfig({ schemaVersion: 1, layout: { position } }, 'layout.position');
  }
});

for (const field of ['width', 'height']) {
  test(`${field}: finite positive pixel values required without coercion`, () => {
    for (const value of [undefined, null, false, '380', 0, -1, NaN, Infinity, -Infinity, {}, []]) {
      rejectsConfig({ schemaVersion: 1, layout: { [field]: value } }, `layout.${field}`);
    }
    for (const value of [0.5, 1, 999999]) {
      assert.equal(normalizeChatConfig({ schemaVersion: 1, layout: { [field]: value } }).layout[field], value);
    }
  });
}

test('borderRadius accepts zero/fractions; rejects negative or non-finite values', () => {
  for (const value of [undefined, null, false, '14', -0.1, NaN, Infinity, {}, []]) {
    rejectsConfig({ schemaVersion: 1, theme: { borderRadius: value } }, 'theme.borderRadius');
  }
  for (const value of [0, 0.5, 999999]) {
    assert.equal(normalizeChatConfig({ schemaVersion: 1, theme: { borderRadius: value } }).theme.borderRadius, value);
  }
});

for (const field of ['primaryColor', 'backgroundColor', 'textColor']) {
  test(`${field}: six-digit case-insensitive hex only`, () => {
    for (const value of ['#000000', '#ffffff', '#aAbB09']) {
      assert.equal(normalizeChatConfig({ schemaVersion: 1, theme: { [field]: value } }).theme[field], value);
    }
    for (const value of [undefined, null, false, 123456, '', '#fff', '#12345678', '123456', '#GG0000',
      'red', 'rgb(0,0,0)', '#123456 ', ' #123456', '#123456\n', {}, []]) {
      rejectsConfig({ schemaVersion: 1, theme: { [field]: value } }, `theme.${field}`);
    }
  });
}

test('tabs default only when omitted; empty/invalid explicit tabs fail', () => {
  for (const tabs of [undefined, null, [], {}, '', false, 1]) {
    rejectsConfig({ schemaVersion: 1, tabs }, 'tabs');
  }
});

test('invalid tab objects and array holes fail at the entry path', () => {
  for (const value of [undefined, null, [], 'tab', true, 1, new Date()]) {
    rejectsConfig({ schemaVersion: 1, tabs: [value] }, 'tabs[0]');
  }
  rejectsConfig({ schemaVersion: 1, tabs: new Array(1) }, 'tabs[0]');
});

test('unknown or missing tab IDs fail without defaulting', () => {
  for (const id of [undefined, null, 0, 'friends', 'Chats', '', {}, []]) {
    const input = copy();
    input.tabs[0].id = id;
    rejectsConfig(input, 'tabs[0].id');
  }
});

test('all duplicate IDs are rejected, including disabled tabs', () => {
  const chats = copy();
  chats.tabs.push({ ...chats.tabs[0] });
  rejectsConfig(chats, 'tabs[1].id');
  for (const id of ['invites', 'members']) {
    const input = copy();
    input.tabs.push(disabled(id), disabled(id));
    rejectsConfig(input, 'tabs[2].id');
  }
});

test('labels must contain non-whitespace text; valid text is preserved', () => {
  for (const value of [undefined, null, false, 42, '', ' \n ', [], {}]) {
    const input = copy();
    input.tabs[0].label = value;
    rejectsConfig(input, 'tabs[0].label');
  }
  const input = copy();
  input.tabs[0].label = '  Messages <b>plain text</b>  ';
  assert.equal(normalizeChatConfig(input).tabs[0].label, input.tabs[0].label);
});

test('chats icon must be message-circle', () => {
  for (const icon of [undefined, null, false, '', ' ', {}, []]) {
    const input = copy();
    input.tabs[0].icon = icon;
    rejectsConfig(input, 'tabs[0].icon');
  }
  const input = copy();
  input.tabs[0].icon = 'users';
  rejectsConfig(input, 'tabs[0].icon', 'unsupported_capability');
});

test('enabled is boolean and chats must be enabled', () => {
  for (const enabled of [undefined, null, 'true', 1, {}, [], false]) {
    const input = copy();
    input.tabs[0].enabled = enabled;
    rejectsConfig(input, 'tabs[0].enabled');
  }
});

test('tab order is a non-negative integer', () => {
  for (const order of [undefined, null, false, '0', -1, 0.5, NaN, Infinity, {}, []]) {
    const input = copy();
    input.tabs[0].order = order;
    rejectsConfig(input, 'tabs[0].order');
  }
  const input = copy();
  input.tabs[0].order = 3;
  assert.equal(normalizeChatConfig(input).tabs[0].order, 3);
});

test('disabled invites/members are retained, with no rendering or sorting', () => {
  const input = copy();
  input.tabs = [disabled('members'), input.tabs[0], disabled('invites')];
  assert.deepEqual(normalizeChatConfig(input).tabs, input.tabs);
  assert.notEqual(normalizeChatConfig(input).tabs[0], input.tabs[0]);
});

test('enabled invites/members fail with explicit unsupported-capability errors', () => {
  for (const id of ['invites', 'members']) {
    const input = copy();
    input.tabs.push({ ...disabled(id), enabled: true });
    rejectsConfig(input, 'tabs[1].enabled', 'unsupported_capability');
  }
});

test('disabled entries still validate label, icon, enabled and order', () => {
  for (const [field, value] of [['label', ''], ['icon', ''], ['enabled', 'false'], ['order', -1]]) {
    const input = copy();
    input.tabs.push({ ...disabled('invites'), [field]: value });
    rejectsConfig(input, `tabs[1].${field}`);
  }
});

test('a tab array without chats is invalid even if all entries are disabled', () => {
  rejectsConfig({ schemaVersion: 1, tabs: [disabled('invites'), disabled('members')] }, 'tabs');
});

test('input is not mutated, including on failed validation', () => {
  const input = copy();
  input.tabs.push(disabled('invites'));
  const before = structuredClone(input);
  normalizeChatConfig(input);
  assert.deepEqual(input, before);
  input.tabs[1].enabled = true;
  const invalidBefore = structuredClone(input);
  rejectsConfig(input, 'tabs[1].enabled', 'unsupported_capability');
  assert.deepEqual(input, invalidBefore);
});

test('frozen input is accepted; output does not alias input', () => {
  const input = copy();
  for (const object of [input, input.layout, input.theme, input.tabs, input.tabs[0]]) Object.freeze(object);
  const result = normalizeChatConfig(input);
  result.theme.primaryColor = '#000000';
  result.tabs[0].label = 'Changed';
  assert.deepEqual(input, reference);
});

test('separate calls never share mutable defaults or output objects', () => {
  const first = normalizeChatConfig({ schemaVersion: 1 });
  const second = normalizeChatConfig({ schemaVersion: 1 });
  for (const field of ['layout', 'theme', 'tabs']) assert.notEqual(first[field], second[field]);
  assert.notEqual(first.tabs[0], second.tabs[0]);
  first.layout.width = 1;
  first.theme.primaryColor = '#000000';
  first.tabs[0].label = 'Changed';
  first.tabs.push(disabled('members'));
  assert.deepEqual(second, reference);
  assert.deepEqual(normalizeChatConfig({ schemaVersion: 1 }), reference);
});

test('explicit mapping drops unknown keys and never copies arbitrary object values', () => {
  const input = copy();
  input.arbitrary = { callback: () => {} };
  input.layout.onClick = { nested: true };
  input.theme.font = 'anything';
  input.tabs[0].action = 'execute()';
  input.tabs[0].html = '<script>ignored</script>';
  const result = normalizeChatConfig(input);
  assert.deepEqual(result, reference);
  assert.equal(input.layout.onClick.nested, true);
});

test('prototype-looking unknown JSON keys are dropped without merging', () => {
  const input = JSON.parse('{"schemaVersion":1,"__proto__":{"polluted":true},"theme":{"constructor":{}}}');
  const result = normalizeChatConfig(input);
  assert.deepEqual(result, reference);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(Object.hasOwn(result.theme, 'constructor'), false);
});

test('own fields on null-prototype JSON-like objects are supported', () => {
  const input = Object.assign(Object.create(null), { schemaVersion: 1, layout: Object.create(null) });
  assert.deepEqual(normalizeChatConfig(input), reference);
});

test('clan design is rejected as a separate format, even with a chat version attached', () => {
  for (const input of [
    { kind: 'clan-experience-design-proposal', version: 1 },
    { ...copy(), kind: 'clan-experience-design-proposal', version: 1 },
  ]) {
    rejectsConfig(input, 'kind', 'unsupported_config_format');
  }
});

test('legacy snake_case config is not silently accepted as chat-v1', () => {
  rejectsConfig({ schema_version: 1 }, 'schemaVersion', 'unsupported_version');
});
