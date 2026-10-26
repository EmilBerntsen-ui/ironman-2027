// Plan-råd (src/advice.js): tommelfingerregler ud fra logs, og kortene på I dag (src/app.js: paintToday → #advice).
// Reglerne testes på en lille syntetisk plan (3 uger), så grænserne kan ramme præcist; planens egne data bruges til en rygtest og til UI'en.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVICE_LEVELS, ADVICE_MAX, adviceFor, isEasyDay, isEasySession, isLongSession } from '../src/advice.js';
import { plan, pmc, plannedDailyTss } from '../src/plan.js';
import { memoryStorage } from './dom-harness.mjs';
import { loadApp } from './app-harness.mjs';

// ---- Syntetisk plan: uge 1–3, hver uge: man hvile · tir løbeintervaller + styrke · ons svøm · tor roligt løb · fre hvile · lør lang cykeltur · søn langt løb ----
const S = (s, t, m, z = 'z2', extra = {}) => ({ s, t, m, z, ...extra });
const REST = S('rest', 'Hviledag', 0, 'rest');
const FRI_BIKE = S('bike', 'Rolig cykel', 40, 'z2');
const makeWeek = n => ({
  id: `u0${n}`, n,
  days: [
    [REST],
    [S('run', 'Løbeintervaller', 40, 'easy', { main: 'z4' }), S('str', 'Styrke', 30, 'str')],
    [S('swim', 'Rolig svømning', 30, 'easy')],
    [S('run', 'Roligt løb', 30, 'z2')],
    [REST],
    [S('bike', 'Lang cykeltur', 120, 'z2')],
    [S('run', 'Langt løb', 60, 'z2')],
  ],
});
const weeks = [1, 2, 3].map(makeWeek);
// dag-indeks: uge 1 = 0–6, uge 2 = 7–13, uge 3 = 14–20. Mandag = 0/7/14, tirsdag 1/8/15, onsdag 2/9/16, torsdag 3/10/17, fredag 4/11/18, lørdag 5/12/19, søndag 6/13/20.
const wk = d => weeks[Math.floor(d / 7)].id;
const T = '2026-11-01T00:00:00.000Z';
const entry = (extra = {}) => ({ done: true, updatedAt: T, ...extra });
// log(prog, d, si, extra): gennemfør pas si på dag d
function log(prog, d, si = 0, extra = {}) { (prog[wk(d)] ??= {})[`${d % 7}-${si}`] = entry(extra); return prog; }
let xn = 0;
// logX(prog, d, min, rpe): en ekstra på dag d
function logX(prog, d, min, rpe, sport = 'run') {
  (prog[wk(d)] ??= {})[`x-ext${String(++xn).padStart(3, '0')}`] = { day: d % 7, sport, min, ...(rpe ? { rpe } : {}), source: 'manual', updatedAt: T };
  return prog;
}
// Alle planlagte pas (ikke hvile) på dagene fra..til, begge inklusive, gennemført (med de planlagte minutter).
function logPlanned(prog, from, to, skip = []) {
  for (let d = from; d <= to; d++) weeks[Math.floor(d / 7)].days[d % 7].forEach((s, si) => { if (s.s !== 'rest' && !skip.includes(`${d}-${si}`)) log(prog, d, si); });
  return prog;
}
const advise = (prog, todayIdx, over = {}) => adviceFor({ weeks, progress: prog, todayIdx, ...over });
const rules = list => list.map(a => a.rule);
// En PMC-serie hvor kun dagens TSB er styret: ctl/atl er ligegyldige for rådene.
const tsbSeries = (todayIdx, tsb) => Array.from({ length: todayIdx + 1 }, (_, i) => ({ ctl: 30, atl: 30, tsb: i === todayIdx ? tsb : 0 }));

test('konstanter og form: højst 2 råd, hvert med level, title, text, rule og reason', () => {
  assert.equal(ADVICE_MAX, 2);
  assert.deepEqual({ ...ADVICE_LEVELS }, { stop: 3, warn: 2, info: 1 });
  const list = advise(logPlanned({}, 3, 5, ['3-0']), 10);
  assert.ok(list.length >= 1);
  for (const a of list) {
    assert.ok(a.level in ADVICE_LEVELS, a.level);
    for (const k of ['title', 'text', 'rule', 'reason']) assert.ok(typeof a[k] === 'string' && a[k].length > 0, k);
  }
});

// ---- a. sprungne pas ----

test('a. sprunget over: ≥ 2 planlagte pas ikke logget de seneste 7 hele dage → info "Fortsæt planen – indhent ikke"', () => {
  // i dag = torsdag i uge 2 (dag 10): vinduet er dag 3–9, med 6 planlagte pas (tor, lør, søn, tir×2, ons)
  const base = () => logPlanned({}, 3, 9);
  assert.deepEqual(advise(base(), 10), [], 'alt logget: intet råd');
  const one = base(); delete one.u01['3-0'];
  assert.deepEqual(rules(advise(one, 10)), [], '1 sprunget: under grænsen');
  const two = base(); delete two.u01['3-0']; delete two.u02['2-0'];
  const [a, ...rest] = advise(two, 10);
  assert.equal(rest.length, 0);
  assert.deepEqual({ level: a.level, title: a.title, rule: a.rule }, { level: 'info', title: 'Fortsæt planen – indhent ikke', rule: 'missed' });
  assert.match(a.reason, /^2 af 6 planlagte pas de seneste 7 dage er ikke logget \(Tor Roligt løb, Ons Rolig svømning\)\.$/);
  assert.match(a.text, /Spring de sprungne pas over.*Du skal ikke indhente dem\./);
  assert.doesNotMatch(a.text, /Flyt/);
});

