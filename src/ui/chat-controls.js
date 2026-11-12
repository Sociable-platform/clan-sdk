export function selectedChatKey(shadow,data) {
  if(shadow.querySelector('.sk-panel')?.hidden||!shadow.querySelector('[data-key="message"]'))return null;
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
  let message=state?.error||history?.error||state?.warning||'';
  if(!message)message=!state||state.status==='unavailable'?'Messaging is unavailable until transport is connected.':state.status==='connecting'?'Connecting to chat…':state.status!=='connected'?'Chat disconnected.':state.listLoading?'Loading conversations…':history?.loading?'Loading messages…':key&&!room?'No chat conversation is available for this clan.':!state.conversations.length?'No conversations yet.':room&&!data.threads?.[key]?.length?'No messages yet.':'';
  const status=shadow.querySelector('[data-sdk-status]');
  if(status){
    if(status.firstChild?.textContent!==message){const text=shadow.ownerDocument.createElement('span');text.textContent=message;status.replaceChildren(text);}
    if(state&&state.status!=='unavailable'){
      const controls=[['refresh','Refresh chat'],['reconnect','Reconnect chat'],...(history?.hasMore?[['earlier','Load earlier messages']]:[])];
      for(const [action,label]of controls)if(!status.querySelector(`[data-chat-action="${action}"]`)){const btn=shadow.ownerDocument.createElement('button');btn.type='button';btn.className='sk-btn sk-btn-ghost';btn.dataset.chatAction=action;btn.textContent=label;status.append(btn);}
      if(!history?.hasMore)status.querySelector('[data-chat-action="earlier"]')?.remove();
    }
  }
  return key;
}
