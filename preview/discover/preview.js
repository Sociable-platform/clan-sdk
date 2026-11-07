import { init } from '/src/index.js';
import { mockClanAdapter } from './mock-adapter.js';
const container=document.querySelector('#experience');
const events=document.querySelector('#events');
try {
  const response=await fetch('./config.json');
  if(!response.ok) throw new Error(`Preview config HTTP ${response.status}`);
  const config=await response.json();
  const sdk=init({socialUrl:`${location.origin}/__dev__/social`,getPlayerToken:async()=>'development-mock-player-token'});
  for(const name of ['navigate','joined']) container.addEventListener(`clan-sdk:${name}`,event=>{events.textContent=`${name}: ${JSON.stringify(event.detail)}`;});
  const widget=sdk.mountExperience({container,config,clanAdapter:mockClanAdapter});
  window.addEventListener('pagehide',()=>widget.destroy(),{once:true});
} catch(error) { events.textContent=error.message; }
