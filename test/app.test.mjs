// src/app.js kørt i vm med en falsk DOM (test/dom-harness.mjs): dagsskifte, start på LocalStore med skift til Artifact-databasen og
// tilgængelige navne på søjlerne. Datoen styres med et falsk ur (alle klokkeslæt er lokal tid, så testen er uafhængig af tidszone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { bundleJs } from '../build/bundle.mjs';
import { plan } from '../src/plan.js';
import { fakeDocument, fakeWindow, memoryStorage } from './dom-harness.mjs';
import { settle } from './fake-gist.mjs';

const SITE_FILES = ['src/plan.js', 'src/progress.js', 'src/store/local.js', 'src/settings.js', 'src/app.js'];
const ARTIFACT_FILES = ['src/plan.js', 'src/progress.js', 'src/store/local.js', 'src/store/artifact-db.js', 'src/settings.js', 'src/app.js'];

function loadApp({ target = 'site', now = '2026-11-02T10:00:00', claude, storage = memoryStorage() } = {}) {
  const clock = { t: new Date(now).getTime(), set(v) { this.t = new Date(v).getTime(); } };
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.t); }
    static now() { return clock.t; }
  }
  const doc = fakeDocument();
  const win = fakeWindow(doc, { claude });
  let reloads = 0;
  const sandbox = {
    document: doc, window: win, localStorage: storage, console, Promise, setTimeout, clearTimeout, queueMicrotask, Date: FakeDate,
    matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0, location: { reload() { reloads++; } }, confirm: () => true, URL, Blob,
  };
  vm.runInNewContext(bundleJs(target === 'artifact' ? ARTIFACT_FILES : SITE_FILES, { target, version: 'test' }), sandbox, { filename: 'app.bundle.js' });
  const $ = id => doc.getElementById(id);
  return { doc, win, clock, $, storage, reloads: () => reloads, dialog: () => doc.body.find(e => e.tag === 'dialog' && e.className.includes('settings')) };
}

const DAY_MS = 864e5;
const daysToRace = (from) => Math.round((new Date(2027, 7, 22) - new Date(new Date(from).setHours(0, 0, 0, 0))) / DAY_MS);
const weekOf = $ => /<span class="wn">Uge (\d+)<\/span>/.exec($('agenda').innerHTML)?.[1];

// ---- dagsskifte ----

test('dagsskifte: når siden bliver synlig igen på en ny dag, regnes i dag og denne uge om, og siden tegnes igen', () => {
  const app = loadApp({ now: '2026-11-02T10:00:00' }); // mandag i uge 2
  const { $, doc, clock } = app;
  assert.equal($('days').textContent, String(daysToRace('2026-11-02T10:00:00')));
  assert.match($('grid').innerHTML, /class="gw now" id="g-u02"/);
  assert.match($('grid').innerHTML, /I dag · 2\. nov\./);
  assert.equal(weekOf($), '2');

  clock.set('2026-11-10T07:30:00'); // tirsdag i uge 3: appen har ligget i baggrunden
  doc.fire('visibilitychange');
  assert.equal($('days').textContent, String(daysToRace('2026-11-10T07:30:00')));
  assert.match($('grid').innerHTML, /class="gw now" id="g-u03"/);
  assert.doesNotMatch($('grid').innerHTML, /class="gw now" id="g-u02"/);
  assert.match($('grid').innerHTML, /I dag · 10\. nov\./);
  assert.doesNotMatch($('grid').innerHTML, /I dag · 2\. nov\./);
  assert.equal(weekOf($), '3', 'man fulgte "denne uge", så ugevisningen følger med');
  assert.match($('agenda').innerHTML, /Denne uge/);
  assert.match($('agenda').innerHTML, /<div class="ag-day today">/);
  assert.match($('pmc').innerHTML, /I dag/);
});

test('dagsskifte: samme dag, skjult side og tidligere tidspunkt samme dag tegner ikke om', () => {
  const { $, doc, win, clock } = loadApp({ now: '2026-11-02T10:00:00' });
  $('grid').innerHTML = 'MARK';
  doc.fire('visibilitychange');
  win.fire('focus');
  win.fire('pageshow');
  clock.set('2026-11-02T23:59:00');
  doc.fire('visibilitychange');
  assert.equal($('grid').innerHTML, 'MARK', 'samme dato: intet tegnes om');
  clock.set('2026-11-05T09:00:00');
  doc.visibilityState = 'hidden';
  doc.fire('visibilitychange');
  assert.equal($('grid').innerHTML, 'MARK', 'mens siden er skjult sker der intet');
  doc.visibilityState = 'visible';
  doc.fire('visibilitychange');
  assert.notEqual($('grid').innerHTML, 'MARK');
  assert.match($('grid').innerHTML, /I dag · 5\. nov\./);
});

test('dagsskifte: pageshow og focus virker også, og en ugevisning man selv har valgt bliver stående', () => {
  for (const event of ['pageshow', 'focus']) {
    const { $, win, clock } = loadApp({ now: '2026-11-02T10:00:00' });
    $('prevWk').click();                       // man kigger på uge 1
    assert.equal(weekOf($), '1');
    clock.set('2026-11-10T09:00:00');
    win.fire(event);
    assert.match($('grid').innerHTML, /class="gw now" id="g-u03"/, event);
    assert.equal(weekOf($), '1', `${event}: den valgte uge bevares`);
    assert.equal($('days').textContent, String(daysToRace('2026-11-10T09:00:00')));
  }
});

