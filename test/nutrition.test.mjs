// Kost (src/nutrition.js): dagtyper, intervaller, energiestimat, fueling pr. pas, vægt (kun lokalt) og guide. Vægt i tests er 70 kg (ikke en rigtig persons).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan, addDays, isoDate, RACE, TUNEUP } from '../src/plan.js';
import {
  DAY_TYPES, KCAL_BAND, KCAL_BASE_PER_KG, KCAL_TRAIN_PER_KG_H, KOST_REPORT_URL, WEIGHT_ERROR, WEIGHT_KEY,
  dayMinutes, dayNutrition, dayType, energyLine, isHardSession, kcalEstimate, kostGuide, parseWeight, readWeight, saveWeight,
  sessionFueling, weekKcalAverage,
} from '../src/nutrition.js';

const R = (a, b) => `${a}–${b}`; // intervaller skrives ikke ud i kildefilen, så det private-ord-tjek ikke rammer kulhydratintervaller
const date = (y, m, d) => new Date(y, m - 1, d);
const S = (m, over = {}) => ({ s: 'bike', t: 'Cykel', d: '', m, z: 'z2', ...over });
const REST = { s: 'rest', t: 'Hviledag', d: '', m: 0, z: 'rest' };
const weeks = plan();
const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
};

// ---- dagtyper ----

test('dagtype ud fra dagens minutter: hvile 0, let højst 60, moderat 61–180, lang over 180 (hvile-pas tæller ikke)', () => {
  const d = date(2027, 1, 5);
  const t = sessions => dayType(sessions, d);
  assert.equal(t([REST]), 'hvile');
  assert.equal(t([]), 'hvile');
  assert.equal(t([S(1)]), 'let');
  assert.equal(t([S(60)]), 'let');
  assert.equal(t([S(61)]), 'moderat');
  assert.equal(t([S(30), S(31)]), 'moderat', 'summen af dagens pas');
  assert.equal(t([S(180)]), 'moderat');
  assert.equal(t([S(181)]), 'lang');
  assert.equal(t([S(240)]), 'lang');
  assert.equal(t([REST, S(60)]), 'let');
  assert.equal(dayMinutes([REST, S(25), S(35)]), 60);
});

test('opladning: de to dage før IRONMAN (20. og 21. aug. 2027) og dagen før Køge Jernmand (12. jun.); race: løbsdagene', () => {
  assert.equal(isoDate(RACE), '2027-08-22');
  assert.equal(isoDate(TUNEUP), '2027-06-13');
  for (const [y, m, d] of [[2027, 8, 20], [2027, 8, 21], [2027, 6, 12]]) {
    assert.equal(dayType([REST], date(y, m, d)), 'opladning', `${y}-${m}-${d}`);
    assert.equal(dayType([S(30)], date(y, m, d)), 'opladning', 'går forud for minutterne');
    assert.equal(dayType([S(300)], date(y, m, d)), 'opladning');
  }
  assert.equal(dayType([S(720)], date(2027, 8, 22)), 'race');
  assert.equal(dayType([S(330)], date(2027, 6, 13)), 'race');
  assert.equal(dayType([S(30)], date(2027, 8, 19)), 'let', 'tre dage før er ikke opladning');
  assert.equal(dayType([S(30)], date(2027, 6, 11)), 'let');
  assert.equal(dayType([REST], date(2027, 8, 23)), 'hvile', 'dagen efter');
});

test('i den rigtige plan: racedagene er race, og opladningsdagene er de tre rigtige dage', () => {
  const byType = {};
  for (const w of weeks) w.days.forEach((d, i) => { const t = dayType(d, addDays(w.start, i)); (byType[t] ??= []).push(isoDate(addDays(w.start, i))); });
  assert.deepEqual(byType.race, ['2027-06-13', '2027-08-22']);
  assert.deepEqual(byType.opladning, ['2027-06-12', '2027-08-20', '2027-08-21']);
  for (const t of ['hvile', 'let', 'moderat', 'lang']) assert.ok(byType[t].length > 0, `planen har ${t}-dage`);
});

