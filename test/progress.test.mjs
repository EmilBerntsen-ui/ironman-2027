import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT, SCHEMA, EPOCH, META_FILE, GIST_DESCRIPTION,
  normalizeEntry, isDone, sessionSig, stampEntry, mergeEntry, mergeWeek, mergeProgress, diffWeeks,
  weekFileName, serializeWeek, parseWeekFile, parseAny, toExport, stableStringify,
} from '../src/progress.js';

const T1 = '2026-11-24T06:58:01.123Z';
const T2 = '2026-11-24T07:10:00.000Z';
const done = (updatedAt, extra = {}) => ({ done: true, updatedAt, ...extra });
const tomb = (updatedAt, dev) => ({ done: false, updatedAt, ...(dev ? { dev } : {}) });

// Deterministisk PRNG til tilfældige merge-tests
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('konstanter', () => {
  assert.equal(FORMAT, 'ironman-2027-progress');
  assert.equal(SCHEMA, 2);
  assert.equal(EPOCH, '1970-01-01T00:00:00.000Z');
  assert.equal(META_FILE, '_ironman-2027.json');
  assert.ok(GIST_DESCRIPTION.startsWith('Ironman 2027'));
});

test('v1-konvertering: true, {at,…} og tomt objekt', () => {
  assert.deepEqual(normalizeEntry(true), { done: true, updatedAt: EPOCH });
  assert.deepEqual(
    normalizeEntry({ at: '2026-11-02T06:30:00Z', min: 42, rpe: 7, note: 'Tung i benene' }),
    { done: true, updatedAt: '2026-11-02T06:30:00.000Z', at: '2026-11-02T06:30:00.000Z', min: 42, rpe: 7, note: 'Tung i benene' });
  assert.deepEqual(normalizeEntry({}), { done: true, updatedAt: EPOCH }); // gammelt format brugte {} for "gennemført"
  assert.equal(normalizeEntry(false), null);
  assert.equal(normalizeEntry(null), null);
  assert.equal(normalizeEntry('ja'), null);
  assert.equal(normalizeEntry([]), null);
  assert.equal(normalizeEntry({ done: 'ja' }), null);
});

test('v2-pas og gravsten bevares; gravsten mister alle detaljer', () => {
  const e = { done: true, updatedAt: T1, dev: 'k3f9a2c1', at: '2026-11-24T06:57:40.000Z', min: 42, rpe: 7, note: 'Tung', src: 'strava', extId: '123', sig: 'run:Løb' };
  assert.deepEqual(normalizeEntry(e), e);
  assert.deepEqual(normalizeEntry({ done: false, updatedAt: T1, dev: 'abc', min: 30, note: 'x', at: T1 }), { done: false, updatedAt: T1, dev: 'abc' });
  assert.ok(isDone(e) && !isDone(tomb(T1)) && !isDone(null) && !isDone(undefined));
});

test('validering: grænser, enum, længder og tidsstempler', () => {
  const n = raw => normalizeEntry({ done: true, updatedAt: T1, ...raw });
  assert.equal(n({ min: 900 }).min, 900);
  assert.equal(n({ min: 0 }).min, 0);
  for (const bad of [901, -1, 4.5, '42', NaN, null]) assert.ok(!('min' in n({ min: bad })), `min ${bad}`);
  assert.equal(n({ rpe: 1 }).rpe, 1);
  assert.equal(n({ rpe: 10 }).rpe, 10);
  for (const bad of [0, 11, 5.5, '7']) assert.ok(!('rpe' in n({ rpe: bad })), `rpe ${bad}`);
  assert.equal(n({ note: 'x'.repeat(1500) }).note.length, 1000);
  assert.ok(!('note' in n({ note: 42 })));
  assert.ok(!('note' in n({ note: '' })));
  assert.equal(n({ note: 'a'.repeat(999) + '😀' }).note, 'a'.repeat(999)); // klipper ikke et surrogatpar over
  assert.equal(n({ src: 'strava' }).src, 'strava');
  assert.equal(n({ src: 'manual' }).src, 'manual');
  assert.ok(!('src' in n({ src: 'garmin' })));
  assert.equal(n({ extId: 'x'.repeat(64) }).extId.length, 64);
  assert.ok(!('extId' in n({ extId: 'x'.repeat(65) })));
  assert.ok(!('extId' in n({ extId: 12345 })));
  assert.equal(n({ sig: 's'.repeat(120) }).sig.length, 120);
  assert.ok(!('sig' in n({ sig: 's'.repeat(121) })));
  assert.equal(n({ dev: 'd'.repeat(16) }).dev.length, 16);
  assert.ok(!('dev' in n({ dev: 'd'.repeat(17) })));
  assert.equal(n({ updatedAt: 'ikke en dato' }).updatedAt, EPOCH);
  assert.equal(n({ updatedAt: undefined }).updatedAt, EPOCH);
  assert.equal(n({ updatedAt: '1969-01-01T00:00:00Z' }).updatedAt, EPOCH);
  assert.equal(n({ at: 'tull' }).at, EPOCH);
  assert.equal(n({ updatedAt: '2026-11-24T08:58:01.123+02:00' }).updatedAt, T1); // kanonisk UTC, så strengsammenligning virker
});

