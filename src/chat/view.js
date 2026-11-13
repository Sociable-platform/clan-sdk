export function chatView(state,config,clan) {
  const allowed=state?.conversations?.filter(c=>c.kind==='dm'?config.chat?.directMessages===true:config.chat?.clanChat===true&&config.clan?.enabled===true&&c.clanId===clan?.id)??[];
  const map=m=>({id:m.id,from:m.senderName,body:m.body,mine:m.senderId===state.playerId});
  const peers=[],threads={},rooms={};
  for(const room of allowed){
    const messages=(state.messages[room.id]??[]).map(map);
    if(room.kind==='clan'){threads.clan=messages;rooms.clan=room.id;}
    else{const other=room.members.find(m=>m.id!==state.playerId);if(other){peers.push({id:other.id,name:other.name,online:other.online,relation:'friend'});threads[other.id]=messages;rooms[other.id]=room.id;}}
  }
  return {peers,threads,messages:threads.clan??[],rooms,keys:[...peers.map(p=>p.id),...(config.chat?.clanChat===true&&config.clan?.enabled===true&&clan?['clan']:[])]};
}
