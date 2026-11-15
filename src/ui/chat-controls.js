export function selectedChatKey(shadow,data,includeHidden=false) {
  if(!includeHidden&&shadow.querySelector('.sk-panel')?.hidden||!shadow.querySelector('[data-key="message"]'))return null;
  if(data.tab!=='chat')return data.tab==='clan'&&data.screen==='home'?'clan':null;
  // @clan/ui 0.1.49+: the open conversation's header carries its key (a friend's ID). The Chat tab's list shows no
  // conversation, and then there is no message box either (checked above).
  const open=shadow.querySelector('[data-conversation]')?.getAttribute('data-conversation');
  if(open!=null)return data.chatKeys?.includes(open)?open:null;
  // Older @clan/ui: one chip per conversation above it, the pressed one is open.
  const chips=[...shadow.querySelectorAll('.sk-chip')],index=chips.findIndex(el=>el.getAttribute('aria-pressed')==='true');
  return data.chatKeys?.[index]??null;
}
export function decorateChat(shadow,data) {
  const state=data.sdkState?.chat,key=selectedChatKey(shadow,data),room=data.chatRooms?.[key],history=state?.history[room];
  const ready=state?.status==='connected'&&room&&!history?.loading&&!history?.error&&!state.pending&&!state.blocked?.[room]&&!(state.cooldownUntil>Date.now());
  const input=shadow.querySelector('[data-key="message"]');
  const button=shadow.querySelector('.sk-composer button');
  // Seconds left of a slow mode or rate limit wait, when it is long enough to be worth counting down
  // (the controller decides: state.cooldownCountdown). 0 means: show the normal Send label.
  const wait=state?.cooldownCountdown?Math.max(0,Math.ceil((state.cooldownUntil-Date.now())/1000)):0;
  if(button){
    button.disabled=!ready||!input?.value.trim();
    // The label the shared UI drew is remembered once, so it can be put back when the wait is over.
    if(button.dataset.sdkLabel===undefined)button.dataset.sdkLabel=button.textContent;
    const label=wait>0?`${wait}s`:button.dataset.sdkLabel;
    // Only write a changed value: the renderer watches this tree, and an unconditional write would loop.
    if(button.textContent!==label)button.textContent=label;
    const title=wait>0?`You can send again in ${wait}s`:ready?'Send message':'Messaging unavailable';
    if(button.title!==title)button.title=title;
  }
  let message=(data.tab==='clan'&&(data.sdkState?.leavePending?'Leaving clan…':data.sdkState?.leaveError))||state?.error||history?.error||state?.warning||'';
  if(!message)message=!state||state.status==='unavailable'?'Messaging is unavailable until transport is connected.':state.status==='connecting'?'Connecting to chat…':state.status!=='connected'?'Chat disconnected.':state.listLoading?'Loading conversations…':history?.loading?'Loading messages…':key&&!room?'No chat conversation is available for this clan.':!state.conversations.length?'No conversations yet.':room&&!data.threads?.[key]?.length?'No messages yet.':'';
  const status=shadow.querySelector('[data-sdk-status]');
  if(status){
    if(status.firstChild?.textContent!==message){const text=shadow.ownerDocument.createElement('span');text.textContent=message;status.replaceChildren(text);}

  }
  return key;
}
/** Milliseconds until the countdown on the Send button changes next, or 0 when nothing is counting down. */
export function nextCountdownTick(data,now=Date.now()) {
  const state=data.sdkState?.chat,left=state?.cooldownCountdown?state.cooldownUntil-now:0;
  return left>0?left%1000||1000:0;
}
