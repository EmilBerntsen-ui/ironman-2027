// scripts/create-gist.mjs mod den falske Gist-API (test/fake-gist.mjs): ingen rigtigt netværk og ingen rigtige tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT, GIST_DESCRIPTION, META_FILE } from '../src/progress.js';
import { GistStore } from '../src/store/gist.js';
import { createGist, run } from '../scripts/create-gist.mjs';
import { TEST_TOKEN, createClock, createFakeGitHub } from './fake-gist.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/create-gist.mjs', import.meta.url));
const NOW = '2026-11-24T10:00:00.000Z';
const META = { format: FORMAT, v: 2, kind: 'meta', start: '2026-10-26', createdAt: '2026-11-01T00:00:00.000Z' };

function setup() {
  const clock = createClock(NOW);
  const fake = createFakeGitHub({ now: clock.now });
  return { clock, fake };
}
// Kør scriptet med falske streams → { code, stdout, stderr }
async function runScript(ctx, env = { GITHUB_TOKEN: TEST_TOKEN }) {
  let stdout = '', stderr = '';
  const code = await run({ env, fetchImpl: ctx.fake.fetch, now: ctx.clock.now, out: s => { stdout += s; }, err: s => { stderr += s; } });
  return { code, stdout, stderr };
}
const posts = fake => fake.requests.filter(r => r.method === 'POST');

test('opretter en hemmelig gist med markørfilen og udskriver kun gist-id\'et', async () => {
  const ctx = setup();
  const r = await runScript(ctx);
  assert.equal(r.code, 0);
  const [post] = posts(ctx.fake);
  assert.equal(posts(ctx.fake).length, 1);
  const id = r.stdout.trim();
  assert.match(id, /^[A-Za-z0-9]{1,64}$/);
  assert.equal(r.stdout, `${id}\n`, 'stdout er kun id\'et');
  assert.match(r.stderr, /oprettet/);
  assert.ok(!r.stderr.includes(id), 'id\'et står kun på stdout');
  const g = ctx.fake.gist(id);
  assert.equal(g.description, GIST_DESCRIPTION);
  assert.equal(g.public, false, 'hemmelig');
  assert.deepEqual(ctx.fake.fileNames(id), [META_FILE]);
  assert.deepEqual(ctx.fake.fileJson(id, META_FILE), { ...META, createdAt: NOW });
  assert.deepEqual(post.body, { description: GIST_DESCRIPTION, public: false, files: { [META_FILE]: { content: ctx.fake.file(id, META_FILE) } } });
});

test('opretter præcis det samme som GistStores find-eller-opret (appens første forbindelse)', async () => {
  const viaScript = setup(), viaApp = setup();
  const r = await runScript(viaScript);
  const storage = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, String(v)); }, removeItem(k) { this.m.delete(k); } };
  const app = await GistStore.connect(TEST_TOKEN, { fetch: viaApp.fake.fetch, storage, now: viaApp.clock.now });
  assert.equal(app.created, true);
  const a = posts(viaScript.fake)[0], b = posts(viaApp.fake)[0];
  assert.deepEqual(a.body, b.body, 'samme POST-krop: beskrivelse, public og markørfil');
  assert.deepEqual(a.headers, b.headers, 'samme headers');
  const ga = viaScript.fake.gist(r.stdout.trim()), gb = viaApp.fake.gist(app.gistId);
  assert.equal(ga.description, gb.description);
  assert.equal(ga.public, gb.public);
  assert.deepEqual(viaScript.fake.fileNames(ga.id), viaApp.fake.fileNames(gb.id));
  assert.equal(viaScript.fake.file(ga.id, META_FILE), viaApp.fake.file(gb.id, META_FILE));
  // og omvendt: appen finder den gist scriptet har lavet, i stedet for at oprette en ny
  const found = await GistStore.connect(TEST_TOKEN, { fetch: viaScript.fake.fetch, storage, now: viaScript.clock.now });
  assert.deepEqual({ gistId: found.gistId, created: found.created }, { gistId: ga.id, created: false });
  assert.equal(posts(viaScript.fake).length, 1);
});

test('findes en gist med markørfilen allerede, oprettes der ikke en ny: det eksisterende id udskrives, og stderr siger det', async () => {
  const ctx = setup();
  const existing = ctx.fake.addGist({ id: 'e'.repeat(32), description: GIST_DESCRIPTION, files: { [META_FILE]: META } });
  const r = await runScript(ctx);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `${existing.id}\n`);
  assert.match(r.stderr, /findes allerede/);
  assert.match(r.stderr, /ikke oprettet en ny/);
  assert.equal(posts(ctx.fake).length, 0, 'intet oprettet');
  assert.deepEqual(ctx.fake.fileNames(existing.id), [META_FILE], 'den eksisterende gist er urørt');
  assert.equal(ctx.fake.requests.filter(q => q.method === 'PATCH').length, 0);
  const again = await runScript(ctx);                       // gentagelse: stadig kun den ene
  assert.equal(again.stdout, `${existing.id}\n`);
  assert.equal(posts(ctx.fake).length, 0);
});

