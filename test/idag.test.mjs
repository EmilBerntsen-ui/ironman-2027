// Fanen I dag (src/app.js: paintToday): dagens pas, stat-kort, ugens fremdrift og næste nøglepas, for faste falske datoer.
// Lørdag 7. nov. 2026 er dag 13 (indeks 12) i planen: uge 2, "Lang cykeltur" og "Brick-løb". Mandag 2. nov. er en hviledag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, pmc, plan, plannedDailyTss, START, tss } from '../src/plan.js';
import { WEIGHT_KEY, sessionFueling } from '../src/nutrition.js';
import { memoryStorage } from './dom-harness.mjs';
import { loadApp } from './app-harness.mjs';

const weeks = plan();
const planned = pmc(plannedDailyTss(weeks));
const SAT = '2026-11-07T10:00:00', MON = '2026-11-02T10:00:00';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const statValues = $ => [...$('statCards').innerHTML.matchAll(/<div class="stat-v num">([^<]+)<\/div>/g)].map(m => m[1]);
const hrs = m => (Math.round(m / 6) / 10).toLocaleString('da-DK', { minimumFractionDigits: 1 });
const check = (app, key) => app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: key } } : null) } });
const open = (app, key) => app.doc.fire('click', { target: { closest: sel => (sel === '[data-open]' ? { dataset: { open: key } } : null) } });
const W70 = () => ({ storage: memoryStorage({ [WEIGHT_KEY]: '70' }) });

