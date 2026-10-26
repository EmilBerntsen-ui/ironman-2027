// Faner (src/views.js): routing, nøglepas, overholdelse og stat-kort. Rene funktioner, så ingen DOM her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, pmc, plannedDailyTss } from '../src/plan.js';
import {
  DEFAULT_ROUTE, ROUTES, SPORT_ORDER, complianceBySport, isKeySession, nextKeySession, parseRoute, pct, pmcView, signed, sparkPoints,
} from '../src/views.js';

const weeks = plan();

test('parseRoute: hver fane har sit eget plain token, og "settings" er ikke et af dem', () => {
  assert.deepEqual([...ROUTES], ['idag', 'kalender', 'kost', 'analyse', 'mere']);
  assert.ok(!ROUTES.includes('settings'), 'reserveret af claude.ai-viseren');
  for (const r of ROUTES) assert.deepEqual(parseRoute('#' + r, 43), { route: r, week: null }, r);
  assert.deepEqual(parseRoute('#KOST', 43), { route: 'kost', week: null }, 'store bogstaver tåles');
});

test('parseRoute: tom, ukendt og "#settings" giver I dag', () => {
  for (const h of ['', '#', undefined, null, '#settings', '#noget', '#/kost', '#idag/ekstra']) assert.deepEqual(parseRoute(h, 43), { route: DEFAULT_ROUTE, week: null }, String(h));
  assert.equal(DEFAULT_ROUTE, 'idag');
});

test('parseRoute: ugelinks (#u12) åbner kalenderen ved den uge; uge 0 og uger uden for planen er ukendte', () => {
  assert.deepEqual(parseRoute('#u12', 43), { route: 'kalender', week: 11 });
  assert.deepEqual(parseRoute('#u01', 43), { route: 'kalender', week: 0 });
  assert.deepEqual(parseRoute('#u43', 43), { route: 'kalender', week: 42 });
  for (const h of ['#u00', '#u44', '#u1', '#u123', '#ux1']) assert.deepEqual(parseRoute(h, 43), { route: 'idag', week: null }, h);
});

test('isKeySession: løb, tests og lange cykel- og løbeture; ikke hvile, styrke eller almindelige pas', () => {
  const find = (s, t) => { for (const w of weeks) for (const d of w.days) for (const x of d) if (x.s === s && x.t === t) return x; };
  for (const [s, t] of [['race', 'IRONMAN'], ['race', 'Køge Jernmand'], ['bike', 'Cykeltest'], ['run', 'Løbetest'], ['swim', 'Svømmetest (morgen)'], ['bike', 'Lang cykeltur'], ['run', 'Langt løb']]) {
    assert.ok(isKeySession(find(s, t)), `${s} ${t}`);
  }
  for (const [s, t] of [['rest', 'Hviledag'], ['str', 'Styrke'], ['run', 'Roligt løb'], ['bike', 'Let cykeltur'], ['swim', 'Lang svømmetur'], ['run', 'Brick-løb']]) {
    assert.ok(!isKeySession(find(s, t)), `${s} ${t}`);
  }
  assert.equal(isKeySession(null), false);
});

test('nextKeySession: første ikke-gennemførte nøglepas fra og med en dag, og null når der ikke er flere', () => {
  const none = () => false;
  const first = nextKeySession(weeks, 0, none);
  assert.ok(first && isKeySession(first.s));
  assert.equal(first.dayIdx, first.wi * 7 + first.di);
  assert.equal(weeks[first.wi].days[first.di][first.si], first.s);
  for (let d = 0; d < first.dayIdx; d++) weeks[Math.floor(d / 7)].days[d % 7].forEach(s => assert.ok(!isKeySession(s)));
  // gennemført: springes over
  const second = nextKeySession(weeks, 0, (wi, di, si) => wi === first.wi && di === first.di && si === first.si);
  assert.ok(second.dayIdx > first.dayIdx || second.si > first.si);
  // "fra" er inklusive, og negative indekser klemmes til planstart
  assert.equal(nextKeySession(weeks, first.dayIdx, none).dayIdx, first.dayIdx);
  assert.equal(nextKeySession(weeks, -5, none).dayIdx, first.dayIdx);
  assert.equal(nextKeySession(weeks, weeks.length * 7, none), null);
  assert.equal(nextKeySession(weeks, 0, () => true), null);
  const last = nextKeySession(weeks, weeks.length * 7 - 1, none);
  assert.equal(last.s.t, 'IRONMAN');
});

