// scripts/strava-sync.mjs mod falske Gist- og Strava-API'er (node:http til CLI'en, en fetch-fake til enhedskald). Intet netværk, ingen rigtige tokens.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT, META_FILE, mergeWeek, parseAny, parseWeekFile, serializeWeek } from '../src/progress.js';
import { STATE_FILE, decryptToken, encryptToken, fingerprint, main, parseState, serializeState, syncStrava } from '../scripts/strava-sync.mjs';
import { listActivities, validBase, UsageError, matchActivities, pickActivity } from '../scripts/lib/strava.mjs';
import { plan } from '../src/plan.js';

const SCRIPT = fileURLToPath(new URL('../scripts/strava-sync.mjs', import.meta.url));
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/strava/${name}`, import.meta.url), 'utf8'));

const CLIENT_ID = '123456';
const CLIENT_SECRET = 'SYNTETISK-KLIENTHEMMELIGHED-0123456789abcdef';
const GIST_ID = 'abcdef0123456789abcdef0123456789';
const GIST_TOKEN = 'github_pat_SYNTETISK_SKRIVE_TOKEN_1234567890';
const TOK = { seed: fixture('token.json'), rot1: fixture('token-rotated.json'), rot2: fixture('token-rotated-2.json') };
const SEED = TOK.seed.refresh_token, ROT1 = TOK.rot1.refresh_token, ROT2 = TOK.rot2.refresh_token;
const NOW = new Date('2026-11-08T20:30:00Z'); // søndag aften; vinduet er 7 dage tilbage (1.–8. nov.)
const DECOYS = ['HEMMELIG', 'POLYLINE', '55.6761', '12.5683', '99887766'];
const ACTIVITY_IDS = fixture('activities-week2.json').map(a => String(a.id));
const ALL_SECRETS = [SEED, ROT1, ROT2, TOK.seed.access_token, TOK.rot1.access_token, TOK.rot2.access_token, CLIENT_SECRET, GIST_ID, GIST_TOKEN];

// ---- Falsk verden: Gist og Strava i hukommelsen. handle(side, req) er fælles for HTTP-serveren og fetch-faken. ----
function makeWorld() {
  const w = {
    requests: [],              // { side, method, path, query, headers, body }
    failures: [],              // { side, test(req), status, times, headers? }
    gist: { files: {}, onPatch: null },
    strava: { valid: new Set([SEED]), responses: [], access: null, pages: [fixture('activities-week2.json')], tokenCalls: [] },
    badHosts: [],
  };
  w.gist.files[META_FILE] = JSON.stringify({ format: FORMAT, v: 2, kind: 'meta', start: '2026-10-26' });
  const json = (status, body, headers = {}) => ({ status, body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

  w.handle = (side, { method, url, headers, body }) => {
    const req = { side, method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body };
    w.requests.push(req);
    const fail = w.failures.find(f => f.side === side && f.times > 0 && f.test(req));
    if (fail) { fail.times--; return json(fail.status, { message: 'HEMMELIG-FEJLTEKST' }, fail.headers); }
    if (side === 'gist') {
      if (headers.authorization !== `Bearer ${GIST_TOKEN}`) return json(401, { message: 'Bad credentials' });
      const m = /^\/gists\/([^/]+)$/.exec(url.pathname);
      if (!m || m[1] !== GIST_ID) return json(404, { message: 'Not Found' });
      if (method === 'GET') return json(200, { id: GIST_ID, files: Object.fromEntries(Object.entries(w.gist.files).map(([n, c]) => [n, { filename: n, truncated: false, content: c }])) });
      if (method === 'PATCH') {
        const files = JSON.parse(body).files;
        for (const [n, f] of Object.entries(files)) { if (f === null) delete w.gist.files[n]; else w.gist.files[n] = f.content; }
        const patchNo = w.requests.filter(r => r.side === 'gist' && r.method === 'PATCH').length;
        if (w.gist.onPatch) w.gist.onPatch(patchNo, files);
        return json(200, { id: GIST_ID, files: {} });
      }
      return json(404, { message: 'Not Found' });
    }
    // Strava
    if (method === 'POST' && url.pathname === '/oauth/token') {
      const p = new URLSearchParams(body);
      w.strava.tokenCalls.push(Object.fromEntries(p));
      if (p.get('client_id') !== CLIENT_ID || p.get('client_secret') !== CLIENT_SECRET || p.get('grant_type') !== 'refresh_token' || !w.strava.valid.has(p.get('refresh_token'))) {
        return json(400, { message: 'Bad Request', errors: [{ resource: 'RefreshToken', field: 'refresh_token', code: 'invalid' }] });
      }
      const used = p.get('refresh_token');
      const r = w.strava.responses.length ? w.strava.responses.shift() : { ...TOK.seed, refresh_token: used };
      if (r.refresh_token !== used) w.strava.valid.delete(used);
      w.strava.valid.add(r.refresh_token);
      w.strava.access = r.access_token;
      return json(200, r);
    }
    if (method === 'GET' && url.pathname === '/api/v3/athlete/activities') {
      if (headers.authorization !== `Bearer ${w.strava.access}`) return json(401, { message: 'Authorization Error' });
      return json(200, w.strava.pages[Number(url.searchParams.get('page')) - 1] ?? []);
    }
    return json(404, { message: 'Not Found' });
  };

  // fetch-fake: de rigtige standardadresser (api.github.com / www.strava.com) rutes til verdenen, alt andet er en fejl.
  w.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const side = url.host === 'api.github.com' ? 'gist' : url.host === 'www.strava.com' ? 'strava' : null;
    if (!side || url.protocol !== 'https:') { w.badHosts.push(url.host); throw new TypeError('fetch failed'); }
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const r = w.handle(side, { method: (init.method ?? 'GET').toUpperCase(), url, headers, body: init.body });
    return new Response(r.body, { status: r.status, headers: r.headers });
  };
  w.patches = () => w.requests.filter(r => r.side === 'gist' && r.method === 'PATCH').map(r => ({ ...r, files: JSON.parse(r.body).files }));
  w.count = (side, method) => w.requests.filter(r => r.side === side && (!method || r.method === method)).length;
  w.week = id => (w.gist.files[`${id}.json`] ? parseWeekFile(`${id}.json`, w.gist.files[`${id}.json`]).week : undefined);
  w.state = () => parseState(w.gist.files[STATE_FILE]);
  return w;
}

const seedState = (w, { token = SEED, base = SEED, seen = {} } = {}) => {
  w.gist.files[STATE_FILE] = serializeState({ rt: encryptToken(token, CLIENT_SECRET), base: fingerprint(base), seen });
};
const setWeek = (w, id, week) => { w.gist.files[`${id}.json`] = serializeWeek(id, week); };
const manual = (updatedAt, extra = {}) => ({ done: true, updatedAt, dev: 'k3f9a2c1', at: updatedAt, ...extra });

const baseEnv = (over = {}) => ({
  STRAVA_CLIENT_ID: CLIENT_ID, STRAVA_CLIENT_SECRET: CLIENT_SECRET, STRAVA_REFRESH_TOKEN: SEED, GIST_ID, GIST_WRITE_TOKEN: GIST_TOKEN, STRAVA_LOOKBACK_DAYS: '7', ...over,
});

// Enhedskald: syncStrava med verdenens fetch, uden ventetider. → { r, lines }
async function sync(w, { env = {}, dryRun = false, sleeps } = {}) {
  const lines = [];
  const r = await syncStrava({
    env: baseEnv(env), fetchImpl: w.fetch, sleep: async ms => { sleeps?.push(ms); }, delays: [1000, 4000], verifyWaitMs: 3000,
    now: () => NOW, dryRun, out: l => lines.push(l),
  });
  return { r, lines, text: lines.join('\n') };
}

// Ingen hemmeligheder, lokkefugle eller aktivitets-id'er i tekst der kan blive offentlig. `extra` = flere forbudte strenge.
function assertClean(text, label, extra = []) {
  const visible = text.split('\n').filter(l => !l.startsWith('::add-mask::')).join('\n');
  for (const s of [...ALL_SECRETS, ...DECOYS, ...ACTIVITY_IDS, ...extra]) assert.ok(!visible.includes(s), `${label}: "${s.slice(0, 12)}…" lækket`);
}

// ---- Falske HTTP-servere til CLI'en ----
let gistServer, stravaServer, world, tmp;
const origins = {};
function serve(side) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const r = world.handle(side, { method: req.method, url: new URL(req.url, 'http://x'), headers: req.headers, body: body || undefined });
      res.writeHead(r.status, r.headers);
      res.end(r.body);
    });
  });
}
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'im2027-strava-'));
  gistServer = serve('gist'); stravaServer = serve('strava');
  await Promise.all([gistServer, stravaServer].map(s => new Promise(r => s.listen(0, '127.0.0.1', r))));
  origins.gist = `http://127.0.0.1:${gistServer.address().port}`;
  origins.strava = `http://127.0.0.1:${stravaServer.address().port}`;
});
after(async () => {
  await Promise.all([gistServer, stravaServer].map(s => new Promise(r => { s.closeAllConnections?.(); s.close(r); })));
  rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => { world = makeWorld(); });

let outputSeq = 0;
function cli(args = [], vars = {}) {
  const outFile = join(tmp, `gh-output-${++outputSeq}`);
  const env = {
    PATH: process.env.PATH, TZ: 'Pacific/Auckland', GITHUB_OUTPUT: outFile, STRAVA_NOW: NOW.toISOString(), STRAVA_DELAYS_MS: '0,0', STRAVA_VERIFY_WAIT_MS: '0',
    GIST_API: origins.gist, STRAVA_API: `${origins.strava}/api/v3`, STRAVA_OAUTH: `${origins.strava}/oauth`, ...baseEnv(), ...vars,
  };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return new Promise(resolve => execFile(process.execPath, [SCRIPT, ...args], { env }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code : 0, stdout, stderr, status: existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() : null, text: stdout + stderr });
  }));
}

