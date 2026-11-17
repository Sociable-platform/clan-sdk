import { createRequest } from './request.js';
import {createPlayerSession} from './session.js';
import {createFriendsClient} from './friends.js';
import {createTokenAcquisition} from './token.js';

const internals = new WeakMap();
export const socialInternals = client => internals.get(client);

/** Configure a Social client without fetching a token or making a request. */
export function init(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('init requires { socialUrl, getPlayerToken }.');
  }

  const { socialUrl, getPlayerToken } = options;
  if (typeof socialUrl !== 'string' || !socialUrl.trim()) {
    throw new TypeError('socialUrl must be an absolute HTTP(S) URL.');
  }

  let url;
  try {
    url = new URL(socialUrl);
  } catch {
    throw new TypeError('socialUrl must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.search || url.hash) {
    throw new TypeError('socialUrl must use HTTP(S), without credentials, query or fragment.');
  }
  if (typeof getPlayerToken !== 'function') {
    throw new TypeError('getPlayerToken must be a function.');
  }

  const session = createPlayerSession();
  const acquire = createTokenAcquisition(getPlayerToken,session);
  const request = createRequest(url.href.replace(/\/+$/, ''), getPlayerToken, session,acquire);

  const client = {
    listClans({ q } = {}) {
      if (q !== undefined && typeof q !== 'string') {
        throw new TypeError('q must be a string.');
      }
      const query = q === undefined ? '' : `?${new URLSearchParams({ q })}`;
      return request(`/api/v1/clans${query}`);
    },
    createClan({ name, badge, description, tag, joinPolicy } = {}) {
      if (typeof name !== 'string') {
        throw new TypeError('name must be a string.');
      }
      // Name length/uniqueness remain server rules; do not add UI validation here.
      const body={name};
      for(const [field,value]of Object.entries({badge,description,tag,joinPolicy})){
        if(value===undefined)continue;
        if(typeof value!=='string')throw new TypeError(`${field} must be a string.`);
        body[field]=value;
      }
      return request('/api/v1/clans', { method: 'POST', body });
    },
    joinClan(clanId) {
      return request(`/api/v1/clans/${encodeClanId(clanId)}/join`, { method: 'POST' });
    },
    myClan() {
      return request('/api/v1/players/me/clan');
    },
    clanMembers(clanId) {
      return request(`/api/v1/clans/${encodeClanId(clanId)}/members`);
    },
  };
  // Member moderation (TEAM-257): bodyless; the server decides by clan role.
  const member=(clanId,playerId,action='')=>`/api/v1/clans/${encodeClanId(clanId)}/members/${encodeId(playerId,'playerId')}${action}`;
  internals.set(client,{session,acquire,getPlayerToken,friends:createFriendsClient(request),leaveClan:id=>request(`/api/v1/clans/${encodeClanId(id)}/leave`,{method:'POST'}),
    kickClanMember:(clanId,playerId)=>request(member(clanId,playerId),{method:'DELETE'}),
    promoteClanMember:(clanId,playerId)=>request(member(clanId,playerId,'/promote'),{method:'POST'}),
    demoteClanMember:(clanId,playerId)=>request(member(clanId,playerId,'/demote'),{method:'POST'}),
    // Closed clans: a player asks, a leader decides. The server decides who may; these only carry the calls.
    requestClanJoin:clanId=>request(`/api/v1/clans/${encodeClanId(clanId)}/requests`,{method:'POST'}),
    cancelClanJoinRequest:clanId=>request(`/api/v1/clans/${encodeClanId(clanId)}/requests/me`,{method:'DELETE'}),
    listClanJoinRequests:clanId=>request(`/api/v1/clans/${encodeClanId(clanId)}/requests`),
    acceptClanJoinRequest:(clanId,requestId)=>request(`/api/v1/clans/${encodeClanId(clanId)}/requests/${encodeId(requestId,'requestId')}/accept`,{method:'POST'}),
    declineClanJoinRequest:(clanId,requestId)=>request(`/api/v1/clans/${encodeClanId(clanId)}/requests/${encodeId(requestId,'requestId')}/decline`,{method:'POST'}),
    setClanJoinPolicy:(clanId,joinPolicy)=>request(`/api/v1/clans/${encodeClanId(clanId)}`,{method:'PATCH',body:{joinPolicy}})});
  return client;
}

function encodeClanId(clanId) {
  return encodeId(clanId,'clanId');
}

function encodeId(value,field) {
  if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') {
    throw new TypeError(`${field} must be a non-empty string, excluding dot path segments.`);
  }
  return encodeURIComponent(value);
}
