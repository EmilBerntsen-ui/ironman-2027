// src/app.js kørt i vm med en falsk DOM (test/dom-harness.mjs): dagsskifte, start på LocalStore med skift til Artifact-databasen og
// tilgængelige navne på søjlerne. Datoen styres med et falsk ur (alle klokkeslæt er lokal tid, så testen er uafhængig af tidszone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan } from '../src/plan.js';
import { KOST_DISCLAIMER, KOST_REPORT_URL, WEIGHT_KEY, dayMinutes, dayNutrition, dayType, weekKcalAverage } from '../src/nutrition.js';
import { memoryStorage } from './dom-harness.mjs';
import { loadApp } from './app-harness.mjs';
import { settle } from './fake-gist.mjs';

const DAY_MS = 864e5;
const daysToRace = (from) => Math.round((new Date(2027, 7, 22) - new Date(new Date(from).setHours(0, 0, 0, 0))) / DAY_MS);
const weekOf = $ => /<span class="wn">Uge (\d+)<\/span>/.exec($('agenda').innerHTML)?.[1];

// ---- dagsskifte ----

test('dagsskifte: når siden bliver synlig igen på en ny dag, regnes i dag og denne uge om, og siden tegnes igen', () => {
  const app = loadApp({ now: '2026-11-02T10:00:00' }); // mandag i uge 2
  const { $, doc, clock } = app;
  assert.equal($('days').textContent, String(daysToRace('2026-11-02T10:00:00')));
  assert.match($('grid').innerHTML, /class="gw now" id="g-u02"/);
  assert.match($('grid').innerHTML, /I dag · 2\. nov\./);
  assert.equal(weekOf($), '2');

  clock.set('2026-11-10T07:30:00'); // tirsdag i uge 3: appen har ligget i baggrunden
  doc.fire('visibilitychange');
  assert.equal($('days').textContent, String(daysToRace('2026-11-10T07:30:00')));
  assert.match($('grid').innerHTML, /class="gw now" id="g-u03"/);
  assert.doesNotMatch($('grid').innerHTML, /class="gw now" id="g-u02"/);
  assert.match($('grid').innerHTML, /I dag · 10\. nov\./);
  assert.doesNotMatch($('grid').innerHTML, /I dag · 2\. nov\./);
  assert.equal(weekOf($), '3', 'man fulgte "denne uge", så ugevisningen følger med');
  assert.match($('agenda').innerHTML, /Denne uge/);
  assert.match($('agenda').innerHTML, /<div class="ag-day today">/);
  assert.match($('pmc').innerHTML, /I dag/);
});

test('dagsskifte: samme dag, skjult side og tidligere tidspunkt samme dag tegner ikke om', () => {
  const { $, doc, win, clock } = loadApp({ now: '2026-11-02T10:00:00' });
  $('grid').innerHTML = 'MARK';
  doc.fire('visibilitychange');
  win.fire('focus');
  win.fire('pageshow');
  clock.set('2026-11-02T23:59:00');
  doc.fire('visibilitychange');
  assert.equal($('grid').innerHTML, 'MARK', 'samme dato: intet tegnes om');
  clock.set('2026-11-05T09:00:00');
  doc.visibilityState = 'hidden';
  doc.fire('visibilitychange');
  assert.equal($('grid').innerHTML, 'MARK', 'mens siden er skjult sker der intet');
  doc.visibilityState = 'visible';
  doc.fire('visibilitychange');
  assert.notEqual($('grid').innerHTML, 'MARK');
  assert.match($('grid').innerHTML, /I dag · 5\. nov\./);
});

test('dagsskifte: pageshow og focus virker også, og en ugevisning man selv har valgt bliver stående', () => {
  for (const event of ['pageshow', 'focus']) {
    const { $, win, clock } = loadApp({ now: '2026-11-02T10:00:00' });
    $('prevWk').click();                       // man kigger på uge 1
    assert.equal(weekOf($), '1');
    clock.set('2026-11-10T09:00:00');
    win.fire(event);
    assert.match($('grid').innerHTML, /class="gw now" id="g-u03"/, event);
    assert.equal(weekOf($), '1', `${event}: den valgte uge bevares`);
    assert.equal($('days').textContent, String(daysToRace('2026-11-10T09:00:00')));
  }
});

test('dagsskifte: før planstart og efter løbet klemmes denne uge til planens ender', () => {
  const before = loadApp({ now: '2026-10-20T10:00:00' }); // før mandag 26. okt.
  assert.match(before.$('grid').innerHTML, /class="gw now" id="g-u01"/);
  assert.match(before.$('agenda').innerHTML, /Starter mandag/);
  before.clock.set('2026-10-26T06:00:00');
  before.doc.fire('visibilitychange');
  assert.match(before.$('agenda').innerHTML, /Denne uge/, 'planen er startet');
  before.clock.set('2027-09-01T06:00:00');
  before.doc.fire('visibilitychange');
  assert.match(before.$('grid').innerHTML, /class="gw now" id="g-u43"/);
  assert.equal(before.$('days').textContent, '0');
});

// ---- Artifact: start på LocalStore, skift når databasen er klar ----

function fakeDb() {
  const data = new Map(), listeners = new Set(), sets = [];
  const snap = () => ({ docs: [...data].map(([id, d]) => ({ id, exists: true, data: () => structuredClone(d) })), metadata: { fromCache: false } });
  return {
    data, sets,
    collection: () => ({ onSnapshot(ok) { listeners.add(ok); queueMicrotask(() => ok(snap())); return () => listeners.delete(ok); } }),
    doc: path => {
      const id = path.split('/')[1];
      return {
        async get() { return { id, exists: data.has(id), data: () => structuredClone(data.get(id)), metadata: { fromCache: false } }; },
        async set(v) { sets.push({ path, data: structuredClone(v) }); data.set(id, structuredClone(v)); for (const l of [...listeners]) l(snap()); },
      };
    },
  };
}
const firstSession = () => { const w = plan()[0]; for (let d = 0; d < 7; d++) for (let s = 0; s < w.days[d].length; s++) if (w.days[d][s].s !== 'rest') return `${w.id}-${d}-${s}`; };
const check = (app, key) => app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: key } } : null) } });

