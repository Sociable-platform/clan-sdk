import {render,createMockData} from '@clan/ui';
import {init,normalizeWidgetConfig} from '/src/index.js';
// All fake data/actions are explicitly confined to this development test page.
const sdk=init({socialUrl:'https://unused.invalid',getPlayerToken:()=>{throw new Error('Preview must not request authentication');}});
const response=await fetch('/test/browser/fixtures/platform-widget-v1.json');
let config=normalizeWidgetConfig(await response.json()),widget,preview,data;
const editor=document.querySelector('#json'),status=document.querySelector('#status');
editor.value=JSON.stringify(config,null,2);
function dataset(){const screen=document.querySelector('#scenario').value;return {...createMockData(config,{inClan:['home','members','chat'].includes(screen)}),open:true,screen:screen==='chat'?'home':screen,tab:screen==='chat'?'chat':'clan',actions:{join:()=>{status.textContent='Preview Join callback only; no membership or HTTP request is fabricated.';},create:()=>{status.textContent='Preview Create callback only; no HTTP request.';},sendMessage:()=>{status.textContent='Preview-only action; no transport.';}}};}
function mount(){if(widget)return;data=dataset();widget=sdk.mountExperience({container:document.querySelector('#sdk'),config,previewData:data});}
function apply(){try{const next=normalizeWidgetConfig(JSON.parse(editor.value));if(widget)widget.updateConfig(next);else {config=next;mount();}config=next;preview?.update(config,data);status.textContent='Same JSON applied to both shared widgets. Preview data is fabricated.';}catch(error){status.textContent=`Config unchanged: ${error.message}`;}}
function scenario(){widget?.destroy();preview?.destroy();widget=undefined;data=dataset();preview=render(document.querySelector('#dashboard'),config,data);widget=sdk.mountExperience({container:document.querySelector('#sdk'),config,previewData:data});status.textContent='Explicit sample state supplied to both renderers. No live backend connection.';}
document.querySelector('#apply').addEventListener('click',apply);
document.querySelector('#scenario').addEventListener('change',scenario);
document.querySelector('#destroy').addEventListener('click',()=>{widget?.destroy();widget=undefined;status.textContent='SDK widget destroyed. Its owned DOM, listeners and font reference were removed.';});
document.querySelector('#remount').addEventListener('click',()=>{mount();status.textContent='SDK remounted from retained JSON and explicit preview data.';});
window.addEventListener('pagehide',()=>{widget?.destroy();preview?.destroy();},{once:true});
scenario();