test('Strava-felterne dist (meter, heltal 0..1.000.000) og hr (slag/min, heltal 30..250) valideres; andre værdier droppes feltet', () => {
  const n = raw => normalizeEntry({ done: true, updatedAt: T1, ...raw });
  assert.equal(n({ dist: 0 }).dist, 0);
  assert.equal(n({ dist: 10234 }).dist, 10234);
  assert.equal(n({ dist: 1000000 }).dist, 1000000);
  for (const bad of [-1, 1000001, 10.5, '10234', NaN, null, Infinity]) assert.ok(!('dist' in n({ dist: bad })), `dist ${bad}`);
  assert.equal(n({ hr: 30 }).hr, 30);
  assert.equal(n({ hr: 148 }).hr, 148);
  assert.equal(n({ hr: 250 }).hr, 250);
  for (const bad of [29, 251, 0, 148.5, '148', NaN, null]) assert.ok(!('hr' in n({ hr: bad })), `hr ${bad}`);
  // fast punkt: en gyldig Strava-post normaliseres til sig selv, og serialiseringen bevarer felterne
  const e = { done: true, updatedAt: T1, dev: 'strava', at: '2026-11-24T06:57:40.000Z', min: 42, src: 'strava', extId: '12345678901', sig: 'run:Løb', dist: 10234, hr: 148 };
  assert.deepEqual(normalizeEntry(e), e);
  const file = serializeWeek('u05', { '1-0': e });
  assert.deepEqual(parseWeekFile('u05.json', file).week['1-0'], e);
  // felterne er kendte, så de tæller ikke med blandt de højst 16 ukendte felter
  const many = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, i]));
  assert.equal(normalizeEntry({ done: true, updatedAt: T1, dist: 5, hr: 99, ...many }).k15, 15);
});

test('pace (faktisk fart: sek./km, sek./100 m eller km/t) er et tal 1..3600 med højst én decimal; andre værdier droppes feltet', () => {
  const n = raw => normalizeEntry({ done: true, updatedAt: T1, ...raw });
  assert.equal(n({ pace: 330 }).pace, 330);        // løb 5:30 /km
  assert.equal(n({ pace: 130 }).pace, 130);        // svøm 2:10 /100 m
  assert.equal(n({ pace: 27.5 }).pace, 27.5);      // cykel km/t
  assert.equal(n({ pace: 27.54 }).pace, 27.5, 'rundes til én decimal');
  assert.equal(n({ pace: 1 }).pace, 1);
  assert.equal(n({ pace: 3600 }).pace, 3600);
  for (const bad of [0, 0.4, -5, 3600.1, 3601, '330', '5:30', NaN, Infinity, -Infinity, null, true, [330], { v: 330 }]) assert.ok(!('pace' in n({ pace: bad })), `pace ${JSON.stringify(bad)}`);
  // idempotent og stabil gennem serialisering
  const e = { done: true, updatedAt: T1, dev: 'abc', at: '2026-11-24T06:57:40.000Z', min: 42, pace: 330, sig: 'run:Roligt løb' };
  assert.deepEqual(normalizeEntry(e), e);
  assert.deepEqual(normalizeEntry(normalizeEntry({ ...e, pace: 27.54 })), normalizeEntry({ ...e, pace: 27.54 }));
  assert.deepEqual(parseWeekFile('u05.json', serializeWeek('u05', { '1-0': e })).week['1-0'], e);
  assert.deepEqual(parseAny(JSON.stringify(toExport({ u05: { '1-0': e } }, T1))).u05['1-0'], e);
  // kendt felt: tæller ikke med blandt de højst 16 ukendte felter
  const many = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, i]));
  assert.equal(n({ pace: 330, ...many }).k15, 15);
});

