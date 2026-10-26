// Anbefalet fart (src/pace.js): zoner ud fra tre grundtal, formatering, tolerant indtastning, beregning og sammenligning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINES, INDOOR_TEXT, comparePace, derivePace, formatPace, formatRange, guideRows, paceCompact, paceSport, paceText, parsePace, zoneRange,
} from '../src/pace.js';

const range = (sport, z, base) => formatRange(sport, zoneRange(sport, z, base));

test('grundtal: løbetærskel 5:45 /km, CSS 2:10 /100 m og cykeltærskel 29 km/t', () => {
  assert.deepEqual({ ...BASELINES }, { run: 345, swim: 130, bike: 29 });
  assert.ok(Object.isFrozen(BASELINES));
});

test('løbezoner ud fra tærskelfarten 5:45', () => {
  assert.equal(range('run', 'easy'), '6:45–7:15 /km');
  assert.equal(range('run', 'z2'), '6:45–7:15 /km');
  assert.equal(range('run', 'im'), '6:20–6:35 /km');
  assert.equal(range('run', 'hm'), '5:55–6:05 /km');
  assert.equal(range('run', 'tempo'), '5:50–6:00 /km');
  assert.equal(range('run', 'thr'), '5:40–5:50 /km');
  assert.equal(range('run', 'z4'), '5:25–5:35 /km');
});

test('svømmezoner ud fra CSS 2:10', () => {
  assert.equal(range('swim', 'easy'), 'ca. 2:25 /100 m');
  assert.equal(range('swim', 'css'), '2:08–2:12 /100 m');
  assert.equal(range('swim', 'thr'), '2:08–2:12 /100 m');
  assert.equal(range('swim', 'im'), '2:15–2:20 /100 m');
});

test('cykelzoner ud fra tærskelfarten 29 km/t (kun km/t)', () => {
  assert.equal(range('bike', 'easy'), 'under 22 km/t');
  assert.equal(range('bike', 'z2'), '22–25 km/t');
  assert.equal(range('bike', 'im'), '24–26 km/t');
  assert.equal(range('bike', 'ss'), '26–27,5 km/t');
  assert.equal(range('bike', 'thr'), '28–30 km/t');
  assert.ok(!/watt|ftp/i.test(['easy', 'z2', 'im', 'ss', 'thr'].map(z => range('bike', z)).join()));
});

test('en ny grundværdi flytter alle zoner', () => {
  const base = { run: 330, swim: 125, bike: 31 };
  assert.equal(range('run', 'thr', base), '5:25–5:35 /km');
  assert.equal(range('run', 'z2', base), '6:30–7:00 /km');
  assert.equal(range('swim', 'css', base), '2:03–2:07 /100 m');
  assert.equal(range('swim', 'easy', base), 'ca. 2:20 /100 m');
  assert.equal(range('bike', 'ss', base), '28–29,5 km/t');
  assert.equal(range('bike', 'easy', base), 'under 24 km/t');
  assert.deepEqual(zoneRange('bike', 'thr', { ...BASELINES, bike: 29.3 }), { lo: 28.5, hi: 30.5 }, 'cykelzoner afrundes til halve km/t');
  const rows = guideRows(base);
  assert.equal(rows.find(r => r.name === 'Tærskel / CSS').run, '5:25–5:35');
  assert.equal(rows.find(r => r.name === 'Sweet spot').bike, '28–29,5');
});

test('ukendte zoner og sportsgrene giver null (ingen undtagelse, ingen arvede nøgler)', () => {
  for (const [sport, z] of [['run', 'ss'], ['bike', 'hm'], ['swim', 'z4'], ['run', 'test'], ['run', 'constructor'], ['toString', 'z2'], ['run', undefined], ['run', 5]]) {
    assert.equal(zoneRange(sport, z), null, `${sport}/${z}`);
  }
  assert.equal(zoneRange('run', 'z2', {}), null);
  assert.equal(zoneRange('run', 'z2', { run: 'x' }), null);
});

test('formatPace: mm:ss for løb og svøm, komma-decimal for cykel', () => {
  assert.equal(formatPace('run', 330), '5:30');
  assert.equal(formatPace('run', 365), '6:05');
  assert.equal(formatPace('swim', 128), '2:08');
  assert.equal(formatPace('swim', 59), '0:59');
  assert.equal(formatPace('bike', 27.5), '27,5');
  assert.equal(formatPace('bike', 28), '28');
  assert.equal(formatPace('bike', 27.34), '27,3');
  assert.equal(formatPace('run', NaN), '');
  assert.equal(formatRange('run', null), '');
  assert.equal(formatRange('run', zoneRange('run', 'z2'), { unit: false }), '6:45–7:15');
});

