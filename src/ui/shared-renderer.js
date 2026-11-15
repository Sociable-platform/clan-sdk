import {render, buildLabels} from '@clan/ui';
import {widgetFonts} from './fonts.js';
import {decorateFriends} from './friends-controls.js';
import {decorateChat,nextCountdownTick,selectedChatKey} from './chat-controls.js';

// Same source components/styles as dashboard preview. These small runtime hooks
// bridge missing shared-package inputs; they never fetch/authenticate or invent data.
export function createSharedRenderer(container, {onSearch = () => {}, onRetry = () => {}, onFriendSearch = () => {}, onFriendAction = () => {}, onFriendRefresh = () => {}, onChatSelect=()=>{},onChatSend=()=>Promise.reject(),onChatRefresh=()=>{},live = true} = {}) {
  let handle, shadow, observer;
  let data = {}, config = {}, destroyed = false;
  let draftRoom,draftClan,purgeDraft=false,countdownTimer;
  const doc = container.ownerDocument;
  const fonts = widgetFonts(doc);
  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };

  function decorate() {
    if (destroyed || !live || !shadow) return;
    const composer=shadow.querySelector('[data-key="message"]');
    if(purgeDraft&&composer){purgeDraft=false;composer.value='';composer.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));}
    const state = data.sdkState ?? {};
    const labels = buildLabels(config);
    const header = shadow.querySelector('.sk-header');
    if (header) {
      const online = header.querySelector('.sk-online');
      if (online) online.hidden = true;
      const name=data.player?.name??'Player';
      setText(header.querySelector('.sk-status'), data.role ? `${name} · ${data.role}`
        : state.friends?.player || state.chat?.status==='connected' ? name : state.membershipKnown ? 'Player · no clan' : 'Not connected');
    }
    const content = shadow.querySelector('.sk-content');
    if (!content) return;
    let status = content.querySelector('[data-sdk-status]');
    let message = state.leavePending?'Leaving clan…':state.leaveError || state.error || state.joinError || '';
    if (data.tab === 'friends') {
      const friends=state.friends;
      message=friends?.error||friends?.actionError||friends?.searchError||'';
      if(!message)message=friends?.status==='loading'?'Loading friends…':friends?.query.trim()
        ?friends.searchStatus==='loading'?'Searching players…':friends.searchStatus==='empty'?'No players found.':''
        :friends?.status==='ready'&&!friends.friends.length&&!friends.incoming.length&&!friends.outgoing.length?'No friends or requests yet.':'';
    }
    else if (data.tab === 'chat' || data.screen === 'home') message = null;
    else if (state.profilePending || state.status === 'loading' && data.screen === 'discover') message ||= 'Loading clans…';
    else if (data.screen === 'discover' && state.status === 'empty') message ||= 'No clans found.';
    if (data.tab !== 'friends' && data.screen === 'create') message ||= state.createPending ? 'Creating clan…' : '';
    const chatVisible=data.tab==='chat'||data.tab==='clan'&&data.screen==='home';
    const canRetry = data.tab==='friends'?Boolean(state.friends?.error||state.friends?.searchError):chatVisible?Boolean(state.chat?.error):Boolean(state.error || state.status === 'error');
    // Do not leave an empty flex row/gap after the Blocked section. Create the
    // status only when needed, so the mutation observer cannot append/remove it
    // repeatedly. Other screens retain their chat/status decoration hooks.
    if(data.tab==='friends'&&!message&&!canRetry){status?.remove();status=undefined;}
    else if(!status){
      status=doc.createElement('div');status.dataset.sdkStatus='';
      status.setAttribute('role','status');status.setAttribute('aria-live','polite');content.append(status);
    }
    // Child-list observation also catches the shared launcher's internal repaints.
    // Only write changed text; unconditional replaceChildren would loop forever.
    if (status && message!==null && status.firstChild?.textContent !== message) {
      const text = doc.createElement('span');
      text.textContent = message;
      status.replaceChildren(text);
    }
    if (canRetry && !status.querySelector('[data-sdk-retry]')) {
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.dataset.sdkRetry = '';
      status.append(retry);
    } else if (!canRetry) status?.querySelector('[data-sdk-retry]')?.remove();

    shadow.querySelectorAll('.sk-composer button').forEach(button => {
      button.disabled = true;
      button.title = 'Messaging unavailable';
    });
    if (data.tab !== 'friends' && data.screen === 'create') {
      const pending=Boolean(state.createPending||state.profilePending||!state.membershipKnown);
      shadow.querySelectorAll('[data-key="tag"], [data-key="description"], [data-key="badge-trigger"], [role="radio"]').forEach(control => {
        control.disabled = pending;
        control.title = pending?'Please wait…':'';
      });
      if (state.createPending || state.profilePending || !state.membershipKnown) {
        shadow.querySelectorAll('.sk-actions button:not(.sk-btn-ghost)').forEach(button => { button.disabled = true; });
      }
      // Config's proposed capacity is not a confirmed runtime creation rule.
      const capacity = shadow.querySelector('.sk-content > .sk-label');
      if (capacity) capacity.hidden = true;
    }
    // The current shared data API uses one config-wide limit. Keep real per-clan
    // capacity/availability authoritative until that API can accept these fields.
    if (data.tab !== 'friends' && data.screen === 'discover') {
      shadow.querySelectorAll('.sk-content > .sk-row').forEach((row, index) => {
        const clan = data.clans?.[index];
        if (!clan) return;
        const count = clan.memberCount === undefined ? '' : clan.maxMembers === undefined
          ? `${clan.memberCount} members` : `${clan.memberCount}/${clan.maxMembers} members`;
        setText(row.querySelector('.sk-small'), count);
        const full = clan.maxMembers !== undefined && clan.memberCount >= clan.maxMembers;
        const button = row.querySelector('button');
        if (button) {
          button.disabled = Boolean(full || clan.canJoin === false || data.clan || state.pendingJoin
            || state.joinedClanId || state.profilePending || state.status !== 'ready');
          setText(button, state.pendingJoin === clan.id ? 'Joining…'
            : data.clan?.id === clan.id || state.joinedClanId === clan.id ? 'Joined' : full ? labels.full : labels.join);
        }
        // Only a saved backend badge is a clan's selected badge.
        const badge = row.querySelector('.sk-badge');
        if (badge) badge.hidden = !clan.badge;
      });
    }
    if (data.clan) {
      const count = `${data.clan.memberCount}/${data.clan.maxMembers} members`;
      setText(shadow.querySelector('.sk-card-head .sk-label'), count);
      const badge = shadow.querySelector('.sk-card-head .sk-badge');
      if (badge) badge.hidden = !data.clan.badge;
      shadow.querySelectorAll('.sk-stat').forEach((stat, index) => {
        if (index === 0) setText(stat.querySelector('.sk-stat-value'), count);
        else stat.hidden = true; // No level/XP fields in Social's Clan DTO.
      });
      shadow.querySelectorAll('.sk-card > .sk-small').forEach(node => { node.hidden = true; });
      if (data.screen === 'members') setText(shadow.querySelector('.sk-bar .sk-status'), count);
    }
    // Display configuration cannot grant permission or enable an absent API.
    shadow.querySelectorAll('button').forEach(button => {
      const label = button.getAttribute('aria-label') ?? button.textContent;
      if ([labels.leave, labels.leaveShort].includes(label)) {
        button.disabled=Boolean(state.leavePending||state.profilePending||!data.clan);
        button.title=state.leavePending?'Leaving clan…':'';
      } else if (/^(Promote|Demote|Kick)/.test(label)) {
        button.disabled = true;
        button.title = 'Backend operation unavailable';
      }
    });
    if(data.tab==='friends')decorateFriends(shadow,data,labels);
    clearTimeout(countdownTimer);
    if(data.tab==='chat'||data.tab==='clan'&&data.screen==='home'){
      onChatSelect(decorateChat(shadow,data));
      // While the Send button counts a wait down, come back when its number changes (a few ms late, so it has).
      const tick=nextCountdownTick(data);
      if(tick)countdownTimer=setTimeout(decorate,tick+5);
    }
    else onChatSelect(null);
  }
  function send() {
    if(!live||destroyed)return;
    const key=selectedChatKey(shadow,data),input=shadow.querySelector('[data-key="message"]'),value=input?.value;
    if(!key||!value?.trim()||shadow.querySelector('.sk-composer button')?.disabled)return;
    const submitted=data.chatRooms?.[key];
    Promise.resolve(onChatSend(key,value)).then(()=>{
      if(destroyed||selectedChatKey(shadow,data)!==key||data.chatRooms?.[key]!==submitted)return;
      const current=shadow.querySelector('[data-key="message"]');
      if(current?.value===value){current.value='';current.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));}
    },()=>{}); // Controller renders failure and retains the original draft.
  }
  const click = event => {
    const friend=event.target.closest?.('[data-friend-action]');
    if(friend){event.preventDefault();event.stopImmediatePropagation();if(!friend.disabled)onFriendAction(friend.dataset.friendAction,friend.dataset.friendId);return;}
    if (event.target.closest?.('[data-sdk-retry]')) {if(data.tab==='friends')onFriendRefresh();else if(data.tab==='chat'||data.screen==='home')onChatRefresh();else onRetry();}
    if (event.target.closest?.('.sk-composer button')) {
      if(live){event.preventDefault(); event.stopImmediatePropagation();send();}
    }
  };
  const key = event => {
    if (event.key === 'Enter' && event.target.matches?.('[data-key="message"]')) {
      if(live){event.preventDefault(); event.stopImmediatePropagation();send();}
    }
  };
  const input = event => {
    if(event.target.matches?.('[data-key="message"]')){
      const selected=selectedChatKey(shadow,data,true);
      draftRoom=event.target.value?data.chatRooms?.[selected]:undefined;
      draftClan=event.target.value&&selected==='clan'?data.clan?.id:undefined;
    }
    if (event.target.matches?.('[data-key="search"]')) onSearch(event.target.value);
    else if(event.target.matches?.('[data-key="player-search"]'))onFriendSearch(event.target.value);
    else decorate();
  };
  return {
    update(nextConfig, nextData) {
      if (destroyed) return;
      // Track the draft's room even when its composer is temporarily absent.
      // Purge through the shared input hook when the next composer is rendered.
      if(live&&(draftClan&&(draftClan!==nextData.clan?.id||nextConfig.chat?.enabled!==true||nextConfig.chat?.clanChat!==true)||draftRoom&&nextData.sdkState?.chat?.status==='connected'&&!nextData.sdkState.chat.listLoading&&!Object.values(nextData.chatRooms??{}).includes(draftRoom))){purgeDraft=true;draftRoom=undefined;draftClan=undefined;}
      const active = shadow?.activeElement;
      const scroller=shadow?.querySelector('[data-key="content"]');
      const follow=scroller&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<32;
      const selection = active?.dataset.key && typeof active.selectionStart === 'number'
        ? {key:active.dataset.key, start:active.selectionStart, end:active.selectionEnd, direction:active.selectionDirection} : null;
      config = nextConfig; data = nextData; fonts.update(config);
      if (!handle) {
        handle = render(container, config, data);
        const host = container.querySelector('[data-clan-ui]');
        shadow = host.shadowRoot;
        for (const [name, value] of Object.entries({all:'initial', display:'block', position:'absolute', inset:'0', 'pointer-events':'none'})) {
          host.style.setProperty(name, value, 'important');
        }
        shadow.addEventListener('input', input);
        shadow.addEventListener('click', click, true);
        shadow.addEventListener('keydown', key, true);
        observer = new doc.defaultView.MutationObserver(decorate);
        observer.observe(shadow, {childList:true, subtree:true});
      } else handle.update(config, data);
      decorate();
      if(follow){const next=shadow.querySelector('[data-key="content"]');if(next)next.scrollTop=next.scrollHeight;}
      if (selection) {
        const input = [...shadow.querySelectorAll('[data-key]')].find(node => node.dataset.key === selection.key);
        if (input && shadow.activeElement === input) input.setSelectionRange(selection.start, selection.end, selection.direction);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(countdownTimer);
      observer?.disconnect();
      shadow?.removeEventListener('input', input);
      shadow?.removeEventListener('click', click, true);
      shadow?.removeEventListener('keydown', key, true);
      handle?.destroy();
      fonts.destroy();
    },
  };
}
