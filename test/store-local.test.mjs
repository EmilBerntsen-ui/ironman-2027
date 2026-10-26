import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EPOCH, toExport } from '../src/progress.js';
import { LocalStore, deviceId } from '../src/store/local.js';

const makeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    raw: m,
  };
};
const clockAt = iso => { let t = Date.parse(iso); return { now: () => new Date(t), tick: ms => { t += ms; } }; };
const T0 = '2026-11-24T06:58:00.000Z';
const store = (storage, clock = clockAt(T0), extra = {}) => new LocalStore({ storage, now: clock.now, win: null, ...extra });

test('deviceId: 8 base36-tegn, oprettes én gang og genbruges', () => {
  const s = makeStorage();
  const a = deviceId(s);
  assert.match(a, /^[0-9a-z]{8}$/);
  assert.equal(deviceId(s), a);
  assert.equal(s.getItem('im2027-device'), a);
  assert.match(deviceId(makeStorage()), /^[0-9a-z]{8}$/);
  assert.notEqual(deviceId(makeStorage()), deviceId(makeStorage()));
  assert.equal(deviceId(makeStorage({ 'im2027-device': 'ABC DEF!' })).length, 8, 'ugyldig gemt værdi erstattes');
  assert.match(deviceId(null), /^[0-9a-z]{8}$/, 'uden lager virker det stadig');
});

test('grænsefladen: kind, status, load, snapshot, syncNow, dispose', async () => {
  const st = store(makeStorage());
  assert.equal(st.kind, 'local');
  assert.deepEqual(st.status, { kind: 'local', state: 'ready', pending: 0, lastSync: null, label: 'Gemmes kun på denne enhed' });
  assert.deepEqual(await st.load(), {});
  assert.deepEqual(st.snapshot(), {});
  await st.syncNow();
  assert.equal(typeof st.onStatus(() => {}), 'function');
  st.dispose();
});

test('save: stempler updatedAt/dev, gemmer {v:2,weeks}, og abonnenter får besked synkront', () => {
  const s = makeStorage({ 'im2027-device': 'deva0001' });
  const st = store(s);
  const seen = [];
  const off = st.subscribe(p => seen.push(p));
  st.save('u05', '1-0', { done: true, min: 42, rpe: 7, note: 'Tung i benene', sig: 'run:Løb' });
  assert.equal(seen.length, 1);
  const e = st.snapshot().u05['1-0'];
  assert.deepEqual(e, { done: true, updatedAt: T0, dev: 'deva0001', at: T0, min: 42, rpe: 7, note: 'Tung i benene', sig: 'run:Løb' });
  assert.deepEqual(JSON.parse(s.getItem('im2027-progress-v2')), { v: 2, weeks: { u05: { '1-0': e } } });
  off();
  st.save('u05', '1-1', { done: true });
  assert.equal(seen.length, 1, 'afmeldt');
});

test('save: gemte data genindlæses i en ny instans', () => {
  const s = makeStorage();
  const a = store(s);
  a.save('u01', '0-0', { done: true, min: 30 });
  const b = store(s);
  assert.deepEqual(b.snapshot(), a.snapshot());
});

test('save: afkrydsning fjernes med gravsten, detaljer droppes, og `at` bevares ved redigering', () => {
  const clock = clockAt(T0);
  const st = store(makeStorage({ 'im2027-device': 'deva0001' }), clock);
  st.save('u02', '2-0', { done: true, min: 40, note: 'x' });
  const first = st.snapshot().u02['2-0'];
  clock.tick(5000);
  st.save('u02', '2-0', { done: true, min: 45 });
  const edited = st.snapshot().u02['2-0'];
  assert.equal(edited.at, first.at, 'første gennemførelse bevares');
  assert.equal(edited.min, 45);
  assert.equal(edited.note, undefined, 'patch erstatter detaljerne');
  clock.tick(5000);
  st.save('u02', '2-0', null);
  assert.deepEqual(st.snapshot().u02['2-0'], { done: false, updatedAt: '2026-11-24T06:58:10.000Z', dev: 'deva0001' });
});