test('parsePace: "5:30", "5.30", "5,30" og "27,5" accepteres; vrøvl og urimelige tal afvises', () => {
  for (const x of ['5:30', '5.30', '5,30', ' 5:30 ', '5:30 /km', '5:30 min/km', '05:30']) assert.equal(parsePace('run', x), 330, JSON.stringify(x));
  assert.equal(parsePace('run', '5.5'), 330, 'm.t er tiendedele af et minut');
  assert.equal(parsePace('run', '6'), 360);
  assert.equal(parsePace('run', '10:05'), 605);
  assert.equal(parsePace('swim', '2:10'), 130);
  assert.equal(parsePace('swim', '2.10'), 130);
  assert.equal(parsePace('swim', '2:10 /100 m'), 130);
  assert.equal(parsePace('swim', '2:10/100m'), 130);
  assert.equal(parsePace('swim', '1:05'), 65);
  for (const [x, v] of [['27,5', 27.5], ['27.5', 27.5], ['27', 27], [' 27,5 km/t', 27.5], ['27.5km/h', 27.5], ['8', 8]]) assert.equal(parsePace('bike', x), v, JSON.stringify(x));
  assert.equal(parsePace('bike', '27,55'), 27.6);
  for (const [sport, x] of [
    ['run', ''], ['run', '   '], ['run', 'hurtig'], ['run', '5:3'], ['run', '5:75'], ['run', '5.75'], ['run', '5:30:10'], ['run', '530'], ['run', '1:00'], ['run', '25:00'],
    ['run', '-5:30'], ['run', '5:30,5'], ['swim', '0:20'], ['swim', '12:00'], ['bike', '2'], ['bike', '120'], ['bike', '5:30'], ['bike', 'abc'], ['bike', '27,5,1'],
    ['str', '5:30'], ['rest', '5'], ['toString', '5'],
  ]) assert.equal(parsePace(sport, x), null, `${sport} ${JSON.stringify(x)}`);
  assert.equal(parsePace('run', null), null);
  assert.equal(parsePace('run', undefined), null);
  assert.equal(parsePace('bike', 27.5), 27.5, 'tal accepteres også');
});

test('parsePace og formatPace er hinandens omvendte', () => {
  for (const v of [150, 330, 345, 405, 599, 1200]) assert.equal(parsePace('run', formatPace('run', v)), v);
  for (const v of [60, 128, 130, 145, 300]) assert.equal(parsePace('swim', formatPace('swim', v)), v);
  for (const v of [8, 22, 27.5, 31.4]) assert.equal(parsePace('bike', formatPace('bike', v)), v);
});

test('derivePace: løb sek./km, svøm sek./100 m, cykel km/t ud fra meter og minutter', () => {
  assert.equal(derivePace('run', 10000, 55), 330);
  assert.equal(derivePace('run', 10234, 62), 363);
  assert.equal(derivePace('swim', 2000, 43), 129);
  assert.equal(derivePace('bike', 30000, 60), 30);
  assert.equal(derivePace('bike', 98765, 90), 65.8);
  for (const [sport, d, m] of [['run', 0, 30], ['run', 5000, 0], ['run', -1, 30], ['run', NaN, 30], ['run', 5000, '30'], ['run', 100, 60], ['bike', 500000, 10], ['str', 1000, 10], ['toString', 1000, 10]]) {
    assert.equal(derivePace(sport, d, m), null, `${sport} ${d} ${m}`);
  }
});

test('comparePace: løb og svøm er hurtigere ved lavere tal, cykel ved højere', () => {
  const run = zoneRange('run', 'thr'); // 340–350
  assert.equal(comparePace('run', 335, run), 'faster');
  assert.equal(comparePace('run', 340, run), 'inzone');
  assert.equal(comparePace('run', 350, run), 'inzone');
  assert.equal(comparePace('run', 351, run), 'slower');
  const swim = zoneRange('swim', 'css'); // 128–132
  assert.equal(comparePace('swim', 125, swim), 'faster');
  assert.equal(comparePace('swim', 140, swim), 'slower');
  const bike = zoneRange('bike', 'z2'); // 22–25
  assert.equal(comparePace('bike', 26, bike), 'faster');
  assert.equal(comparePace('bike', 23, bike), 'inzone');
  assert.equal(comparePace('bike', 20, bike), 'slower');
  const z1 = zoneRange('bike', 'easy'); // under 22: ingen nedre grænse
  assert.equal(comparePace('bike', 15, z1), 'inzone');
  assert.equal(comparePace('bike', 23, z1), 'faster');
  assert.equal(comparePace('run', 330, null), null);
  assert.equal(comparePace('run', NaN, run), null);
});

