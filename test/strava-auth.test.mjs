// scripts/strava-auth.mjs: URL, callback-kontrol, kodeveksling, gh-secrets og den lokale server. Ingen netværk, intet rigtigt gh, ingen rigtig browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { REPO, SCOPE, SCOPE_ALL, SECRET_NAMES, authorizeUrl, exchangeCode, listenForCallback, main, parseCallback, setSecrets } from '../scripts/strava-auth.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/strava/${name}`, import.meta.url), 'utf8'));
const TOKEN = fixture('token.json');
const REFRESH = TOKEN.refresh_token, ACCESS = TOKEN.access_token;
const CLIENT_SECRET = 'SYNTETISK-KLIENTHEMMELIGHED-0123456789abcdef';
const STATE = '0123456789abcdef0123456789abcdef';
const CODE = 'SYNTETISKENGANGSKODE0001';
const SRC = readFileSync(new URL('../scripts/strava-auth.mjs', import.meta.url), 'utf8');

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const form = body => Object.fromEntries(new URLSearchParams(body));

// ---- URL ----

test('authorizeUrl: Strava-adressen med scope, redirect til localhost, approval_prompt=force og state', () => {
  const u = new URL(authorizeUrl({ clientId: '123456', state: STATE }));
  assert.equal(`${u.origin}${u.pathname}`, 'https://www.strava.com/oauth/authorize');
  assert.deepEqual(Object.fromEntries(u.searchParams), {
    client_id: '123456', response_type: 'code', redirect_uri: 'http://localhost:8721/callback', approval_prompt: 'force', scope: 'activity:read', state: STATE,
  });
  const all = new URL(authorizeUrl({ clientId: '1', port: 9001, state: STATE, scope: SCOPE_ALL }));
  assert.equal(all.searchParams.get('scope'), 'activity:read_all');
  assert.equal(all.searchParams.get('redirect_uri'), 'http://localhost:9001/callback');
  assert.equal(SCOPE, 'activity:read');
});

// ---- callback ----

test('parseCallback: gyldigt svar giver koden; scope skal indeholde det ønskede (read_all dækker read)', () => {
  const ok = parseCallback(`/callback?code=${CODE}&state=${STATE}&scope=read,activity:read`, STATE);
  assert.deepEqual(ok, { ok: true, code: CODE, scope: 'read,activity:read' });
  assert.equal(parseCallback(`http://localhost:8721/callback?state=${STATE}&code=${CODE}&scope=read,activity:read_all`, STATE).ok, true, 'fuld adresse og superset');
  assert.equal(parseCallback(`/callback?code=${CODE}&state=${STATE}&scope=read,activity:read_all`, STATE, { scope: SCOPE_ALL }).ok, true);
});

test('parseCallback afviser forkert state, access_denied, manglende kode og manglende scope med danske, rene beskeder', () => {
  const bad = (qs, opts) => parseCallback(`/callback?${qs}`, STATE, opts);
  assert.equal(bad(`code=${CODE}&state=forkert&scope=activity:read`).reason, 'state');
  assert.equal(bad(`code=${CODE}&scope=activity:read`).reason, 'state', 'state mangler');
  assert.equal(bad(`code=${CODE}&state=${STATE.slice(0, -1)}&scope=activity:read`).reason, 'state', 'forkert længde');
  assert.equal(bad(`code=${CODE}&state=${STATE.toUpperCase()}&scope=activity:read`).reason, 'state');
  const denied = bad(`error=access_denied&state=${STATE}`);
  assert.deepEqual([denied.ok, denied.reason], [false, 'denied']);
  assert.match(denied.message, /afviste/);
  assert.equal(bad(`error=server_error&state=${STATE}`).reason, 'error');
  assert.equal(bad(`state=${STATE}&scope=activity:read`).reason, 'nocode');
  assert.equal(bad(`code=&state=${STATE}&scope=activity:read`).reason, 'nocode');
  assert.equal(bad(`code=<script>&state=${STATE}&scope=activity:read`).reason, 'nocode');
  const noScope = bad(`code=${CODE}&state=${STATE}&scope=read`);
  assert.deepEqual([noScope.ok, noScope.reason], [false, 'scope']);
  assert.match(noScope.message, /flueben/);
  assert.equal(bad(`code=${CODE}&state=${STATE}`).reason, 'scope', 'scope-parameteren mangler');
  assert.equal(bad(`code=${CODE}&state=${STATE}&scope=read,activity:read`, { scope: SCOPE_ALL }).reason, 'scope', 'read_all krævet, men kun read givet');
  for (const r of [denied, noScope]) for (const s of [CODE, STATE]) assert.ok(!r.message.includes(s));
  assert.equal(parseCallback('http://[', STATE).reason, 'state');
});

