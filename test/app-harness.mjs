// Hjælper til test/app.test.mjs og test/tabs.test.mjs: kører den byggede app (src/app.js og dens moduler) i vm med den falske DOM fra dom-harness.mjs.
// Datoen styres med et falsk ur (alle klokkeslæt er lokal tid, så testene er uafhængige af tidszone). Kører ikke tests selv.
import vm from 'node:vm';
import { bundleJs } from '../build/bundle.mjs';
import { fakeDocument, fakeWindow, memoryStorage } from './dom-harness.mjs';

export const SITE_FILES = ['src/plan.js', 'src/progress.js', 'src/pace.js', 'src/nutrition.js', 'src/views.js', 'src/advice.js', 'src/store/local.js', 'src/settings.js', 'src/app.js'];
export const ARTIFACT_FILES = ['src/plan.js', 'src/progress.js', 'src/pace.js', 'src/nutrition.js', 'src/views.js', 'src/advice.js', 'src/store/local.js', 'src/store/artifact-db.js', 'src/settings.js', 'src/app.js'];

// Falsk location: hash som i browseren ('' eller '#token'), og en ny hash melder hashchange på window (som browseren gør, bare synkront).
function fakeLocation(win, hash, onReload) {
  let h = hash ? (hash.startsWith('#') ? hash : '#' + hash) : '';
  return {
    get hash() { return h; },
    set hash(v) { const next = v ? (String(v).startsWith('#') ? String(v) : '#' + v) : ''; if (next !== h) { h = next; win.fire('hashchange'); } },
    reload: onReload,
  };
}

// → { doc, win, clock, $, storage, reloads(), pane(), go(hash), hash(), views() }
//   pane(): containeren med indstillingerne i fanen Mere. go('#kost'): som at skifte hash i adresselinjen. views(): ids på de synlige visninger.
export function loadApp({ target = 'site', now = '2026-11-02T10:00:00', claude, storage = memoryStorage(), hash = '' } = {}) {
  const clock = { t: new Date(now).getTime(), set(v) { this.t = new Date(v).getTime(); } };
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.t); }
    static now() { return clock.t; }
  }
  const doc = fakeDocument();
  const win = fakeWindow(doc, { claude });
  let reloads = 0;
  const location = fakeLocation(win, hash, () => { reloads++; });
  const sandbox = {
    document: doc, window: win, localStorage: storage, console, Promise, setTimeout, clearTimeout, queueMicrotask, Date: FakeDate,
    matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0, location, confirm: () => true, URL, Blob,
  };
  vm.runInNewContext(bundleJs(target === 'artifact' ? ARTIFACT_FILES : SITE_FILES, { target, version: 'test' }), sandbox, { filename: 'app.bundle.js' });
  const $ = id => doc.getElementById(id);
  const VIEWS = ['idag', 'kalender', 'kost', 'analyse', 'mere'];
  return {
    doc, win, clock, $, storage, location, reloads: () => reloads,
    pane: () => $('settingsMount'),
    go: h => { location.hash = h; },
    views: () => VIEWS.filter(v => !$(v).hidden),
  };
}
