import {init,ConfigError} from '/src/index.js';
import {render,createMockData} from '@clan/ui';
import {currentConfig,chatRoot,sharedRoot,json,waitFor,type,button,withSocial,clan} from './helpers.js';
import {registerRemoteConfigTests} from './remote-config-tests.js';
import {registerDiscoverTests} from './discover-tests.js';
import {registerSocialPreviewTests} from './social-preview-tests.js';
import {registerPlatformConfigTests} from './platform-config-tests.js';
import {registerFriendsTests} from './friends-tests.js';
import {registerChatTests} from './chat-tests.js';
import {registerLeaveTests} from './leave-tests.js';
import {registerClanChatTests} from './clan-chat-tests.js';
import {registerBlockTests} from './block-tests.js';
import {registerClanManageTests} from './clan-manage-tests.js';

const sandbox=document.querySelector('#sandbox'),results=document.querySelector('#results'),cases=[];
const test=(name,run)=>cases.push({name,run});
const assert=(value,message)=>{if(!value)throw new Error(message);};
const config=(extra={})=>({schemaVersion:1,...extra});
const container=()=>sandbox.appendChild(document.createElement('div'));
const host=target=>target.querySelector('[data-clan-sdk-widget="chat"]');
const sdk=init({socialUrl:'https://social.test',getPlayerToken:()=>{throw new Error('No live auth in visual tests');}});
function fails(run,path){let error;try{run();}catch(e){error=e;}assert(error instanceof ConfigError&&(!path||error.path===path),'Expected ConfigError');}

