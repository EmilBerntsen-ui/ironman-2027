// GistStore mod en falsk Gist-API (test/fake-gist.mjs): intet rigtigt netværk, ingen rigtige tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EPOCH, FORMAT, GIST_DESCRIPTION, META_FILE, parseWeekFile } from '../src/progress.js';
import { GistStore } from '../src/store/gist.js';
import { LocalStore } from '../src/store/local.js';
import { TEST_LOGIN, TEST_TOKEN, createClock, createFakeGitHub, settle } from './fake-gist.mjs';

const GIST = '0123456789abcdef0123456789abcdef';
const META = { format: FORMAT, v: 2, kind: 'meta', start: '2026-10-26', createdAt: '2026-11-01T00:00:00.000Z' };
const makeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
};
const weekFile = (week, sessions) => JSON.stringify({ format: FORMAT, v: 2, week, sessions });
const entry = (updatedAt, dev, extra = {}) => ({ done: true, updatedAt, dev, ...extra });

function setup({ files = {}, fakeOpts } = {}) {
  const clock = createClock('2026-11-24T10:00:00.000Z');
  const fake = createFakeGitHub({ now: clock.now, ...fakeOpts });
  fake.addGist({ id: GIST, description: GIST_DESCRIPTION, files: { [META_FILE]: META, ...files } });
  return { clock, fake };
}
function device(ctx, dev, extra = {}) {
  const storage = extra.storage || makeStorage({ 'im2027-device': dev });
  const cfg = { token: extra.token || TEST_TOKEN, gistId: extra.gistId || GIST, login: TEST_LOGIN, connectedAt: '2026-11-20T00:00:00.000Z' };
  const store = new GistStore(cfg, {
    fetch: ctx.fake.fetch, storage, now: ctx.clock.now, setTimeout: ctx.clock.setTimeout, clearTimeout: ctx.clock.clearTimeout,
    random: () => 0.5, poll: false, win: null, locks: null, ...extra.deps,
  });
  return { store, storage };
}
const gistGets = fake => fake.requests.filter(r => r.method === 'GET' && r.path === `/gists/${GIST}`);
const patches = fake => fake.requests.filter(r => r.method === 'PATCH');
const sync = storage => JSON.parse(storage.getItem('im2027-gist-sync') || 'null');

test('konstruktøren afviser en ugyldig konfiguration', () => {
  const ctx = setup();
  for (const cfg of [null, {}, { token: 'x', gistId: GIST }, { token: TEST_TOKEN, gistId: '../x' }, { token: TEST_TOKEN, gistId: '' }]) {
    assert.throws(() => new GistStore(cfg, { fetch: ctx.fake.fetch, storage: makeStorage(), win: null, poll: false }), TypeError);
  }
});

test('readConfig/disconnect', () => {
  const s = makeStorage();
  assert.equal(GistStore.readConfig(s), null);
  s.setItem('im2027-gist', JSON.stringify({ token: TEST_TOKEN, gistId: GIST, login: 'testuser', connectedAt: '2026-11-20T00:00:00.000Z' }));
  assert.deepEqual(GistStore.readConfig(s), { token: TEST_TOKEN, gistId: GIST, login: 'testuser', connectedAt: '2026-11-20T00:00:00.000Z' });
  for (const bad of ['{', 'null', '[]', JSON.stringify({ token: TEST_TOKEN }), JSON.stringify({ token: TEST_TOKEN, gistId: 'a/b' }), JSON.stringify({ token: 'kort', gistId: GIST }), JSON.stringify({ token: 'a b c d e f g h i j k', gistId: GIST })]) {
    s.setItem('im2027-gist', bad);
    assert.equal(GistStore.readConfig(s), null, bad);
  }
  assert.equal(GistStore.readConfig({ getItem() { throw new Error('x'); } }), null);

  const t = makeStorage({ 'im2027-gist': '{}', 'im2027-gist-sync': '{}', 'im2027-progress-v2': '{"v":2,"weeks":{}}', 'im2027-progress': '{}', 'im2027-device': 'deva0001' });
  GistStore.disconnect(t);
  assert.deepEqual(t.keys().sort(), ['im2027-device', 'im2027-progress', 'im2027-progress-v2']);
  GistStore.disconnect(t, { wipeLocal: true });
  assert.deepEqual(t.keys().sort(), ['im2027-device', 'im2027-progress'], 'v1-nøglen og enhedens id røres aldrig');
});

// ---------------------------------------------------------------- connect

const connectDeps = ctx => ({ fetch: ctx.fake.fetch, storage: ctx.storage, now: ctx.clock.now });

test('connect: finder en eksisterende markør-gist og opretter ikke en ny', async () => {
  const ctx = { ...setup(), storage: makeStorage() };
  const r = await GistStore.connect(TEST_TOKEN, connectDeps(ctx));
  assert.deepEqual(r, { gistId: GIST, login: TEST_LOGIN, created: false });
  assert.equal(ctx.fake.count({ method: 'POST' }), 0);
  assert.deepEqual(GistStore.readConfig(ctx.storage), { token: TEST_TOKEN, gistId: GIST, login: TEST_LOGIN, connectedAt: '2026-11-24T10:00:00.000Z' });
  assert.deepEqual(sync(ctx.storage), { etag: null, dirty: [], lastSync: null });
});

test('connect: opretter en hemmelig gist med markørfilen når ingen findes', async () => {
  const clock = createClock();
  const fake = createFakeGitHub({ now: clock.now });
  fake.addGist({ id: 'f'.repeat(32), description: 'noget helt andet', files: { 'a.txt': 'x' } });
  const ctx = { clock, fake, storage: makeStorage() };
  const r = await GistStore.connect(TEST_TOKEN, connectDeps(ctx));
  assert.equal(r.created, true);
  assert.equal(r.login, TEST_LOGIN);
  const post = fake.requests.find(x => x.method === 'POST');
  assert.equal(post.body.public, false);
  assert.equal(post.body.description, GIST_DESCRIPTION);
  assert.deepEqual(Object.keys(post.body.files), [META_FILE]);
  assert.deepEqual(fake.fileJson(r.gistId, META_FILE), { format: FORMAT, v: 2, kind: 'meta', start: '2026-10-26', createdAt: '2026-11-24T10:00:00.000Z' });
  assert.equal(GistStore.readConfig(ctx.storage).gistId, r.gistId);
});

test('connect: ignorerer gists uden markørfil og med anden beskrivelse', async () => {
  const clock = createClock();
  const fake = createFakeGitHub({ now: clock.now });
  fake.addGist({ id: 'a'.repeat(32), description: GIST_DESCRIPTION, files: { 'u01.json': '{}' } });            // rigtig beskrivelse, ingen markør
  fake.addGist({ id: 'b'.repeat(32), description: 'Ironman 2027', files: { [META_FILE]: META } });              // markør, forkert beskrivelse
  const ctx = { clock, fake, storage: makeStorage() };
  const r = await GistStore.connect(TEST_TOKEN, connectDeps(ctx));
  assert.equal(r.created, true);
  assert.ok(r.gistId !== 'a'.repeat(32) && r.gistId !== 'b'.repeat(32));
});

