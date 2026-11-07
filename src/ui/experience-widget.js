import { discoverConfig } from '../config/discover.js';
import { createDiscoverController } from '../experience/discover-controller.js';
import { createExperienceRenderer } from './experience-renderer.js';
import { assertContainerAvailable, reserveContainer, releaseContainer } from './mount-registry.js';

export function mountExperience(sdk, { container, config, clanAdapter } = {}) {
  assertContainerAvailable(container);
  let normalized = discoverConfig(config);
  if (typeof clanAdapter !== 'function') {
    throw new TypeError('Discover requires clanAdapter: Social list/join DTOs are not yet published. No mock adapter is installed by the SDK.');
  }
  let dead = false;
  let state;
  const doc = container.ownerDocument;
  const host = doc.createElement('div');
  host.dataset.clanSdkWidget = 'experience';
  const set = (key, value) => host.style.setProperty(key, value, 'important');
  for (const [key, value] of Object.entries({ all:'initial', display:'block', position:'relative', 'box-sizing':'border-box', 'max-width':'100%', margin:'0', padding:'0', border:'0', direction:'ltr' })) set(key, value);
  set('width', `${normalized.width}px`);
  const shadow = host.attachShadow({ mode:'open' });
  const notify = (name, detail) => host.dispatchEvent(new doc.defaultView.CustomEvent(`clan-sdk:${name}`, { detail, bubbles:true, composed:true }));
  const renderer = createExperienceRenderer(shadow, {
    onSearch: query => controller.search(query), onJoin: id => void controller.join(id),
    onRetry: () => void controller.retry(), onNavigate: screen => controller.navigate(screen),
  });
  const controller = createDiscoverController({
    listClans: options => sdk.listClans(options), joinClan: id => sdk.joinClan(id), clanAdapter,
    onChange(next) { state = next; renderer.update({ config:normalized, state }); },
    onNavigate: detail => notify('navigate', detail), onJoined: detail => notify('joined', detail),
  });
  renderer.update({ config:normalized });
  container.append(host); reserveContainer(container);
  void controller.start();
  return {
    updateConfig(nextConfig) {
      if (dead) throw new Error('Cannot update a destroyed SDK widget.');
      const next = discoverConfig(nextConfig);
      normalized = next; set('width', `${next.width}px`); renderer.update({ config:next, state });
    },
    navigate(screen) {
      if (dead) throw new Error('Cannot navigate a destroyed SDK widget.');
      if (!['discover', 'create'].includes(screen)) throw new TypeError('Only discover and the create navigation handoff are supported.');
      controller.navigate(screen);
    },
    destroy() {
      if (dead) return;
      dead = true; controller.destroy(); renderer.destroy(); host.remove(); releaseContainer(container);
    },
  };
}