// ---- intervaller og protein ----

test('kulhydrat pr. dagtype (g/kg): hvile, let, moderat, lang og opladning stiger; race har ingen ramme', () => {
  assert.deepEqual(Object.keys(DAY_TYPES), ['hvile', 'let', 'moderat', 'lang', 'opladning', 'race']);
  assert.deepEqual([...DAY_TYPES.hvile.carb], [3, 5]);
  assert.deepEqual([...DAY_TYPES.let.carb], [5, 7]);
  assert.deepEqual([...DAY_TYPES.moderat.carb], [6, 10]);
  assert.deepEqual([...DAY_TYPES.lang.carb], [8, 12]);
  assert.deepEqual([...DAY_TYPES.opladning.carb], [10, 12]);
  assert.equal(DAY_TYPES.race.carb, null);
  assert.ok(Object.isFrozen(DAY_TYPES));
});

test('dagens kost med 70 kg: gram afrundet til 10 g, protein 1,6 g/kg (1,2–2,0) i 4–5 måltider à 0,3 g/kg', () => {
  const n = dayNutrition('moderat', 120, 70);
  assert.deepEqual(n.carb.grams, [420, 700]);
  assert.deepEqual(n.protein.grams, { day: 110, range: [84, 140], meal: 21 });
  assert.equal(n.proteinText, 'Protein ca. 110 g om dagen (84–140 g): 4–5 måltider à ca. 21 g');
  assert.deepEqual(dayNutrition('lang', 240, 70).carb.grams, [560, 840]);
  assert.deepEqual(dayNutrition('opladning', 30, 70).carb.grams, [700, 840]);
  assert.deepEqual(dayNutrition('hvile', 0, 72.5).carb.grams, [220, 360], '72,5 × 3–5 = 217,5–362,5 → 220–360');
  const none = dayNutrition('moderat', 120, null);
  assert.equal(none.carb.grams, null);
  assert.equal(none.proteinText, 'Protein 1,6 g/kg om dagen (1,2–2,0): 4–5 måltider à ca. 0,3 g/kg');
});

// ---- energi ----

test('energiformlen: vægt × 37 kcal + minutter × (vægt × 8,5)/60, ±5 %, afrundet til 50 kcal', () => {
  assert.equal(KCAL_BASE_PER_KG, 37);
  assert.equal(KCAL_TRAIN_PER_KG_H, 8.5);
  assert.equal(KCAL_BAND, 0.05);
  // 70 kg uden træning: 2.590 kcal → ±5 % = 2.460,5–2.719,5
  assert.deepEqual(kcalEstimate(70, 0), { mid: 2600, lo: 2450, hi: 2700 });
  // 70 kg, 120 min: 2.590 + 120 × 9,9167 = 3.780 → 3.591–3.969
  assert.deepEqual(kcalEstimate(70, 120), { mid: 3800, lo: 3600, hi: 3950 });
  // 70 kg, 240 min: 2.590 + 2.380 = 4.970 → 4.721,5–5.218,5
  assert.deepEqual(kcalEstimate(70, 240), { mid: 4950, lo: 4700, hi: 5200 });
  // 60 kg, 60 min: 2.220 + 510 = 2.730
  assert.deepEqual(kcalEstimate(60, 60), { mid: 2750, lo: 2600, hi: 2850 });
  for (const bad of [null, undefined, 0, 34.9, 200.1, NaN, '70', Infinity]) assert.equal(kcalEstimate(bad, 60), null, String(bad));
});