// ---- kodeveksling ----

test('exchangeCode: POST til Stravas token-endpoint med formularfelter; kun refresh_token beholdes, access_token og atlet droppes', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return jsonResponse(200, TOKEN); };
  const r = await exchangeCode({ fetchImpl, clientId: '123456', clientSecret: CLIENT_SECRET, code: CODE });
  assert.deepEqual(r, { refreshToken: REFRESH });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.strava.com/oauth/token');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(form(calls[0].init.body), { client_id: '123456', client_secret: CLIENT_SECRET, code: CODE, grant_type: 'authorization_code' });
  assert.ok(!JSON.stringify(r).includes(ACCESS));
  assert.ok(!JSON.stringify(r).includes('HEMMELIG-ATLET'));
});

test('exchangeCode: ugyldigt refresh-token, 400 og 500 afvises uden at gengive Stravas svar; ét forsøg', async () => {
  for (const [status, body] of [[200, { ...TOKEN, refresh_token: 'for-kort' }], [200, { ...TOKEN, refresh_token: 'har mellemrum og !!! '.repeat(3) }], [200, { access_token: ACCESS }], [400, { message: 'HEMMELIG-FEJLTEKST' }], [500, { message: 'HEMMELIG-FEJLTEKST' }]]) {
    let n = 0;
    await assert.rejects(exchangeCode({ fetchImpl: async () => { n++; return jsonResponse(status, body); }, clientId: '1', clientSecret: CLIENT_SECRET, code: CODE }), e => {
      assert.ok(!e.message.includes('HEMMELIG') && !e.message.includes(ACCESS) && !e.message.includes(CLIENT_SECRET), e.message);
      return true;
    }, `${status}`);
    assert.equal(n, 1, 'ingen genforsøg');
  }
});

// ---- gh secret set ----

function fakeSpawn({ missing = false, failName = null } = {}) {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stderr = new PassThrough();
    const rec = { cmd, args, opts, stdin: '' };
    calls.push(rec);
    child.stdin.on('data', d => { rec.stdin += d; });
    if (missing) setImmediate(() => child.emit('error', Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })));
    else if (args[0] === '--version') setImmediate(() => child.emit('close', 0));
    else child.stdin.on('finish', () => setImmediate(() => child.emit('close', args[2] === failName ? 1 : 0)));
    return child;
  };
  return { spawnImpl, calls };
}

test('setSecrets: gh secret set NAVN --repo …, værdien kun via stdin, aldrig i argv eller env', async () => {
  const { spawnImpl, calls } = fakeSpawn();
  const values = { STRAVA_CLIENT_ID: '123456', STRAVA_CLIENT_SECRET: CLIENT_SECRET, STRAVA_REFRESH_TOKEN: REFRESH };
  await setSecrets({ spawnImpl, values });
  assert.deepEqual(calls.map(c => c.args), SECRET_NAMES.map(n => ['secret', 'set', n, '--repo', REPO]));
  assert.deepEqual(calls.map(c => c.stdin), ['123456', CLIENT_SECRET, REFRESH]);
  for (const c of calls) {
    assert.equal(c.cmd, 'gh');
    assert.ok(!JSON.stringify([c.args, c.opts]).includes(CLIENT_SECRET) && !JSON.stringify([c.args, c.opts]).includes(REFRESH), 'ingen værdi i argv eller valg');
    assert.deepEqual(c.opts.stdio, ['pipe', 'ignore', 'pipe']);
    assert.ok(!('env' in c.opts) && !('shell' in c.opts));
  }
  assert.equal(REPO, 'EmilBerntsen-ui/ironman-2027');
});

