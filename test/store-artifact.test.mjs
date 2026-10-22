import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EPOCH } from '../src/progress.js';
import { ArtifactDbStore } from '../src/store/artifact-db.js';
import { createClock, settle } from './fake-gist.mjs';

const makeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
};

// Falsk `claude.use('db')`: collection('progress').onSnapshot, doc('progress/uNN').get/.set. Deler data mellem flere "enheder".
// Snapshots og get() bærer metadata.fromCache (styres med db.cache). `violations` samler get/set kaldt inde fra en snapshot-callback.
function fakeDb({ docs = {} } = {}) {
  const data = new Map(Object.entries(docs));
  const listeners = new Set();
  const sets = [], gets = [], violations = [];
  let inCallback = 0;
  const snap = fromCache => ({
    docs: [...data].map(([id, d]) => ({ id, exists: true, data: () => structuredClone(d) })),
    metadata: { fromCache: fromCache ?? db.cache, hasPendingWrites: false },
  });
  const notify = fromCache => {
    for (const l of [...listeners]) { inCallback++; try { l(snap(fromCache)); } finally { inCallback--; } }
  };
  const db = {
    data, sets, gets, violations, failNext: null, hold: null, cache: false,
    notify, // send et snapshot til alle lyttere nu: db.notify() (afgørende), db.notify(true) (fra cachen)
    collection: () => ({
      onSnapshot(ok) { listeners.add(ok); queueMicrotask(() => { inCallback++; try { ok(snap()); } finally { inCallback--; } }); return () => listeners.delete(ok); },
    }),
    doc: path => {
      const id = path.split('/')[1];
      return {
        async get() {
          if (inCallback) violations.push('get ' + path);
          gets.push(path);
          if (db.getFailNext) { const e = db.getFailNext; db.getFailNext = null; throw e; }
          return { id, exists: data.has(id), data: () => structuredClone(data.get(id)), metadata: { fromCache: db.cacheGets ?? db.cache } };
        },
        async set(v) {
          if (inCallback) violations.push('set ' + path);
          if (db.hold) await db.hold;
          if (db.failNext) { const e = db.failNext; db.failNext = null; throw e; }
          sets.push({ path, data: structuredClone(v) });
          data.set(id, structuredClone(v));
          notify();
        },
      };
    },
  };
  return db;
}
const claudeOf = db => ({ use: async name => (name === 'db' ? db : null) });
const T0 = '2026-11-24T08:00:00.000Z';
const open = async (db, { storage = makeStorage(), clock = createClock(T0) } = {}) => {
  const st = await ArtifactDbStore.open({ claude: claudeOf(db), storage, now: clock.now, win: null });
  await st.load();
  await settle();
  return st;
};

test('open: null uden db-capability, ved timeout og ved fejl', async () => {
  assert.equal(await ArtifactDbStore.open({ claude: undefined, win: null }), null);
  assert.equal(await ArtifactDbStore.open({ claude: {}, win: null }), null);
  assert.equal(await ArtifactDbStore.open({ claude: { use: async () => null }, win: null }), null);
  assert.equal(await ArtifactDbStore.open({ claude: { use: () => { throw new Error('nej'); } }, win: null }), null);
  assert.equal(await ArtifactDbStore.open({ claude: { use: () => new Promise(() => {}) }, timeoutMs: 20, win: null }), null);
  const st = await ArtifactDbStore.open({ claude: claudeOf(fakeDb()), storage: makeStorage(), win: null });
  assert.equal(st.kind, 'artifact');
  assert.deepEqual(st.status, { kind: 'artifact', state: 'ready', pending: 0, lastSync: null, label: 'Gemmes på tværs af enheder' });
  st.dispose();
});