test('chip: "Moderat · 3.600–3.950 kcal · 420–700 g KH" med vægt, g/kg uden; opladning og race har ingen kcal', () => {
  assert.equal(dayNutrition('moderat', 120, 70).chip, 'Moderat · 3.600–3.950 kcal · 420–700 g KH');
  assert.equal(dayNutrition('moderat', 120, 70).text, 'Moderat · 3.600–3.950 kcal (estimat) · 420–700 g KH');
  assert.equal(dayNutrition('moderat', 120, null).chip, `Moderat · ${R(6, 10)} g/kg KH`);
  assert.equal(dayNutrition('lang', 240, 70).chip, 'Lang · 4.700–5.200 kcal · 560–840 g KH');
  assert.equal(dayNutrition('lang', 240).chip, `Lang · ${R(8, 12)} g/kg KH`);
  assert.equal(dayNutrition('hvile', 0, 70).chip, 'Hvile · 2.450–2.700 kcal · 210–350 g KH');
  assert.equal(dayNutrition('let', 45, 70).chip, 'Let · 2.900–3.200 kcal · 350–490 g KH');
  assert.equal(dayNutrition('opladning', 30, 70).chip, 'Opladning · 700–840 g KH');
  assert.equal(dayNutrition('opladning', 30, null).chip, `Opladning · ${R(10, 12)} g/kg KH`);
  assert.equal(dayNutrition('opladning', 30, 70).kcal, null);
  assert.equal(dayNutrition('race', 720, 70).kcal, null);
  assert.equal(dayNutrition('race', 720, 70).carb, null);
  assert.match(dayNutrition('race', 720, 70).chip, /^Race · se løbsdagsplanen$/);
  assert.throws(() => dayNutrition('ukendt'), /ukendt dagtype/);
});

test('ugens gennemsnit: kun dage med et kcal-estimat tæller (ikke opladning og race); null uden vægt', () => {
  const w = weeks[0];
  const avg = weekKcalAverage(w.days, w.start, 70);
  const expected = w.days.reduce((a, d) => a + 70 * 37 + dayMinutes(d) * (70 * 8.5) / 60, 0) / 7;
  assert.equal(avg.avg, Math.round(expected / 50) * 50);
  assert.equal(avg.days, 7);
  assert.equal(avg.skipped, 0);
  assert.equal(weekKcalAverage(w.days, w.start, null), null);
  assert.equal(weekKcalAverage(w.days, w.start, 20), null);
  const race = weeks[42];
  const r = weekKcalAverage(race.days, race.start, 70);
  assert.equal(r.skipped, 3, 'fredag, lørdag (opladning) og søndag (IRONMAN)');
  assert.equal(r.days, 4);
  const w33 = weeks[32]; // Køge-ugen: lørdag opladning og søndag race
  assert.equal(weekKcalAverage(w33.days, w33.start, 70).skipped, 2);
});

// ---- fueling pr. pas ----

const f = (s, opts) => sessionFueling([s], 0, opts);
const NORMAL_AFTER = 'Måltid inden for 1–2 t med 20–40 g protein + kulhydrat';

test('før: rolig morgen højst 60 min kan klares fastende eller med 30 g kulhydrat; morgenintervaller får 30–50 g 30–60 min før', () => {
  const easy = f(S(25, { s: 'swim', t: 'Rolig svømning (morgen)', z: 'easy' }));
  assert.equal(easy.before, 'Kan klares fastende eller med 30 g kulhydrat (fx en banan)');
  assert.equal(easy.morning, true);
  assert.equal(f(S(60, { s: 'swim', t: 'Svømning (morgen)', z: 'easy' })).before, 'Kan klares fastende eller med 30 g kulhydrat (fx en banan)');
  const ints = f(S(45, { s: 'swim', t: 'Svømmeintervaller (morgen)', z: 'easy', main: 'css' }));
  assert.equal(ints.before, '30–50 g kulhydrat 30–60 min før');
  assert.equal(ints.hard, true);
  assert.equal(f(S(75, { s: 'swim', t: 'Svømmeintervaller (morgen)', z: 'easy', main: 'css' })).before, '30–50 g kulhydrat 30–60 min før');
  assert.equal(f(S(75, { s: 'swim', t: 'Rolig svømning (morgen)', z: 'easy' })).before, '30–50 g kulhydrat 30–60 min før', 'rolig morgenpas over 60 min');
  assert.match(f(S(120, { t: 'Cykel (morgen)' })).before, /^Måltid 2–3 t før/, 'et langt morgenpas bruger måltidsreglen');
});

