import {widgetConfig} from './widget.js';

// SDK-owned appearance in the current shared format, never sample player data.
// The renderer supplies its own documented optional style defaults.
export function defaultExperienceConfig() {
  return widgetConfig({
    schemaVersion:1,
    theme:{mode:'dark',colors:{brand:'#8B65EE',background:'#171923',surface:'#242635',text:'#F4F4F9',muted:'#A0A0B0'},frame:{style:'solid',width:1,color:'#353545',corners:'soft'}},
    layout:{position:'bottom-right',startCollapsed:false},
    clan:{enabled:true,maxMembers:20,screens:{discover:{enabled:true},create:{enabled:true},home:{enabled:true,header:'compact',showStats:false},members:{enabled:true}}},
    friends:{enabled:false},chat:{enabled:false},texts:{terms:{clan:'Clan',clans:'Clans'},labels:{}},
  },{validate:true});
}
