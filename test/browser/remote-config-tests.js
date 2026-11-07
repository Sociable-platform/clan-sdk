import { ConfigError, ConfigLoadError } from '/src/index.js';

// Test-only fetch queues and provisional failures; not a backend envelope contract.
const json = input => new Response(JSON.stringify(input), { headers: { 'Content-Type': 'application/json' } });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const rejects = async (promise, predicate) => {
  try { await promise; } catch (error) {
    if (!predicate(error)) throw error;
    return error;
  }
  throw new Error('Expected a rejection');
};
async function withFetch(steps, run) {
  const original = window.fetch;
  const calls = [];
  window.fetch = async (url, options) => {
    calls.push({ url, ...options });
    if (!steps.length) throw new Error('Unexpected extra config request');
    const next = steps.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  try { await run(calls); } finally { window.fetch = original; }
}

export function registerRemoteConfigTests({ test, assert, sdk, config, container, host }) {
  const mount = target => sdk.mountChatWidgetFromUrl({ container: target, configUrl: '/provisional-config-test.json' });

  test('remote load mounts via existing UI; refresh changes appearance and preserves draft/focus', async () => {
    await withFetch([json(config()), json(config({ theme: { backgroundColor: '#ffffff' } }))], async calls => {
      const target = container();
      const widget = await mount(target);
      try {
        for (const method of ['updateConfig', 'refreshConfig', 'destroy']) assert(typeof widget[method] === 'function', `Missing ${method}`);
        const element = host(target); const input = element.shadowRoot.querySelector('textarea');
        input.value = 'Keep my remote draft'; input.dispatchEvent(new Event('input')); input.focus();
        await widget.refreshConfig();
        assert(host(target) === element, 'Refresh remounted the widget');
        assert(getComputedStyle(element.shadowRoot.querySelector('section')).backgroundColor === 'rgb(255, 255, 255)', 'Refresh did not apply config');
        assert(input.value === 'Keep my remote draft' && element.shadowRoot.activeElement === input, 'Refresh lost draft/focus');
        assert(calls.length === 2 && calls[0].url === calls[1].url, 'Refresh did not fetch again');
        assert(!calls[0].headers.Authorization && calls[0].credentials === 'omit', 'Config request reused auth');
      } finally { widget.destroy(); }
    });
  });

  const failures = [
    ['HTTP', () => new Response('unavailable', { status: 503 }), error => error instanceof ConfigLoadError && error.status === 503],
    ['network', () => new TypeError('Provisional network failure'), error => error instanceof TypeError],
    ['malformed JSON', () => new Response('{malformed'), error => error instanceof ConfigLoadError && error.code === 'config_invalid_json'],
    ['invalid configuration', () => json({ schemaVersion: 99 }), error => error instanceof ConfigError],
  ];
  for (const [name, response, predicate] of failures) {
    test(`initial ${name} failure leaves no mounted widget`, async () => {
      await withFetch([response()], async () => {
        const target = container();
        await rejects(mount(target), predicate);
        assert(!host(target), 'Failed loading mounted a widget');
        sdk.mountChatWidget({ container: target, config: config() }).destroy();
      });
    });
    test(`refresh ${name} failure preserves config, draft and widget`, async () => {
      await withFetch([json(config()), response()], async () => {
        const target = container(); const widget = await mount(target);
        try {
          const element = host(target); const input = element.shadowRoot.querySelector('textarea');
          input.value = 'Unchanged draft'; input.dispatchEvent(new Event('input'));
          const before = element.outerHTML + element.shadowRoot.innerHTML;
          await rejects(widget.refreshConfig(), predicate);
          assert(element === host(target) && element.outerHTML + element.shadowRoot.innerHTML === before, 'Failed refresh changed UI');
          assert(input.value === 'Unchanged draft', 'Failed refresh changed draft');
        } finally { widget.destroy(); }
      });
    });
  }

  test('newer refresh wins even when an older fetch ignores cancellation', async () => {
    const late = deferred(); const started = deferred();
    await withFetch([json(config()), () => { started.resolve(); return late.promise; }, json(config({ theme: { primaryColor: '#0000ff' } }))], async calls => {
      const target = container(); const widget = await mount(target);
      try {
        const older = rejects(widget.refreshConfig(), error => error.name === 'AbortError');
        await started.promise;
        await widget.refreshConfig();
        assert(calls[1].signal.aborted, 'Older fetch was not aborted');
        late.resolve(json(config({ theme: { primaryColor: '#ff0000' } })));
        await older; await Promise.resolve();
        assert(host(target).style.getPropertyValue('--clan-primary') === '#0000ff', 'Stale config won');
      } finally { widget.destroy(); }
    });
  });

  test('successful local update supersedes a pending refresh', async () => {
    const late = deferred(); const started = deferred();
    await withFetch([json(config()), () => { started.resolve(); return late.promise; }], async () => {
      const target = container(); const widget = await mount(target);
      try {
        const old = rejects(widget.refreshConfig(), error => error.name === 'AbortError');
        await started.promise;
        widget.updateConfig(config({ theme: { primaryColor: '#00ff00' } }));
        late.resolve(json(config({ theme: { primaryColor: '#ff0000' } })));
        await old; await Promise.resolve();
        assert(host(target).style.getPropertyValue('--clan-primary') === '#00ff00', 'Stale refresh replaced local update');
      } finally { widget.destroy(); }
    });
  });

  test('invalid local update does not cancel a pending valid refresh', async () => {
    const late = deferred(); const started = deferred();
    await withFetch([json(config()), () => { started.resolve(); return late.promise; }], async calls => {
      const target = container(); const widget = await mount(target);
      try {
        const pending = widget.refreshConfig(); await started.promise;
        let failed = false;
        try { widget.updateConfig({ schemaVersion: 99 }); } catch (error) { failed = error instanceof ConfigError; }
        assert(failed && !calls[1].signal.aborted, 'Invalid local update cancelled the refresh');
        late.resolve(json(config({ theme: { primaryColor: '#00ff00' } })));
        await pending;
        assert(host(target).style.getPropertyValue('--clan-primary') === '#00ff00', 'Valid pending refresh was lost');
      } finally { widget.destroy(); }
    });
  });

  test('destroy aborts a pending refresh and late data cannot affect a remount', async () => {
    const late = deferred(); const started = deferred();
    await withFetch([json(config()), () => { started.resolve(); return late.promise; }], async calls => {
      const target = container(); const widget = await mount(target);
      const old = rejects(widget.refreshConfig(), error => error.name === 'AbortError');
      await started.promise;
      widget.destroy(); widget.destroy();
      assert(calls[1].signal.aborted && !host(target), 'Destroy failed to abort/remove');
      const next = sdk.mountChatWidget({ container: target, config: config({ theme: { primaryColor: '#00ff00' } }) });
      try {
        late.resolve(json(config({ theme: { primaryColor: '#ff0000' } })));
        await old; await Promise.resolve();
        assert(host(target).style.getPropertyValue('--clan-primary') === '#00ff00', 'Late refresh modified remount');
        await rejects(widget.refreshConfig(), error => error.name === 'AbortError');
        assert(calls.length === 2, 'Destroyed handle made another request');
      } finally { next.destroy(); }
    });
  });

  test('initial cancellation rejects promptly without mounting, even if fetch ignores abort', async () => {
    const late = deferred(); const started = deferred();
    await withFetch([() => { started.resolve(); return late.promise; }], async calls => {
      const target = container(); const controller = new AbortController();
      const cancelled = rejects(sdk.mountChatWidgetFromUrl({ container: target, configUrl: '/provisional.json', signal: controller.signal }), error => error.name === 'AbortError');
      await started.promise; controller.abort(); await cancelled;
      late.resolve(json(config())); await Promise.resolve();
      assert(!host(target) && calls[0].signal.aborted, 'Cancelled load mounted a widget');
    });
  });

  test('initial AbortSignal has no lifetime effect after mounting succeeds', async () => {
    await withFetch([json(config()), json(config({ theme: { primaryColor: '#00ff00' } }))], async () => {
      const target = container(); const controller = new AbortController();
      const widget = await sdk.mountChatWidgetFromUrl({ container: target, configUrl: '/provisional.json', signal: controller.signal });
      try {
        controller.abort(); await widget.refreshConfig();
        assert(host(target).style.getPropertyValue('--clan-primary') === '#00ff00', 'Initial signal incorrectly controlled mounted lifetime');
      } finally { widget.destroy(); }
    });
  });

  test('independent remote instances keep their own URL, draft and cancellation', async () => {
    const late = deferred(); const started = deferred();
    await withFetch([json(config()), json(config()), () => { started.resolve(); return late.promise; }, json(config({ theme: { primaryColor: '#00ff00' } }))], async calls => {
      const first = container(); const second = container();
      const one = await sdk.mountChatWidgetFromUrl({ container: first, configUrl: '/one.json' });
      const two = await sdk.mountChatWidgetFromUrl({ container: second, configUrl: '/two.json' });
      try {
        const input = host(second).shadowRoot.querySelector('textarea'); input.value = 'second draft'; input.dispatchEvent(new Event('input'));
        const old = rejects(one.refreshConfig(), error => error.name === 'AbortError'); await started.promise;
        one.destroy(); await two.refreshConfig();
        assert(calls[2].url.endsWith('/one.json') && calls[3].url.endsWith('/two.json'), 'Instances shared a URL');
        assert(!calls[3].signal.aborted && input.value === 'second draft', 'Instances shared lifetime or draft');
        late.resolve(json(config())); await old;
        assert(!host(first) && host(second), 'Destroyed wrong instance');
      } finally { one.destroy(); two.destroy(); }
    });
  });

  test('production loader reaches the provisional development endpoint over real HTTP', async () => {
    const target = container();
    const widget = await sdk.mountChatWidgetFromUrl({ container: target, configUrl: '/__dev__/chat-config?variant=reference' });
    try {
      assert(host(target).shadowRoot.querySelector('h2').textContent === 'Chat', 'Real HTTP load failed');
      await widget.refreshConfig();
      assert(host(target), 'Real HTTP refresh removed widget');
    } finally { widget.destroy(); }
  });
}