test('connect: flere kandidater → nyeste updated_at vinder', async () => {
  const clock = createClock();
  const fake = createFakeGitHub({ now: clock.now });
  fake.addGist({ id: 'a'.repeat(32), description: GIST_DESCRIPTION, files: { [META_FILE]: META }, updated_at: '2026-11-01T00:00:00Z' });
  fake.addGist({ id: 'b'.repeat(32), description: GIST_DESCRIPTION, files: { [META_FILE]: META }, updated_at: '2026-11-20T00:00:00Z' });
  fake.addGist({ id: 'c'.repeat(32), description: GIST_DESCRIPTION, files: { [META_FILE]: META }, updated_at: '2026-11-10T00:00:00Z' });
  const r = await GistStore.connect(TEST_TOKEN, connectDeps({ clock, fake, storage: makeStorage() }));
  assert.equal(r.gistId, 'b'.repeat(32));
  assert.equal(r.created, false);
});

test('connect: følger Link-sider og finder gisten på side 3', async () => {
  const clock = createClock();
  const fake = createFakeGitHub({ now: clock.now, pageSize: 2 });
  for (let i = 0; i < 4; i++) fake.addGist({ id: String(i).repeat(32), description: 'decoy', files: { 'x.txt': 'x' }, updated_at: `2026-11-2${i}T00:00:00Z` });
  fake.addGist({ id: GIST, description: GIST_DESCRIPTION, files: { [META_FILE]: META }, updated_at: '2026-01-01T00:00:00Z' });
  const r = await GistStore.connect(TEST_TOKEN, connectDeps({ clock, fake, storage: makeStorage() }));
  assert.equal(r.gistId, GIST);
  assert.equal(fake.count(x => x.path === '/gists' && x.method === 'GET'), 3);
});

test('connect: et Link til en fremmed vært følges aldrig (tokenet forlader ikke api.github.com)', async () => {
  const clock = createClock();
  const fake = createFakeGitHub({ now: clock.now });
  fake.inject(r => r.path === '/gists' && r.method === 'GET', { status: 200, body: [], headers: { link: '<https://evil.example/gists?page=2>; rel="next"' } });
  await assert.rejects(() => GistStore.connect(TEST_TOKEN, connectDeps({ clock, fake, storage: makeStorage() })));
  assert.equal(fake.count(r => r.host !== 'api.github.com'), 0);
});

test('connect: 401 → "Tokenet blev afvist", og intet gemmes', async () => {
  const ctx = { ...setup(), storage: makeStorage() };
  await assert.rejects(() => GistStore.connect('github_pat_UNKNOWN0000000000', connectDeps(ctx)), e => e.code === 'auth' && e.message === 'Tokenet blev afvist');
  assert.deepEqual(ctx.storage.keys(), []);
});

test('connect: 403 ved gist-opslag → "Tokenet mangler Gists: Read and write"', async () => {
  const ctx = { ...setup(), storage: makeStorage() };
  ctx.fake.inject(r => r.path === '/gists' && r.method === 'GET', { status: 403, body: { message: 'Resource not accessible by personal access token' } });
  await assert.rejects(() => GistStore.connect(TEST_TOKEN, connectDeps(ctx)), e => e.message === 'Tokenet mangler Gists: Read and write');
  assert.deepEqual(ctx.storage.keys(), []);
});

test('connect: et token der ikke ligner et token afvises uden netværk', async () => {
  const ctx = { ...setup(), storage: makeStorage() };
  for (const t of ['', '   ', 'kort', 'har mellemrum i sig 123456', 'æøå'.repeat(10), null, undefined]) {
    await assert.rejects(() => GistStore.connect(t, connectDeps(ctx)), e => e.code === 'auth');
  }
  assert.equal(ctx.fake.requests.length, 0);
});

test('connect: manuelt gist-id springer opslaget over; kræver markørfilen', async () => {
  const ctx = { ...setup(), storage: makeStorage() };
  const r = await GistStore.connect(TEST_TOKEN, { ...connectDeps(ctx), gistId: GIST });
  assert.deepEqual(r, { gistId: GIST, login: TEST_LOGIN, created: false });
  assert.equal(ctx.fake.count(x => x.path === '/gists'), 0, 'ingen opslag');
  const other = ctx.fake.addGist({ id: 'e'.repeat(32), description: 'x', files: { 'a.txt': 'x' } });
  await assert.rejects(() => GistStore.connect(TEST_TOKEN, { ...connectDeps(ctx), gistId: other.id }), e => /ikke en Ironman 2027-log/.test(e.message));
  await assert.rejects(() => GistStore.connect(TEST_TOKEN, { ...connectDeps(ctx), gistId: 'd'.repeat(32) }), e => e.message === 'Gist ikke fundet');
  await assert.rejects(() => GistStore.connect(TEST_TOKEN, { ...connectDeps(ctx), gistId: '../../user' }), e => e.code === 'invalid');
});

test('connect: GitHub svarer med netværksfejl eller 5xx → forståelig fejl, intet gemt', async () => {
  const ctx = { ...setup(), storage: makeStorage() };
  ctx.fake.offline = true;
  await assert.rejects(() => GistStore.connect(TEST_TOKEN, connectDeps(ctx)), e => e.code === 'network' && /forbindelse/.test(e.message));
  ctx.fake.offline = false;
  ctx.fake.inject(r => r.path === '/user', { status: 503 });
  await assert.rejects(() => GistStore.connect(TEST_TOKEN, connectDeps(ctx)), e => e.code === 'server');
  assert.deepEqual(ctx.storage.keys(), []);
});

test('connect: lokale uger med pas markeres beskidte, og første flush fletter begge veje', async () => {
  const ctx = setup({ files: { 'u02.json': weekFile('u02', { '1-0': entry('2026-11-10T06:00:00.000Z', 'devx0001', { min: 33 }) }) } });
  const storage = makeStorage({ 'im2027-device': 'deva0001' });
  const local = new LocalStore({ storage, now: ctx.clock.now, win: null });
  local.save('u01', '0-0', { done: true, note: 'lokal' });
  local.save('u03', '2-0', { done: true });
  local.dispose();
  await GistStore.connect(TEST_TOKEN, { fetch: ctx.fake.fetch, storage, now: ctx.clock.now });
  assert.deepEqual(sync(storage), { etag: null, dirty: ['u01', 'u03'], lastSync: null });
  const store = new GistStore(GistStore.readConfig(storage), { fetch: ctx.fake.fetch, storage, now: ctx.clock.now, setTimeout: ctx.clock.setTimeout, clearTimeout: ctx.clock.clearTimeout, poll: false, win: null, locks: null });
  assert.equal(store.status.pending, 2);
  await store.syncNow();
  assert.deepEqual(Object.keys(store.snapshot()).sort(), ['u01', 'u02', 'u03']);
  assert.deepEqual(ctx.fake.fileNames(GIST), [META_FILE, 'u01.json', 'u02.json', 'u03.json']);
  assert.equal(patches(ctx.fake).length, 1, 'ét PATCH for begge uger');
  assert.deepEqual(Object.keys(patches(ctx.fake)[0].body.files).sort(), ['u01.json', 'u03.json']);
  assert.equal(store.status.pending, 0);
  store.dispose();
});

