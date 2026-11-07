import { createPlaceholderChatRenderer } from './renderers/placeholder-chat.js';

// Small INTERNAL replacement boundary. This is not a proposed shared-component
// prop contract. Inspect the frontend package before writing its eventual adapter.
// Rendering owns visual nodes/listeners; the SDK supplies normalized config,
// state and action callbacks. No authentication or transport belongs here.
export function createChatRenderer(shadowRoot, actions) {
  return createPlaceholderChatRenderer(shadowRoot, actions);
}
