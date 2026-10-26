// Fanerne (src/app.html, src/app.js, src/views.css): bundmenu i begge bygninger, hash-routing og indholdet i hver fane.
// app.js køres i vm med den falske DOM (test/app-harness.mjs); HTML og CSS læses som tekst, for den falske DOM parser ikke markup.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArtifact } from '../build/artifact.mjs';
import { buildSite } from '../build/site.mjs';
import { plan } from '../src/plan.js';
import { WEIGHT_KEY, weekKcalAverage } from '../src/nutrition.js';
import { ROUTES } from '../src/views.js';
import { memoryStorage } from './dom-harness.mjs';
import { loadApp } from './app-harness.mjs';

const weeks = plan();

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

test('monteringspunkter: #advice og #addWorkout ligger i I dag; tomme uden indhold, og "+ Tilføj træning" tegnes kun inden for planen', () => {
  assert.ok(SRC_HTML.includes('<section id="advice"></section>'));
  assert.ok(SRC_HTML.includes('<div id="addWorkout"></div>'));
  const idag = SRC_HTML.slice(SRC_HTML.indexOf('<section class="view" id="idag"'), SRC_HTML.indexOf('<section class="view" id="kalender"'));
  assert.ok(idag.includes('id="advice"') && idag.includes('id="addWorkout"'), 'begge ligger i I dag');
  assert.match(VIEWS_CSS, /#advice:empty, #addWorkout:empty \{ display: none; \}/, 'tomme punkter fylder ikke');
  const app = loadApp();
  assert.equal(app.$('advice').innerHTML, '', 'ingen råd uden logs');
  assert.equal(app.$('addWorkout').innerHTML, '<button type="button" class="btn add-btn" data-add>+ Tilføj træning</button>');
  for (const now of ['2026-10-20T10:00:00', '2027-09-01T10:00:00']) assert.equal(loadApp({ now }).$('addWorkout').innerHTML, '', `uden for planen (${now}): ingen knap`);
});

test('overholdelsen i kalenderen er uændret: afkrydsning farver kortet og tæller i headeren', () => {
  const app = loadApp();
  assert.equal(app.$('ptext').textContent.startsWith('0 af '), true);
  app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: 'u02-1-0' } } : null) } });
  assert.equal(app.$('ptext').textContent.startsWith('1 af '), true);
});

// ---- Kost: dagens og ugens mål ----

const SAT = '2026-11-07T10:00:00';
const W70 = () => ({ storage: memoryStorage({ [WEIGHT_KEY]: '70' }) });
const WEIGHT_BTN = '<button type="button" class="linkbtn" data-weight>Angiv vægt</button>';
const tiles = html => Object.fromEntries([...html.matchAll(/<div class="kt-l">([^<]+)<\/div><div class="kt-v num">([^<]*)<\/div><div class="kt-s">((?:[^<]|<(?!\/div>))*)<\/div>/g)].map(m => [m[1], { v: m[2], s: m[3] }]));

test('Kost med vægt: dagens mål i kcal og gram (energi, kulhydrat, protein) og dagtype', () => {
  const app = loadApp({ now: SAT, ...W70() });
  const html = app.$('kostToday').innerHTML;
  assert.match(html, /<h3>I dag · Lørdag 7\. nov\.<\/h3>/);
  assert.match(html, /<span class="kc k-moderat">Moderat<\/span><span class="kt-min">Træning 1:10 t<\/span>/);
  const t = tiles(html);
  assert.deepEqual(t.Energi, { v: '3.100–3.450 kcal', s: 'estimat, ±5 %' });
  assert.equal(t.Kulhydrat.v, `${420}–${700} g`);
  assert.equal(t.Kulhydrat.s, `${6}–${10} g/kg`);
  assert.equal(t.Protein.v, 'ca. 110 g');
  assert.equal(t.Protein.s, 'ramme 84–140 g');
  assert.doesNotMatch(html, /Angiv vægt|data-weight/);
});

test('Kost uden vægt: g/kg og en "Angiv vægt"-knap i stedet for kcal og gram', () => {
  const app = loadApp({ now: SAT });
  const html = app.$('kostToday').innerHTML;
  const t = tiles(html);
  assert.equal(t.Energi.v, '–');
  assert.ok(t.Energi.s.includes(`${WEIGHT_BTN} for kcal`));
  assert.equal(t.Kulhydrat.v, `${6}–${10} g/kg`);
  assert.equal(t.Protein.v, '1,6 g/kg');
  assert.equal(t.Protein.s, 'ramme 1,2–2 g/kg');
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script/i);
  assert.ok(app.$('kostWeek').innerHTML.includes(`Uden vægt vises g/kg. ${WEIGHT_BTN} for kcal og gram.`));
});