// ---------------------------------------------------------------- synk

test('save → debounce 1,5 s → én PATCH med kun den beskidte ugefil', async () => {
  const ctx = setup();
  const { store, storage } = device(ctx, 'deva0001');
  await store.load();
  store.save('u05', '1-0', { done: true, min: 42, rpe: 7, note: 'Tung i benene', sig: 'run:Løb' });
  assert.equal(store.status.state, 'syncing');
  assert.equal(store.status.pending, 1);
  await ctx.clock.advance(1499);
  assert.equal(ctx.fake.requests.length, 0, 'intet før debounce er udløbet');
  await ctx.clock.advance(1);
  assert.equal(patches(ctx.fake).length, 1);
  assert.deepEqual(Object.keys(patches(ctx.fake)[0].body.files), ['u05.json']);
  const file = ctx.fake.file(GIST, 'u05.json');
  assert.ok(file.startsWith('{"format":"ironman-2027-progress","v":2,"week":"u05","sessions":{\n"1-0":'));
  const parsed = parseWeekFile('u05.json', file);
  assert.deepEqual(parsed.week['1-0'], { done: true, updatedAt: '2026-11-24T10:00:00.000Z', dev: 'deva0001', at: '2026-11-24T10:00:00.000Z', min: 42, rpe: 7, note: 'Tung i benene', sig: 'run:Løb' });
  assert.equal(store.status.state, 'ready');
  assert.equal(store.status.pending, 0);
  assert.match(store.status.label, /^Synkroniseret kl\. \d\d:\d\d$/);
  assert.equal(sync(storage).dirty.length, 0);
  assert.equal(sync(storage).etag, null, 'efter en PATCH nulstilles ETag');
  store.dispose();
});

test('flere ændringer i samme batch giver én PATCH; debounce nulstilles ved hver ændring, men højst 10 s', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  await store.load();
  store.save('u05', '1-0', { done: true });
  await ctx.clock.advance(1000);
  store.save('u05', '1-1', { done: true });
  store.save('u06', '0-0', { done: true });
  await ctx.clock.advance(1000);
  assert.equal(patches(ctx.fake).length, 0, 'debounce er skubbet');
  await ctx.clock.advance(500);
  assert.equal(patches(ctx.fake).length, 1);
  assert.deepEqual(Object.keys(patches(ctx.fake)[0].body.files).sort(), ['u05.json', 'u06.json']);
  await ctx.clock.advance(5000); // det verificerende læs
  assert.equal(patches(ctx.fake).length, 1);
  // højst 10 s: bliv ved med at ændre hvert 1,4 s, så debounce aldrig udløber af sig selv
  const counts = [];
  for (let i = 0; i < 9; i++) { store.save('u07', `${i % 7}-0`, { done: true }); await ctx.clock.advance(1400); counts.push(patches(ctx.fake).length); }
  assert.deepEqual(counts.slice(0, 7), Array(7).fill(1), 'ingen flush de første 9,8 s');
  assert.equal(counts[7], 2, 'loftet på 10 s udløste en flush');
  store.dispose();
});

test('pull-merge-skriv pr. uge: fremmede pas i samme uge bevares, og andre ugefiler røres ikke', async () => {
  const other = entry('2026-11-20T06:00:00.000Z', 'devx0001', { min: 33, note: 'fra anden enhed' });
  const ctx = setup({ files: {
    'u05.json': weekFile('u05', { '1-1': other }),
    'u06.json': weekFile('u06', { '0-0': entry('2026-11-21T06:00:00.000Z', 'devx0001') }),
  } });
  const u06Before = ctx.fake.file(GIST, 'u06.json');
  const { store } = device(ctx, 'deva0001');
  await store.load();
  store.save('u05', '1-0', { done: true, min: 40 });
  await ctx.clock.advance(1500);
  const week = parseWeekFile('u05.json', ctx.fake.file(GIST, 'u05.json')).week;
  assert.deepEqual(Object.keys(week).sort(), ['1-0', '1-1']);
  assert.equal(week['1-1'].note, 'fra anden enhed');
  assert.deepEqual(Object.keys(patches(ctx.fake)[0].body.files), ['u05.json']);
  assert.equal(ctx.fake.file(GIST, 'u06.json'), u06Before, 'u06 uændret');
  assert.equal(store.snapshot().u06['0-0'].done, true, 'men modtaget lokalt');
  store.dispose();
});

test('ETag: næste pull er betinget og et 304 giver hverken parsing eller PATCH', async () => {
  const ctx = setup({ files: { 'u05.json': weekFile('u05', { '1-1': entry('2026-11-20T06:00:00.000Z', 'devx0001') }) } });
  const { store, storage } = device(ctx, 'deva0001');
  await store.syncNow();
  assert.ok(sync(storage).etag, 'ETag gemt');
  const first = gistGets(ctx.fake)[0];
  assert.equal(first.headers['if-none-match'], undefined);
  assert.equal(first.status, 200);
  await store.syncNow();
  const second = gistGets(ctx.fake)[1];
  assert.equal(second.headers['if-none-match'], sync(storage).etag);
  assert.equal(second.status, 304);
  assert.equal(patches(ctx.fake).length, 0);
  assert.equal(store.status.state, 'ready');
  store.dispose();
});

test('alle kald: cache no-store, rigtige headers, kun api.github.com, og tokenet lækker ikke', async () => {
  const ctx = setup();
  const { store, storage } = device(ctx, 'deva0001');
  await store.load();
  store.save('u05', '1-0', { done: true });
  await ctx.clock.advance(1500);
  await store.syncNow();
  assert.ok(ctx.fake.requests.length >= 3);
  for (const r of ctx.fake.requests) {
    assert.equal(r.host, 'api.github.com');
    assert.equal(r.cache, 'no-store');
    assert.equal(r.headers.authorization, `Bearer ${TEST_TOKEN}`);
    assert.equal(r.headers.accept, 'application/vnd.github+json');
    assert.equal(r.headers['x-github-api-version'], '2022-11-28');
  }
  assert.ok(!JSON.stringify(store.status).includes(TEST_TOKEN));
  assert.ok(!JSON.stringify(store.config).includes(TEST_TOKEN));
  assert.ok(!JSON.stringify(store.snapshot()).includes(TEST_TOKEN));
  assert.ok(!(storage.getItem('im2027-gist-sync') || '').includes(TEST_TOKEN));
  assert.ok(!ctx.fake.file(GIST, META_FILE).includes(TEST_TOKEN));
  store.dispose();
});