// ---- Skrivninger og rotation ----

test('CLI, glad vej: PATCH kun de ændrede ugefiler plus _strava.json, verify-GET, kun listekaldet mod Strava, status=ok', async () => {
  seedState(world);
  setWeek(world, 'u02', { '3-0': manual('2026-11-05T08:00:00.000Z', { min: 35, note: 'HEMMELIG-NOTE' }) });
  setWeek(world, 'u03', { '1-0': manual('2026-11-10T08:00:00.000Z') });
  const r = await cli();
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=ok');
  assert.match(r.stdout, /^Strava: 7 aktiviteter i vinduet · 6 nye pas · 0 genskabt · 0 optaget \(manuel\/fjernet\) · 1 uden plan$/m);
  const patches = world.patches();
  assert.equal(patches.length, 1, 'ét PATCH: ingen rotation');
  assert.deepEqual(Object.keys(patches[0].files).sort(), [STATE_FILE, 'u01.json', 'u02.json'], 'u03 og markørfilen røres ikke');
  assert.equal(world.count('gist', 'GET'), 2, 'hent + verify');
  assert.equal(world.count('strava', 'POST'), 1);
  assert.deepEqual(world.requests.filter(q => q.side === 'strava' && q.method === 'GET').map(q => q.path), ['/api/v3/athlete/activities'], 'ingen detalje-endpoints');
  const u02 = world.week('u02');
  assert.deepEqual(Object.keys(u02).sort(), ['1-1', '2-0', '3-0', '4-0', '5-0', '5-1']);
  assert.equal(u02['3-0'].note, 'HEMMELIG-NOTE', 'det manuelle pas er urørt (gisten er privat; noten må være der)');
  assert.equal(u02['4-0'].src, 'strava');
  assert.equal(u02['4-0'].dev, 'strava');
  assert.equal(u02['4-0'].updatedAt, '2026-11-06T12:32:00.000Z');
  assert.deepEqual(Object.keys(world.week('u01')), ['6-0']);
  assert.deepEqual(world.week('u03'), { '1-0': manual('2026-11-10T08:00:00.000Z') });
  const st = world.state();
  assert.deepEqual(Object.keys(st.seen).sort(), ACTIVITY_IDS.filter(id => id !== '11111111104' && id !== '11111111108').sort());
  assert.equal(st.seen['11111111101'].w, 'u02');
  assert.equal(decryptToken(st.rt, CLIENT_SECRET), SEED);
  assertClean(r.text, 'glad vej');
  // en anden kørsel: 0 skrivninger, 0 nye pas
  const again = await cli();
  assert.equal(again.code, 0, again.text);
  assert.match(again.stdout, /· 0 nye pas · 0 genskabt · 0 optaget \(manuel\/fjernet\) · 1 uden plan · 6 allerede hentet/);
  assert.equal(world.patches().length, 1, 'ingen nye skrivninger');
  assert.equal(world.count('gist', 'GET'), 3, 'kun den indledende hentning');
  assertClean(again.text, 'anden kørsel');
});