test('Kost: ugens mål har en række pr. dag, markerer i dag og har først en energi-kolonne, når vægten er kendt', () => {
  const withW = loadApp({ now: SAT, ...W70() });
  const html = withW.$('kostWeek').innerHTML;
  assert.match(html, /<h3>Denne uge · uge 2<\/h3>/);
  assert.equal((html.match(/<tr(?: class="today" aria-current="date")?><th scope="row">/g) || []).length, 7);
  assert.equal((html.match(/aria-current="date"/g) || []).length, 1);
  assert.match(html, /<tr class="today" aria-current="date"><th scope="row">Lør <small>7\. nov\.<\/small><span class="kc k-moderat">Moderat<\/span><\/th><td class="num">3\.100–3\.450<\/td><td class="num">420–700 g<\/td><td class="num">ca\. 110 g<\/td><\/tr>/);
  assert.match(html, /<th scope="col">Energi<\/th><th scope="col">Kulhydrat<\/th><th scope="col">Protein<\/th>/);
  const w = weeks[1];
  assert.ok(html.includes(`Gennemsnit pr. dag: ${weekKcalAverage(w.days, w.start, 70).text} (estimat)`));
  const none = loadApp({ now: SAT });
  assert.doesNotMatch(none.$('kostWeek').innerHTML, /<th scope="col">Energi<\/th>|kcal<\/td>/);
  assert.match(none.$('kostWeek').innerHTML, /<th scope="col">Kulhydrat<\/th><th scope="col">Protein<\/th>/);
  assert.doesNotMatch(none.$('kostWeek').innerHTML, /Gennemsnit pr\. dag/);
});

test('Kost: hviledag, opladningsdag og løbsdag får de rigtige forklaringer i stedet for et kcal-tal', () => {
  const rest = loadApp({ now: '2026-11-02T10:00:00', ...W70() }).$('kostToday').innerHTML;
  assert.match(rest, /Ingen træning/);
  assert.match(rest, /k-hvile/);
  const load = loadApp({ now: '2027-08-20T10:00:00', ...W70() }).$('kostToday').innerHTML;
  assert.equal(tiles(load).Energi.v, '–');
  assert.equal(tiles(load).Energi.s, 'ikke et kcal-mål');
  assert.match(load, /k-opladning/);
  assert.match(load, /Kulhydratmålet gælder, ikke et kcal-mål/);
  const race = loadApp({ now: '2027-08-22T08:00:00', ...W70() }).$('kostToday').innerHTML;
  assert.equal(tiles(race).Energi.s, 'se løbsdagsplanen');
  assert.equal(tiles(race).Kulhydrat.v, '–');
  assert.match(race, /Løbets energiunderskud kan ikke lukkes/);
});

test('Kost: ny vægt i Mere tegner dagens og ugens mål om med det samme, og en ny dag følger med', () => {
  const app = loadApp({ now: SAT });
  assert.equal(tiles(app.$('kostToday').innerHTML).Energi.v, '–');
  app.pane().byId('setWeight').value = '70';
  app.pane().buttons('Gem vægt')[0].click();
  assert.equal(tiles(app.$('kostToday').innerHTML).Energi.v, '3.100–3.450 kcal');
  assert.match(app.$('kostWeek').innerHTML, /<th scope="col">Energi<\/th>/);
  app.clock.set('2026-11-08T07:00:00');
  app.doc.fire('visibilitychange');
  assert.match(app.$('kostToday').innerHTML, /Søndag 8\. nov\./);
  assert.match(app.$('kostWeek').innerHTML, /<tr class="today" aria-current="date"><th scope="row">Søn /);
  assert.equal((app.$('kostWeek').innerHTML.match(/aria-current="date"/g) || []).length, 1);
});

test('Kost: guiden er stadig med, og før planstart og efter løbet er der en forklaring i stedet for dagens mål', () => {
  const app = loadApp({ now: SAT, hash: '#kost' });
  assert.deepEqual(app.views(), ['kost']);
  assert.match(app.$('kostGuide').innerHTML, /Før, under og efter/);
  assert.ok(SRC_HTML.includes('<details class="guide-wrap" id="kostWrap">'));
  assert.match(loadApp({ now: '2026-10-20T10:00:00' }).$('kostToday').innerHTML, /Planen starter 26\. okt\./);
  assert.match(loadApp({ now: '2026-10-20T10:00:00' }).$('kostWeek').innerHTML, /Første uge · uge 1/);
  assert.match(loadApp({ now: '2027-09-01T10:00:00' }).$('kostToday').innerHTML, /Planen er slut\./);
});