test('tabt opdatering: to enheder skriver samme uge i samme runde → begge konvergerer inden for 2 synkroniseringer', async () => {
  const ctx = setup();
  const A = device(ctx, 'deva0001'), B = device(ctx, 'devb0001');
  await A.store.load(); await B.store.load();
  A.store.save('u05', '1-0', { done: true, note: 'A' });
  ctx.clock.set('2026-11-24T10:00:01.000Z');
  B.store.save('u05', '1-1', { done: true, note: 'B' });
  ctx.clock.set('2026-11-24T10:00:02.000Z');

  // begge læser (gammel tilstand), derefter skriver begge: B overskriver A
  let seen = 0, open;
  const bothRead = new Promise(r => { open = r; });
  ctx.fake.before = async req => { if (req.method === 'GET' && req.path === `/gists/${GIST}`) { if (++seen === 2) open(); await bothRead; } };
  await Promise.all([A.store.syncNow(), B.store.syncNow()]);
  ctx.fake.before = null;
  assert.deepEqual(Object.keys(parseWeekFile('u05.json', ctx.fake.file(GIST, 'u05.json')).week), ['1-1'], 'forudsætning: A\'s ændring blev overskrevet på serveren');
  assert.equal(A.store.snapshot().u05['1-0'].note, 'A', 'A har den stadig lokalt');

  // anden synkronisering: det verificerende læs (4 s ± 1 s)
  const getsBefore = gistGets(ctx.fake).length;
  await ctx.clock.advance(5000);
  assert.equal(gistGets(ctx.fake).length - getsBefore, 2, 'ét verificerende læs pr. enhed');
  const server = parseWeekFile('u05.json', ctx.fake.file(GIST, 'u05.json')).week;
  assert.deepEqual(Object.keys(server).sort(), ['1-0', '1-1']);
  assert.deepEqual(A.store.snapshot(), B.store.snapshot());
  assert.equal(A.store.snapshot().u05['1-0'].note, 'A');
  assert.equal(B.store.snapshot().u05['1-1'].note, 'B');
  assert.equal(A.store.status.pending + B.store.status.pending, 0);
  A.store.dispose(); B.store.dispose();
});

test('gravsten: en fjernelse på A når B (og detaljerne er væk); en senere afkrydsning vinder igen', async () => {
  const ctx = setup();
  const A = device(ctx, 'deva0001'), B = device(ctx, 'devb0001');
  A.store.save('u05', '1-0', { done: true, min: 42, rpe: 6, note: 'hemmelig' });
  await A.store.syncNow();
  await B.store.syncNow();
  assert.equal(B.store.snapshot().u05['1-0'].note, 'hemmelig');

  ctx.clock.set('2026-11-24T10:05:00.000Z');
  A.store.save('u05', '1-0', null);
  await A.store.syncNow();
  assert.deepEqual(parseWeekFile('u05.json', ctx.fake.file(GIST, 'u05.json')).week['1-0'], { done: false, updatedAt: '2026-11-24T10:05:00.000Z', dev: 'deva0001' });
  await B.store.syncNow();
  assert.equal(B.store.snapshot().u05['1-0'].done, false);
  assert.equal(B.store.snapshot().u05['1-0'].note, undefined);

  ctx.clock.set('2026-11-24T10:10:00.000Z');
  B.store.save('u05', '1-0', { done: true, min: 50 });
  await B.store.syncNow();
  await A.store.syncNow();
  assert.equal(A.store.snapshot().u05['1-0'].done, true);
  assert.equal(A.store.snapshot().u05['1-0'].min, 50);
  A.store.dispose(); B.store.dispose();
});

test('en gammel afkrydsning kan ikke genoplive en nyere gravsten (heller ikke fra en enhed med skævt ur)', async () => {
  const ctx = setup({ files: { 'u05.json': weekFile('u05', { '1-0': { done: false, updatedAt: '2026-11-24T12:00:00.000Z', dev: 'devb0001' } }) } });
  const A = device(ctx, 'deva0001');
  // A har en ældre afkrydsning liggende lokalt og som beskidt
  const local = new LocalStore({ storage: A.storage, now: () => new Date('2026-11-24T09:00:00.000Z'), win: null });
  local.save('u05', '1-0', { done: true });
  local.dispose();
  const st = new GistStore({ token: TEST_TOKEN, gistId: GIST, login: '', connectedAt: null }, { fetch: ctx.fake.fetch, storage: A.storage, now: ctx.clock.now, setTimeout: ctx.clock.setTimeout, clearTimeout: ctx.clock.clearTimeout, poll: false, win: null, locks: null });
  await st.syncNow();
  assert.equal(st.snapshot().u05['1-0'].done, false);
  assert.equal(parseWeekFile('u05.json', ctx.fake.file(GIST, 'u05.json')).week['1-0'].done, false);
  st.dispose();
});

test('selvhelbredelse: mangler en ugefil på serveren, skrives den igen fra den lokale kopi', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  store.save('u05', '1-0', { done: true });
  await store.syncNow();
  ctx.fake.gist(GIST).files = { [META_FILE]: ctx.fake.gist(GIST).files[META_FILE] }; // nogen slettede u05.json
  ctx.fake.gist(GIST).rev++;
  await store.syncNow();
  assert.equal(ctx.fake.fileJson(GIST, 'u05.json').sessions['1-0'].done, true);
  store.dispose();
});

test('en ændring undervejs i en PATCH forbliver beskidt og sendes i næste flush', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  store.save('u05', '1-0', { done: true });
  let release;
  ctx.fake.before = async req => { if (req.method === 'PATCH') await new Promise(r => { release = r; }); };
  const running = store.syncNow();
  await settle();
  assert.ok(release, 'PATCH er undervejs');
  ctx.clock.set('2026-11-24T10:00:05.000Z');
  store.save('u05', '1-1', { done: true });  // samme uge, mens PATCH hænger
  ctx.fake.before = null;
  release();
  await running; await settle();
  assert.equal(store.status.pending, 1, 'ugen er stadig beskidt');
  await store.syncNow();
  assert.deepEqual(Object.keys(ctx.fake.fileJson(GIST, 'u05.json').sessions).sort(), ['1-0', '1-1']);
  assert.equal(store.status.pending, 0);
  store.dispose();
});

// ---------------------------------------------------------------- fejl og offline

test('offline: fetch afviser → state offline og pending > 0; tilbage online flushes kø og pending bliver 0', async () => {
  const ctx = setup();
  const { store, storage } = device(ctx, 'deva0001');
  await store.load();
  ctx.fake.offline = true;
  store.save('u05', '1-0', { done: true, note: 'offline' });
  await ctx.clock.advance(1500);
  assert.equal(store.status.state, 'offline');
  assert.equal(store.status.pending, 1);
  assert.equal(store.status.label, 'Offline · 1 uge venter');
  assert.equal(sync(storage).dirty[0], 'u05', 'køen ligger i localStorage');
  store.save('u06', '0-0', { done: true });
  assert.equal(store.status.label, 'Offline · 2 uger venter');
  ctx.fake.offline = false;
  await ctx.clock.advance(60000); // backoff-timer og debounce udløber
  assert.equal(store.status.state, 'ready');
  assert.equal(store.status.pending, 0);
  assert.deepEqual(ctx.fake.fileNames(GIST), [META_FILE, 'u05.json', 'u06.json']);
  assert.equal(ctx.fake.fileJson(GIST, 'u05.json').sessions['1-0'].note, 'offline');
  store.dispose();
});