test('setSecrets: en fejl fra gh eller manglende gh giver en tekst uden værdier', async () => {
  const values = { STRAVA_CLIENT_ID: '123456', STRAVA_CLIENT_SECRET: CLIENT_SECRET, STRAVA_REFRESH_TOKEN: REFRESH };
  await assert.rejects(setSecrets({ spawnImpl: fakeSpawn({ failName: 'STRAVA_CLIENT_SECRET' }).spawnImpl, values }), e => /STRAVA_CLIENT_SECRET fejlede \(exit 1\)/.test(e.message) && !e.message.includes(CLIENT_SECRET));
  await assert.rejects(setSecrets({ spawnImpl: fakeSpawn({ missing: true }).spawnImpl, values }), /ikke installeret/);
});

// ---- Lokal server ----

const get = (port, path, { method = 'GET', host } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method, headers: { host: host ?? `localhost:${port}` } }, res => {
    let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
  });
  req.on('error', reject); req.end();
});

test('serveren binder kun til loopback og besvarer kun GET /callback', async () => {
  const l = await listenForCallback({ port: 0, state: STATE, timeoutMs: 5000 });
  try {
    assert.ok(l.servers.length >= 1);
    for (const s of l.servers) assert.ok(['127.0.0.1', '::1'].includes(s.address().address), s.address().address);
    assert.ok(l.servers.every(s => s.address().port === l.port));
    assert.equal((await get(l.port, '/')).status, 404);
    assert.equal((await get(l.port, '/favicon.ico')).status, 404);
    assert.equal((await get(l.port, `/callback?state=${STATE}&code=${CODE}&scope=activity:read`, { method: 'POST' })).status, 404);
    assert.equal((await get(l.port, '/callback/andet')).status, 404);
    assert.equal((await get(l.port, `/callback?state=${STATE}&code=${CODE}&scope=activity:read`, { host: 'evil.example' })).status, 400, 'forkert Host-header (DNS-rebinding)');
    const wrong = await get(l.port, `/callback?state=forkert&code=${CODE}&scope=activity:read`);
    assert.equal(wrong.status, 400);
    assert.ok(!wrong.body.includes(CODE));
    // en forkert state afslutter ikke godkendelsen: serveren lytter stadig
    const pending = await Promise.race([l.result.then(() => 'afsluttet'), new Promise(r => setTimeout(() => r('venter'), 50))]);
    assert.equal(pending, 'venter');
    const ok = await get(l.port, `/callback?state=${STATE}&code=${CODE}&scope=read,activity:read`);
    assert.equal(ok.status, 200);
    assert.match(ok.body, /Færdig – du kan lukke fanen/);
    assert.match(ok.headers['content-type'], /^text\/html; charset=utf-8$/);
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.ok(!ok.body.includes(CODE) && !ok.body.includes(STATE), 'koden gengives aldrig');
    assert.deepEqual(await l.result, { ok: true, code: CODE, scope: 'read,activity:read' });
  } finally { l.close(); }
  await assert.rejects(get(l.port, '/callback'), 'lukket efter første gyldige svar');
});

test('serveren lukker efter en afvist godkendelse og efter 5 minutter (her: kort timeout)', async () => {
  const l = await listenForCallback({ port: 0, state: STATE, timeoutMs: 5000 });
  const denied = await get(l.port, `/callback?state=${STATE}&error=access_denied`);
  assert.equal(denied.status, 400);
  assert.match(denied.body, /afviste/);
  assert.equal((await l.result).reason, 'denied');
  l.close();
  const t = await listenForCallback({ port: 0, state: STATE, timeoutMs: 20 });
  assert.deepEqual(await t.result, { ok: false, reason: 'timeout', message: 'Ingen godkendelse inden for 5 minutter. Kør scriptet igen.' });
  t.close();
});

test('en optaget port giver en fejl, ikke en hængende proces', async () => {
  const l = await listenForCallback({ port: 0, state: STATE, timeoutMs: 5000 });
  try { await assert.rejects(listenForCallback({ port: l.port, state: STATE, timeoutMs: 5000 })); } finally { l.close(); }
});