test('pace er merge-kompatibelt: hele posten vinder, så en post uden pace (gammel) og en med pace flettes uden at miste noget', () => {
  const old = { done: true, updatedAt: T1, dev: 'a', min: 40 };               // uden pace (før denne version)
  const neu = { done: true, updatedAt: T2, dev: 'b', min: 40, pace: 345 };
  assert.deepEqual(mergeEntry(normalizeEntry(old), normalizeEntry(neu)), neu);
  assert.deepEqual(mergeEntry(normalizeEntry(neu), normalizeEntry(old)), neu);
  const edited = stampEntry({ done: true, min: 41 }, normalizeEntry(neu), { now: T2, dev: 'b' }); // en redigering uden pace fjerner den (hele detaljesættet erstattes)
  assert.ok(!('pace' in edited));
  assert.equal(stampEntry({ done: true, min: 41, pace: 340 }, normalizeEntry(neu), { now: T2, dev: 'b' }).pace, 340);
  assert.deepEqual(mergeWeek({ '1-0': normalizeEntry(old) }, { '1-0': normalizeEntry(neu), '2-0': normalizeEntry(old) }), { '1-0': neu, '2-0': normalizeEntry(old) });
  // v2-filer uden pace er stadig læsbare, og en ældre klient (uden KNOWN-pace) ville bevare feltet som ukendt primitiv
  assert.ok(!('pace' in parseWeekFile('u01.json', serializeWeek('u01', { '1-0': normalizeEntry(old) })).week['1-0']));
});

test('gravsten mister også dist, hr og pace', () => {
  assert.deepEqual(normalizeEntry({ done: false, updatedAt: T1, dev: 'abc', pace: 330 }), { done: false, updatedAt: T1, dev: 'abc' });
  assert.deepEqual(stampEntry(null, done(T1, { pace: 330 }), { now: T2, dev: 'abc' }), { done: false, updatedAt: T2, dev: 'abc' });
  assert.deepEqual(stampEntry({ done: false, pace: 330 }, null, { now: T2, dev: 'abc' }), { done: false, updatedAt: T2, dev: 'abc' });
});

test('gravsten mister også dist og hr', () => {
  assert.deepEqual(normalizeEntry({ done: false, updatedAt: T1, dev: 'abc', dist: 5000, hr: 150, src: 'strava', extId: '1' }), { done: false, updatedAt: T1, dev: 'abc' });
  assert.deepEqual(stampEntry(null, done(T1, { dist: 5000, hr: 150 }), { now: T2, dev: 'abc' }), { done: false, updatedAt: T2, dev: 'abc' });
  assert.deepEqual(stampEntry({ done: false, dist: 5000, hr: 150 }, null, { now: T2, dev: 'abc' }), { done: false, updatedAt: T2, dev: 'abc' });
});

test('ukendte felter overlever kun som korte primitiver', () => {
  const e = normalizeEntry(JSON.parse(JSON.stringify({ done: true, updatedAt: T1, kcal: 512, tag: 'rolig', flag: true, lang: 'x'.repeat(201), obj: { a: 1 }, arr: [1], nul: null, 'ugyldig nøgle': 1 }).replace(/}$/, ',"__proto__":"x"}')));
  assert.equal(e.kcal, 512);
  assert.equal(e.tag, 'rolig');
  assert.equal(e.flag, true);
  for (const k of ['lang', 'obj', 'arr', 'nul', 'ugyldig nøgle']) assert.ok(!(k in e), k);
  assert.equal(Object.getPrototypeOf(e), Object.prototype);
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
  assert.equal(Object.keys(normalizeEntry({ done: true, updatedAt: T1, ...many })).filter(k => /^k\d+$/.test(k)).length, 16);
});

test('sessionSig', () => {
  assert.equal(sessionSig({ s: 'run', t: 'Løbeintervaller' }), 'run:Løbeintervaller');
});