test('læser v1-dokumenter {done:{…}, updated} og v2-dokumenter', async () => {
  const db = fakeDb({ docs: {
    u01: { done: { '0-0': true, '0-1': { at: '2026-10-27T05:30:00.000Z', min: 45, rpe: 6 } }, updated: '2026-10-27T06:00:00.000Z' },
    u02: { v: 2, sessions: { '1-0': { done: true, updatedAt: '2026-11-02T06:00:00.000Z', dev: 'other001', min: 30 }, '1-1': { done: false, updatedAt: '2026-11-02T07:00:00.000Z' } }, updated: '2026-11-02T07:00:00.000Z' },
  } });
  const st = await open(db);
  const p = st.snapshot();
  assert.deepEqual(p.u01['0-0'], { done: true, updatedAt: EPOCH });
  assert.deepEqual(p.u01['0-1'], { done: true, updatedAt: '2026-10-27T05:30:00.000Z', at: '2026-10-27T05:30:00.000Z', min: 45, rpe: 6 });
  assert.equal(p.u02['1-0'].min, 30);
  assert.equal(p.u02['1-1'].done, false);
  assert.equal(db.sets.length, 0, 'intet lokalt at skrive: v1-dokumenter opgraderes først ved redigering');
  st.dispose();
});

test('skriver v2-dokumenter {v:2, sessions, updated} pr. uge', async () => {
  const db = fakeDb();
  const st = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }) });
  st.save('u05', '1-0', { done: true, min: 42, sig: 'run:Løb' });
  await st.syncNow();
  assert.equal(db.sets.length, 1);
  const { path, data } = db.sets[0];
  assert.equal(path, 'progress/u05');
  assert.equal(data.v, 2);
  assert.equal(data.updated, T0);
  assert.deepEqual(data.sessions['1-0'], { done: true, updatedAt: T0, dev: 'deva0001', at: T0, min: 42, sig: 'run:Løb' });
  assert.equal(data.done, undefined, 'ikke det gamle v1-felt');
  assert.equal(st.status.state, 'ready');
  assert.equal(st.status.lastSync, T0);
  st.dispose();
});

test('en redigering af en uge med v1-dokument opgraderer dokumentet og bevarer de gamle pas', async () => {
  const db = fakeDb({ docs: { u01: { done: { '0-0': true }, updated: '2026-10-27T06:00:00.000Z' } } });
  const st = await open(db);
  st.save('u01', '0-1', { done: true });
  await st.syncNow();
  const d = db.data.get('u01');
  assert.equal(d.v, 2);
  assert.deepEqual(d.sessions['0-0'], { done: true, updatedAt: EPOCH });
  assert.equal(d.sessions['0-1'].done, true);
  st.dispose();
});

test('et snapshot taber aldrig ikke-synkroniserede lokale ændringer (og de sendes senere)', async () => {
  const db = fakeDb();
  const st = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }) });
  db.failNext = Object.assign(new Error('netværk'), { code: 'unavailable' });
  st.save('u05', '1-0', { done: true, note: 'min' }); // skrivningen fejler
  await settle();
  assert.equal(st.status.state, 'error');
  assert.equal(st.status.pending, 1);
  assert.equal(st.status.label, 'Kunne ikke gemme. Prøv igen om lidt.');
  // en anden enhed skriver et andet pas i samme uge: et snapshot rammer os
  db.data.set('u05', { v: 2, sessions: { '1-1': { done: true, updatedAt: '2026-11-24T07:00:00.000Z', dev: 'other001' } }, updated: 'x' });
  // trig et snapshot ved at skrive en anden uge via en tredje enhed
  const other = await open(db, { storage: makeStorage({ 'im2027-device': 'devb0001' }) });
  other.save('u09', '0-0', { done: true });
  await other.syncNow();
  await settle();
  const p = st.snapshot();
  assert.equal(p.u05['1-0'].note, 'min', 'lokal ændring bevaret');
  assert.equal(p.u05['1-1'].done, true, 'den andens ændring er kommet ind');
  assert.equal(p.u09['0-0'].done, true);
  // selvhelbredelse: snapshottet viste at databasen mangler vores pas, så det er skrevet
  await st.syncNow();
  const d = db.data.get('u05');
  assert.equal(d.sessions['1-0'].note, 'min');
  assert.equal(d.sessions['1-1'].done, true);
  assert.equal(st.status.state, 'ready');
  st.dispose(); other.dispose();
});