test('artifact: starter straks på LocalStore ("Forbinder…"), gemmer lokalt og skifter til databasen, når claude.use("db") er klar (efter længere tid)', async () => {
  const db = fakeDb();
  let resolveDb;
  const claude = { use: () => new Promise(r => { resolveDb = () => r(db); }) };
  const app = loadApp({ target: 'artifact', claude });
  await settle();
  assert.equal(app.$('savemode').textContent, 'Forbinder…', 'ventetiden er synlig');
  const key = firstSession();
  check(app, key);                                   // en afkrydsning mens databasen endnu ikke er klar
  const saved = JSON.parse(app.storage.getItem('im2027-progress-v2'));
  assert.equal(saved.weeks.u01[key.slice(4)].done, true, 'gemt lokalt med det samme');
  assert.equal(db.sets.length, 0);

  const pane = app.pane();
  app.$('savemode').click();                         // indstillinger åbnet, før databasen er klar
  assert.match(pane.textContent, /Gemmes kun på denne enhed/);
  assert.deepEqual(app.views(), ['mere']);

  resolveDb();
  await settle();
  assert.equal(app.$('savemode').textContent, 'Gemmes på tværs af enheder');
  assert.equal(app.$('savemodeTop').textContent, 'Gemmes på tværs af enheder', 'begge statusknapper følger med');
  assert.equal(db.data.get('u01').sessions[key.slice(4)].done, true, 'ændringen fra ventetiden er sendt til databasen');
  assert.match(pane.textContent, /Delt lager/, 'indstillingerne følger med til den nye Store');
  assert.equal(app.doc.body.findAll(e => e.tag === 'dialog' && e.className.includes('settings')).length, 0, 'indstillingerne er en fane, ikke en dialog');

  check(app, key);                                   // nu gemmer en afkrydsning (fjernelse) direkte i databasen
  await settle();
  assert.equal(db.data.get('u01').sessions[key.slice(4)].done, false);
});

test('artifact: uden db-capability (eller når den svigter) bliver appen på LocalStore, og etiketten viser det', async () => {
  for (const claude of [undefined, { use: async () => null }, { use: () => { throw new Error('nej'); } }]) {
    const app = loadApp({ target: 'artifact', claude });
    await settle();
    assert.equal(app.$('savemode').textContent, 'Gemmes kun på denne enhed');
    check(app, firstSession());
    assert.ok(app.storage.getItem('im2027-progress-v2'));
  }
});

// ---- tilgængelighed ----

test('søjlerne har tilgængelige navne, der er identiske med den synlige tooltip-tekst', () => {
  const { $ } = loadApp();
  const html = $('bars').innerHTML;
  const groups = [...html.matchAll(/<g data-wk="(\d+)" tabindex="0" role="button" aria-label="([^"]+)"><title>([^<]+)<\/title>/g)];
  assert.equal(groups.length, 43);
  for (const [, wk, label, title] of groups) {
    assert.equal(label, title, `uge ${+wk + 1}: navn og tooltip er samme tekst`);
    assert.match(label, new RegExp(`^Uge ${+wk + 1}: \\d+,\\d timer, \\S`));
  }
});

// ---- Strava-pas i detaljevisningen (docs/strava.md §5) ----

const STRAVA_ENTRY = { done: true, updatedAt: '2026-11-06T12:35:00.000Z', dev: 'strava', at: '2026-11-06T11:30:00.000Z', min: 62, src: 'strava', extId: '12345678901', sig: 'bike:Rolig cykel', dist: 10234, hr: 148 };
const openSheetOf = (app, key) => app.doc.fire('click', { target: { closest: sel => (sel === '[data-open]' ? { dataset: { open: key } } : null) } });
const appWith = entry => loadApp({ storage: memoryStorage({ 'im2027-progress-v2': JSON.stringify({ v: 2, weeks: { u02: { '4-0': entry } } }) }) });

test('Strava-pas: arket viser "Fra Strava · 10,2 km · ⌀ 148 bpm" og et sikkert link til aktiviteten', () => {
  const app = appWith(STRAVA_ENTRY);
  openSheetOf(app, 'u02-4-0');
  const html = app.$('sh').innerHTML;
  assert.match(html, /<h3 id="shTitle">Rolig cykel<\/h3>/);
  assert.match(html, /<p class="desc sh-strava">Fra Strava · 10,2 km · ⌀ 148 bpm · <a href="https:\/\/www\.strava\.com\/activities\/12345678901" target="_blank" rel="noopener noreferrer">Se på Strava<\/a><\/p>/);
  assert.ok(html.indexOf('sh-facts') < html.indexOf('sh-strava') && html.indexOf('sh-strava') < html.indexOf('<form'), 'under faktaboksene, over formularen');
});