test('a. vinduet er de 7 hele dage før i dag: dag −8 og i dag tæller ikke, dag −7 gør', () => {
  const prog = logPlanned({}, 1, 10);
  delete prog.u01['3-0'];                 // torsdag dag 3 = 7 dage før dag 10: tæller
  delete prog.u02['1-0']; delete prog.u02['1-1']; // tirsdag dag 8
  assert.equal(advise(prog, 10)[0].reason.slice(0, 18), '3 af 6 planlagte p');
  const before = logPlanned({}, 0, 10); delete before.u01['1-0']; delete before.u01['1-1']; // dag 1 = 9 dage før dag 10: uden for vinduet
  assert.deepEqual(advise(before, 10), []);
  const edge = logPlanned({}, 0, 10); delete edge.u01['3-0']; delete edge.u01['5-0']; // dag 3 (7 før) og dag 5
  assert.equal(advise(edge, 10)[0].rule, 'missed');
  const edge2 = logPlanned({}, 0, 9); delete edge2.u01['2-0']; delete edge2.u01['3-0'];     // dag 2 (8 før) tæller ikke, dag 3 gør: kun 1 i vinduet
  assert.deepEqual(advise(edge2, 10), []);
  // i dag tæller ikke, den er ikke slut: to ulogget pas i dag er ikke "sprunget over"
  const today = logPlanned({}, 1, 7);
  assert.deepEqual(advise(today, 8), [], 'tirsdag (dag 8) er i dag og ulogget: de 7 hele dage før er alle logget');
});

test('a. uden nogen logs gives intet råd (loggen bruges ikke, eller er ikke hentet endnu); ét log et sted i planen er nok', () => {
  assert.deepEqual(advise({}, 10), []);
  assert.deepEqual(advise(null, 10), []);
  assert.deepEqual(advise(undefined, 10), []);
  assert.deepEqual(advise({ u01: {} }, 10), []);
  const one = log({}, 0, 0); // et enkelt gammelt log
  assert.deepEqual(rules(advise(one, 10)), ['missed']);
  assert.deepEqual(rules(advise(logX({}, 0, 30), 10)), ['missed'], 'en ekstra tæller også som log');
});

test('a. ≥ 3 sprunget inkl. et langt pas: flyt det til den næste frie dag i ugen; ellers spring det over', () => {
  // i dag = torsdag dag 10; lørdagens lange cykeltur (dag 5) og to andre pas er sprunget; fredag (dag 11) er en fri dag
  const prog = logPlanned({}, 3, 9, ['3-0', '5-0', '9-0']); // tor (dag 3), lør (dag 5, lang cykel) og ons (dag 9) sprunget; nøglerne er dag-indeks
  const [a] = advise(prog, 10);
  assert.match(a.reason, /^3 af 6 planlagte pas/);
  assert.match(a.text, /^Flyt Lang cykeltur \(2:00 t\) til fredag, den næste frie dag i ugen, hvis du er frisk\. Ellers spring det over\. De andre sprungne pas indhenter du ikke\.$/);
  // er flere lange pas sprunget, vælges det seneste (søndagens langt løb)
  const both = logPlanned({}, 3, 9, ['3-0', '5-0', '6-0']);
  assert.match(advise(both, 10)[0].text, /^Flyt Langt løb \(1:00 t\) til fredag/);
  // ingen fri dag tilbage (fredag er et pas): spring det over
  const busy = structuredClone(weeks); busy[1].days[4] = [FRI_BIKE];
  const b = adviceFor({ weeks: busy, progress: prog, todayIdx: 10 })[0];
  assert.match(b.text, /^Der er ingen fri dag tilbage i ugen til Lang cykeltur \(2:00 t\): spring det over, og fortsæt med dagens pas\./);
  assert.doesNotMatch(b.text, /Flyt/);
  // i dag er fredag (dag 11): lørdag og søndag er optaget, så ingen fri dag; selve i dag tæller ikke som fri dag
  const fri = logPlanned({}, 4, 10, ['5-0', '6-0', '9-0']);
  assert.match(adviceFor({ weeks, progress: fri, todayIdx: 11 })[0].text, /ingen fri dag/);
  // ≥ 3 uden et langt pas: den almindelige tekst
  const noLong = logPlanned({}, 3, 9, ['3-0', '9-0', '8-0']); // tor, ons og tirsdagens løbeintervaller
  const [c] = advise(noLong, 10);
  assert.match(c.reason, /^3 af 6/);
  assert.doesNotMatch(c.text, /Flyt|fri dag/);
  // kun 2 sprunget, selv om det ene er langt: ingen flytning (kræver ≥ 3)
  const two = logPlanned({}, 3, 9, ['5-0', '3-0']);
  assert.doesNotMatch(advise(two, 10)[0].text, /Flyt|fri dag/);
});

// ---- b. træthed ud fra RPE ----

