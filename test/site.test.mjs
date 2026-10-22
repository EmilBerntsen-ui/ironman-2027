// owned by 2a: site-målet (build/site.mjs), service workeren (src/sw.js) og PWA-laget (src/pwa.js).
// Alt bygges ind i mkdtemp-mapper, aldrig i dist/. sw.js og pwa.js køres i vm med små falske miljøer, så de kan testes uden browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import { ROOT, bundleJs } from '../build/bundle.mjs';
import { buildSite } from '../build/site.mjs';

const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
const REAL_ASSETS = resolve(ROOT, 'assets');
const read = (dir, rel) => readFileSync(join(dir, rel));
const text = (dir, rel) => read(dir, rel).toString('utf8');
const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split('\\').join('/')]).sort();

let tmp, out, built, warnings;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'im2027-site-'));
  out = join(tmp, 'site');
  warnings = [];
  built = await buildSite({ outDir: out, warn: m => warnings.push(m) });
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// Et lille, komplet aktivsæt (manifest, ikoner, skrifter), så testene ikke afhænger af at ikon-opgaven er landet.
let n = 0;
function fakeAssets({ manifest = true, icons = true, fonts = true } = {}) {
  const dir = join(tmp, `assets${++n}`);
  mkdirSync(join(dir, 'icons'), { recursive: true });
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  if (fonts) cpSync(join(REAL_ASSETS, 'fonts'), join(dir, 'fonts'), { recursive: true });
  if (icons) for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'icon.svg']) writeFileSync(join(dir, 'icons', f), `ikon ${f}`);
  if (manifest) writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ icons: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon.svg'].map(src => ({ src })) }));
  return dir;
}
// Kør fn med miljøvariablen CI sat til value (undefined = fjernet) og gendan den bagefter.
const withCI = async (value, fn) => {
  const prev = process.env.CI;
  if (value === undefined) delete process.env.CI; else process.env.CI = value;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.CI; else process.env.CI = prev; }
};

// ---- Build-output ----

test('buildSite: skriver index, app.<8hex>.js, sw.js og skrifter; manifest og ikoner når de findes', () => {
  const files = walk(out);
  assert.ok(files.includes('index.html') && files.includes('sw.js'));
  assert.equal(files.filter(f => /^app\.[0-9a-f]{8}\.js$/.test(f)).length, 1);
  for (const f of readdirSync(join(REAL_ASSETS, 'fonts'))) assert.ok(files.includes(`fonts/${f}`), f);
  assert.ok(files.includes('fonts/OFL.txt'), 'licensen følger med skrifterne');
  if (existsSync(join(REAL_ASSETS, 'manifest.webmanifest'))) {
    assert.ok(files.includes('manifest.webmanifest'));
    const manifest = JSON.parse(text(out, 'manifest.webmanifest'));
    for (const i of manifest.icons) assert.ok(files.includes(i.src), `manifestets ikon ${i.src}`);
    assert.deepEqual(warnings, []);
  } else {
    assert.match(warnings.join('\n'), /manifest/, 'uden manifest advarer bygget i stedet for at fejle');
  }
  assert.ok(!files.some(f => f.startsWith('cal/')), 'cal/ skrives af writeCalendar, ikke af buildSite');
});

test('index.html: doctype, præcis CSP, manifest, ikoner, ét eksternt defer-script og ingen inline script', () => {
  const html = text(out, 'index.html');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`));
  const app = walk(out).find(f => /^app\.[0-9a-f]{8}\.js$/.test(f));
  assert.ok(html.includes(`<script src="${app}" defer></script>`));
  assert.equal((html.match(/<script\b/gi) || []).length, 1);
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)/i, 'ingen inline script (CSP: script-src self)');
  assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, 'ingen inline hændelseshandlere');
  assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'));
  assert.equal((html.match(/<main\b/g) || []).length, 1, 'ét <main>-landmærke');
  assert.ok(!/<!--BODY-->|\/\*STYLES\*\/|__APP_JS__/.test(html));
  // §6.1: rækkefølgen i <head>
  const order = ['<meta charset="utf-8">', 'Content-Security-Policy', 'name="viewport"', '<title>Ironman 2027</title>', 'name="robots" content="noindex"',
    'name="theme-color" content="#EEF2F1" media="(prefers-color-scheme: light)"', 'name="theme-color" content="#0E1413" media="(prefers-color-scheme: dark)"',
    'rel="manifest"', 'rel="icon" href="icons/icon.svg"', 'rel="apple-touch-icon" href="icons/apple-touch-icon.png"',
    'name="apple-mobile-web-app-title" content="IM 2027"', 'name="apple-mobile-web-app-status-bar-style" content="default"', '<style>', '<script src='];
  const at = order.map(s => html.indexOf(s));
  assert.ok(at.every(i => i >= 0), `mangler: ${order.filter((s, i) => at[i] < 0).join(' | ')}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'head-rækkefølgen følger §6.1');
});