test('Strava-pas: delvis data og ugyldigt id giver aldrig et link eller rå tekst; flere id\'er (race) linker til det første', () => {
  const only = entry => { const app = appWith(entry); openSheetOf(app, 'u02-4-0'); return app.$('sh').innerHTML; };
  assert.match(only({ ...STRAVA_ENTRY, hr: undefined }), /Fra Strava · 10,2 km · <a /);
  assert.match(only({ ...STRAVA_ENTRY, dist: undefined, hr: undefined }), /<p class="desc sh-strava">Fra Strava · <a /);
  assert.doesNotMatch(only({ ...STRAVA_ENTRY, dist: 0 }), /0,0 km/);
  assert.match(only({ ...STRAVA_ENTRY, extId: '111,222,333' }), /activities\/111"/);
  for (const bad of ['"><img src=x onerror=alert(1)>', 'abc', '../1', '1'.repeat(21), '']) {
    const html = only({ ...STRAVA_ENTRY, extId: bad });
    assert.doesNotMatch(html, /<a /, JSON.stringify(bad));
    assert.ok(!html.includes('onerror'), JSON.stringify(bad));
    assert.match(html, /Fra Strava/);
  }
  const manual = only({ done: true, updatedAt: STRAVA_ENTRY.updatedAt, min: 62 });
  assert.doesNotMatch(manual, /Strava/);
  assert.doesNotMatch(only({ ...STRAVA_ENTRY, src: 'manual' }), /Strava/);
});

test('Strava-pas: gem i arket bevarer src, extId, dist og hr, og brugerens min/RPE/note vinder', () => {
  const app = appWith(STRAVA_ENTRY);
  openSheetOf(app, 'u02-4-0');
  app.$('fMin').value = '50';
  app.$('fNote').value = 'Fin tur';
  app.$('fDone').checked = true;
  app.$('sheet').dispatch('submit');
  const saved = JSON.parse(app.storage.getItem('im2027-progress-v2')).weeks.u02['4-0'];
  assert.equal(saved.done, true);
  assert.equal(saved.min, 50);
  assert.equal(saved.note, 'Fin tur');
  assert.equal(saved.src, 'strava');
  assert.equal(saved.extId, '12345678901');
  assert.equal(saved.dist, 10234);
  assert.equal(saved.hr, 148);
  assert.equal(saved.at, STRAVA_ENTRY.at, 'første gennemførelse bevares');
  assert.ok(saved.updatedAt > STRAVA_ENTRY.updatedAt, 'redigeringen slår Strava-posten');
});

test('manuelt pas får ikke Strava-felter ved redigering, og fjernes afkrydsningen, bliver det en gravsten uden detaljer', () => {
  const manual = { done: true, updatedAt: '2026-11-06T12:35:00.000Z', min: 62 };
  const app = appWith(manual);
  openSheetOf(app, 'u02-4-0');
  app.$('fDone').checked = true;
  app.$('sheet').dispatch('submit');
  const saved = JSON.parse(app.storage.getItem('im2027-progress-v2')).weeks.u02['4-0'];
  for (const k of ['src', 'extId', 'dist', 'hr']) assert.ok(!(k in saved), k);

  const s = appWith(STRAVA_ENTRY);
  openSheetOf(s, 'u02-4-0');
  s.$('fDone').checked = false;
  s.$('sheet').dispatch('submit');
  const tomb = JSON.parse(s.storage.getItem('im2027-progress-v2')).weeks.u02['4-0'];
  assert.equal(tomb.done, false);
  for (const k of ['src', 'extId', 'dist', 'hr', 'min']) assert.ok(!(k in tomb), k);
});

// ---- Fart: anbefalet i arket og på kortene, faktisk pace i loggen ----

const planWeeks = plan();
const keyOf = pred => { for (const w of planWeeks) for (let d = 0; d < 7; d++) for (let i = 0; i < w.days[d].length; i++) if (pred(w.days[d][i], w)) return `${w.id}-${d}-${i}`; return null; };
const sessionAt = key => { const [id, d, i] = key.split('-'); return planWeeks.find(w => w.id === id).days[+d][+i]; };
const stored = (app, key) => { const [id, d, i] = key.split('-'); return JSON.parse(app.storage.getItem('im2027-progress-v2')).weeks[id]?.[`${d}-${i}`]; };
const appWithAt = (key, entry) => { const [id, d, i] = key.split('-'); return loadApp({ storage: memoryStorage({ 'im2027-progress-v2': JSON.stringify({ v: 2, weeks: { [id]: { [`${d}-${i}`]: entry } } }) }) }); };
const DONE = { done: true, updatedAt: '2026-11-06T12:35:00.000Z', at: '2026-11-06T11:30:00.000Z' };
const submitSheet = app => app.$('sheet').dispatch('submit');
const fill = (app, { pace, min, done = true }) => {
  if (pace !== undefined) app.$('fPace').value = pace;
  if (min !== undefined) app.$('fMin').value = min;
  app.$('fDone').checked = done;
  submitSheet(app);
};

const K = {
  runMain: keyOf(s => s.s === 'run' && s.z === 'easy' && s.main === 'thr'),
  runEasy: keyOf((s, w) => w.id === 'u02' && s.s === 'run' && s.z === 'z2' && !s.main),
  swimEasy: keyOf(s => s.s === 'swim' && s.z === 'easy' && !s.main),
  bikeOpt: keyOf(s => s.s === 'bike' && s.z === 'z2' && !s.main && s.ind === 'opt'),
  bikeIndoor: keyOf(s => s.s === 'bike' && s.ind === true),
  str: keyOf(s => s.s === 'str'),
  rest: keyOf(s => s.s === 'rest'),
  ironman: keyOf(s => s.t === 'IRONMAN'),
  test: keyOf(s => s.t === 'Cykeltest'),
};

test('arket viser "Anbefalet: …" i stedet for intensitet: hovedsæt, indendørs, test, triatlon-løb; ingen fart for styrke og hvile', () => {
  for (const [name, key] of Object.entries(K)) assert.ok(key, name);
  const html = key => { const app = loadApp(); openSheetOf(app, key); return app.$('sh').innerHTML; };
  const run = html(K.runMain);
  assert.match(run, /<div class="sh-rec">Anbefalet: 6:45–7:15 \/km · hovedsæt 5:40–5:50 \/km<\/div>/);
  assert.doesNotMatch(run, /Intensitet/);
  assert.ok(run.indexOf('Est. TSS') < run.indexOf('sh-rec') && run.indexOf('sh-rec') < run.indexOf('<form'));
  assert.match(html(K.bikeOpt), /Anbefalet: 22–25 km\/t · indendørs: efter følelse og kadence</);
  const indoor = html(K.bikeIndoor);
  assert.match(indoor, /<div class="sh-rec">Anbefalet: efter følelse og kadence<\/div>/);
  assert.doesNotMatch(indoor, /km\/t/);
  assert.doesNotMatch(indoor, /id="fPace"/, 'km/t er meningsløst indendørs: ingen pace-felt');
  assert.match(html(K.test), /Anbefalet: hård og jævn indsats/);
  const im = html(K.ironman);
  assert.match(im, /Anbefalet: svøm 2:15–2:20 \/100 m · cykel 24–26 km\/t · løb 6:20–6:35 \/km/);
  assert.doesNotMatch(im, /id="fPace"/, 'tre grene: ingen samlet pace');
  const str = html(K.str);
  assert.doesNotMatch(str, /Anbefalet|id="fPace"/);
  assert.match(str, /Est\. TSS/);
  assert.doesNotMatch(html(K.rest), /Anbefalet|Est\. TSS|<form/);
});

test('pace-feltet: løb min:sek pr. km, svøm min:sek pr. 100 m, cykel km/t; hovedsætpas spørger efter hovedsættets pace', () => {
  const field = key => { const app = loadApp(); openSheetOf(app, key); return /<label class="field">(Faktisk pace[^<]*)<input type="text" id="fPace" inputmode="decimal"[^>]*placeholder="([^"]*)"/.exec(app.$('sh').innerHTML)?.slice(1); };
  assert.deepEqual(field(K.runEasy), ['Faktisk pace (min:sek pr. km)', '5:30']);
  assert.deepEqual(field(K.swimEasy), ['Faktisk pace (min:sek pr. 100 m)', '2:10']);
  assert.deepEqual(field(K.bikeOpt), ['Faktisk pace (km/t)', '27,5']);
  assert.deepEqual(field(K.runMain), ['Faktisk pace i hovedsættet (min:sek pr. km)', '5:30']);
  assert.equal(field(K.str), undefined);
});