test('dagsskifte: før planstart og efter løbet klemmes denne uge til planens ender', () => {
  const before = loadApp({ now: '2026-10-20T10:00:00' }); // før mandag 26. okt.
  assert.match(before.$('grid').innerHTML, /class="gw now" id="g-u01"/);
  assert.match(before.$('agenda').innerHTML, /Starter mandag/);
  before.clock.set('2026-10-26T06:00:00');
  before.doc.fire('visibilitychange');
  assert.match(before.$('agenda').innerHTML, /Denne uge/, 'planen er startet');
  before.clock.set('2027-09-01T06:00:00');
  before.doc.fire('visibilitychange');
  assert.match(before.$('grid').innerHTML, /class="gw now" id="g-u43"/);
  assert.equal(before.$('days').textContent, '0');
});

// ---- Artifact: start på LocalStore, skift når databasen er klar ----

function fakeDb() {
  const data = new Map(), listeners = new Set(), sets = [];
  const snap = () => ({ docs: [...data].map(([id, d]) => ({ id, exists: true, data: () => structuredClone(d) })), metadata: { fromCache: false } });
  return {
    data, sets,
    collection: () => ({ onSnapshot(ok) { listeners.add(ok); queueMicrotask(() => ok(snap())); return () => listeners.delete(ok); } }),
    doc: path => {
      const id = path.split('/')[1];
      return {
        async get() { return { id, exists: data.has(id), data: () => structuredClone(data.get(id)), metadata: { fromCache: false } }; },
        async set(v) { sets.push({ path, data: structuredClone(v) }); data.set(id, structuredClone(v)); for (const l of [...listeners]) l(snap()); },
      };
    },
  };
}
const firstSession = () => { const w = plan()[0]; for (let d = 0; d < 7; d++) for (let s = 0; s < w.days[d].length; s++) if (w.days[d][s].s !== 'rest') return `${w.id}-${d}-${s}`; };
const check = (app, key) => app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: key } } : null) } });

test('artifact: starter straks på LocalStore ("Forbinder…"), gemmer lokalt og skifter til databasen, når claude.use("db") er klar (efter længere tid)', async () => {
  const db = fakeDb();
  let resolveDb;
  const claude = { use: () => new Promise(r => { resolveDb = () => r(db); }) };
  const app = loadApp({ target: 'artifact', claude });
  await settle();
  assert.equal(app.$('savemode').textContent, 'Forbinder…', 'ventetiden er synlig');
  const key = firstSession();
  check(app, key);                                   // en afkrydsning mens databasen endnu ikke er klar
  const saved = JSON.parse(app.storage.getItem('im2027-progress-v2'));
  assert.equal(saved.weeks.u01[key.slice(4)].done, true, 'gemt lokalt med det samme');
  assert.equal(db.sets.length, 0);

  const dlg = app.dialog();
  app.$('savemode').click();                         // indstillinger åbnet, før databasen er klar
  assert.match(dlg.textContent, /Gemmes kun på denne enhed/);

  resolveDb();
  await settle();
  assert.equal(app.$('savemode').textContent, 'Gemmes på tværs af enheder');
  assert.equal(db.data.get('u01').sessions[key.slice(4)].done, true, 'ændringen fra ventetiden er sendt til databasen');
  assert.match(dlg.textContent, /Delt lager/, 'indstillingsdialogen følger med til den nye Store');
  assert.equal(app.doc.body.findAll(e => e.tag === 'dialog' && e.className.includes('settings')).length, 1, 'ingen ekstra dialog');

  check(app, key);                                   // nu gemmer en afkrydsning (fjernelse) direkte i databasen
  await settle();
  assert.equal(db.data.get('u01').sessions[key.slice(4)].done, false);
});

test('artifact: uden db-capability (eller når den svigter) bliver appen på LocalStore, og etiketten viser det', async () => {
  for (const claude of [undefined, { use: async () => null }, { use: () => { throw new Error('nej'); } }]) {
    const app = loadApp({ target: 'artifact', claude });
    await settle();
    assert.equal(app.$('savemode').textContent, 'Gemmes kun på denne enhed');
    check(app, firstSession());
    assert.ok(app.storage.getItem('im2027-progress-v2'));
  }
});

// ---- tilgængelighed ----

test('søjlerne har tilgængelige navne, der er identiske med den synlige tooltip-tekst', () => {
  const { $ } = loadApp();
  const html = $('bars').innerHTML;
  const groups = [...html.matchAll(/<g data-wk="(\d+)" tabindex="0" role="button" aria-label="([^"]+)"><title>([^<]+)<\/title>/g)];
  assert.equal(groups.length, 43);
  for (const [, wk, label, title] of groups) {
    assert.equal(label, title, `uge ${+wk + 1}: navn og tooltip er samme tekst`);
    assert.match(label, new RegExp(`^Uge ${+wk + 1}: \\d+,\\d timer, \\S`));
  }
});