test('save: en redigering slår altid sin forgænger, også med skævt ur', () => {
  const clock = clockAt('2026-11-24T07:00:00.000Z');
  const st = store(makeStorage(), clock);
  st.save('u03', '0-0', { done: true });
  const t1 = st.snapshot().u03['0-0'].updatedAt;
  clock.tick(-3600e3); // uret går en time tilbage
  st.save('u03', '0-0', null);
  assert.ok(st.snapshot().u03['0-0'].updatedAt > t1);
});

test('save: ugyldige id\'er ignoreres, og save kaster aldrig', () => {
  const st = store(makeStorage());
  for (const [w, k] of [['x', '0-0'], ['u1', '0-0'], ['u01', '7-0'], ['u01', 'a'], [null, null], [undefined, '0-0']]) {
    assert.doesNotThrow(() => st.save(w, k, { done: true }));
  }
  assert.deepEqual(st.snapshot(), {});
  const boom = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {} };
  const st2 = store(boom);
  assert.doesNotThrow(() => st2.save('u01', '0-0', { done: true }));
  assert.equal(st2.snapshot().u01['0-0'].done, true, 'hukommelsen opdateres selv om lageret er fuldt');
  assert.doesNotThrow(() => store({ getItem: () => { throw new Error('blokeret'); }, setItem() { throw new Error('x'); }, removeItem() {} }));
});

test('en lytter der kaster vælter ikke save', () => {
  const st = store(makeStorage());
  st.subscribe(() => { throw new Error('lytter'); });
  const ok = [];
  st.subscribe(p => ok.push(p));
  assert.doesNotThrow(() => st.save('u01', '0-0', { done: true }));
  assert.equal(ok.length, 1);
});

test('migrerer v1-nøglen én gang og rører den aldrig', () => {
  const v1 = { u01: { '0-0': true, '0-1': { at: '2026-10-27T05:30:00.000Z', min: 45, rpe: 6, note: 'fint' } }, u02: { '1-0': true } };
  const s = makeStorage({ 'im2027-progress': JSON.stringify(v1) });
  const st = store(s);
  const p = st.snapshot();
  assert.deepEqual(p.u01['0-0'], { done: true, updatedAt: EPOCH });
  assert.deepEqual(p.u01['0-1'], { done: true, updatedAt: '2026-10-27T05:30:00.000Z', at: '2026-10-27T05:30:00.000Z', min: 45, rpe: 6, note: 'fint' });
  assert.deepEqual(p.u02['1-0'], { done: true, updatedAt: EPOCH });
  assert.equal(s.getItem('im2027-progress'), JSON.stringify(v1), 'v1-nøglen er urørt');
  assert.deepEqual(JSON.parse(s.getItem('im2027-progress-v2')).weeks, p, 'v2 er skrevet');
  // senere ændringer i v1-nøglen ignoreres: migrering sker kun én gang
  s.setItem('im2027-progress', JSON.stringify({ u09: { '0-0': true } }));
  assert.equal(store(s).snapshot().u09, undefined);
});

test('en redigering efter migreringen slår v1-data (v2 vinder over legacy)', () => {
  const s = makeStorage({ 'im2027-progress': JSON.stringify({ u01: { '0-0': true } }) });
  const st = store(s);
  st.save('u01', '0-0', null);
  assert.equal(st.snapshot().u01['0-0'].done, false);
  assert.equal(store(s).snapshot().u01['0-0'].done, false);
});

test('ødelagt v2-blob: tom start, men en kopi gemmes før den overskrives', () => {
  const s = makeStorage({ 'im2027-progress-v2': '{ikke json' });
  const st = store(s);
  assert.deepEqual(st.snapshot(), {});
  assert.equal(s.getItem('im2027-progress-v2-bad'), '{ikke json');
  st.save('u01', '0-0', { done: true });
  assert.equal(store(s).snapshot().u01['0-0'].done, true);
  assert.equal(s.getItem('im2027-progress-v2-bad'), '{ikke json');
});

test('ødelagt v1-blob migreres ikke og kaster ikke', () => {
  const s = makeStorage({ 'im2027-progress': 'garbage' });
  assert.deepEqual(store(s).snapshot(), {});
});