test('et ældre snapshot overskriver ikke en nyere lokal ændring; en nyere gravsten vinder', async () => {
  const clock = createClock(T0);
  const db = fakeDb({ docs: { u03: { v: 2, sessions: { '0-0': { done: true, updatedAt: '2026-11-24T06:00:00.000Z', dev: 'other001', note: 'gammel' } } } } });
  const st = await open(db, { clock });
  st.save('u03', '0-0', { done: true, note: 'ny' });
  await st.syncNow();
  assert.equal(st.snapshot().u03['0-0'].note, 'ny');
  assert.equal(db.data.get('u03').sessions['0-0'].note, 'ny');
  // en anden enhed fjerner afkrydsningen senere
  db.data.set('u03', { v: 2, sessions: { '0-0': { done: false, updatedAt: '2026-11-24T09:00:00.000Z', dev: 'other001' } } });
  const kick = await open(db, { storage: makeStorage({ 'im2027-device': 'devc0001' }) });
  kick.save('u09', '0-0', { done: true }); await kick.syncNow(); await settle(); // udløser snapshot hos alle
  assert.equal(st.snapshot().u03['0-0'].done, false);
  st.dispose(); kick.dispose();
});

test('to enheder: afkrydsning og fjernelse (gravsten) når den anden', async () => {
  const db = fakeDb();
  const clock = createClock(T0);
  const a = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }), clock });
  const b = await open(db, { storage: makeStorage({ 'im2027-device': 'devb0001' }), clock });
  a.save('u06', '2-0', { done: true, min: 50 });
  await a.syncNow(); await settle();
  assert.equal(b.snapshot().u06['2-0'].min, 50);
  clock.set('2026-11-24T08:05:00.000Z');
  a.save('u06', '2-0', null);
  await a.syncNow(); await settle();
  assert.equal(b.snapshot().u06['2-0'].done, false);
  assert.equal(db.data.get('u06').sessions['2-0'].done, false);
  a.dispose(); b.dispose();
});

test('en snapshot midt i en skrivning giver ingen tabt opdatering', async () => {
  const db = fakeDb();
  const clock = createClock(T0);
  const a = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }), clock });
  const b = await open(db, { storage: makeStorage({ 'im2027-device': 'devb0001' }), clock });
  let release; db.hold = new Promise(r => { release = r; });
  a.save('u07', '0-0', { done: true, note: 'a' }); // A's skrivning hænger
  await settle();
  db.hold = null;
  b.save('u07', '0-1', { done: true, note: 'b' }); // B skriver imens; A får snapshot med B's pas
  await settle();
  b.dispose(); // B kan ikke hjælpe bagefter: A skal selv rette op
  release(); // A's (forældede) skrivning lander bagefter og overskriver B's pas i databasen
  await a.syncNow(); await settle();
  const d = db.data.get('u07');
  assert.equal(d.sessions['0-0'].note, 'a');
  assert.equal(d.sessions['0-1'].note, 'b', 'A skrev igen, da B\'s pas var kommet ind');
  assert.equal(db.sets.filter(x => x.path === 'progress/u07').length, 3);
  a.dispose();
});

test('lokal v1-data (localStorage) migreres og skubbes op i databasen', async () => {
  const db = fakeDb();
  const storage = makeStorage({ 'im2027-progress': JSON.stringify({ u01: { '0-0': { at: '2026-10-27T05:30:00.000Z', min: 40 } } }) });
  const st = await open(db, { storage });
  await st.syncNow();
  assert.equal(db.data.get('u01').v, 2);
  assert.equal(db.data.get('u01').sessions['0-0'].min, 40);
  st.dispose();
});

