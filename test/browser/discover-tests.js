import { init } from '/src/index.js';
// Stable test fixture: editing the development preview must not change assertions.
const reference = await (await fetch('/test/fixtures/config/complete-experience-v1.json')).json();
const json = (value, status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const deferred = () => { let resolve; const promise=new Promise(done=>resolve=done); return {promise,resolve}; };
const sleep = ms => new Promise(done=>setTimeout(done,ms));
const models=[{id:'a/b',name:'Nightfall',emblemText:'♜',memberCount:3,maxMembers:5,canJoin:true},{id:'full',name:'Full clan',memberCount:5,maxMembers:5}];
// Provisional test-only wire envelope, deliberately different from demo DTOs.
const adapter = raw => raw.testItems;
export function registerDiscoverTests({test,assert,container}) {
  const makeSDK=()=>init({socialUrl:'https://discover.test',getPlayerToken:async()=>'test-token'});
  const root=target=>target.querySelector('[data-clan-sdk-widget="experience"]').shadowRoot;
  const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await sleep(10);}throw new Error('Timed out waiting for Discover');};
  const input=(shadow,value)=>{const el=shadow.querySelector('input');el.value=value;el.dispatchEvent(new Event('input'));return el;};
  const fixture=async (fetcher,run)=>{
    const original=window.fetch; const widgets=[]; const calls=[];
    window.fetch=(url,options)=>{calls.push({url,...options});return Promise.resolve(fetcher(url,options,calls.length));};
    const mount=(config=structuredClone(reference),target=container())=>{
      const widget=makeSDK().mountExperience({container:target,config,clanAdapter:adapter});widgets.push(widget);return {widget,target,shadow:root(target)};
    };
    try{await run({mount,calls});}finally{widgets.forEach(widget=>widget.destroy());window.fetch=original;}
  };
  test('Discover initial loading uses Social client, renders supported data and disables full clans',()=>fixture(()=>json({testItems:models}),async({mount,calls})=>{
    const {shadow}=mount(); assert(shadow.textContent.includes('Loading clans'),'Missing loading');
    await waitFor(()=>shadow.querySelectorAll('.card').length===2);
    assert(calls[0].url==='https://discover.test/api/v1/clans'&&calls[0].headers.Authorization==='Bearer test-token','Did not reuse Social client');
    assert(shadow.querySelector('.metadata').textContent==='3/5 members · Open','Missing supported metadata');
    assert(shadow.querySelectorAll('.join')[1].disabled,'Full clan is joinable');
  }));
  test('Discover debounces search and ignores responses stale before and after debounce',()=>{
    const initial=deferred(),old=deferred(),latest=deferred();
    return fixture((url,options,count)=>count===1?initial.promise:count===2?old.promise:latest.promise,async({mount,calls})=>{
      const {shadow}=mount(); input(shadow,'old'); initial.resolve(json({testItems:models}));
      await sleep(20); assert(!shadow.querySelector('.card'),'Stale initial result appeared');
      await waitFor(()=>calls.length===2); input(shadow,'new & clans'); await waitFor(()=>calls.length===3);
      latest.resolve(json({testItems:[{id:'new',name:'Newest'}]})); await waitFor(()=>shadow.querySelector('.clan-name')?.textContent==='Newest');
      old.resolve(json({testItems:models})); await sleep(20);
      assert(shadow.querySelector('.clan-name').textContent==='Newest','Stale search overwrote new result');
      assert(calls[2].url.endsWith('?q=new+%26+clans'),'Query not encoded');
    });
  });
  test('Discover empty state, API error and Retry use real controller transitions',()=>fixture((url,options,count)=>count===1?json({error:{code:'unavailable',message:'Try again'}},503):json({testItems:[]}),async({mount,calls})=>{
    const {shadow}=mount(); await waitFor(()=>shadow.querySelector('[data-action="retry"]'));
    assert(shadow.textContent.includes('Try again'),'Server error lost'); shadow.querySelector('[data-action="retry"]').click();
    await waitFor(()=>shadow.textContent.includes('No clans found')); assert(calls.length===2,'Retry not requested');
  }));
  test('Discover join pending prevents duplicates, failure stays visible, success emits id without fake navigation',()=>{
    const pending=deferred(); let joins=0;
    return fixture((url,options)=>options.method==='GET'?json({testItems:models}):++joins===1?pending.promise:new Response(null,{status:204}),async({mount,calls})=>{
      const {shadow,target}=mount(); const joined=[]; const nav=[];
      target.addEventListener('clan-sdk:joined',e=>joined.push(e.detail)); target.addEventListener('clan-sdk:navigate',e=>nav.push(e.detail));
      await waitFor(()=>shadow.querySelector('.join')); const button=shadow.querySelector('.join'); button.click(); button.click();
      await waitFor(()=>calls.length===2); assert(joins===1&&shadow.querySelector('.join').disabled,'Duplicate join permitted');
      pending.resolve(json({error:{code:'clan_full',message:'Capacity changed'}},409)); await waitFor(()=>shadow.textContent.includes('Capacity changed'));
      shadow.querySelector('.join').click(); await waitFor(()=>joined.length===1);
      assert(joined[0].clanId==='a/b'&&nav.length===0,'Wrong success/navigation event');
      assert(calls.at(-1).url.endsWith('/clans/a%2Fb/join'),'Join ID not encoded');
      assert(shadow.textContent.includes('Joined successfully'),'No success feedback');
    });
  });
  test('Discover appearance, section order/visibility and safe text follow complete config',()=>fixture(()=>json({testItems:[{id:'x',name:'<img src=x onerror=alert(1)>'}]}),async({mount})=>{
    const config=structuredClone(reference); const s=config.screens.discover;
    s.sections=[s.sections[2],{...s.sections[0],label:'<script>unsafe()</script>'},s.sections[1],{...s.sections[3],visible:false}];
    const {shadow,target}=mount(config); await waitFor(()=>shadow.querySelector('.card'));
    const style=getComputedStyle(shadow.querySelector('.widget'));
    assert(style.backgroundColor==='rgb(23, 25, 35)'&&parseFloat(style.borderRadius)===16,'Theme not applied');
    assert(getComputedStyle(shadow.querySelector('.hero-icon')).backgroundColor==='rgb(231, 121, 170)','Accent not applied');
    const expectedWidth=Math.min(config.screens.discover.width,target.getBoundingClientRect().width);
    assert(Math.abs(target.firstElementChild.getBoundingClientRect().width-expectedWidth)<1,'Width not applied');
    assert(shadow.querySelector('.sections').firstElementChild.dataset.sectionId==='list','Order ignored');
    assert(!shadow.querySelector('.create')&&!shadow.querySelector('script')&&!shadow.querySelector('img'),'Unsafe or hidden elements rendered');
    assert(shadow.querySelector('h2').textContent==='<script>unsafe()</script>','Config text not preserved safely');
    assert(!shadow.querySelector('.metadata')&&!shadow.querySelector('.emblem'),'Invented missing DTO fields');
  }));
  test('Discover valid appearance updates preserve search/focus; invalid update is atomic',()=>fixture(()=>json({testItems:models}),async({mount})=>{
    const {shadow,widget}=mount(); await waitFor(()=>shadow.querySelector('.card'));
    const search=input(shadow,'draft'); search.focus();
    const next=structuredClone(reference);next.theme.accent='#123456';next.theme.radius=24;
    widget.updateConfig(next);
    assert(shadow.activeElement===search&&search.value==='draft','Update lost focus/draft');
    const before=shadow.innerHTML; next.theme.radius=-1;
    let threw=false;try{widget.updateConfig(next);}catch{threw=true;}
    assert(threw&&shadow.innerHTML===before,'Invalid update changed UI');
  }));
  test('Discover screen background applies on mount/update and falls back when removed',()=>fixture(()=>json({testItems:models}),async({mount})=>{
    const config=structuredClone(reference);config.screens.discover.background='#21338c';
    const {shadow,widget}=mount(config);await waitFor(()=>shadow.querySelector('.card'));
    const surface=shadow.querySelector('.widget');
    assert(getComputedStyle(surface).backgroundColor==='rgb(33, 51, 140)','Screen background did not override shared theme');
    const search=input(shadow,'draft');search.focus();
    config.screens.discover.background='#AbCdEf';widget.updateConfig(config);
    assert(getComputedStyle(surface).backgroundColor==='rgb(171, 205, 239)','Updated screen background ignored');
    assert(shadow.activeElement===search&&search.value==='draft','Background update lost search/focus');
    config.screens.discover.background=null;
    let error;try{widget.updateConfig(config);}catch(e){error=e;}
    assert(error?.path==='screens.discover.background'&&getComputedStyle(surface).backgroundColor==='rgb(171, 205, 239)','Invalid background update changed UI');
    delete config.screens.discover.background;config.theme.background='#445566';widget.updateConfig(config);
    assert(getComputedStyle(surface).backgroundColor==='rgb(68, 85, 102)','Shared background fallback missing');
    delete config.theme.background;widget.updateConfig(config);
    assert(getComputedStyle(surface).backgroundColor==='rgb(23, 25, 35)','Default background fallback missing');
  }));
  test('Discover Create handoff and Back stay in one mount without changing game URL or duplicate requests',()=>fixture(()=>json({testItems:models}),async({mount,calls})=>{
    const {shadow,target}=mount(); const first=target.firstElementChild; const url=location.href; const events=[];
    target.addEventListener('clan-sdk:navigate',e=>events.push(e.detail.screen));
    await waitFor(()=>shadow.querySelector('.card')); input(shadow,'cancelled'); shadow.querySelector('.create').click();
    assert(!shadow.querySelector('.handoff').hidden&&!shadow.querySelector('form'),'Create form should not exist');
    await sleep(300); assert(calls.length===1,'Search survived navigation');
    shadow.querySelector('.handoff button').click(); await waitFor(()=>calls.length===2); await waitFor(()=>shadow.querySelector('.card'));
    assert(target.firstElementChild===first&&location.href===url,'Navigation replaced mount or game URL');
    assert(events.join(',')==='create,discover','Missing navigation events');
  }));
  test('Discover destroy ignores pending loads/joins, removes listeners and allows remount preserving host content',()=>{
    const pending=deferred();
    return fixture(()=>pending.promise,async({mount,calls})=>{
      const target=container(); const owned=document.createElement('p'); owned.textContent='Host content';target.append(owned);
      const {widget,shadow}=mount(undefined,target); const search=input(shadow,'cancelled'); const create=shadow.querySelector('.create'); let events=0;
      target.addEventListener('clan-sdk:navigate',()=>events++); widget.destroy(); widget.destroy();
      pending.resolve(json({testItems:models})); create.click(); search.dispatchEvent(new Event('input')); await sleep(300);
      assert(calls.length===1&&events===0&&target.children.length===1&&target.firstChild===owned,'Destroy leaked work or removed host content');
      mount(undefined,target); await waitFor(()=>calls.length===2);
    });
  });
  test('Discover independent instances, CSS isolation and cross-kind mount reservation',()=>fixture(()=>json({testItems:models}),async({mount})=>{
    const hostile=document.createElement('style');hostile.textContent='button,input,section{background:red!important;color:lime!important}';document.head.append(hostile);
    try {
      const a=mount();const config=structuredClone(reference);config.theme.background='#ffffff'; const b=mount(config);
      await waitFor(()=>a.shadow.querySelector('.card')&&b.shadow.querySelector('.card'));
      assert(getComputedStyle(a.shadow.querySelector('.widget')).backgroundColor==='rgb(23, 25, 35)','Host CSS leaked');
      assert(getComputedStyle(b.shadow.querySelector('.widget')).backgroundColor==='rgb(255, 255, 255)','Instances share config');
      input(a.shadow,'only a');assert(b.shadow.querySelector('input').value==='','Search shared');
      let error;try{makeSDK().mountChatWidget({container:a.target,config:{schemaVersion:1}});}catch(e){error=e;}
      assert(error?.message.includes('already has'),'Cross-kind duplicate mount allowed');
      a.widget.destroy();assert(b.target.firstChild.isConnected,'Destroy affected other instance');
    } finally {hostile.remove();}
  }));
  test('Discover requires an explicit adapter until DTOs are confirmed; invalid mount leaves container untouched',()=>{
    const target=container();let error;try{makeSDK().mountExperience({container:target,config:reference});}catch(e){error=e;}
    assert(error?.message.includes('clanAdapter')&&!target.children.length,'Missing contract silently guessed');
  });
  test('Discover fits a narrow viewport and scrolls to an accessible Create button',()=>fixture(()=>json({testItems:models}),async({mount})=>{
    const frame=document.createElement('iframe'); frame.style.cssText='width:280px;height:360px;border:0'; document.body.append(frame);
    try {
      const doc=frame.contentDocument; doc.body.style.margin='0'; const target=doc.body.appendChild(doc.createElement('div'));
      const {shadow,widget}=mount(undefined,target); await waitFor(()=>shadow.querySelector('.card'));
      const surface=shadow.querySelector('.widget'); const button=shadow.querySelector('.create');
      assert(target.firstElementChild.getBoundingClientRect().width<=280,'Widget overflows viewport');
      assert(surface.scrollHeight>surface.clientHeight&&getComputedStyle(surface).overflowY==='auto','Widget cannot scroll');
      surface.scrollTop=surface.scrollHeight; button.focus(); const bounds=button.getBoundingClientRect();
      assert(bounds.top>=0&&bounds.bottom<=360&&shadow.activeElement===button,'Create inaccessible on small viewport');
      widget.destroy();
    } finally {frame.remove();}
  }));
}
