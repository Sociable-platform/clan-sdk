import { init as initSocialClient, socialInternals } from './social/client.js';
import { mountChatWidget } from './ui/chat-widget.js';
import { mountChatWidgetFromUrl } from './ui/remote-chat-widget.js';
import { mountExperience } from './ui/experience-widget.js';
import { platformSettings, createPlatformConfigLoader } from './config/platform.js';
import { mountPlatformExperience } from './ui/platform-experience.js';
import {bindPlayerSession} from './social/session.js';
import {bindChatClient,chatClient} from './chat/client.js';

const platformLoaders = new WeakMap();
const clients = new WeakMap();

// Prototype methods allow additive widget capabilities without changing the
// existing five own Social operations. Construction/import never touches the DOM.
class SDK {
  listConversations() { const client=chatClient(this);if(!client)throw new TypeError('Provide realtimeUrl to use chat.');return client.listConversations(); }
  listMessages(id,options) { const client=chatClient(this);if(!client)throw new TypeError('Provide realtimeUrl to use chat.');return client.listMessages(id,options); }
  getMyPlayer() { return clients.get(this).friends.getMyPlayer(); }
  listFriends() { return clients.get(this).friends.listFriends(); }
  searchPlayers(options) { return clients.get(this).friends.searchPlayers(options); }
  listFriendRequests() { return clients.get(this).friends.listFriendRequests(); }
  sendFriendRequest(options) { return clients.get(this).friends.sendFriendRequest(options); }
  acceptFriendRequest(id) { return clients.get(this).friends.acceptFriendRequest(id); }
  declineFriendRequest(id) { return clients.get(this).friends.declineFriendRequest(id); }
  cancelFriendRequest(id) { return clients.get(this).friends.cancelFriendRequest(id); }
  removeFriend(id) { return clients.get(this).friends.removeFriend(id); }
  resetPlayerSession() { clients.get(this).session.reset(); }
  mountExperience(options) {
    const load = platformLoaders.get(this);
    if (load && !Object.hasOwn(options ?? {},'config')) return mountPlatformExperience(this,load,options);
    return mountExperience(this, options);
  }
  loadConfig(options) {
    const load = platformLoaders.get(this);
    if (!load) throw new TypeError('Provide both gameId and platformUrl to load published configuration.');
    return load(options);
  }
  mountChatWidget(options) {
    return mountChatWidget(options);
  }
  mountChatWidgetFromUrl(options) {
    return mountChatWidgetFromUrl(options);
  }
}

export function init(options) {
  const social = initSocialClient(options);
  const settings = platformSettings(options);
  const sdk = Object.assign(new SDK(), social);
  clients.set(sdk,socialInternals(social));
  bindPlayerSession(sdk,clients.get(sdk).session);
  bindChatClient(sdk,options,clients.get(sdk));
  if (settings) platformLoaders.set(sdk,createPlatformConfigLoader(settings));
  return sdk;
}

export { ApiError } from './social/errors.js';
export { normalizeChatConfig } from './config/chat.js';
export { validateExperienceConfig } from './config/experience.js';
export { ConfigError } from './config/errors.js';
export { normalizeWidgetConfig } from './config/widget.js';
export { ConfigLoadError } from './config/load.js';
