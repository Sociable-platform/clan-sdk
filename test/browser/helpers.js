import {init} from '/src/index.js';
const response=await fetch('/test/browser/fixtures/platform-widget-v1.json');
const published=await response.json();
export const currentConfig=()=>structuredClone(published.config);
export const json=(value,status=200,etag)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...(etag?{ETag:etag}:{})}});
export const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
export const sleep=ms=>new Promise(done=>setTimeout(done,ms));
export const waitFor=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await sleep(10);}throw new Error('Timed out waiting for UI');};
export async function openDm(root,id) {
  await waitFor(()=>root.querySelector('.sk-convo')||root.querySelector('[data-key="message"]'));
  const row=id?root.querySelector(`[data-key="convo-${id}"]`):root.querySelector('.sk-convo');
  if(row)row.click();
  await waitFor(()=>root.querySelector('[data-key="message"]'));
}
export const sharedRoot=target=>target.querySelector('[data-clan-sdk-widget="experience"] [data-clan-ui]')?.shadowRoot;
export const chatRoot=target=>target.querySelector('[data-clan-sdk-widget="chat"]')?.shadowRoot.querySelector('[data-clan-ui]')?.shadowRoot;
export const rows=root=>[...root.querySelectorAll('.sk-content > .sk-row')];
export const type=(root,key,value)=>{const input=root.querySelector(`[data-key="${key}"]`);if(!input)throw new Error(`Missing ${key} input`);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));return root.querySelector(`[data-key="${key}"]`);};
export const button=(root,text)=>[...root.querySelectorAll('button')].find(el=>(el.getAttribute('aria-label')??el.textContent).includes(text));
export const clan={id:'a/b',name:'Nightfall',memberCount:3,maxMembers:5};
export const noClan=()=>json({error:{code:'not_in_clan',message:'Player is not in a clan'}},404);
export async function withSocial(container,fetcher,run) {
  const original=window.fetch,handles=[],calls=[];
  window.fetch=(url,options)=>{calls.push({url,...options});return Promise.resolve().then(()=>fetcher(url,options,calls));};
  const sdk=init({socialUrl:'https://social.browser.test',getPlayerToken:async()=>'synthetic-token'});
  const mount=(config=currentConfig(),target=container(),extra={})=>{const handle=sdk.mountExperience({container:target,config,...extra});handles.push(handle);return {handle,target,root:sharedRoot(target)};};
  try{await run({sdk,mount,calls});}finally{handles.forEach(h=>h.destroy());window.fetch=original;}
}