const RPE_TITLE = 'Gør dagens intervaller rolige (Z2) eller tag en ekstra hviledag';
test('b. to logs med RPE ≥ 9 inden for 4 dage (i dag og de 3 før) → warn', () => {
  // dag 9 (onsdag) og dag 10 (i dag, torsdag): to logs med RPE ≥ 9
  const prog = logPlanned({}, 3, 9); prog.u02['2-0'] = entry({ rpe: 9 });
  log(prog, 10, 0, { rpe: 10 });
  const [a] = advise(prog, 10);
  assert.deepEqual({ level: a.level, title: a.title, rule: a.rule }, { level: 'warn', title: RPE_TITLE, rule: 'rpe' });
  assert.match(a.reason, /^2 logs med RPE 9 og 10 de seneste 4 dage\.$/);
  assert.match(a.text, /rolig Z2.*ekstra hviledag/);
  // grænser: dag 7 (3 før) tæller, dag 6 (4 før) gør ikke; RPE 8 tæller ikke; ét hårdt log er ikke nok
  const edge = logPlanned({}, 3, 9); edge.u02['1-0'] = entry({ rpe: 9 }); edge.u02['2-0'] = entry({ rpe: 9 }); // dag 8 og 9
  assert.ok(rules(advise(edge, 10)).includes('rpe'));
  const old = logPlanned({}, 3, 9); old.u01['5-0'] = entry({ rpe: 9 }); old.u02['2-0'] = entry({ rpe: 9 }); // dag 5 (5 før) og dag 9
  assert.equal(rules(advise(old, 10)).includes('rpe'), false, 'dag 5 ligger uden for de 4 dage');
  const eight = logPlanned({}, 3, 9); eight.u02['1-0'] = entry({ rpe: 8 }); eight.u02['2-0'] = entry({ rpe: 8 });
  assert.equal(rules(advise(eight, 10)).includes('rpe'), false, 'RPE 8 er ikke ≥ 9');
  const single = logPlanned({}, 3, 9); single.u02['2-0'] = entry({ rpe: 10 });
  assert.equal(rules(advise(single, 10)).includes('rpe'), false);
  // to logs samme dag tæller, og en ekstra tæller som log (med RPE)
  const same = logPlanned({}, 3, 9); same.u02['1-0'] = entry({ rpe: 9 }); same.u02['1-1'] = entry({ rpe: 9 });
  assert.ok(rules(advise(same, 10)).includes('rpe'));
  const withExtra = logPlanned({}, 3, 9); withExtra.u02['2-0'] = entry({ rpe: 9 }); logX(withExtra, 10, 40, 9);
  assert.ok(rules(advise(withExtra, 10)).includes('rpe'));
});

test('b. de seneste ≥ 3 rolige pas i træk logget med RPE ≥ 7 → warn; et pas under 7, et sprunget pas eller et gammelt stykke bryder rækken', () => {
  // rolige pas (Z1–Z2 uden hovedsæt) i rækkefølge før dag 10: tor dag 3 (roligt løb), lør dag 5 (lang cykel), søn dag 6 (langt løb), ons dag 9 (svøm); i dag (tor) står roligt løb
  const mk = (r3, r5, r6, r9) => { const p = logPlanned({}, 3, 9); p.u01['3-0'] = entry({ rpe: r3 }); p.u01['5-0'] = entry({ rpe: r5 }); p.u01['6-0'] = entry({ rpe: r6 }); p.u02['2-0'] = entry({ rpe: r9 }); return p; };
  const [a] = advise(mk(5, 7, 8, 9), 10);
  assert.deepEqual({ level: a.level, title: a.title, rule: a.rule }, { level: 'warn', title: RPE_TITLE, rule: 'rpe' });
  assert.match(a.reason, /^De seneste 3 rolige pas i træk er logget med RPE 7, 8, 9\.$/);
  assert.ok(rules(advise(mk(7, 7, 7, 7), 10)).includes('rpe'), 'også 4 i træk');
  assert.equal(rules(advise(mk(7, 7, 7, 6), 10)).includes('rpe'), false, 'det seneste er under 7: rækken er brudt');
  assert.equal(rules(advise(mk(7, 7, 6, 7), 10)).includes('rpe'), false, 'kun 1 i træk (det midterste er 6)');
  assert.equal(rules(advise(mk(5, 6, 7, 7), 10)).includes('rpe'), false, 'kun 2 i træk');
  const missed = mk(7, 7, 7, 7); delete missed.u02['2-0'];
  assert.equal(rules(advise(missed, 10)).includes('rpe'), false, 'et sprunget roligt pas bryder rækken');
  const noRpe = mk(7, 7, 7, 7); noRpe.u02['2-0'] = entry();
  assert.equal(rules(advise(noRpe, 10)).includes('rpe'), false, 'et pas uden RPE bryder rækken');
  // dagens pas, der endnu ikke er logget, venter; er det logget med RPE ≥ 7, tæller det med
  const today = mk(5, 6, 7, 7); log(today, 10, 0, { rpe: 8 });
  assert.equal(advise(today, 10).find(a => a.rule === 'rpe').reason, 'De seneste 3 rolige pas i træk er logget med RPE 7, 7, 8.');
  // intervalpas (hovedsæt), test og styrke er ikke rolige pas og bryder ikke rækken
  const hardInBetween = mk(7, 7, 7, 7); hardInBetween.u02['1-0'] = entry({ rpe: 3 }); hardInBetween.u02['1-1'] = entry({ rpe: 3 }); // løbeintervaller + styrke (dag 8) med lav RPE
  assert.ok(rules(advise(hardInBetween, 10)).includes('rpe'));
  // et gammelt stykke: nyeste roligt pas er mere end 6 dage gammelt
  const sparse = [{ id: 'u01', n: 1, days: weeks[0].days }, { id: 'u02', n: 2, days: weeks[0].days.map(d => d.map(s => (isEasySession(s) ? { ...s, z: 'thr' } : s))) }, { id: 'u03', n: 3, days: weeks[0].days.map(d => d.map(s => (isEasySession(s) ? { ...s, z: 'thr' } : s))) }];
  const old = {}; for (const [d, si] of [[3, 0], [5, 0], [6, 0]]) log(old, d, si, { rpe: 8 });
  assert.ok(rules(adviceFor({ weeks: sparse, progress: old, todayIdx: 9 })).includes('rpe'), 'det nyeste (dag 6) er 3 dage gammelt');
  assert.ok(rules(adviceFor({ weeks: sparse, progress: old, todayIdx: 12 })).includes('rpe'), 'det nyeste (dag 6) er 6 dage gammelt: grænsen');
  assert.equal(rules(adviceFor({ weeks: sparse, progress: old, todayIdx: 13 })).includes('rpe'), false, 'det nyeste (dag 6) er 7 dage gammelt');
});

