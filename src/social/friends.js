// Social develop bdfc3d3, openapi/social.yaml. Responses pass through unchanged.
export function createFriendsClient(request) {
  const id = (value, field) => {
    if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') throw new TypeError(`${field} must be a non-empty ID string, excluding dot path segments.`);
    return encodeURIComponent(value);
  };
  return {
    getMyPlayer: () => request('/api/v1/players/me'),
    listFriends: () => request('/api/v1/friends'),
    listFriendRequests: () => request('/api/v1/friends/requests'),
    searchPlayers({q,limit} = {}) {
      if (typeof q !== 'string') throw new TypeError('q must be a string.');
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw new TypeError('limit must be an integer from 1 to 100.');
      const params = new URLSearchParams({q});
      if (limit !== undefined) params.set('limit', String(limit));
      return request(`/api/v1/players?${params}`);
    },
    sendFriendRequest({playerId} = {}) {
      id(playerId, 'playerId'); // Social UUID, never externalId. UUID semantics remain server-side.
      return request('/api/v1/friends/requests', {method:'POST',body:{playerId}});
    },
    acceptFriendRequest: requestId => request(`/api/v1/friends/requests/${id(requestId,'requestId')}/accept`, {method:'POST'}),
    declineFriendRequest: requestId => request(`/api/v1/friends/requests/${id(requestId,'requestId')}/decline`, {method:'POST'}),
    cancelFriendRequest: requestId => request(`/api/v1/friends/requests/${id(requestId,'requestId')}`, {method:'DELETE'}),
    removeFriend: playerId => request(`/api/v1/friends/${id(playerId,'playerId')}`, {method:'DELETE'}),
  };
}
