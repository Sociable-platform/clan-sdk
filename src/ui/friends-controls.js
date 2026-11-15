// SDK action bindings on the existing @clan/ui Friends rows. No copied screen,
// stylesheet, preview data or dashboard contract. Controls use shared CSS classes.
export function decorateFriends(shadow,data,labels) {
  const state=data.sdkState?.friends;
  if(!state)return;
  const searching=Boolean(state.query.trim());
  const busy=state.status!=='ready'||Boolean(state.pending)||(searching&&state.searchStatus==='loading');
  const doc=shadow.ownerDocument;
  const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
  const action=(parent,kind,id,label,existing)=>{
    let button=existing??parent.querySelector(`[data-friend-action="${kind}"]`);
    if(!button){button=doc.createElement('button');button.type='button';button.className='sk-btn sk-btn-ghost';parent.append(button);}
    button.dataset.friendAction=kind;button.dataset.friendId=id;
    text(button,state.pending?.action===kind&&state.pending.id===id?'Working…':label);
    button.disabled=busy;button.setAttribute('aria-label',`${label} · ${parent.querySelector('.sk-friend-name')?.textContent??''}`);
  };
  const requests=data.requests??[];
  shadow.querySelectorAll('.sk-content > .sk-row').forEach((row,index)=>{
    const request=requests[index];if(!request)return;
    const outgoing=request.direction==='outgoing';
    const description=row.querySelector('.sk-friend-request');
    if(outgoing&&description?.lastChild?.nodeType===3)text(description.lastChild,' · Request sent');
    action(row,outgoing?'cancel':'accept',request.id,outgoing?labels.cancel:labels.accept,row.querySelector('button'));
    if(outgoing){
      // Shared UI renders an incoming-request Decline button by default.
      row.querySelectorAll('button:not([data-friend-action="cancel"])').forEach(button=>button.remove());
    }else{
      action(row,'decline',request.id,'Decline',row.querySelector('button:not([data-friend-action])'));
    }
  });
  shadow.querySelectorAll('.sk-content > .sk-friend').forEach((row,index)=>{
    const player=data.friends?.[index];if(!player)return;
    // Search results are already server-filtered; the shared local name-only
    // filter must not hide the server's authoritative rows.
    if(searching)row.hidden=false;
    const manageable=player.relation==='friend';
    const identity=row.querySelector('.sk-friend-select');
    if(identity){
      identity.disabled=busy||!manageable;
      if(!manageable){identity.setAttribute('aria-label',player.name);identity.removeAttribute('aria-expanded');}
    }
    if(!manageable)row.querySelector('.sk-member-panel')?.remove();
    row.querySelectorAll('.sk-member-panel button').forEach(button=>{button.disabled=busy;});
    // The name/avatar selector is also a button; only hide the Chat action.
    const chat=row.querySelector('.sk-friend-row > button.sk-btn');
    if(chat)chat.hidden=player.relation!=='friend';
    if(player.relation==='request_sent')action(row,'cancel',player.requestId,labels.cancel);
    else if(player.relation==='request_received'){
      action(row,'accept',player.requestId,labels.accept);action(row,'decline',player.requestId,'Decline');
    }else if(player.relation==='none')action(row,'send',player.id,'Add friend');
    else if(player.relation==='blocked')action(row,'unblock',player.id,'Unblock');
    else {action(row,'remove',player.id,'Remove friend');row.querySelector('[data-friend-action="remove"]').hidden=Boolean(row.querySelector('.sk-member-panel'));}
  });
  shadow.querySelectorAll('.sk-blocked-list button').forEach(button=>{button.disabled=busy;});
  const section=shadow.querySelector('.sk-content > .sk-section');
  if(searching)text(section,`Players · ${data.friends?.length??0}`);
  const status=shadow.querySelector('[data-sdk-status]');
  if(status&&!status.querySelector('[data-friend-refresh]')){
    const refresh=doc.createElement('button');refresh.type='button';refresh.className='sk-btn sk-btn-ghost';refresh.dataset.friendRefresh='';refresh.textContent='Refresh friends';status.append(refresh);
  }
  const refresh=status?.querySelector('[data-friend-refresh]');
  if(refresh)refresh.disabled=Boolean(state.pending)||state.status==='loading';
}