test('invalid_argument (ingen skriverettigheder) giver den kendte besked og beholder ændringen lokalt', async () => {
  const db = fakeDb();
  const st = await open(db);
  const seen = [];
  st.onStatus(s => seen.push(s.state));
  db.failNext = Object.assign(new Error('nej'), { code: 'invalid_argument' });
  st.save('u01', '0-0', { done: true });
  await st.syncNow();
  assert.equal(st.status.label, 'Du kan ikke gemme på denne side. Det gemmes kun i denne browser.');
  assert.equal(st.snapshot().u01['0-0'].done, true);
  assert.ok(seen.includes('syncing') && seen.includes('error'));
  await st.syncNow(); // prøver igen og lykkes
  assert.equal(st.status.state, 'ready');
  assert.equal(st.status.pending, 0);
  st.dispose();
});

test('importProgress (v1-eksport): merges lokalt og skrives som v2-dokumenter', async () => {
  const db = fakeDb();
  const st = await open(db);
  const r = await st.importProgress({ docs: [{ id: 'u01', data: { done: { '0-0': true, '0-1': { at: '2026-10-28T05:00:00.000Z', min: 35 } }, updated: 'x' } }] });
  assert.deepEqual(r, { changed: 2 });
  assert.equal(db.data.get('u01').v, 2);
  assert.equal(db.data.get('u01').sessions['0-1'].min, 35);
  await assert.rejects(() => st.importProgress('{ikke json'));
  st.dispose();
});

test('en fejl i snapshot-abonnementet giver en tydelig status', async () => {
  const db = fakeDb();
  let fail;
  db.collection = () => ({ onSnapshot(ok, err) { fail = err; return () => {}; } });
  const st = await open(db);
  fail(new Error('røg'));
  assert.equal(st.status.state, 'offline');
  assert.equal(st.status.label, 'Forbindelsen røg. Genindlæs siden.');
  st.dispose();
});

test('dispose afmelder snapshot-abonnementet', async () => {
  const db = fakeDb();
  const st = await open(db);
  st.dispose();
  db.data.set('u01', { v: 2, sessions: { '0-0': { done: true, updatedAt: T0 } } });
  // ingen lytter længere: kald et snapshot via en anden enhed
  const other = await open(db);
  other.save('u02', '0-0', { done: true }); await other.syncNow(); await settle();
  assert.deepEqual(st.snapshot(), {});
  other.dispose();
});

// ---- Skrivning: kun uden for snapshot-callbacks, kun efter afgørende snapshots, altid get → flet → set ----

const localBlob = weeks => ({ 'im2027-progress-v2': JSON.stringify({ v: 2, weeks }) });
const ENTRY = (extra = {}) => ({ done: true, updatedAt: '2026-11-24T07:30:00.000Z', dev: 'deva0001', ...extra });

test('selvhelbredelse skriver aldrig inde fra et snapshot-callback (hverken get eller set)', async () => {
  const db = fakeDb();
  const st = await open(db, { storage: makeStorage(localBlob({ u04: { '0-0': ENTRY() } })) });
  assert.equal(db.sets.length, 1, 'databasen manglede ugen, så den blev skrevet');
  assert.equal(db.data.get('u04').sessions['0-0'].done, true);
  st.save('u04', '0-1', { done: true });
  await st.syncNow(); await settle();
  assert.ok(db.sets.length >= 2);
  assert.deepEqual(db.violations, []);
  st.dispose();
});

