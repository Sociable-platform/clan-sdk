import { init as initSocialClient } from './social/client.js';
import { mountChatWidget } from './ui/chat-widget.js';

// Prototype methods allow additive widget capabilities without changing the
// existing five own Social operations. Construction/import never touches the DOM.
class SDK {
  mountChatWidget(options) {
    return mountChatWidget(options);
  }
}

export function init(options) {
  return Object.assign(new SDK(), initSocialClient(options));
}

export { ApiError } from './social/errors.js';
export { normalizeChatConfig } from './config/chat.js';
export { ConfigError } from './config/errors.js';
