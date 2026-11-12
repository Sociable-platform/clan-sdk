// Default wire → shared UI mapping. IDs retain their distinct namespaces.
const text=(value,path)=>{if(typeof value!=='string'||!value.trim())throw new TypeError(`Invalid Friends DTO ${path}.`);return value;};
const array=(value,path)=>{if(!Array.isArray(value))throw new TypeError(`Invalid Friends DTO ${path}: expected array.`);return value;};
const person=(p,path)=>({id:text(p?.id,`${path}.id`),name:text(p?.displayName,`${path}.displayName`)});
export const friendPlayer = value => ({...person(value,'player'),gameId:text(value?.gameId,'player.gameId'),externalId:text(value?.externalId,'player.externalId')});
export const friendList = value => array(value?.friends,'friends').map((p,i)=>({...person(p,`friends[${i}]`),since:text(p.since,`friends[${i}].since`),relation:'friend'}));
export function friendRequests(value) {
  return Object.fromEntries(['incoming','outgoing'].map(direction=>[direction,array(value?.[direction],direction).map((r,i)=>({id:text(r?.id,`${direction}[${i}].id`),playerId:text(r?.player?.id,`${direction}[${i}].player.id`),name:text(r?.player?.displayName,`${direction}[${i}].player.displayName`),createdAt:text(r?.createdAt,`${direction}[${i}].createdAt`),direction}))]));
}
export const playerResults = value => array(value?.players,'players').map((p,i)=>{
  const mapped=person(p,`players[${i}]`);
  if(!['none','friend','request_sent','request_received'].includes(p.relation))throw new TypeError(`Invalid Friends DTO players[${i}].relation.`);
  return {...mapped,relation:p.relation,...(p.relation.startsWith('request_')?{requestId:text(p.requestId,`players[${i}].requestId`)}:{})};
});
