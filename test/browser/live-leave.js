import {init} from '../../src/index.js';
const response=await fetch(new URL('./fixtures/platform-widget-v1.json',import.meta.url)),config=(await response.json()).config;
config.friends.enabled=false;config.chat.enabled=false;config.layout.startCollapsed=false;
const tokenBase=new URL(location.href).searchParams.get('tokenBase')??location.origin;
const sdk=init({socialUrl:'http://localhost:8082',getPlayerToken:async()=>{const r=await fetch(tokenBase+'/__live__/leave-token',{cache:'no-store'});if(!r.ok)throw new Error('Dedicated token unavailable');return (await r.json()).token;}});
const widget=sdk.mountExperience({container:document.querySelector('#widget'),config});
document.querySelector('#widget').addEventListener('clan-sdk:left',()=>{document.querySelector('#result').textContent='Confirmed backend leave. Reload this page to verify persisted non-membership.';});
window.addEventListener('pagehide',()=>widget.destroy(),{once:true});