test('merge: højeste updatedAt vinder, hele posten følger vinderen', () => {
  const a = done(T1, { min: 30, kcal: 1 }), b = done(T2, { min: 45 });
  assert.equal(mergeEntry(a, b), b);
  assert.equal(mergeEntry(b, a), b);
  assert.ok(!('kcal' in mergeEntry(a, b)), 'felter blandes ikke på tværs af poster');
  assert.equal(mergeEntry(a, null), a);
  assert.equal(mergeEntry(undefined, a), a);
  assert.equal(mergeEntry(null, undefined), null);
});

test('merge: uafgjort på updatedAt afgøres af dev, derefter af stableStringify', () => {
  const lo = done(T1, { dev: 'aaaa', min: 10 }), hi = done(T1, { dev: 'bbbb', min: 20 });
  assert.equal(mergeEntry(lo, hi), hi);
  assert.equal(mergeEntry(hi, lo), hi);
  const x = done(T1, { dev: 'same', min: 10 }), y = done(T1, { dev: 'same', min: 20 });
  const winner = stableStringify(x) > stableStringify(y) ? x : y;
  assert.equal(mergeEntry(x, y), winner);
  assert.equal(mergeEntry(y, x), winner);
  assert.equal(mergeEntry(done(T1), done(T1, { dev: 'a' })).dev, 'a'); // manglende dev taber til en dev
});

test('gravsten slår ældre gennemført; nyere gennemført slår gravsten; et manglende pas taber til gravsten', () => {
  assert.equal(mergeEntry(done(T1, { min: 30 }), tomb(T2)).done, false);
  assert.equal(mergeEntry(tomb(T1), done(T2)).done, true);
  assert.deepEqual(mergeWeek({ '1-0': done(T1) }, { '1-0': tomb(T2) }), { '1-0': tomb(T2) });
  assert.deepEqual(mergeWeek({}, { '1-0': tomb(T1) }), { '1-0': tomb(T1) });
});

test('mergeWeek og mergeProgress returnerer nye objekter og rører ikke input', () => {
  const a = { u01: { '0-0': done(T1) } }, b = { u01: { '1-0': done(T2) }, u02: { '2-1': done(T1) } };
  const snap = JSON.stringify([a, b]);
  const m = mergeProgress(a, b);
  assert.deepEqual(Object.keys(m).sort(), ['u01', 'u02']);
  assert.deepEqual(Object.keys(m.u01).sort(), ['0-0', '1-0']);
  assert.notEqual(m, a); assert.notEqual(m.u01, a.u01);
  assert.equal(JSON.stringify([a, b]), snap);
  assert.deepEqual(mergeProgress(undefined, b), b);
  assert.deepEqual(mergeWeek(undefined, undefined), {});
});

test('merge er kommutativ, associativ og idempotent (flere hundrede tilfældige)', () => {
  const rand = rng(2027);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const times = [EPOCH, T1, T1, T2, '2026-12-01T00:00:00.000Z']; // gentagelser giver uafgjorte
  const devs = [undefined, 'aaaa', 'bbbb'];
  const entry = () => {
    if (rand() < 0.3) return tomb(pick(times), pick(devs));
    const e = done(pick(times), { min: Math.floor(rand() * 3) * 15 });
    const d = pick(devs); if (d) e.dev = d;
    if (rand() < 0.4) e.note = pick(['', 'a', 'b']) || undefined;
    return JSON.parse(JSON.stringify(e));
  };
  const progress = () => {
    const p = {};
    for (const w of ['u01', 'u02', 'u03']) {
      if (rand() < 0.3) continue;
      p[w] = {};
      for (const k of ['0-0', '1-0', '1-1', '6-2']) if (rand() < 0.6) p[w][k] = entry();
    }
    return p;
  };
  for (let i = 0; i < 400; i++) {
    const a = progress(), b = progress(), c = progress();
    assert.deepEqual(mergeProgress(a, b), mergeProgress(b, a), 'kommutativ');
    assert.deepEqual(mergeProgress(mergeProgress(a, b), c), mergeProgress(a, mergeProgress(b, c)), 'associativ');
    assert.deepEqual(mergeProgress(a, a), a, 'idempotent');
    assert.deepEqual(mergeProgress(mergeProgress(a, b), b), mergeProgress(a, b), 'idempotent på resultatet');
    const ea = entry(), eb = entry(), ec = entry();
    assert.deepEqual(mergeEntry(ea, eb), mergeEntry(eb, ea));
    assert.deepEqual(mergeEntry(mergeEntry(ea, eb), ec), mergeEntry(ea, mergeEntry(eb, ec)));
  }
});