test('første kørsel uden _strava.json gemmer tokenet (ét PATCH med kun _strava.json) før aktiviteterne hentes', async () => {
  const { r, lines } = await sync(world);
  assert.equal(r.status, 'ok');
  const seq = world.requests.map(q => `${q.side}:${q.method}:${q.path}`);
  assert.deepEqual(seq.slice(0, 4), ['gist:GET:/gists/' + GIST_ID, 'strava:POST:/oauth/token', 'gist:PATCH:/gists/' + GIST_ID, 'strava:GET:/api/v3/athlete/activities']);
  assert.deepEqual(Object.keys(world.patches()[0].files), [STATE_FILE]);
  assert.ok(lines.some(l => l.startsWith('Strava: 7 aktiviteter')));
});

test('rotation: det nye token gemmes krypteret og dukker op på næste kørsel; en tabt rotation er ikke mulig, fordi den gemmes først', async () => {
  world.strava.responses.push(TOK.rot1);
  const first = await sync(world);
  assert.equal(first.r.status, 'ok');
  let st = world.state();
  assert.equal(decryptToken(st.rt, CLIENT_SECRET), ROT1);
  assert.equal(st.base, fingerprint(SEED));
  assert.ok(!world.gist.files[STATE_FILE].includes(ROT1), 'aldrig i klartekst');
  assert.ok(!world.gist.files[STATE_FILE].includes(CLIENT_SECRET));
  assert.ok(!world.strava.valid.has(SEED), 'Strava har dræbt det gamle token');
  // rotationen gemmes i et eget PATCH før aktiviteterne hentes, og ledgeren følger med i det sidste
  assert.deepEqual(world.patches().map(p => Object.keys(p.files).sort()), [[STATE_FILE], [STATE_FILE, 'u01.json', 'u02.json']]);
  assert.equal(decryptToken(parseState(world.patches()[1].files[STATE_FILE].content).rt, CLIENT_SECRET), ROT1, 'det sidste PATCH bevarer det roterede token');

  // næste kørsel sender det gemte token til Strava (seed'et er dødt) og roterer igen
  world.strava.responses.push(TOK.rot2);
  const second = await sync(world);
  assert.equal(second.r.status, 'ok', second.text);
  assert.deepEqual(world.strava.tokenCalls.map(c => c.refresh_token), [SEED, ROT1]);
  st = world.state();
  assert.equal(decryptToken(st.rt, CLIENT_SECRET), ROT2);
  assert.deepEqual(Object.keys(st.seen).length, 6, 'hovedbogen er bevaret');
  assertClean(first.text + second.text, 'rotation');
});

test('uændret token og uændrede data giver 0 gist-skrivninger (enheders ETags forbliver gyldige)', async () => {
  await sync(world);
  const before = world.patches().length;
  const again = await sync(world);
  assert.equal(again.r.status, 'ok');
  assert.equal(world.patches().length, before);
  assert.deepEqual(world.strava.tokenCalls.map(c => c.refresh_token), [SEED, SEED]);
});

test('en ny seed (base passer ikke): hemmeligheden bruges, ikke det gemte token, og tilstanden fornyes', async () => {
  seedState(world, { token: ROT1, base: SEED });   // gemt token nedstammer fra den gamle seed
  const NEW_SEED = 'SYNTETISKREFRESHTOKENNYSEED000000009';
  world.strava.valid = new Set([NEW_SEED]);        // efter en ny autorisation er kun den nye seed gyldig
  const { r } = await sync(world, { env: { STRAVA_REFRESH_TOKEN: NEW_SEED } });
  assert.equal(r.status, 'ok');
  assert.deepEqual(world.strava.tokenCalls.map(c => c.refresh_token), [NEW_SEED], 'kun ét kald, med den nye seed');
  const st = world.state();
  assert.equal(st.base, fingerprint(NEW_SEED));
  assert.equal(decryptToken(st.rt, CLIENT_SECRET), NEW_SEED);
});

test('et dødt gemt token: forsøg igen med hemmeligheden, og gem den friske tilstand', async () => {
  seedState(world, { token: ROT1, base: SEED });   // base passer, men ROT1 er ikke gyldigt hos Strava
  const { r } = await sync(world);
  assert.equal(r.status, 'ok');
  assert.deepEqual(world.strava.tokenCalls.map(c => c.refresh_token), [ROT1, SEED]);
  assert.equal(decryptToken(world.state().rt, CLIENT_SECRET), SEED, 'det døde token er erstattet');
  // en ulæselig (forkert nøgle) gemt tilstand behandles som ingen tilstand
  const w2 = makeWorld();
  w2.gist.files[STATE_FILE] = serializeState({ rt: encryptToken(ROT1, 'EN-ANDEN-NØGLE'), base: fingerprint(SEED), seen: {} });
  const r2 = await sync(w2);
  assert.equal(r2.r.status, 'ok');
  assert.deepEqual(w2.strava.tokenCalls.map(c => c.refresh_token), [SEED]);
  assert.equal(decryptToken(w2.state().rt, CLIENT_SECRET), SEED);
});

test('en korrupt eller fremmed _strava.json behandles som tom tilstand med en advarsel, og overskrives', async () => {
  for (const content of ['{ikke json', JSON.stringify({ format: 'andet', v: 1 }), JSON.stringify({ format: 'ironman-2027-strava', v: 2 })]) {
    const w = makeWorld();
    w.gist.files[STATE_FILE] = content;
    const { r, text } = await sync(w);
    assert.equal(r.status, 'ok');
    assert.match(text, /::warning::Strava-tilstanden i gisten kunne ikke læses/);
    assert.equal(w.state().base, fingerprint(SEED), 'overskrevet med gyldig tilstand');
    assert.equal(Object.keys(w.state().seen).length, 6);
  }
});