// ---- c. form (TSB) ----

test('c. faktisk TSB < −25 → warn, < −35 → stop; grænserne er skarpe', () => {
  const prog = logPlanned({}, 0, 10);
  for (const d of [0, 4, 7]) logX(prog, d, 20, 3); // ekstra på hviledagene: logs på 11 forskellige dage
  const run = tsb => adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, tsb), plannedPmc: tsbSeries(10, -9) }).filter(a => a.rule.startsWith('form'));
  for (const tsb of [0, -10, -24.99, -25]) assert.deepEqual(run(tsb), [], `TSB ${tsb}`);
  for (const tsb of [-25.01, -26, -30, -35]) {
    const [a] = run(tsb);
    assert.deepEqual({ level: a.level, title: a.title, rule: a.rule }, { level: 'warn', title: 'Høj træthed: gør dagens hårde pas roligt', rule: 'form-warn' }, `TSB ${tsb}`);
  }
  for (const tsb of [-35.01, -40, -80]) {
    const [a] = run(tsb);
    assert.deepEqual({ level: a.level, title: a.title, rule: a.rule }, { level: 'stop', title: 'Tag hviledag i dag', rule: 'form-stop' }, `TSB ${tsb}`);
  }
  assert.equal(run(-30).length, 1, 'aldrig både warn og stop');
  assert.match(run(-30)[0].reason, /^Form \(TSB\) er −30; planen regner med −9\. Grænserne er −25 og −35\.$/);
  assert.match(run(-40)[0].text, /hviledag/);
  // uden planlagt PMC udelades sammenligningen; en kort faktisk serie bruger sidste værdi; tom serie giver intet
  const noPlan = adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -30) }).find(a => a.rule === 'form-warn');
  assert.equal(noPlan.reason, 'Form (TSB) er −30. Grænserne er −25 og −35.');
  const short = adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(8, -30) }).find(a => a.rule === 'form-warn');
  assert.ok(short);
  assert.deepEqual(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: [] }).filter(a => a.rule.startsWith('form')), []);
  assert.deepEqual(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: [{ ctl: 1, atl: 2, tsb: NaN }] }).filter(a => a.rule.startsWith('form')), []);
});

test('c. kun med logs på mindst 10 forskellige dage ("ikke nok data"-vagten)', () => {
  const series = tsbSeries(14, -40);
  const run = prog => adviceFor({ weeks, progress: prog, todayIdx: 14, actualPmc: series }).filter(a => a.rule.startsWith('form'));
  // 9 dage med logs (ekstra, én pr. dag): intet
  const nine = {}; for (let d = 0; d < 9; d++) logX(nine, d, 30, 4);
  assert.deepEqual(run(nine), []);
  const ten = {}; for (let d = 0; d < 10; d++) logX(ten, d, 30, 4);
  assert.deepEqual(rules(run(ten)), ['form-stop']);
  // flere logs samme dag er stadig én dag
  const dup = {}; for (let d = 0; d < 9; d++) { logX(dup, d, 30, 4); logX(dup, d, 20, 4); }
  assert.deepEqual(run(dup), []);
  const dup10 = structuredClone(dup); logX(dup10, 12, 20, 4);
  assert.equal(run(dup10).length, 1);
  // pas og ekstra tæller begge som logs, og en ugennemført tombstone gør ikke
  const mixed = {}; for (let d = 0; d < 5; d++) logX(mixed, d, 30, 4);
  for (const [d, si] of [[8, 0], [9, 0], [10, 0], [12, 0], [13, 0]]) log(mixed, d, si);
  assert.equal(run(mixed).length, 1);
  const tomb = structuredClone(nine); tomb.u02['x-gone001'] = { deleted: true, updatedAt: T }; tomb.u02['3-0'] = { done: false, updatedAt: T };
  assert.deepEqual(run(tomb), []);
});

// ---- d. mere end planen ----

