// Ekstra træning i appen (src/app.js, docs/architecture.md §3.10): "+ Tilføj træning" på I dag, stiplede "Ekstra"-kort i kalenderen og på I dag,
// redigerings- og sletteark, og hvad ekstra tæller i (ugens timer, overholdelsen som "+ ekstra", den faktiske PMC og dagens kost) og ikke tæller i.
// Datoen styres med et falsk ur; lørdag 7. nov. 2026 er dag 12 i planen (uge 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addDays, extraTss, pmc, plan, tss } from '../src/plan.js';
import { WEIGHT_KEY, dayMinutes, dayNutrition, dayType } from '../src/nutrition.js';
import { memoryStorage } from './dom-harness.mjs';
import { loadApp } from './app-harness.mjs';

const weeks = plan();
const SAT = '2026-11-07T10:00:00';
const KEY = 'im2027-progress-v2';
const hrs = m => (Math.round(m / 6) / 10).toLocaleString('da-DK', { minimumFractionDigits: 1 });
const dur = m => m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} t` : `${m} min`;
const statValues = $ => [...$('statCards').innerHTML.matchAll(/<div class="stat-v num">([^<]+)<\/div>/g)].map(m => m[1]);

const xe = (day, sport, min, extra = {}) => ({ day, sport, min, source: 'manual', updatedAt: '2026-11-04T08:00:00.000Z', dev: 'devx0001', ...extra });
const seeded = (weeksObj, extra = {}) => memoryStorage({ [KEY]: JSON.stringify({ v: 2, weeks: weeksObj }), ...extra });
const saved = app => JSON.parse(app.storage.getItem(KEY) || '{"weeks":{}}').weeks;
const xkeys = (app, wk) => Object.keys(saved(app)[wk] || {}).filter(k => k.startsWith('x-'));

const closestOf = (sel, data = {}) => ({ target: { closest: s => (s === sel ? { dataset: data } : null) } });
const openAdd = app => app.$('addWorkout').dispatch('click', closestOf('[data-add]'));
const fill = (app, p, v) => { for (const [k, val] of Object.entries(v)) app.$(p + k).value = val; };
const submitAdd = app => app.$('addWorkout').dispatch('submit');
const rpeAdd = (app, n) => app.$('addWorkout').dispatch('click', closestOf('[data-xrpe]', { xrpe: String(n), xp: 'ax' }));
const openX = (app, ref) => app.doc.fire('click', closestOf('[data-open-x]', { openX: ref }));
const sheetClick = (app, sel, data) => app.$('sheet').dispatch('click', closestOf(sel, data));
const rpeEdit = (app, n) => sheetClick(app, '[data-xrpe]', { xrpe: String(n), xp: 'ex' });
// Den falske DOM parser ikke HTML, så felterne i arket står tomme: sæt alle felter som en rigtig browser ville have dem forudfyldt (og ændr så nogle).
const fillSheet = (app, base, over = {}) => fill(app, 'ex', { Date: '2026-11-07', Sport: 'run', Title: '', Min: '50', Pace: '', Note: '', ...base, ...over });

test('"+ Tilføj træning" folder en formular ud med dato (i dag), sport, varighed, pace i sportens enhed, RPE 1–10 og note', () => {
  const app = loadApp({ now: SAT });
  assert.match(app.$('addWorkout').innerHTML, /data-add>\+ Tilføj træning<\/button>$/);
  openAdd(app);
  const html = app.$('addWorkout').innerHTML;
  assert.match(html, /<form class="panel xform" id="axForm" novalidate><h3>Tilføj træning<\/h3>/);
  assert.match(html, /<input type="date" id="axDate" min="2026-10-26" max="2026-11-07" value="2026-11-07">/, 'dato: i dag som standard, fra planens start til og med i dag');
  assert.match(html, /<select id="axSport"><option value="swim">Svømning<\/option><option value="bike">Cykling<\/option><option value="run" selected>Løb<\/option><option value="str">Styrke<\/option><option value="other">Andet<\/option><\/select>/);
  assert.match(html, /id="axMin"[^>]*min="1" max="900"/);
  assert.match(html, /<label class="field" id="axPaceBox"><span id="axPaceLbl">Faktisk pace \(min:sek pr\. km\)<\/span><input type="text" id="axPace"/);
  assert.equal((html.match(/data-xrpe="\d+" data-xp="ax"/g) || []).length, 10, 'RPE 1–10');
  assert.match(html, /<textarea id="axNote" maxlength="1000"/);
  assert.match(html, /data-xcancel>Annuller<\/button><button type="submit" class="btn primary">Gem<\/button>/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script/i, 'ingen indbyggede hændelser (CSP)');
});

test('at gemme en ekstra: nøglen x-<id> i ugens dokument med dag, sport, minutter, pace, RPE og note; kortet vises på I dag, i gitteret og i dagslisten', () => {
  const app = loadApp({ now: SAT });
  openAdd(app);
  fill(app, 'ax', { Date: '2026-11-07', Sport: 'run', Title: 'Klubløb', Min: '55', Pace: '5:30', Note: 'Fint tempo' });
  rpeAdd(app, 7);
  submitAdd(app);
  const [key] = xkeys(app, 'u02');
  assert.match(key, /^x-[a-z0-9]{8,12}$/);
  assert.equal(xkeys(app, 'u02').length, 1);
  const e = saved(app).u02[key];
  assert.match(e.updatedAt, /^2026-11-07T/);
  assert.deepEqual({ ...e, updatedAt: 'T', dev: 'D' }, { day: 5, sport: 'run', min: 55, pace: 330, rpe: 7, title: 'Klubløb', note: 'Fint tempo', source: 'manual', updatedAt: 'T', dev: 'D' });
  // formularen er lukket, og der står en bekræftelse
  assert.match(app.$('addWorkout').innerHTML, /<p class="add-note" role="status">Gemt: Løb 55 min · Lør 7\. nov\.<\/p><button type="button" class="btn add-btn" data-add>/);
  // I dag
  const today = app.$('todaySessions').innerHTML;
  const card = today.split('<article').find(c => c.includes('data-today-x'));
  assert.ok(card.includes(`data-today-x="u02|${key}"`) && card.includes('c-run'));
  assert.match(card, /<span class="tc-sport">Løb<\/span><span class="tc-state">Ekstra<\/span>/);
  assert.match(card, /<h3 class="tc-title">Klubløb<\/h3><div class="tc-meta num">55 min · Est\. TSS \d+<\/div>/);
  assert.ok(card.includes(`Est. TSS ${extraTss({ sport: 'run', min: 55, rpe: 7 })}`));
  assert.match(card, /<p class="tc-logged">Faktisk 5:30 \/km · RPE 7<\/p><p class="tc-desc">Fint tempo<\/p>/);
  assert.ok(card.includes(`data-open-x="u02|${key}">Redigér</button>`));
  assert.equal((today.match(/<article class="tc /g) || []).length, 3, 'to planlagte pas og ekstraen');
  // gitter og dagsliste: et stiplet kort i lørdagens kolonne
  for (const where of ['grid', 'agenda']) {
    const html = app.$(where).innerHTML;
    assert.ok(html.includes(`<div class="card ex c-run" data-xkey="u02|${key}"><button type="button" class="open" data-open-x="u02|${key}">`), where);
    assert.ok(html.includes('<span class="xtag">Ekstra</span><span class="t">Klubløb</span><span class="m">55 min · RPE 7</span><span class="pa">Faktisk 5:30 /km</span>'), where);
    assert.ok(html.indexOf('data-xkey') > html.indexOf('Brick-løb'), `${where}: efter de planlagte pas`);
  }
  assert.equal((app.$('grid').innerHTML.match(/data-xkey=/g) || []).length, 1);
  // pas og farver er uberørte: intet er gennemført, ingen kort skifter tilstand
  assert.doesNotMatch(app.$('grid').innerHTML, /st-done|st-off/);
  assert.match(app.$('weekProgress').innerHTML, /Pas <b>0\/9<\/b>/);
});

test('ekstra tæller i ugens timer, i fremdriftsteksten og i ugesummen, men ikke i pas, kortfarver og planens TSS', () => {
  const plain = loadApp({ now: SAT });
  const app = loadApp({ now: SAT, storage: seeded({ u02: { 'x-aaa111': xe(1, 'run', 40), 'x-bbb222': xe(2, 'other', 45, { title: 'Fodbold' }) }, u01: { 'x-ccc333': xe(6, 'bike', 60) } }) });
  const w = weeks[1];
  assert.match(app.$('ptext').textContent, /^0 af \d+ pas gennemført · \+ 3 ekstra$/);
  assert.doesNotMatch(plain.$('ptext').textContent, /ekstra/);
  assert.ok(app.$('weekProgress').innerHTML.includes(`<span class="hh num">${hrs(85)}<small> / ${hrs(w.total)} t</small></span>`), 'denne uge: 40 + 45 min');
  assert.match(app.$('weekProgress').innerHTML, /Pas <b>0\/9<\/b>/, 'pas tæller kun de planlagte');
  assert.match(app.$('weekProgress').innerHTML, /aria-label="\d+ % af ugens timer"/);
  assert.ok(app.$('grid').innerHTML.includes(`<div class="row ex"><span>Ekstra</span><b>${dur(85)}</b></div>`));
  assert.ok(app.$('grid').innerHTML.includes(`<div class="row ex"><span>Ekstra</span><b>${dur(60)}</b></div>`), 'uge 1');
  assert.ok(app.$('agenda').innerHTML.includes(`<span>Timer <b>${hrs(85)} / ${hrs(w.total)}</b></span><span>Pas <b>0/9</b></span><span>Ekstra <b>${dur(85)}</b></span><span>TSS <b>${w.days.flat().reduce((a, s) => a + tss(s), 0)}</b></span>`));
  assert.doesNotMatch(plain.$('agenda').innerHTML, /<span>Ekstra/);
  // 'other' vises med sin titel og navnet Andet
  assert.match(app.$('agenda').innerHTML, /<span class="xtag">Ekstra<\/span><span class="t">Fodbold<\/span><span class="m">45 min<\/span>/);
});

test('overholdelsen: ekstra vises som "+ ekstra" pr. sport (other = Andet), og de planlagte minutter og procenterne er uændrede', () => {
  const plain = loadApp({ now: SAT });
  const app = loadApp({ now: SAT, storage: seeded({ u02: { 'x-aaa111': xe(1, 'run', 40), 'x-bbb222': xe(2, 'other', 45), 'x-ddd444': xe(5, 'run', 20), 'x-eee555': xe(6, 'run', 90) } }) });
  const html = app.$('compliance').innerHTML;
  assert.match(html, /<span class="sp c-run">Løb<\/span><\/th><td class="num">0\/\d+<\/td><td class="num">0 min \/ [^<]+<small class="ex-note">\+ 1:00 t ekstra<\/small><\/td>/, 'løb: 40 + 20 til og med i dag; søndagens ekstra (i morgen) tæller ikke');
  assert.match(html, /<span class="sp c-other">Andet<\/span><\/th><td class="num">–<\/td><td class="num"><small class="ex-note">\+ 45 min ekstra<\/small><\/td>/, 'en sport uden planlagt: kun ekstra');
  assert.match(html, /<tr class="total"><th scope="row">Alle<\/th>.*\+ 1:45 t ekstra/);
  const pcts = h => [...h.matchAll(/<b class="num">([^<]+)<\/b>/g)].map(m => m[1]);
  const base = pcts(plain.$('compliance').innerHTML), withX = pcts(html);
  assert.deepEqual(withX.slice(0, base.length - 1), base.slice(0, base.length - 1), 'procenterne for de planlagte sportsgrene er uændrede');
  assert.equal(withX.at(-1), base.at(-1), 'og samlet også');
  assert.ok(withX.includes('–') && !base.includes('–'), 'Andet har intet planlagt at måle mod');
  assert.match(html, /Ekstra træning \(uplanlagt\) står som \+ ekstra og indgår ikke i procenten\./);
  assert.doesNotMatch(plain.$('compliance').innerHTML, /ekstra<\/small>|ex-note/);
});

test('den faktiske PMC tager ekstra med: TSS = minutter × IF² × 100/60 efter RPE, og styrke har fast TSS', () => {
  const x = { u02: {
    'x-aaa111': xe(1, 'run', 60, { rpe: 8 }),     // Tirsdag 3. nov. = dag 8
    'x-bbb222': xe(3, 'bike', 90),                // uden RPE: IF 0,7
    'x-ccc333': xe(4, 'str', 45, { rpe: 9 }),     // styrke: fast 30
    'x-ddd444': xe(5, 'swim', 30, { rpe: 2 }),    // dag 12 = i dag
  } };
  const app = loadApp({ now: SAT, storage: seeded(x) });
  const daily = new Array(13).fill(0);
  daily[8] = Math.round(60 * 0.85 * 0.85 * 100 / 60);
  daily[10] = Math.round(90 * 0.7 * 0.7 * 100 / 60);
  daily[11] = 30;
  daily[12] = Math.round(30 * 0.65 * 0.65 * 100 / 60);
  const act = pmc(daily)[12], sg = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
  assert.deepEqual(statValues(app.$), [String(Math.round(act.ctl)), sg(Math.round(act.tsb)), String(Math.round(act.atl))]);
  assert.equal((app.$('statCards').innerHTML.match(/<div class="stat-s">Faktisk<\/div>/g) || []).length, 3, 'de første ekstra gør, at kortene bruger den faktiske PMC');
});

test('dagens kost-chip og Kost-fanen lægger ekstra minutter til dagens planlagte: en hviledag med 100 min ekstra bliver en moderat dag', () => {
  const MON = '2026-11-02T10:00:00', mondayPlanned = weeks[1].days[0];
  assert.equal(dayMinutes(mondayPlanned), 0);
  const kg = () => memoryStorage({ [WEIGHT_KEY]: '70' });
  const plain = loadApp({ now: MON, storage: kg() });
  const storage = kg(); storage.setItem(KEY, JSON.stringify({ v: 2, weeks: { u02: { 'x-aaa111': xe(0, 'bike', 100) } } }));
  const app = loadApp({ now: MON, storage });
  const planned = dayNutrition(dayType(mondayPlanned, addDays(weeks[1].start, 0)), 0, 70);
  const actual = dayNutrition(dayType(mondayPlanned.concat([{ s: 'bike', m: 100 }]), addDays(weeks[1].start, 0)), 100, 70);
  assert.equal(planned.type, 'hvile'); assert.equal(actual.type, 'moderat');
  assert.match(plain.$('grid').innerHTML, new RegExp(`<span class="kc k-hvile">${planned.chip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`));
  assert.ok(app.$('grid').innerHTML.includes(`<span class="kc k-moderat">${actual.chip}</span>`), 'chip i gitteret');
  assert.ok(app.$('agenda').innerHTML.includes(`<span class="kc k-moderat">${actual.chip}</span>`), 'chip i dagslisten');
  assert.ok(app.$('todayHead').innerHTML.includes(`<span class="kc k-moderat">${actual.chip}</span>`), 'chip på I dag');
  assert.match(app.$('kostToday').innerHTML, /Træning 1:40 t/);
  assert.match(app.$('kostToday').innerHTML, new RegExp(`<span class="kc k-moderat">Moderat</span>`));
  assert.match(plain.$('kostToday').innerHTML, /Ingen træning/);
});

test('en ekstra der kommer fra en anden enhed eller fane (storage), tegnes med det samme; en gravsten fjerner den igen', () => {
  const app = loadApp({ now: SAT });
  assert.doesNotMatch(app.$('grid').innerHTML, /data-xkey/);
  app.storage.setItem(KEY, JSON.stringify({ v: 2, weeks: { u02: { 'x-fff666': xe(4, 'bike', 70, { rpe: 5 }) } } }));
  app.win.fire('storage', { key: null });
  assert.match(app.$('grid').innerHTML, /data-xkey="u02\|x-fff666"/);
  assert.match(app.$('agenda').innerHTML, /data-xkey="u02\|x-fff666"/);
  assert.match(app.$('ptext').textContent, /\+ 1 ekstra/);
  app.storage.setItem(KEY, JSON.stringify({ v: 2, weeks: { u02: { 'x-fff666': { deleted: true, updatedAt: '2026-11-09T08:00:00.000Z', dev: 'devx0002' } } } }));
  app.win.fire('storage', { key: null });
  assert.doesNotMatch(app.$('grid').innerHTML, /data-xkey/);
  assert.doesNotMatch(app.$('ptext').textContent, /ekstra/);
});

test('validering: dato, varighed og pace afvises med en forklaring, formularen bliver åben, og intet gemmes', () => {
  const app = loadApp({ now: SAT });
  openAdd(app);
  const tryIt = (v, rpe) => { fill(app, 'ax', { Date: '2026-11-07', Sport: 'run', Min: '40', Pace: '', ...v }); submitAdd(app); return app.$('axMsg').textContent; };
  assert.match(tryIt({ Min: '' }), /Skriv varigheden i hele minutter \(1–900\)\./);
  for (const bad of ['0', '901', 'abc', '-5']) assert.match(tryIt({ Min: bad }), /hele minutter/, bad);
  assert.match(tryIt({ Pace: 'hurtigt' }), /Skriv pace som min:sek pr\. km, fx 5:30\./);
  assert.match(tryIt({ Sport: 'bike', Pace: '999' }), /Skriv farten i km\/t, fx 27,5\./);
  assert.match(tryIt({ Sport: 'swim', Pace: 'x' }), /min:sek pr\. 100 m, fx 2:10/);
  assert.match(tryIt({ Date: '2026-11-08' }), /Vælg en dato fra planens start til og med i dag\./, 'i morgen');
  assert.match(tryIt({ Date: '2026-10-25' }), /Vælg en dato fra planens start/, 'før planen');
  assert.match(tryIt({ Date: '' }), /Vælg en dato/);
  assert.match(tryIt({ Date: 'i går' }), /Vælg en dato/);
  assert.deepEqual(xkeys(app, 'u02'), []);
  assert.match(app.$('addWorkout').dataset.mode, /^form/, 'formularen er stadig åben');
  // og med gyldige tal lykkes det: afrundet til hele minutter, og pace ignoreres for styrke
  fill(app, 'ax', { Date: '2026-11-04', Sport: 'str', Min: '44.6', Pace: 'ikke en pace', Title: '', Note: '' });
  submitAdd(app);
  const [k] = xkeys(app, 'u02');
  assert.deepEqual({ ...saved(app).u02[k], updatedAt: 'T', dev: 'D' }, { day: 2, sport: 'str', min: 45, source: 'manual', updatedAt: 'T', dev: 'D' });
});

test('pace gemmes i sportens enhed: løb og svøm mm:ss, cykel km/t; skift af sport skifter feltets etiket', () => {
  const app = loadApp({ now: SAT });
  openAdd(app);
  const add = (Sport, Pace) => { openAdd(app); fill(app, 'ax', { Date: '2026-11-06', Sport, Min: '30', Pace, Title: '', Note: '' }); submitAdd(app); };
  add('swim', '2:10'); add('bike', '27,5'); add('run', '5.30');
  const e = Object.values(saved(app).u02).filter(v => v.min === 30);
  assert.deepEqual(e.map(v => [v.sport, v.pace]).sort(), [['bike', 27.5], ['run', 330], ['swim', 130]]);
  // etiketten følger sporten
  openAdd(app);
  app.$('axSport').value = 'bike';
  app.$('addWorkout').dispatch('change', { target: { id: 'axSport' } });
  assert.equal(app.$('axPaceLbl').textContent, 'Faktisk pace (km/t)');
  assert.equal(app.$('axPace').placeholder, '27,5');
  assert.equal(app.$('axPaceBox').hidden, false);
  app.$('axSport').value = 'str';
  app.$('addWorkout').dispatch('change', { target: { id: 'axSport' } });
  assert.equal(app.$('axPaceBox').hidden, true, 'styrke har ingen pace');
  app.$('axSport').value = 'other';
  app.$('addWorkout').dispatch('change', { target: { id: 'axSport' } });
  assert.equal(app.$('axPaceBox').hidden, true);
});

test('en indtastning overlever en gentegning af I dag (synk, afkrydsning), og Annuller lukker formularen', () => {
  const app = loadApp({ now: SAT });
  openAdd(app);
  app.$('addWorkout').innerHTML = 'MIN-INDTASTNING';
  app.doc.fire('click', closestOf('[data-chk]', { chk: 'u02-5-0' }));
  assert.equal(app.$('addWorkout').innerHTML, 'MIN-INDTASTNING', 'formularen tegnes ikke om, så felterne beholder deres værdier');
  app.$('addWorkout').dispatch('click', closestOf('[data-xcancel]'));
  assert.match(app.$('addWorkout').innerHTML, /^<button type="button" class="btn add-btn" data-add>\+ Tilføj træning<\/button>$/);
  assert.deepEqual(xkeys(app, 'u02'), []);
});

test('redigering: arket viser ekstraen med dato, sport, minutter og RPE; Gem ændrer den på samme nøgle (og beholder titel og kilde)', () => {
  const storage = seeded({ u02: { 'x-aaa111': xe(5, 'bike', 90, { rpe: 6, title: 'Tur med Jens', pace: 27.5, note: 'Vind' }) } });
  const app = loadApp({ now: SAT, storage });
  openX(app, 'u02|x-aaa111');
  assert.equal(app.$('sheet').open, true);
  const html = app.$('sh').innerHTML;
  assert.match(html, /<div class="sh-sport">Ekstra · Cykling<\/div><h3 id="shTitle">Tur med Jens<\/h3><div class="when">Lørdag 7\. nov\. 2026 · Uge 2<\/div>/);
  assert.match(html, /id="exDate"[^>]*value="2026-11-07"/);
  assert.match(html, /<option value="bike" selected>Cykling<\/option>/);
  assert.match(html, /id="exMin"[^>]*value="90"/);
  assert.match(html, /id="exPace"[^>]*value="27,5"/);
  assert.match(html, /aria-pressed="true">6<\/button>/, 'RPE 6 er valgt');
  assert.match(html, /<textarea id="exNote"[^>]*>Vind<\/textarea>/);
  assert.match(html, /id="exActs"><button type="button" class="btn danger" data-xdel>Slet<\/button>/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script/i);
  fillSheet(app, { Sport: 'bike', Title: 'Tur med Jens', Min: '90', Pace: '27,5', Note: 'Vind' }, { Min: '100', Pace: '28' });
  rpeEdit(app, 6); // et tryk på det valgte tal fjerner det
  rpeEdit(app, 8);
  app.$('sheet').dispatch('submit');
  assert.equal(app.$('sheet').open, false);
  assert.deepEqual(xkeys(app, 'u02'), ['x-aaa111'], 'samme nøgle');
  const e = saved(app).u02['x-aaa111'];
  assert.deepEqual({ ...e, updatedAt: 'T', dev: 'D' }, { day: 5, sport: 'bike', min: 100, pace: 28, rpe: 8, title: 'Tur med Jens', note: 'Vind', source: 'manual', updatedAt: 'T', dev: 'D' });
  assert.ok(e.updatedAt > '2026-11-04T08:00:00.000Z', 'ny version slår den gamle');
  assert.match(app.$('todaySessions').innerHTML, /Faktisk 28 km\/t · RPE 8/);
});

test('redigering af en Strava-ekstra: kilde, aktivitets-id, distance og puls bevares, og arket viser dem med et link', () => {
  const x = xe(2, 'run', 38, { source: 'strava', activityId: '11111111104', dist: 10200, hr: 148, dev: 'strava' });
  const app = loadApp({ now: SAT, storage: seeded({ u02: { 'x-s53r9o74': x } }) });
  openX(app, 'u02|x-s53r9o74');
  assert.match(app.$('sh').innerHTML, /<p class="desc sh-strava">Fra Strava · 10,2 km · ⌀ 148 bpm · <a href="https:\/\/www\.strava\.com\/activities\/11111111104" target="_blank" rel="noopener noreferrer">Se på Strava<\/a><\/p>/);
  assert.match(app.$('sh').innerHTML, /id="exTitle"[^>]*value=""/);
  fillSheet(app, { Date: '2026-11-04', Sport: 'run', Min: '38' }, { Min: '40', Note: 'Fin tur' });
  app.$('sheet').dispatch('submit');
  const e = saved(app).u02['x-s53r9o74'];
  assert.deepEqual({ ...e, updatedAt: 'T', dev: 'D' }, { day: 2, sport: 'run', min: 40, note: 'Fin tur', dist: 10200, hr: 148, source: 'strava', activityId: '11111111104', updatedAt: 'T', dev: 'D' });
  // intervals.icu-kilden vises uden link
  const ic = loadApp({ now: SAT, storage: seeded({ u02: { 'x-iii111': xe(1, 'bike', 60, { source: 'intervals', activityId: 'i123' }) } }) });
  openX(ic, 'u02|x-iii111');
  assert.match(ic.$('sh').innerHTML, /<p class="desc sh-strava">Fra intervals\.icu<\/p>/);
});

test('redigering: en ny dato i en anden uge flytter ekstraen (gravsten på den gamle nøgle, ny nøgle i den nye uge); ugyldige felter afvises i arket', () => {
  const app = loadApp({ now: '2026-11-12T10:00:00', storage: seeded({ u02: { 'x-aaa111': xe(5, 'run', 50, { rpe: 5 }) } }) }); // torsdag i uge 3
  openX(app, 'u02|x-aaa111');
  const base = { Date: '2026-11-07', Sport: 'run', Min: '50' };
  fillSheet(app, base, { Min: '0' });
  app.$('sheet').dispatch('submit');
  assert.match(app.$('exMsg').textContent, /hele minutter/);
  assert.equal(app.$('sheet').open, true, 'arket bliver åbent ved en fejl');
  fillSheet(app, base, { Date: '2026-11-13' });
  app.$('sheet').dispatch('submit');
  assert.match(app.$('exMsg').textContent, /Vælg en dato/, 'i morgen er ikke tilladt');
  fillSheet(app, base, { Date: '2026-11-10' }); // tirsdag i uge 3
  app.$('sheet').dispatch('submit');
  assert.equal(app.$('sheet').open, false);
  const wk = saved(app);
  assert.equal(wk.u02['x-aaa111'].deleted, true, 'gravsten i den gamle uge');
  assert.deepEqual(xkeys(app, 'u03').length, 1);
  const [k] = xkeys(app, 'u03');
  assert.notEqual(k, 'x-aaa111');
  assert.deepEqual({ ...wk.u03[k], updatedAt: 'T', dev: 'D' }, { day: 1, sport: 'run', min: 50, rpe: 5, source: 'manual', updatedAt: 'T', dev: 'D' });
});

test('sletning: "Slet" åbner en bekræftelse i arket (aldrig confirm()), "Behold" fortryder, og "Ja, slet" skriver en gravsten der fjerner kortene', () => {
  const src = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(!/\bconfirm\s*\(/.test(src.replace(/\/\/.*$/gm, '')), 'ingen confirm()');
  const app = loadApp({ now: SAT, storage: seeded({ u02: { 'x-aaa111': xe(5, 'run', 50, { note: 'hemmelig' }) } }) });
  assert.match(app.$('grid').innerHTML, /data-xkey="u02\|x-aaa111"/);
  openX(app, 'u02|x-aaa111');
  sheetClick(app, '[data-xdel]');
  const conf = app.$('exActs').innerHTML;
  assert.match(conf, /role="alert">Slet denne træning\? Den fjernes på alle dine enheder\.<\/span><button type="button" class="btn" data-xkeep>Behold<\/button><button type="button" class="btn danger" data-xdelok>Ja, slet<\/button>/);
  assert.equal(saved(app).u02['x-aaa111'].note, 'hemmelig', 'intet er slettet endnu');
  sheetClick(app, '[data-xkeep]');
  assert.match(app.$('exActs').innerHTML, /data-xdel>Slet<\/button>/);
  assert.equal(app.$('sheet').open, true);
  sheetClick(app, '[data-xdel]');
  sheetClick(app, '[data-xdelok]');
  assert.equal(app.$('sheet').open, false);
  assert.match(JSON.stringify(saved(app).u02['x-aaa111']), /^\{"deleted":true,"updatedAt":"[^"]+","dev":"[a-z0-9]+"\}$/, 'en gravsten uden detaljer');
  assert.doesNotMatch(JSON.stringify(saved(app)), /hemmelig/);
  for (const where of ['grid', 'agenda', 'todaySessions']) assert.doesNotMatch(app.$(where).innerHTML, /data-xkey|data-today-x/, where);
  assert.doesNotMatch(app.$('ptext').textContent, /ekstra/);
  assert.match(app.$('weekProgress').innerHTML, /<span class="hh num">0,0<small>/, 'ugens timer er tilbage til 0');
  // Luk uden at gemme, og et ark der er åbent for et pas, påvirkes ikke af ekstra-tilstanden
  openX(app, 'u02|x-aaa111');
  assert.equal(app.$('sheet').open, false, 'en gravsten kan ikke åbnes');
});

test('et pasark efter et ekstra-ark gemmer stadig passet (ekstra-tilstanden er nulstillet)', () => {
  const app = loadApp({ now: SAT, storage: seeded({ u02: { 'x-aaa111': xe(5, 'run', 50) } }) });
  openX(app, 'u02|x-aaa111');
  app.$('sheet').close();
  app.doc.fire('click', closestOf('[data-open]', { open: 'u02-5-0' }));
  app.$('fDone').checked = true;
  app.$('fMin').value = '61';
  app.$('sheet').dispatch('submit');
  assert.equal(saved(app).u02['5-0'].min, 61);
  assert.equal(saved(app).u02['x-aaa111'].min, 50, 'ekstraen er urørt');
});

test('titler og noter fra en anden enhed escapes overalt, og ugyldige ekstra og uger uden for planen vises ikke', () => {
  const evil = '<img src=x onerror=alert(1)>"&';
  const app = loadApp({ now: SAT, storage: seeded({
    u02: { 'x-evil11': xe(5, 'run', 30, { title: evil, note: evil }), 'x-bad111': { day: 9, sport: 'run', min: 30, updatedAt: '2026-11-04T08:00:00.000Z' }, 'x-gone11': { deleted: true, updatedAt: '2026-11-05T08:00:00.000Z' } },
    u99: { 'x-late11': xe(0, 'run', 30) },
  }) });
  for (const where of ['grid', 'agenda', 'todaySessions']) {
    const html = app.$(where).innerHTML;
    assert.doesNotMatch(html, /<img/, where);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&amp;'), where);
    assert.doesNotMatch(html, /x-bad111|x-gone11|x-late11/, where);
  }
  openX(app, 'u02|x-evil11');
  assert.doesNotMatch(app.$('sh').innerHTML, /<img/);
  assert.ok(app.$('sh').innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(app.$('ptext').textContent, /\+ 1 ekstra$/);
});

test('uden for planen: ingen knap, og ekstra i Artifact-bygningen virker som i app-bygningen', () => {
  assert.equal(loadApp({ now: '2026-10-20T10:00:00' }).$('addWorkout').innerHTML, '');
  assert.equal(loadApp({ now: '2027-09-01T10:00:00' }).$('addWorkout').innerHTML, '');
  const app = loadApp({ target: 'artifact', now: SAT });
  openAdd(app);
  fill(app, 'ax', { Date: '2026-11-07', Sport: 'swim', Min: '35', Pace: '2:05' });
  submitAdd(app);
  assert.equal(xkeys(app, 'u02').length, 1);
  assert.match(app.$('grid').innerHTML, /data-xkey="u02\|x-/);
});