test('offline-kø overlever en genstart af appen (ny instans, samme lager)', async () => {
  const ctx = setup();
  const first = device(ctx, 'deva0001');
  ctx.fake.offline = true;
  first.store.save('u05', '1-0', { done: true });
  await first.store.syncNow();
  first.store.dispose();
  ctx.fake.offline = false;
  const second = device(ctx, 'deva0001', { storage: first.storage });
  assert.equal(second.store.status.pending, 1);
  await second.store.syncNow();
  assert.equal(second.store.status.pending, 0);
  assert.equal(ctx.fake.fileJson(GIST, 'u05.json').sessions['1-0'].done, true);
  second.store.dispose();
});

test('backoff: 2 s · 2ⁿ ± 20 %, højst 5 min, og nulstilles ved succes', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001', { deps: { random: () => 0.5 } });
  ctx.fake.offline = true;
  await store.syncNow();
  assert.deepEqual(ctx.clock.pending, [2000]);
  await ctx.clock.advance(2000);
  assert.deepEqual(ctx.clock.pending, [4000]);
  await ctx.clock.advance(4000);
  assert.deepEqual(ctx.clock.pending, [8000]);
  for (let i = 0; i < 10; i++) await ctx.clock.advance(ctx.clock.pending[0]);
  assert.deepEqual(ctx.clock.pending, [300000], 'loft på 5 min');
  ctx.fake.offline = false;
  await ctx.clock.advance(300000);
  assert.equal(store.status.state, 'ready');
  ctx.fake.offline = true;
  await store.syncNow();
  assert.deepEqual(ctx.clock.pending.filter(ms => ms <= 2400), [2000], 'tæller nulstillet');
  store.dispose();

  for (const [random, expected] of [[0, 1600], [1, 2400]]) {
    const c = setup();
    const d = device(c, 'deva0001', { deps: { random: () => random } });
    c.fake.offline = true;
    await d.store.syncNow();
    assert.deepEqual(c.clock.pending, [expected]);
    d.store.dispose();
  }
});

test('5xx og 409 (modstridig skrivning) → offline med backoff; ændringen bevares og gentages', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  store.save('u05', '1-0', { done: true });
  ctx.fake.inject(r => r.method === 'PATCH', { status: 409, body: { message: 'Conflict' } });
  await store.syncNow();
  assert.equal(store.status.state, 'offline');
  assert.equal(store.status.pending, 1);
  assert.equal(ctx.fake.file(GIST, 'u05.json'), undefined);
  await ctx.clock.advance(2000);
  assert.equal(store.status.state, 'ready');
  assert.equal(ctx.fake.fileJson(GIST, 'u05.json').sessions['1-0'].done, true);

  store.save('u06', '0-0', { done: true });
  ctx.fake.inject(r => r.method === 'GET', { status: 503 }, 2);
  await store.syncNow();
  assert.equal(store.status.state, 'offline');
  await ctx.clock.advance(2000);   // 2. 503
  assert.equal(store.status.state, 'offline');
  await ctx.clock.advance(4000);
  assert.equal(store.status.state, 'ready');
  assert.equal(ctx.fake.fileJson(GIST, 'u06.json').sessions['0-0'].done, true);
  store.dispose();
});

test('afbrudt/ugyldigt JSON-svar behandles som en midlertidig fejl', async () => {
  const ctx = setup();
  const real = ctx.fake.fetch;
  let first = true;
  const broken = async (...a) => { if (first) { first = false; return new Response('{"files": {', { status: 200 }); } return real(...a); };
  const s2 = device(ctx, 'devb0001', { deps: { fetch: broken } });
  await s2.store.syncNow();
  assert.equal(s2.store.status.state, 'offline');
  await ctx.clock.advance(2000);
  assert.equal(s2.store.status.state, 'ready');
  s2.store.dispose();
});

test('401: state auth, ingen yderligere anmodninger (heller ikke ved gem, timere eller syncNow), og køen bevares', async () => {
  const ctx = setup();
  const { store, storage } = device(ctx, 'deva0001', { token: 'github_pat_REVOKED00000000000' });
  store.save('u05', '1-0', { done: true });
  await ctx.clock.advance(1500);
  assert.equal(store.status.state, 'auth');
  assert.equal(store.status.label, 'Forbind GitHub igen');
  const n = ctx.fake.requests.length;
  assert.equal(n, 1);
  await store.syncNow(); await store.syncNow();
  store.save('u05', '1-1', { done: true });
  await ctx.clock.advance(3600e3);
  await store.syncNow();
  assert.equal(ctx.fake.requests.length, n);
  assert.equal(store.status.state, 'auth');
  assert.deepEqual(ctx.clock.pending, [], 'ingen timere kører');
  assert.deepEqual(sync(storage).dirty, ['u05'], 'ændringerne er stadig i køen');
  assert.equal(store.snapshot().u05['1-1'].done, true, 'og gemt lokalt');
  store.dispose();
});

test('401 midt i driften (token tilbagekaldt)', async () => {
  const tokens = { [TEST_TOKEN]: TEST_LOGIN };
  const ctx = setup({ fakeOpts: { tokens } });
  const { store } = device(ctx, 'deva0001');
  await store.syncNow();
  assert.equal(store.status.state, 'ready');
  delete tokens[TEST_TOKEN];
  store.save('u05', '1-0', { done: true });
  await ctx.clock.advance(1500);
  assert.equal(store.status.state, 'auth');
  store.dispose();
});

test('403 uden grænse-headers (manglende Gists-rettighed) → auth med forklaring', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  ctx.fake.inject(() => true, { status: 403, body: { message: 'Resource not accessible by personal access token' } });
  await store.syncNow();
  assert.equal(store.status.state, 'auth');
  assert.equal(store.status.detail, 'Tokenet mangler Gists: Read and write');
  store.dispose();
});

test('403 med x-ratelimit-remaining: 0 sender intet før x-ratelimit-reset', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  const reset = ctx.clock.ms() / 1000 + 600;
  ctx.fake.rateLimit = { remaining: 0, reset };
  store.save('u05', '1-0', { done: true });
  await ctx.clock.advance(1500);
  assert.equal(ctx.fake.requests.length, 1);
  assert.equal(store.status.state, 'offline');
  assert.match(store.status.label, /^Pause \(GitHub-grænse\) · 1 uge venter$/);
  await store.syncNow(); await store.syncNow();
  store.save('u05', '1-1', { done: true });
  await ctx.clock.advance(589e3);
  await store.syncNow();
  assert.equal(ctx.fake.requests.length, 1, 'ingenting sendt før nulstillingen');
  ctx.fake.rateLimit = null;
  await ctx.clock.advance(12e3);
  assert.ok(ctx.fake.requests.length > 1);
  assert.equal(store.status.state, 'ready');
  assert.equal(store.status.pending, 0);
  assert.deepEqual(Object.keys(ctx.fake.fileJson(GIST, 'u05.json').sessions).sort(), ['1-0', '1-1']);
  store.dispose();
});

