import {friendPlayer,friendList,friendRequests,playerResults,blockedPlayers} from '../social/friends-adapter.js';

// clanPlayers: Social IDs of the confirmed clan roster, whose Members panel offers Add friend.
export function createFriendsController({sdk,onChange,onMutation=()=>{},clanPlayers=()=>[],debounceMs=250}) {
  let dead=false,enabled=false,active=false,revision=0,searchRevision=0,timer;
  let mutation=null,refreshQueued=false,backgroundQueued=false;
  let state={status:'idle',player:null,friends:[],blocked:[],incoming:[],outgoing:[],query:'',players:[],searchStatus:'idle',error:'',searchError:'',actionError:'',pending:null};
  const emit=()=>{if(!dead)onChange({...state});};
  const valid=(ticket,background=false)=>!dead&&enabled&&(active||background)&&ticket===revision;
  const invalidate=()=>{revision++;searchRevision++;clearTimeout(timer);};
  async function searchNow() {
    clearTimeout(timer);
    if(dead||!enabled||!active||!state.player||!state.query.trim())return;
    const ticket=++searchRevision,visit=revision,q=state.query;
    state={...state,searchStatus:'loading',searchError:''};emit();
    try {
      const value=await sdk.searchPlayers({q});
      if(!valid(visit)||ticket!==searchRevision)return;
      const players=playerResults(value).filter(p=>p.id!==state.player.id);
      state={...state,players,searchStatus:players.length?'ready':'empty'};
    }catch(error){if(!valid(visit)||ticket!==searchRevision)return;state={...state,searchStatus:'error',searchError:error.message};}
    emit();
  }
  async function refresh({preserveActionError=false,background=false}={}) {
    if(dead||!enabled||!active&&!background)return;
    // Realtime refreshes must not clear the in-flight mutation guard or race
    // its acknowledgement with a pre-mutation snapshot.
    if(mutation){refreshQueued=true;backgroundQueued ||= background;return;}
    invalidate();const ticket=revision;
    state={...state,status:'loading',error:'',pending:null,searchError:'',...(preserveActionError?{}:{actionError:''})};emit();
    try {
      const player=friendPlayer(await sdk.getMyPlayer());
      if(!valid(ticket,background))return;
      if(state.player&&(player.id!==state.player.id||player.gameId!==state.player.gameId)) {
        state={...state,player,friends:[],blocked:[],incoming:[],outgoing:[],players:[]};emit();
      }
      const [friends,requests,blocks]=await Promise.all([sdk.listFriends(),sdk.listFriendRequests(),sdk.listBlocks()]);
      if(!valid(ticket,background))return;
      state={...state,player,friends:friendList(friends),blocked:blockedPlayers(blocks),...friendRequests(requests),status:'ready'};emit();
      if(active&&state.query.trim())await searchNow();
    }catch(error){if(!valid(ticket,background))return;state={...state,status:'error',error:error.message};emit();}
  }
  return {
    setView(nextEnabled,nextActive) {
      if(dead)return;
      if(enabled===nextEnabled&&active===nextActive)return;
      const enter=nextEnabled&&nextActive&&(!enabled||!active);
      enabled=nextEnabled;active=nextActive;
      if(!enabled||!active){invalidate();if(!enabled)state={...state,player:null,friends:[],blocked:[],incoming:[],outgoing:[],players:[],pending:null,status:'idle'};emit();}
      else if(enter)void refresh();
    },
    search(query) {
      if(dead||!enabled||!active)return;
      searchRevision++;clearTimeout(timer);
      state={...state,query,players:[],searchStatus:query.trim()?'loading':'idle',searchError:'',actionError:''};emit();
      if(query.trim())timer=setTimeout(searchNow,debounceMs);
    },
    refresh,
    async action(action,id) {
      if(dead||!enabled||!active||state.status!=='ready'||mutation)return;
      const methods={send:'sendFriendRequest',accept:'acceptFriendRequest',decline:'declineFriendRequest',cancel:'cancelFriendRequest',remove:'removeFriend',block:'blockPlayer',unblock:'unblockPlayer'};
      if(!methods[action])return;
      // Only displayed, server-backed objects are actionable. Never substitute a
      // game's externalId for a Social UUID or a player ID for a request ID.
      const member=()=>id!==state.player.id&&clanPlayers().includes(id)&&!state.friends.some(p=>p.id===id)&&!state.blocked.some(p=>p.id===id)&&!state.outgoing.some(r=>r.playerId===id);
      const displayed=action==='send'?state.players.some(p=>p.id===id&&p.relation==='none'&&id!==state.player.id)||member()
        :action==='remove'||action==='block'?id!==state.player.id&&(state.friends.some(p=>p.id===id)||state.players.some(p=>p.id===id&&p.relation==='friend'))
        :action==='unblock'?state.blocked.some(p=>p.id===id)||state.players.some(p=>p.id===id&&p.relation==='blocked')
        :action==='cancel'?state.outgoing.some(r=>r.id===id)||state.players.some(p=>p.requestId===id&&p.relation==='request_sent')
        :state.incoming.some(r=>r.id===id)||state.players.some(p=>p.requestId===id&&p.relation==='request_received');
      if(!displayed)return;
      const ticket=revision;searchRevision++;clearTimeout(timer);
      const operation={action,id};mutation=operation;
      state={...state,pending:{action,id},actionError:''};emit();
      let succeeded=false,failure;
      try {
        await sdk[methods[action]](action==='send'?{playerId:id}:id);
        succeeded=true;
        if(!dead)onMutation(action,id);
      }catch(error){
        failure=error;
        if(valid(ticket))state={...state,actionError:error.message};
      }finally{
        if(mutation===operation)mutation=null;
        if(dead)return;
        state={...state,pending:null};
        const queued=refreshQueued,background=backgroundQueued||succeeded;
        refreshQueued=false;backgroundQueued=false;
        if(succeeded||queued||[404,409].includes(failure?.status))await refresh({preserveActionError:Boolean(failure),background});
        else emit();
      }
    },
    destroy(){dead=true;invalidate();},
  };
}
