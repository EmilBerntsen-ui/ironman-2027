import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT, META_FILE, parseAny, serializeWeek } from '../src/progress.js';
import { SKIP_WARNINGS, fetchProgress } from '../scripts/fetch-progress.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/fetch-progress.mjs', import.meta.url));
const GIST_ID = 'abcdef0123456789abcdef0123456789'; // syntetisk
const TOKEN = 'github_pat_SYNTETISK_TOKEN_1234567890';
const NOTE = 'HEMMELIG-NOTE-XYZ';

const entry = (at, extra = {}) => ({ done: true, updatedAt: at, dev: 'fake0001', at, ...extra });
const WEEKS = {
  u01: { '1-0': entry('2026-10-27T06:12:00.000Z', { min: 42, rpe: 8, note: NOTE }), '2-0': { done: false, updatedAt: '2026-10-28T09:00:00.000Z', dev: 'fake0001' } },
  u02: { '1-0': entry('2026-11-03T06:15:00.000Z', { min: 40 }) },
};
const gistBody = (over = {}) => ({
  id: GIST_ID,
  files: {
    [META_FILE]: { filename: META_FILE, content: JSON.stringify({ format: FORMAT, v: 2, kind: 'meta', start: '2026-10-26' }) },
    'u01.json': { filename: 'u01.json', content: serializeWeek('u01', WEEKS.u01) },
    'u02.json': { filename: 'u02.json', content: serializeWeek('u02', WEEKS.u02) },
    'noter.txt': { filename: 'noter.txt', content: 'ikke en ugefil' },
    ...over,
  },
});

// Fake GitHub-API: handler(req, n) → [status, body, headers?]; tæller kald og gemmer headers.
let server, base, requests, handler, tmp;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'im2027-fetch-'));
  server = http.createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization });
    const [status, body, headers = {}] = handler(req, requests.length);
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); rmSync(tmp, { recursive: true, force: true }); });
beforeEach(() => { requests = []; handler = () => [200, gistBody()]; });

const env = (over = {}) => ({ GIST_ID, GIST_READ_TOKEN: TOKEN, GIST_API: base, ...over });
const noSleep = async () => {};
const quiet = async fn => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

// Asynkron spawn (spawnSync ville blokere den in-process server).
function cli(args, vars) {
  const full = { PATH: process.env.PATH, FETCH_PROGRESS_DELAYS_MS: '0,0', ...vars };
  return new Promise(resolve => execFile(process.execPath, [SCRIPT, ...args], { env: full }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })));
}

test('henter gisten, springer ikke-ugefiler over og returnerer sammenflettet Progress', async () => {
  const r = await fetchProgress({ env: env(), sleep: noSleep });
  assert.deepEqual(r.stats, { weeks: 2, sessions: 3, done: 2, skipped: 0 });
  assert.deepEqual(Object.keys(r.progress).sort(), ['u01', 'u02']);
  assert.equal(r.progress.u01['1-0'].min, 42);
  assert.equal(r.progress.u01['2-0'].done, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `/gists/${GIST_ID}`);
  assert.equal(requests[0].auth, `Bearer ${TOKEN}`);
});

test('CLI: skriver parseAny-læsbar fremdrift og logger kun tal', async () => {
  const out = join(tmp, 'ok.json');
  const r = await cli(['--out', out], env());
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(parseAny(readFileSync(out, 'utf8')), parseAny({ format: FORMAT, v: 2, weeks: WEEKS }));
  assert.match(r.stdout, /2 uger, 3 pas \(2 gennemført\)/);
  for (const secret of [GIST_ID, TOKEN, NOTE, base]) assert.ok(!(r.stdout + r.stderr).includes(secret), 'ingen secrets i loggen');
});

test('CLI: 500 hele vejen giver tre forsøg og exit 1, uden fil', async () => {
  handler = () => [500, { message: 'Server Error' }];
  const out = join(tmp, 'fejl500.json');
  const r = await cli(['--out', out], env());
  assert.equal(r.code, 1);
  assert.equal(requests.length, 3);
  assert.ok(!existsSync(out));
  assert.match(r.stderr, /::error::/);
  assert.ok(!(r.stdout + r.stderr).includes(GIST_ID));
});

test('forsøg: 500, 500, så 200 lykkes, med ventetider 1 s og 4 s', async () => {
  handler = (_req, n) => (n < 3 ? [500, {}] : [200, gistBody()]);
  const waits = [];
  const r = await quiet(() => fetchProgress({ env: env(), sleep: async ms => { waits.push(ms); } }));
  assert.equal(requests.length, 3);
  assert.deepEqual(waits, [1000, 4000]);
  assert.equal(r.stats.weeks, 2);
});

test('rate limit (403 med x-ratelimit-remaining: 0) og 429 genforsøges; 401/404/403 uden rate limit gør ikke', async () => {
  handler = (_req, n) => (n === 1 ? [403, { message: 'rate' }, { 'x-ratelimit-remaining': '0' }] : n === 2 ? [429, {}] : [200, gistBody()]);
  await quiet(() => fetchProgress({ env: env(), sleep: noSleep }));
  assert.equal(requests.length, 3);
  for (const status of [401, 403, 404]) {
    requests = []; handler = () => [status, { message: 'nej' }];
    await assert.rejects(fetchProgress({ env: env(), sleep: noSleep }), e => e.retryable === false && e.message.includes(String(status)));
    assert.equal(requests.length, 1, `status ${status}: kun ét forsøg`);
  }
});