test('før: lange (over 60 min) og hårde pas får måltid 2–3 t før med 1–2 g/kg kulhydrat; korte rolige pas ingen særlig forberedelse', () => {
  const MEAL = 'Måltid 2–3 t før med 1–2 g/kg kulhydrat, lidt fedt og fiber';
  assert.equal(f(S(61)).before, MEAL);
  assert.equal(f(S(45, { t: 'Cykel med intervaller', main: 'ss' })).before, MEAL, 'hårdt, selv om det er kort');
  assert.match(f(S(180, { z: 'z2', main: 'im' })).before, /^Måltid 2–3 t før med 1–2 g\/kg kulhydrat, lidt fedt og fiber\. Valgfrit: koffein/, 'et langt nøglepas får også koffein-linjen');
  assert.equal(f(S(60)).before, 'Normal kost, ingen særlig forberedelse');
  assert.equal(f(S(40, { s: 'str', z: 'str', t: 'Styrke' })).before, 'Normal kost, ingen særlig forberedelse');
  assert.equal(f(S(61), { weight: 70 }).before, 'Måltid 2–3 t før med 1–2 g/kg kulhydrat (70–140 g), lidt fedt og fiber');
});

test('før: koffein ca. 3 mg/kg ca. 60 min før er valgfrit ved nøglepas, tests og løb (med vægt: ca. 210 mg), ellers ikke', () => {
  const test_ = f(S(60, { t: 'Cykeltest', z: 'test' }));
  assert.match(test_.before, /Valgfrit: koffein ca\. 3 mg\/kg ca\. 60 min før/);
  assert.equal(test_.key, true);
  assert.match(f(S(60, { t: 'Cykeltest', z: 'test' }), { weight: 70 }).before, /koffein ca\. 3 mg\/kg \(ca\. 210 mg\) ca\. 60 min før/);
  assert.match(f(S(151)).before, /koffein/, 'lange pas over 150 min');
  assert.doesNotMatch(f(S(150)).before, /koffein/);
  assert.match(f(S(120, { z: 'z2', main: 'thr' })).before, /koffein/, 'hårdt pas på 90 min eller mere');
  assert.doesNotMatch(f(S(75, { z: 'z2', main: 'thr' })).before, /koffein/);
  assert.match(f(S(75, { s: 'race', t: '10 km-løb', z: 'z4' })).before, /koffein/);
  assert.doesNotMatch(f(S(60)).before, /koffein/);
});

test('under: under 75 min kun vand, 75–150 min 30–60 g kulhydrat/t, over 150 min 60–90 g/t (glukose + fruktose); væske og natrium', () => {
  assert.equal(f(S(74)).during, 'Kun vand');
  assert.equal(f(S(10)).during, 'Kun vand');
  assert.equal(f(S(75)).during, '30–60 g kulhydrat/t. Drik så du hverken taber over 2 % eller tager på');
  assert.equal(f(S(120)).during, '30–60 g kulhydrat/t. Drik så du hverken taber over 2 % eller tager på', 'natrium først over 120 min');
  assert.equal(f(S(150)).during, '30–60 g kulhydrat/t. Drik så du hverken taber over 2 % eller tager på og tilsæt 500–700 mg natrium pr. liter');
  assert.equal(f(S(151)).during, '60–90 g/t (glukose + fruktose). Drik så du hverken taber over 2 % eller tager på og tilsæt 500–700 mg natrium pr. liter');
  assert.equal(f(S(300), { weight: 70 }).during, f(S(300)).during, 'g/t afhænger ikke af vægten');
});