test('d. logget > planlagt × 1,2 de seneste 7 dage (i dag og de 6 før) → info; grænsen er skarp, og der kræves ≥ 120 planlagte minutter', () => {
  // i dag = torsdag dag 10: vinduet er dag 4–10: lør 120 + søn 60 + tir 40+30 + ons 30 + tor 30 = 310 planlagte minutter
  const base = () => logPlanned({}, 4, 10);
  const volume = prog => advise(prog, 10).find(a => a.rule === 'volume');
  assert.equal(volume(base()), undefined, 'logget = planlagt');
  const exact = logX(base(), 10, 62, 3);                  // 372 = 310 × 1,2 præcist
  assert.equal(volume(exact), undefined, 'præcis +20 % er ikke over grænsen');
  const over = logX(base(), 10, 63, 3);                   // 373
  const a = volume(over);
  assert.deepEqual({ level: a.level, title: a.title, rule: a.rule }, { level: 'info', title: 'Du træner mere end planen – hold de rolige pas rolige', rule: 'volume' });
  assert.equal(a.reason, 'Logget 6:13 t mod planlagt 5:10 t de seneste 7 dage (+20 %, grænsen er +20 %).');
  // et pas logget længere end planlagt tæller de skrevne minutter
  const longer = base(); longer.u01['5-0'] = entry({ min: 190 });  // 310 − 120 + 190 = 380 > 372
  assert.ok(volume(longer));
  const shorter = base(); shorter.u01['5-0'] = entry({ min: 10 });
  assert.equal(volume(logX(shorter, 10, 100, 3)), undefined, 'kortere pas trækker fra: 310 − 110 + 100 = 300');
  // ekstra uden for vinduet (dag 3) tæller ikke
  assert.equal(volume(logX(base(), 3, 500, 3)), undefined);
  // vinduet er 7 dage: ekstra på dag 4 (første dag) tæller, dag 3 ikke
  assert.ok(volume(logX(base(), 4, 70, 3)));
  // for lidt planlagt: uge 1 tirsdag–onsdag er 100 min (< 120), selv med mange ekstra minutter
  const early = logPlanned({}, 0, 2); logX(early, 2, 300, 3);
  assert.equal(adviceFor({ weeks, progress: early, todayIdx: 2 }).find(a => a.rule === 'volume'), undefined);
  const early3 = logPlanned({}, 0, 3); logX(early3, 3, 300, 3);                 // torsdag: 130 min planlagt
  assert.ok(advise(early3, 3).find(a => a.rule === 'volume'));
});

// ---- e. rolig dag efter ≥ 3 dage i træk ----

test('e. i dag er en rolig dag eller hviledag efter ≥ 3 loggede dage i træk → info', () => {
  const easy = (prog, todayIdx) => advise(prog, todayIdx, { limit: 99 }).find(a => a.rule === 'easy');
  // i dag = mandag dag 7 (hviledag); fre (dag 4, hvile, men der er logget en ekstra), lør og søn er loggede: 3 dage
  const prog = logPlanned({}, 5, 6); logX(prog, 4, 30, 3, 'swim');
  const a = easy(prog, 7);
  assert.deepEqual({ level: a.level, title: a.title, rule: a.rule }, { level: 'info', title: 'Hviledag i dag – brug den', rule: 'easy' });
  assert.equal(a.reason, 'Du har trænet 3 dage i træk uden hvile (Fre, Lør, Søn).');
  assert.match(a.text, /Hold hviledagen fri/);
  // kun 2 dage i træk: intet
  assert.equal(easy(logPlanned({}, 5, 6), 7), undefined);
  // et hul midt i rækken: intet
  const gap = logPlanned({}, 6, 6); logX(gap, 4, 30, 3); logX(gap, 3, 30, 3);
  assert.equal(easy(gap, 7), undefined, 'lørdag mangler');
  // 4 dage i træk: tallet følger med
  const four = logPlanned({}, 5, 6); logX(four, 4, 30, 3); logX(four, 3, 30, 3);
  assert.match(easy(four, 7).reason, /^Du har trænet 4 dage i træk uden hvile \(Tor, Fre, Lør, Søn\)\.$/);
  // en rolig dag (ikke hvile): i dag er onsdag dag 9 med en rolig svømning, og de 3 dage før (søn, man, tir) er loggede (mandag hviler, derfor en ekstra)
  const easyDay = logPlanned({}, 6, 8); logX(easyDay, 7, 30, 3);
  const b = easy(easyDay, 9);
  assert.deepEqual({ level: b.level, title: b.title, rule: b.rule }, { level: 'info', title: 'Rolig dag i dag – hold den rolig', rule: 'easy' });
  assert.match(b.text, /Dagens pas er roligt/);
  // i dag er ikke rolig (tirsdag med intervaller), eller er en lang tur (lørdag): intet
  assert.equal(easy(logPlanned({}, 4, 7), 8), undefined);
  assert.equal(easy(logPlanned({}, 2, 4), 5), undefined, 'lørdagens lange cykeltur er ikke en restitutionsdag');
  // også en dag med roligt pas + styrke er rolig, og en tom dag
  assert.ok(isEasyDay([REST]) && isEasyDay([]) && isEasyDay([S('str', 'Styrke', 30, 'str'), S('bike', 'Rolig tur', 40, 'easy')]));
  assert.ok(!isEasyDay([S('run', 'Løbeintervaller', 40, 'easy', { main: 'z4' })]) && !isEasyDay([S('run', 'Løbetest', 50, 'test')]) && !isEasyDay([S('race', 'Løb', 120, 'z4')]) && !isEasyDay([S('bike', 'Lang cykeltur', 120, 'z2')]));
});

test('klassificering: lange pas og rolige pas', () => {
  const long = ['Lang cykeltur', 'Langt løb', 'Rolig lang tur', 'lang tur'].map(t => isLongSession(S(t.includes('løb') ? 'run' : 'bike', t, 100)));
  assert.deepEqual(long, [true, true, true, true]);
  assert.ok(!isLongSession(S('swim', 'Lang svømmetur', 60)) && !isLongSession(S('bike', 'Rolig cykel', 60)) && !isLongSession(S('str', 'Langsom styrke', 60)) && !isLongSession(null));
  assert.ok(isEasySession(S('run', 'Roligt løb', 30, 'z2')) && isEasySession(S('swim', 'Svøm', 30, 'easy')));
  assert.ok(!isEasySession(S('run', 'Intervaller', 40, 'easy', { main: 'z4' })) && !isEasySession(S('bike', 'Tempo', 40, 'ss')) && !isEasySession(S('rest', 'Hvile', 0, 'rest')) && !isEasySession(S('race', 'Løb', 60, 'z2')) && !isEasySession(S('str', 'Styrke', 30, 'str')));
});