test('tilstandsfilen: rundtur, hovedbogen valideres, og felterne sorteres stabilt', () => {
  const rt = encryptToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', CLIENT_SECRET);
  const text = serializeState({ rt, base: fingerprint('x'), seen: { 22: { d: '2026-11-24', w: 'u05', k: '1-0' }, 11: { d: '2026-11-25', w: 'u05', k: '2-0' } } });
  assert.deepEqual(parseState(text), { rt, base: fingerprint('x'), seen: { 11: { d: '2026-11-25', w: 'u05', k: '2-0' }, 22: { d: '2026-11-24', w: 'u05', k: '1-0' } } });
  assert.equal(text, serializeState(parseState(text)));
  const dirty = parseState(JSON.stringify({ format: 'ironman-2027-strava', v: 1, rt: { iv: 1 }, base: 'ikke-hex', seen: { abc: { d: '2026-11-24', w: 'u05', k: '1-0' }, 5: { d: 'i går', w: 'u05', k: '1-0' }, 6: { d: '2026-11-24', w: '../x', k: '1-0' }, 7: { d: '2026-11-24', w: 'u05', k: '9-0' }, 8: { d: '2026-11-24', w: 'u05', k: '1-0' } } }));
  assert.deepEqual(dirty, { rt: null, base: null, seen: { 8: { d: '2026-11-24', w: 'u05', k: '1-0' } } });
  assert.equal(parseState('[]'), null);
});

test('kryptering: AES-256-GCM med nøgle fra klienthemmeligheden; rundtur, forkert nøgle, ændret data og tilfældig IV', () => {
  const token = 'SYNTETISKREFRESHTOKENKRYPTERINGSTEST1';
  const a = encryptToken(token, CLIENT_SECRET), b = encryptToken(token, CLIENT_SECRET);
  assert.deepEqual(Object.keys(a), ['iv', 'ct', 'tag']);
  for (const f of Object.values(a)) assert.match(f, /^[A-Za-z0-9_-]+$/, 'base64url');
  assert.equal(Buffer.from(a.iv, 'base64url').length, 12);
  assert.equal(Buffer.from(a.tag, 'base64url').length, 16);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
  assert.equal(decryptToken(a, CLIENT_SECRET), token);
  assert.equal(decryptToken(a, CLIENT_SECRET + 'x'), null);
  const flip = s => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  assert.equal(decryptToken({ ...a, ct: flip(a.ct) }, CLIENT_SECRET), null);
  assert.equal(decryptToken({ ...a, tag: flip(a.tag) }, CLIENT_SECRET), null);
  assert.equal(decryptToken({ ...a, iv: flip(a.iv) }, CLIENT_SECRET), null);
  for (const bad of [null, undefined, {}, { iv: 1, ct: 2, tag: 3 }, 'x', []]) assert.equal(decryptToken(bad, CLIENT_SECRET), null);
  assert.equal(encryptToken(token, CLIENT_SECRET, Buffer.alloc(12, 7)).iv, Buffer.alloc(12, 7).toString('base64url'));
  assert.equal(fingerprint('abc'), 'ba7816bf8f01cfea'); // sha256('abc') begynder med ba7816bf8f01cfea
});

// ---- Udfald og status ----

test('ikke sat op: ingen kald overhovedet, notice, status skipped, exit 0 (udrulningen fortsætter)', async () => {
  const none = { STRAVA_CLIENT_ID: '', STRAVA_CLIENT_SECRET: '', STRAVA_REFRESH_TOKEN: '', GIST_ID: '', GIST_WRITE_TOKEN: '' };
  for (const over of [none, { ...none, GIST_ID }, { ...none, GIST_ID, GIST_WRITE_TOKEN: GIST_TOKEN }]) {
    const r = await cli([], over);
    assert.equal(r.code, 0, r.text);
    assert.equal(r.status, 'status=skipped');
    assert.match(r.stdout, /^::notice::Strava er ikke sat op/m);
    assert.doesNotMatch(r.stdout, /::(warning|error)::/);
  }
  assert.equal(world.requests.length, 0);
  const unset = await cli([], Object.fromEntries(Object.keys(none).map(k => [k, undefined])));
  assert.equal(unset.status, 'status=skipped');
  assert.equal(world.requests.length, 0);
});