test('log pace: "6.55" gemmes som 415 sek./km, vises i arket og på kortet og sammenlignes med zonen', () => {
  const app = loadApp({ now: '2026-11-02T10:00:00' }); // uge 2 vises i dagslisten
  assert.match(app.$('agenda').innerHTML, /<span class="pz">6:45–7:15 \/km<\/span><span class="pa"><\/span>/, 'anbefalet fart på kortet, endnu ingen faktisk');
  openSheetOf(app, K.runEasy);
  fill(app, { pace: '6.55', min: '30' });
  const e = stored(app, K.runEasy);
  assert.equal(e.pace, 415);
  assert.equal(e.min, 30);
  assert.equal(e.done, true);
  assert.match(app.$('agenda').innerHTML, /<span class="pa">Faktisk 6:55 \/km · i zonen<\/span>/);
  openSheetOf(app, K.runEasy);
  const html = app.$('sh').innerHTML;
  assert.match(html, /<p class="desc sh-pace">Faktisk pace: 6:55 \/km · i zonen<\/p>/);
  assert.match(html, /id="fPace"[^>]*value="6:55"/);
  assert.ok(html.indexOf('sh-rec') < html.indexOf('sh-pace') && html.indexOf('sh-pace') < html.indexOf('<form'));
  // hurtigere, i zonen, langsommere
  for (const [txt, word] of [['6:00', 'hurtigere end anbefalet'], ['7:15', 'i zonen'], ['6:45', 'i zonen'], ['7:16', 'langsommere end anbefalet'], ['9:00', 'langsommere end anbefalet']]) {
    openSheetOf(app, K.runEasy);
    fill(app, { pace: txt });
    openSheetOf(app, K.runEasy);
    assert.match(app.$('sh').innerHTML, new RegExp(`sh-pace">Faktisk pace: [\\d:]+ /km · ${word}<`), `${txt}: ${word}`);
  }
  // pace sat på et pas ændrer ikke farven (st-*), som kun afhænger af varigheden
  assert.doesNotMatch(app.$('agenda').innerHTML.split(`data-key="${K.runEasy}"`)[0].split('class="card').pop(), /st-miss/);
});

test('log pace: svøm mm:ss og cykel km/t (komma og punktum), og pace på et pas uden hovedsæt sammenlignes med pasets zone', () => {
  const app = loadApp();
  openSheetOf(app, K.swimEasy);
  fill(app, { pace: '2:25' });
  assert.equal(stored(app, K.swimEasy).pace, 145);
  openSheetOf(app, K.swimEasy);
  assert.match(app.$('sh').innerHTML, /Faktisk pace: 2:25 \/100 m · i zonen/);
  openSheetOf(app, K.bikeOpt);
  fill(app, { pace: '27,5' });
  assert.equal(stored(app, K.bikeOpt).pace, 27.5);
  openSheetOf(app, K.bikeOpt);
  assert.match(app.$('sh').innerHTML, /Faktisk pace: 27,5 km\/t · hurtigere end anbefalet/);
  openSheetOf(app, K.bikeOpt);
  fill(app, { pace: '23.2 km/t' });
  assert.equal(stored(app, K.bikeOpt).pace, 23.2);
  openSheetOf(app, K.bikeOpt);
  assert.match(app.$('sh').innerHTML, /Faktisk pace: 23,2 km\/t · i zonen/);
  openSheetOf(app, K.bikeOpt);
  fill(app, { pace: '19' });
  openSheetOf(app, K.bikeOpt);
  assert.match(app.$('sh').innerHTML, /19 km\/t · langsommere end anbefalet/);
});

test('log pace: en hovedsætpace sammenlignes med hovedsættets zone', () => {
  const app = loadApp();
  // pasets hovedsæt er tærskel (5:40–5:50), mens opvarmningen er rolig (6:45–7:15): en hovedsætpace på 6:30 er for langsom
  for (const [txt, word] of [['5:45', 'i zonen'], ['5:30', 'hurtigere end anbefalet'], ['6:30', 'langsommere end anbefalet']]) {
    openSheetOf(app, K.runMain);
    fill(app, { pace: txt });
    openSheetOf(app, K.runMain);
    assert.match(app.$('sh').innerHTML, new RegExp(`Faktisk pace: ${txt} /km · ${word}<`), txt);
  }
});

test('log pace: ugyldig pace afviser gemningen med en besked; tom pace gemmer uden pace og fjerner en gammel; test får pace uden vurdering', () => {
  const app = loadApp();
  openSheetOf(app, K.runEasy);
  for (const bad of ['7:99', 'hurtig', '5:3', '0:30', '99']) {
    fill(app, { pace: bad, min: '30' });
    assert.match(app.$('fMsg').textContent, /Skriv pace som min:sek pr\. km, fx 5:30\./, bad);
    assert.equal(app.storage.getItem('im2027-progress-v2'), null, `intet gemt: ${bad}`);
  }
  fill(app, { pace: '7:00' });
  assert.equal(stored(app, K.runEasy).pace, 420);
  openSheetOf(app, K.runEasy);
  fill(app, { pace: '', min: '40' });
  const e = stored(app, K.runEasy);
  assert.equal(e.min, 40);
  assert.ok(!('pace' in e), 'tømt felt fjerner pace');
  openSheetOf(app, K.bikeOpt);
  fill(app, { pace: 'xx' });
  assert.match(app.$('fMsg').textContent, /Skriv farten i km\/t, fx 27,5\./);
  // en test
  openSheetOf(app, K.test);
  fill(app, { pace: '31,2' });
  assert.equal(stored(app, K.test).pace, 31.2);
  openSheetOf(app, K.test);
  const html = app.$('sh').innerHTML;
  assert.match(html, /<p class="desc sh-pace">Faktisk pace: 31,2 km\/t<\/p>/, 'ingen vurdering af en test');
});