// ---- Analyse: overholdelse pr. sport ----

const SPORT_NAME = { swim: 'Svømning', bike: 'Cykling', run: 'Løb', str: 'Styrke', race: 'Konkurrence' };
const dur = m => m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} t` : `${m} min`;
// Planlagt før dag-indeks `today`: { sport: { n, min } } udregnet direkte af planen
const plannedBefore = today => {
  const out = {};
  weeks.forEach((w, wi) => w.days.forEach((d, di) => { if (wi * 7 + di < today) d.forEach(s => { if (s.s !== 'rest') { out[s.s] ??= { n: 0, min: 0 }; out[s.s].n++; out[s.s].min += s.m; } }); }));
  return out;
};
const rowOf = (html, sport) => new RegExp(`<tr><th scope="row"><span class="sp c-${sport}">${SPORT_NAME[sport]}</span></th><td class="num">([^<]*)</td><td class="num">([^<]*)</td><td class="cp"><span class="cbar" aria-hidden="true"><i class="t-(\\w+)" style="width:(\\d+)%"></i></span><b class="num">([^<]*)</b></td></tr>`).exec(html)?.slice(1);
// Alle pas før dag-indeks `today` gennemført; factor ≠ 1 skriver factor × de planlagte minutter
const doneUpTo = (today, factor = 1) => ({
  v: 2,
  weeks: Object.fromEntries(weeks.map((w, wi) => [w.id, Object.fromEntries(w.days.flatMap((d, di) => (wi * 7 + di >= today ? [] : d.flatMap((s, si) => (s.s === 'rest' ? [] : [[`${di}-${si}`,
    { done: true, updatedAt: '2026-11-01T10:00:00.000Z', ...(factor === 1 ? {} : { min: Math.round(s.m * factor) }) }]])))))]).filter(([, wk]) => Object.keys(wk).length)),
});

test('Analyse: overholdelsen viser pas og minutter pr. sport (gennemført / planlagt indtil nu) og i alt', () => {
  const app = loadApp({ now: SAT, hash: '#analyse' });
  const html = app.$('compliance').innerHTML;
  const exp = plannedBefore(12);
  assert.deepEqual(Object.keys(exp).sort(), ['bike', 'run', 'str', 'swim']);
  for (const [sport, { n, min }] of Object.entries(exp)) assert.deepEqual(rowOf(html, sport), [`0/${n}`, `0 min / ${dur(min)}`, 'miss', '0', '0 %'], sport);
  assert.equal(rowOf(html, 'race'), undefined, 'ingen konkurrence planlagt endnu');
  const total = Object.values(exp).reduce((a, r) => ({ n: a.n + r.n, min: a.min + r.min }), { n: 0, min: 0 });
  assert.ok(html.includes(`<tr class="total"><th scope="row">Alle</th><td class="num">0/${total.n}</td><td class="num">0 min / ${dur(total.min)}</td>`));
  assert.match(html, /<th scope="col">Sport<\/th><th scope="col">Pas<\/th><th scope="col">Minutter<\/th><th scope="col">Overholdt<\/th>/);
  assert.match(html, /Planlagt til og med i går, plus det du har gennemført i dag/);
  assert.ok(SRC_HTML.includes('id="compliance"') && SRC_HTML.includes('Overholdelse'));
});

test('Analyse: logningen tæller med (skrevne minutter slår planen), og i dag tæller kun, når passet er gennemført', () => {
  const app = loadApp({ now: SAT, hash: '#analyse' });
  const key = 'u02-1-0'; // tirsdag: Roligt løb med strides, 30 min planlagt
  app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: key } } : null) } });
  let html = app.$('compliance').innerHTML;
  const exp = plannedBefore(12);
  assert.deepEqual(rowOf(html, 'run'), [`1/${exp.run.n}`, `30 min / ${dur(exp.run.min)}`, 'miss', String(Math.round(3000 / exp.run.min)), `${Math.round(3000 / exp.run.min)} %`]);
  // i dag (lørdag): et gennemført pas tæller både som planlagt og gennemført
  app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: 'u02-5-0' } } : null) } });
  html = app.$('compliance').innerHTML;
  assert.deepEqual(rowOf(html, 'bike').slice(0, 2), [`1/${exp.bike.n + 1}`, `1:00 t / ${dur(exp.bike.min + 60)}`]);
});

test('Analyse: farven følger overholdelsen (grøn fra 90 %, gul fra 60 %, ellers rød), og alt gennemført giver 100 %', () => {
  const all = loadApp({ now: SAT, storage: memoryStorage({ 'im2027-progress-v2': JSON.stringify(doneUpTo(12)) }), hash: '#analyse' });
  const exp = plannedBefore(12);
  for (const [sport, { n, min }] of Object.entries(exp)) assert.deepEqual(rowOf(all.$('compliance').innerHTML, sport), [`${n}/${n}`, `${dur(min)} / ${dur(min)}`, 'ok', '100', '100 %'], sport);
  assert.match(all.$('compliance').innerHTML, /<tr class="total">.*<b class="num">100 %<\/b>/);
  // skrevne minutter på 95 %, 70 % og 40 % af planen giver grøn, gul og rød
  for (const [factor, tone] of [[0.95, 'ok'], [0.7, 'warn'], [0.4, 'miss']]) {
    const app = loadApp({ now: SAT, storage: memoryStorage({ 'im2027-progress-v2': JSON.stringify(doneUpTo(12, factor)) }) });
    const [done, , cls, , label] = rowOf(app.$('compliance').innerHTML, 'run');
    assert.equal(done, `${exp.run.n}/${exp.run.n}`, 'alle pas er gennemført, kun minutterne er færre');
    assert.equal(cls, tone, `${factor}`);
    assert.ok(Math.abs(parseInt(label, 10) - factor * 100) <= 3, `${factor}: ${label}`);
  }
});

test('Analyse: før planstart er der intet at overholde, og beskeden forklarer det', () => {
  const app = loadApp({ now: '2026-10-20T10:00:00' });
  assert.match(app.$('compliance').innerHTML, /Der er ingen planlagte pas endnu/);
  assert.doesNotMatch(app.$('compliance').innerHTML, /<table/);
});

test('Analyse har stadig PMC-graf og timer pr. uge, og overholdelsen ligger i samme fane', () => {
  const app = loadApp({ now: SAT, hash: '#analyse' });
  assert.deepEqual(app.views(), ['analyse']);
  assert.match(app.$('pmc').innerHTML, /Planlagt fitness, træthed og friskhed/);
  assert.ok(app.$('bars').innerHTML.includes('Timer pr. uge'));
  const analyse = SRC_HTML.slice(SRC_HTML.indexOf('<section class="view" id="analyse"'), SRC_HTML.indexOf('<section class="view" id="mere"'));
  assert.ok(analyse.includes('id="perf"') && analyse.includes('id="compliance"'));
});

// ---- Links ----

const clickLink = (app, href, extra = {}) => { let prevented = false; app.doc.fire('click', { target: { closest: sel => (sel === 'a[href^="#"]' ? { getAttribute: () => href } : null) }, preventDefault: () => { prevented = true; }, ...extra }); return prevented; };

test('klik på et fane- eller ugelink skifter fane og sætter hashen; modifikatortryk og midterklik overlades til browseren', () => {
  const app = loadApp();
  assert.equal(clickLink(app, '#kost'), true);
  assert.deepEqual(app.views(), ['kost']);
  assert.equal(app.location.hash, '#kost');
  assert.equal(clickLink(app, '#u07'), true);
  assert.deepEqual(app.views(), ['kalender']);
  assert.equal(weekOf(app.$), '7');
  assert.equal(app.location.hash, '#u07');
  for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
    assert.equal(clickLink(app, '#analyse', extra), false);
    assert.deepEqual(app.views(), ['kalender'], JSON.stringify(extra));
  }
  clickLink(app, '#noget-ukendt');
  assert.deepEqual(app.views(), ['idag']);
});

test('låst adresselinje (hash kan ikke sættes): fanerne virker alligevel, og indstillingsknapperne åbner Mere', () => {
  const app = loadApp();
  Object.defineProperty(app.location, 'hash', { get: () => '', set: () => { throw new Error('låst'); } });
  clickLink(app, '#analyse');
  assert.deepEqual(app.views(), ['analyse']);
  assert.deepEqual(current(app), ['analyse']);
  app.$('settingsBtn').click();
  assert.deepEqual(app.views(), ['mere']);
  const stuck = loadApp();
  Object.defineProperty(stuck.location, 'hash', { get: () => '', set: () => {} }); // ignoreres uden fejl
  clickLink(stuck, '#u12');
  assert.deepEqual(stuck.views(), ['kalender']);
  assert.equal(weekOf(stuck.$), '12');
});