test('diffWeeks: uger hvor lokalt har noget som fjernt mangler eller har ældre', () => {
  const local = { u01: { '0-0': done(T2) }, u02: { '0-0': done(T1) }, u03: { '0-0': done(T1) }, u04: {} };
  const remote = { u01: { '0-0': done(T1) }, u02: { '0-0': done(T1) }, u05: { '0-0': done(T1) } };
  assert.deepEqual(diffWeeks(local, remote), ['u01', 'u03']);
  assert.deepEqual(diffWeeks(remote, local), ['u05']);
  assert.deepEqual(diffWeeks(local, mergeProgress(local, remote)), []);
  assert.deepEqual(diffWeeks({}, remote), []);
  assert.deepEqual(diffWeeks(local, undefined), ['u01', 'u02', 'u03']);
});

test('stampEntry: stempler, beholder at, og slår altid versionen den bygger på (skæv ur)', () => {
  const now = new Date('2026-11-24T06:58:01.123Z');
  const first = stampEntry({ done: true, min: 42, rpe: 7, note: 'Tung' }, undefined, { now, dev: 'k3f9a2c1' });
  assert.deepEqual(first, { done: true, updatedAt: T1, dev: 'k3f9a2c1', at: T1, min: 42, rpe: 7, note: 'Tung' });
  // redigering 5 min senere beholder første `at` og erstatter detaljerne
  const later = stampEntry({ done: true, min: 50 }, first, { now: new Date('2026-11-24T07:03:00.000Z'), dev: 'k3f9a2c1' });
  assert.equal(later.at, T1);
  assert.equal(later.updatedAt, '2026-11-24T07:03:00.000Z');
  assert.equal(later.min, 50);
  assert.ok(!('rpe' in later) && !('note' in later));
  // uret går 1 time bagud: updatedAt = prev + 1 ms, og redigeringen vinder stadig
  const skewed = stampEntry({ done: true, min: 55 }, later, { now: new Date('2026-11-24T06:03:00.000Z'), dev: 'zzzz' });
  assert.equal(skewed.updatedAt, '2026-11-24T07:03:00.001Z');
  assert.equal(mergeEntry(later, skewed), skewed);
  // gravsten, og at nyt gennemført efter gravsten får ny `at`
  const t = stampEntry(null, skewed, { now: new Date('2026-11-24T06:00:00Z'), dev: 'zzzz' });
  assert.deepEqual(t, { done: false, updatedAt: '2026-11-24T07:03:00.002Z', dev: 'zzzz' });
  assert.deepEqual(stampEntry({ done: false }, skewed, { now, dev: 'zzzz' }).done, false);
  const again = stampEntry({ done: true }, t, { now: new Date('2026-11-25T06:00:00Z'), dev: 'zzzz' });
  assert.equal(again.at, '2026-11-25T06:00:00.000Z');
  assert.equal(mergeEntry(t, again), again);
  // patch kan ikke overstyre stemplerne; ugyldige felter droppes; `at` fra patch bruges kun uden tidligere
  const forged = stampEntry({ done: true, updatedAt: '2999-01-01T00:00:00Z', dev: 'hack', at: '2026-11-20T10:00:00Z', min: 5000 }, undefined, { now, dev: 'real' });
  assert.equal(forged.updatedAt, T1); assert.equal(forged.dev, 'real'); assert.equal(forged.at, '2026-11-20T10:00:00.000Z');
  assert.ok(!('min' in forged));
  // legacy v1-post som prev: redigering slår den
  const legacy = normalizeEntry({ at: '2026-11-02T06:30:00Z', min: 40 });
  const edit = stampEntry({ done: true, min: 41 }, legacy, { now: new Date('2026-10-01T00:00:00Z'), dev: 'd' });
  assert.equal(edit.at, '2026-11-02T06:30:00.000Z');
  assert.equal(mergeEntry(legacy, edit), edit);
  assert.throws(() => stampEntry(null, undefined, { now: 'ikke en dato', dev: 'd' }), TypeError);
});