test('delvist sat op: advarsel med de manglende NAVNE (aldrig værdier), status skipped, intet kald', async () => {
  const cases = [
    [{ STRAVA_CLIENT_SECRET: '' }, ['STRAVA_CLIENT_SECRET']],
    [{ STRAVA_REFRESH_TOKEN: '   ' }, ['STRAVA_REFRESH_TOKEN']],
    [{ GIST_WRITE_TOKEN: '' }, ['GIST_WRITE_TOKEN']],
    [{ GIST_ID: '' }, ['GIST_ID']],
    [{ STRAVA_CLIENT_ID: '', GIST_ID: '', GIST_WRITE_TOKEN: '' }, ['STRAVA_CLIENT_ID', 'GIST_ID', 'GIST_WRITE_TOKEN']],
  ];
  for (const [over, names] of cases) {
    const r = await cli([], over);
    assert.equal(r.code, 0, r.text);
    assert.equal(r.status, 'status=skipped');
    const warning = r.stdout.split('\n').filter(l => l.startsWith('::warning::'));
    assert.equal(warning.length, 1);
    for (const n of names) assert.ok(warning[0].includes(n), `${n} i ${warning[0]}`);
    for (const n of ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN', 'GIST_ID', 'GIST_WRITE_TOKEN']) if (!names.includes(n)) assert.ok(!warning[0].includes(n), `${n} er sat og må ikke nævnes`);
    assertClean(r.text, JSON.stringify(over));
  }
  assert.equal(world.requests.length, 0);
  for (const bad of [{ GIST_ID: '../users' }, { GIST_ID: 'a b' }, { STRAVA_CLIENT_ID: 'abc' }, { STRAVA_CLIENT_ID: '1234567890123' }]) {
    const r = await cli([], bad);
    assert.equal(r.status, 'status=skipped', JSON.stringify(bad));
    assert.match(r.stdout, /::warning::/);
  }
  assert.equal(world.requests.length, 0);
});

test('Strava 503 tre gange: unavailable, exit 0, ingen pas-PATCH, og Gist-tilstanden er urørt', async () => {
  seedState(world);
  const stateBefore = world.gist.files[STATE_FILE];
  world.failures.push({ side: 'strava', test: q => q.path === '/oauth/token', status: 503, times: 99 });
  const r = await cli();
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=unavailable');
  assert.equal(world.strava.tokenCalls.length, 0);
  assert.equal(world.requests.filter(q => q.side === 'strava').length, 3, 'tre forsøg');
  assert.equal(world.patches().length, 0);
  assert.match(r.stdout, /::warning::Strava kunne ikke nås \(status 503\)/);
  assert.equal(world.gist.files[STATE_FILE], stateBefore);
  assertClean(r.text, '503');
});

test('Strava 503 på aktivitetslisten: unavailable og ingen pas-PATCH; et roteret token er allerede gemt', async () => {
  world.strava.responses.push(TOK.rot1);
  world.failures.push({ side: 'strava', test: q => q.path === '/api/v3/athlete/activities', status: 503, times: 99 });
  const { r, text } = await sync(world);
  assert.equal(r.status, 'unavailable');
  assert.deepEqual(world.patches().map(p => Object.keys(p.files)), [[STATE_FILE]], 'kun rotationen');
  assert.equal(decryptToken(world.state().rt, CLIENT_SECRET), ROT1);
  assert.equal(world.requests.filter(q => q.path === '/api/v3/athlete/activities').length, 3);
  assertClean(text, '503-liste');
});

test('forsøg: 503, 503, så 200 lykkes med ventetider 1 s og 4 s', async () => {
  seedState(world);
  world.failures.push({ side: 'strava', test: q => q.path === '/oauth/token', status: 503, times: 2 });
  const sleeps = [];
  const { r } = await sync(world, { sleeps });
  assert.equal(r.status, 'ok');
  assert.equal(world.requests.filter(q => q.path === '/oauth/token').length, 3);
  assert.deepEqual(sleeps.slice(0, 2), [1000, 4000]);
});

test('netværksfejl mod Strava genforsøges tre gange og giver unavailable; teksten rummer kun fejlkoden', async () => {
  seedState(world);
  let calls = 0;
  const fetchImpl = async (url, init) => {
    if (new URL(String(url)).host === 'www.strava.com') { calls++; throw Object.assign(new TypeError('fetch failed: https://www.strava.com/oauth/token'), { cause: { code: 'ECONNREFUSED' } }); }
    return world.fetch(url, init);
  };
  const lines = [];
  const r = await syncStrava({ env: baseEnv(), fetchImpl, now: () => NOW, out: l => lines.push(l), sleep: async () => {}, delays: [0, 0] });
  assert.equal(r.status, 'unavailable');
  assert.equal(calls, 3);
  assert.match(lines.join('\n'), /::warning::Strava kunne ikke nås \(netværksfejl\)/);
  assert.ok(!lines.join('\n').includes('oauth/token'), 'ingen URL i loggen');
  assert.equal(world.patches().length, 0);
});

test('Strava 429: ét forsøg, aldrig genforsøgt i kørslen; status unavailable', async () => {
  seedState(world);
  world.failures.push({ side: 'strava', test: () => true, status: 429, times: 99, headers: { 'retry-after': '900' } });
  const r = await cli();
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=unavailable');
  assert.equal(world.requests.filter(q => q.side === 'strava').length, 1);
  assert.match(r.stdout, /status 429/);
  // 429 på selve listen: også ét forsøg
  const w2 = makeWorld();
  seedState(w2);
  w2.failures.push({ side: 'strava', test: q => q.path === '/api/v3/athlete/activities', status: 429, times: 99 });
  const s = await sync(w2);
  assert.equal(s.r.status, 'unavailable');
  assert.equal(w2.requests.filter(q => q.path === '/api/v3/athlete/activities').length, 1);
});

test('refresh 400 (både gemt og seed dødt): status auth, advarsel om at køre strava-auth, exit 0, ingen pas-PATCH', async () => {
  seedState(world, { token: ROT1, base: SEED });
  world.strava.valid = new Set();
  const r = await cli();
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=auth');
  assert.match(r.stdout, /::warning::Strava-adgangen er udløbet eller tilbagekaldt – kør `node scripts\/strava-auth\.mjs`/);
  assert.deepEqual(world.strava.tokenCalls.map(c => c.refresh_token), [ROT1, SEED], 'gemt token, så seed (fallback)');
  assert.equal(world.patches().length, 0);
  assertClean(r.text, '400');
  // uden gemt token: ét forsøg
  const w2 = makeWorld();
  w2.strava.valid = new Set();
  const s = await sync(w2);
  assert.equal(s.r.status, 'auth');
  assert.equal(w2.strava.tokenCalls.length, 1);
  assert.doesNotMatch(s.text, /HEMMELIG-FEJLTEKST|Bad Request|invalid/, 'Stravas fejltekst gengives aldrig');
});

test('aktivitetslisten giver 401: status auth', async () => {
  world.failures.push({ side: 'strava', test: q => q.path === '/api/v3/athlete/activities', status: 401, times: 99 });
  const { r } = await sync(world);
  assert.equal(r.status, 'auth');
  assert.equal(world.patches().filter(p => Object.keys(p.files).some(f => /^u\d\d\.json$/.test(f))).length, 0);
});

test('rotationen kan ikke gemmes (PATCH fejler): status error, ::error::, og aktiviteterne hentes ikke', async () => {
  world.strava.responses.push(TOK.rot1);
  world.failures.push({ side: 'gist', test: q => q.method === 'PATCH', status: 503, times: 99 });
  const r = await cli();
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=error');
  assert.match(r.stdout, /::error::Strava-tokenet kunne ikke gemmes i gisten \(status 503\)/);
  assert.equal(world.requests.filter(q => q.method === 'PATCH').length, 3, 'tre forsøg');
  assert.equal(world.requests.filter(q => q.path === '/api/v3/athlete/activities').length, 0);
  assertClean(r.text, 'persistfejl');
});

test('pas-PATCH fejler (5xx tre gange): unavailable, intet bogført; 401 på PATCH: error', async () => {
  seedState(world);
  const stateBefore = world.gist.files[STATE_FILE];
  world.failures.push({ side: 'gist', test: q => q.method === 'PATCH', status: 503, times: 99 });
  const a = await sync(world);
  assert.equal(a.r.status, 'unavailable');
  assert.match(a.text, /::warning::Pas kunne ikke skrives til gisten \(status 503\)/);
  assert.equal(world.gist.files[STATE_FILE], stateBefore);
  assert.equal(world.week('u02'), undefined);
  const w2 = makeWorld(); seedState(w2);
  w2.failures.push({ side: 'gist', test: q => q.method === 'PATCH', status: 401, times: 99 });
  const b = await sync(w2);
  assert.equal(b.r.status, 'error');
  assert.equal(w2.requests.filter(q => q.method === 'PATCH').length, 1, '401 genforsøges ikke');
});

test('Gist 404 (forkert id eller token uden adgang): Strava kaldes IKKE, status error, exit 0', async () => {
  world.failures.push({ side: 'gist', test: () => true, status: 404, times: 99 });
  const r = await cli();
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=error');
  assert.equal(world.requests.filter(q => q.side === 'strava').length, 0, 'ingen Strava-kald uden et sted at gemme tokenet');
  assert.equal(world.count('gist'), 1, '404 genforsøges ikke');
  assert.match(r.stdout, /::error::Gisten kunne ikke hentes \(status 404\)/);
  assertClean(r.text, 'gist 404');
  const wrongId = await cli([], { GIST_ID: 'ffffffffffffffffffffffffffffffff' });
  assert.equal(wrongId.status, 'status=error');
  const badToken = await cli([], { GIST_WRITE_TOKEN: 'github_pat_FORKERT' });
  assert.equal(badToken.status, 'status=error');
  assert.equal(world.requests.filter(q => q.side === 'strava').length, 0);
});

test('Gist 503 tre gange eller en rate limit: Strava kaldes ikke, status unavailable', async () => {
  world.failures.push({ side: 'gist', test: () => true, status: 503, times: 99 });
  const r = await cli();
  assert.equal(r.status, 'status=unavailable');
  assert.equal(world.count('gist'), 3);
  assert.equal(world.count('strava'), 0);
  const w2 = makeWorld();
  w2.failures.push({ side: 'gist', test: () => true, status: 403, times: 99, headers: { 'x-ratelimit-remaining': '0' } });
  const s = await sync(w2);
  assert.equal(s.r.status, 'unavailable', 'rate limit er forbigående');
  assert.equal(w2.count('gist'), 3);
  assert.equal(w2.count('strava'), 0);
});

test('en gist uden markørfil afvises (forkert GIST_ID): status error, Strava kaldes ikke', async () => {
  delete world.gist.files[META_FILE];
  const { r, text } = await sync(world);
  assert.equal(r.status, 'error');
  assert.match(text, /::warning::Gisten er ikke en ironman-2027-gist/);
  assert.equal(world.count('strava'), 0);
});

test('en ulæselig ugefil blokerer kun den uge: advarsel (kun tal), andre uger skrives, filen røres ikke', async () => {
  seedState(world);
  world.gist.files['u02.json'] = '{ikke json';
  const { r, text } = await sync(world);
  assert.equal(r.status, 'ok');
  assert.match(text, /::warning::1 ugefil\(er\) i gisten kunne ikke læses/);
  assert.equal(world.gist.files['u02.json'], '{ikke json');
  assert.deepEqual(Object.keys(world.week('u01')), ['6-0']);
  assert.ok(!Object.keys(world.state().seen).some(id => world.state().seen[id].w === 'u02'), 'intet bogført for den blokerede uge');
  assert.match(text, /5 optaget/);
});

// ---- Tabt opdatering ----

test('tabt opdatering: en enhed overskriver ugen mellem vores PATCH og efterprøvelsen → runden gendanner begge redigeringer', async () => {
  seedState(world);
  setWeek(world, 'u02', { '3-0': manual('2026-11-05T08:00:00.000Z', { min: 35 }) });
  const deviceEdit = manual('2026-11-08T19:59:00.000Z', { min: 25 });
  world.gist.onPatch = (n, files) => {
    if (n === 1 && files['u02.json']) world.gist.files['u02.json'] = serializeWeek('u02', { '3-0': manual('2026-11-05T08:00:00.000Z', { min: 35 }), '3-1': deviceEdit }); // enhedens fletning uden vores pas
  };
  const sleeps = [];
  const { r, text } = await sync(world, { sleeps });
  assert.equal(r.status, 'ok');
  assert.doesNotMatch(text, /::warning::/);
  assert.equal(world.patches().length, 2, 'første PATCH + gendannelse');
  assert.deepEqual(Object.keys(world.patches()[1].files), ['u02.json'], 'kun den tabte uge sendes igen');
  const u02 = world.week('u02');
  assert.deepEqual(Object.keys(u02).sort(), ['1-1', '2-0', '3-0', '3-1', '4-0', '5-0', '5-1']);
  assert.deepEqual(u02['3-1'], deviceEdit, 'enhedens redigering bevaret');
  assert.equal(u02['4-0'].src, 'strava');
  assert.equal(world.count('gist', 'GET'), 3, 'hent + to efterprøvelser');
  assert.deepEqual(sleeps.filter(ms => ms === 3000).length, 2, 'ventetid 3 s før hver efterprøvelse');
});

test('tabt opdatering hver gang: efter højst 2 ekstra runder en advarsel (uden detaljer), status ok', async () => {
  seedState(world);
  world.gist.onPatch = (n, files) => { if (files['u02.json']) world.gist.files['u02.json'] = serializeWeek('u02', { '3-1': manual(`2026-11-08T19:5${n}:00.000Z`) }); };
  const { r, text } = await sync(world);
  assert.equal(r.status, 'ok');
  assert.equal(world.patches().length, 3, '1 + 2 ekstra');
  assert.match(text, /::warning::En anden enhed overskrev ugen flere gange i træk/);
  assertClean(text, 'tabt hver gang');
});

test('en mislykket efterprøvelse (GET fejler) giver en advarsel, ikke en fejl', async () => {
  seedState(world);
  let gets = 0;
  world.failures.push({ side: 'gist', test: q => q.method === 'GET' && ++gets > 1, status: 503, times: 99 });
  const { r, text } = await sync(world);
  assert.equal(r.status, 'ok');
  assert.match(text, /::warning::Skrivningen kunne ikke efterprøves/);
});

// ---- Privatliv ----

test('privatliv: hverken stdout, stderr, $GITHUB_OUTPUT eller noget PATCH-indhold rummer lokkefugle, tokens, klienthemmelighed, gist-id eller aktivitets-id\'er uden for _strava.json/extId', async () => {
  world.strava.responses.push(TOK.rot1);
  const r = await cli();
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=ok');
  assertClean(r.text + '\n' + r.status, 'CLI');
  assert.ok(world.patches().length >= 2);
  for (const p of world.patches()) {
    assert.ok(!p.body.includes(GIST_TOKEN));
    for (const [name, f] of Object.entries(p.files)) {
      let content = f.content;
      if (name === STATE_FILE) { // chiffertekst + hovedbog (id'er, datoer, pas-nøgler)
        const st = parseState(content);
        assert.ok(st, 'gyldig tilstand');
        content = JSON.stringify({ ...st, seen: Object.fromEntries(Object.values(st.seen).map((l, i) => [i, { ...l }])) });
      } else { // ugefiler: ids kun i extId
        const week = parseWeekFile(name, content).week;
        for (const e of Object.values(week)) { assert.match(e.extId, /^\d{1,20}$/); delete e.extId; }
        content = JSON.stringify(week);
      }
      for (const s of [...ALL_SECRETS, ...DECOYS, ...ACTIVITY_IDS]) assert.ok(!content.includes(s), `${name}: ${s.slice(0, 12)}`);
    }
    // Kun de tilladte felter pr. pas
    for (const [name, f] of Object.entries(p.files)) if (name !== STATE_FILE) for (const e of Object.values(parseWeekFile(name, f.content).week)) {
      assert.ok(Object.keys(e).every(k => ['done', 'updatedAt', 'dev', 'at', 'min', 'src', 'extId', 'sig', 'dist', 'hr'].includes(k)), Object.keys(e).join());
    }
  }
  // fejlsituationerne er rene, de også
  for (const [label, setup] of [
    ['auth', w => { w.strava.valid = new Set(); }],
    ['503', w => w.failures.push({ side: 'strava', test: () => true, status: 503, times: 99 })],
    ['gist 404', w => w.failures.push({ side: 'gist', test: () => true, status: 404, times: 99 })],
    ['tabt', w => { w.gist.onPatch = (n, files) => { if (files['u02.json']) w.gist.files['u02.json'] = serializeWeek('u02', {}); }; }],
  ]) {
    const w = makeWorld(); setup(w);
    const s = await sync(w);
    assertClean(s.text, label);
  }
});

test('GITHUB_ACTIONS: ::add-mask:: for adgangstoken og nyt refresh-token, og tokens står kun på disse linjer', async () => {
  world.strava.responses.push(TOK.rot1);
  const r = await cli([], { GITHUB_ACTIONS: 'true' });
  assert.equal(r.status, 'status=ok');
  const masks = r.stdout.split('\n').filter(l => l.startsWith('::add-mask::'));
  assert.deepEqual(masks.sort(), [`::add-mask::${ROT1}`, `::add-mask::${TOK.rot1.access_token}`].sort());
  assert.equal(r.stdout.indexOf('::add-mask::'), 0, 'maskeringen kommer før al anden uddata');
  assertClean(r.text, 'maskering');
  const outside = await cli([], { GITHUB_ACTIONS: '' });
  assert.ok(!outside.stdout.includes('::add-mask::'));
});

test('værter: tokens sendes kun til den konfigurerede Strava- eller Gist-vært', async () => {
  world.strava.responses.push(TOK.rot1);
  const r = await cli();
  assert.equal(r.status, 'status=ok', r.text);
  const gistSeen = world.requests.filter(q => q.side === 'gist').map(q => JSON.stringify(q)).join('\n');
  const stravaSeen = world.requests.filter(q => q.side === 'strava').map(q => JSON.stringify(q)).join('\n');
  for (const s of [SEED, ROT1, TOK.seed.access_token, TOK.rot1.access_token, CLIENT_SECRET]) assert.ok(!gistSeen.includes(s), `Gist-serveren så ${s.slice(0, 12)}`);
  assert.ok(!stravaSeen.includes(GIST_TOKEN), 'Strava-serveren så Gist-tokenet');
  assert.ok(!stravaSeen.includes(GIST_ID), 'Strava-serveren så gist-id\'et');
  assert.ok(stravaSeen.includes(TOK.rot1.access_token), 'adgangstokenet gik til aktivitets-API\'et');
  // standardadresserne: kun api.github.com og www.strava.com (via en fetch-fake; intet rigtigt netværk)
  const w2 = makeWorld();
  const { r: r2 } = await sync(w2);
  assert.equal(r2.status, 'ok');
  assert.deepEqual(w2.badHosts, []);
});

test('STRAVA_API, STRAVA_OAUTH og GIST_API valideres: kun https (eller http til localhost), ellers fejl uden kald', async () => {
  for (const bad of [
    { GIST_API: 'http://example.com' }, { GIST_API: 'ftp://127.0.0.1' }, { GIST_API: 'http://127.0.0.1.evil.com' }, { GIST_API: 'https://evil.com@api.github.com' },
    { STRAVA_API: 'http://example.com/api/v3' }, { STRAVA_API: 'http://localhost.evil.com' }, { STRAVA_OAUTH: 'http://www.strava.com/oauth' }, { STRAVA_OAUTH: 'javascript:alert(1)' },
  ]) {
    const r = await cli([], bad);
    assert.equal(r.code, 0, JSON.stringify(bad));
    assert.equal(r.status, 'status=error', JSON.stringify(bad));
    assert.match(r.stdout, /::error::(GIST_API|STRAVA_API|STRAVA_OAUTH) skal være en https-adresse/);
    assertClean(r.text, JSON.stringify(bad));
  }
  assert.equal(world.requests.length, 0);
  assert.equal(validBase('', 'https://api.github.com', 'X'), 'https://api.github.com');
  assert.equal(validBase('https://api.github.com/', 'x', 'X'), 'https://api.github.com');
  assert.equal(validBase('http://127.0.0.1:8080', 'x', 'X'), 'http://127.0.0.1:8080');
  assert.equal(validBase('http://localhost:1/api/v3', 'x', 'X'), 'http://localhost:1/api/v3');
  assert.equal(validBase('https://www.strava.com/api/v3', 'x', 'X'), 'https://www.strava.com/api/v3');
  for (const bad of ['http://example.com', 'https://a b', 'https://x?y=1', 'https://x#f', 'file:///etc/passwd', 'http://127.0.0.1.evil.com', 'https://', 'localhost']) {
    assert.throws(() => validBase(bad, 'https://ok.example', 'X'), UsageError, bad);
  }
});

test('STRAVA_LOOKBACK_DAYS: 1–30, ellers 3 med en advarsel der ikke gengiver værdien', async () => {
  for (const [value, warns] of [['7', false], ['1', false], ['30', false], ['', false], ['0', true], ['31', true], ['3.5', true], ['-2', true], ['uge', true], ['<script>', true]]) {
    const w = makeWorld(); seedState(w);
    const { r, text } = await sync(w, { env: { STRAVA_LOOKBACK_DAYS: value } });
    assert.equal(r.status, 'ok', value);
    assert.equal(/STRAVA_LOOKBACK_DAYS skal være/.test(text), warns, `"${value}"`);
    assert.ok(!text.includes('script'), 'værdien gengives aldrig');
    if (warns) assert.match(text, /::warning::STRAVA_LOOKBACK_DAYS skal være et helt tal fra 1 til 30; bruger 3 dage/);
  }
});

test('Strava-kald: after = nu − (L + 2) døgn, 100 pr. side, højst 3 sider, og stop når en side har under 100', async () => {
  seedState(world);
  await sync(world, { env: { STRAVA_LOOKBACK_DAYS: '3' } });
  const q = world.requests.find(x => x.path === '/api/v3/athlete/activities').query;
  assert.deepEqual(q, { after: String(Math.floor(NOW.getTime() / 1000) - 5 * 86400), per_page: '100', page: '1' });

  const page = i => Array.from({ length: 100 }, (_, n) => ({ ...fixture('activities-late.json')[0], id: 5000000 + i * 1000 + n }));
  const w2 = makeWorld(); seedState(w2);
  w2.strava.pages = [page(0), page(1), page(2), page(3)];
  const s = await sync(w2);
  assert.equal(s.r.status, 'ok');
  assert.equal(w2.requests.filter(x => x.path === '/api/v3/athlete/activities').length, 3, 'højst 3 sider');
  const w3 = makeWorld(); seedState(w3);
  w3.strava.pages = [page(0), fixture('activities-late.json')];
  await sync(w3);
  assert.equal(w3.requests.filter(x => x.path === '/api/v3/athlete/activities').length, 2, 'stopper efter en side med under 100');
  const w4 = makeWorld(); seedState(w4);
  w4.strava.pages = [fixture('activities-late.json')];
  await sync(w4);
  assert.equal(w4.requests.filter(x => x.path === '/api/v3/athlete/activities').length, 1);
});

test('listActivities hvidlister straks: rå objekter kommer aldrig ud, og dubletter mellem sider fjernes', async () => {
  const rows = fixture('activities-week2.json');
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), auth: init.headers.Authorization }); return new Response(JSON.stringify(calls.length === 1 ? [...rows, rows[0]] : []), { status: 200 }); };
  const out = await listActivities({ fetchImpl, accessToken: 'TOKEN-X', after: 1700000000.9, perPage: 3, maxPages: 3, delays: [], sleep: async () => {} });
  assert.equal(out.length, rows.length, 'dublet fjernet');
  assert.ok(out.every(a => Object.keys(a).every(k => ['id', 'group', 'startMs', 'endMs', 'date', 'min', 'elapsedSec', 'dist', 'hr'].includes(k))));
  for (const d of DECOYS) assert.ok(!JSON.stringify(out).includes(d), d);
  assert.equal(calls[0].url, 'https://www.strava.com/api/v3/athlete/activities?after=1700000000&per_page=3&page=1');
  assert.equal(calls[0].auth, 'Bearer TOKEN-X');
});