test('at skrive en pace sætter "Gennemført"; et pas med kun pace åbner arket i stedet for at blive fjernet ved klik på cirklen', () => {
  const app = loadApp();
  openSheetOf(app, K.runEasy);
  app.$('fDone').checked = false;
  app.$('sheet').dispatch('input', { target: { id: 'fPace', value: '6:50' } });
  assert.equal(app.$('fDone').checked, true);
  const only = appWithAt(K.runEasy, { ...DONE, pace: 410 });
  only.$('sheet').open = false;
  check(only, K.runEasy);
  assert.equal(only.$('sheet').open, true, 'har detaljer: åbn i stedet for at slette');
  assert.ok(stored(only, K.runEasy).done);
});

test('Strava-pas uden pace: farten regnes ud af distance og tid og vises som ⌀ uden at blive gemt', async () => {
  const entry = { ...DONE, dev: 'strava', min: 55, src: 'strava', extId: '12345678901', dist: 8000 };
  const app = appWithAt(K.runEasy, entry);
  await settle();
  openSheetOf(app, K.runEasy);
  const html = app.$('sh').innerHTML;
  assert.match(html, /<p class="desc sh-pace">Gennemsnitsfart \(beregnet ud fra distance og tid\): 6:53 \/km · i zonen<\/p>/);
  assert.match(html, /id="fPace"[^>]*value=""/, 'det beregnede tal sættes ikke i feltet');
  assert.ok(html.indexOf('sh-pace') < html.indexOf('sh-strava'));
  assert.match(app.$('agenda').innerHTML, /⌀ 6:53 \/km · i zonen/);
  fill(app, {}); // gem uden at røre ved noget
  const saved = stored(app, K.runEasy);
  assert.ok(!('pace' in saved), 'beregnet fart gemmes ikke');
  assert.equal(saved.dist, 8000);
  assert.equal(saved.src, 'strava');
  // selvindtastet pace slår den beregnede og bevares sammen med Strava-felterne
  openSheetOf(app, K.runEasy);
  fill(app, { pace: '6:30' });
  const edited = stored(app, K.runEasy);
  assert.equal(edited.pace, 390);
  assert.equal(edited.dist, 8000);
  assert.equal(edited.extId, '12345678901');
  openSheetOf(app, K.runEasy);
  assert.match(app.$('sh').innerHTML, /Faktisk pace: 6:30 \/km · hurtigere end anbefalet/);
});

test('beregnet fart vurderes ikke for pas med hovedsæt (gennemsnittet er blandet med opvarmning), og aldrig for triatlon-løb eller indendørs cykel', () => {
  const sh = (key, extra) => { const app = appWithAt(key, { ...DONE, dev: 'strava', src: 'strava', extId: '1', ...extra }); openSheetOf(app, key); return app.$('sh').innerHTML; };
  assert.match(sh(K.runMain, { min: 50, dist: 8000 }), /sh-pace">Gennemsnitsfart \(beregnet ud fra distance og tid\): 6:15 \/km<\/p>/);
  assert.doesNotMatch(sh(K.ironman, { min: 600, dist: 180000 }), /sh-pace/);
  assert.doesNotMatch(sh(K.bikeIndoor, { min: 60, dist: 30000 }), /sh-pace/);
  assert.doesNotMatch(sh(K.runEasy, { min: 55 }), /sh-pace/, 'uden distance ingen fart');
  assert.doesNotMatch(sh(K.runEasy, { min: 5, dist: 100000 }), /sh-pace/, 'urimelig fart');
});

test('zoneguiden regnes ud fra grundtallene og taler om fart, ikke watt', () => {
  const app = loadApp();
  const table = app.$('zones').innerHTML;
  for (const x of ['<th>Løb /km</th>', '<th>Svøm /100 m</th>', '<th>Cykel km/t</th>', '6:20–6:35', '5:40–5:50', '2:08–2:12', '26–27,5', 'under 22', '<td>IM-fart</td>']) assert.ok(table.includes(x), x);
  assert.ok(!/watt|ftp/i.test(table));
  const note = app.$('zonesNote').textContent;
  for (const x of ['5:45 /km', '2:10 /100 m', '29 km/t', 'testugen', 'efter følelse og kadence']) assert.ok(note.includes(x), x);
  assert.ok(!/watt|ftp/i.test(note));
  assert.ok(!/watt|ftp/i.test(readFileSync(new URL('../src/app.html', import.meta.url), 'utf8')));
});

// ---- Kost: chips, ugesum, blok i arket, guide og vægt ----

const R = (a, b) => `${a}–${b}`; // kulhydratintervaller skrives ikke ud i kildefilen (private-ord-tjekket)
const WEIGHT_BTN = '<button type="button" class="linkbtn" data-weight>Angiv vægt</button>';
const W70 = () => ({ storage: memoryStorage({ [WEIGHT_KEY]: '70' }) });
const chips = html => [...html.matchAll(/<span class="kc k-(\w+)">([^<]*)<\/span>/g)].map(m => ({ type: m[1], text: m[2] }));
const dayChip = (wi, di) => { const w = planWeeks[wi]; return dayNutrition(dayType(w.days[di], new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() + di)), dayMinutes(w.days[di]), 70).chip; };