test('importProgress: v1-blob (objekt og tekst), v2-eksport og Artifact-dokumenter', async () => {
  const st = store(makeStorage());
  const v1 = { u01: { '0-0': true, '0-1': { at: '2026-10-27T05:30:00.000Z', min: 30 } } };
  assert.deepEqual(await st.importProgress(v1), { changed: 2 });
  assert.deepEqual(await st.importProgress(JSON.stringify(v1)), { changed: 0 }, 'idempotent');

  const exp = toExport({ u02: { '1-0': { done: true, updatedAt: '2026-11-01T06:00:00.000Z', dev: 'zzz', min: 50, note: 'v2' } } }, new Date('2026-11-02T00:00:00Z'));
  assert.deepEqual(await st.importProgress(exp), { changed: 1 });
  assert.equal(st.snapshot().u02['1-0'].note, 'v2');

  const docs = { docs: [{ id: 'u03', data: { done: { '2-0': true }, updated: '2026-11-03T00:00:00.000Z' } }] };
  assert.deepEqual(await st.importProgress(docs), { changed: 1 });
  assert.deepEqual(await st.importProgress([{ id: 'u03', data: { v: 2, sessions: { '2-1': { done: true, updatedAt: '2026-11-04T00:00:00.000Z' } }, updated: 'x' } }]), { changed: 1 });
  assert.equal(st.snapshot().u03['2-1'].done, true);
});

test('importProgress: LWW – ældre import overskriver ikke nyere lokale data, nyere gør', async () => {
  const clock = clockAt('2026-11-24T08:00:00.000Z');
  const st = store(makeStorage(), clock);
  st.save('u04', '0-0', { done: true, note: 'lokal' });
  const older = toExport({ u04: { '0-0': { done: true, updatedAt: '2026-11-24T07:00:00.000Z', dev: 'x', note: 'ældre' } } });
  assert.deepEqual(await st.importProgress(older), { changed: 0 });
  assert.equal(st.snapshot().u04['0-0'].note, 'lokal');
  const newer = toExport({ u04: { '0-0': { done: false, updatedAt: '2026-11-24T09:00:00.000Z', dev: 'x' } } });
  assert.deepEqual(await st.importProgress(newer), { changed: 1 });
  assert.equal(st.snapshot().u04['0-0'].done, false, 'nyere gravsten vinder');
});

test('importProgress: ukendt format afvises uden at ændre noget; ugyldige felter renses', async () => {
  const st = store(makeStorage());
  st.save('u01', '0-0', { done: true });
  const before = JSON.stringify(st.snapshot());
  await assert.rejects(() => st.importProgress('{ikke json'), SyntaxError);
  await assert.rejects(() => st.importProgress({ format: 'andet', v: 2 }), TypeError);
  await assert.rejects(() => st.importProgress([1, 2, 3]));
  assert.equal(JSON.stringify(st.snapshot()), before);
  await st.importProgress({ u01: { '0-1': { done: true, updatedAt: T0, min: 99999, rpe: 11, note: '<img src=x onerror=alert(1)>', evil: 'x'.repeat(500) }, 'ugyldig': true } });
  const e = st.snapshot().u01['0-1'];
  assert.equal(e.min, undefined);
  assert.equal(e.rpe, undefined);
  assert.equal(e.note, '<img src=x onerror=alert(1)>', 'note er bare tekst (UI\'et bruger textContent/esc)');
  assert.equal(e.evil, undefined);
  assert.equal(st.snapshot().u01.ugyldig, undefined);
});

test('abonnenter får besked ved import, men ikke når intet ændrer sig', async () => {
  const st = store(makeStorage());
  let n = 0;
  st.subscribe(() => n++);
  await st.importProgress({ u01: { '0-0': true } });
  await st.importProgress({ u01: { '0-0': true } });
  assert.equal(n, 1);
});

test('storage-hændelse fra en anden fane merges ind (aldrig erstat)', () => {
  const s = makeStorage();
  const listeners = {};
  const win = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
  const clock = clockAt(T0);
  const a = new LocalStore({ storage: s, now: clock.now, win });
  a.save('u01', '0-0', { done: true, note: 'a' });
  const b = new LocalStore({ storage: s, now: clock.now, win: null }); // "den anden fane"
  clock.tick(1000);
  b.save('u01', '0-1', { done: true });
  let n = 0;
  a.subscribe(() => n++);
  listeners.storage({ key: 'im2027-progress-v2', storageArea: s });
  assert.equal(n, 1);
  assert.equal(a.snapshot().u01['0-0'].note, 'a');
  assert.equal(a.snapshot().u01['0-1'].done, true);
  listeners.storage({ key: 'andet', storageArea: s });
  assert.equal(n, 1, 'andre nøgler ignoreres');
  a.dispose();
  assert.equal(listeners.storage, undefined, 'lytteren fjernes ved dispose');
});