test('flere markør-gists: den nyeste vinder (som i appen); gists uden markørfil eller med anden beskrivelse tæller ikke', async () => {
  const ctx = setup();
  ctx.fake.addGist({ id: 'a'.repeat(32), description: GIST_DESCRIPTION, files: { [META_FILE]: META }, updated_at: '2026-11-01T00:00:00.000Z' });
  ctx.fake.addGist({ id: 'b'.repeat(32), description: GIST_DESCRIPTION, files: { [META_FILE]: META }, updated_at: '2026-11-20T00:00:00.000Z' });
  ctx.fake.addGist({ id: 'c'.repeat(32), description: GIST_DESCRIPTION, files: { 'u01.json': '{}' }, updated_at: '2026-11-23T00:00:00.000Z' });
  ctx.fake.addGist({ id: 'd'.repeat(32), description: 'noget andet', files: { [META_FILE]: META }, updated_at: '2026-11-23T00:00:00.000Z' });
  assert.equal((await runScript(ctx)).stdout.trim(), 'b'.repeat(32));

  const other = setup();
  other.fake.addGist({ id: 'c'.repeat(32), description: GIST_DESCRIPTION, files: { 'u01.json': '{}' } });
  other.fake.addGist({ id: 'd'.repeat(32), description: 'noget andet', files: { [META_FILE]: META } });
  const r = await runScript(other);
  assert.equal(posts(other.fake).length, 1, 'ingen af dem er en Ironman-gist, så der oprettes en ny');
  assert.ok(!['c'.repeat(32), 'd'.repeat(32)].includes(r.stdout.trim()));
});

test('findes gisten på en senere side i listen, oprettes der heller ikke en ny', async () => {
  const clock = createClock(NOW);
  const fake = createFakeGitHub({ now: clock.now, pageSize: 2 });
  for (let i = 0; i < 5; i++) fake.addGist({ description: 'andet ' + i, files: { 'a.txt': 'x' }, updated_at: `2026-11-2${i}T00:00:00.000Z` });
  fake.addGist({ id: '9'.repeat(32), description: GIST_DESCRIPTION, files: { [META_FILE]: META }, updated_at: '2026-01-01T00:00:00.000Z' });
  const r = await runScript({ clock, fake });
  assert.equal(r.stdout, `${'9'.repeat(32)}\n`);
  assert.equal(posts(fake).length, 0);
});

test('uden GITHUB_TOKEN (eller med blankt): brugsfejl, exit 2, intet på stdout og ingen netværkskald', async () => {
  for (const env of [{}, { GITHUB_TOKEN: '' }, { GITHUB_TOKEN: '   ' }]) {
    const ctx = setup();
    const r = await runScript(ctx, env);
    assert.equal(r.code, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /GITHUB_TOKEN er ikke sat/);
    assert.equal(ctx.fake.requests.length, 0);
  }
  await assert.rejects(createGist({ env: {} }), /GITHUB_TOKEN/);
});

test('afvist token, nedbrud og grænse: exit 1, intet på stdout, og tokenet står aldrig i uddata', async () => {
  const cases = [
    ['afvist', ctx => ctx.fake.inject(() => true, { status: 401, body: { message: 'Bad credentials' } }), /Tokenet blev afvist/],
    ['manglende rettighed', ctx => ctx.fake.inject(r => r.path === '/gists', { status: 403, body: { message: 'Resource not accessible by personal access token' } }), /Gists/],
    ['grænse', ctx => ctx.fake.inject(() => true, { status: 403, body: { message: 'You have exceeded a secondary rate limit.' } }), /grænse/],
    ['netværk', ctx => { ctx.fake.offline = true; }, /Ingen forbindelse/],
    ['server', ctx => ctx.fake.inject(r => r.method === 'POST', { status: 500, body: {} }), /500/],
  ];
  for (const [name, arrange, message] of cases) {
    const ctx = setup();
    arrange(ctx);
    const r = await runScript(ctx);
    assert.equal(r.code, 1, name);
    assert.equal(r.stdout, '', name);
    assert.match(r.stderr, message, name);
    assert.ok(!(r.stdout + r.stderr).includes(TEST_TOKEN), `${name}: ingen token i uddata`);
  }
  const ctx = setup();
  const bad = await runScript(ctx, { GITHUB_TOKEN: 'kort' });
  assert.equal(bad.code, 1);
  assert.equal(ctx.fake.requests.length, 0, 'et token der ikke ligner et token afvises uden netværk');
});

test('tokenet sendes kun som Bearer til api.github.com, og aldrig i krop eller URL', async () => {
  const ctx = setup();
  await runScript(ctx);
  for (const req of ctx.fake.requests) {
    assert.equal(req.host, 'api.github.com');
    assert.equal(req.headers.authorization, `Bearer ${TEST_TOKEN}`);
    assert.ok(!req.url.includes(TEST_TOKEN) && !JSON.stringify(req.body ?? '').includes(TEST_TOKEN));
  }
});

test('CLI uden GITHUB_TOKEN: exit 2 og tom stdout (ingen anmodninger er mulige uden token)', async () => {
  const r = await new Promise(resolve => execFile(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH } }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })));
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /GITHUB_TOKEN/);
});
