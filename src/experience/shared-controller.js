import {createDiscoverController} from './discover-controller.js';
import {socialClanAdapter,memberRoleAdapter} from '../social/clan-adapter.js';

// Runtime state and confirmed HTTP actions only; @clan/ui owns the visual tree.
// How long a change in the clan's members waits before the clan is read again, so a burst of joins shares one read.
const ROSTER_DELAY_MS = 500;

export function createExperienceController({sdk, onChange, onEvent, clanAdapter, enabled = true, resolveScreen = screen => screen, rosterDelay = ROSTER_DELAY_MS}) {
  let dead = false;
  let revision = 0;
  let visit = 0;
  let membershipGeneration = 0;
  let state = {screen:'discover', tab:'clan', clan:null, role:null, members:[],
    status:'idle', clans:[], query:'', error:'', joinError:'', pendingJoin:null,
    joinedClanId:null, profilePending:false, membershipKnown:false, createPending:false,leavePending:false,leaveError:'',memberPending:null,memberError:''};
  let rosterTimer=null,rosterReading=false,rosterAgain=false,rosterWaiting=false;
  const emit = () => {
    if (dead) return;
    onChange({...state});
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
    onChange(next) { const {screen, ...rest} = next; state = {...state, ...rest}; emit(); },
    onNavigate() {},
    onJoined(detail) { onEvent('joined',detail); void membership('home'); },
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
    } catch (error) {
      if (dead || !enabled || ticket !== revision || generation!==membershipGeneration) return;
      if (error.status === 404 && error.code === 'not_in_clan') {
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
  }
  return {
    refreshMembership() {if(dead||!enabled||state.profilePending||state.leavePending)return;return membership(state.clan?state.screen:'home',{preserveView:true});},
    rosterChanged,
    invalidateClan(id) {
      if(dead||state.clan?.id!==id)return;
      revision++;membershipGeneration++;visit++;
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
        revision++;visit++;
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
    join(id) { if (!state.profilePending && state.membershipKnown && !state.clan && !state.createPending) void list.join(id); },
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
    async create({name,badge,description,tag}) {
      if (dead || !enabled || !state.membershipKnown || state.createPending || state.clan) return;
      const currentVisit = visit;
      state = {...state, createPending:true, error:''}; emit();
      try {
        const clan = await sdk.createClan({name,...(badge==null?{}:{badge}),...(description===undefined?{}:{description}),...(tag===undefined?{}:{tag})});
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
    destroy() { dead = true; revision++; visit++; clearTimeout(rosterTimer); rosterTimer = null; rosterWaiting = false; list.destroy(); },
  };
}
