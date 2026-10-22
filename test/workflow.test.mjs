import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Strengtjek af workflowen (ingen YAML-parser i et afhængighedsfrit projekt). Syntaks og semantik tjekkes med actionlint, hvis den findes.
const yml = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const lines = yml.split('\n');
const at = re => lines.findIndex(l => re.test(l));
const WORDS = ['D' + 'TU', 'Sym' + 'phogen']; // sat sammen, så testfilen selv ikke indeholder ordene
const MIDT_I_ORD = 'run' + 'd' + 'tur og hvile'; // det private ord midt i et almindeligt ord må ikke give falsk alarm (ordgrænse)

test('triggere: push til main, natlig cron og manuel kørsel, aldrig pull_request', () => {
  assert.match(yml, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}schedule:\n {4}- cron: '17 2 \* \* \*'/m);
  assert.match(yml, /^ {2}workflow_dispatch:/m);
  assert.ok(!/pull_request/.test(yml.replace(/^\s*#.*$/gm, '')), 'ingen pull_request(_target)-trigger');
});

test('kun officielle actions, hver med fastlåst hovedversion', () => {
  const uses = [...yml.matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map(m => m[1]);
  assert.ok(uses.length >= 5);
  for (const u of uses) assert.match(u, /^actions\/[a-z-]+@v\d+$/, u);
});

test('secrets kun som env-tildelinger (aldrig inde i et run-script) og ikke i job-env', () => {
  const refs = lines.map((l, i) => [l, i]).filter(([l]) => l.includes('secrets.'));
  assert.ok(refs.length >= 5);
  for (const [l] of refs) assert.match(l, /^ {10}[A-Z_]+: \$\{\{ secrets\.(CAL_TOKEN|CAL_SCHEDULE|GIST_ID|GIST_READ_TOKEN) \}\}$/, l);
  assert.ok(!/^env:[\s\S]*?secrets\./m.exec(yml.split(/^jobs:/m)[0]), 'ingen secrets i workflow-env');
});

test('rækkefølge: test, hent fremdrift, byg, lækagetjek, og først derefter upload og deploy', () => {
  const order = [/run: node --test$/, /scripts\/fetch-progress\.mjs --out "\$RUNNER_TEMP\/progress\.json"/, /run: node build\.mjs --target=site$/, /name: Leak guard/, /actions\/upload-pages-artifact@/, /actions\/deploy-pages@/].map(re => at(re));
  assert.ok(order.every(i => i >= 0), order.join());
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('byg-trinnet får CAL_TOKEN, CAL_SCHEDULE og PROGRESS_FILE; lækagetjekket får tokenet og gist-id', () => {
  const build = yml.slice(yml.indexOf('name: Build site'), yml.indexOf('name: Leak guard'));
  for (const v of ['CAL_TOKEN', 'CAL_SCHEDULE', 'PROGRESS_FILE']) assert.ok(build.includes(`${v}:`), v);
  const guard = yml.slice(yml.indexOf('name: Leak guard'), yml.indexOf('actions/configure-pages@'));
  for (const v of ['CAL_TOKEN', 'GIST_ID']) assert.ok(guard.includes(`${v}: \${{ secrets.${v} }}`), v);
  assert.match(guard, /--exclude-dir=cal/);
});

test('lækagetjekket fanger private ord uden selv at indeholde dem', () => {
  assert.ok(!new RegExp(WORDS.join('|'), 'i').test(yml), 'workflowen må ikke indeholde de private ord');
  const guard = yml.slice(yml.indexOf('name: Leak guard'), yml.indexOf('actions/configure-pages@'));
  // Mønstrene skal faktisk matche ordene (regex fra workflowen, parset som grep -E ville).
  const pats = [...guard.matchAll(/-e '([^']+)'/g)].map(m => new RegExp(m[1], 'i'));
  assert.equal(pats.length, 2);
  for (const [p, w] of [[pats[0], WORDS[0]], [pats[1], WORDS[1]]]) {
    assert.ok(p.test(`xx ${w}-cyklen`), w);
    assert.ok(!p.test('helt uskyldig tekst'), w);
  }
});

test('oprydning: sletter Pages-artifacten efter deploy (også ved fejl) og holder cron i live', () => {
  const cleanup = yml.slice(yml.indexOf('\n  cleanup:'));
  assert.match(cleanup, /needs: \[build, deploy\]/);
  assert.match(cleanup, /if: always\(\)/);
  assert.match(cleanup, /actions: write/);
  assert.match(cleanup, /actions\/runs\/\$GITHUB_RUN_ID\/artifacts/);
  assert.match(cleanup, /-X DELETE "repos\/\$GITHUB_REPOSITORY\/actions\/artifacts\/\{\}"/);
  assert.match(cleanup, /if: github\.event_name == 'schedule'[\s\S]*actions\/workflows\/pages\.yml\/enable/);
  assert.match(yml, /^concurrency:\n {2}group: pages\n {2}cancel-in-progress: false/m);
  assert.match(yml, /retention-days: 1/);
});

// Kør lækagetjekkets script mod et midlertidigt dist/site, så selve grep-logikken er afprøvet.
function runGuard(files, env = {}) {
  const start = lines.findIndex((l, i) => i > lines.findIndex(x => x.includes('name: Leak guard')) && /^ {8}run: \|$/.test(l));
  const script = [];
  for (const l of lines.slice(start + 1)) { if (l.trim() && !l.startsWith(' '.repeat(10))) break; script.push(l.slice(10)); }
  const dir = mkdtempSync(join(tmpdir(), 'im2027-guard-'));
  try {
    for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
    return spawnSync('bash', ['-eo', 'pipefail', '-c', script.join('\n')], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('lækagetjekket (kørt for alvor): rent site består; hemmeligheder og private ord uden for cal/ fejler; i cal/ er de tilladt', () => {
  const TOKEN = 'Zq9_syntetisk-token-0123456789abcdef', GIST = '0123456789abcdef0123456789abcdef';
  const env = { CAL_TOKEN: TOKEN, GIST_ID: GIST };
  const clean = { 'dist/site/index.html': '<p>Hej</p>', 'dist/site/app.1.js': MIDT_I_ORD, [`dist/site/cal/${TOKEN}/ironman-2027.ics`]: `${WORDS[0]} ${WORDS[1]} ${TOKEN} ${GIST}` };
  assert.equal(runGuard(clean, env).status, 0);
  assert.equal(runGuard(clean, {}).status, 0, 'uden secrets i env tjekkes kun de private ord');
  assert.equal(runGuard({ ...clean, 'dist/site/app.1.js': `x ${WORDS[0]}-cyklen` }, env).status, 1);
  assert.equal(runGuard({ ...clean, 'dist/site/index.html': `<p>${WORDS[1].toLowerCase()}</p>` }, env).status, 1);
  assert.equal(runGuard({ ...clean, 'dist/site/sw.js': `const t='${TOKEN}'` }, env).status, 1);
  assert.equal(runGuard({ ...clean, 'dist/site/manifest.webmanifest': GIST }, env).status, 1);
  assert.equal(runGuard({ 'dist/other.txt': 'x' }, env).status, 1, 'manglende dist/site fejler');
  const bad = runGuard({ ...clean, 'dist/site/sw.js': `const t='${TOKEN}'` }, env);
  assert.match(bad.stdout, /dist\/site\/sw\.js/);
  assert.ok(!(bad.stdout + bad.stderr).includes(TOKEN), 'filnavnet vises, aldrig værdien');
});