test('uden localStorage (Node) falder LocalStore tilbage til hukommelsen', () => {
  const st = new LocalStore({ win: null });
  st.save('u01', '0-0', { done: true });
  assert.equal(st.snapshot().u01['0-0'].done, true);
});


test('save: en ekstra (x-<id>) stemples, gemmes og genindlæses som pas; en redigering og en sletning (gravsten) slår forgængeren', () => {
  const clock = clockAt(T0);
  const s = makeStorage({ 'im2027-device': 'deva0001' });
  const st = store(s, clock);
  const seen = [];
  st.subscribe(p => seen.push(p));
  assert.equal(st.save('u05', 'x-mh3k9a12', { day: 2, sport: 'run', min: 40, rpe: 6, note: 'Ekstra løb' }), true);
  const e = st.snapshot().u05['x-mh3k9a12'];
  assert.deepEqual(e, { day: 2, sport: 'run', min: 40, rpe: 6, note: 'Ekstra løb', source: 'manual', updatedAt: T0, dev: 'deva0001' });
  assert.equal(seen.length, 1, 'abonnenter får besked');
  assert.deepEqual(JSON.parse(s.getItem('im2027-progress-v2')).weeks.u05['x-mh3k9a12'], e);
  assert.deepEqual(store(s).snapshot(), st.snapshot(), 'en ny instans læser den tilbage');
  clock.tick(5000);
  st.save('u05', 'x-mh3k9a12', { day: 2, sport: 'run', min: 45 });
  assert.deepEqual(st.snapshot().u05['x-mh3k9a12'], { day: 2, sport: 'run', min: 45, source: 'manual', updatedAt: '2026-11-24T06:58:05.000Z', dev: 'deva0001' }, 'patch erstatter detaljerne');
  clock.tick(5000);
  st.save('u05', 'x-mh3k9a12', null);
  assert.deepEqual(st.snapshot().u05['x-mh3k9a12'], { deleted: true, updatedAt: '2026-11-24T06:58:10.000Z', dev: 'deva0001' });
  st.save('u05', '1-0', { done: true });
  assert.deepEqual(Object.keys(st.snapshot().u05).sort(), ['1-0', 'x-mh3k9a12'], 'ekstra og pas lever side om side');
});

test('save: en ugyldig ekstra gemmes ikke og kaster ikke; ugyldige ekstra-nøgler afvises', () => {
  const st = store(makeStorage());
  for (const patch of [{ day: 9, sport: 'run', min: 40 }, { day: 1, sport: 'yoga', min: 40 }, { day: 1, sport: 'run', min: 0 }, {}]) {
    assert.equal(st.save('u05', 'x-abc', patch), false);
  }
  for (const k of ['x-', 'x-ab', 'x-ABC', 'x-a b', 'y-abc']) assert.equal(st.save('u05', k, { day: 1, sport: 'run', min: 40 }), false, k);
  assert.deepEqual(st.snapshot(), {});
});

test('ekstra tages ind fra andre faner og fra import (merge pr. nøgle, nyeste vinder)', async () => {
  const s = makeStorage({ 'im2027-device': 'deva0001' });
  const st = store(s);
  st.save('u05', 'x-aaa', { day: 1, sport: 'bike', min: 30 });
  const other = store(makeStorage({ 'im2027-device': 'devb0001' }), clockAt('2026-11-24T08:00:00.000Z'));
  other.save('u05', 'x-aaa', { day: 1, sport: 'bike', min: 50 });
  other.save('u05', 'x-bbb', { day: 3, sport: 'swim', min: 25 });
  const r = await st.importProgress(JSON.parse(JSON.stringify(other.snapshot())));
  assert.equal(r.changed, 2);
  assert.equal(st.snapshot().u05['x-aaa'].min, 50);
  assert.equal(st.snapshot().u05['x-bbb'].sport, 'swim');
  assert.equal((await st.importProgress(other.snapshot())).changed, 0, 'idempotent');
});