test('et cache-snapshot merges ind lokalt, men udløser aldrig skrivning; først et afgørende snapshot skubber uger op', async () => {
  const db = fakeDb({ docs: { u02: { v: 2, sessions: { '1-0': ENTRY({ min: 30, dev: 'other001' }) } } } });
  db.cache = true;
  const st = await open(db, { storage: makeStorage(localBlob({ u04: { '0-0': ENTRY() } })) });
  assert.equal(st.snapshot().u02['1-0'].min, 30, 'cache-snapshottet er merget ind');
  assert.equal(db.gets.length + db.sets.length, 0, 'ingen læsning eller skrivning på baggrund af cachen');
  assert.equal(db.data.has('u04'), false);
  db.notify(true); await settle(); // endnu et cache-snapshot
  assert.equal(db.sets.length, 0);
  db.cache = false;
  db.notify(); await settle(); // serveren har talt: databasen mangler u04
  assert.equal(db.sets.length, 1);
  assert.equal(db.data.get('u04').sessions['0-0'].done, true);
  assert.equal(db.data.get('u02').sessions['1-0'].min, 30, 'andres uge er urørt');
  assert.deepEqual(db.violations, []);
  st.dispose();
});

test('et forældet cache-snapshot uden vores pas får ikke databasen overskrevet', async () => {
  const db = fakeDb();
  const st = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }) });
  st.save('u05', '1-0', { done: true, note: 'min' });
  await st.syncNow();
  const before = db.sets.length;
  db.data.set('u05', { v: 2, sessions: { '1-1': ENTRY({ dev: 'other001', note: 'deres' }) }, updated: 'x' }); // en anden enhed har skrevet
  const stale = db.data;                                                                                     // …men vi får kun et gammelt cache-snapshot
  db.data = new Map(); db.notify(true); db.data = stale; await settle();
  assert.equal(db.sets.length, before, 'ingen skrivning ud fra cachen');
  assert.equal(db.data.get('u05').sessions['1-1'].note, 'deres');
  st.dispose();
});

test('skrivning henter dokumentet først og fletter: en gået glip af ændring fra en anden enhed overskrives ikke', async () => {
  const db = fakeDb();
  const st = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }) });
  // en anden enhed skriver uge 5 uden at vi får snapshot (mistet besked)
  db.data.set('u05', { v: 2, sessions: { '1-1': ENTRY({ dev: 'other001', note: 'deres' }) }, updated: 'x' });
  st.save('u05', '1-0', { done: true, note: 'min' });
  await st.syncNow();
  assert.ok(db.gets.includes('progress/u05'));
  const d = db.data.get('u05');
  assert.equal(d.sessions['1-0'].note, 'min');
  assert.equal(d.sessions['1-1'].note, 'deres', 'ikke overskrevet, selv om vores kopi aldrig så den');
  assert.equal(st.snapshot().u05['1-1'].note, 'deres', 'og flettet ind i den lokale kopi');
  st.dispose();
});

test('skrivning: seneste updatedAt vinder pr. pas, og en nyere gravsten i databasen slår vores ældre afkrydsning', async () => {
  const clock = createClock(T0);
  const db = fakeDb();
  const st = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }), clock });
  db.failNext = Object.assign(new Error('netværk'), { code: 'unavailable' });
  st.save('u08', '0-0', { done: true, note: 'lokal' });   // fejler: ligger kun lokalt (updatedAt = T0)
  st.save('u08', '0-1', { done: true, note: 'lokal 2' });
  await settle();
  // imens har en anden enhed fjernet 0-0 senere (gravsten) og rettet 0-1 før vores version (ældre)
  db.data.set('u08', { v: 2, updated: 'x', sessions: {
    '0-0': { done: false, updatedAt: '2026-11-24T09:00:00.000Z', dev: 'other001' },
    '0-1': { done: true, updatedAt: '2026-11-24T07:00:00.000Z', dev: 'other001', note: 'gammel' },
  } });
  await st.syncNow();
  const d = db.data.get('u08').sessions;
  assert.equal(d['0-0'].done, false, 'gravstenen er nyere');
  assert.equal(d['0-1'].note, 'lokal 2', 'vores nyere ændring vinder');
  assert.equal(st.snapshot().u08['0-0'].done, false);
  st.dispose();
});