// ---- --dry-run ----

test('--dry-run: ingen pas-PATCH (hverken uge eller hovedbog); et roteret token gemmes stadig; kun tal i CI', async () => {
  world.strava.responses.push(TOK.rot1);
  const r = await cli(['--dry-run'], { GITHUB_ACTIONS: 'true' });
  assert.equal(r.code, 0, r.text);
  assert.equal(r.status, 'status=ok');
  assert.match(r.stdout, /^Strava \(prøvekørsel\): 7 aktiviteter i vinduet · 6 nye pas/m);
  assert.deepEqual(world.patches().map(p => Object.keys(p.files)), [[STATE_FILE]], 'kun rotationen');
  assert.equal(decryptToken(world.state().rt, CLIENT_SECRET), ROT1);
  assert.deepEqual(Object.keys(world.state().seen), [], 'hovedbogen er ikke ændret');
  assert.equal(world.week('u02'), undefined);
  assert.ok(!/u0\d [0-6]-\d:/.test(r.stdout), 'ingen pas-linjer i CI');
  assertClean(r.text, 'dry-run CI');
  // uden for CI må den vise pas-detaljer lokalt (aldrig id'er eller tokens)
  const w2 = makeWorld(); seedState(w2);
  const { r: local, lines } = await sync(w2, { dryRun: true });
  assert.equal(local.status, 'ok');
  assert.equal(w2.patches().length, 0);
  assert.ok(lines.some(l => /^ {2}u02 4-0: 60 min$/.test(l)), lines.join('\n'));
  assertClean(lines.join('\n'), 'dry-run lokalt');
});

