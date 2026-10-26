// Fanerne (src/app.html, src/app.js, src/views.css): bundmenu i begge bygninger, hash-routing og indholdet i hver fane.
// app.js køres i vm med den falske DOM (test/app-harness.mjs); HTML og CSS læses som tekst, for den falske DOM parser ikke markup.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArtifact } from '../build/artifact.mjs';
import { buildSite } from '../build/site.mjs';
import { ROUTES } from '../src/views.js';
import { loadApp } from './app-harness.mjs';

const SRC_HTML = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const VIEWS_CSS = readFileSync(new URL('../src/views.css', import.meta.url), 'utf8');
const LABELS = { idag: 'I dag', kalender: 'Kalender', kost: 'Kost', analyse: 'Analyse', mere: 'Mere' };
const weekOf = $ => /<span class="wn">Uge (\d+)<\/span>/.exec($('agenda').innerHTML)?.[1];
const current = app => ROUTES.filter(r => app.$('tab-' + r).getAttribute('aria-current') === 'page');

let tmp, artifactHtml, siteHtml;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'im2027-tabs-'));
  await buildArtifact({ outDir: join(tmp, 'artifact') });
  await buildSite({ outDir: join(tmp, 'site'), warn: () => {} });
  artifactHtml = readFileSync(join(tmp, 'artifact', 'index.html'), 'utf8');
  siteHtml = readFileSync(join(tmp, 'site', 'index.html'), 'utf8');
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// ---- Bundmenuen findes i begge bygninger ----