test('I dag viser dagens pas som kort: titel, varighed, anbefalet fart, beskrivelse og kost før/under/efter, og en log-knap pr. pas', () => {
  const app = loadApp({ now: SAT });
  const html = app.$('todaySessions').innerHTML;
  const w = weeks[1], day = w.days[5];
  assert.equal(day.length, 2);
  assert.equal((html.match(/<article class="tc /g) || []).length, 2);
  day.forEach((s, si) => {
    const key = `u02-5-${si}`;
    assert.ok(html.includes(`<h3 class="tc-title">${esc(s.t)}</h3>`), s.t);
    assert.ok(html.includes(`data-open="${key}">Log pas</button>`), 'log-knap: åbner det eksisterende ark');
    assert.ok(html.includes(`data-chk="${key}"`), 'hurtig afkrydsning');
    assert.ok(html.includes(esc(s.d)), 'beskrivelse');
    const f = sessionFueling(day, si, { next: weeks[1].days[6], weight: null });
    for (const [lbl, txt] of [['Før', f.before], ['Under', f.during], ['Efter', f.after]]) assert.ok(html.includes(`<dt>${lbl}</dt><dd>${esc(txt)}</dd>`), `${s.t}: ${lbl}`);
  });
  assert.match(html, /<h3 class="tc-title">Lang cykeltur<\/h3><div class="tc-meta num">1:00 t · Est\. TSS \d+<\/div><p class="tc-pace">Anbefalet: 22–25 km\/t/);
  assert.match(html, /c-bike st-future/);
  assert.match(html, /c-run st-future/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script/i);
});

test('I dag: hovedet viser ugedag og dato, ugens type og fase, samt dagens kost-chip (g/kg uden vægt, med "Angiv vægt")', () => {
  const head = loadApp({ now: SAT }).$('todayHead').innerHTML;
  assert.match(head, /<div class="th-date">Lørdag <b>7\. nov\.<\/b><\/div>/);
  assert.match(head, /Uge 2 · Opbygning · Grundform 1/);
  assert.match(head, /<span class="kc k-moderat">Moderat · \d+–\d+ g\/kg KH<\/span>/);
  assert.ok(head.includes('<button type="button" class="linkbtn" data-weight>Angiv vægt</button>'));
  const withWeight = loadApp({ now: SAT, ...W70() }).$('todayHead').innerHTML;
  assert.match(withWeight, /<span class="kc k-moderat">Moderat · [\d.]+–[\d.]+ kcal · [\d.]+–[\d.]+ g KH<\/span>/);
  assert.doesNotMatch(withWeight, /Angiv vægt|data-weight/);
});

test('I dag på en hviledag: ét hvilekort uden log-knap, og kost-chip for hvile', () => {
  const app = loadApp({ now: MON });
  const html = app.$('todaySessions').innerHTML;
  assert.match(html, /<article class="tc c-rest rest">.*<h3 class="tc-title">Hviledag<\/h3>/);
  assert.doesNotMatch(html, /data-open|data-chk|Log pas/);
  assert.match(app.$('todayHead').innerHTML, /k-hvile/);
  assert.match(app.$('todayHead').innerHTML, /Mandag <b>2\. nov\.<\/b>/);
});

test('log-knappen åbner det eksisterende ark, og en afkrydsning opdaterer kortet, ugens fremdrift og næste nøglepas med det samme', () => {
  const app = loadApp({ now: SAT });
  open(app, 'u02-5-0');
  assert.equal(app.$('sheet').open, true);
  assert.match(app.$('sh').innerHTML, /<h3 id="shTitle">Lang cykeltur<\/h3>/);
  app.$('sheet').close();
  assert.match(app.$('weekProgress').innerHTML, /Pas <b>0\/9<\/b>/);
  assert.match(app.$('nextKey').innerHTML, /Lang cykeltur<\/span><span class="nk-m num">Lør 7\. nov\. · i dag · 1:00 t/);
  check(app, 'u02-5-0');
  const html = app.$('todaySessions').innerHTML;
  const card = html.split('<article').find(c => c.includes('Lang cykeltur'));
  assert.match(card, /c-bike st-done/);
  assert.match(card, /Gennemført<\/span>/);
  assert.match(card, /data-open="u02-5-0">Rediger log<\/button>/);
  assert.doesNotMatch(card, /data-chk/, 'allerede gennemført: ingen hurtigknap');
  assert.match(html.split('<article').find(c => c.includes('>Brick-løb<')), /Log pas/);
  assert.match(app.$('weekProgress').innerHTML, /Pas <b>1\/9<\/b>/);
  assert.match(app.$('nextKey').innerHTML, /Langt løb<\/span><span class="nk-m num">Søn 8\. nov\. · i morgen · 45 min/, 'næste nøglepas er nu søndagens lange løb');
  assert.match(app.$('ptext').textContent, /^1 af /);
});

test('en log med tid og RPE vises på kortet, og en skæv varighed giver den gule tilstand', () => {
  const entry = { done: true, updatedAt: '2026-11-07T09:00:00.000Z', at: '2026-11-07T09:00:00.000Z', min: 30, rpe: 6, sig: 'bike:Lang cykeltur' };
  const app = loadApp({ now: SAT, storage: memoryStorage({ 'im2027-progress-v2': JSON.stringify({ v: 2, weeks: { u02: { '5-0': entry } } }) }) });
  const card = app.$('todaySessions').innerHTML.split('<article').find(c => c.includes('Lang cykeltur'));
  assert.match(card, /c-bike st-off/);
  assert.match(card, /Gennemført · varighed skæv/);
  assert.match(card, /Logget 30 min · RPE 6/);
});

test('stat-kort: Fitness (CTL), Form (TSB) og Træthed (ATL) viser tal; uden logs er det den planlagte PMC', () => {
  const app = loadApp({ now: SAT });
  const html = app.$('statCards').innerHTML;
  assert.equal((html.match(/<div class="stat" /g) || []).length, 3);
  for (const x of ['Fitness <small>CTL</small>', 'Form <small>TSB</small>', 'Træthed <small>ATL</small>']) assert.ok(html.includes(x), x);
  const p = planned[12], signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
  assert.deepEqual(statValues(app.$), [String(Math.round(p.ctl)), signed(Math.round(p.tsb)), String(Math.round(p.atl))]);
  assert.ok(statValues(app.$).every(v => /^[+−]?\d+$/.test(v)), 'tal');
  assert.equal((html.match(/<div class="stat-s">Plan<\/div>/g) || []).length, 3, 'planlagt som reserve');
  assert.equal((html.match(/<polyline points="[\d., ]+"/g) || []).length, 3, 'en sparkline pr. kort');
  const delta = Math.round(p.ctl) - Math.round(planned[5].ctl);
  assert.ok(html.includes(`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} på 7 dage`), 'ændring de seneste 7 dage');
  assert.match(html, /role="group" aria-label="Fitness \(CTL\) \d+, plan/);
});

test('stat-kort: efter den første log bruges den faktiske PMC (med de skrevne minutter), og Form kan være negativ', () => {
  const entry = { done: true, updatedAt: '2026-11-03T09:00:00.000Z', at: '2026-11-03T09:00:00.000Z', min: 90, sig: 'run:Roligt løb med strides' };
  const app = loadApp({ now: SAT, storage: memoryStorage({ 'im2027-progress-v2': JSON.stringify({ v: 2, weeks: { u02: { '1-0': entry } } }) }) });
  const daily = new Array(13).fill(0);
  daily[8] = tss(weeks[1].days[1][0], 90);
  const act = pmc(daily)[12];
  assert.deepEqual(statValues(app.$), [String(Math.round(act.ctl)), act.tsb < -0.5 ? `−${Math.round(-act.tsb)}` : act.tsb > 0.5 ? `+${Math.round(act.tsb)}` : '0', String(Math.round(act.atl))]);
  assert.equal((app.$('statCards').innerHTML.match(/<div class="stat-s">Faktisk<\/div>/g) || []).length, 3);
  const plannedCtl = String(Math.round(planned[12].ctl));
  assert.notEqual(statValues(app.$)[0], plannedCtl, 'forskellig fra planen');
});

test('ugens fremdrift: timer gennemført / planlagt, antal pas og et link til ugen i kalenderen', () => {
  const app = loadApp({ now: SAT });
  const html = app.$('weekProgress').innerHTML;
  assert.match(html, /<h3>Denne uge · uge 2<\/h3>/);
  assert.ok(html.includes(`<span class="hh num">0,0<small> / ${hrs(weeks[1].total)} t</small></span>`));
  assert.match(html, /Pas <b>0\/9<\/b>/);
  assert.match(html, /<div class="bar" role="img" aria-label="0 % af ugens timer"><i style="width:0%"><\/i><\/div>/);
  assert.match(html, /<a class="wp-link" href="#u02">Se ugen i kalenderen<\/a>/);
  check(app, 'u02-5-0');
  assert.match(app.$('weekProgress').innerHTML, /aria-label="\d+ % af ugens timer"/);
  assert.doesNotMatch(app.$('weekProgress').innerHTML, /aria-label="0 % af/);
  app.go('#u02');
  assert.deepEqual(app.views(), ['kalender'], 'linket (en almindelig hash) åbner kalenderen ved ugen');
});

test('næste nøglepas: titel, dato, "om N dage" og kort fart; klik åbner arket', () => {
  const app = loadApp({ now: MON });
  const html = app.$('nextKey').innerHTML;
  assert.match(html, /<h3>Næste nøglepas<\/h3>/);
  assert.match(html, /<span class="nk-t">Lang cykeltur<\/span><span class="nk-m num">Lør 7\. nov\. · om 5 dage · 1:00 t<\/span><span class="nk-p">22–25 km\/t<\/span>/);
  assert.ok(html.includes('data-open="u02-5-0"'));
  open(app, 'u02-5-0');
  assert.equal(app.$('sheet').open, true);
});

test('race-nedtælling i headeren og Køge-nedtælling står stadig på I dag', () => {
  const app = loadApp({ now: MON });
  assert.equal(app.$('days').textContent, String(Math.round((new Date(2027, 7, 22) - new Date(2026, 10, 2)) / 864e5)));
  assert.match(app.$('tuneup').textContent, /^Køge Jernmand om \d+ dage \(13\. jun\.\)$/);
  assert.deepEqual(app.views(), ['idag']);
});

test('før planstart og efter løbet: en forklarende besked i stedet for dagens pas, og stat-kort og næste nøglepas virker stadig', () => {
  const before = loadApp({ now: '2026-10-20T10:00:00' });
  assert.match(before.$('todayHead').innerHTML, /Planen starter <b>26\. okt\.<\/b>/);
  assert.match(before.$('todayHead').innerHTML, /Om 6 dage/);
  assert.equal(before.$('todaySessions').innerHTML, '');
  assert.deepEqual(statValues(before.$), [String(Math.round(planned[0].ctl)), (Math.round(planned[0].tsb) === 0 ? '0' : String(Math.round(planned[0].tsb))), String(Math.round(planned[0].atl))]);
  assert.match(before.$('weekProgress').innerHTML, /Første uge · uge 1/);
  assert.match(before.$('nextKey').innerHTML, /Lang cykeltur/);
  const after = loadApp({ now: '2027-09-01T10:00:00' });
  assert.match(after.$('todayHead').innerHTML, /Planen er <b>slut<\/b>/);
  assert.equal(after.$('todaySessions').innerHTML, '');
  assert.match(after.$('nextKey').innerHTML, /Ingen flere nøglepas i planen\./);
  assert.equal(statValues(after.$).length, 3);
});

test('I dag tegnes om ved ny vægt, ved dagsskifte og når en anden Store giver ny tilstand', () => {
  const app = loadApp({ now: SAT });
  assert.match(app.$('todayHead').innerHTML, /g\/kg/);
  app.pane().byId('setWeight').value = '70';
  app.pane().buttons('Gem vægt')[0].click();
  assert.match(app.$('todayHead').innerHTML, / kcal /);
  assert.doesNotMatch(app.$('todayHead').innerHTML, /data-weight/);
  app.clock.set('2026-11-08T07:30:00');
  app.doc.fire('visibilitychange');
  assert.match(app.$('todayHead').innerHTML, /Søndag <b>8\. nov\.<\/b>/);
  assert.match(app.$('todaySessions').innerHTML, /Langt løb/);
  assert.match(app.$('nextKey').innerHTML, /Langt løb<\/span><span class="nk-m num">Søn 8\. nov\. · i dag/);
  assert.match(app.$('weekProgress').innerHTML, /uge 2/);
});

test('"+ Tilføj træning" består af én knap efter hver tegning, og #advice er tom uden logs', () => {
  const app = loadApp({ now: SAT });
  assert.equal(app.$('advice').innerHTML, '', 'uden logs ved vi ikke, hvad der er sprunget over');
  check(app, 'u02-5-0');
  assert.match(app.$('addWorkout').innerHTML, /^<button type="button" class="btn add-btn" data-add>\+ Tilføj træning<\/button>$/);
});

test('hele I dag bliver ved med at virke i Artifact-bygningen', () => {
  const app = loadApp({ target: 'artifact', now: SAT });
  assert.equal((app.$('todaySessions').innerHTML.match(/<article class="tc /g) || []).length, 2);
  assert.equal(statValues(app.$).length, 3);
  assert.ok(addDays(START, 12).getDay() === 6);
});
