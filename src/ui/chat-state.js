// SDK-owned state, not frontend component props or a backend message DTO.
export function createChatState(draft = '') {
  if (typeof draft !== 'string') throw new TypeError('Chat draft must be a string.');
  return Object.freeze({
    draft,
    hasSendableDraft: draft.trim().length > 0,
    canSend: false,
    connection: 'disconnected',
    availability: 'unavailable',
    messageState: 'empty',
  });
}