test('efter: normalt måltid inden for 1–2 t med 20–40 g protein + kulhydrat; væske 1,25–1,5 L pr. kg tabt ved pas fra 75 min', () => {
  assert.equal(f(S(45)).after, NORMAL_AFTER);
  assert.equal(f(S(75)).after, `${NORMAL_AFTER}. Væske: 1,25–1,5 L pr. kg tabt`);
  assert.equal(f(S(200)).after, `${NORMAL_AFTER}. Væske: 1,25–1,5 L pr. kg tabt`);
});

test('efter, back-to-back: andet krævende pas samme dag giver 1–1,2 g/kg/t kulhydrat i 4 t + 0,3 g/kg protein', () => {
  const first = S(90, { z: 'z2', main: 'thr', t: 'Cykel med intervaller' });
  const second = S(70, { s: 'run', t: 'Løb', z: 'z2' });
  const day = [first, second];
  const a = sessionFueling(day, 0);
  assert.equal(a.backToBack, true);
  assert.equal(a.after, 'Kort tid til næste krævende pas: 1–1,2 g/kg/t kulhydrat i 4 t + 0,3 g/kg protein. Væske: 1,25–1,5 L pr. kg tabt');
  assert.equal(sessionFueling(day, 0, { weight: 70 }).after,
    'Kort tid til næste krævende pas: 1–1,2 g/kg/t kulhydrat i 4 t (70–84 g/t) + 0,3 g/kg protein (ca. 21 g). Væske: 1,25–1,5 L pr. kg tabt');
  assert.equal(sessionFueling(day, 1).backToBack, false, 'det sidste pas har intet efter sig');
  assert.equal(sessionFueling(day, 1).after, NORMAL_AFTER, 'under 75 min: ingen væskelinje');
  // et let og kort andet pas er ikke krævende
  assert.equal(sessionFueling([first, S(30, { s: 'run', t: 'Løb', z: 'easy' })], 0).backToBack, false);
  // et rolig, kort første pas udløser det heller ikke, selv om det andet er hårdt
  assert.equal(sessionFueling([S(30, { z: 'easy' }), S(60, { z: 'z2', main: 'thr' })], 0).backToBack, false);
});

test('efter, back-to-back: hårdt morgenpas næste dag (først på dagen) gælder dagens sidste pas, når dagen er krævende', () => {
  const nextHard = [S(45, { s: 'swim', t: 'Svømmeintervaller (morgen)', z: 'easy', main: 'css' }), S(30, { s: 'run', t: 'Roligt løb', z: 'z2' })];
  const nextEasy = [S(30, { s: 'swim', t: 'Rolig svømning (morgen)', z: 'easy' })];
  const nextHardNotMorning = [S(60, { s: 'run', t: 'Løbeintervaller', z: 'easy', main: 'thr' })];
  const wed = [S(60, { s: 'swim', t: 'Lang svømmetur', z: 'easy' }), S(45, { t: 'Let cykeltur', z: 'easy' })];
  const lastOfDay = sessionFueling(wed, 1, { next: nextHard });
  assert.equal(lastOfDay.backToBack, true);
  assert.match(lastOfDay.after, /^Kort tid til næste krævende pas: 1–1,2 g\/kg\/t kulhydrat i 4 t \+ 0,3 g\/kg protein/);
  assert.equal(sessionFueling(wed, 0, { next: nextHard }).backToBack, false, 'kun dagens sidste pas');
  assert.equal(sessionFueling(wed, 1, { next: nextEasy }).backToBack, false);
  assert.equal(sessionFueling(wed, 1, { next: nextHardNotMorning }).backToBack, false, 'kun et hårdt pas om morgenen (titlen siger "(morgen)")');
  assert.equal(sessionFueling(wed, 1, { next: [] }).backToBack, false);
  assert.equal(sessionFueling(wed, 1, { next: [REST, ...nextHard] }).backToBack, true, 'næste dags første pas, hvile springes over');
  // en kort, rolig dag er ikke krævende
  assert.equal(sessionFueling([S(30, { z: 'easy' })], 0, { next: nextHard }).backToBack, false);
});