// ---- Hele forløbet ----

// En "browser" der følger adressen og kalder callbacken, som Strava ville.
function browser(extra = {}) {
  const opened = [];
  return {
    opened,
    openImpl: url => {
      opened.push(url);
      const u = new URL(url);
      const port = new URL(u.searchParams.get('redirect_uri')).port;
      const qs = new URLSearchParams({ code: CODE, state: u.searchParams.get('state'), scope: 'read,activity:read', ...extra });
      for (const [k, v] of Object.entries(extra)) if (v === null) qs.delete(k);
      setImmediate(() => { get(port, `/callback?${qs}`).catch(() => {}); });
    },
  };
}
const run = async ({ argv = ['--port', '0'], env = {}, fetchImpl, spawn = fakeSpawn(), b = browser() } = {}) => {
  const out = [], err = [], fetched = [];
  const code = await main({
    argv, env: { STRAVA_CLIENT_ID: '123456', STRAVA_CLIENT_SECRET: CLIENT_SECRET, ...env }, openImpl: b.openImpl, spawnImpl: spawn.spawnImpl,
    fetchImpl: fetchImpl ?? (async (url, init) => { fetched.push({ url: String(url), body: init.body }); return jsonResponse(200, TOKEN); }),
    out: s => out.push(s), err: s => err.push(s), timeoutMs: 2000, oauth: 'https://www.strava.com/oauth',
  });
  return { code, out: out.join(''), err: err.join(''), spawn, b, fetched };
};
const noSecrets = (r, label) => { for (const s of [REFRESH, ACCESS, CLIENT_SECRET, CODE]) assert.ok(!(r.out + r.err).includes(s), `${label}: ${s.slice(0, 10)}… udskrevet`); };

test('standardtilstand: gemmer tre secrets via gh/stdin og udskriver aldrig et token', async () => {
  const r = await run();
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(r.b.opened.length, 1);
  assert.equal(new URL(r.b.opened[0]).searchParams.get('scope'), 'activity:read');
  assert.deepEqual(r.spawn.calls.map(c => c.args.join(' ')), ['--version', ...SECRET_NAMES.map(n => `secret set ${n} --repo ${REPO}`)]);
  assert.deepEqual(r.spawn.calls.slice(1).map(c => c.stdin), ['123456', CLIENT_SECRET, REFRESH]);
  assert.equal(r.fetched.length, 1);
  assert.deepEqual(form(r.fetched[0].body), { client_id: '123456', client_secret: CLIENT_SECRET, code: CODE, grant_type: 'authorization_code' });
  noSecrets(r, 'standard');
  assert.match(r.out, /Åbn denne adresse/);
  assert.match(r.out, /Gemte STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN som secrets/);
  assert.match(r.out, /unset STRAVA_CLIENT_SECRET/);
  assert.equal(r.err, '');
  // adressen i uddata er den samme som den åbnede, og indeholder state (ikke hemmeligt)
  assert.ok(r.out.includes(r.b.opened[0]));
});