test('kost: hver dag i ugegitteret har en chip med dagtype · kcal · gram, lige efter datoen og før pas', () => {
  const app = loadApp(W70());
  const list = chips(app.$('grid').innerHTML);
  assert.equal(list.length, 43 * 7);
  assert.match(app.$('grid').innerHTML, /<span class="dt">I dag · 2\. nov\.<\/span><span class="kc k-hvile">Hvile · 2\.450–2\.700 kcal · 210–350 g KH<\/span><div class="card/);
  // lørdag i uge 2: 60 min cykel + 10 min brick = moderat
  assert.equal(dayChip(1, 5), 'Moderat · 3.100–3.450 kcal · 420–700 g KH');
  assert.ok(list.some(c => c.text === 'Moderat · 3.100–3.450 kcal · 420–700 g KH'));
  for (const [wi, di] of [[0, 0], [1, 1], [20, 5], [31, 5], [41, 2]]) assert.ok(list.some(c => c.text === dayChip(wi, di)), `${wi}/${di}`);
  assert.equal(list.filter(c => c.type === 'opladning').length, 3, 'fredag og lørdag før IRONMAN, lørdag før Køge');
  assert.equal(list.filter(c => c.type === 'race').length, 2);
  assert.deepEqual([...new Set(list.filter(c => c.type === 'opladning').map(c => c.text))], ['Opladning · 700–840 g KH']);
  assert.deepEqual([...new Set(list.filter(c => c.type === 'race').map(c => c.text))], ['Race · se løbsdagsplanen']);
  assert.ok(list.some(c => c.type === 'lang' && c.text.startsWith('Lang · ') && c.text.endsWith(' kcal · 560–840 g KH')));
});

test('kost: i dagslisten (telefon) står chippen i dagens overskrift', () => {
  const app = loadApp(W70()); // uge 2 vises
  const html = app.$('agenda').innerHTML;
  assert.equal(chips(html).length, 7);
  assert.match(html, /<div class="lbl">Mandag<small>2\. nov\. · i dag<\/small><span class="kc k-hvile">Hvile · 2\.450–2\.700 kcal · 210–350 g KH<\/span><\/div>/);
  assert.match(html, /<div class="lbl">Lørdag<small>7\. nov\.<\/small><span class="kc k-moderat">Moderat · 3\.100–3\.450 kcal · 420–700 g KH<\/span><\/div>/);
});

test('kost uden vægt: chips viser g/kg og ingen kcal, og der er ingen ugesum for kost', () => {
  const app = loadApp();
  const list = chips(app.$('grid').innerHTML);
  assert.equal(list.length, 43 * 7);
  assert.ok(list.every(c => !/kcal/.test(c.text)), 'ingen kcal uden vægt');
  assert.ok(list.some(c => c.text === `Moderat · ${R(6, 10)} g/kg KH`));
  assert.ok(list.some(c => c.text === `Lang · ${R(8, 12)} g/kg KH`));
  assert.ok(list.some(c => c.text === `Opladning · ${R(10, 12)} g/kg KH`));
  assert.ok(list.some(c => c.text === `Hvile · ${R(3, 5)} g/kg KH`));
  assert.doesNotMatch(app.$('grid').innerHTML, /Kost ⌀\/dag/);
  assert.doesNotMatch(app.$('agenda').innerHTML, /Kost ⌀\/dag/);
});

test('kost: ugesummen viser ⌀ kcal pr. dag (estimat) med vægt, i både ugegitter og dagsliste', () => {
  const app = loadApp(W70());
  const w = planWeeks[1], avg = weekKcalAverage(w.days, w.start, 70);
  assert.match(avg.text, /^ca\. 3\.\d00 kcal$|^ca\. 3\.\d50 kcal$/);
  assert.ok(app.$('grid').innerHTML.includes(`<div class="row kost"><span>Kost ⌀/dag, estimat</span><b>${avg.text}</b></div>`));
  assert.ok(app.$('agenda').innerHTML.includes(`<span>Kost ⌀/dag, estimat <b>${avg.text}</b></span>`));
  // raceugen: opladnings- og racedage udelades, og gennemsnittet er stadig et tal
  const last = planWeeks[42], lastAvg = weekKcalAverage(last.days, last.start, 70);
  assert.equal(lastAvg.days, 4);
  assert.ok(app.$('grid').innerHTML.includes(`<b>${lastAvg.text}</b>`));
});

test('kost i arket: "Kost"-blok med dagen og Før / Under / Efter, mellem fakta og formularen', () => {
  const app = loadApp(W70());
  openSheetOf(app, K.runEasy); // u02 tirsdag: roligt løb med strides, 30 min
  const html = app.$('sh').innerHTML;
  assert.match(html, /<section class="sh-kost"><h4>Kost<\/h4><dl><dt>Dagen<\/dt><dd>Let · 3\.\d{3}–3\.\d{3} kcal \(estimat\) · 350–490 g KH<small>Protein ca\. 110 g om dagen \(84–140 g\): 4–5 måltider à ca\. 21 g<\/small><\/dd>/);
  assert.match(html, /<dt>Før<\/dt><dd>Normal kost, ingen særlig forberedelse<\/dd><dt>Under<\/dt><dd>Kun vand<\/dd><dt>Efter<\/dt><dd>Måltid inden for 1–2 t med 20–40 g protein \+ kulhydrat<\/dd>/);
  assert.match(html, /Estimat og generel vejledning\. Se guiden Kost\./);
  assert.doesNotMatch(html, /Angiv vægt|data-weight/, 'vægten er kendt');
  assert.ok(html.indexOf('sh-rec') < html.indexOf('sh-kost') && html.indexOf('sh-kost') < html.indexOf('<form'));
});

test('kost i arket: lang cykeltur (gram med vægt, koffein, 60–90 g/t og natrium), løbsdag og hviledag', () => {
  const app = loadApp(W70());
  const long = keyOf(s => s.t === 'Lang cykeltur' && s.m >= 300);
  openSheetOf(app, long);
  let html = app.$('sh').innerHTML;
  assert.match(html, /<dt>Før<\/dt><dd>Måltid 2–3 t før med 1–2 g\/kg kulhydrat \(70–140 g\), lidt fedt og fiber\. Valgfrit: koffein ca\. 3 mg\/kg \(ca\. 210 mg\) ca\. 60 min før/);
  assert.match(html, /<dt>Under<\/dt><dd>60–90 g\/t \(glukose \+ fruktose\)\. Drik så du hverken taber over 2 % eller tager på og tilsæt 500–700 mg natrium pr\. liter<\/dd>/);
  assert.match(html, /<dd>Lang · [\d.]+–[\d.]+ kcal \(estimat\) · 560–840 g KH/);
  openSheetOf(app, K.ironman);
  html = app.$('sh').innerHTML;
  assert.match(html, /<dd>Race: se løbsdagsplanen i guiden Kost<small>[^<]*<\/small><small>Løbets energiunderskud kan ikke lukkes/);
  assert.match(html, /<dt>Før<\/dt><dd>Morgenmad 1–4 g\/kg kulhydrat 1–4 t før \(70–280 g\)/);
  assert.match(html, /<dt>Under<\/dt><dd>Cykel 60–90 g kulhydrat\/t/);
  openSheetOf(app, K.rest);
  html = app.$('sh').innerHTML;
  assert.match(html, /<dt>Dagen<\/dt><dd>Hvile · /);
  assert.doesNotMatch(html, /<dt>Før<\/dt>|<dt>Under<\/dt>|<dt>Efter<\/dt>/, 'hvile har ingen fueling pr. pas');
});

test('kost i arket uden vægt: g/kg og en opfordring til at angive vægten', () => {
  const app = loadApp();
  openSheetOf(app, keyOf(s => s.t === 'Lang cykeltur' && s.m >= 300));
  const html = app.$('sh').innerHTML;
  assert.ok(html.includes(`<dd>Lang · ${R(8, 12)} g/kg KH`));
  assert.match(html, /Måltid 2–3 t før med 1–2 g\/kg kulhydrat, lidt fedt og fiber\./, 'uden gram i parentes');
  assert.doesNotMatch(html, /\(70–140 g\)|ca\. 210 mg/);
  assert.ok(html.includes(`${WEIGHT_BTN} for at få gram og kcal i stedet for g/kg. Estimat og generel vejledning. Se guiden Kost.`));
});

test('kost: vægten angives i indstillingerne, tegner chips og ugesummer om med det samme, og kommer aldrig i fremdriften', () => {
  const app = loadApp();
  assert.ok(!app.$('grid').innerHTML.includes(' kcal'));
  app.$('savemode').click();
  const dlg = app.pane();
  assert.ok(dlg.byId('setWeight'), 'feltet findes');
  dlg.byId('setWeight').value = '70';
  dlg.buttons('Gem vægt')[0].click();
  assert.equal(app.storage.getItem(WEIGHT_KEY), '70');
  assert.match(app.$('grid').innerHTML, /Hvile · 2\.450–2\.700 kcal · 210–350 g KH/);
  assert.match(app.$('agenda').innerHTML, /Hvile · 2\.450–2\.700 kcal · 210–350 g KH/);
  assert.match(app.$('grid').innerHTML, /Kost ⌀\/dag, estimat/);
  assert.match(app.$('kostGuide').innerHTML, /<th>Med din vægt<\/th>/);
  check(app, firstSession());
  const saved = app.storage.getItem('im2027-progress-v2');
  assert.ok(saved && !/70|weight|vægt/i.test(saved.replace(/"(updatedAt|at)":"[^"]*"/g, '')), 'fremdriften indeholder ingen vægt');
  assert.deepEqual(app.storage.keys().filter(k => k !== WEIGHT_KEY && k !== 'im2027-progress-v2' && k !== 'im2027-device'), []);
  dlg.byId('setWeight').value = '';
  dlg.buttons('Gem vægt')[0].click();
  assert.equal(app.storage.getItem(WEIGHT_KEY), null);
  assert.ok(!app.$('grid').innerHTML.includes(' kcal'), 'uden vægt igen: g/kg');
  assert.doesNotMatch(app.$('kostGuide').innerHTML, /Med din vægt/);
});

test('kost: en ændring af vægten i en anden fane (storage-hændelse) følges, og andre nøgler ignoreres', () => {
  const app = loadApp();
  app.storage.setItem(WEIGHT_KEY, '80');
  app.$('grid').innerHTML = 'MARK';
  app.win.fire('storage', { key: 'im2027-andet' });
  assert.equal(app.$('grid').innerHTML, 'MARK', 'en anden nøgle tegner ikke om');
  app.win.fire('storage', { key: WEIGHT_KEY });
  assert.notEqual(app.$('grid').innerHTML, 'MARK');
  assert.match(app.$('grid').innerHTML, /Hvile · 2\.800–3\.100 kcal · 240–400 g KH/, '80 kg: 2.960 kcal ±5 %');
  app.storage.removeItem(WEIGHT_KEY);
  app.win.fire('storage', { key: null });
  assert.ok(!app.$('grid').innerHTML.includes(' kcal'));
});

test('kost: en ødelagt vægt i lageret ignoreres (g/kg)', () => {
  for (const bad of ['abc', '5', '5000', '<b>70</b>']) {
    const app = loadApp({ storage: memoryStorage({ [WEIGHT_KEY]: bad }) });
    assert.ok(!app.$('grid').innerHTML.includes(' kcal'), bad);
  }
});

test('kost-guiden: dagtabel, før/under/efter, løbsuge, tilskud, advarselstegn, forbehold og et sikkert link til rapporten', () => {
  const app = loadApp();
  const html = app.$('kostGuide').innerHTML;
  assert.ok(html.startsWith(`<p class="kost-note">${KOST_DISCLAIMER}</p>`));
  for (const h of ['Dag for dag', 'Før, under og efter', 'Løbsuge og løbsdag', 'Kosttilskud', 'Advarselstegn og vægt', 'Kilder']) assert.ok(html.includes(`<h3>${h}</h3>`), h);
  assert.match(html, /<table class="zones kost-table"><tr><th>Dagtype<\/th><th>Træning<\/th><th>Kulhydrat g\/kg<\/th><\/tr>/);
  assert.ok(html.includes(`<td>Lang</td><td>over 180 min</td><td>${R(8, 12)}</td>`));
  for (const x of ['D-vitamin', 'ferritin', 'batch-testede', 'Intet nyt', 'Køge Jernmand', '500–700 mg natrium', '1,25–1,5 L pr. kg tabt']) assert.ok(html.includes(x), x);
  assert.ok(html.includes(`<a href="${KOST_REPORT_URL}" target="_blank" rel="noopener noreferrer">`));
  assert.doesNotMatch(html, /<script|\son[a-z]+=/i);
  assert.doesNotMatch(html, /Med din vægt/);
  const body = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
  assert.ok(body.includes('<details class="guide-wrap" id="kostWrap">') && body.includes('<summary>Guide: kost</summary>'));
  assert.ok(!/https?:\/\//.test(body), 'siden selv nævner ingen eksterne adresser (CSP-testen i site.test.mjs); linket tegnes af app.js');
});

test('kost i Artifact-bygningen: samme chips og samme vægtfelt i indstillingerne', () => {
  const app = loadApp({ target: 'artifact', ...W70() });
  assert.match(app.$('grid').innerHTML, /Hvile · 2\.450–2\.700 kcal · 210–350 g KH/);
  app.$('savemode').click();
  const dlg = app.pane();
  assert.equal(dlg.byId('setWeight').value, '70');
  assert.match(dlg.textContent, /sendes aldrig til GitHub, til kalenderen eller andre steder/);
});

// ---- Indstillinger-knap og "Angiv vægt" ----

const clickWeightLink = app => app.doc.fire('click', { target: { closest: sel => (sel === '[data-weight]' ? {} : null) } });
const SRC_HTML = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');

test('indstillinger: en tydelig knap i race-headeren (type button, aria-label, tekst) ved siden af statuslinjen, uden inline handlers', () => {
  const header = SRC_HTML.slice(SRC_HTML.indexOf('<header class="bib">'), SRC_HTML.indexOf('</header>', SRC_HTML.indexOf('<header class="bib">')));
  assert.ok(header.includes('<button type="button" class="btn settings-btn" id="settingsBtn" aria-label="Indstillinger"><span aria-hidden="true">⚙</span> Indstillinger</button>'));
  assert.ok(header.includes('id="savemode"'), 'statuslinjen er stadig en knap');
  assert.ok(header.indexOf('id="savemode"') < header.indexOf('id="settingsBtn"') && /<div class="bib-tools">[\s\S]*id="savemode"[\s\S]*id="settingsBtn"[\s\S]*<\/div>/.test(header));
  assert.doesNotMatch(SRC_HTML, /\son[a-z]+\s*=|<script/i, 'CSP: ingen inline handlers eller scripts');
  const css = readFileSync(new URL('../src/settings.css', import.meta.url), 'utf8');
  const rule = /\.btn\.settings-btn \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rule, /min-height: 44px/);
  assert.match(rule, /min-width: 44px/);
});

test('indstillinger: statusknapperne og ⚙ (i race-headeren og i topbjælken) åbner fanen Mere med indstillingerne (site og Artifact), uden dialog', () => {
  for (const target of ['site', 'artifact']) {
    for (const id of ['settingsBtn', 'savemode', 'settingsTop', 'savemodeTop']) {
      const app = loadApp({ target });
      assert.deepEqual(app.views(), ['idag'], `${target}: I dag fra start`);
      assert.equal(app.$(id).getAttribute('aria-haspopup'), null, `${target}/${id}: ingen dialog at åbne`);
      app.$(id).click();
      assert.deepEqual(app.views(), ['mere'], `${target}: ${id} åbner Mere`);
      assert.equal(app.location.hash, '#mere');
      assert.ok(app.pane().byId('setWeight'), 'vægtfeltet er der');
      assert.match(app.pane().textContent, /Gem vægt/);
      assert.equal(app.doc.body.find(e => e.tag === 'dialog' && e.className.includes('settings')), null);
    }
  }
});

test('"Angiv vægt": uden vægt står knappen over kalenderen, i kost-guiden og i pasarkets kost-blok; med vægt står den ingen steder', () => {
  const none = loadApp();
  assert.ok(none.$('kostCap').innerHTML.includes(`Uden vægt vises g/kg. ${WEIGHT_BTN} for at få gram og kcal. Se guiden Kost.`));
  assert.ok(none.$('kostGuide').innerHTML.includes(`<p class="kost-p kost-weight">Tabellen viser g/kg. ${WEIGHT_BTN} for at få en kolonne med gram.</p>`));
  assert.ok(none.$('kostGuide').innerHTML.startsWith(`<p class="kost-note">${KOST_DISCLAIMER}</p>`));
  openSheetOf(none, K.runEasy);
  assert.ok(none.$('sh').innerHTML.includes(WEIGHT_BTN));
  for (const html of [none.$('kostCap').innerHTML, none.$('kostGuide').innerHTML, none.$('sh').innerHTML]) assert.doesNotMatch(html, /\son[a-z]+\s*=|<script/i);

  const has = loadApp(W70());
  for (const html of [has.$('kostCap').innerHTML, has.$('kostGuide').innerHTML]) assert.doesNotMatch(html, /Angiv vægt|data-weight/);
  assert.equal(has.$('kostCap').innerHTML, 'Under hver dag: dagtype · energi (estimat) · kulhydrat. Se guiden Kost.');
  openSheetOf(has, K.runEasy);
  assert.doesNotMatch(has.$('sh').innerHTML, /Angiv vægt|data-weight/);
  const body = SRC_HTML;
  assert.ok(body.includes('id="kostCap"') && !/Angiv vægt|data-weight/.test(body), 'knappen tegnes af app.js, ikke af siden');
});

test('"Angiv vægt": et tryk åbner indstillingerne med markøren i vægtfeltet, og knappen forsvinder, når vægten er gemt', () => {
  const app = loadApp();
  clickWeightLink(app);
  const dlg = app.pane();
  assert.deepEqual(app.views(), ['mere']);
  assert.equal(app.doc.activeElement, dlg.byId('setWeight'), 'vægtfeltet har fokus');
  dlg.byId('setWeight').value = '70';
  dlg.buttons('Gem vægt')[0].click();
  assert.doesNotMatch(app.$('kostCap').innerHTML, /Angiv vægt/);
  assert.doesNotMatch(app.$('kostGuide').innerHTML, /Angiv vægt/);
  // et almindeligt tryk på "Indstillinger" lægger ikke fokus i vægtfeltet
  const plain = loadApp();
  plain.$('settingsBtn').click();
  assert.notEqual(plain.doc.activeElement, plain.pane().byId('setWeight'));
});

test('"Angiv vægt" i artifact-bygningen åbner også indstillingerne med fokus i vægtfeltet', () => {
  const app = loadApp({ target: 'artifact' });
  clickWeightLink(app);
  assert.deepEqual(app.views(), ['mere']);
  assert.equal(app.doc.activeElement, app.pane().byId('setWeight'));
});

test('"Angiv vægt" fra et åbent pasark lukker arket først, så fanen Mere ikke ligger bag en modal', () => {
  const app = loadApp();
  openSheetOf(app, K.runEasy);
  assert.equal(app.$('sheet').open, true);
  clickWeightLink(app);
  assert.equal(app.$('sheet').open, false);
  assert.deepEqual(app.views(), ['mere']);
  assert.equal(app.doc.activeElement, app.pane().byId('setWeight'));
});