test('brick: cyklen peger på løbet efter sig, og løbet følger lige efter cyklen', () => {
  const day = [S(240, { t: 'Lang cykeltur' }), S(30, { s: 'run', t: 'Brick-løb', z: 'im' })];
  const bike = sessionFueling(day, 0), run = sessionFueling(day, 1);
  assert.equal(bike.after, 'Brick-løbet følger lige efter: restitutionsmåltidet tages efter løbet');
  assert.equal(bike.backToBack, false);
  assert.equal(run.before, 'Følger lige efter cyklen: fortsæt med kulhydrat og væske som på cyklen');
  assert.equal(run.during, 'Kun vand');
  assert.equal(run.after, NORMAL_AFTER);
});

test('hvile giver ingen fueling; ugyldigt index heller ikke', () => {
  assert.equal(sessionFueling([REST], 0), null);
  assert.equal(sessionFueling([S(30)], 3), null);
});

test('IRONMAN og Køge Jernmand: morgenmad 1–4 g/kg 1–4 t før, cykel 60–90 g/t, løb 30–90 g/t, intet nyt på løbsdagen', () => {
  const ironman = weeks[42].days[6][0];
  assert.equal(ironman.t, 'IRONMAN');
  const r = sessionFueling(weeks[42].days[6], 0);
  assert.match(r.before, /^Morgenmad 1–4 g\/kg kulhydrat 1–4 t før, lavt fedt og fiber, gerne flydende, og 5–10 mL\/kg væske 2–4 t før\. Intet nyt på løbsdagen\. Valgfrit: koffein ca\. 3 mg\/kg/);
  assert.match(r.during, /^Cykel 60–90 g kulhydrat\/t \(glukose \+ fruktose\), løb 30–90 g\/t efter tolerance\. Drik så du hverken taber over 2 % eller tager på og tilsæt 500–700 mg natrium pr\. liter\. Intet nyt på løbsdagen$/);
  assert.match(sessionFueling(weeks[42].days[6], 0, { weight: 70 }).before, /1–4 t før \(70–280 g\).*2–4 t før \(350–700 mL\)/);
  assert.match(sessionFueling(weeks[32].days[6], 0).during, /^Cykel 60–90 g kulhydrat\/t/);
});