test('paceText: opvarmning/hele passet og hovedsæt, indendørs, tests, triatlon-løb, styrke og hvile', () => {
  const run = { s: 'run', z: 'easy', main: 'thr' };
  assert.equal(paceText(run), 'Anbefalet: 6:45–7:15 /km · hovedsæt 5:40–5:50 /km');
  assert.equal(paceText({ s: 'run', z: 'z2' }), 'Anbefalet: 6:45–7:15 /km');
  assert.equal(paceText({ s: 'swim', z: 'easy', main: 'css' }), 'Anbefalet: ca. 2:25 /100 m · hovedsæt 2:08–2:12 /100 m');
  assert.equal(paceText({ s: 'bike', z: 'z2', main: 'ss' }), 'Anbefalet: 22–25 km/t · hovedsæt 26–27,5 km/t');
  assert.equal(paceText({ s: 'bike', z: 'z2', main: 'ss', ind: true }), `Anbefalet: ${INDOOR_TEXT}`);
  assert.equal(paceText({ s: 'bike', z: 'z2', ind: 'opt' }), `Anbefalet: 22–25 km/t · indendørs: ${INDOOR_TEXT}`);
  assert.equal(paceText({ s: 'run', z: 'test' }), 'Anbefalet: hård og jævn indsats, notér resultatet');
  assert.equal(paceText({ s: 'race', z: 'z4' }), 'Anbefalet: 5:25–5:35 /km', 'løbskonkurrence = løbefart');
  assert.equal(paceText({ s: 'race', z: 'race', legs: { swim: 'im', bike: 'im', run: 'im' } }), 'Anbefalet: svøm 2:15–2:20 /100 m · cykel 24–26 km/t · løb 6:20–6:35 /km');
  assert.equal(paceText({ s: 'str', z: 'str' }), null);
  assert.equal(paceText({ s: 'rest', z: 'rest' }), null);
  assert.equal(paceText({ s: 'run', z: 'ss' }), null, 'zone uden fart for sporten');
  assert.equal(paceText({ s: 'run', z: 'z2', main: 'ss' }), null);
  assert.equal(paceText({ s: 'run' }), null, 'manglende zone');
});

test('paceCompact: hovedsættets fart, ellers pasets; tests og triatlon-løb har ingen kort tekst', () => {
  assert.equal(paceCompact({ s: 'run', z: 'easy', main: 'thr' }), '5:40–5:50 /km');
  assert.equal(paceCompact({ s: 'run', z: 'z2' }), '6:45–7:15 /km');
  assert.equal(paceCompact({ s: 'bike', z: 'z2', ind: true }), INDOOR_TEXT);
  assert.equal(paceCompact({ s: 'bike', z: 'z2', ind: 'opt' }), '22–25 km/t');
  assert.equal(paceCompact({ s: 'run', z: 'test' }), null);
  assert.equal(paceCompact({ s: 'race', z: 'race', legs: { swim: 'im', bike: 'im', run: 'im' } }), null);
  assert.equal(paceCompact({ s: 'str', z: 'str' }), null);
});

test('paceSport: styrke, hvile, triatlon-løb og indendørs cykel har ingen faktisk pace', () => {
  assert.equal(paceSport({ s: 'run' }), 'run');
  assert.equal(paceSport({ s: 'swim' }), 'swim');
  assert.equal(paceSport({ s: 'bike' }), 'bike');
  assert.equal(paceSport({ s: 'bike', ind: 'opt' }), 'bike');
  assert.equal(paceSport({ s: 'bike', ind: true }), null);
  assert.equal(paceSport({ s: 'race', z: 'z4' }), 'run');
  assert.equal(paceSport({ s: 'race', legs: {} }), null);
  assert.equal(paceSport({ s: 'str' }), null);
  assert.equal(paceSport({ s: 'rest' }), null);
  assert.equal(paceSport(null), null);
});

test('guideRows: zonetabellen følger grundtallene og nævner hverken watt eller FTP', () => {
  const rows = guideRows();
  assert.deepEqual(rows.map(r => r.name), ['Z1', 'Z2 (rolig)', 'IM-fart', 'Halvmaratonfart', 'Tempo', 'Sweet spot', 'Tærskel / CSS', 'Z4 (10 km)']);
  assert.deepEqual(rows.find(r => r.name === 'IM-fart'), { name: 'IM-fart', run: '6:20–6:35', swim: '2:15–2:20', bike: '24–26' });
  assert.equal(rows.find(r => r.name === 'Z1').bike, 'under 22');
  assert.ok(!/watt|ftp/i.test(JSON.stringify(rows)));
});