test('retry-after respekteres; 429 uden headers pauser 60 s', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  ctx.fake.rateLimit = { remaining: 3, reset: 0, retryAfter: 120 };
  await store.syncNow();
  assert.equal(ctx.fake.requests.length, 1);
  ctx.fake.rateLimit = null;
  await ctx.clock.advance(119e3);
  await store.syncNow();
  assert.equal(ctx.fake.requests.length, 1);
  await ctx.clock.advance(2e3);
  assert.equal(ctx.fake.requests.length, 2);
  assert.equal(store.status.state, 'ready');

  ctx.fake.inject(r => r.method === 'GET', { status: 429, body: { message: 'slow down' } });
  await store.syncNow();
  const n = ctx.fake.requests.length;
  await ctx.clock.advance(59e3);
  await store.syncNow();
  assert.equal(ctx.fake.requests.length, n);
  await ctx.clock.advance(2e3);
  assert.equal(store.status.state, 'ready');
  store.dispose();
});

test('en urimelig x-ratelimit-reset blokerer højst et døgn-lignende loft (ca. 1 time)', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  ctx.fake.rateLimit = { remaining: 0, reset: ctx.clock.ms() / 1000 + 10 * 86400 };
  await store.syncNow();
  ctx.fake.rateLimit = null;
  await ctx.clock.advance(3700e3);
  assert.equal(store.status.state, 'ready');
  store.dispose();
});

test('404 → "Gist ikke fundet" (error, ingen automatisk gentagelse); 422 → error og køen bevares', async () => {
  const ctx = setup();
  const lost = device(ctx, 'deva0001', { gistId: 'c'.repeat(32) });
  lost.store.save('u05', '1-0', { done: true });
  await ctx.clock.advance(1500);
  assert.equal(lost.store.status.state, 'error');
  assert.equal(lost.store.status.detail, 'Gist ikke fundet');
  assert.equal(lost.store.status.label, 'Synkfejl – tryk for detaljer');
  assert.deepEqual(ctx.clock.pending, []);
  lost.store.dispose();

  const { store, storage } = device(ctx, 'devb0001');
  store.save('u05', '1-0', { done: true });
  ctx.fake.inject(r => r.method === 'PATCH', { status: 422, body: { message: 'Validation Failed' } });
  await ctx.clock.advance(1500);
  assert.equal(store.status.state, 'error');
  assert.deepEqual(sync(storage).dirty, ['u05']);
  assert.equal(store.status.pending, 1);
  await store.syncNow(); // en ny prøve lykkes
  assert.equal(store.status.state, 'ready');
  store.dispose();
});

// ---------------------------------------------------------------- import og validering

test('importProgress: v1-eksport fra Artifact (docs, map og tekst) → v2-ugefiler i gisten', async () => {
  const ctx = setup();
  const A = device(ctx, 'deva0001');
  const v1docs = { docs: [
    { id: 'u01', data: { done: { '0-0': true, '0-1': { at: '2026-10-27T05:30:00.000Z', min: 45, rpe: 6, note: 'fint' } }, updated: '2026-10-27T06:00:00.000Z' } },
    { id: 'u02', data: { done: { '1-0': true }, updated: '2026-11-03T06:00:00.000Z' } },
  ] };
  assert.deepEqual(await A.store.importProgress(v1docs), { changed: 3 });
  assert.equal(A.store.status.pending, 2);
  await A.store.syncNow();
  assert.equal(patches(ctx.fake).length, 1);
  assert.deepEqual(Object.keys(patches(ctx.fake)[0].body.files), ['u01.json', 'u02.json']);
  const u01 = ctx.fake.fileJson(GIST, 'u01.json');
  assert.equal(u01.format, FORMAT); assert.equal(u01.v, 2); assert.equal(u01.week, 'u01');
  assert.deepEqual(u01.sessions['0-0'], { done: true, updatedAt: EPOCH });
  assert.deepEqual(u01.sessions['0-1'], { done: true, updatedAt: '2026-10-27T05:30:00.000Z', at: '2026-10-27T05:30:00.000Z', min: 45, rpe: 6, note: 'fint' });
  // andre importformer
  assert.deepEqual(await A.store.importProgress(JSON.stringify({ u03: { done: { '2-0': true }, updated: 'x' } })), { changed: 1 });
  assert.deepEqual(await A.store.importProgress({ u04: { '3-0': { at: '2026-11-05T05:00:00.000Z' } } }), { changed: 1 });
  await A.store.syncNow();
  assert.deepEqual(ctx.fake.fileNames(GIST), [META_FILE, 'u01.json', 'u02.json', 'u03.json', 'u04.json']);
  // en anden enhed får dem
  const B = device(ctx, 'devb0001');
  await B.store.syncNow();
  assert.deepEqual(B.store.snapshot(), A.store.snapshot());
  A.store.dispose(); B.store.dispose();
});

test('importProgress: ukendt format afvises uden netværk; en import slår ikke nyere serverdata', async () => {
  const ctx = setup({ files: { 'u01.json': weekFile('u01', { '0-0': entry('2026-11-20T06:00:00.000Z', 'devx0001', { note: 'nyere på serveren' }) }) } });
  const A = device(ctx, 'deva0001');
  await assert.rejects(() => A.store.importProgress('{ikke json'));
  await assert.rejects(() => A.store.importProgress({ format: 'andet', v: 2 }));
  assert.equal(ctx.fake.requests.length, 0);
  await A.store.importProgress({ u01: { '0-0': { done: true, at: '2026-10-27T05:30:00.000Z', note: 'gammel import' } } });
  await A.store.syncNow();
  assert.equal(A.store.snapshot().u01['0-0'].note, 'nyere på serveren');
  assert.equal(ctx.fake.fileJson(GIST, 'u01.json').sessions['0-0'].note, 'nyere på serveren');
  A.store.dispose();
});

