// Unread counts: what the SDK keeps from Realtime, passes to @clan/ui as data.unread, and reads back.
// Identities and data are synthetic.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatController} from '../src/chat/controller.js';
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

test('another player\'s message in a conversation that is not open counts as unread; the player\'s own does not',async t=>{
  const w=await world(t);
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('m1')});
  w.socket.frame('message.new',{conversationId:dm.id,message:msg('m2','me')});
  assert.deepEqual(w.unread(),{clan:3,direct:{peer:3}});
  assert.equal(w.reads().length,0);
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
  const data={tab:'chat',chatKeys:['peer','other','clan']};
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