test('ingen tredjepart: ingen Google Fonts, ingen http:-URL\'er; skrifter og CSS-url()\'er peger på filer der findes', () => {
  const html = text(out, 'index.html');
  assert.doesNotMatch(html, /fonts\.googleapis|gstatic|http:/i);
  assert.doesNotMatch(html, /https?:\/\/(?!api\.github\.com)[^"'\s)]+/, 'eneste eksterne adresse i dokumentet er CSP\'ens api.github.com');
  const files = walk(out);
  const urls = [...html.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/["']/g, '')).filter(u => !u.startsWith('#') && !u.startsWith('data:'));
  assert.ok(urls.length >= 7, 'font-face for alle skrifterne');
  for (const u of urls) assert.ok(files.includes(u), u);
  const js = text(out, files.find(f => /^app\./.test(f)));
  assert.doesNotMatch(js, /fonts\.googleapis|gstatic/);
  assert.deepEqual([...js.matchAll(/http:\/\/(?!www\.w3\.org\/2000\/svg)[^\s'"`)]+/g)].map(m => m[0]), [], 'ingen http:-adresser (kun SVG-navnerummet er tilladt)');
  assert.ok(js.includes("register('sw.js', { scope: './', updateViaCache: 'none' })"), 'app-JS registrerer service workeren');
  assert.ok(js.includes('const BUILD = Object.freeze({ target: "site"'));
});

test('sw.js: PRECACHE = filerne på disken (uden sw.js og cal/), sorteret, med ./ for index, og ingen cal/-tekst', () => {
  const sw = text(out, 'sw.js');
  assert.ok(!sw.includes('cal/'), 'sw.js må ikke indeholde kalenderstien som tekst');
  assert.doesNotMatch(sw, /__VERSION__|__PRECACHE__/);
  const { precache, version } = built;
  assert.match(version, /^[0-9a-f]{12}$/);
  assert.ok(sw.includes(`const VERSION = '${version}';`));
  const onDisk = walk(out).filter(f => f !== 'sw.js').map(f => f === 'index.html' ? './' : f).sort();
  assert.deepEqual(precache, onDisk);
  assert.deepEqual(JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1]), precache, 'listen i sw.js er den samme som buildSite returnerer');
  assert.equal(precache[0], './');
  assert.ok(precache.every(p => !p.includes('cal/')));
});

test('to bygninger er byte-identiske; ændret indhold giver ny version, uændret samme', async () => {
  const again = join(tmp, 'site-again');
  const r2 = await buildSite({ outDir: again, warn: () => {} });
  assert.deepEqual(r2, built);
  assert.deepEqual(walk(again), walk(out));
  for (const f of walk(out)) assert.ok(read(out, f).equals(read(again, f)), f);

  const a = fakeAssets();
  const v1 = await buildSite({ outDir: join(tmp, 'v1'), assetsDir: a, warn: () => {} });
  const v1b = await buildSite({ outDir: join(tmp, 'v1b'), assetsDir: a, warn: () => {} });
  assert.deepEqual(v1b, v1);
  assert.ok(read(join(tmp, 'v1'), 'sw.js').equals(read(join(tmp, 'v1b'), 'sw.js')), 'uændret kilde giver uændret sw.js, så natbygget ikke udløser en opdatering');
  writeFileSync(join(a, 'icons', 'icon.svg'), 'ændret ikon');
  const v2 = await buildSite({ outDir: join(tmp, 'v2'), assetsDir: a, warn: () => {} });
  assert.notEqual(v2.version, v1.version);
  assert.notEqual(text(join(tmp, 'v2'), 'sw.js'), text(join(tmp, 'v1'), 'sw.js'));
});

test('buildSite rydder outDir først, og miljøvariabler (fx CAL_TOKEN) havner aldrig i outputtet', async () => {
  const dir = join(tmp, 'clean');
  mkdirSync(join(dir, 'gammelt'), { recursive: true });
  writeFileSync(join(dir, 'gammelt', 'rest.txt'), 'x');
  const token = 'tK3'.repeat(14);
  const prev = process.env.CAL_TOKEN;
  process.env.CAL_TOKEN = token;
  try {
    await buildSite({ outDir: dir, warn: () => {} });
  } finally { if (prev === undefined) delete process.env.CAL_TOKEN; else process.env.CAL_TOKEN = prev; }
  assert.ok(!existsSync(join(dir, 'gammelt')));
  for (const f of walk(dir)) if (!f.endsWith('.woff2') && !f.endsWith('.png')) assert.ok(!text(dir, f).includes(token), f);
});

// `ci` er en eksplicit indstilling, så de to første testene giver samme resultat uanset om hele testkørslen har CI=true.
test('manglende manifest/ikoner: advarsel uden ci, fejl med ci; manglende skrifter: altid fejl', async () => {
  const bare = fakeAssets({ manifest: false, icons: false });
  const warns = [];
  const r = await buildSite({ outDir: join(tmp, 'bare'), assetsDir: bare, warn: m => warns.push(m), ci: false });
  assert.ok(!r.precache.includes('manifest.webmanifest') && r.precache.some(p => p.startsWith('fonts/')));
  assert.match(warns.join('\n'), /manifest.*mangler/);
  assert.match(warns.join('\n'), /icons\/apple-touch-icon\.png/);
  await assert.rejects(buildSite({ outDir: join(tmp, 'bare-ci'), assetsDir: bare, warn: () => {}, ci: true }), /manifest/);
  await buildSite({ outDir: join(tmp, 'full-ci'), assetsDir: fakeAssets(), warn: () => {}, ci: true });
  for (const ci of [false, true]) {
    await assert.rejects(buildSite({ outDir: join(tmp, 'nofonts'), assetsDir: fakeAssets({ fonts: false }), warn: () => {}, ci }), /fonts\/Barlow-400\.woff2/);
  }

  const dangling = fakeAssets();
  writeFileSync(join(dangling, 'manifest.webmanifest'), JSON.stringify({ icons: [{ src: 'icons/findes-ikke.png' }] }));
  const w2 = [];
  await buildSite({ outDir: join(tmp, 'dangling'), assetsDir: dangling, warn: m => w2.push(m), ci: false });
  assert.match(w2.join('\n'), /findes-ikke\.png/);
  await assert.rejects(buildSite({ outDir: join(tmp, 'dangling-ci'), assetsDir: dangling, warn: () => {}, ci: true }), /findes-ikke\.png/);
});

test('ci følger som standard miljøet (CI=true), og en eksplicit værdi vinder over miljøet', async () => {
  const bare = fakeAssets({ manifest: false, icons: false });
  const build = (name, extra = {}) => buildSite({ outDir: join(tmp, name), assetsDir: bare, warn: () => {}, ...extra });
  await withCI('true', () => assert.rejects(build('env-ci'), /manifest/));
  await withCI(undefined, () => build('env-local'));
  await withCI('false', () => build('env-false'));
  await withCI('true', () => build('env-override', { ci: false }));
  await withCI(undefined, () => assert.rejects(build('env-override-ci', { ci: true }), /manifest/));
});

test('privatliv: vores egne filer indeholder hverken arbejdssteder eller klokkeslæt', () => {
  for (const f of ['src/shell.site.html', 'src/sw.js', 'src/pwa.js', 'src/pwa.css', 'src/fonts.css', 'build/site.mjs']) {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    assert.doesNotMatch(src, new RegExp(['d' + 'tu', 'symph' + 'ogen'].join('|'), 'i'), f);
    assert.doesNotMatch(src, /(?<![\w:])[0-2]?\d:[0-5]\d(?![\w])/, `${f}: klokkeslæt`);
  }
});

// ---- Service worker (src/sw.js) i vm ----

const SCOPE = 'https://example.test/ironman-2027/';
class FakeRequest {
  constructor(u, init = {}) { this.url = new URL(u, SCOPE + 'sw.js').href; this.cache = init.cache; this.method = init.method ?? 'GET'; this.mode = init.mode ?? 'no-cors'; }
}
function fakeCaches() {
  const stores = new Map();
  const make = () => ({
    items: new Map(), added: [],
    async addAll(reqs) { for (const r of reqs) { this.added.push(r); this.items.set(r.url, `indhold af ${r.url}`); } },
    async match(req, opts = {}) {
      let key = typeof req === 'string' ? req : req.url;
      if (opts.ignoreSearch) key = key.split('?')[0];
      return this.items.get(key);
    },
  });
  return { stores, async open(name) { if (!stores.has(name)) stores.set(name, make()); return stores.get(name); }, async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); } };
}
// Kører out/sw.js (eller en anden fil) i en sandkasse og returnerer hændelseslyttere og hjælpere.
function loadSw({ dir = out, network = async req => `net:${req.url}` } = {}) {
  const calls = [], listeners = {}, caches = fakeCaches();
  const self = {
    registration: { scope: SCOPE }, location: new URL(SCOPE + 'sw.js'),
    clients: { claim: async () => { calls.push('claim'); } }, skipWaiting: () => { calls.push('skipWaiting'); },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const sandbox = { self, caches, Request: FakeRequest, URL, fetch: network };
  const src = readFileSync(join(dir, 'sw.js'), 'utf8');
  vm.runInNewContext(src + '\nthis.CACHE_FOR_TEST = CACHE;', sandbox, { filename: 'sw.js' });
  const run = async (type, ev) => { const e = { waitUntil(p) { this.p = p; }, ...ev }; listeners[type](e); await e.p; return e; };
  const fetchEvent = req => {
    const e = { request: req, respondWith(p) { this.responded = p; } };
    listeners.fetch(e);
    return e;
  };
  return { calls, caches, listeners, run, fetchEvent, cacheName: () => sandbox.CACHE_FOR_TEST };
}
const get = (url, init = {}) => ({ url, method: 'GET', mode: 'no-cors', ...init });

test('sw install: precacher alt med cache:reload i im2027-shell-<version>, uden skipWaiting', async () => {
  const sw = loadSw();
  await sw.run('install');
  assert.equal(sw.cacheName(), `im2027-shell-${built.version}`);
  const cache = sw.caches.stores.get(sw.cacheName());
  assert.deepEqual(cache.added.map(r => r.url), built.precache.map(p => new URL(p, SCOPE).href));
  assert.ok(cache.added.every(r => r.cache === 'reload'));
  assert.ok(cache.added.every(r => !r.url.includes('/cal/')));
  assert.deepEqual(sw.calls, []);
});

test('sw activate: sletter kun gamle im2027-caches, beholder den nuværende og fremmede, og overtager siderne', async () => {
  const sw = loadSw();
  await sw.caches.open('im2027-shell-gammel');
  await sw.caches.open('im2027-andet-gammelt');
  await sw.caches.open('en-anden-app');
  await sw.run('install');
  await sw.run('activate');
  assert.deepEqual([...sw.caches.stores.keys()].sort(), ['en-anden-app', sw.cacheName()].sort());
  assert.deepEqual(sw.calls, ['claim']);
});

test('sw fetch: lader andet end same-origin GET i scope uden for sig (ingen respondWith) og rører aldrig kalenderfeedet', async () => {
  const sw = loadSw();
  await sw.run('install');
  for (const req of [
    get(SCOPE + 'index.html', { method: 'POST' }),
    get('https://api.github.com/gists/abc'),
    get('https://example.test/andet-projekt/app.js'),
    get(`${SCOPE}cal/${'x'.repeat(40)}/ironman-2027.ics`),
    get(`${SCOPE}cal/${'x'.repeat(40)}/ironman-2027.ics`, { mode: 'navigate' }),
  ]) assert.equal(sw.fetchEvent(req).responded, undefined, `${req.method} ${req.url}`);
});

test('sw fetch: navigationer får den cachede ./ (ignoreSearch) med netværket som reserve; resten er cache-first', async () => {
  const net = [];
  const sw = loadSw({ network: async req => { net.push(req.url); return `net:${req.url}`; } });
  await sw.run('install');
  assert.equal(await sw.fetchEvent(get(SCOPE + '?utm=1', { mode: 'navigate' })).responded, `indhold af ${SCOPE}`);
  assert.equal(await sw.fetchEvent(get(SCOPE + 'index.html', { mode: 'navigate' })).responded, `indhold af ${SCOPE}`, 'alle navigationer i scope får skallen');
  const js = built.precache.find(p => p.startsWith('app.'));
  assert.equal(await sw.fetchEvent(get(SCOPE + js)).responded, `indhold af ${SCOPE + js}`);
  net.length = 0;
  assert.equal(await sw.fetchEvent(get(SCOPE + 'noget-nyt.json')).responded, `net:${SCOPE}noget-nyt.json`);
  assert.deepEqual(net, [SCOPE + 'noget-nyt.json'], 'ingen runtime-caching: det hentes fra netværket hver gang');
  assert.equal(sw.caches.stores.get(sw.cacheName()).items.has(SCOPE + 'noget-nyt.json'), false);
  const cold = loadSw(); // før install: tom cache, så navigationen falder tilbage til netværket
  assert.equal(await cold.fetchEvent(get(SCOPE, { mode: 'navigate' })).responded, `net:${SCOPE}`);
});

test('sw message: kun SKIP_WAITING kalder skipWaiting', async () => {
  const sw = loadSw();
  sw.listeners.message({ data: { type: 'andet' } });
  sw.listeners.message({ data: null });
  assert.deepEqual(sw.calls, []);
  sw.listeners.message({ data: { type: 'SKIP_WAITING' } });
  assert.deepEqual(sw.calls, ['skipWaiting']);
});

// ---- PWA-laget (src/pwa.js) i vm med en minimal DOM ----

class El {
  constructor(tag) { Object.assign(this, { tag, children: [], attrs: {}, handlers: {}, parent: null, textContent: '', id: '', className: '' }); }
  append(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }
  click() { for (const f of this.handlers.click ?? []) f(); }
  find(pred) { for (const c of this.children) { if (pred(c)) return c; const d = c.find(pred); if (d) return d; } return null; }
}
const tick = () => new Promise(r => setTimeout(r, 5));
const plain = x => JSON.parse(JSON.stringify(x)); // objekter fra vm-konteksten har en anden Object.prototype

function loadPwa({ controller = {}, waiting = null, ua = 'Mozilla/5.0 (Macintosh)', standalone = false, store = {}, withSw = true } = {}) {
  const body = new El('body');
  const docH = {}, winH = {}, swH = {};
  const log = { register: [], update: 0, reload: 0, persist: 0 };
  let clock = 1_000_000;
  const reg = {
    waiting, installing: null, handlers: {},
    addEventListener(t, f) { (this.handlers[t] ??= []).push(f); },
    update: async () => { log.update++; },
  };
  const document = {
    body, readyState: 'complete', visibilityState: 'visible', openDialogs: [],
    createElement: tag => new El(tag),
    getElementById: id => body.find(e => e.id === id),
    querySelector(sel) { assert.equal(sel, 'dialog[open]'); return this.openDialogs[0] ?? null; },
    addEventListener: (t, f, capture) => { (docH[t] ??= []).push({ f, capture }); },
  };
  const navigator = {
    userAgent: ua, platform: 'MacIntel', maxTouchPoints: 0, standalone: standalone || undefined,
    storage: { persist: async () => { log.persist++; return true; } },
    ...(withSw ? { serviceWorker: { controller, register: async (url, opts) => { log.register.push([url, opts]); return reg; }, addEventListener: (t, f) => { swH[t] = f; } } } : {}),
  };
  const localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  const sandbox = {
    document, navigator, localStorage, console, Promise, setTimeout, Date: { now: () => clock },
    window: { addEventListener: (t, f) => { (winH[t] ??= []).push(f); }, matchMedia: () => ({ matches: standalone }) },
    matchMedia: () => ({ matches: standalone }),
    location: { reload: () => { log.reload++; } },
  };
  vm.runInNewContext(bundleJs(['src/pwa.js'], { target: 'site', version: 'test' }), sandbox, { filename: 'pwa.js' });
  return {
    body, reg, log, swH, store, document,
    toast: () => body.find(e => e.id === 'pwaUpdate'),
    hint: () => body.find(e => e.id === 'pwaHint'),
    buttons: el => el.children.filter(c => c.tag === 'button'),
    fire: (t, ev = {}) => (docH[t] ?? []).forEach(h => h.f(ev)),
    captured: t => (docH[t] ?? []).filter(h => h.capture).length,
    advance: ms => { clock += ms; },
  };
}
const waitingSw = () => ({ postMessage() {} });

test('pwa: registrerer sw.js med scope ./ og updateViaCache none, og beder om vedvarende lager', async () => {
  const p = loadPwa();
  await tick();
  assert.deepEqual(plain(p.log.register), [['sw.js', { scope: './', updateViaCache: 'none' }]]);
  assert.equal(p.log.persist, 1);
  assert.equal(p.toast(), null, 'ingen toast uden ny version');
});

test('pwa: uden service worker-understøttelse sker der intet (og intet fejler)', async () => {
  const p = loadPwa({ withSw: false });
  await tick();
  assert.deepEqual(p.log.register, []);
  assert.equal(p.toast(), null);
});

test('pwa: ventende version + eksisterende controller giver toast; trykket på Opdatér sender SKIP_WAITING, og siden genindlæses først ved controllerchange, én gang', async () => {
  const w = waitingSw();
  const p = loadPwa({ waiting: w });
  await tick();
  const toast = p.toast();
  assert.ok(toast);
  assert.equal(toast.attrs.role, 'status');
  assert.equal(toast.children[0].textContent, 'Ny version af planen er klar');
  const [update] = p.buttons(toast);
  assert.equal(update.textContent, 'Opdatér');
  const posted = [];
  w.postMessage = m => posted.push(m);
  assert.equal(p.log.reload, 0, 'aldrig automatisk genindlæsning');
  p.swH.controllerchange();
  assert.equal(p.log.reload, 0, 'controllerchange uden at brugeren har bedt om det genindlæser ikke');
  update.click();
  assert.deepEqual(plain(posted), [{ type: 'SKIP_WAITING' }]);
  assert.equal(p.log.reload, 0, 'først når den nye worker overtager');
  p.swH.controllerchange();
  p.swH.controllerchange();
  assert.equal(p.log.reload, 1);
});

test('pwa: første installation (ingen controller) viser ingen toast, selv om der er en ventende worker', async () => {
  const p = loadPwa({ controller: null, waiting: waitingSw() });
  await tick();
  assert.equal(p.toast(), null);
});

test('pwa: updatefound → installed viser toasten; krydset lukker den uden at opdatere', async () => {
  const p = loadPwa();
  await tick();
  const installing = { state: 'installing', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } };
  p.reg.installing = installing;
  p.reg.handlers.updatefound.forEach(f => f());
  installing.state = 'installed';
  p.reg.waiting = waitingSw();
  installing.handlers.statechange();
  const toast = p.toast();
  assert.ok(toast);
  p.buttons(toast)[1].click();
  assert.equal(p.toast(), null);
  assert.equal(p.log.reload, 0);
});

test('pwa: toasten venter, mens et ark er åbent, og vises når det lukkes (close fanges i capture-fasen)', async () => {
  const p = loadPwa({ waiting: waitingSw() });
  p.document.openDialogs = [{}];
  await tick();
  assert.equal(p.toast(), null);
  assert.ok(p.captured('close') >= 1, 'close bobler ikke og skal lyttes på i capture');
  p.document.openDialogs = [];
  p.fire('close');
  await tick();
  assert.ok(p.toast());
});

test('pwa: reg.update() ved synlighed, højst hvert 5. minut, og en fejl (offline) er stille', async () => {
  const p = loadPwa();
  await tick();
  p.fire('visibilitychange');
  assert.equal(p.log.update, 0, 'for tidligt');
  p.advance(5 * 60 * 1000 + 1);
  p.fire('visibilitychange');
  p.fire('visibilitychange');
  assert.equal(p.log.update, 1, 'throttlet');
  p.document.visibilityState = 'hidden';
  p.advance(10 * 60 * 1000);
  p.fire('visibilitychange');
  assert.equal(p.log.update, 1, 'ikke mens skjult');
  p.document.visibilityState = 'visible';
  p.reg.update = async () => { throw new TypeError('offline'); };
  p.fire('visibilitychange');
  await tick();
});

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
test('pwa: iOS Safari uden installation får tipet én gang; det kan afvises for altid', async () => {
  const p = loadPwa({ ua: IOS_SAFARI });
  const hint = p.hint();
  assert.ok(hint);
  assert.equal(hint.children[0].textContent, 'Tryk Del → Føj til hjemmeskærm');
  p.buttons(hint)[0].click();
  assert.equal(p.hint(), null);
  assert.equal(p.store['im2027-install-hint'], '1');
  assert.equal(loadPwa({ ua: IOS_SAFARI, store: p.store }).hint(), null, 'afvist: kommer ikke igen');
});

test('pwa: intet iOS-tip i den installerede app, i Chrome på iOS eller på skrivebordet', () => {
  assert.equal(loadPwa({ ua: IOS_SAFARI, standalone: true }).hint(), null);
  assert.equal(loadPwa({ ua: IOS_SAFARI.replace('Version/17.4', 'CriOS/120.0') }).hint(), null);
  assert.equal(loadPwa({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15' }).hint(), null);
});
