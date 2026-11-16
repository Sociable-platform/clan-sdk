import {messageDTO} from './controller.js';
export function chatView(state,config,clan) {
  const allowed=state?.conversations?.filter(c=>c.kind==='dm'?config.chat?.directMessages===true:config.chat?.clanChat===true&&config.clan?.enabled===true&&c.clanId===clan?.id)??[];
  // at: when it was sent, for the widget's message times. kind: 'text', or a clan member change ('member_joined',
  // 'member_left', 'member_kicked') that @clan/ui draws as a line naming `from`. by: on a 'member_kicked' line, the name
  // of the player who removed `from` ("Dan was removed by Ali"); left out when Realtime did not say.
  const map=m=>({id:m.id,from:m.senderName,body:m.body,mine:m.senderId===state.playerId,at:m.createdAt,kind:m.kind??'text',...(m.kickedBy&&{by:m.kickedBy.name})});
  const peers=[],threads={},rooms={};
  // Unread messages per conversation, in the shape @clan/ui reads as data.unread.
  const unread={clan:0,direct:{}},count=room=>Number.isInteger(room.unread)&&room.unread>0?room.unread:0;
  // Until a conversation's history is loaded (it loads when opened), its thread is the last message from Realtime's
  // conversation list, so the Chat list shows it instead of "No messages yet" next to an unread count.
  const preview=room=>{try{return room.lastMessage?[map(messageDTO(room.lastMessage))]:[];}catch{return [];}};
  for(const room of allowed){
    const loaded=state.messages[room.id]??[];
    const messages=loaded.length?loaded.map(map):preview(room);
    if(room.kind==='clan'){threads.clan=messages;rooms.clan=room.id;unread.clan=count(room);}
    else{const other=room.members.find(m=>m.id!==state.playerId);if(other){
      // A read-only DM (a block ended the friendship): still listed and readable, not a friend, no online dot.
      const blocked=(state.blockedPeers??[]).includes(other.id),readOnly=room.readOnly===true||blocked;
      peers.push(readOnly?{id:other.id,name:other.name,relation:blocked?'blocked':'none',readOnly:true,blockedByMe:blocked}:{id:other.id,name:other.name,online:other.online,relation:'friend'});
      threads[other.id]=messages;rooms[other.id]=room.id;if(count(room))unread.direct[other.id]=count(room);}}
  }
  return {peers,threads,messages:threads.clan??[],rooms,unread,keys:[...peers.map(p=>p.id),...(config.chat?.clanChat===true&&config.clan?.enabled===true&&clan?['clan']:[])]};
}