test('--print: kun refresh-tokenet på stdout, alle beskeder på stderr, ingen gh', async () => {
  const r = await run({ argv: ['--port', '0', '--print'] });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${REFRESH}\n`);
  assert.ok(!r.err.includes(REFRESH) && !r.err.includes(CLIENT_SECRET) && !r.err.includes(ACCESS));
  assert.match(r.err, /Åbn denne adresse/);
  assert.equal(r.spawn.calls.length, 0, 'gh kaldes ikke');
});

test('--read-all skifter scope til activity:read_all; kun read givet i samtykket afvises', async () => {
  const r = await run({ argv: ['--port', '0', '--read-all', '--print'], b: browser({ scope: 'read,activity:read_all' }) });
  assert.equal(r.code, 0, r.err);
  assert.equal(new URL(r.b.opened[0]).searchParams.get('scope'), 'activity:read_all');
  const lacking = await run({ argv: ['--port', '0', '--read-all', '--print'] }); // browseren giver kun activity:read
  assert.equal(lacking.code, 1);
  assert.equal(lacking.fetched.length, 0, 'ingen kodeveksling');
  assert.match(lacking.err, /flueben/);
});

test('afvist samtykke, manglende scope og manglende kode: dansk besked, exit 1, ingen kodeveksling', async () => {
  for (const [extra, re] of [[{ error: 'access_denied', code: null, scope: null }, /afviste/], [{ scope: 'read' }, /flueben/], [{ code: null }, /ingen kode/]]) {
    const r = await run({ b: browser(extra) });
    assert.equal(r.code, 1, JSON.stringify(extra));
    assert.match(r.out + r.err, re);
    assert.equal(r.fetched.length, 0);
    assert.equal(r.spawn.calls.filter(c => c.args[0] === 'secret').length, 0);
    noSecrets(r, JSON.stringify(extra));
  }
});

test('manglende gh: exit 1 med forklaring og --print som udvej, før der lyttes eller veksles', async () => {
  const r = await run({ spawn: fakeSpawn({ missing: true }) });
  assert.equal(r.code, 1);
  assert.match(r.err, /gh \(GitHub CLI\) blev ikke fundet/);
  assert.match(r.err, /--print/);
  assert.equal(r.b.opened.length, 0);
  assert.equal(r.fetched.length, 0);
});

test('kodeveksling afvist af Strava: exit 1 med statuskode, uden Stravas tekst', async () => {
  const r = await run({ fetchImpl: async () => jsonResponse(400, { message: 'HEMMELIG-FEJLTEKST' }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /Strava afviste kodevekslingen \(status 400\)/);
  assert.ok(!(r.out + r.err).includes('HEMMELIG'));
  assert.equal(r.spawn.calls.filter(c => c.args[0] === 'secret').length, 0);
  const net = await run({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(net.code, 1);
  assert.match(net.out, /Strava kunne ikke nås/);
});

test('en fejl fra gh midtvejs: exit 1 uden værdier', async () => {
  const r = await run({ spawn: fakeSpawn({ failName: 'STRAVA_REFRESH_TOKEN' }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /gh secret set STRAVA_REFRESH_TOKEN fejlede/);
  noSecrets(r, 'gh-fejl');
});

test('brug: manglende eller ugyldigt Client ID, manglende secret og forkerte valg giver exit 2 uden at lytte', async () => {
  const cases = [
    [{ STRAVA_CLIENT_ID: undefined }, /STRAVA_CLIENT_ID/], [{ STRAVA_CLIENT_ID: 'abc' }, /STRAVA_CLIENT_ID/], [{ STRAVA_CLIENT_ID: '1234567890123' }, /STRAVA_CLIENT_ID/],
    [{ STRAVA_CLIENT_ID: '12 34' }, /STRAVA_CLIENT_ID/], [{ STRAVA_CLIENT_SECRET: '' }, /STRAVA_CLIENT_SECRET/], [{ STRAVA_CLIENT_SECRET: '  ' }, /STRAVA_CLIENT_SECRET/],
  ];
  for (const [env, re] of cases) {
    const r = await run({ env });
    assert.equal(r.code, 2, JSON.stringify(env));
    assert.match(r.err, re);
    assert.equal(r.b.opened.length, 0);
    assert.equal(r.spawn.calls.length, 0);
    assert.ok(!r.err.includes(CLIENT_SECRET));
  }
  for (const argv of [['--port'], ['--port', 'abc'], ['--port', '70000'], ['--bogus'], ['--scope', 'activity:read_all']]) assert.equal((await run({ argv })).code, 2, argv.join(' '));
});

test('kildekoden: åbner browseren med en argv-liste (aldrig en shell) og skriver ingen fil', () => {
  assert.match(SRC, /spawn\('open', \[url\]/);
  assert.doesNotMatch(SRC, /\bexec(Sync|File|FileSync)?\(|shell\s*:\s*true|writeFile|appendFile|createWriteStream|execSync/);
  assert.doesNotMatch(SRC, /console\.(log|error)\(.*(refreshToken|clientSecret)/);
});
