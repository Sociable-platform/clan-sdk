import {createDiscoverController} from './discover-controller.js';
import {socialClanAdapter,memberRoleAdapter,joinRequestsAdapter} from '../social/clan-adapter.js';

// Runtime state and confirmed HTTP actions only; @clan/ui owns the visual tree.
// How long a change in the clan's members waits before the clan is read again, so a burst of joins shares one read.
const ROSTER_DELAY_MS = 500;
// Social keeps a game's config for up to 30 s (SOCIAL_CONFIG_CACHE_TTL), so right after a publish it may still answer
// by the old roles. The join requests are read again once this long after a config change.
const CONFIG_SETTLE_MS = 35000;

export function createExperienceController({sdk, onChange, onEvent, clanAdapter, enabled = true, resolveScreen = screen => screen, rosterDelay = ROSTER_DELAY_MS, configSettle = CONFIG_SETTLE_MS}) {
  let dead = false;
  let revision = 0;
  let visit = 0;
  let membershipGeneration = 0;
  let state = {screen:'discover', tab:'clan', clan:null, role:null, members:[],
    status:'idle', clans:[], query:'', error:'', joinError:'', pendingJoin:null,
    joinedClanId:null, profilePending:false, membershipKnown:false, createPending:false,leavePending:false,leaveError:'',memberPending:null,memberError:''};
  let rosterTimer=null,rosterReading=false,rosterAgain=false,rosterWaiting=false;
  // Closed clans: the requests to join the player's clan, for the leaders who decide on them. They are read for a closed
  // clan only. Social answers 403 to a member whose role may not decide; that is remembered for the clan and role, so such a
  // member is not asked again (a role change is a new key). A request is accepted or declined once, one at a time.
  // TEAM-302: which roles decide is the game's choice (canHandleRequests), so a refusal is forgotten when the config
  // changes, and when Social tells the player about a new request (it only tells those who may decide).
  let requests=[],requestsDenied=null,requestsReading=false,requestsAgain=false,requestPending=null,requestError='';
  let settleTimer=null;
  const clearRequests=()=>{requests=[];requestsDenied=null;requestPending=null;requestError='';};
  const emit = () => {
    if (dead) return;
    onChange({...state,joinRequests:requests,requestPending,requestError});
    // A roster read that waited for the player's own clan read goes once that read is over (see readRoster).
    if (rosterWaiting && !state.profilePending) { rosterWaiting = false; rosterTimer ??= setTimeout(readRoster, rosterDelay); }
  };
  const fail = error => {
    state = {...state, error:error?.message || 'Social request failed.', profilePending:false};
    emit();
  };
  // Only list after membership is known; enabling a tab cannot bypass auth state.
  const list = createDiscoverController({
    listClans:q => sdk.listClans(q), joinClan:id => sdk.joinClan(id), clanAdapter, enabled:false,
    requestJoin:id => sdk.requestClanJoin(id), cancelRequest:id => sdk.cancelClanJoinRequest(id),
    onChange(next) { const {screen, ...rest} = next; state = {...state, ...rest}; emit(); },
    onNavigate() {},
    onJoined(detail) { onEvent('joined',detail); void membership('home'); },
    onRequested(detail) { onEvent('join-requested',detail); },
  });
  async function membership(target,{preserveView=false}={}) {
    if(state.leavePending)return;
    const generation=membershipGeneration;
    const ticket = ++revision;
    const currentVisit = visit;
    state = {...state, profilePending:true, error:''}; emit();
    try {
      const result = await sdk.myClan();
      if (dead || !enabled || ticket !== revision || generation!==membershipGeneration) return;
      const [clan] = socialClanAdapter({clans:[result?.clan]});
      if(typeof result.role!=='string'||!result.role.trim())throw new TypeError('myClan must include the player role.');
      state = {...state, members:state.clan?.id===clan.id?state.members:[],clan, role:result.role, membershipKnown:true,
        profilePending:false, screen:currentVisit === visit ? target ?? 'home' : state.screen==='create'?'home':state.screen,
        tab:!preserveView&&currentVisit === visit ? 'clan' : state.tab, error:''};
      state.screen = resolveScreen(state.screen, true);
      list.navigate(state.tab === 'clan' && state.screen === 'discover' ? 'discover' : 'create');
      list.setEnabled(true); emit();
      if(state.screen === 'members')void members();
      void readRequests();
    } catch (error) {
      if (dead || !enabled || ticket !== revision || generation!==membershipGeneration) return;
      if (error.status === 404 && error.code === 'not_in_clan') {
        clearRequests();
        state = {...state, clan:null, role:null,members:[], membershipKnown:true, profilePending:false,
          screen:currentVisit === visit ? 'discover' : state.screen, error:''};
        state.screen = resolveScreen(state.screen, false);
        list.navigate(state.tab === 'clan' && state.screen === 'discover' ? 'discover' : 'create');
        const firstLoad = state.status === 'idle';
        list.setEnabled(true);
        if (!firstLoad && state.screen === 'discover') void list.retry();
        emit();
      } else fail(error);
    }
  }
  // withRole also re-reads myClan: no realtime frame tells remaining members
  // about role changes or kicks, so opening Members must not show stale power.
  // quiet: a read nobody asked for (TEAM-294). It shows no error: a failure keeps the last roster.
  async function members({withRole=false,quiet=false}={}) {
    if(state.leavePending||!state.clan)return;
    const generation=membershipGeneration,clanId=state.clan.id;
    const ticket = ++revision;
    if(!quiet){state = {...state, error:''}; emit();}
    const own=withRole?Promise.resolve().then(()=>sdk.myClan()).then(value=>({value}),error=>({error})):null;
    try {
      const value = await sdk.clanMembers(clanId);
      const mine = await own;
      if (dead || !enabled || ticket !== revision || generation!==membershipGeneration) return;
      let next = {...state, members:value.members.map(m => ({id:m.playerId, name:m.displayName, role:m.role})), error:''};
      let moved = mine?.error?.status===404&&mine.error.code==='not_in_clan';
      if (mine?.value) {
        try {
          const [clan] = socialClanAdapter({clans:[mine.value.clan]});
          if (clan.id!==clanId) moved = true;
          else if (typeof mine.value.role==='string'&&mine.value.role.trim()) next = {...next, clan, role:mine.value.role};
        } catch {} // Roster is still authoritative; a malformed myClan keeps the last role.
      }
      state = next; emit();
      if (moved) void membership(state.screen,{preserveView:true});
    } catch (error) { if (!quiet && !dead && ticket === revision && generation===membershipGeneration) fail(error); }
  }
  // TEAM-294: another player joined, left or was removed. The clan is read again in the background so the member
  // count on the banner follows, and on Members the roster too. Changes close together share one read; one that comes
  // in while a read is running gets another read after it, so the last change is never missed.
  function rosterChanged(clanId) {
    if(dead||!enabled||!clanId||state.clan?.id!==clanId)return;
    if(rosterReading){rosterAgain=true;return;}
    rosterTimer??=setTimeout(readRoster,rosterDelay);
  }
  async function readRoster() {
    rosterTimer=null;
    if(dead||!enabled||!state.clan||!state.membershipKnown||state.leavePending)return;
    // The clan is already being read (the player's own action): read again after it, without cutting it off.
    if(state.profilePending){rosterWaiting=true;return;}
    rosterReading=true;rosterAgain=false;
    try {
      if(state.screen==='members')await members({withRole:true,quiet:true});
      else await quietClan();
    } finally {rosterReading=false;}
    if(rosterAgain&&!dead){rosterAgain=false;rosterTimer??=setTimeout(readRoster,rosterDelay);}
  }
  async function quietClan() {
    const generation=membershipGeneration,clanId=state.clan.id;
    const current=()=>!dead&&enabled&&generation===membershipGeneration&&state.clan?.id===clanId&&!state.leavePending&&!state.profilePending;
    let result;
    try {result=await sdk.myClan();}
    catch(error) {
      // No longer in this clan: the full membership read moves the panel on. Any other failure keeps the last count.
      if(error?.status===404&&error.code==='not_in_clan'&&current())void membership(state.screen,{preserveView:true});
      return;
    }
    if(!current())return;
    let clan;
    try {[clan]=socialClanAdapter({clans:[result?.clan]});} catch {return;}
    if(clan.id!==clanId){void membership(state.screen,{preserveView:true});return;}
    const role=typeof result.role==='string'&&result.role.trim()?result.role:state.role;
    state={...state,clan,role};emit();
    void readRequests();
  }
  // The requests to join the player's closed clan (see the note at the top). Quiet: a failure keeps the last list.
  async function readRequests() {
    const clan=state.clan;
    if(dead||!enabled||!clan||!state.membershipKnown||state.leavePending)return;
    if(clan.joinPolicy!=='closed'){if(requests.length){requests=[];emit();}return;}
    const key=`${clan.id}:${state.role}`;
    if(requestsDenied===key)return;
    if(requestsReading){requestsAgain=true;return;}
    requestsReading=true;requestsAgain=false;
    const generation=membershipGeneration;
    try {
      const list=joinRequestsAdapter(await sdk.listClanJoinRequests(clan.id));
      if(dead||generation!==membershipGeneration||state.clan?.id!==clan.id)return;
      requests=list;requestsDenied=null;emit();
    } catch(error) {
      if(dead||generation!==membershipGeneration||state.clan?.id!==clan.id)return;
      if(error?.status===403){requestsDenied=key;if(requests.length){requests=[];emit();}}
    } finally {
      requestsReading=false;
      if(requestsAgain&&!dead){requestsAgain=false;void readRequests();}
    }
  }
  async function decideRequest(action,requestId) {
    if(dead||!enabled||!state.clan||!state.membershipKnown||state.leavePending||requestPending)return;
    const who=requests.find(request=>request.id===requestId);
    if(!who)return;
    const clanId=state.clan.id,generation=membershipGeneration;
    const current=()=>!dead&&enabled&&generation===membershipGeneration&&state.clan?.id===clanId;
    requestPending={action,id:requestId};requestError='';emit();
    try {
      await (action==='accept'?sdk.acceptClanJoinRequest(clanId,requestId):sdk.declineClanJoinRequest(clanId,requestId));
      if(!current())return;
      requests=requests.filter(request=>request.id!==requestId);requestPending=null;emit();
      onEvent(action==='accept'?'join-request-accepted':'join-request-declined',{clanId,playerId:who.playerId,requestId});
      if(action==='accept')rosterChanged(clanId); // the new member and the member count
    } catch(error) {
      if(!current())return;
      requestPending=null;requestError=error?.message||'Unable to answer the request.';emit();
      void readRequests(); // it may be gone: another leader answered, or the player took it back
    }
  }
  return {
    refreshMembership() {if(dead||!enabled||state.profilePending||state.leavePending)return;return membership(state.clan?state.screen:'home',{preserveView:true});},
    rosterChanged,
    invalidateClan(id) {
      if(dead||state.clan?.id!==id)return;
      revision++;membershipGeneration++;visit++;clearRequests();
      state={...state,clan:null,role:null,members:[],profilePending:false,membershipKnown:true,leavePending:false,leaveError:'',memberPending:null,memberError:'',error:'',screen:resolveScreen('discover',false)};
      emit();list.reset();list.navigate(state.tab==='clan'&&state.screen==='discover'?'discover':'create');list.setEnabled(enabled);
    },
    async leave() {
      if(dead||!enabled||!state.clan||!state.membershipKnown||state.profilePending||state.leavePending)return;
      const clanId=state.clan.id,generation=++membershipGeneration,currentVisit=visit;
      revision++;state={...state,leavePending:true,leaveError:'',error:''};emit();
      try {
        await sdk.leaveClan(clanId);
        if(dead||generation!==membershipGeneration)return;
        revision++;visit++;clearRequests();
        const previousScreen=state.screen,screen=resolveScreen('discover',false);
        state={...state,clan:null,role:null,members:[],clans:[],query:'',joinedClanId:null,pendingJoin:null,createPending:false,profilePending:false,membershipKnown:true,leavePending:false,leaveError:'',memberPending:null,memberError:'',error:'',joinError:'',status:'idle',screen,tab:currentVisit===visit-1?'clan':state.tab};
        emit();list.reset();list.navigate(state.tab==='clan'&&screen==='discover'?'discover':'create');list.setEnabled(true);
        onEvent('left',{clanId});onEvent('navigate',{screen,previousScreen});
      } catch(error) {if(!dead&&generation===membershipGeneration){state={...state,leavePending:false,leaveError:error?.message||'Unable to leave clan.'};emit();}}
    },
    // Promote/demote/kick (TEAM-257). One action at a time; only a confirmed
    // response changes the roster, then members and own role are re-read.
    async manageMember(action,memberId) {
      const methods={kick:'kickClanMember',promote:'promoteClanMember',demote:'demoteClanMember'};
      if(dead||!enabled||!methods[action]||!state.clan||!state.membershipKnown||state.profilePending||state.leavePending||state.memberPending)return;
      if(!state.members.some(member=>member.id===memberId))return;
      const clanId=state.clan.id,generation=membershipGeneration;
      const current=()=>!dead&&enabled&&generation===membershipGeneration&&state.clan?.id===clanId;
      state={...state,memberPending:{action,id:memberId},memberError:''};emit();
      let confirmed=false;
      try {
        const result=await sdk[methods[action]](clanId,memberId);
        confirmed=true;
        if(!current())return;
        if(action==='kick'){
          state={...state,memberPending:null,members:state.members.filter(member=>member.id!==memberId),clan:{...state.clan,memberCount:Math.max(0,state.clan.memberCount-1)}};
          emit();onEvent('member-kicked',{clanId,playerId:memberId});
        }else{
          const changed=memberRoleAdapter(result);
          state={...state,memberPending:null,members:state.members.map(member=>member.id===changed.id?{...member,role:changed.role}:member)};
          emit();onEvent('member-role-changed',{clanId,playerId:changed.id,role:changed.role});
        }
      } catch(error) {
        if(!current())return;
        state={...state,memberPending:null,memberError:error?.message||'Unable to update clan member.'};emit();
        // Network failures keep the last confirmed roster; server answers mean it moved on.
        if(!confirmed&&!(error?.status>=400&&error.status<500))return;
      }
      await members({withRole:true});
    },
    start() { if (enabled) return membership(); },
    search:q => list.search(q),
    // A closed clan takes a request instead of a join (the clan list says which is which); cancel takes it back.
    join(id) { if (!state.profilePending && state.membershipKnown && !state.clan && !state.createPending) void list.join(id); },
    cancelJoinRequest(id) { if (!state.profilePending && state.membershipKnown && !state.clan) void list.cancelRequest(id); },
    // Realtime: somebody asked to join the player's clan (read the requests again), or the player's own request was declined
    // (the clan list is read again, which clears the mark).
    requestsChanged(clanId) { if (!dead && enabled && state.clan?.id === clanId) {requestsDenied=null;void readRequests();} },
    // A published config may change which roles decide on join requests: ask again now, and once more when Social's
    // cached copy of the old config has run out.
    configChanged() {
      if(dead||!enabled||!state.clan)return;
      requestsDenied=null;void readRequests();
      clearTimeout(settleTimer);
      settleTimer=setTimeout(()=>{settleTimer=null;requestsDenied=null;void readRequests();},configSettle);
    },
    joinRequestDeclined(clanId) {
      if (dead || !enabled || state.clan) return;
      onEvent('join-declined',{clanId});
      if (state.screen === 'discover') void list.retry();
    },
    acceptRequest:id => decideRequest('accept',id),
    declineRequest:id => decideRequest('decline',id),
    // The owner opens or closes the clan. Closing starts a list of requests; opening drops it (players join directly now).
    async setJoinPolicy(policy) {
      if(dead||!enabled||!state.clan||!state.membershipKnown||state.leavePending||!['open','closed'].includes(policy)||state.clan.joinPolicy===policy)return;
      const clanId=state.clan.id,generation=membershipGeneration;
      const current=()=>!dead&&enabled&&generation===membershipGeneration&&state.clan?.id===clanId;
      requestError='';
      try {
        const [clan]=socialClanAdapter({clans:[await sdk.setClanJoinPolicy(clanId,policy)]});
        if(!current())return;
        state={...state,clan:{...state.clan,...clan,joinPolicy:clan.joinPolicy??policy}};emit();
        onEvent('join-policy-changed',{clanId,joinPolicy:policy});
        void readRequests();
      } catch(error) {
        if(!current())return;
        requestError=error?.message||'Unable to change who can join.';emit();
      }
    },
    retry() {
      if(state.screen === 'members' && state.clan)return members({withRole:true});
      return state.membershipKnown && state.screen === 'discover' ? list.retry() : membership(state.clan ? 'home' : undefined);
    },
    navigate(screen) {
      screen = resolveScreen(screen, Boolean(state.clan));
      if (dead || !enabled || screen === state.screen) return;
      visit++;
      if (!state.profilePending) revision++;
      const previousScreen = state.screen;
      state = {...state, screen, tab:'clan', error:'', memberError:''};
      list.navigate(screen === 'discover' ? 'discover' : 'create'); emit();
      onEvent('navigate',{screen,previousScreen});
      if (screen === 'members' && state.clan) void members({withRole:true});
    },
    reconcile() {
      if(dead||!enabled)return;
      const screen = resolveScreen(state.screen, Boolean(state.clan));
      if(screen === state.screen)return;
      visit++;
      if(!state.profilePending)revision++;
      state = {...state,screen};
      list.navigate(state.tab === 'clan' && screen === 'discover'?'discover':'create');emit();
      if(screen === 'members' && state.clan)void members({withRole:true});
    },
    tab(tab) {
      if (dead || tab === state.tab) return;
      visit++;
      if (!state.profilePending) revision++;
      state = {...state, tab};
      list.navigate(tab === 'clan' && state.screen === 'discover' ? 'discover' : 'create');
      emit(); onEvent('tab',{tab});
    },
    async create({name,badge,description,tag,joinPolicy}) {
      if (dead || !enabled || !state.membershipKnown || state.createPending || state.clan) return;
      const currentVisit = visit;
      state = {...state, createPending:true, error:''}; emit();
      try {
        const clan = await sdk.createClan({name,...(badge==null?{}:{badge}),...(description===undefined?{}:{description}),...(tag===undefined?{}:{tag}),...(joinPolicy===undefined?{}:{joinPolicy})});
        if (dead || currentVisit !== visit) return;
        onEvent('created',{clanId:clan.id}); await membership('home');
      } catch (error) { if (!dead && currentVisit === visit) fail(error); }
      finally { if (!dead) { state = {...state, createPending:false}; emit(); } }
    },
    setEnabled(value) {
      if (dead || enabled === value) return;
      enabled = value; revision++; visit++;membershipGeneration++;
      list.setEnabled(false);
      state = {...state, status:'idle', profilePending:false, membershipKnown:false,leavePending:false,leaveError:'',memberPending:null,memberError:''}; emit();
      if (value) void membership();
    },
    destroy() { dead = true; revision++; visit++; clearTimeout(rosterTimer); rosterTimer = null; rosterWaiting = false; clearTimeout(settleTimer); settleTimer = null; list.destroy(); },
  };
}