test('netværksfejl genforsøges og giver til sidst en fejl uden gist-id', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  await assert.rejects(quiet(() => fetchProgress({ env: env(), fetchImpl, sleep: noSleep })), e => e.message.includes('ECONNREFUSED') && !e.message.includes(GIST_ID));
  assert.equal(calls, 3);
});

test('tom GIST_ID: ingen fil, advarsel (om ✅-mærkerne), exit 0, ingen kald; en forældet fil fjernes', async () => {
  const out = join(tmp, 'stale.json');
  writeFileSync(out, '{"gammelt":true}');
  const r = await cli(['--out', out], env({ GIST_ID: '' }));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /::warning::GIST_ID er ikke sat/);
  assert.match(r.stdout, /uden ✅-mærker/);
  assert.ok(!existsSync(out));
  assert.equal(requests.length, 0);
});

test('GIST_ID sat men GIST_READ_TOKEN mangler: GitHub-advarsel om at ✅-mærkerne udelades og at læse-tokenet er påkrævet; ingen fil, ingen kald, exit 0 (udrulningen fejler ikke)', async () => {
  const out = join(tmp, 'notoken.json');
  for (const token of ['', '   ']) {
    const r = await cli(['--out', out], env({ GIST_READ_TOKEN: token }));
    assert.equal(r.code, 0, 'må ikke få udrulningen til at fejle');
    const lines = r.stdout.split('\n').filter(l => l.startsWith('::warning::'));
    assert.equal(lines.length, 1, 'præcis én annotation');
    assert.equal(lines[0], `::warning::${SKIP_WARNINGS.GIST_READ_TOKEN}`);
    assert.match(lines[0], /^::warning::GIST_READ_TOKEN er ikke sat/);
    assert.match(lines[0], /✅-mærker/);
    assert.match(lines[0], /påkrævet/);
    assert.match(lines[0], /gh secret set GIST_READ_TOKEN/);
    assert.doesNotMatch(r.stdout + r.stderr, /::error::/);
    for (const secret of [GIST_ID, TOKEN, base]) assert.ok(!(r.stdout + r.stderr).includes(secret), 'ingen secrets i loggen');
    assert.ok(!existsSync(out));
  }
  assert.equal(requests.length, 0);
  assert.deepEqual(await fetchProgress({ env: env({ GIST_READ_TOKEN: undefined }) }), { skipped: true, reason: 'GIST_READ_TOKEN' });
});

test('en forældet fil fjernes også, når kun læse-tokenet mangler (kalenderen får så ingen mærker)', async () => {
  const out = join(tmp, 'stale2.json');
  writeFileSync(out, '{"gammelt":true}');
  const r = await cli(['--out', out], env({ GIST_READ_TOKEN: '' }));
  assert.equal(r.code, 0);
  assert.ok(!existsSync(out));
});

test('en gist uden markørfil afvises (forkert GIST_ID), og beskadigede ugefiler springes over og tælles', async () => {
  handler = () => [200, { files: { 'u01.json': { content: serializeWeek('u01', WEEKS.u01) } } }];
  await assert.rejects(fetchProgress({ env: env(), sleep: noSleep }), e => e.message.includes(META_FILE) && e.retryable === false);
  handler = () => [200, gistBody({
    'u03.json': { filename: 'u03.json', content: '{ikke json' },
    'u04.json': { filename: 'u04.json', truncated: true, content: '{}' },
    'u05.json': { filename: 'u05.json', content: JSON.stringify({ format: 'andet', v: 2, sessions: {} }) },
  })];
  const r = await fetchProgress({ env: env(), sleep: noSleep });
  assert.equal(r.stats.skipped, 3);
  assert.deepEqual(Object.keys(r.progress).sort(), ['u01', 'u02']);
});

test('GIST_ID og GIST_API valideres, så tokenet ikke kan sendes til en vilkårlig vært', async () => {
  for (const bad of [{ GIST_ID: '../users' }, { GIST_ID: 'a b' }, { GIST_API: 'http://example.com' }, { GIST_API: 'ftp://127.0.0.1' }, { GIST_API: 'http://127.0.0.1.evil.com' }]) {
    await assert.rejects(fetchProgress({ env: env(bad), sleep: noSleep }), e => e.name === 'UsageError' || e.constructor.name === 'UsageError', JSON.stringify(bad));
  }
  assert.equal(requests.length, 0);
  const r = await cli(['--out', join(tmp, 'usage.json')], env({ GIST_API: 'http://example.com' }));
  assert.equal(r.code, 2);
  assert.equal(requests.length, 0);
});

test('CLI uden --out giver brugsvejledning og exit 2', async () => {
  const r = await cli([], env());
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--out/);
  assert.equal(requests.length, 0);
});
