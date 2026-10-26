import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { ROOT, TARGETS, bundleCss, bundleJs, exportNames, render, versionOf } from '../build/bundle.mjs';
import { assertArtifactContract, buildArtifact } from '../build/artifact.mjs';
import { buildSite } from '../build/site.mjs';
import { writeCalendar } from '../build/calendar.mjs';

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'im2027-build-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// Skriv en kildefil i tmp og returnér den absolutte sti (bundleJs accepterer absolutte stier).
let n = 0;
const mod = (src, name = `m${++n}.js`) => { const f = join(tmp, name); writeFileSync(f, src); return f; };
const opts = { target: 'site', version: 'v1' };
const scriptOf = html => html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];

test('modullisterne peger på filer der findes', () => {
  assert.deepEqual(Object.keys(TARGETS).sort(), ['artifact', 'site']);
  for (const t of Object.values(TARGETS)) for (const f of [t.shell, ...t.css, ...t.js]) assert.ok(existsSync(resolve(ROOT, f)), f);
});

test('bundleJs: import fjernes, exports deles på tværs af filer, BUILD er indlæst, rækkefølge = listen', () => {
  const a = mod(`export const A = 1;\nexport function f(x) { return x + A; }\nexport class K { get v() { return 7; } }\nexport async function g() { return 1; }\nexport function* gen() { yield 1; }\nexport let L = 'l';\n`);
  const b = mod(`import { f, A } from './a.js';\nexport const B = f(2) * 2;\n`);
  const c = mod(`import { B, K } from './b.js'; \nglobalThis.out = { B, v: new K().v, build: BUILD, strict: (function () { return this === undefined; })() };\n`);
  const js = bundleJs([a, b, c], opts);
  assert.ok(!/^\s*import\s/m.test(js));
  assert.ok(!/^\s*export\s/m.test(js));
  const ctx = {};
  vm.runInNewContext(js, ctx);
  assert.equal(ctx.out.B, 6);
  assert.equal(ctx.out.v, 7);
  assert.deepEqual({ ...ctx.out.build }, { target: 'site', version: 'v1' });
  assert.ok(Object.isFrozen(ctx.out.build));
  assert.equal(ctx.out.strict, true);
  assert.equal(typeof ctx.A, 'undefined', 'ingen globale lækager: alt ligger i ét ydre IIFE');
  assert.deepEqual(exportNames(readFileSync(a, 'utf8')), ['A', 'f', 'K', 'g', 'gen', 'L']);
});

test('bundleJs: linjenumre bevares, så stakspor passer til kildefilen', () => {
  const f = mod(`import { x } from './x.js';\n\nexport function boom() {\n  throw new Error('x');\n}\n`);
  const js = bundleJs([f], opts).split('\n');
  const at = js.findIndex(l => l.startsWith('const { boom }'));
  assert.equal(js[at + 1], '', 'import-linjen er blevet til en tom linje');
  assert.match(js[at + 3], /^function boom\(\)/);
});

test('bundleJs: kaster ved dobbelt eksport, default, { … }, *, var, flerlinjers import og BUILD', () => {
  const ok = mod('export const A = 1;\n');
  assert.throws(() => bundleJs([ok, mod('export function A() {}\n')], opts), /dobbelt eksport 'A'/);
  assert.throws(() => bundleJs([mod('export default function () {}\n')], opts), /m\d+\.js:1/);
  assert.throws(() => bundleJs([mod('const a = 1;\nexport { a };\n')], opts), /m\d+\.js:2/);
  assert.throws(() => bundleJs([mod("export * from './x.js';\n")], opts), /export/);
  assert.throws(() => bundleJs([mod('export var a = 1;\n')], opts), /export/);
  assert.throws(() => bundleJs([mod('export const { a } = {};\n')], opts), /export/);
  assert.throws(() => bundleJs([mod("import {\n  a,\n} from './x.js';\n")], opts), /import/);
  assert.throws(() => bundleJs([mod("import './x.js';\n")], opts), /import/);
  assert.throws(() => bundleJs([mod('export const BUILD = 1;\n')], opts), /BUILD/);
  assert.throws(() => bundleJs([ok], { target: 'site' }), /version/);
  assert.throws(() => bundleJs([ok], { version: 'v' }), /target/);
});

