// Unread counts: what the SDK keeps from Realtime, passes to @clan/ui as data.unread, and reads back.
// Identities and data are synthetic.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatController, messageDTO} from '../src/chat/controller.js';
import {chatView} from '../src/chat/view.js';
import {selectedChatKey} from '../src/ui/chat-controls.js';

const config={clan:{enabled:true},chat:{enabled:true,clanChat:true,directMessages:true,maxMessageLength:300}};
const clan={id:'room-clan',kind:'clan',clanId:'social-clan',members:[{id:'me',name:'Me',online:true}],lastMessage:null,unread:3};
const dm={id:'room-dm',kind:'dm',clanId:null,members:[{id:'me',name:'Me',online:true},{id:'peer',name:'Peer',online:false}],lastMessage:null,unread:2};
// Each message is a second after the one made before it, so they sort in the order the test writes them.
let clock=0;
const msg=(id,senderId='peer')=>({id,senderId,senderName:senderId==='me'?'Me':'Peer',body:id,createdAt:new Date(Date.UTC(2026,10,15,10,0,clock++)).toISOString()});
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

async function world(t,{visible=()=>true,history={}}={}){
  const sockets=[],changes=[];
  const client={acquire:async()=>({token:'test-token',version:1}),socketUrl:()=> 'ws://test.invalid',listConversations:async()=>({conversations:[clan,dm]}),
    listMessages:async id=>({messages:history[id]??[],hasMore:false})};
  const c=createChatController({client,isVisible:visible,onChange:s=>changes.push(s),socketFactory:()=>{const s={readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw));},close(){},frame(type,data){this.onmessage?.({data:JSON.stringify({type,game_id:'game',data})});}};sockets.push(s);return s;}});
  t.after(()=>c.destroy());c.configure(config,'social-clan');await settle();
  sockets[0].frame('hello',{playerId:'me',configVersion:0,onlineFriends:[]});await settle();
  const state=()=>changes.at(-1),unread=()=>chatView(state(),config,{id:'social-clan'}).unread;
  const reads=()=>sockets[0].sent.filter(f=>f.type==='conversation.read');
  return {c,socket:sockets[0],state,unread,reads};
}

test('the view passes the server\'s unread counts as data.unread: the clan, and direct messages by friend',async t=>{
  const w=await world(t);
  assert.deepEqual(w.unread(),{clan:3,direct:{peer:2}});
});

test('another player\'s message in a conversation that is not open counts as unread',async t=>{
  const w=await world(t);
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('m1')});
  assert.deepEqual(w.unread(),{clan:3,direct:{peer:3}});
  assert.equal(w.reads().length,0);
});

test('the player\'s own reply reads the conversation up to it, on Realtime too, even when it is not on screen here',async t=>{
  // Another tab (or a widget the game hides) sent it: replying means the player saw what came before.
  const w=await world(t,{visible:()=>false});
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('m1')});
  assert.equal(w.unread().direct.peer,3);
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('reply','me')});
  assert.deepEqual(w.unread(),{clan:3,direct:{}});
  assert.deepEqual(w.reads().map(f=>f.data),[{conversationId:dm.id,lastMessageId:'reply'}]);
  // The same reply again (a repeated frame) sends nothing more; a new message from the friend counts again.
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('reply','me')});
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('m2')});
  assert.equal(w.reads().length,1);
  assert.equal(w.unread().direct.peer,1);
});

test('the count stops at 99, like the server\'s',async t=>{
  const w=await world(t);
  for(let i=0;i<120;i++)w.socket.frame('message.new',{conversationId:dm.id,message:msg(`m${i}`)});
  assert.equal(w.unread().direct.peer,99);
});