// ---- Rækkefølge, grænse og afviste råd ----

test('alvorligste først, højst 2, og ved lige alvor: form, rpe, missed, volume, easy', () => {
  // i dag = torsdag dag 10 med: sprunget (info), RPE-træthed (warn), TSB −40 (stop), og for meget volumen (info)
  const prog = logPlanned({}, 3, 9, ['3-0', '5-0', '6-0']);                  // 3 sprunget
  prog.u02['1-0'] = entry({ rpe: 9 }); prog.u02['2-0'] = entry({ rpe: 9 });  // to RPE ≥ 9
  logX(prog, 10, 240, 5);                                                      // volumen
  for (let d = 0; d < 7; d++) logX(prog, d, 20, 3);                            // nok dage med logs (10 forskellige) til vagten
  const all = adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40), limit: 99 });
  assert.deepEqual(rules(all), ['form-stop', 'rpe', 'missed', 'volume']);
  assert.deepEqual(all.map(a => a.level), ['stop', 'warn', 'info', 'info']);
  const two = adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40) });
  assert.deepEqual(rules(two), ['form-stop', 'rpe'], 'højst 2 som standard');
  assert.deepEqual(rules(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40), limit: 1 })), ['form-stop']);
  assert.deepEqual(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40), limit: 0 }), []);
  // en afvist regel fylder ikke: den næste kommer med
  assert.deepEqual(rules(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40), dismissed: ['form-stop'] })), ['rpe', 'missed']);
  assert.deepEqual(rules(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40), dismissed: ['form-stop', 'rpe', 'missed'] })), ['volume']);
  assert.deepEqual(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40), dismissed: ['form-stop', 'rpe', 'missed', 'volume'] }), []);
  // warn-niveauet af formen har sit eget id, så en afvist warn ikke skjuler et stop senere samme dag
  assert.deepEqual(rules(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -30), dismissed: ['form-stop'], limit: 1 })), ['form-warn']);
  assert.deepEqual(rules(adviceFor({ weeks, progress: prog, todayIdx: 10, actualPmc: tsbSeries(10, -40), dismissed: ['form-warn'], limit: 1 })), ['form-stop']);
  // en warn slår en info, uanset reglens placering
  const onlyInfoWarn = adviceFor({ weeks, progress: prog, todayIdx: 10, limit: 99 });
  assert.deepEqual(rules(onlyInfoWarn), ['rpe', 'missed', 'volume']);
});

test('ingen råd uden for planen og ved ugyldige argumenter; ingen undtagelser', () => {
  const prog = logPlanned({}, 0, 20);
  for (const todayIdx of [-1, -30, 21, 99, 1.5, NaN, null, undefined, '5']) assert.deepEqual(adviceFor({ weeks, progress: prog, todayIdx }), [], String(todayIdx));
  assert.deepEqual(adviceFor({ weeks: [], progress: prog, todayIdx: 0 }), []);
  assert.deepEqual(adviceFor({ weeks: null, progress: prog, todayIdx: 0 }), []);
  assert.deepEqual(adviceFor(), []);
  assert.deepEqual(adviceFor({}), []);
  assert.doesNotThrow(() => adviceFor({ weeks, progress: { u01: null, u02: 5, junk: { 'x-abc': null } }, todayIdx: 10, actualPmc: null, plannedPmc: undefined }));
});

test('rent: rører aldrig planen eller fremdriften, og giver nye objekter hver gang', () => {
  const frozenWeeks = structuredClone(weeks);
  const prog = logPlanned({}, 3, 9, ['3-0', '5-0', '6-0']); logX(prog, 10, 99, 9);
  const progCopy = structuredClone(prog), pmcA = tsbSeries(10, -40);
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  deepFreeze(frozenWeeks); deepFreeze(prog); deepFreeze(pmcA);
  const a = adviceFor({ weeks: frozenWeeks, progress: prog, todayIdx: 10, actualPmc: pmcA });
  const b = adviceFor({ weeks: frozenWeeks, progress: prog, todayIdx: 10, actualPmc: pmcA });
  assert.deepEqual(a, b);
  assert.notEqual(a[0], b[0]);
  assert.deepEqual(prog, progCopy);
  assert.deepEqual(frozenWeeks, weeks, 'planen er uændret');
});

test('rygtest med den rigtige plan: for hver dag og tilfældige logs er resultatet ≤ 2 gyldige råd', () => {
  const real = plan(), planned = pmc(plannedDailyTss(real));
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ids = new Set(['missed', 'rpe', 'form-warn', 'form-stop', 'volume', 'easy']);
  const seen = new Set();
  for (let round = 0; round < 6; round++) {
    const prog = {};
    real.forEach((w, wi) => w.days.forEach((d, di) => d.forEach((s, si) => {
      if (s.s === 'rest' || rnd() < 0.3) return;
      (prog[w.id] ??= {})[`${di}-${si}`] = entry({ ...(rnd() < 0.5 ? { min: Math.round(s.m * (0.5 + rnd() * 1.5)) } : {}), ...(rnd() < 0.7 ? { rpe: 1 + Math.floor(rnd() * 10) } : {}) });
      if (rnd() < 0.05) (prog[w.id] ??= {})[`x-r${wi}${di}${si}`] = { day: di, sport: 'run', min: 20 + Math.floor(rnd() * 90), source: 'manual', updatedAt: T };
    })));
    for (let d = 0; d < real.length * 7; d += 3) {
      const daily = []; // en grov faktisk PMC fra de planlagte TSS (formen er ikke i fokus her)
      for (let i = 0; i <= d; i++) daily.push(planned[i].ctl + (round % 2 ? 40 : 0));
      const act = pmc(daily.map(v => v * (round % 3 === 0 ? 2.5 : 1)));
      const list = adviceFor({ weeks: real, progress: prog, todayIdx: d, actualPmc: act, plannedPmc: planned });
      assert.ok(list.length <= 2);
      for (const a of list) { assert.ok(ids.has(a.rule) && a.level in ADVICE_LEVELS); seen.add(a.rule); }
      for (let i = 1; i < list.length; i++) assert.ok(ADVICE_LEVELS[list[i - 1].level] >= ADVICE_LEVELS[list[i].level], 'alvorligste først');
    }
  }
  assert.ok(seen.size >= 4, `flere forskellige regler udløses: ${[...seen]}`);
});