test('fjerndata valideres før de når tilstanden: ugyldige felter, filer og nøgler renses', async () => {
  const XSS = '<img src=x onerror=alert(1)>';
  const ctx = setup({ files: {
    'u05.json': weekFile('u05', {
      '1-0': { done: true, updatedAt: '2026-11-20T06:00:00.000Z', dev: 'devx0001', note: XSS, min: 99999, rpe: 11, evil: 'x'.repeat(500), extra: 'ok' },
      '9-9': { done: true, updatedAt: '2026-11-20T06:00:00.000Z' },
      '1-1': { done: 'ja' },
      '1-2': 'streng',
      '1-3': { done: true, updatedAt: 'ikke en dato', note: 'x'.repeat(5000) },
    }),
    'u06.json': 'ikke json',
    'u07.json': weekFile('u08', { '0-0': { done: true, updatedAt: '2026-11-20T06:00:00.000Z' } }), // forkert uge-id
    'u08.json': JSON.stringify({ format: 'andet', v: 2, sessions: {} }),
    'notes.txt': 'hej',
    'u1.json': weekFile('u1', {}),
  } });
  const { store } = device(ctx, 'deva0001');
  await store.syncNow();
  const p = store.snapshot();
  assert.deepEqual(Object.keys(p).sort(), ['u05']);
  assert.deepEqual(Object.keys(p.u05).sort(), ['1-0', '1-3']);
  assert.equal(p.u05['1-0'].note, XSS, 'rå tekst: UI\'et bruger textContent');
  assert.equal(p.u05['1-0'].min, undefined);
  assert.equal(p.u05['1-0'].rpe, undefined);
  assert.equal(p.u05['1-0'].evil, undefined);
  assert.equal(p.u05['1-0'].extra, 'ok');
  assert.equal(p.u05['1-3'].updatedAt, EPOCH);
  assert.equal(p.u05['1-3'].note.length, 1000);
  assert.equal(store.status.state, 'ready');
  store.dispose();
});

// ---------------------------------------------------------------- udløsere, låse, oprydning

function fakeWindow(visibility = 'visible') {
  const doc = Object.assign(new EventTarget(), { visibilityState: visibility });
  const win = Object.assign(new EventTarget(), { document: doc });
  return { win, doc };
}

test('udløsere (poll: true): ved indlæsning, hvert 60. s mens synlig, fokus/online/synlighed (throttle 10 s), aldrig mens skjult', async () => {
  const ctx = setup();
  const { win, doc } = fakeWindow();
  const { store } = device(ctx, 'deva0001', { deps: { poll: true, win } });
  await store.load();
  await settle();
  assert.equal(gistGets(ctx.fake).length, 1, 'synk ved indlæsning');

  await ctx.clock.advance(60000);
  assert.equal(gistGets(ctx.fake).length, 2, 'poll hvert 60. sekund');
  win.dispatchEvent(new Event('focus')); await settle();
  assert.equal(gistGets(ctx.fake).length, 2, 'fokus inden for 10 s throttles');
  await ctx.clock.advance(11000);
  win.dispatchEvent(new Event('focus')); await settle();
  assert.equal(gistGets(ctx.fake).length, 3);
  win.dispatchEvent(new Event('online')); await settle();
  assert.equal(gistGets(ctx.fake).length, 4, 'online ignorerer throttle');
  await ctx.clock.advance(11000);
  doc.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(gistGets(ctx.fake).length, 5, 'synlig igen');

  doc.visibilityState = 'hidden';
  const n = gistGets(ctx.fake).length;
  await ctx.clock.advance(130000);
  win.dispatchEvent(new Event('focus')); win.dispatchEvent(new Event('online')); await settle();
  assert.equal(gistGets(ctx.fake).length, n, 'aldrig mens skjult');

  doc.visibilityState = 'visible';
  await ctx.clock.advance(60000);
  assert.ok(gistGets(ctx.fake).length > n, 'poll genoptages');

  store.dispose();
  const m = ctx.fake.requests.length;
  win.dispatchEvent(new Event('focus')); win.dispatchEvent(new Event('online')); doc.dispatchEvent(new Event('visibilitychange'));
  await ctx.clock.advance(120000);
  assert.equal(ctx.fake.requests.length, m, 'dispose fjerner lyttere og timere');
  assert.deepEqual(ctx.clock.pending, []);
});

test('skjules siden med ventende ændringer, sendes de med det samme', async () => {
  const ctx = setup();
  const { win, doc } = fakeWindow();
  const { store } = device(ctx, 'deva0001', { deps: { poll: true, win } });
  await store.load(); await settle();
  store.save('u05', '1-0', { done: true });
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(patches(ctx.fake).length, 1);
  store.dispose();
});

test('Web Locks: hver synkronisering kører inde i navigator.locks (im2027-sync); uden/med fejlende låse virker det stadig', async () => {
  const ctx = setup();
  const calls = [];
  const locks = { request: async (name, fn) => { calls.push(name); return fn(); } };
  const { store } = device(ctx, 'deva0001', { deps: { locks } });
  store.save('u05', '1-0', { done: true });
  await store.syncNow();
  assert.ok(calls.length >= 1 && calls.every(n => n === 'im2027-sync'));
  assert.equal(ctx.fake.fileJson(GIST, 'u05.json').sessions['1-0'].done, true);
  store.dispose();

  const broken = device(ctx, 'devb0001', { deps: { locks: { request: async () => { throw new Error('SecurityError'); } } } });
  broken.store.save('u06', '0-0', { done: true });
  await broken.store.syncNow();
  assert.equal(ctx.fake.fileJson(GIST, 'u06.json').sessions['0-0'].done, true);
  broken.store.dispose();
});

test('samtidige syncNow-kald slås sammen, og kørsler er serialiserede', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  let inflight = 0, maxInflight = 0;
  ctx.fake.before = async () => { inflight++; maxInflight = Math.max(maxInflight, inflight); await settle(3); inflight--; };
  await Promise.all([store.syncNow(), store.syncNow(), store.syncNow(), store.syncNow()]);
  assert.equal(maxInflight, 1);
  assert.equal(gistGets(ctx.fake).length, 1, 'fire kald samme tick → én kørsel');
  store.dispose();
});

test('onStatus: lyttere får besked ved ændringer (og kun ved ændringer), og kan afmeldes', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  const seen = [];
  const off = store.onStatus(s => seen.push(`${s.state}:${s.pending}`));
  store.save('u05', '1-0', { done: true });
  await ctx.clock.advance(1500);
  assert.equal(seen[0], 'syncing:1');
  assert.equal(seen.at(-1), 'ready:0');
  const n = seen.length;
  off();
  store.save('u05', '1-1', { done: true });
  assert.equal(seen.length, n);
  store.dispose();
});

test('subscribe: lokale ændringer og indkomne fjernændringer giver besked; uændret pull gør ikke', async () => {
  const ctx = setup({ files: { 'u05.json': weekFile('u05', { '1-1': entry('2026-11-20T06:00:00.000Z', 'devx0001') }) } });
  const { store } = device(ctx, 'deva0001');
  let n = 0;
  store.subscribe(() => n++);
  await store.syncNow();
  assert.equal(n, 1, 'fjernændring');
  await store.syncNow();
  assert.equal(n, 1, '304: ingenting nyt');
  store.save('u05', '1-0', { done: true });
  assert.equal(n, 2, 'lokal ændring');
  store.dispose();
});

// ---------------------------------------------------------------- grænser uden headers, timeout, ødelagte 200-svar

const GIST_GET = r => r.method === 'GET' && r.path === `/gists/${GIST}`;