// ---- Toplevel ----

test('main: en uventet fejl giver status=error og exit 1, og meddelelsen indeholder kun fejlnavnet', async () => {
  const outFile = join(tmp, 'gh-main-error');
  const logs = [];
  const orig = console.log;
  console.log = l => logs.push(l);
  let code;
  try { code = await main({ env: { GITHUB_OUTPUT: outFile }, argv: [], sync: async () => { throw new RangeError(`aldrig ${CLIENT_SECRET}`); } }); } finally { console.log = orig; }
  assert.equal(code, 1);
  assert.equal(readFileSync(outFile, 'utf8'), 'status=error\n');
  assert.match(logs.join('\n'), /^::error::Strava-synk fejlede uventet \(RangeError\)/);
  assert.ok(!logs.join('\n').includes(CLIENT_SECRET));
  const okFile = join(tmp, 'gh-main-ok');
  assert.equal(await main({ env: { GITHUB_OUTPUT: okFile }, argv: ['--dry-run'], sync: async o => ({ status: o.dryRun ? 'ok' : 'error' }) }), 0);
  assert.equal(readFileSync(okFile, 'utf8'), 'status=ok\n');
});

// ---- Hele kæden: synkroniserede pas er nu "gennemført" for appens fremdrift og kalenderen ----

test('de skrevne pas er gyldig fremdrift: parseAny læser gisten, og pas og ledger passer til planen', async () => {
  const { r } = await sync(world);
  assert.equal(r.status, 'ok');
  const progress = {};
  for (const [name, content] of Object.entries(world.gist.files)) { const p = parseWeekFile(name, content); if (p) Object.assign(progress, { [p.weekId]: mergeWeek(progress[p.weekId] ?? {}, p.week) }); }
  assert.deepEqual(parseAny({ format: FORMAT, v: 2, weeks: progress }), progress);
  const weeks = plan();
  for (const l of Object.values(world.state().seen)) {
    const w = weeks.find(x => x.id === l.w), [di, si] = l.k.split('-').map(Number);
    assert.ok(w.days[di][si], `${l.w} ${l.k} findes i planen`);
  }
  // et nyt match af de samme data mod den skrevne tilstand giver ingenting at gøre
  const acts = fixture('activities-week2.json').map(pickActivity);
  assert.deepEqual(matchActivities({ weeks, progress, activities: acts, ledger: world.state().seen, today: '2026-11-08', lookbackDays: 7 }).writes, {});
});
