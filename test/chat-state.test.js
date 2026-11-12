import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChatState } from '../src/ui/chat-state.js';

test('draft state distinguishes blank text without claiming transport availability', () => {
  for (const draft of ['', ' ', '\n\t', 'hello', '  hello  ']) {
    const state = createChatState(draft);
    assert.equal(state.draft, draft);
    assert.equal(state.hasSendableDraft, draft.trim().length > 0);
    assert.equal(state.canSend, false);
    assert.equal(state.connection, 'disconnected');
    assert.equal(state.availability, 'unavailable');
    assert.equal(state.messageState, 'empty');
  }
});

test('draft snapshots are independent, immutable, and do not invent message DTOs', () => {
  const first = createChatState('one');
  const second = createChatState();
  assert.notEqual(first, second);
  assert.equal(second.draft, '');
  assert.ok(Object.isFrozen(first));
  assert.throws(() => { first.draft = 'changed'; }, TypeError);
  assert.equal(first.messages, undefined);
});

test('draft state rejects non-string values without coercion', () => {
  for (const value of [null, 1, false, [], {}]) {
    assert.throws(() => createChatState(value), TypeError);
  }
});