test('markRead(key) tells Realtime the conversation was read up to its newest message and clears its count',async t=>{
  const w=await world(t,{history:{[dm.id]:[msg('old')]}});
  w.c.select('peer');await settle();
  // Opening it already read it: the history arrived while it was selected and on screen.
  assert.deepEqual(w.reads().map(f=>f.data),[{conversationId:dm.id,lastMessageId:'old'}]);
  assert.deepEqual(w.unread().direct,{});
  w.socket.frame('message.new',{conversationId:clan.id,message:msg('c1')});
  w.c.markRead('clan');
  // The clan room has no loaded history except the live message, which is enough to read up to.
  assert.deepEqual(w.reads().at(-1).data,{conversationId:clan.id,lastMessageId:'c1'});
  assert.equal(w.unread().clan,0);
});

test('a message in the open conversation is read at once while the widget is seen, and counted while it is not',async t=>{
  let seen=true;
  const w=await world(t,{visible:()=>seen,history:{[dm.id]:[msg('old')]}});
  w.c.select('peer');await settle();
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('live')});
  assert.equal(w.unread().direct.peer,undefined);
  assert.equal(w.reads().at(-1).data.lastMessageId,'live');
  seen=false;
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('hidden')});
  assert.equal(w.unread().direct.peer,1);
  // Shown again (the widget calls markRead): read up to the newest message.
  seen=true;w.c.markRead();
  assert.equal(w.unread().direct.peer,undefined);
  assert.equal(w.reads().at(-1).data.lastMessageId,'hidden');
});

test('reading the same newest message twice sends one read frame',async t=>{
  const w=await world(t,{history:{[dm.id]:[msg('old')]}});
  w.c.select('peer');await settle();w.c.markRead('peer');w.c.markRead('peer');
  assert.equal(w.reads().length,1);
});

const shadow=nodes=>({querySelector:selector=>nodes[selector]??null,querySelectorAll:selector=>nodes[`all:${selector}`]??[]});
const attr=values=>({getAttribute:name=>values[name]??null});

test('the open conversation is read from the header\'s data-conversation (the conversation list of @clan/ui 0.1.49+)',()=>{
  const data={tab:'chat',chatKeys:['peer','other','clan'],chatRooms:{peer:'dm-1',other:'dm-2',clan:'room-c'}};
  assert.equal(selectedChatKey(shadow({'[data-key="message"]':{},'[data-conversation]':attr({'data-conversation':'other'})}),data),'other');
  // A key the SDK does not know opens nothing.
  assert.equal(selectedChatKey(shadow({'[data-key="message"]':{},'[data-conversation]':attr({'data-conversation':'stranger'})}),data),null);
  // The list itself: no conversation and no message box.
  assert.equal(selectedChatKey(shadow({}),data),null);
});

test('older @clan/ui without data-conversation still selects by the pressed chip',()=>{
  const chips=[attr({'aria-pressed':'false'}),attr({'aria-pressed':'true'})];
  assert.equal(selectedChatKey(shadow({'[data-key="message"]':{},'all:.sk-chip':chips}),{tab:'chat',chatKeys:['peer','other']}),'other');
});

test('the view passes each message\'s time to the widget as at',async t=>{
  const w=await world(t,{history:{[dm.id]:[msg('old')]}});
  w.c.select('peer');await settle();
  const message=chatView(w.state(),config,{id:'social-clan'}).threads.peer[0];
  assert.equal(message.at,w.state().messages[dm.id][0].createdAt);
});

test('until a conversation\'s history is loaded, its thread is the last message from the conversation list',()=>{
  const last={id:'last',senderId:'peer',senderName:'Peer',body:'see you',createdAt:'2026-11-15T10:00:00Z'};
  const state={playerId:'me',messages:{},conversations:[{...dm,lastMessage:last,unread:1},{...clan,lastMessage:{...last,id:'c-last',senderId:'me'}}]};
  const view=chatView(state,config,{id:'social-clan'});
  assert.deepEqual(view.threads.peer,[{id:'last',from:'Peer',body:'see you',mine:false,at:last.createdAt,kind:'text'}]);
  assert.equal(view.threads.clan[0].mine,true);
  // Loaded history replaces it; an invalid last message is left out.
  assert.deepEqual(chatView({...state,messages:{[dm.id]:[{...last,id:'h1',body:'from history'}]}},config,{id:'social-clan'}).threads.peer.map(m=>m.id),['h1']);
  assert.deepEqual(chatView({...state,conversations:[{...dm,lastMessage:{id:'x'}}]},config,{id:'social-clan'}).threads.peer,[]);
});

