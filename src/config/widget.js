import {ConfigError} from './errors.js';
import {discoverConfig} from './discover.js';
import {normalizeChatConfig} from './chat.js';
import {unwrapConfig} from './input.js';

// Direct updates get small type checks before replacing a working renderer.
// Published payloads remain unvalidated per the caller's existing policy.
export function widgetConfig(input,{validate=false}={}) {
  input=unwrapConfig(input);
  if(input && typeof input==='object' && !Array.isArray(input) && (input.kind===undefined||input.clan||input.chat||input.friends)) {
    if(validate) {
      if(input.schemaVersion!==1)throw new ConfigError('schemaVersion','Expected version 1.');
      for(const key of ['theme','layout','clan','chat','friends','texts']) {
        if(input[key]!==undefined&&(input[key]===null||typeof input[key]!=='object'||Array.isArray(input[key])))throw new ConfigError(key,'Expected an object.');
      }
      const object=(value,path)=>{if(value!==undefined&&(value===null||typeof value!=='object'||Array.isArray(value)))throw new ConfigError(path,'Expected an object.');};
      for(const key of ['colors','fonts','frame','buttons','panel','textures','components'])object(input.theme?.[key],`theme.${key}`);
      for(const key of ['terms','labels'])object(input.texts?.[key],`texts.${key}`);
      object(input.clan?.screens,'clan.screens');
      for(const [key,value] of Object.entries(input.clan?.screens??{})){
        object(value,`clan.screens.${key}`);
        if(value?.enabled!==undefined&&typeof value.enabled!=='boolean')throw new ConfigError(`clan.screens.${key}.enabled`,'Expected a boolean.');
      }
      for(const key of ['friends','clan','chat'])if(input[key]?.enabled!==undefined&&typeof input[key].enabled!=='boolean')throw new ConfigError(`${key}.enabled`,'Expected a boolean.');
      if(input.layout?.position!==undefined&&!['bottom-left','bottom-right'].includes(input.layout.position))throw new ConfigError('layout.position','Expected bottom-left or bottom-right.');
      if(input.layout?.startCollapsed!==undefined&&typeof input.layout.startCollapsed!=='boolean')throw new ConfigError('layout.startCollapsed','Expected a boolean.');
      for(const [key,value] of Object.entries(input.theme?.colors??{}))if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw new ConfigError(`theme.colors.${key}`,'Expected #RRGGBB.');
    }
    return structuredClone(input);
  }
  // Compatibility wrappers retain old API inputs, never old visual components.
  if(input?.kind==='clan-complete-ui') {
    const old=discoverConfig(input,{validate});
    return {schemaVersion:1,theme:{colors:{brand:old.theme.accent,background:old.theme.background,text:old.theme.text},fonts:{body:{family:'Inter'},heading:{family:'Inter'}},frame:{corners:old.theme.radius===0?'square':'round'}},layout:{position:old.position??'bottom-right',startCollapsed:false},clan:{enabled:old.enabled!==false,screens:{discover:{enabled:true},create:{enabled:old.sections.some(s=>s.type==='button'&&s.visible)},home:{enabled:true},members:{enabled:true}}},friends:{enabled:false},chat:{enabled:false},texts:{labels:{searchClans:old.sections.find(s=>s.type==='search')?.label??'Search clans',createCta:old.sections.find(s=>s.type==='button')?.label??'Create clan'}}};
  }
  throw new ConfigError('$','Expected the current widget configuration.');
}

/** Normalize caller-supplied current JSON before preview rendering or mounting. */
export function normalizeWidgetConfig(input) {
  return widgetConfig(input,{validate:true});
}

export function legacyChatConfig(input) {
  const value=normalizeChatConfig(input);
  return {schemaVersion:1,theme:{colors:{brand:value.theme.primaryColor,background:value.theme.backgroundColor,text:value.theme.textColor},frame:{corners:value.theme.borderRadius===0?'square':'round'}},layout:{position:value.layout.position.endsWith('left')?'bottom-left':'bottom-right',startCollapsed:false},friends:{enabled:false},clan:{enabled:false},chat:{enabled:true,clanChat:true,directMessages:true},texts:{labels:{tabChat:value.tabs.find(t=>t.id==='chats').label}}};
}
