import {widgetConfig} from '../config/widget.js';
import {resolveScreen} from '@clan/ui';
import {createExperienceController} from '../experience/shared-controller.js';
import {createFriendsController} from '../friends/controller.js';
import {createExperienceRenderer} from './experience-renderer.js';
import {assertContainerAvailable,reserveContainer,releaseContainer} from './mount-registry.js';
import {socialClanAdapter} from '../social/clan-adapter.js';
import {playerSession} from '../social/session.js';

export function mountExperience(sdk,{container,config,clanAdapter=socialClanAdapter,assets={},previewData}={}, {validate=true}={}) {
  assertContainerAvailable(container);
  let current=widgetConfig(config,{validate});
  if(typeof clanAdapter!=='function')throw new TypeError('clanAdapter must be a function when supplied.');
  let destroyed=false,state,friendState,controller,friends,renderer;
  const live=previewData===undefined;
  const doc=container.ownerDocument,host=doc.createElement('div');host.dataset.clanSdkWidget='experience';
  for(const [key,value]of Object.entries({all:'initial',display:'block',position:'fixed',inset:'0','pointer-events':'none','z-index':'1000',margin:'0',padding:'0',border:'0'}))host.style.setProperty(key,value,'important');
  const notify=(name,detail)=>host.dispatchEvent(new doc.defaultView.CustomEvent(`clan-sdk:${name}`,{detail,bubbles:true,composed:true}));
  function data() {
    if(!live)return previewData;
    // Bind component actions to this generation, not the mutable replacement
    // controllers. Detached old nodes must never invoke the next player's actions.
    const clanActions=controller,friendActions=friends;
    const searching=state?.tab==='friends'&&Boolean(friendState?.query.trim());
    return {player:friendState?.player??{name:'Player'},clan:state?.clan??null,role:state?.role,clans:state?.clans??[],members:state?.members??[],messages:[],
      friends:searching?friendState.players:friendState?.friends??[],requests:searching?[]:[...(friendState?.incoming??[]),...(friendState?.outgoing??[])],threads:{},assets,
      screen:state?.screen??'discover',tab:state?.tab??'clan',sdkState:{...state,friends:friendState},
      actions:{screenChanged:screen=>clanActions.navigate(screen),tabChanged:tab=>clanActions.tab(tab),join:id=>clanActions.join(id),create:value=>clanActions.create(value),acceptRequest:id=>friendActions.action('accept',id)}};
  }
  const render=()=>renderer.update(current,data());
  const defaultTab=()=>current.clan?.enabled===true?'clan':current.friends?.enabled===true?'friends':'chat';
  function boot() {
    state=undefined;friendState=undefined;
    renderer=createExperienceRenderer(host,{live,onSearch:q=>controller.search(q),onRetry:()=>controller.retry(),onFriendSearch:q=>friends.search(q),onFriendAction:(action,id)=>friends.action(action,id),onFriendRefresh:()=>friends.refresh()});
    friends=createFriendsController({sdk,onChange:next=>{friendState=next;render();}});
    controller=createExperienceController({sdk,clanAdapter,enabled:current.clan?.enabled===true,resolveScreen:(screen,inClan)=>resolveScreen(current,screen,inClan),onChange:next=>{
      state=next;render();if(live)friends.setView(current.friends?.enabled===true,state.tab==='friends');
    },onEvent:notify});
    render();
    if(live){
      if(defaultTab()!=='clan')controller.tab(defaultTab());
      void controller.start();friends.setView(current.friends?.enabled===true,state?.tab==='friends');
    }
  }
  try {boot();container.append(host);reserveContainer(container);}
  catch(error){controller?.destroy();friends?.destroy();renderer?.destroy();host.remove();throw error;}
  const unsubscribe=live?playerSession(sdk)?.subscribe(()=>{
    controller.destroy();friends.destroy();renderer.destroy();boot();
  }):undefined;
  return {
    updateConfig(next){
      if(destroyed)throw new Error('Cannot update a destroyed SDK widget.');
      const candidate=widgetConfig(next,{validate});renderer.update(candidate,data());current=candidate;
      if(live){
        controller.setEnabled(current.clan?.enabled===true);controller.reconcile();
        if(state?.tab==='friends'&&current.friends?.enabled!==true||state?.tab==='clan'&&current.clan?.enabled!==true||state?.tab==='chat'&&current.chat?.enabled!==true)controller.tab(defaultTab());
        friends.setView(current.friends?.enabled===true,state?.tab==='friends');
      }
    },
    refreshFriends(){if(destroyed)throw new Error('Cannot refresh a destroyed SDK widget.');return friends.refresh();},
    navigate(screen){if(destroyed)throw new Error('Cannot navigate a destroyed SDK widget.');if(!['discover','create','home','members'].includes(screen))throw new TypeError('Unknown clan screen.');controller.navigate(screen);},
    destroy(){if(destroyed)return;destroyed=true;unsubscribe?.();controller.destroy();friends.destroy();renderer.destroy();host.remove();releaseContainer(container);},
  };
}