// Clan member changes (TEAM-292): Realtime sends "Ali joined the clan" as a message with a kind, the player it is
// about as the sender and an empty body. @clan/ui draws it as a line; it never counts as unread.
const member=(id,kind,senderId='peer')=>({...msg(id,senderId),body:'',kind});

test('messageDTO keeps the kind, and a message without one is text (a Realtime from before kinds)',()=>{
  const m=msg('m1');
  assert.equal(messageDTO(m).kind,'text');
  assert.equal(messageDTO({...m,kind:'text'}).kind,'text');
  assert.equal(messageDTO(member('j1','member_joined')).kind,'member_joined');
  assert.equal(messageDTO({...m,kind:null}).kind,'text');
  // A kind this SDK does not know yet is kept, for @clan/ui to decide; a kind that is not a word is invalid.
  assert.equal(messageDTO({...m,kind:'member_promoted'}).kind,'member_promoted');
  assert.throws(()=>messageDTO({...m,kind:''}),/Invalid Realtime message/);
  assert.throws(()=>messageDTO({...m,kind:7}),/Invalid Realtime message/);
});

test('the view gives every message its kind, in history and as the conversation list\'s last message',async t=>{
  const w=await world(t,{history:{[clan.id]:[msg('hi'),member('j1','member_joined')]}});
  w.c.select('clan');await settle();
  const view=chatView(w.state(),config,{id:'social-clan'});
  assert.deepEqual(view.threads.clan.map(m=>[m.id,m.kind,m.from,m.body]),[['hi','text','Peer','hi'],['j1','member_joined','Peer','']]);
  const listed=chatView({playerId:'me',messages:{},conversations:[{...clan,lastMessage:member('l1','member_left')}]},config,{id:'social-clan'});
  assert.deepEqual(listed.threads.clan.map(m=>[m.kind,m.from]),[['member_left','Peer']]);
});

test('a member change is the conversation\'s newest message but never unread',async t=>{
  const w=await world(t);
  for(const [id,kind] of [['j1','member_joined'],['l1','member_left'],['k1','member_kicked']])
    w.socket.frame('message.new',{conversationId:clan.id,message:member(id,kind)});
  assert.deepEqual(w.unread(),{clan:3,direct:{peer:2}});
  assert.equal(w.state().conversations.find(c=>c.id===clan.id).lastMessage.id,'k1');
  assert.equal(w.reads().length,0);
  // A message a player writes after it counts as before.
  w.socket.frame('message.new',{conversationId:clan.id,message:msg('c1')});
  assert.equal(w.unread().clan,4);
});

test('the player\'s own join line is not a reply: it keeps the count and sends no read',async t=>{
  const w=await world(t,{visible:()=>false});
  w.socket.frame('message.new',{conversationId:clan.id,message:member('j-me','member_joined','me')});
  assert.equal(w.unread().clan,3);
  assert.equal(w.reads().length,0);
});

test('an open clan chat on screen is still read up to its newest message, a member change included',async t=>{
  const w=await world(t,{history:{[clan.id]:[msg('hi')]}});
  w.c.select('clan');await settle();
  w.socket.frame('message.new',{conversationId:clan.id,message:member('j1','member_joined')});
  assert.deepEqual(w.reads().at(-1).data,{conversationId:clan.id,lastMessageId:'j1'});
  assert.equal(w.unread().clan,0);
});