test('tabbar: en <nav> med fem links, SVG-ikon og dansk label, i både Artifact- og site-bygningen', () => {
  for (const [name, html] of [['artifact', artifactHtml], ['site', siteHtml]]) {
    const nav = /<nav class="tabbar" id="tabbar" aria-label="Hovedmenu">([\s\S]*?)<\/nav>/.exec(html);
    assert.ok(nav, `${name}: menuen findes`);
    const links = [...nav[1].matchAll(/<a class="tab" id="tab-(\w+)" href="#(\w+)">(<svg[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>)<span>([^<]+)<\/span><\/a>/g)];
    assert.deepEqual(links.map(m => m[1]), ROUTES, `${name}: rækkefølge`);
    for (const [, id, href, svg, label] of links) {
      assert.equal(href, id, 'linket peger på fanens eget token');
      assert.equal(label, LABELS[id]);
      assert.match(svg, /<(?:path|circle|rect)\b/, `${name}/${id}: ikonet har indhold`);
    }
    assert.equal((html.match(/<nav\b/g) || []).length, 1);
    assert.ok(html.indexOf('</main>') < html.indexOf('<nav class="tabbar"'), `${name}: menuen ligger uden for <main>`);
  }
});

test('tabbar: ingen inline handlers, ingen "settings"-token og alle fem visninger har deres eget id', () => {
  for (const html of [artifactHtml, siteHtml]) {
    assert.doesNotMatch(html, /href="#settings"|id="settings"|#settings(?!Mount)\b/);
    for (const r of ROUTES) assert.equal((html.match(new RegExp(`<section class="view" id="${r}"`, 'g')) || []).length, 1, r);
  }
  assert.doesNotMatch(SRC_HTML, /\son[a-z]+\s*=|<script/i);
});

test('tabbar CSS: fast i bunden, mindst 44 px høje mål, sikkert område, aktiv tilstand, og indholdet får luft under menuen', () => {
  assert.match(VIEWS_CSS, /\.tabbar \{[^}]*position: fixed[^}]*bottom: 0/);
  assert.match(VIEWS_CSS, /\.tabbar \{[^}]*padding:[^;]*env\(safe-area-inset-bottom/);
  assert.ok(+/--tabbar-h: (\d+)px/.exec(VIEWS_CSS)[1] >= 44);
  assert.match(VIEWS_CSS, /\.tab \{[^}]*min-height: var\(--tabbar-h\)/);
  assert.match(VIEWS_CSS, /\.tab\[aria-current="page"\]/);
  assert.match(VIEWS_CSS, /\.wrap \{[^}]*padding-bottom: calc\(var\(--bar-b\) \+ \d+px\)/);
  assert.match(VIEWS_CSS, /\[hidden\] \{ display: none !important; \}/);
  assert.match(VIEWS_CSS, /@media \(min-width: 900px\)[\s\S]*--bar-b: 0px/, 'på brede skærme flytter menuen til siden, og så er der intet at skjule i bunden');
  assert.match(VIEWS_CSS, /prefers-reduced-motion/);
});

test('begge bygninger har views.css med, og site-toasten løftes over menuen', () => {
  for (const html of [artifactHtml, siteHtml]) assert.ok(html.includes('.tabbar { position: fixed;'));
  assert.match(siteHtml, /\.pwa-layer \{[^}]*bottom: var\(--bar-b, 0px\)/);
});

// ---- Routing ----

test('standard: uden hash vises kun I dag, topbjælken er skjult, og I dag-fanen er aktiv', () => {
  for (const target of ['site', 'artifact']) {
    const app = loadApp({ target });
    assert.deepEqual(app.views(), ['idag'], target);
    assert.deepEqual(current(app), ['idag']);
    assert.equal(app.$('topbar').hidden, true);
  }
});

test('hver hash viser præcis én visning, markerer sin fane og sætter titlen i topbjælken', () => {
  const app = loadApp();
  for (const r of ROUTES) {
    app.go('#' + r);
    assert.deepEqual(app.views(), [r], `#${r}`);
    assert.deepEqual(current(app), [r]);
    assert.equal(app.$('topbar').hidden, r === 'idag', 'race-headeren på I dag, ellers den slanke topbjælke');
    assert.equal(app.$('topTitle').textContent, LABELS[r]);
    assert.equal(app.$('settingsTop').hidden, r === 'mere', '⚙ er overflødig på Mere selv');
  }
  const direct = ROUTES.map(r => loadApp({ hash: '#' + r }).views());
  assert.deepEqual(direct, ROUTES.map(r => [r]), 'dybe links ved start');
});

test('ukendt hash viser I dag: ved start og ved skift, også "#settings" (reserveret af claude.ai-viseren)', () => {
  for (const h of ['#settings', '#noget-helt-andet', '#u99', '#u00', '#/kost']) {
    assert.deepEqual(loadApp({ hash: h }).views(), ['idag'], `start på ${h}`);
    const app = loadApp({ hash: '#kost' });
    app.go(h);
    assert.deepEqual(app.views(), ['idag'], `skift til ${h}`);
    assert.deepEqual(current(app), ['idag']);
  }
});

test('ugelink (#u12) åbner kalenderen ved den uge, ved start og ved skift; kalenderfanen uden uge bevarer den valgte uge', () => {
  const start = loadApp({ hash: '#u12' });
  assert.deepEqual(start.views(), ['kalender']);
  assert.deepEqual(current(start), ['kalender']);
  assert.equal(weekOf(start.$), '12');
  assert.match(start.$('agenda').innerHTML, /Uge 12/);
  const app = loadApp();
  assert.equal(weekOf(app.$), '2', 'denne uge (2. nov. 2026)');
  app.go('#u05');
  assert.deepEqual(app.views(), ['kalender']);
  assert.equal(weekOf(app.$), '5');
  app.go('#analyse');
  app.go('#kalender');
  assert.equal(weekOf(app.$), '5', 'ugen man sidst så, bevares');
  app.go('#u43');
  assert.equal(weekOf(app.$), '43');
  app.go('#u1');
  assert.deepEqual(app.views(), ['idag'], 'u1 er ikke et gyldigt ugelink');
});

test('tilbage-knappen: hashen går tilbage til en tidligere fane, og tom hash er I dag', () => {
  const app = loadApp();
  app.go('#kost');
  app.go('#analyse');
  app.go('#kost'); // browserens tilbage-knap sætter bare hashen til den forrige og melder hashchange
  assert.deepEqual(app.views(), ['kost']);
  app.go('');
  assert.deepEqual(app.views(), ['idag']);
  assert.deepEqual(current(app), ['idag']);
});

test('søjlerne i Analyse åbner kalenderen ved den uge (og ændrer hashen til #kalender)', () => {
  const app = loadApp({ hash: '#analyse' });
  app.$('bars').dispatch('click', { target: { closest: sel => (sel === '[data-wk]' ? { dataset: { wk: '9' } } : null) } });
  assert.deepEqual(app.views(), ['kalender']);
  assert.equal(app.location.hash, '#kalender');
  assert.equal(weekOf(app.$), '10');
  app.go('#analyse');
  app.go('#kalender');
  assert.equal(weekOf(app.$), '10');
});

test('Analyse tegner grafen, når fanen vises (den kan ikke måles, mens den er skjult)', () => {
  const app = loadApp();
  assert.ok(app.$('bars').innerHTML.includes('Timer pr. uge'));
  const hidden = loadApp();
  hidden.$('pmc').clientWidth = 0; // som i en browser, mens fanen er skjult
  hidden.$('pmc').innerHTML = 'MARK';
  hidden.doc.fire('visibilitychange');
  hidden.go('#kost');
  assert.equal(hidden.$('pmc').innerHTML, 'MARK', 'en skjult fane tegnes ikke om');
  hidden.$('pmc').clientWidth = 380;
  hidden.go('#analyse');
  assert.notEqual(hidden.$('pmc').innerHTML, 'MARK');
  assert.match(hidden.$('pmc').innerHTML, /<svg viewBox="0 0 380 230"/);
});

// ---- Indhold i Mere og monteringspunkter ----

test('Mere indeholder vægtfeltet, synk-status og eksport/import (site og Artifact)', () => {
  for (const target of ['site', 'artifact']) {
    const app = loadApp({ target, hash: '#mere' });
    assert.deepEqual(app.views(), ['mere']);
    const pane = app.pane();
    assert.ok(pane.byId('setWeight'), `${target}: vægtfeltet`);
    assert.ok(pane.buttons('Gem vægt')[0] && pane.buttons('Eksportér')[0] && pane.buttons('Importér')[0]);
    assert.match(pane.textContent, /Din vægt \(kg\)/);
  }
});

test('Mere: kalenderabonnement uden hemmelig URL, zoner, regler, skema og versionsinfo', () => {
  const app = loadApp({ hash: '#mere' });
  const sub = app.$('calSub').innerHTML;
  assert.match(sub, /Linket er hemmeligt og står ikke her/);
  assert.match(sub, /noter/);
  assert.match(sub, /docs\/guides/);
  assert.ok(sub.includes('docs/guides/kalender-iphone.md') && sub.includes('docs/guides/kalender-google.md'));
  assert.doesNotMatch(sub, /webcal|\/cal\/|\.ics|token=|CAL_TOKEN/i);
  assert.ok(app.$('zones').innerHTML.includes('<th>Løb /km</th>'));
  assert.ok(app.$('zonesNote').textContent.includes('tærskelløb'));
  for (const text of ['<h2 id="mRules">Regler</h2>', '<h2 id="mSched">Dit skema</h2>', '10-minutters-reglen', 'id="aboutVersion"']) assert.ok(SRC_HTML.includes(text), text);
  assert.equal(app.$('aboutVersion').textContent, 'Version test · app');
  assert.equal(loadApp({ target: 'artifact' }).$('aboutVersion').textContent, 'Version test · Artifact');
});

test('Kalender og Kost har deres eksisterende indhold: ugegitter, dagsliste, kostchips og guiden', () => {
  const app = loadApp({ hash: '#kalender' });
  assert.match(app.$('grid').innerHTML, /class="gw now" id="g-u02"/);
  assert.match(app.$('agenda').innerHTML, /Uge 2/);
  assert.ok(SRC_HTML.includes('id="prevWk"') && SRC_HTML.includes('id="nextWk"') && SRC_HTML.includes('id="todayBtn"'));
  app.$('nextWk').click();
  assert.equal(weekOf(app.$), '3');
  assert.match(app.$('kostGuide').innerHTML, /Dag for dag/);
});

test('monteringspunkter til næste opgave: #advice og #addWorkout findes på I dag og er tomme', () => {
  assert.ok(SRC_HTML.includes('<section id="advice"></section>'));
  assert.ok(SRC_HTML.includes('<div id="addWorkout"></div>'));
  const idag = SRC_HTML.slice(SRC_HTML.indexOf('<section class="view" id="idag"'), SRC_HTML.indexOf('<section class="view" id="kalender"'));
  assert.ok(idag.includes('id="advice"') && idag.includes('id="addWorkout"'), 'begge ligger i I dag');
  assert.match(VIEWS_CSS, /#advice:empty, #addWorkout:empty \{ display: none; \}/, 'tomme punkter fylder ikke');
  const app = loadApp();
  assert.equal(app.$('advice').innerHTML, '');
  assert.equal(app.$('addWorkout').innerHTML, '');
});

test('overholdelsen i kalenderen er uændret: afkrydsning farver kortet og tæller i headeren', () => {
  const app = loadApp();
  assert.equal(app.$('ptext').textContent.startsWith('0 af '), true);
  app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: 'u02-1-0' } } : null) } });
  assert.equal(app.$('ptext').textContent.startsWith('1 af '), true);
});
