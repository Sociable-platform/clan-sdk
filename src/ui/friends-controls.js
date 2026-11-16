// SDK action bindings on the existing @clan/ui Friends rows. No copied screen,
// stylesheet, preview data or dashboard contract. Controls use shared CSS classes.
export function decorateFriends(shadow,data,labels) {
  const state=data.sdkState?.friends;
  if(!state)return;
  const searching=Boolean(state.query.trim());
  const busy=state.status!=='ready'||Boolean(state.pending)||(searching&&state.searchStatus==='loading');
  const doc=shadow.ownerDocument;
  const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
  // `icon`: a round @clan/ui button that keeps its picture; the label goes to its name and tooltip, not its text.
  const action=(parent,kind,id,label,{existing,icon=false}={})=>{
    let button=existing??parent.querySelector(`[data-friend-action="${kind}"]`);
    if(!button){button=doc.createElement('button');button.type='button';button.className='sk-btn sk-btn-ghost';parent.append(button);}
    button.dataset.friendAction=kind;button.dataset.friendId=id;
    const shown=state.pending?.action===kind&&state.pending.id===id?'Working…':label;
    if(icon){if(button.title!==shown)button.title=shown;}else text(button,shown);
    const name=(parent.closest('.sk-row, .sk-friend')??parent).querySelector('.sk-friend-name')?.textContent??'';
    button.disabled=busy;button.setAttribute('aria-label',`${label} · ${name}`);
  };
  const requests=data.requests??[];
  // @clan/ui request row: picture, name and "Friend request" on the left, round Accept and Decline on the right.
  shadow.querySelectorAll('.sk-content > .sk-row').forEach((row,index)=>{
    const request=requests[index];if(!request)return;
    const outgoing=request.direction==='outgoing';
    const buttons=row.querySelector('.sk-request-actions')??row;
    if(outgoing){
      text(row.querySelector('.sk-row-main .sk-desc'),'Request sent');
      // Shared UI renders an incoming request's Accept and Decline; the sender only gets Cancel.
      buttons.querySelectorAll('button:not([data-friend-action="cancel"])').forEach(button=>button.remove());
      action(buttons,'cancel',request.id,labels.cancel);
    }else{
      action(buttons,'accept',request.id,labels.accept,{existing:buttons.querySelector('.sk-btn-accept'),icon:true});
      action(buttons,'decline',request.id,'Decline',{existing:buttons.querySelector('.sk-btn-decline'),icon:true});
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
    // The name/avatar selector is also a button; only hide the Chat action, not the SDK's own.
    const line=row.querySelector('.sk-friend-row')??row;
    const chat=line.querySelector(':scope > button.sk-btn:not([data-friend-action])');
    if(chat)chat.hidden=player.relation!=='friend';
    // Actions sit on the right of the player's line, like Chat. A single one (Add friend, Cancel, Unblock) keeps
    // one width (@clan/ui's .sk-player), so Add friend and Cancel swap in place.
    line.classList.toggle('sk-player',['none','request_sent','blocked'].includes(player.relation));
    if(player.relation==='request_sent')action(line,'cancel',player.requestId,labels.cancel);
    else if(player.relation==='request_received'){
      action(line,'accept',player.requestId,labels.accept);action(line,'decline',player.requestId,'Decline');
    }else if(player.relation==='none')action(line,'send',player.id,'Add friend');
    else if(player.relation==='blocked')action(line,'unblock',player.id,'Unblock');
  });
  shadow.querySelectorAll('.sk-blocked-list button').forEach(button=>{button.disabled=busy;});
  const section=shadow.querySelector('.sk-content > .sk-section');
  if(searching)text(section,`Players · ${data.friends?.length??0}`);
}