test('parseAny: v2-eksport, rå v2-Progress, v2 localStorage-blob og v2-ugefil', () => {
  const prog = { u01: { '0-0': done(T1, { dev: 'd', min: 30 }), '1-0': tomb(T2, 'd') } };
  assert.deepEqual(parseAny(toExport(prog, new Date(T2))), prog);
  assert.deepEqual(parseAny(JSON.stringify(toExport(prog, new Date(T2)))), prog, 'tekst som input');
  assert.deepEqual(parseAny(prog), prog);
  assert.deepEqual(parseAny({ v: 2, weeks: prog }), prog);
  assert.deepEqual(parseAny(JSON.parse(serializeWeek('u01', prog.u01))), prog);
  assert.deepEqual(parseAny({ format: FORMAT, v: 2, kind: 'meta', start: '2026-10-26' }), {});
  assert.deepEqual(parseAny({}), {});
});

test('parseAny: v1 localStorage-blob konverteres', () => {
  const blob = { u01: { '0-0': true, '1-0': { at: '2026-11-02T06:30:00Z', min: 42, rpe: 7, note: 'ok' } }, u02: { '2-0': true } };
  assert.deepEqual(parseAny(JSON.stringify(blob)), {
    u01: {
      '0-0': { done: true, updatedAt: EPOCH },
      '1-0': { done: true, updatedAt: '2026-11-02T06:30:00.000Z', at: '2026-11-02T06:30:00.000Z', min: 42, rpe: 7, note: 'ok' },
    },
    u02: { '2-0': { done: true, updatedAt: EPOCH } },
  });
});

test('parseAny: Artifact-dokumenter (v1 {done,updated} og v2 {v,sessions}), som map og som liste', () => {
  const v1 = { done: { '0-0': true, '3-1': { at: '2026-11-05T05:00:00Z', min: 60 } }, updated: '2026-11-05T05:01:00Z' };
  const v2 = { v: 2, sessions: { '0-0': done(T1, { dev: 'd' }) }, updated: T1 };
  const want = {
    u01: { '0-0': { done: true, updatedAt: EPOCH }, '3-1': { done: true, updatedAt: '2026-11-05T05:00:00.000Z', at: '2026-11-05T05:00:00.000Z', min: 60 } },
    u02: { '0-0': done(T1, { dev: 'd' }) },
  };
  assert.deepEqual(parseAny({ u01: v1, u02: v2 }), want);
  assert.deepEqual(parseAny([{ id: 'u01', data: v1 }, { id: 'u02', data: v2 }]), want);
  assert.deepEqual(parseAny([{ id: 'u01', ...v1 }, { id: 'u02', ...v2 }]), want);
  assert.deepEqual(parseAny({ docs: [{ id: 'u01', data: v1 }, { id: 'u02', data: v2 }] }), want);
  assert.deepEqual(parseAny({ u01: { done: {}, updated: T1 } }), {}, 'tomme uger udelades');
});

test('parseAny: ugyldige pas og nøgler filtreres, ukendt format kaster', () => {
  const p = parseAny(JSON.parse('{"u01":{"0-0":true,"9-9":true,"x":true,"1-0":"ja","2-0":{"done":"nej"}},"u1":{"0-0":true},"__proto__":{"0-0":true}}'));
  assert.deepEqual(Object.keys(p), ['u01']);
  assert.deepEqual(Object.keys(p.u01), ['0-0']);
  assert.throws(() => parseAny('ikke json'), SyntaxError);
  assert.throws(() => parseAny(42), TypeError);
  assert.throws(() => parseAny(null), TypeError);
  assert.throws(() => parseAny({ foo: 1 }), TypeError);
  assert.throws(() => parseAny([{ id: 'x' }]), TypeError);
  assert.throws(() => parseAny({ format: 'andet', v: 2, weeks: {} }), TypeError);
  assert.throws(() => parseAny({ format: FORMAT, v: 3, weeks: {} }), TypeError);
});

test('toExport: nøgler sorteret, tomme uger udeladt, ISO-tidsstempel', () => {
  const x = toExport({ u02: { '1-0': done(T1), '0-0': done(T2) }, u01: {}, u03: undefined }, new Date(T2));
  assert.deepEqual(x, { format: FORMAT, v: 2, kind: 'export', exportedAt: T2, weeks: { u02: { '0-0': done(T2), '1-0': done(T1) } } });
  assert.deepEqual(Object.keys(x.weeks.u02), ['0-0', '1-0']);
});