test('403 hvis besked nævner rate limit (uden headers) er en grænse med pause og backoff, ikke et manglende token-scope', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  await store.syncNow();
  assert.equal(store.status.state, 'ready');
  const msg = 'API rate limit exceeded for user ID 1234.';
  ctx.fake.inject(GIST_GET, { status: 403, body: { message: msg, documentation_url: 'https://docs.github.com/rest/overview/rate-limits-for-the-rest-api' } });
  await store.syncNow();
  assert.equal(store.status.state, 'offline', 'ikke auth');
  assert.match(store.status.label, /^Pause \(GitHub-grænse\)/);
  const n = ctx.fake.requests.length;
  await ctx.clock.advance(30e3); await store.syncNow();
  assert.equal(ctx.fake.requests.length, n, 'pause: intet sendes de første 60 s');
  await ctx.clock.advance(31e3);
  assert.equal(store.status.state, 'ready', 'prøver igen efter 60 s og lykkes');
  store.dispose();
});

test('sekundær grænse: gentagne svar uden dato giver stigende pause (60 s, 120 s, …), som nulstilles ved succes', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  const secondary = { status: 403, body: { message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' } };
  ctx.fake.inject(GIST_GET, secondary, 2);
  await store.syncNow();                       // 1. svar → pause 60 s
  assert.equal(store.status.state, 'offline');
  await ctx.clock.advance(61e3);               // forsøg 2 → igen en grænse → pause 120 s
  assert.equal(store.status.state, 'offline');
  const n = ctx.fake.requests.length;
  await ctx.clock.advance(100e3);
  assert.equal(ctx.fake.requests.length, n, 'stadig i pausen efter 100 s af de 120');
  await ctx.clock.advance(21e3);
  assert.equal(store.status.state, 'ready');
  ctx.fake.inject(GIST_GET, secondary, 1);     // nulstillet: næste grænse giver igen 60 s
  await store.syncNow();
  const m = ctx.fake.requests.length;
  await ctx.clock.advance(61e3);
  assert.ok(ctx.fake.requests.length > m);
  assert.equal(store.status.state, 'ready');
  store.dispose();
});

test('403 med rate limit-tekst uden JSON, og med retry-after, behandles også som grænse; andre 403 forbliver auth', async () => {
  const ctx = setup();
  const { store } = device(ctx, 'deva0001');
  ctx.fake.inject(GIST_GET, { status: 403, body: 'secondary RATE LIMIT hit' });
  await store.syncNow();
  assert.equal(store.status.state, 'offline');
  await ctx.clock.advance(61e3);
  assert.equal(store.status.state, 'ready');
  ctx.fake.inject(GIST_GET, { status: 403, body: { message: 'Forbidden' } });
  await store.syncNow();
  assert.equal(store.status.state, 'auth');
  store.dispose();
});

test('connect: 403 med rate limit-besked giver grænsefejl i stedet for "mangler Gists"', async () => {
  const ctx = { ...setup(), storage: makeStorage() };
  ctx.fake.inject(() => true, { status: 403, body: { message: 'You have exceeded a secondary rate limit.' } });
  await assert.rejects(GistStore.connect(TEST_TOKEN, connectDeps(ctx)), e => /grænse/.test(e.message) && !/Gists/.test(e.message));
  assert.equal(ctx.storage.getItem('im2027-gist'), null);
});

test('timeout: en hængende anmodning afbrydes (20 s som standard), giver offline med backoff og slipper låsen', async () => {
  const ctx = setup();
  const real = AbortSignal.timeout, asked = [];
  AbortSignal.timeout = ms => { asked.push(ms); return real.call(AbortSignal, 25); }; // standardværdien aflæses, men vi venter ikke 20 s
  try {
    let hang = true;
    const fetch = (url, init) => (hang
      ? new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
      : ctx.fake.fetch(url, init));
    let queue = Promise.resolve(), held = 0;
    const locks = { request: (name, fn) => { const run = queue.then(async () => { held++; try { return await fn(); } finally { held--; } }); queue = run.catch(() => {}); return run; } };
    const { store } = device(ctx, 'deva0001', { deps: { fetch, locks } });
    store.save('u05', '1-0', { done: true });
    await store.syncNow();                    // hænger kun, hvis anmodningen ikke har en tidsgrænse
    assert.deepEqual(asked, [20000]);
    assert.equal(held, 0, 'låsen er sluppet');
    assert.equal(store.status.state, 'offline');
    assert.equal(store.status.detail, 'GitHub svarede ikke i tide');
    assert.equal(store.status.pending, 1, 'ændringen ligger stadig i køen');
    hang = false;
    await ctx.clock.advance(3000);            // backoff 2 s ± 20 %
    assert.equal(store.status.state, 'ready');
    assert.equal(ctx.fake.fileJson(GIST, 'u05.json').sessions['1-0'].done, true);
    store.dispose();
  } finally { AbortSignal.timeout = real; }
});

test('timeout kan sættes (timeoutMs), og connect behandler en timeout som netværksfejl', async () => {
  const hung = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  const storage = makeStorage();
  await assert.rejects(GistStore.connect(TEST_TOKEN, { fetch: hung, storage, timeoutMs: 20 }), e => e.code === 'network' && /ikke i tide/.test(e.message));
  assert.equal(storage.getItem('im2027-gist'), null);
});

test('et 200-svar uden files er et ødelagt svar: det skrives ikke som en tom gist over, og intet lokalt bliver beskidt', async () => {
  const ctx = setup({ files: { 'u05.json': weekFile('u05', { '1-1': entry('2026-11-24T08:00:00.000Z', 'devb0001', { note: 'deres' }) }) } });
  const { store, storage } = device(ctx, 'deva0001');
  store.save('u04', '0-0', { done: true });  // lokalt: u04 (beskidt), og u05 findes kun hos gisten
  for (const body of [{ id: GIST }, { id: GIST, files: null }, { id: GIST, files: [] }, { id: GIST, files: 'x' }]) {
    ctx.fake.requests.length = 0;
    ctx.fake.inject(GIST_GET, { status: 200, body });
    await store.syncNow();
    assert.equal(store.status.state, 'offline', JSON.stringify(body));
    assert.equal(store.status.detail, 'Uventet svar fra GitHub (ingen filer)');
    assert.equal(patches(ctx.fake).length, 0, 'ingen PATCH ud fra et tomt billede af gisten');
    await ctx.clock.advance(400e3); // gennem backoffen; kun det indsprøjtede svar var dårligt, så næste forsøg lykkes
    assert.equal(store.status.state, 'ready');
    store.save('u04', '0-0', { done: true, note: `omgang ${patches(ctx.fake).length}` });
    await ctx.clock.advance(1500);
    assert.equal(ctx.fake.fileJson(GIST, 'u05.json').sessions['1-1'].note, 'deres', 'andre enheders uge er urørt');
  }
  assert.deepEqual(sync(storage).dirty, []);
  store.dispose();
});