test('hver planlagt pas (ikke hvile) har før, under og efter uden hul i teksten, med og uden vægt', () => {
  let n = 0, b2b = 0;
  for (const w of weeks) w.days.forEach((day, di) => {
    const next = di < 6 ? w.days[di + 1] : (weeks[w.n]?.days[0] ?? []);
    day.forEach((s, si) => {
      for (const weight of [null, 70]) {
        const x = sessionFueling(day, si, { next, weight });
        if (s.s === 'rest') { assert.equal(x, null); continue; }
        for (const k of ['before', 'during', 'after']) {
          assert.equal(typeof x[k], 'string', `${w.id}-${di}-${si} ${k}`);
          assert.ok(x[k].length > 5, `${w.id}-${di}-${si} ${k}`);
          assert.doesNotMatch(x[k], /undefined|NaN|null|\[object/, `${w.id}-${di}-${si} ${k}: ${x[k]}`);
        }
        if (weight === null) { n++; if (x.backToBack) b2b++; }
      }
    });
  });
  assert.ok(n > 300);
  assert.ok(b2b > 0, 'reglen rammer også pas i den rigtige plan (fx onsdag før torsdagens morgenintervaller)');
});

test('hårde zoner: intensitetszoner er hårde, rolige zoner, styrke og hvile er ikke', () => {
  for (const z of ['im', 'hm', 'tempo', 'ss', 'thr', 'z4', 'css', 'test']) assert.equal(isHardSession(S(60, { z })), true, z);
  assert.equal(isHardSession(S(60, { z: 'easy', main: 'thr' })), true, 'hovedsættets zone');
  for (const z of ['easy', 'z2']) assert.equal(isHardSession(S(60, { z })), false, z);
  assert.equal(isHardSession(S(40, { s: 'str', z: 'str' })), false);
  assert.equal(isHardSession(REST), false);
  assert.equal(isHardSession(null), false);
});

// ---- .ics: Energi undervejs ----

test('energyLine: kun pas over 75 min, kun g/t uden vægt; løb viser cykel og løb', () => {
  assert.equal(energyLine(S(75)), null);
  assert.equal(energyLine(S(30)), null);
  assert.equal(energyLine(REST), null);
  assert.equal(energyLine(S(76)), 'Energi undervejs: 30–60 g kulhydrat/t');
  assert.equal(energyLine(S(150)), 'Energi undervejs: 30–60 g kulhydrat/t');
  assert.equal(energyLine(S(151)), 'Energi undervejs: 60–90 g/t (glukose + fruktose)');
  assert.equal(energyLine(weeks[42].days[6][0]), 'Energi undervejs: cykel 60–90 g kulhydrat/t (glukose + fruktose), løb 30–90 g/t efter tolerance');
  for (const w of weeks) for (const d of w.days) for (const s of d) {
    const line = energyLine(s);
    if (s.s === 'rest' || s.m <= 75) assert.equal(line, null, s.t);
    else assert.match(line, /^Energi undervejs: .*g.*\/t/, s.t);
    if (line) assert.doesNotMatch(line, /\bkg\b|kcal/, 'ingen vægt og ingen kcal i kalenderen');
  }
});

// ---- vægt: kun lokalt ----

test('parseWeight: 35–200 kg, komma eller punktum, valgfri enhed; alt andet er null', () => {
  assert.equal(parseWeight('70'), 70);
  assert.equal(parseWeight(' 72,5 '), 72.5);
  assert.equal(parseWeight('72.5 kg'), 72.5);
  assert.equal(parseWeight('72,55'), 72.6, 'rundes til én decimal');
  assert.equal(parseWeight('35'), 35);
  assert.equal(parseWeight('200'), 200);
  assert.equal(parseWeight('199,9'), 199.9);
  for (const bad of ['34,9', '34.99', '200,1', '201', '7', '1000', '', 'abc', '70 pund', '-70', '70,555', '7 0', null, undefined, NaN]) assert.equal(parseWeight(bad), null, String(bad));
});

test('saveWeight/readWeight: gemmer kun under sin egen nøgle, afviser ugyldigt uden at ændre noget, og tom tekst fjerner vægten', () => {
  const st = mem({ 'im2027-progress-v2': '{"v":2,"weeks":{}}' });
  assert.equal(readWeight(st), null);
  assert.deepEqual(saveWeight(st, '70,5'), { ok: true, kg: 70.5 });
  assert.equal(st.getItem(WEIGHT_KEY), '70.5');
  assert.equal(readWeight(st), 70.5);
  assert.deepEqual(st.keys().sort(), [WEIGHT_KEY, 'im2027-progress-v2'].sort(), 'ingen andre nøgler');
  assert.equal(st.getItem('im2027-progress-v2'), '{"v":2,"weeks":{}}', 'fremdriften er urørt');
  for (const bad of ['20', '250', 'tung']) {
    assert.deepEqual(saveWeight(st, bad), { ok: false, error: WEIGHT_ERROR }, bad);
    assert.equal(readWeight(st), 70.5, 'en afvist vægt ændrer intet');
  }
  assert.match(WEIGHT_ERROR, /35 og 200 kg/);
  assert.deepEqual(saveWeight(st, '  '), { ok: true, kg: null });
  assert.equal(st.getItem(WEIGHT_KEY), null);
  assert.equal(readWeight(st), null);
});

test('readWeight: en ødelagt eller manipuleret værdi giver null; lager der kaster giver fejl ved gem og null ved læs', () => {
  assert.equal(readWeight(mem({ [WEIGHT_KEY]: 'abc' })), null);
  assert.equal(readWeight(mem({ [WEIGHT_KEY]: '5000' })), null);
  assert.equal(readWeight(mem({ [WEIGHT_KEY]: '<script>' })), null);
  assert.equal(readWeight(null), null);
  const blocked = { getItem() { throw new Error('blokeret'); }, setItem() { throw new Error('blokeret'); }, removeItem() { throw new Error('blokeret'); } };
  assert.equal(readWeight(blocked), null);
  assert.equal(saveWeight(blocked, '70').ok, false);
  assert.equal(saveWeight(blocked, '').ok, false);
  assert.equal(saveWeight(null, '70').ok, false);
});

// ---- guide ----

test('guiden: dagtabel med alle dagtyper, før/under/efter, løbsuge, tilskud, advarselstegn, kilder og forbehold', () => {
  const g = kostGuide();
  assert.deepEqual(g.map(s => s.title), ['Dag for dag', 'Før, under og efter', 'Løbsuge og løbsdag', 'Kosttilskud', 'Advarselstegn og vægt', 'Kilder']);
  const table = g[0].table;
  assert.deepEqual(table.head, ['Dagtype', 'Træning', 'Kulhydrat g/kg']);
  assert.deepEqual(table.rows.map(r => [r[0], r[2]]), [['Hvile', R(3, 5)], ['Let', R(5, 7)], ['Moderat', R(6, 10)], ['Lang', R(8, 12)], ['Opladning', R(10, 12)], ['Race', 'se løbsugen']]);
  const all = JSON.stringify(g);
  for (const x of ['D-vitamin', '10 µg', 'oktober til april', 'ferritin', 'batch-testede', '10–15 %', 'Anti Doping Danmark', 'Informed-Sport',
    '36 til 48 t', 'Intet nyt', 'Køge Jernmand', 'hvilepuls', '0,5 kg over 2 til 3 uger', '37 kcal', '8,5 kcal', '±5 %', 'estimat', 'NNR 2023',
    '30–60 g kulhydrat/t', '60–90 g/t', '500–700 mg natrium', 'Under 75 min', '1–1,2 g/kg/t', '0,3 g/kg protein', '1,25–1,5 L pr. kg tabt',
    'Generel vejledning, ikke individuel lægefaglig rådgivning']) assert.ok(all.includes(x), x);
  assert.deepEqual(g[5].link, { href: KOST_REPORT_URL, text: 'Kildegrundlag og alle tal (docs/research/ernaering-kilder.md)' });
  assert.equal(KOST_REPORT_URL, 'https://github.com/EmilBerntsen-ui/ironman-2027/blob/main/docs/research/ernaering-kilder.md');
});

test('guiden: med vægt får tabellen en kolonne med gram', () => {
  const t = kostGuide(70)[0].table;
  assert.deepEqual(t.head, ['Dagtype', 'Træning', 'Kulhydrat g/kg', 'Med din vægt']);
  assert.deepEqual(t.rows.map(r => r[3]), ['210–350 g', '350–490 g', '420–700 g', '560–840 g', '700–840 g', '']);
  for (const r of t.rows) assert.equal(r.length, 4);
});

// ---- privatliv ----

test('kildefilen indeholder ingen private ord og ingen kropsdata om en rigtig person', () => {
  const src = readFileSync(new URL('../src/nutrition.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b[d]tu\b|[s]ymphogen/i); // klammerne gør, at selve testen ikke indeholder ordene
  assert.doesNotMatch(src, /8[–-]12|13[–-]17|9[–-]17/, 'private-ord-tjekket (git grep) skal forblive tomt');
  const me = readFileSync(new URL('./nutrition.test.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(me, /8[–-]12|13[–-]17|9[–-]17/);
});
