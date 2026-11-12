import {friendPlayer,friendList,friendRequests,playerResults} from '../social/friends-adapter.js';

export function createFriendsController({sdk,onChange,debounceMs=250}) {
  let dead=false,enabled=false,active=false,revision=0,searchRevision=0,timer;
  let state={status:'idle',player:null,friends:[],incoming:[],outgoing:[],query:'',players:[],searchStatus:'idle',error:'',searchError:'',actionError:'',pending:null};
  const emit=()=>{if(!dead)onChange({...state});};
  const valid=ticket=>!dead&&enabled&&active&&ticket===revision;
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
  async function refresh({preserveActionError=false}={}) {
    if(dead||!enabled||!active)return;
    invalidate();const ticket=revision;
    state={...state,status:'loading',error:'',pending:null,searchError:'',...(preserveActionError?{}:{actionError:''})};emit();
    try {
      const player=friendPlayer(await sdk.getMyPlayer());
      if(!valid(ticket))return;
      if(state.player&&(player.id!==state.player.id||player.gameId!==state.player.gameId)) {
        state={...state,player,friends:[],incoming:[],outgoing:[],players:[]};emit();
      }
      const [friends,requests]=await Promise.all([sdk.listFriends(),sdk.listFriendRequests()]);
      if(!valid(ticket))return;
      state={...state,player,friends:friendList(friends),...friendRequests(requests),status:'ready'};emit();
      if(state.query.trim())await searchNow();
    }catch(error){if(!valid(ticket))return;state={...state,status:'error',error:error.message};emit();}
  }
  return {
    setView(nextEnabled,nextActive) {
      if(dead)return;
      if(enabled===nextEnabled&&active===nextActive)return;
      const enter=nextEnabled&&nextActive&&(!enabled||!active);
      enabled=nextEnabled;active=nextActive;
      if(!enabled||!active){invalidate();state={...state,pending:null};if(!enabled)state={...state,player:null,friends:[],incoming:[],outgoing:[],players:[],status:'idle'};emit();}
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
      if(dead||!enabled||!active||state.status!=='ready'||state.pending)return;
      const methods={send:'sendFriendRequest',accept:'acceptFriendRequest',decline:'declineFriendRequest',cancel:'cancelFriendRequest',remove:'removeFriend'};
      if(!methods[action])return;
      // Only displayed, server-backed objects are actionable. Never substitute a
      // game's externalId for a Social UUID or a player ID for a request ID.
      const displayed=action==='send'?state.players.some(p=>p.id===id&&p.relation==='none'&&id!==state.player.id)
        :action==='remove'?state.friends.some(p=>p.id===id)||state.players.some(p=>p.id===id&&p.relation==='friend')
        :action==='cancel'?state.outgoing.some(r=>r.id===id)||state.players.some(p=>p.requestId===id&&p.relation==='request_sent')
        :state.incoming.some(r=>r.id===id)||state.players.some(p=>p.requestId===id&&p.relation==='request_received');
      if(!displayed)return;
      const ticket=revision;searchRevision++;clearTimeout(timer);
      state={...state,pending:{action,id},actionError:''};emit();
      try {
        await sdk[methods[action]](action==='send'?{playerId:id}:id);
        if(!valid(ticket))return;
        await refresh(); // Covers both 201 request and reciprocal-send 200 friend.
      }catch(error){
        if(!valid(ticket))return;
        state={...state,pending:null,actionError:error.message};emit();
        if([404,409].includes(error.status))await refresh({preserveActionError:true});
      }
    },
    destroy(){dead=true;invalidate();},
  };
}
