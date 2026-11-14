// Only the test server's synthetic Platform/Social/Realtime fixtures are used.
export async function checkBundle(api) {
  const summary=document.querySelector('#summary');
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  try {
    assert(typeof api?.init==='function'&&typeof api.version==='string','Public entry/version missing');
    let tokens=0;
    const sdk=api.init({
      gameId:'bundle-test',
      platformUrl:`${location.origin}/__bundle__/platform`,
      socialUrl:`${location.origin}/__bundle__/social`,
      realtimeUrl:`${location.origin}/__bundle__/realtime`,
      getPlayerToken:async({forceRefresh})=>{
        assert(typeof forceRefresh==='boolean','Token callback contract changed');
        tokens++;return 'bundle-test-token';
      },
    });
    assert(tokens===0,'init requested a token');
    const widget=sdk.mountExperience({container:document.querySelector('#social-widget')});
    await widget.ready;
    const root=document.querySelector('[data-clan-ui]')?.shadowRoot;
    assert(root?.querySelector('style')?.textContent.includes('.sk-panel'),'Bundled panel styles missing');
    const panel=root.querySelector('.sk-panel');
    assert(panel,'Published UI renderer missing');
    const box=panel.getBoundingClientRect(),style=getComputedStyle(panel);
    assert(box.width>200&&box.height>100&&style.display!=='none'&&style.visibility==='visible','Panel is not visible');
    assert(box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight,'Panel is outside viewport');
    assert(style.backgroundColor==='rgb(18, 52, 86)'&&style.borderTopWidth==='1px','Bundled theme CSS not applied');
    const rooms=await sdk.listConversations();
    assert(tokens>0&&Array.isArray(rooms.conversations),'Player token/realtimeUrl not preserved');
    assert(!document.querySelector('link[rel="stylesheet"]'),'Bundle needs an external stylesheet');
    window.bundleResult={version:api.version,exports:Object.keys(api).sort(),tokens,background:style.backgroundColor,width:box.width,height:box.height};
    summary.textContent='PASS: styled panel, public API, token callback and service URLs (mocked services)';
    summary.dataset.result='passed';
  } catch(error) {
    summary.textContent=`FAIL: ${error.message}`;summary.dataset.result='failed';throw error;
  }
}
