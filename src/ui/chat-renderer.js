import {createSharedRenderer} from './shared-renderer.js';
import {legacyChatConfig} from '../config/widget.js';

// Legacy API wrapper; all visual nodes come from @clan/ui. No conversation is
// invented to make a composer appear before real runtime data is available.
export function createChatRenderer(shadowRoot) {
  const shared=createSharedRenderer(shadowRoot);
  return {update({config}){shared.update(legacyChatConfig(config),{tab:'chat',open:true,clan:null,clans:[],friends:[],requests:[],messages:[],threads:{},screen:'discover',sdkState:{},actions:{}});},destroy:()=>shared.destroy()};
}
