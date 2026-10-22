// Ren matchning af Strava-aktiviteter mod planen (scripts/lib/strava.mjs, docs/strava.md §4). Ingen netværk, kun syntetiske data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan, addDays, isoDate } from '../src/plan.js';
import { mergeEntry, mergeWeek, normalizeEntry, parseWeekFile, serializeWeek } from '../src/progress.js';
import { cphDate, matchActivities, pickActivity, sessionGroup, shiftDate, sportGroup } from '../scripts/lib/strava.mjs';

const weeks = plan();
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/strava/${name}`, import.meta.url), 'utf8'));
const DECOYS = ['HEMMELIG', 'POLYLINE', '55.6761', '12.5683', '99887766', 'b99887766'];
const dateOf = (weekId, di) => { const w = weeks.find(x => x.id === weekId); return isoDate(addDays(w.start, di)); };
const keyOf = (weekId, title) => { // pas-nøgle ud fra titel, så testen ikke afhænger af rækkefølgen i planen
  const w = weeks.find(x => x.id === weekId);
  for (let di = 0; di < 7; di++) for (let si = 0; si < w.days[di].length; si++) if (w.days[di][si].t === title) return `${di}-${si}`;
  throw new Error(`pas findes ikke: ${weekId} ${title}`);
};

// Rå aktivitet i Stravas form, med lokkefugle der aldrig må overleve hvidlisten.
const raw = ({ id, type = 'Run', start, elapsed, moving = elapsed, dist, hr }) => ({
  id, sport_type: type, type, start_date: start, start_date_local: start.replace('Z', ''), elapsed_time: elapsed, moving_time: moving,
  ...(dist !== undefined ? { distance: dist } : {}), has_heartrate: hr !== undefined, ...(hr !== undefined ? { average_heartrate: hr } : {}),
  name: 'HEMMELIG-AKTIVITET', description: 'HEMMELIG-BESKRIVELSE', athlete: { id: 99887766 }, map: { summary_polyline: 'POLYLINE-XYZ' },
  start_latlng: [55.6761, 12.5683], end_latlng: [55.6801, 12.5701], location_city: 'HEMMELIG-BY', gear_id: 'b99887766', device_name: 'HEMMELIG-ENHED',
});
const picked = list => list.map(pickActivity).filter(Boolean);
const run = (activities, over = {}) => matchActivities({ weeks, progress: {}, activities: picked(activities), ledger: {}, today: '2026-11-08', lookbackDays: 7, ...over });
const flat = writes => Object.fromEntries(Object.entries(writes).flatMap(([w, wk]) => Object.entries(wk).map(([k, e]) => [`${w}.${k}`, e])));
// Anvend skrivninger på fjernstatus, som CI'ens PATCH ville.
const apply = (progress, writes) => { const out = { ...progress }; for (const [w, wk] of Object.entries(writes)) out[w] = mergeWeek(out[w] ?? {}, wk); return out; };

// Egen ugeplan til tests af flere pas i samme gruppe samme dag (mandag 2026-11-02).
const sess = (s, t, m, d = '') => ({ s, t, m, d });
const custom = days => [{ id: 'u02', start: new Date(2026, 10, 2), days: [days, [], [], [], [], [], []] }];

// ---- Sportsgrupper, minutter og hvidliste ----

test('sportGroup og sessionGroup: tabellerne fra §4.2, og alle fire løbspas i planen klassificeres', () => {
  const expected = { Swim: 'swim', Ride: 'bike', VirtualRide: 'bike', GravelRide: 'bike', MountainBikeRide: 'bike', Run: 'run', TrailRun: 'run', VirtualRun: 'run', WeightTraining: 'str', Crossfit: 'str', Workout: 'str' };
  for (const [t, g] of Object.entries(expected)) assert.equal(sportGroup(t), g, t);
  for (const t of ['EBikeRide', 'Walk', 'Hike', 'Yoga', 'Rowing', 'AlpineSki', 'toString', '__proto__', '', undefined, null, 7]) assert.equal(sportGroup(t), null, String(t));

  assert.equal(sessionGroup({ s: 'swim', t: 'x', d: '', m: 30 }), 'swim');
  assert.equal(sessionGroup({ s: 'str', t: 'x', d: '', m: 30 }), 'str');
  assert.equal(sessionGroup({ s: 'rest', t: 'Hviledag', d: '', m: 0 }), null);
  assert.equal(sessionGroup({ s: 'run', t: 'x', d: '', m: 0 }), null, 'm === 0 matches aldrig');

  const races = weeks.flatMap(w => w.days.flat()).filter(s => s.s === 'race');
  assert.deepEqual(races.map(s => [s.t, sessionGroup(s)]), [['10 km-løb', 'run'], ['Halvmaraton', 'run'], ['Køge Jernmand', 'tri'], ['IRONMAN', 'tri']]);
  for (const s of weeks.flatMap(w => w.days.flat()).filter(x => x.s === 'rest')) assert.equal(sessionGroup(s), null);
});

test('pickActivity: svømning og styrke bruger elapsed_time, øvrige moving_time; afrunding og klemning', () => {
  assert.equal(pickActivity(raw({ id: 1, type: 'Swim', start: '2026-11-04T16:10:00Z', elapsed: 2400, moving: 2100 })).min, 40);
  assert.equal(pickActivity(raw({ id: 2, type: 'WeightTraining', start: '2026-11-03T16:00:00Z', elapsed: 2400, moving: 2300 })).min, 40);
  assert.equal(pickActivity(raw({ id: 3, type: 'Run', start: '2026-11-03T16:00:00Z', elapsed: 700, moving: 600 })).min, 10);
  assert.equal(pickActivity(raw({ id: 4, type: 'Ride', start: '2026-11-03T16:00:00Z', elapsed: 9000, moving: 5430 })).min, 91);
  assert.equal(pickActivity(raw({ id: 5, type: 'Ride', start: '2026-11-03T16:00:00Z', elapsed: 99999, moving: 99999 })).min, 900, 'klemmes til 900');
  assert.equal(pickActivity(raw({ id: 6, type: 'Run', start: '2026-11-03T16:00:00Z', elapsed: 700 })).min, 12, 'moving_time default = elapsed i testhjælperen');
  const noMoving = { ...raw({ id: 7, type: 'Run', start: '2026-11-03T16:00:00Z', elapsed: 1800 }) }; delete noMoving.moving_time;
  assert.equal(pickActivity(noMoving).min, 30, 'mangler moving_time, bruges elapsed_time');
});

test('pickActivity: dist kun for svøm/cykel/løb og > 0; hr kun med has_heartrate og 30..250; id, dato og tid valideres', () => {
  assert.equal(pickActivity(raw({ id: 1, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 600, dist: 2100.4 })).dist, 2100);
  assert.ok(!('dist' in pickActivity(raw({ id: 2, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 600, dist: 0 }))));
  assert.ok(!('dist' in pickActivity(raw({ id: 3, type: 'WeightTraining', start: '2026-11-07T10:05:00Z', elapsed: 600, dist: 500 }))));
  assert.ok(!('dist' in pickActivity(raw({ id: 4, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 600 }))));
  assert.equal(pickActivity(raw({ id: 5, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 600, dist: 5e9 })).dist, 1_000_000, 'klemmes');
  assert.equal(pickActivity(raw({ id: 6, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 600, hr: 141.6 })).hr, 142);
  assert.equal(pickActivity(raw({ id: 7, type: 'WeightTraining', start: '2026-11-07T10:05:00Z', elapsed: 600, hr: 100 })).hr, 100);
  for (const bad of [29.4, 250.6, 0]) assert.ok(!('hr' in pickActivity(raw({ id: 8, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 600, hr: bad }))), `hr ${bad}`);
  const noFlag = { ...raw({ id: 9, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 600, hr: 140 }), has_heartrate: false };
  assert.ok(!('hr' in pickActivity(noFlag)));

  for (const bad of [undefined, null, 'x', '12ab', '', -1, 1.5, 1e21, '1'.repeat(21), {}, []]) assert.equal(pickActivity(raw({ id: bad, start: '2026-11-07T10:05:00Z', elapsed: 600 })), null, `id ${String(bad)}`);
  assert.equal(pickActivity({ ...raw({ id: 1, start: '2026-11-07T10:05:00Z', elapsed: 600 }), start_date: 'ikke en dato' }), null);
  assert.equal(pickActivity({ ...raw({ id: 1, start: '2026-11-07T10:05:00Z', elapsed: 600 }), elapsed_time: 'meget' }), null);
  assert.equal(pickActivity(null), null);
  assert.equal(pickActivity('x'), null);
  assert.equal(pickActivity(raw({ id: '12345678901', start: '2026-11-07T10:05:00Z', elapsed: 600 })).id, '12345678901');
});

test('pickActivity: kun hvidlistede felter overlever; ingen lokkefugle, ingen koordinater, ingen navne', () => {
  for (const a of fixture('activities-week2.json')) {
    const p = pickActivity(a);
    assert.ok(p, String(a.id));
    assert.ok(Object.keys(p).every(k => ['id', 'group', 'startMs', 'endMs', 'date', 'min', 'elapsedSec', 'dist', 'hr'].includes(k)), Object.keys(p).join());
    const text = JSON.stringify(p);
    for (const d of DECOYS) assert.ok(!text.includes(d), d);
  }
  assert.deepEqual(pickActivity(raw({ id: 11111111101, type: 'VirtualRide', start: '2026-11-06T11:30:00Z', elapsed: 3720, moving: 3600, dist: 31500.2, hr: 141.6 })), {
    id: '11111111101', group: 'bike', startMs: Date.parse('2026-11-06T11:30:00Z'), endMs: Date.parse('2026-11-06T12:32:00Z'), date: '2026-11-06', min: 60, elapsedSec: 3720, dist: 31500, hr: 142,
  });
  assert.equal(pickActivity(raw({ id: 1, type: 'EBikeRide', start: '2026-11-06T11:30:00Z', elapsed: 3000 })).group, null, 'ukendt sport beholdes som ekstra');
});

// ---- Datoer ----

test('dato: dansk kalenderdag uafhængigt af processens tidszone, også omkring sommertid', () => {
  assert.equal(cphDate(Date.parse('2026-11-24T23:30:00Z')), '2026-11-25', '23:30 UTC er efter midnat i København');
  assert.equal(cphDate(Date.parse('2026-11-24T22:59:59Z')), '2026-11-24');
  assert.equal(cphDate(Date.parse('2026-11-24T23:00:00Z')), '2026-11-25');
  // 2027-03-28: sommertid starter (CET → CEST kl. 01:00 UTC)
  assert.equal(cphDate(Date.parse('2027-03-27T22:59:00Z')), '2027-03-27');
  assert.equal(cphDate(Date.parse('2027-03-27T23:00:00Z')), '2027-03-28');
  assert.equal(cphDate(Date.parse('2027-03-28T21:59:00Z')), '2027-03-28', 'CEST: 21:59 UTC = 23:59 lokalt');
  assert.equal(cphDate(Date.parse('2027-03-28T22:00:00Z')), '2027-03-29');
  // 2026-10-25: sommertid slutter (CEST → CET kl. 01:00 UTC)
  assert.equal(cphDate(Date.parse('2026-10-24T22:00:00Z')), '2026-10-25');
  assert.equal(cphDate(Date.parse('2026-10-25T22:59:00Z')), '2026-10-25', 'CET: 22:59 UTC = 23:59 lokalt');
  assert.equal(cphDate(Date.parse('2026-10-25T23:00:00Z')), '2026-10-26');
  assert.equal(cphDate(new Date('2026-11-24T23:30:00Z')), '2026-11-25');
  assert.throws(() => cphDate(NaN), TypeError);
  assert.equal(shiftDate('2026-11-08', -7), '2026-11-01');
  assert.equal(shiftDate('2027-03-01', 30), '2027-03-31');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('dato: en aktivitet sent om aftenen (UTC) lander på den danske dag, og pas matches på den dag', () => {
  const a = raw({ id: 21, type: 'Swim', start: '2026-11-24T23:30:00Z', elapsed: 2100 }); // onsdag 25. nov. kl. 00:30 dansk tid
  assert.equal(pickActivity(a).date, '2026-11-25');
  const r = run([a], { today: '2026-11-25', lookbackDays: 1 });
  assert.deepEqual(Object.keys(flat(r.writes)), [`u05.${keyOf('u05', 'Rolig svømning')}`]);
  assert.equal(r.ledger['21'].d, '2026-11-25');
  const tue = run([a], { today: '2026-11-24', lookbackDays: 1 });
  assert.deepEqual(tue.writes, {}, 'tirsdag har ingen svømning, og aktiviteten ligger først på onsdag');
});

test('vindue og plan: uden for [i dag − L, i dag], før planstart og efter løbet ignoreres', () => {
  const before = raw({ id: 31, type: 'Run', start: '2026-10-25T10:00:00Z', elapsed: 2700 });   // søndag før START
  const r1 = run([before], { today: '2026-10-26', lookbackDays: 3 });
  assert.deepEqual(r1.writes, {});
  assert.deepEqual(r1.stats, { window: 1, matched: 0, healed: 0, occupied: 0, extras: 1, known: 0 });

  const old = raw({ id: 32, type: 'Run', start: '2026-11-03T16:00:00Z', elapsed: 2400 });      // tirsdag, uden for tre dages vindue
  const inside = raw({ id: 33, type: 'Run', start: '2026-11-05T16:00:00Z', elapsed: 1500 });   // torsdag
  const r2 = run([old, inside], { today: '2026-11-08', lookbackDays: 3 });
  assert.deepEqual(Object.keys(flat(r2.writes)), [`u02.${keyOf('u02', 'Roligt løb')}`]);
  assert.equal(r2.stats.window, 1, 'kun aktiviteter i vinduet tælles');
  const r3 = run([old, inside], { today: '2026-11-08', lookbackDays: 7 });
  assert.equal(Object.keys(flat(r3.writes)).length, 2);

  const after = raw({ id: 34, type: 'Run', start: '2027-08-23T10:00:00Z', elapsed: 2700 });    // dagen efter IRONMAN
  assert.deepEqual(run([after], { today: '2027-08-24', lookbackDays: 3 }).writes, {});
  const future = raw({ id: 35, type: 'Run', start: '2026-11-09T10:00:00Z', elapsed: 2700 });
  assert.deepEqual(run([future], { today: '2026-11-08', lookbackDays: 3 }).writes, {}, 'ikke i morgen');
});

// ---- Pas: form og indhold ----

test('pas fra Strava: nøjagtige felter, updatedAt = aktivitetens slut, dev strava, sig; fast punkt og stabil serialisering', () => {
  const r = run([raw({ id: 11111111101, type: 'VirtualRide', start: '2026-11-06T11:30:00Z', elapsed: 3720, moving: 3600, dist: 31500.2, hr: 141.6 })]);
  const key = keyOf('u02', 'Cykel med intervaller');
  assert.equal(key, '4-0');
  assert.deepEqual(r.writes, { u02: { [key]: {
    done: true, updatedAt: '2026-11-06T12:32:00.000Z', dev: 'strava', at: '2026-11-06T11:30:00.000Z', min: 60,
    src: 'strava', extId: '11111111101', sig: 'bike:Cykel med intervaller', dist: 31500, hr: 142,
  } } });
  const e = r.writes.u02[key];
  assert.deepEqual(normalizeEntry(e), e, 'fast punkt af normalizeEntry');
  const file = serializeWeek('u02', r.writes.u02);
  assert.deepEqual(parseWeekFile('u02.json', file).week, r.writes.u02);
  assert.equal(serializeWeek('u02', parseWeekFile('u02.json', file).week), file);
  assert.deepEqual(r.ledger, { 11111111101: { d: '2026-11-06', w: 'u02', k: key } });
  assert.deepEqual(r.stats, { window: 1, matched: 1, healed: 0, occupied: 0, extras: 0, known: 0 });
  for (const d of DECOYS) assert.ok(!(file + JSON.stringify(r.ledger)).includes(d), d);
});

test('pas fra Strava: uden afstand og puls udelades felterne; svømning med elapsed_time', () => {
  const r = run([raw({ id: 41, type: 'Swim', start: '2026-11-04T16:10:00Z', elapsed: 2400, moving: 2100 })]);
  const e = r.writes.u02[keyOf('u02', 'Lang svømmetur')];
  assert.equal(e.min, 40);
  assert.ok(!('dist' in e) && !('hr' in e));
  assert.equal(e.updatedAt, '2026-11-04T16:50:00.000Z');
});

test('uge 2 fra fixturen: fredag VirtualRide, lørdag brick (cykel + løb), tirsdag styrke, onsdag svøm; gåtur er ekstra', () => {
  const r = matchActivities({ weeks, progress: {}, activities: picked(fixture('activities-week2.json')), ledger: {}, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(Object.keys(flat(r.writes)).sort(), ['u01.6-0', 'u02.1-1', 'u02.2-0', 'u02.4-0', 'u02.5-0', 'u02.5-1']);
  assert.equal(r.writes.u02['4-0'].sig, 'bike:Cykel med intervaller');
  assert.equal(r.writes.u02['5-0'].sig, 'bike:Lang cykeltur');
  assert.equal(r.writes.u02['5-1'].sig, 'run:Brick-løb');
  assert.equal(r.writes.u02['1-1'].sig, 'str:Styrke');
  assert.ok(!('dist' in r.writes.u02['1-1']));
  assert.equal(r.writes.u02['1-1'].hr, 104);
  assert.deepEqual(r.stats, { window: 7, matched: 6, healed: 0, occupied: 0, extras: 1, known: 0 });
});

// ---- Matchning ----

test('brick-lørdag: cykel og løb er forskellige grupper, så begge pas får deres aktivitet', () => {
  const r = run([
    raw({ id: 51, type: 'Ride', start: '2026-11-07T08:00:00Z', elapsed: 5700, moving: 5400 }),
    raw({ id: 52, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 640, moving: 600 }),
  ]);
  assert.deepEqual(Object.keys(flat(r.writes)).sort(), ['u02.5-0', 'u02.5-1']);
  assert.equal(r.writes.u02['5-0'].extId, '51');
  assert.equal(r.writes.u02['5-1'].extId, '52');
});

test('to pas i samme gruppe: Σ|Δmin| afgør parringen, og ved uafgjort er den kronologisk', () => {
  const W = custom([sess('run', 'A', 30), sess('run', 'B', 60)]);
  const base = { weeks: W, progress: {}, ledger: {}, today: '2026-11-02', lookbackDays: 1 };
  // første aktivitet 58 min, anden 32 min: kronologisk ville give 28 + 28 = 56; krydset giver 2 + 2 = 4
  const crossed = matchActivities({ ...base, activities: picked([
    raw({ id: 61, start: '2026-11-02T06:00:00Z', elapsed: 58 * 60 }), raw({ id: 62, start: '2026-11-02T16:00:00Z', elapsed: 32 * 60 }),
  ]) });
  assert.equal(crossed.writes.u02['0-0'].extId, '62', 'A (30 min) får aktiviteten på 32 min');
  assert.equal(crossed.writes.u02['0-1'].extId, '61', 'B (60 min) får aktiviteten på 58 min');

  // to pas på 45: begge parringer koster det samme, så den første aktivitet går til det første pas
  const tie = matchActivities({ ...base, weeks: custom([sess('run', 'A', 45), sess('run', 'B', 45)]), activities: picked([
    raw({ id: 63, start: '2026-11-02T06:00:00Z', elapsed: 40 * 60 }), raw({ id: 64, start: '2026-11-02T16:00:00Z', elapsed: 50 * 60 }),
  ]) });
  assert.equal(tie.writes.u02['0-0'].extId, '63');
  assert.equal(tie.writes.u02['0-1'].extId, '64');

  // en aktivitet og to pas: den bedst passende vælges; ved lighed det første pas
  const one = matchActivities({ ...base, activities: picked([raw({ id: 65, start: '2026-11-02T06:00:00Z', elapsed: 55 * 60 })]) });
  assert.deepEqual(Object.keys(one.writes.u02), ['0-1']);
  const equal = matchActivities({ ...base, weeks: custom([sess('run', 'A', 45), sess('run', 'B', 45)]), activities: picked([raw({ id: 66, start: '2026-11-02T06:00:00Z', elapsed: 45 * 60 })]) });
  assert.deepEqual(Object.keys(equal.writes.u02), ['0-0']);

  // to aktiviteter og et pas: den der passer bedst vinder, den anden er ekstra
  const two = matchActivities({ ...base, weeks: custom([sess('run', 'A', 45)]), activities: picked([
    raw({ id: 67, start: '2026-11-02T06:00:00Z', elapsed: 20 * 60 }), raw({ id: 68, start: '2026-11-02T16:00:00Z', elapsed: 44 * 60 }),
  ]) });
  assert.equal(two.writes.u02['0-0'].extId, '68');
  assert.equal(two.stats.extras, 1);
});

test('flest mulige par slår den billigste parring: en aktivitet der kun passer ét pas, får det', () => {
  const W = custom([sess('run', 'Kort', 20), sess('run', 'Lang', 90)]);
  const r = matchActivities({ weeks: W, progress: {}, ledger: {}, today: '2026-11-02', lookbackDays: 1, activities: picked([
    raw({ id: 71, start: '2026-11-02T06:00:00Z', elapsed: 80 * 60 }), raw({ id: 72, start: '2026-11-02T16:00:00Z', elapsed: 22 * 60 }),
  ]) });
  assert.equal(r.writes.u02['0-1'].extId, '71');
  assert.equal(r.writes.u02['0-0'].extId, '72');
  // 6 min kan ikke tælle som pas på 90 (under 25 %), men er nok til det korte på 20 (30 %)
  const small = matchActivities({ weeks: W, progress: {}, ledger: {}, today: '2026-11-02', lookbackDays: 1, activities: picked([raw({ id: 73, start: '2026-11-02T06:00:00Z', elapsed: 6 * 60 })]) });
  assert.deepEqual(Object.keys(small.writes.u02), ['0-0']);
});

test('aktiviteter under 5 minutter eller under 25 % af passet ignoreres og tælles som ekstra', () => {
  const r = run([
    raw({ id: 81, type: 'Run', start: '2026-11-07T10:05:00Z', elapsed: 4 * 60 }),          // 4 min: for kort, selv om passet (brick, 10 min) ville tillade det
    raw({ id: 82, type: 'Run', start: '2026-11-08T10:05:00Z', elapsed: 12 * 60 }),         // søndag: langt løb på 50 min, 12 min = 24 %
  ]);
  assert.deepEqual(r.writes, {});
  assert.equal(r.stats.extras, 2);
  assert.deepEqual(r.ledger, {});
  const ok = run([raw({ id: 83, type: 'Run', start: '2026-11-08T10:05:00Z', elapsed: 13 * 60 })]); // 26 %
  assert.equal(ok.writes.u02['6-0'].extId, '83');
  const exactly = run([raw({ id: 84, type: 'Run', start: '2026-11-08T10:05:00Z', elapsed: 750 })]); // 12,5 min = 25 % præcis (afrundet til 13 min)
  assert.equal(exactly.writes.u02['6-0'].min, 13);
});

test('ukendte sportstyper og dage uden pas i gruppen er ekstra', () => {
  const r = run([
    raw({ id: 91, type: 'Walk', start: '2026-11-08T09:00:00Z', elapsed: 3000 }),
    raw({ id: 92, type: 'EBikeRide', start: '2026-11-06T09:00:00Z', elapsed: 3000 }),
    raw({ id: 93, type: 'Swim', start: '2026-11-08T09:00:00Z', elapsed: 3000 }),           // søndag har kun et løb
  ]);
  assert.deepEqual(r.writes, {});
  assert.deepEqual(r.stats, { window: 3, matched: 0, healed: 0, occupied: 0, extras: 3, known: 0 });
});

test('højst 6 aktiviteter pr. gruppe og dag; resten er ekstra', () => {
  const list = Array.from({ length: 8 }, (_, i) => raw({ id: 100 + i, type: 'Run', start: `2026-11-08T0${i}:00:00Z`, elapsed: 50 * 60 }));
  const r = run(list);
  assert.equal(Object.keys(flat(r.writes)).length, 1);
  assert.equal(r.stats.matched, 1);
  assert.equal(r.stats.extras, 7);
  assert.equal(r.writes.u02['6-0'].extId, '100', 'den første i starttid-orden, ved uafgjort');
});

test('triatlon-løb: alle dagens svøm-, cykel- og løbeaktiviteter samles i ét pas med sammenføjet extId', () => {
  const day = dateOf('u33', 6);
  assert.equal(day, '2027-06-13');
  const legs = [
    raw({ id: 301, type: 'Swim', start: '2027-06-13T05:30:00Z', elapsed: 2700, moving: 2600, dist: 1900.4, hr: 150 }),
    raw({ id: 303, type: 'Run', start: '2027-06-13T11:40:00Z', elapsed: 7100, moving: 6900, dist: 21100.2, hr: 160 }),
    raw({ id: 302, type: 'Ride', start: '2027-06-13T06:30:00Z', elapsed: 11000, moving: 10500, dist: 90100.6, hr: 140 }),
    raw({ id: 304, type: 'Walk', start: '2027-06-13T14:00:00Z', elapsed: 900 }),
  ];
  const r = matchActivities({ weeks, progress: {}, activities: picked(legs), ledger: {}, today: day, lookbackDays: 1 });
  const key = keyOf('u33', 'Køge Jernmand');
  assert.deepEqual(r.writes, { u33: { [key]: {
    done: true, updatedAt: '2027-06-13T13:38:20.000Z', dev: 'strava', at: '2027-06-13T05:30:00.000Z', min: 347,
    src: 'strava', extId: '301,302,303', sig: 'race:Køge Jernmand', dist: 113101,
  } } });
  assert.ok(!('hr' in r.writes.u33[key]), 'ingen puls på et løb af flere aktiviteter');
  assert.deepEqual(Object.keys(r.ledger).sort(), ['301', '302', '303']);
  assert.ok(Object.values(r.ledger).every(l => l.w === 'u33' && l.k === key && l.d === day));
  assert.equal(r.stats.matched, 1);
  assert.equal(r.stats.extras, 1, 'gåturen');
  assert.deepEqual(normalizeEntry(r.writes.u33[key]), r.writes.u33[key]);
});

test('triatlon-løb: kun 25 % eller mere tæller som gennemført, ellers ingen skrivning og ingen hovedbog; extId kortes til 3 id\'er', () => {
  const day = '2027-06-13';
  const short = matchActivities({ weeks, progress: {}, ledger: {}, today: day, lookbackDays: 1, activities: picked([raw({ id: 311, type: 'Swim', start: '2027-06-13T05:30:00Z', elapsed: 80 * 60 })]) });
  assert.deepEqual(short.writes, {});
  assert.deepEqual(short.ledger, {});
  assert.equal(short.stats.extras, 1);
  const enough = matchActivities({ weeks, progress: {}, ledger: {}, today: day, lookbackDays: 1, activities: picked([raw({ id: 312, type: 'Ride', start: '2027-06-13T05:30:00Z', elapsed: 83 * 60 })]) });
  assert.equal(enough.writes.u33['6-0'].min, 83, '83 min ≥ 82,5 min');

  const ids = [11111111111, 22222222222, 33333333333, 44444444444, 55555555555, 66666666666];
  const many = ids.map((id, i) => raw({ id, type: i % 2 ? 'Run' : 'Ride', start: `2027-06-13T${String(5 + i).padStart(2, '0')}:00:00Z`, elapsed: [3000, 5000, 9000, 1000, 7000, 8000][i] }));
  const r = matchActivities({ weeks, progress: {}, ledger: {}, today: day, lookbackDays: 1, activities: picked(many) });
  const e = r.writes.u33['6-0'];
  assert.ok(e.extId.length <= 64);
  assert.equal(e.extId, '33333333333,55555555555,66666666666', 'de tre længste, i starttid-orden');
  assert.equal(Object.keys(r.ledger).length, 6, 'alle id\'er er bogført');
  assert.equal(e.min, Math.round((3000 + 5000 + 9000 + 1000 + 7000 + 8000) / 60));
});

test('triatlon-løb: et manuelt pas på løbsdagen vinder, og benene absorberes', () => {
  const manual = { done: true, updatedAt: '2027-06-13T20:00:00.000Z', min: 330, rpe: 9 };
  const r = matchActivities({ weeks, progress: { u33: { '6-0': manual } }, ledger: {}, today: '2027-06-13', lookbackDays: 1, activities: picked([
    raw({ id: 321, type: 'Swim', start: '2027-06-13T05:30:00Z', elapsed: 2700 }), raw({ id: 322, type: 'Ride', start: '2027-06-13T06:30:00Z', elapsed: 11000 }),
  ]) });
  assert.deepEqual(r.writes, {});
  assert.deepEqual(r.ledger, {});
  assert.equal(r.stats.occupied, 2);
});

test('halvmaraton matches af sit løb, og IRONMAN-dagen samler de tre discipliner', () => {
  const r = matchActivities({ weeks, progress: {}, ledger: {}, today: '2027-04-25', lookbackDays: 1, activities: picked([
    raw({ id: 331, type: 'Run', start: '2027-04-25T09:00:00Z', elapsed: 7000, moving: 6900, dist: 21100, hr: 168 }),
  ]) });
  const e = r.writes.u26['6-0'];
  assert.equal(e.sig, 'race:Halvmaraton');
  assert.equal(e.min, 115);
  assert.equal(e.hr, 168);
  assert.equal(e.dist, 21100);
  const tenK = matchActivities({ weeks, progress: {}, ledger: {}, today: '2027-01-31', lookbackDays: 1, activities: picked([raw({ id: 332, type: 'Run', start: '2027-01-31T10:00:00Z', elapsed: 2700 })]) });
  assert.equal(tenK.writes.u14['6-0'].sig, 'race:10 km-løb');
  const im = matchActivities({ weeks, progress: {}, ledger: {}, today: '2027-08-22', lookbackDays: 1, activities: picked([
    raw({ id: 341, type: 'Swim', start: '2027-08-22T05:00:00Z', elapsed: 4000 }), raw({ id: 342, type: 'Ride', start: '2027-08-22T06:30:00Z', elapsed: 22000 }), raw({ id: 343, type: 'Run', start: '2027-08-22T13:00:00Z', elapsed: 15000 }),
  ]) });
  assert.equal(im.writes.u43['6-0'].extId, '341,342,343');
  assert.equal(im.writes.u43['6-0'].min, 683);
});

// ---- Hvem vinder ----

test('et manuelt pas overskrives aldrig, og aktiviteten rykker ikke over på et søskendepas', () => {
  const W = custom([sess('run', 'A', 45), sess('run', 'B', 45)]);
  const manual = { done: true, updatedAt: '2026-11-02T07:00:00.000Z', min: 44, note: 'Min egen' };
  const base = { weeks: W, ledger: {}, today: '2026-11-02', lookbackDays: 1 };
  const acts = picked([raw({ id: 401, start: '2026-11-02T06:00:00Z', elapsed: 45 * 60 })]);
  const r = matchActivities({ ...base, progress: { u02: { '0-0': manual } }, activities: acts });
  assert.deepEqual(r.writes, {}, 'ingen skrivning: aktiviteten absorberes af det manuelle pas');
  assert.deepEqual(r.ledger, {}, 'og bogføres ikke');
  assert.equal(r.stats.occupied, 1);
  // også et Strava-pas er "gennemført" og røres ikke
  const strava = { ...manual, src: 'strava', extId: '999', dev: 'strava' };
  assert.deepEqual(matchActivities({ ...base, progress: { u02: { '0-0': strava } }, activities: acts }).writes, {});
  // begge pas optaget: ingen skrivning
  assert.deepEqual(matchActivities({ ...base, progress: { u02: { '0-0': manual, '0-1': manual } }, activities: acts }).writes, {});
  // et manuelt pas på det andet pas: aktiviteten går til det første
  const second = matchActivities({ ...base, progress: { u02: { '0-1': manual } }, activities: picked([
    raw({ id: 402, start: '2026-11-02T06:00:00Z', elapsed: 45 * 60 }),
  ]) });
  assert.deepEqual(Object.keys(second.writes.u02), ['0-0']);
  // et manuelt pas lavet før aktiviteten blokerer også (det er gennemført, uanset tidspunkt)
  assert.deepEqual(matchActivities({ ...base, progress: { u02: { '0-0': { ...manual, updatedAt: '2026-11-01T07:00:00.000Z' } } }, activities: acts }).writes, {});
});

test('en gravsten nyere end aktivitetens start blokerer (fjernet med vilje); en ældre gravsten gør ikke', () => {
  const start = '2026-11-07T08:00:00Z';
  const act = picked([raw({ id: 411, type: 'Ride', start, elapsed: 5700, moving: 5400 })]);
  const tomb = updatedAt => ({ done: false, updatedAt, dev: 'k3f9a2c1' });
  const base = { weeks, ledger: {}, today: '2026-11-08', lookbackDays: 7, activities: act };
  const newer = matchActivities({ ...base, progress: { u02: { '5-0': tomb('2026-11-07T09:00:00.000Z') } } });
  assert.deepEqual(newer.writes, {});
  assert.equal(newer.stats.occupied, 1);
  const older = matchActivities({ ...base, progress: { u02: { '5-0': tomb('2026-11-07T07:00:00.000Z') } } });
  const e = older.writes.u02['5-0'];
  assert.equal(e.done, true);
  assert.equal(e.updatedAt, '2026-11-07T09:35:00.000Z', 'aktivitetens slut');
  assert.equal(mergeEntry(tomb('2026-11-07T07:00:00.000Z'), e), e, 'og Strava-passet slår den gamle gravsten');
  const same = matchActivities({ ...base, progress: { u02: { '5-0': tomb(new Date(Date.parse(start)).toISOString()) } } });
  assert.deepEqual(same.writes, {}, 'en gravsten på præcis samme tidspunkt er ikke ældre');
});

test('LWW: en manuel afkrydsning efter træningen slår Strava-passet, uanset flettens rækkefølge', () => {
  const r = run([raw({ id: 421, type: 'Ride', start: '2026-11-07T08:00:00Z', elapsed: 5700, moving: 5400 })]);
  const strava = r.writes.u02['5-0'];
  const manual = { done: true, updatedAt: '2026-11-07T09:36:00.000Z', dev: 'k3f9a2c1', at: '2026-11-07T09:36:00.000Z', min: 95, rpe: 6, note: 'Fin tur' };
  assert.equal(mergeEntry(strava, manual), manual);
  assert.equal(mergeEntry(manual, strava), manual);
  assert.deepEqual(mergeWeek({ '5-0': strava }, { '5-0': manual }), { '5-0': manual });
  assert.deepEqual(mergeWeek({ '5-0': manual }, { '5-0': strava }), { '5-0': manual });
  const un = { done: false, updatedAt: '2026-11-07T09:40:00.000Z', dev: 'k3f9a2c1' };
  assert.equal(mergeEntry(strava, un), un, 'og en senere fjernelse slår også Strava-passet');
});

test('efter en fjernelse af et Strava-pas skriver en ny kørsel intet (med og uden hovedbog)', () => {
  const acts = picked([raw({ id: 431, type: 'Ride', start: '2026-11-07T08:00:00Z', elapsed: 5700, moving: 5400 })]);
  const first = matchActivities({ weeks, progress: {}, activities: acts, ledger: {}, today: '2026-11-08', lookbackDays: 7 });
  let progress = apply({}, first.writes);
  assert.equal(progress.u02['5-0'].done, true);
  const un = { done: false, updatedAt: '2026-11-07T10:30:00.000Z', dev: 'k3f9a2c1' };
  progress = apply(progress, { u02: { '5-0': un } });
  assert.equal(progress.u02['5-0'].done, false);
  const withLedger = matchActivities({ weeks, progress, activities: acts, ledger: first.ledger, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(withLedger.writes, {});
  assert.deepEqual(withLedger.ledger, first.ledger);
  const noLedger = matchActivities({ weeks, progress, activities: acts, ledger: {}, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(noLedger.writes, {}, 'gravstenen er nyere end aktivitetens start');
  assert.equal(noLedger.stats.occupied, 1);
});

// ---- Idempotens, selvheling og hovedbog ----

test('en anden kørsel med de samme data giver 0 skrivninger og uændret hovedbog', () => {
  const acts = picked(fixture('activities-week2.json'));
  const first = matchActivities({ weeks, progress: {}, activities: acts, ledger: {}, today: '2026-11-08', lookbackDays: 7 });
  assert.equal(first.stats.matched, 6);
  const progress = apply({}, first.writes);
  const second = matchActivities({ weeks, progress, activities: acts, ledger: first.ledger, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(second.writes, {});
  assert.deepEqual(second.ledger, first.ledger);
  assert.deepEqual(second.stats, { window: 7, matched: 0, healed: 0, occupied: 0, extras: 1, known: 6 });
  // uden hovedbog: id'erne står i extId på pasene, så det samme gælder
  const viaExtId = matchActivities({ weeks, progress, activities: acts, ledger: {}, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(viaExtId.writes, {});
  // og de rå input er urørte
  const snap = JSON.stringify([progress, first.ledger]);
  matchActivities({ weeks, progress, activities: acts, ledger: first.ledger, today: '2026-11-08', lookbackDays: 7 });
  assert.equal(JSON.stringify([progress, first.ledger]), snap);
});

test('selvheling: et bogført pas der mangler skrives igen (genskabt), og er det ikke længere hentet, droppes hovedbogsposten', () => {
  const acts = picked([raw({ id: 441, type: 'Ride', start: '2026-11-07T08:00:00Z', elapsed: 5700, moving: 5400, dist: 52300.4, hr: 128 })]);
  const first = matchActivities({ weeks, progress: {}, activities: acts, ledger: {}, today: '2026-11-08', lookbackDays: 7 });
  const entry = first.writes.u02['5-0'];
  // en enhed overskrev ugen, så passet mangler, men hovedbogen kender det
  const healed = matchActivities({ weeks, progress: { u02: { '1-0': { done: true, updatedAt: '2026-11-03T08:00:00.000Z' } } }, activities: acts, ledger: first.ledger, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(healed.writes, { u02: { '5-0': entry } });
  assert.equal(healed.stats.healed, 1);
  assert.equal(healed.stats.matched, 0);
  assert.deepEqual(healed.ledger, first.ledger);
  // aktiviteten er ikke længere i det hentede vindue: ingen skrivning, hovedbogsposten droppes
  const gone = matchActivities({ weeks, progress: {}, activities: [], ledger: first.ledger, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(gone.writes, {});
  assert.deepEqual(gone.ledger, {});
  // en gravsten på målet (brugerens fjernelse) står ved magt: intet genskabes, hovedbogen beholdes
  const tomb = { done: false, updatedAt: '2026-11-07T11:00:00.000Z', dev: 'k3f9a2c1' };
  const kept = matchActivities({ weeks, progress: { u02: { '5-0': tomb } }, activities: acts, ledger: first.ledger, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(kept.writes, {});
  assert.deepEqual(kept.ledger, first.ledger);
  assert.equal(kept.stats.healed, 0);
  // et mål der ikke findes i planen, droppes
  const orphan = matchActivities({ weeks, progress: {}, activities: acts, ledger: { 441: { d: '2026-11-07', w: 'u99', k: '0-0' } }, today: '2026-11-08', lookbackDays: 7 });
  assert.deepEqual(orphan.ledger, {});
});

test('selvheling af et triatlon-løb samler benene igen; en blokeret uge røres ikke', () => {
  const legs = picked([
    raw({ id: 451, type: 'Swim', start: '2027-06-13T05:30:00Z', elapsed: 2700 }), raw({ id: 452, type: 'Ride', start: '2027-06-13T06:30:00Z', elapsed: 11000 }), raw({ id: 453, type: 'Run', start: '2027-06-13T11:40:00Z', elapsed: 7100 }),
  ]);
  const base = { weeks, activities: legs, today: '2027-06-13', lookbackDays: 1 };
  const first = matchActivities({ ...base, progress: {}, ledger: {} });
  const again = matchActivities({ ...base, progress: {}, ledger: first.ledger });
  assert.deepEqual(again.writes, first.writes);
  assert.equal(again.stats.healed, 1);
  const blocked = matchActivities({ ...base, progress: {}, ledger: first.ledger, blocked: ['u33'] });
  assert.deepEqual(blocked.writes, {});
  assert.deepEqual(blocked.ledger, first.ledger, 'bogføringen beholdes, så en senere kørsel kan genskabe');
  const fresh = matchActivities({ ...base, progress: {}, ledger: {}, blocked: ['u33'] });
  assert.deepEqual(fresh.writes, {});
  assert.deepEqual(fresh.ledger, {});
  assert.equal(fresh.stats.occupied, 3);
});

test('hovedbogen beskæres: poster ældre end 30 dage forsvinder, poster på grænsen og nyere bliver', () => {
  const done = t => ({ done: true, updatedAt: t });
  const ledger = { 1: { d: '2026-11-30', w: 'u05', k: '1-0' }, 2: { d: '2026-12-01', w: 'u06', k: '1-0' }, 3: { d: '2026-12-08', w: 'u07', k: '1-0' } };
  const progress = { u05: { '1-0': done('2026-11-30T08:00:00.000Z') }, u06: { '1-0': done('2026-12-01T08:00:00.000Z') }, u07: { '1-0': done('2026-12-08T08:00:00.000Z') } };
  const at = today => Object.keys(matchActivities({ weeks, progress, activities: [], ledger, today, lookbackDays: 3 }).ledger).sort();
  assert.deepEqual(at('2026-12-31'), ['2', '3'], 'i dag − 30 d = 1. dec.: 30. nov. er ældre; 1. dec. bliver');
  assert.deepEqual(at('2026-12-30'), ['1', '2', '3']);
  assert.deepEqual(at('2027-01-01'), ['3'], 'i dag − 30 d = 2. dec.');
  assert.deepEqual(at('2027-01-07'), ['3'], 'i dag − 30 d = 8. dec.: 8. dec. bliver');
  assert.deepEqual(at('2027-01-08'), [], 'i dag − 30 d = 9. dec.: alt er ældre');
});
