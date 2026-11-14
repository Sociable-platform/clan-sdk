import {googleFontsHref} from '@clan/ui';
const documents=new WeakMap();
export function widgetFonts(doc) {
  // Standalone distributions include all panel CSS and use the renderer's system
  // font fallbacks. Source integrations retain optional Google Fonts loading.
  if (typeof __CLAN_STANDALONE__ !== 'undefined' && __CLAN_STANDALONE__) {
    return {update() {}, destroy() {}};
  }
  let href;
  const entries=documents.get(doc)??new Map();documents.set(doc,entries);
  const release=()=>{if(!href)return;const entry=entries.get(href);if(entry&&--entry.users===0){entry.link.remove();entries.delete(href);}href=undefined;};
  return {update(config){const next=googleFontsHref(config);if(next===href)return;release();if(!next)return;let entry=entries.get(next);if(!entry){const link=doc.createElement('link');link.rel='stylesheet';link.href=next;link.dataset.clanSdkFonts='';doc.head.append(link);entry={link,users:0};entries.set(next,entry);}entry.users++;href=next;},destroy:release};
}
