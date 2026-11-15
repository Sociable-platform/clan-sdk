export function chatView(state,config,clan) {
  const allowed=state?.conversations?.filter(c=>c.kind==='dm'?config.chat?.directMessages===true:config.chat?.clanChat===true&&config.clan?.enabled===true&&c.clanId===clan?.id)??[];
  const map=m=>({id:m.id,from:m.senderName,body:m.body,mine:m.senderId===state.playerId,at:m.createdAt}); // at: when it was sent, for the widget's message times
  const peers=[],threads={},rooms={};
  // Unread messages per conversation, in the shape @clan/ui reads as data.unread.
  const unread={clan:0,direct:{}},count=room=>Number.isInteger(room.unread)&&room.unread>0?room.unread:0;
  for(const room of allowed){
    const messages=(state.messages[room.id]??[]).map(map);
    if(room.kind==='clan'){threads.clan=messages;rooms.clan=room.id;unread.clan=count(room);}
    else{const other=room.members.find(m=>m.id!==state.playerId);if(other){peers.push({id:other.id,name:other.name,online:other.online,relation:'friend'});threads[other.id]=messages;rooms[other.id]=room.id;if(count(room))unread.direct[other.id]=count(room);}}
  }
  return {peers,threads,messages:threads.clan??[],rooms,unread,keys:[...peers.map(p=>p.id),...(config.chat?.clanChat===true&&config.clan?.enabled===true&&clan?['clan']:[])]};
}
