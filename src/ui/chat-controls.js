export function selectedChatKey(shadow,data,includeHidden=false) {
  if(!includeHidden&&shadow.querySelector('.sk-panel')?.hidden||!shadow.querySelector('[data-key="message"]'))return null;
  if(data.tab!=='chat')return data.tab==='clan'&&data.screen==='home'?'clan':null;
  const chips=[...shadow.querySelectorAll('.sk-chip')],index=chips.findIndex(el=>el.getAttribute('aria-pressed')==='true');
  return data.chatKeys?.[index]??null;
}
export function decorateChat(shadow,data) {
  const state=data.sdkState?.chat,key=selectedChatKey(shadow,data),room=data.chatRooms?.[key],history=state?.history[room];
  const ready=state?.status==='connected'&&room&&!history?.loading&&!history?.error&&!state.pending&&!state.blocked?.[room]&&!(state.cooldownUntil>Date.now());
  const input=shadow.querySelector('[data-key="message"]');
  const button=shadow.querySelector('.sk-composer button');
  if(button){button.disabled=!ready||!input?.value.trim();button.title=ready?'Send message':'Messaging unavailable';}
  let message=(data.tab==='clan'&&(data.sdkState?.leavePending?'Leaving clan…':data.sdkState?.leaveError))||state?.error||history?.error||state?.warning||'';
  if(!message)message=!state||state.status==='unavailable'?'Messaging is unavailable until transport is connected.':state.status==='connecting'?'Connecting to chat…':state.status!=='connected'?'Chat disconnected.':state.listLoading?'Loading conversations…':history?.loading?'Loading messages…':key&&!room?'No chat conversation is available for this clan.':!state.conversations.length?'No conversations yet.':room&&!data.threads?.[key]?.length?'No messages yet.':'';
  const status=shadow.querySelector('[data-sdk-status]');
  if(status){
    if(status.firstChild?.textContent!==message){const text=shadow.ownerDocument.createElement('span');text.textContent=message;status.replaceChildren(text);}

  }
  return key;
}
