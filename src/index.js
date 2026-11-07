import { init as initSocialClient } from './social/client.js';
import { mountChatWidget } from './ui/chat-widget.js';
import { mountChatWidgetFromUrl } from './ui/remote-chat-widget.js';
import { mountExperience } from './ui/experience-widget.js';

// Prototype methods allow additive widget capabilities without changing the
// existing five own Social operations. Construction/import never touches the DOM.
class SDK {
  mountExperience(options) {
    return mountExperience(this, options);
  }
  mountChatWidget(options) {
    return mountChatWidget(options);
  }
  mountChatWidgetFromUrl(options) {
    return mountChatWidgetFromUrl(options);
  }
}

export function init(options) {
  return Object.assign(new SDK(), initSocialClient(options));
}

export { ApiError } from './social/errors.js';
export { normalizeChatConfig } from './config/chat.js';
export { validateExperienceConfig } from './config/experience.js';
export { ConfigError } from './config/errors.js';
export { ConfigLoadError } from './config/load.js';