test('complianceBySport: planlagt = pas før i dag, gennemført = til og med i dag; et gennemført pas i dag tæller i begge', () => {
  const entries = new Map();
  const entryOf = (wi, di, si) => entries.get(`${wi}-${di}-${si}`) || null;
  const total = c => c.rows.reduce((a, r) => a + r.n, 0);
  // før planstart: intet planlagt
  assert.deepEqual(complianceBySport(weeks, -3, entryOf), { rows: [], total: { sport: 'all', n: 0, nDone: 0, min: 0, minDone: 0 } });
  // mandag i uge 1 (dag 0) er en hviledag: intet planlagt endnu, heller ikke i dag
  assert.equal(complianceBySport(weeks, 0, entryOf).total.n, 0);
  // slutningen af uge 2: alt før i dag planlagt, intet gennemført
  const c = complianceBySport(weeks, 13, entryOf);
  const planned = weeks.slice(0, 2).flatMap((w, wi) => w.days.flatMap((d, di) => (wi * 7 + di < 13 ? d : []))).filter(s => s.s !== 'rest');
  assert.equal(total(c), planned.length);
  assert.equal(c.total.n, planned.length);
  assert.equal(c.total.min, planned.reduce((a, s) => a + s.m, 0));
  assert.equal(c.total.nDone, 0);
  assert.equal(c.total.minDone, 0);
  assert.deepEqual(c.rows.map(r => r.sport), SPORT_ORDER.filter(s => planned.some(p => p.s === s)), 'rækkefølge som SPORT_ORDER, uden sportsgrene uden pas');
  // gennemfør et pas før i dag, med og uden skrevet tid
  const idx = weeks[0].days.findIndex(d => d.some(s => s.s !== 'rest'));
  const sess = weeks[0].days[idx].findIndex(s => s.s !== 'rest');
  const s0 = weeks[0].days[idx][sess];
  entries.set(`0-${idx}-${sess}`, { done: true });
  let r = complianceBySport(weeks, 13, entryOf).rows.find(x => x.sport === s0.s);
  assert.equal(r.nDone, 1);
  assert.equal(r.minDone, s0.m, 'uden skrevet tid tæller den planlagte');
  entries.set(`0-${idx}-${sess}`, { done: true, min: 17 });
  r = complianceBySport(weeks, 13, entryOf).rows.find(x => x.sport === s0.s);
  assert.equal(r.minDone, 17, 'skrevet tid slår planen');
  // i dag: et ikke-gennemført pas tæller ikke som planlagt, et gennemført gør
  const today = weeks[1].days[1].findIndex(s => s.s !== 'rest');
  const before = complianceBySport(weeks, 8, entryOf).total.n;
  entries.set(`1-1-${today}`, { done: true });
  const after = complianceBySport(weeks, 8, entryOf).total;
  assert.equal(after.n, before + 1);
  assert.equal(after.nDone, 2);
  // gennemført i fremtiden tæller ikke
  entries.set('5-0-0', { done: true });
  assert.equal(complianceBySport(weeks, 8, entryOf).total.nDone, 2);
});

test('pct: hele procent, og null uden planlagt', () => {
  assert.equal(pct(1, 3), 33);
  assert.equal(pct(5, 4), 125);
  assert.equal(pct(0, 0), null);
});

const planned = pmc(plannedDailyTss(weeks));

test('pmcView: uden logs bruges planen; med logs den faktiske serie; i dag klemmes til serien', () => {
  const actual = pmc(new Array(20).fill(60));
  const noLogs = pmcView(planned, actual, false, 10);
  assert.equal(noLogs.source, 'plan');
  assert.equal(noLogs.idx, 10);
  assert.equal(noLogs.series, planned);
  assert.deepEqual(noLogs.now, { ctl: Math.round(planned[10].ctl), atl: Math.round(planned[10].atl), tsb: Math.round(planned[10].tsb) });
  assert.equal(noLogs.delta.ctl, noLogs.now.ctl - Math.round(planned[3].ctl));
  const withLogs = pmcView(planned, actual, true, 10);
  assert.equal(withLogs.source, 'actual');
  assert.equal(withLogs.now.ctl, Math.round(actual[10].ctl));
  assert.equal(pmcView(planned, [], true, 10).source, 'plan', 'tom faktisk serie (før planstart) falder tilbage');
  assert.equal(pmcView(planned, actual, true, -4).idx, 0, 'før planstart: første dag');
  assert.equal(pmcView(planned, actual, true, -4).delta, null);
  assert.equal(pmcView(planned, actual, false, 9999).idx, planned.length - 1, 'efter løbet: sidste dag');
  assert.equal(pmcView(planned, actual, false, 6).delta, null, 'mindre end 7 dages historik');
  assert.ok(Number.isInteger(noLogs.now.ctl) && Number.isInteger(noLogs.now.atl) && Number.isInteger(noLogs.now.tsb));
});

test('sparkPoints: en polyline over de seneste dage; stigende serie stiger (y falder), og under to punkter er tom', () => {
  const series = Array.from({ length: 40 }, (_, i) => ({ ctl: i * 2 }));
  const pts = sparkPoints(series, 39, 'ctl').split(' ').map(p => p.split(',').map(Number));
  assert.equal(pts.length, 28);
  assert.deepEqual(pts[0], [0, 26]);
  assert.deepEqual(pts[27], [100, 2]);
  assert.ok(pts.every((p, i) => i === 0 || (p[0] > pts[i - 1][0] && p[1] < pts[i - 1][1])));
  assert.equal(sparkPoints(series, 5, 'ctl').split(' ').length, 6, 'kort historik: færre punkter');
  assert.equal(sparkPoints(series, 0, 'ctl'), '');
  const flat = sparkPoints([{ ctl: 5 }, { ctl: 5 }, { ctl: 5 }], 2, 'ctl', { h: 20, pad: 1 });
  assert.equal(flat, '0.0,19.0 50.0,19.0 100.0,19.0', 'flad serie deler ikke med nul');
});

test('signed: rigtigt minustegn og pluslinjer', () => {
  assert.equal(signed(3), '+3');
  assert.equal(signed(-5), '−5');
  assert.equal(signed(0), '0');
});
