import { mountExperience } from './experience-widget.js';
import { assertContainerAvailable, reserveContainer, releaseContainer } from './mount-registry.js';
import { widgetConfig } from '../config/widget.js';
import { defaultExperienceConfig } from '../config/default-experience.js';
import { configDiagnostic } from '../config/platform.js';
import { abortError, checkAbort, assertAbortSignal } from '../config/load.js';

/** Returns immediately so destroy can cancel even the initial config request. */
export function mountPlatformExperience(sdk, load, {container, signal, clanAdapter, assets} = {}) {
  assertContainerAvailable(container);
  assertAbortSignal(signal);
  checkAbort(signal);
  if (clanAdapter !== undefined && typeof clanAdapter !== 'function') throw new TypeError('clanAdapter must be a function when supplied.');
  let widget;
  let destroyed = false;
  let revision = 0;
  let pending;
  let reserved = true;
  reserveContainer(container);
  const cleanupInitialSignal = () => signal?.removeEventListener('abort',cancelInitial);
  const invalidate = () => {
    revision += 1;
    pending?.abort(abortError('Configuration loading superseded or widget destroyed.'));
    pending = undefined;
  };
  function requireActive() { if (destroyed) throw abortError('SDK widget was destroyed.'); }
  function apply(config) {
    if (widget) widget.updateConfig(config);
    else {
      if (reserved) { releaseContainer(container); reserved = false; }
      // Backend config is mapped to visual fields without schema validation.
      widget = mountExperience(sdk,{container,config,clanAdapter,assets},{validate:false});
    }
  }
  async function refreshConfig() {
    requireActive();
    invalidate();
    const ticket = revision;
    const controller = new AbortController();
    pending = controller;
    try {
      const config = await load({signal:controller.signal});
      if (destroyed || ticket !== revision) throw abortError('Configuration loading superseded.');
      try { apply(config); }
      catch {
        // A payload that cannot be rendered must still not break the host game.
        configDiagnostic('config_render_error');
        apply(defaultExperienceConfig());
      }
    } finally { if (pending === controller) pending = undefined; }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    invalidate(); cleanupInitialSignal();
    widget?.destroy();
    if (reserved) { releaseContainer(container); reserved = false; }
  }
  function cancelInitial() { destroy(); }
  signal?.addEventListener('abort',cancelInitial,{once:true});
  const ready = refreshConfig();
  // Destroying an initial load should not create an unhandled host-page rejection.
  ready.then(cleanupInitialSignal,cleanupInitialSignal);
  return {
    ready, refreshConfig, destroy,
    refreshFriends() {
      requireActive();
      if (!widget) throw new Error('Wait for widget.ready before refreshing friends.');
      return widget.refreshFriends();
    },
    updateConfig(config) {
      requireActive();
      const normalized=widgetConfig(config,{validate:true}); // Validate before invalidating work.
      apply(normalized);
      invalidate();
    },
    navigate(screen) {
      requireActive();
      if (!widget) throw new Error('Wait for widget.ready before navigating.');
      widget.navigate(screen);
    },
  };
}