test('skrivning springer set over, når databasen allerede har det hele (ingen unødige skrivninger)', async () => {
  const db = fakeDb({ docs: { u06: { v: 2, sessions: { '0-0': ENTRY() }, updated: 'x' } } });
  const st = await open(db, { storage: makeStorage(localBlob({ u06: { '0-0': ENTRY() } })) });
  await st.syncNow(); await settle();
  assert.equal(db.sets.length, 0);
  assert.equal(st.status.state, 'ready');
  st.dispose();
});

test('get() fra cachen: flettes ind lokalt, men der skrives ikke; status er offline, og et afgørende snapshot sender ændringen', async () => {
  const db = fakeDb({ docs: { u05: { v: 2, sessions: { '1-1': ENTRY({ dev: 'other001', note: 'deres' }) }, updated: 'x' } } });
  const st = await open(db, { storage: makeStorage({ 'im2027-device': 'deva0001' }) });
  db.cacheGets = true;
  st.save('u05', '1-0', { done: true, note: 'min' });
  await st.syncNow(); await settle();
  assert.equal(db.sets.length, 0);
  assert.equal(st.status.state, 'offline');
  assert.equal(st.status.pending, 1);
  assert.equal(st.status.label, 'Offline. Sendes, når der er forbindelse.');
  assert.equal(st.snapshot().u05['1-0'].note, 'min');
  db.cacheGets = undefined;
  db.notify(); await settle(); // forbindelsen er tilbage og et afgørende snapshot ankommer
  assert.equal(db.data.get('u05').sessions['1-0'].note, 'min');
  assert.equal(db.data.get('u05').sessions['1-1'].note, 'deres');
  assert.equal(st.status.state, 'ready');
  assert.equal(st.status.pending, 0);
  st.dispose();
});

test('en fejl i get() giver fejlstatus og beholder ændringen; syncNow prøver igen', async () => {
  const db = fakeDb();
  const st = await open(db);
  db.getFailNext = Object.assign(new Error('nede'), { code: 'unavailable' });
  st.save('u01', '0-0', { done: true });
  await settle();
  assert.equal(st.status.state, 'error');
  assert.equal(db.sets.length, 0);
  await st.syncNow();
  assert.equal(st.status.state, 'ready');
  assert.equal(db.data.get('u01').sessions['0-0'].done, true);
  st.dispose();
});

test('get() der svarer med null (dokumentet findes ikke) skrives som nyt dokument', async () => {
  const db = fakeDb();
  const st = await open(db);
  db.doc = (orig => path => ({ ...orig(path), get: async () => null }))(db.doc);
  st.save('u02', '0-0', { done: true });
  await st.syncNow();
  assert.equal(db.data.get('u02').sessions['0-0'].done, true);
  st.dispose();
});

// ---- open(): 10 s, så app.js kan starte på LocalStore og skifte ----

test('open venter som standard op til 10 s på claude.use("db") og giver det til sidst op', async () => {
  assert.equal(ArtifactDbStore.OPEN_TIMEOUT_MS, 10000);
  const real = globalThis.setTimeout, delays = [];
  globalThis.setTimeout = (fn, ms, ...a) => { delays.push(ms); return real(fn, 0, ...a); }; // spol tiden frem: timeoutet udløser straks
  try {
    assert.equal(await ArtifactDbStore.open({ claude: { use: () => new Promise(() => {}) }, win: null }), null);
  } finally { globalThis.setTimeout = real; }
  assert.deepEqual(delays, [10000]);
});

test('open: et langsomt svar fra runtimen giver stadig en store', async () => {
  const db = fakeDb();
  const claude = { use: () => new Promise(r => setTimeout(() => r(db), 200)) };
  const st = await ArtifactDbStore.open({ claude, storage: makeStorage(), win: null });
  assert.equal(st.kind, 'artifact');
  st.dispose();
});