test('weekFileName, serializeWeek og parseWeekFile: format, stabilitet og tur-retur', () => {
  assert.equal(weekFileName('u05'), 'u05.json');
  assert.throws(() => weekFileName('u5'), TypeError);
  assert.throws(() => weekFileName('../x'), TypeError);
  const week = {
    '1-1': tomb('2026-11-24T07:10:00.000Z', 'k3f9a2c1'),
    '1-0': { sig: 'run:Løbeintervaller', rpe: 7, note: 'Tung', min: 42, dev: 'k3f9a2c1', at: '2026-11-24T06:57:40.000Z', done: true, updatedAt: T1 },
  };
  const text = serializeWeek('u05', week);
  assert.equal(text, [
    '{"format":"ironman-2027-progress","v":2,"week":"u05","sessions":{',
    '"1-0":{"at":"2026-11-24T06:57:40.000Z","dev":"k3f9a2c1","done":true,"min":42,"note":"Tung","rpe":7,"sig":"run:Løbeintervaller","updatedAt":"2026-11-24T06:58:01.123Z"},',
    '"1-1":{"dev":"k3f9a2c1","done":false,"updatedAt":"2026-11-24T07:10:00.000Z"}',
    '}}',
  ].join('\n'));
  // uafhængig af indsættelsesrækkefølge
  const reordered = { '1-0': Object.fromEntries(Object.entries(week['1-0']).reverse()), '1-1': week['1-1'] };
  assert.equal(serializeWeek('u05', reordered), text);
  // tur-retur
  const parsed = parseWeekFile('u05.json', text);
  assert.deepEqual(parsed, { weekId: 'u05', week });
  assert.equal(serializeWeek(parsed.weekId, parsed.week), text);
  assert.doesNotThrow(() => JSON.parse(text));
  assert.equal(serializeWeek('u06', {}), '{"format":"ironman-2027-progress","v":2,"week":"u06","sessions":{}}');
  assert.deepEqual(parseWeekFile('u06.json', serializeWeek('u06', {})), { weekId: 'u06', week: {} });
});

test('parseWeekFile afviser forkert navn, format, version, uge og ødelagt JSON', () => {
  const ok = serializeWeek('u05', { '1-0': done(T1) });
  assert.ok(parseWeekFile('u05.json', ok));
  assert.equal(parseWeekFile(META_FILE, ok), null);
  assert.equal(parseWeekFile('u5.json', ok), null);
  assert.equal(parseWeekFile('u05.txt', ok), null);
  assert.equal(parseWeekFile('u06.json', ok), null, 'week-feltet skal passe til filnavnet');
  assert.equal(parseWeekFile('u05.json', '{ikke json'), null);
  assert.equal(parseWeekFile('u05.json', ''), null);
  assert.equal(parseWeekFile('u05.json', undefined), null);
  assert.equal(parseWeekFile('u05.json', JSON.stringify({ format: 'andet', v: 2, sessions: {} })), null);
  assert.equal(parseWeekFile('u05.json', JSON.stringify({ format: FORMAT, v: 1, sessions: {} })), null);
  assert.equal(parseWeekFile('u05.json', JSON.stringify({ format: FORMAT, v: 2 })), null);
  // fjerne bytes valideres: ugyldige pas og nøgler droppes
  const dirty = JSON.stringify({ format: FORMAT, v: 2, week: 'u05', sessions: { '1-0': { done: true, updatedAt: T1, min: 9999, note: 'x'.repeat(2000) }, 'bad': { done: true }, '2-0': 'x' } });
  const { week } = parseWeekFile('u05.json', dirty);
  assert.deepEqual(Object.keys(week), ['1-0']);
  assert.ok(!('min' in week['1-0']));
  assert.equal(week['1-0'].note.length, 1000);
});

test('stableStringify: sorterede nøgler, ingen mellemrum, undefined udelades', () => {
  assert.equal(stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } }), '{"a":{"d":[3,{"x":2,"y":1}]},"b":1}');
  assert.equal(stableStringify([undefined, () => 1]), '[null,null]');
  assert.equal(stableStringify('æøå'), '"æøå"');
  assert.equal(stableStringify(null), 'null');
  assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
});
