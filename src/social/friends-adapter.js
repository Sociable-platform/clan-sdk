// Default wire → shared UI mapping. IDs retain their distinct namespaces.
const text=(value,path)=>{if(typeof value!=='string'||!value.trim())throw new TypeError(`Invalid Friends DTO ${path}.`);return value;};
const array=(value,path)=>{if(!Array.isArray(value))throw new TypeError(`Invalid Friends DTO ${path}: expected array.`);return value;};
const person=(p,path)=>({id:text(p?.id,`${path}.id`),name:text(p?.displayName,`${path}.displayName`)});
export const friendPlayer = value => ({...person(value,'player'),gameId:text(value?.gameId,'player.gameId'),externalId:text(value?.externalId,'player.externalId')});
// The friend's clan now (TEAM-273). An older Social sends no field: the widget then shows no line.
const friendClan=c=>c&&typeof c==='object'&&typeof c.id==='string'&&c.id.trim()&&typeof c.name==='string'&&c.name.trim()?{id:c.id,name:c.name}:null;
export const friendList = value => array(value?.friends,'friends').map((p,i)=>({...person(p,`friends[${i}]`),since:text(p.since,`friends[${i}].since`),clan:friendClan(p.clan),relation:'friend'}));
export const blockedPlayers = value => array(value?.blocks,'blocks').map((p,i)=>({...person(p,`blocks[${i}]`),since:text(p.since,`blocks[${i}].since`),relation:'blocked'}));
export function friendRequests(value) {
  return Object.fromEntries(['incoming','outgoing'].map(direction=>[direction,array(value?.[direction],direction).map((r,i)=>({id:text(r?.id,`${direction}[${i}].id`),playerId:text(r?.player?.id,`${direction}[${i}].player.id`),name:text(r?.player?.displayName,`${direction}[${i}].player.displayName`),createdAt:text(r?.createdAt,`${direction}[${i}].createdAt`),direction}))]));
}
export const playerResults = value => array(value?.players,'players').map((p,i)=>{
  const mapped=person(p,`players[${i}]`);
  if(!['none','friend','request_sent','request_received','blocked'].includes(p.relation))throw new TypeError(`Invalid Friends DTO players[${i}].relation.`);
  return {...mapped,relation:p.relation,...(p.relation.startsWith('request_')?{requestId:text(p.requestId,`players[${i}].requestId`)}:{})};
});