test('bundleJs: dynamisk import() og import-tekst i kommentarer er ikke import-sætninger', () => {
  const f = mod("const p = () => import('./x.js'); // import('./x.js')\n  // import { a } from 'b';\nexport const A = 1;\n");
  assert.doesNotThrow(() => bundleJs([f], opts));
});

test('bundleJs: </script kun forbudt i artifact-målet', () => {
  const f = mod("export const S = '</script>';\n");
  assert.throws(() => bundleJs([f], { target: 'artifact', version: 'v' }), /<\/script/);
  assert.doesNotThrow(() => bundleJs([f], { target: 'site', version: 'v' }));
});

test('bundleJs: en fil uden eksporter bliver en almindelig IIFE', () => {
  const js = bundleJs([mod('globalThis.hit = 1;\n')], opts);
  assert.ok(!/const \{/.test(js));
  const ctx = {};
  vm.runInNewContext(js, ctx);
  assert.equal(ctx.hit, 1);
});

test('hvert måls JS-bundle er gyldig syntaks, kolliderer ikke på eksportnavne og er deterministisk', () => {
  for (const [name, t] of Object.entries(TARGETS)) {
    const version = versionOf(t.js, name);
    assert.match(version, /^[0-9a-f]{12}$/);
    const js = bundleJs(t.js, { target: name, version });
    assert.doesNotThrow(() => new vm.Script(js, { filename: `${name}.js` }), name);
    assert.equal(bundleJs(t.js, { target: name, version }), js);
    assert.ok(js.includes(`const BUILD = Object.freeze({ target: "${name}", version: "${version}" });`));
  }
});

test('bundlerens eksportnavne = Nodes eksportnavne for plan.js, progress.js og pace.js', async () => {
  for (const f of ['src/plan.js', 'src/progress.js', 'src/pace.js']) {
    const viaBundler = exportNames(readFileSync(resolve(ROOT, f), 'utf8'), f).sort();
    const viaNode = Object.keys(await import('../' + f)).sort();
    assert.deepEqual(viaBundler, viaNode, f);
  }
});

test('bundleCss samler filerne og afviser </style', () => {
  const css = bundleCss(TARGETS.artifact.css);
  assert.ok(css.startsWith(readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8')));
  assert.throws(() => bundleCss([mod('a { }\n</style>\n', 'x.css')]), /<\/style/);
});

test('render: ét gennemløb, ingen $-tolkning, krav om at pladsholdere og værdier passer', () => {
  const shell = join(tmp, 'shell.html');
  writeFileSync(shell, '<style>\n/*STYLES*/\n</style>\n<!--BODY-->\n<script>\n/*SCRIPT*/\n</script>\n');
  const rel = shell; // absolut sti virker også
  const out = render(rel, { body: '<p>$& $1 /*SCRIPT*/</p>', styles: 'a{}', script: "x('$`');" });
  assert.equal(out, "<style>\na{}\n</style>\n<p>$& $1 /*SCRIPT*/</p>\n<script>\nx('$`');\n</script>\n");
  assert.throws(() => render(rel, { body: 'b', styles: 's' }), /\/\*SCRIPT\*\//);
  assert.throws(() => render(rel, { body: 'b', styles: 's', script: 'j', appJs: 'a.js' }), /appJs/);
  assert.doesNotThrow(() => render(rel, { body: 'b', styles: 's', script: 'j', appJs: undefined }));
});

test('src/app.html er kun krop-markup; skallerne har pladsholderne', () => {
  const body = readFileSync(resolve(ROOT, 'src/app.html'), 'utf8');
  assert.ok(body.startsWith('<main class="wrap"'), 'siden har et <main>-landmærke');
  assert.equal((body.match(/<main\b/g) || []).length, 1);
  assert.equal((body.match(/<\/main>/g) || []).length, 1);
  assert.ok(!/<(?:!doctype|html|head|body|title|meta|link|style|script)[\s>]/i.test(body));
  const art = readFileSync(resolve(ROOT, TARGETS.artifact.shell), 'utf8');
  for (const p of ['<!--BODY-->', '/*STYLES*/', '/*SCRIPT*/']) assert.equal(art.split(p).length, 2, p);
  const site = readFileSync(resolve(ROOT, TARGETS.site.shell), 'utf8');
  for (const p of ['<!--BODY-->', '/*STYLES*/', '__APP_JS__']) assert.equal(site.split(p).length, 2, p);
});

test('artifact-kontrakten: starter med <title>, ingen doctype/html/head/body (men <header> er fint)', () => {
  assert.doesNotThrow(() => assertArtifactContract('<title>x</title>\n<header class="bib"></header>'));
  assert.throws(() => assertArtifactContract('<!doctype html><title>x</title>'), /title|doctype/);
  assert.throws(() => assertArtifactContract('<title>x</title><html lang="da">'), /html/);
  assert.throws(() => assertArtifactContract('<title>x</title><HEAD>'), /head/i);
  assert.throws(() => assertArtifactContract('<title>x</title><body class="a">'), /body/);
  assert.throws(() => assertArtifactContract('\n<title>x</title>'), /title/);
});

test('buildArtifact: gyldig inline-script, kontrakten holder, og to bygninger er byte-identiske', async () => {
  const d1 = join(tmp, 'art1'), d2 = join(tmp, 'art2');
  const r1 = await buildArtifact({ outDir: d1 });
  const r2 = await buildArtifact({ outDir: d2 });
  const html = readFileSync(join(d1, 'index.html'), 'utf8');
  assert.deepEqual(r1, r2);
  assert.match(r1.version, /^[0-9a-f]{12}$/);
  assert.equal(r1.bytes, Buffer.byteLength(html));
  assert.equal(html, readFileSync(join(d2, 'index.html'), 'utf8'));
  assert.ok(html.startsWith('<title>Ironman 2027</title>'));
  assert.equal((html.match(/<main\b/g) || []).length, 1, 'ét <main>-landmærke også i Artifact');
  assert.ok(!/<(?:!doctype|html|head|body)[\s>]/i.test(html));
  assert.ok(html.includes('fonts.googleapis.com'), 'artifact bruger stadig Google Fonts');
  assert.doesNotThrow(() => assertArtifactContract(html));
  const script = scriptOf(html);
  assert.doesNotThrow(() => new vm.Script(script, { filename: 'artifact-inline.js' }));
  assert.ok(script.includes(`target: "artifact", version: "${r1.version}"`));
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.ok(!html.includes('/*STYLES*/') && !html.includes('/*SCRIPT*/') && !html.includes('<!--BODY-->'));
  // den eksisterende app-logik er uændret med: db-collection `progress`, v1-nøglen og Artifact-db'en
  assert.ok(script.includes("db.doc('progress/' + wk)") && script.includes("'im2027-progress'") && script.includes("claude.use('db')"));
  assert.ok(script.includes('// ---- src/progress.js ----') && script.includes('const { FORMAT, SCHEMA'));
});

test('artifact-bundlen kører i en DOM-løs kontekst uden at kaste ved indlæsning af modulerne før app.js', () => {
  // Alt før app.js (plan, progress, stubs) må være ren logik uden bivirkninger.
  const t = TARGETS.artifact;
  const pre = t.js.slice(0, t.js.indexOf('src/app.js'));
  const js = bundleJs(pre, { target: 'artifact', version: 'v' });
  assert.doesNotThrow(() => vm.runInNewContext(js, {}));
  const jsSite = bundleJs(TARGETS.site.js.filter(f => f !== 'src/app.js' && f !== 'src/pwa.js'), { target: 'site', version: 'v' });
  assert.doesNotThrow(() => vm.runInNewContext(jsSite, {}));
});

test('build-modulerne eksporterer de endelige funktioner (2a og 2c udfylder dem)', () => {
  assert.equal(typeof buildArtifact, 'function');
  assert.equal(typeof buildSite, 'function');
  assert.equal(typeof writeCalendar, 'function');
});

test('build.mjs afviser ukendt mål uden at skrive noget', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'build.mjs'), '--target=bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Ukendt mål 'bogus'/);
});