// ---- Kortene på I dag ----

const KEY = 'im2027-progress-v2';
const SAT = '2026-11-07T10:00:00'; // dag 12 (lørdag i uge 2)
const closestOf = (sel, data = {}) => ({ target: { closest: s => (s === sel ? { dataset: data } : null) } });
const dismiss = (app, rule) => app.$('advice').dispatch('click', closestOf('[data-adv-dismiss]', { advDismiss: rule }));
const seededWith = (weeksObj, extra = {}) => memoryStorage({ [KEY]: JSON.stringify({ v: 2, weeks: weeksObj }), ...extra });
const articles = app => (app.$('advice').innerHTML.match(/<article class="adv /g) || []).length;

test('paintToday tegner rådene som kort i #advice: niveau, tommelfingerregel, titel, tekst, tallene bag og en knap til at skjule', () => {
  // ét eneste log (lørdagens brick); uge 1 og 2 står ellers ulogget: sprunget over
  const app = loadApp({ now: SAT, storage: seededWith({ u01: { '5-1': entry({ min: 12 }) } }) });
  const html = app.$('advice').innerHTML;
  assert.match(html, /^<h2 class="adv-head">Råd til i dag<\/h2><article class="adv adv-info" data-advice="missed">/);
  assert.match(html, /<span class="adv-tag"><b>Info<\/b> · Tommelfingerregel<\/span>/);
  assert.match(html, /<button type="button" class="adv-x" data-adv-dismiss="missed" aria-label="Skjul rådet for i dag">Skjul i dag<\/button>/);
  assert.match(html, /<h3 class="adv-title">Fortsæt planen – indhent ikke<\/h3><p class="adv-text">/);
  assert.match(html, /<p class="adv-why">\d+ af \d+ planlagte pas de seneste 7 dage er ikke logget \(/);
  assert.match(html, /<p class="adv-note">Tommelfingerregler ud fra dine logs, ikke individuel rådgivning\. Planen ændrer sig ikke\.<\/p>$/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script/i, 'ingen indbyggede hændelser (CSP)');
  assert.equal(articles(app), 1);
  // planen er den samme: dagens kort og kalenderen ændrer sig ikke af rådet
  assert.match(app.$('todaySessions').innerHTML, /<h3 class="tc-title">Lang cykeltur<\/h3>/);
});

test('uden logs, før planstart og efter løbet er #advice tom', () => {
  assert.equal(loadApp({ now: SAT }).$('advice').innerHTML, '');
  assert.equal(loadApp({ now: '2026-10-20T10:00:00', storage: seededWith({ u01: { '5-1': entry() } }) }).$('advice').innerHTML, '');
  assert.equal(loadApp({ now: '2027-09-01T10:00:00', storage: seededWith({ u01: { '5-1': entry() } }) }).$('advice').innerHTML, '');
});

test('rådene følger loggen: et nyt log ændrer kortene med det samme (store.subscribe → refresh)', () => {
  const app = loadApp({ now: SAT, storage: seededWith({ u01: { '5-1': entry() } }) });
  assert.match(app.$('advice').innerHTML, /data-advice="missed"/);
  // log alle planlagte pas i de seneste 7 dage via en anden fane: sprunget-reglen forsvinder
  const done = {};
  for (const [wk, keys] of [['u01', ['5-0', '5-1', '6-0']], ['u02', ['1-0', '1-1', '2-0', '2-1', '3-0', '4-0']]]) { done[wk] = {}; for (const k of keys) done[wk][k] = entry(); }
  app.storage.setItem(KEY, JSON.stringify({ v: 2, weeks: done }));
  app.win.fire('storage', { key: null });
  assert.equal(app.$('advice').innerHTML, '');
});

test('skjul for i dag: gemmes pr. dato i localStorage, overlever en genindlæsning, og kortet kommer igen en anden dag', () => {
  const storage = seededWith({ u01: { '5-1': entry() } });
  const app = loadApp({ now: SAT, storage });
  assert.equal(articles(app), 1);
  dismiss(app, 'missed');
  assert.equal(app.$('advice').innerHTML, '', 'kortet er væk, og overskriften med');
  assert.deepEqual(JSON.parse(storage.getItem('im2027-advice-dismissed-2026-11-07')), ['missed']);
  // genindlæs siden (ny app på samme lager): stadig skjult
  const again = loadApp({ now: SAT, storage });
  assert.equal(again.$('advice').innerHTML, '');
  // en anden dag: kortet kommer igen (nøglen er pr. dato)
  again.clock.set('2026-11-08T07:30:00');
  again.doc.fire('visibilitychange');
  assert.equal(articles(again), 1);
  assert.match(again.$('advice').innerHTML, /data-advice="missed"/);
  // ødelagt værdi i lageret: ingen undtagelse, kortet vises
  const bad = loadApp({ now: SAT, storage: seededWith({ u01: { '5-1': entry() } }, { 'im2027-advice-dismissed-2026-11-07': '{ikke json' }) });
  assert.equal(articles(bad), 1);
  const wrong = loadApp({ now: SAT, storage: seededWith({ u01: { '5-1': entry() } }, { 'im2027-advice-dismissed-2026-11-07': JSON.stringify([5, null, 'missed']) }) });
  assert.equal(wrong.$('advice').innerHTML, '', 'ikke-tekster ignoreres, men "missed" er skjult');
});

test('skjul virker også når localStorage er blokeret (try/catch): kortet er skjult resten af sessionen', () => {
  const inner = seededWith({ u01: { '5-1': entry() } });
  const blocked = { getItem: k => { if (k.startsWith('im2027-advice')) throw new Error('blokeret'); return inner.getItem(k); }, setItem: (k, v) => { if (k.startsWith('im2027-advice')) throw new Error('fuld'); inner.setItem(k, v); }, removeItem: k => inner.removeItem(k), keys: () => inner.keys() };
  const app = loadApp({ now: SAT, storage: blocked });
  assert.equal(articles(app), 1);
  assert.doesNotThrow(() => dismiss(app, 'missed'));
  assert.equal(app.$('advice').innerHTML, '');
  // et nyt log udløser en gentegning, og kortet er stadig skjult
  app.doc.fire('click', { target: { closest: sel => (sel === '[data-chk]' ? { dataset: { chk: 'u02-5-0' } } : null) } });
  assert.equal(app.$('advice').innerHTML, '');
});

test('gamle dages skjul-nøgler ryddes op, når et nyt kort skjules (hvor lageret kan opregnes)', () => {
  const m = new Map(Object.entries({ [KEY]: JSON.stringify({ v: 2, weeks: { u01: { '5-1': entry() } } }), 'im2027-advice-dismissed-2026-11-01': '["rpe"]', 'im2027-weight-kg': '70' }));
  const storage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, get length() { return m.size; }, key: i => [...m.keys()][i] ?? null };
  const app = loadApp({ now: SAT, storage });
  dismiss(app, 'missed');
  assert.deepEqual([...m.keys()].filter(k => k.startsWith('im2027-advice')), ['im2027-advice-dismissed-2026-11-07']);
  assert.equal(m.get('im2027-weight-kg'), '70', 'andre nøgler røres ikke');
});

test('højst 2 kort, alvorligste først, og når det ene skjules, rykker det næste op', () => {
  // lørdag (dag 12): sprunget (info), to RPE ≥ 9 (warn) og for meget volumen (info)
  const wk1 = {}, wk2 = {};
  wk1['5-1'] = entry({ rpe: 9 });                                // lørdag i uge 1 (dag 5)... uden for 4-dagesvinduet
  wk2['4-0'] = entry({ rpe: 9, min: 40 });                       // fredag dag 11
  wk2['5-0'] = entry({ rpe: 10, min: 60 });                      // i dag, lørdag dag 12
  wk2['x-big0001'] = { day: 5, sport: 'bike', min: 300, rpe: 6, source: 'manual', updatedAt: T };
  const app = loadApp({ now: SAT, storage: seededWith({ u01: wk1, u02: wk2 }) });
  assert.equal(articles(app), 2, 'tre regler udløses, men der vises højst 2');
  const order = [...app.$('advice').innerHTML.matchAll(/data-advice="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['rpe', 'missed'], 'warn før info');
  assert.match(app.$('advice').innerHTML, /<article class="adv adv-warn" data-advice="rpe">.*Gør dagens intervaller rolige \(Z2\) eller tag en ekstra hviledag/);
  dismiss(app, 'rpe');
  assert.deepEqual([...app.$('advice').innerHTML.matchAll(/data-advice="([^"]+)"/g)].map(m => m[1]), ['missed', 'volume'], 'det næste råd tager pladsen');
});

test('en stop-regel (TSB < −35) tegnes som stop-kort med sin forklaring i Artifact-bygningen', () => {
  // ti dage med stort logget belastning giver en meget negativ form: 10 dage med 240-minutters ekstra på dag 2–11, i dag = lørdag (dag 12)
  const wk1 = {}, wk2 = {};
  for (let d = 2; d <= 11; d++) (d < 7 ? wk1 : wk2)[`x-load${String(d).padStart(3, '0')}`] = { day: d % 7, sport: 'bike', min: 240, rpe: 9, source: 'manual', updatedAt: T };
  const app = loadApp({ target: 'artifact', now: SAT, storage: seededWith({ u01: wk1, u02: wk2 }) });
  const first = app.$('advice').innerHTML;
  assert.match(first, /<article class="adv adv-stop" data-advice="form-stop"><div class="adv-top"><span class="adv-tag"><b>Stop<\/b> · Tommelfingerregel<\/span>/);
  assert.match(first, /<h3 class="adv-title">Tag hviledag i dag<\/h3>/);
  assert.match(first, /<p class="adv-why">Form \(TSB\) er −\d+; planen regner med [−+]?\d+\. Grænserne er −25 og −35\.<\/p>/);
  assert.ok(articles(app) <= 2);
  assert.ok(!first.includes('adv-warn') || first.indexOf('adv-stop') < first.indexOf('adv-warn'), 'stop står først');
});