test('legacy Chat API now mounts the shared package with empty/unavailable state, no invented conversation',()=>{
  const target=container(),handle=sdk.mountChatWidget({container:target,config:config()});
  try{const root=chatRoot(target);assert(root.querySelector('.sk-panel'),'Not shared UI');assert(root.textContent.includes('No conversations yet.')&&root.textContent.includes('unavailable'),'Unavailable state missing');assert(!root.querySelector('.sk-msg'),'Fabricated messages');assert(root.querySelector('.sk-tab').textContent==='Chats','Legacy label wrapper changed');}finally{handle.destroy();}
});
test('legacy Chat all four positions and dimensions remain accepted by its lifecycle wrapper',()=>{
  for(const position of ['top-left','top-right','bottom-left','bottom-right']){const target=container(),h=sdk.mountChatWidget({container:target,config:config({layout:{position,width:240,height:300}})});try{const box=host(target);assert(box.style.width==='240px'&&box.style.height==='300px','Dimensions changed');for(const edge of position.split('-'))assert(box.style[edge]==='8px','Position changed');}finally{h.destroy();}}
});
test('legacy Chat invalid initial config and invalid updates remain atomic',()=>{
  const target=container();fails(()=>sdk.mountChatWidget({container:target,config:config({schemaVersion:2})}),'schemaVersion');assert(!host(target),'Invalid config mounted');
  const h=sdk.mountChatWidget({container:target,config:config()});try{const before=chatRoot(target).innerHTML;fails(()=>h.updateConfig(config({theme:{primaryColor:'red'}})),'theme.primaryColor');assert(chatRoot(target).innerHTML===before,'Invalid update touched UI');}finally{h.destroy();}
});
test('legacy Chat destroy/remount preserves host content and cross-kind mount reservation',()=>{
  const target=container(),owned=target.appendChild(document.createElement('p'));owned.textContent='Game';const h=sdk.mountChatWidget({container:target,config:config()});
  let duplicate=false;try{sdk.mountExperience({container:target,config:currentConfig(),previewData:{}});}catch{duplicate=true;}assert(duplicate,'Duplicate mount allowed');h.destroy();h.destroy();assert(target.children.length===1&&target.firstChild===owned,'Removed host content');
  const next=sdk.mountChatWidget({container:target,config:config()});h.destroy();assert(host(target),'Old destroy removed new mount');next.destroy();let error;try{h.updateConfig(config());}catch(e){error=e;}assert(error,'Destroyed update accepted');
});
test('legacy Chat mounts/updates without Social fetch, token or WebSocket',()=>{
  const old=window.fetch,oldSocket=window.WebSocket;let calls=0;window.fetch=()=>{calls++;throw new Error('HTTP');};window.WebSocket=class{constructor(){calls++;}};
  let h;try{h=sdk.mountChatWidget({container:container(),config:config()});h.updateConfig(config({theme:{backgroundColor:'#FFFFFF'}}));h.destroy();assert(calls===0,'Visual wrapper used transport');}finally{h?.destroy();window.fetch=old;window.WebSocket=oldSocket;}
});
test('same current JSON and supplied preview data produce equivalent SDK/dashboard content and styling',()=>{
  const cfg=currentConfig(),data=createMockData(cfg);data.screen='discover';data.open=true;
  const direct=container(),target=container();direct.style.cssText='position:fixed;inset:0;pointer-events:none';
  const preview=render(direct,cfg,data),handle=sdk.mountExperience({container:target,config:cfg,previewData:data});
  try{const expected=direct.querySelector('[data-clan-ui]').shadowRoot,actual=sharedRoot(target);assert(actual.querySelector('.sk-root').innerHTML===expected.querySelector('.sk-root').innerHTML,'UI markup/config differs');for(const selector of ['.sk-panel','.sk-tab','.sk-row']){const a=getComputedStyle(actual.querySelector(selector)),b=getComputedStyle(expected.querySelector(selector));assert(a.backgroundColor===b.backgroundColor&&a.borderRadius===b.borderRadius&&a.color===b.color,'Styles differ');}assert(!actual.querySelector('aside,canvas,[data-editor]'),'Editor chrome leaked');}finally{preview.destroy();handle.destroy();}
});
test('current theme colors, part styles, corner/frame/fonts and safe labels reach the shared renderer',()=>{
  const cfg=currentConfig();cfg.theme.colors.background='#123456';cfg.theme.colors.text='#AABBCC';cfg.theme.frame.corners='square';cfg.theme.frame.color='#ABCDEF';cfg.theme.components={tabSelected:{background:'#654321',radius:7}};cfg.texts.labels.panelTitle='<img src=x>';
  const target=container(),h=sdk.mountExperience({container:target,config:cfg,previewData:{clan:null,clans:[],screen:'discover',tab:'clan'}});
  try{const root=sharedRoot(target),style=getComputedStyle(root.querySelector('.sk-panel'));assert(style.backgroundColor==='rgb(18, 52, 86)'&&style.color==='rgb(170, 187, 204)','Theme ignored');assert(style.borderTopLeftRadius==='0px'&&style.borderTopColor==='rgb(171, 205, 239)','Frame ignored');assert(root.querySelector('h2').textContent==='<img src=x>'&&!root.querySelector('img'),'Unsafe labels');assert(getComputedStyle(root.querySelector('[aria-selected="true"]')).backgroundColor==='rgb(101, 67, 33)','Component overrides ignored');}finally{h.destroy();}
});
test('feature visibility, terms, labels and fixed supported tab order use current JSON',()=>{
  const cfg=currentConfig();cfg.texts.terms={clan:'Guild',clans:'Guilds'};cfg.texts.labels.createCta='Create {clan}';const target=container(),h=sdk.mountExperience({container:target,config:cfg,previewData:{}});
  try{let root=sharedRoot(target);assert([...root.querySelectorAll('.sk-tab')].map(e=>e.textContent).join(',')==='Friends,Guild,Chat','Supported tab ordering changed');assert(button(root,'Create guild'),'Term interpolation missing');cfg.friends.enabled=false;cfg.chat.enabled=false;cfg.clan.screens.create.enabled=false;h.updateConfig(cfg);assert(root.querySelectorAll('.sk-tab').length===1&&!button(root,'Create guild'),'Feature/screen visibility ignored');}finally{h.destroy();}
});
test('current config retained across navigation; Create form/name draft survives theme update',()=>withSocial(container,(url)=>url.endsWith('/clan')?json({error:{code:'not_in_clan',message:'None'}},404):json({clans:[]}),async({mount})=>{
  const {root,handle,target}=mount();await waitFor(()=>root.textContent.includes('No clans found'));const first=target.firstChild,url=location.href;button(root,'Create').click();let input=type(root,'name','My draft');input.focus();input.setSelectionRange(1,4);const cfg=currentConfig();cfg.theme.colors.background='#223344';handle.updateConfig(cfg);input=root.querySelector('[data-key="name"]');assert(input.value==='My draft'&&root.activeElement===input,'Draft/focus lost');assert(input.selectionStart===1&&input.selectionEnd===4,'Selection lost');assert(target.firstChild===first&&location.href===url,'Navigation replaced container/URL');button(root,'Cancel').click();await waitFor(()=>root.querySelector('[data-key="search"]'));assert(getComputedStyle(root.querySelector('.sk-panel')).backgroundColor==='rgb(34, 51, 68)','Config lost on navigation');
}));
test('current invalid update leaves working config, focus and draft intact',()=>withSocial(container,()=>json({clan,role:'owner'}),async({mount})=>{
  const {root,handle}=mount();await waitFor(()=>root.querySelector('[data-key="message"]'));const input=type(root,'message','Unsent draft');input.focus();const before=root.innerHTML;const cfg=currentConfig();cfg.theme.colors.background='not-a-color';fails(()=>handle.updateConfig(cfg),'theme.colors.background');assert(root.innerHTML===before&&input.value==='Unsent draft'&&root.activeElement===input,'Invalid update changed state');
}));
test('live clan chat theme updates preserve draft/focus; unavailable Send/Enter never fabricate messages',()=>withSocial(container,()=>json({clan,role:'owner'}),async({mount})=>{
  const {root,handle}=mount();await waitFor(()=>root.querySelector('[data-key="message"]'));let input=type(root,'message','Unsent live draft');input.focus();const cfg=currentConfig();cfg.theme.colors.brand='#123456';handle.updateConfig(cfg);input=root.querySelector('[data-key="message"]');assert(input.value==='Unsent live draft'&&root.activeElement===input,'Draft/focus lost');const count=root.querySelectorAll('.sk-message').length;button(root,'Send').click();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert(root.querySelector('[data-key="message"]').value==='Unsent live draft'&&root.querySelectorAll('.sk-message').length===count,'Unavailable send fabricated/cleared draft');assert(button(root,'Send').disabled&&root.textContent.includes('unavailable'),'Unavailable state missing');
}));
test('independent shared widgets retain drafts and CSS isolation under hostile host rules',()=>withSocial(container,()=>json({clan,role:'member'}),async({mount})=>{
  const style=document.createElement('style');style.textContent='[data-clan-sdk-widget], [data-clan-ui] {display:none!important;position:static!important} h2,button,input{background:red!important;color:lime!important}';document.head.append(style);
  try{const a=mount(),cfg=currentConfig();cfg.theme.colors.background='#FFFFFF';const b=mount(cfg);await waitFor(()=>a.root.querySelector('[data-key="message"]')&&b.root.querySelector('[data-key="message"]'));type(a.root,'message','Only A');assert(b.root.querySelector('[data-key="message"]').value==='','Draft leaked');assert(getComputedStyle(a.target.firstChild).position==='fixed'&&getComputedStyle(a.target.firstChild).display==='block','Host rules leaked');assert(getComputedStyle(b.root.querySelector('.sk-panel')).backgroundColor==='rgb(255, 255, 255)','Theme leaked');a.handle.destroy();assert(b.target.firstChild.isConnected,'Destroy affected B');}finally{style.remove();}
}));
test('shared mobile container keeps panel/composer inside viewport and content scrolls',()=>withSocial(container,()=>json({clan,role:'member'}),async({mount})=>{
  const frame=document.createElement('iframe');frame.style.cssText='width:320px;height:480px;border:0';document.body.append(frame);
  try{const target=frame.contentDocument.body.appendChild(frame.contentDocument.createElement('div'));const {root}=mount(currentConfig(),target);await waitFor(()=>root.querySelector('.sk-composer'));const dock=root.querySelector('.sk-dock').getBoundingClientRect(),view=frame.contentWindow;assert(dock.left>=0&&dock.right<=view.innerWidth&&dock.top>=0&&dock.bottom<=view.innerHeight,'Dock overflows');const content=root.querySelector('.sk-content');assert(getComputedStyle(content).overflowY==='auto','Content cannot scroll');const composer=root.querySelector('.sk-composer');content.scrollTop=content.scrollHeight;const box=composer.getBoundingClientRect();assert(box.top>=0&&box.bottom<=view.innerHeight,'Composer inaccessible');}finally{frame.remove();}
}));
test('shared font assets load in both formats, update per widget and release only their own references',()=>{
  const before=document.querySelectorAll('link[data-clan-sdk-fonts]').length,cfg=currentConfig();cfg.theme.fonts.body.family='Orbitron';cfg.theme.fonts.heading.family='Orbitron';const a=sdk.mountExperience({container:container(),config:cfg,previewData:{}}),b=sdk.mountExperience({container:container(),config:cfg,previewData:{}});
  const links=document.querySelectorAll('link[data-clan-sdk-fonts]').length;
  assert(links===before+1,'Font link missing or duplicated');
  const next=currentConfig();next.theme.fonts.heading.family='Bangers';next.theme.fonts.body.family='Silkscreen';a.updateConfig(next);
  const owned=[...document.querySelectorAll('link[data-clan-sdk-fonts]')];
  assert(owned.length===links+1&&owned.some(link=>link.href.includes('Bangers')&&link.href.includes('Silkscreen')),'Config update did not load published font choices');
  b.destroy();assert(document.querySelectorAll('link[data-clan-sdk-fonts]').length===links,'Another widget font released early');
  a.destroy();assert(document.querySelectorAll('link[data-clan-sdk-fonts]').length===before,'Font asset leaked');
});
test('wrapped direct mount/update accepts current JSON and rejects invalid wrappers/versions atomically',()=>withSocial(container,()=>json({clan,role:'member'}),async({mount})=>{
  const cfg=currentConfig(),{root,handle}=mount({config:cfg});
  await waitFor(()=>root.querySelector('[data-key="message"]'));
  type(root,'message','Preserved wrapped draft').focus();
  cfg.theme.colors.background='#123456';handle.updateConfig({config:cfg});
  const input=root.querySelector('[data-key="message"]');
  assert(getComputedStyle(root.querySelector('.sk-panel')).backgroundColor==='rgb(18, 52, 86)'&&input.value==='Preserved wrapped draft'&&root.activeElement===input,'Wrapped update failed');
  const before=root.innerHTML;
  for(const value of [{config:null},{config:[]},{config:'bad'},{config:{...cfg,schemaVersion:2}}]){
    let error;try{handle.updateConfig(value);}catch(e){error=e;}
    assert(error instanceof ConfigError&&root.innerHTML===before&&root.activeElement===input&&input.value==='Preserved wrapped draft','Invalid wrapped update changed UI');
  }
  handle.updateConfig(cfg);assert(root.querySelector('[data-key="message"]').value==='Preserved wrapped draft','Unwrapped compatibility lost');
}));
registerRemoteConfigTests({test,assert,sdk,config,container,host,chatRoot});
registerDiscoverTests({test,assert,container});
registerSocialPreviewTests({test,assert});
registerPlatformConfigTests({test,assert,container});
registerFriendsTests({test,assert,container});
registerChatTests({test,assert,container});
registerLeaveTests({test,assert,container});
registerClanChatTests({test,assert,container});
registerBlockTests({test,assert,container});
registerClanManageTests({test,assert,container});
let failures=0;
// Let settled token/HTTP microtasks drain before the next case installs its
// recording fetch. Abandoned requests must not contaminate another fixture.
for(const entry of cases){const result=document.createElement('li');try{await entry.run();result.textContent=`PASS: ${entry.name}`;}catch(error){failures++;result.textContent=`FAIL: ${entry.name}: ${error.message}`;}results.append(result);await new Promise(done=>setTimeout(done,0));}
const summary=document.querySelector('#summary');summary.textContent=`${cases.length-failures} passed, ${failures} failed (${cases.length} browser tests)`;summary.dataset.result=failures?'failed':'passed';
