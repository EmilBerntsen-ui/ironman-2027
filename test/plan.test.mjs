import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, START, RACE, TUNEUP, addDays, isoDate, tss } from '../src/plan.js';
import { buildIcs, fold } from '../src/ics.js';

const weeks = plan();
const sessions = weeks.flatMap(w => w.days.flatMap((d, di) => d.map((s, si) => ({ w, di, si, s, date: isoDate(addDays(w.start, di)) }))));

test('43 uger, uge 1 starter mandag 26. okt. 2026', () => {
  assert.equal(weeks.length, 43);
  assert.equal(isoDate(weeks[0].start), '2026-10-26');
  assert.equal(weeks[0].start.getDay(), 1);
  assert.equal(isoDate(START), '2026-10-26');
  assert.deepEqual(weeks.map(w => w.id), weeks.map((_, i) => 'u' + String(i + 1).padStart(2, '0')));
  assert.equal(isoDate(weeks[42].start), '2027-08-16');
});

test('IRONMAN-løbet ligger søndag 22. aug. 2027 (uge 43)', () => {
  const r = sessions.filter(x => x.s.s === 'race' && x.s.t === 'IRONMAN');
  assert.equal(r.length, 1);
  assert.equal(r[0].date, '2027-08-22');
  assert.equal(r[0].w.n, 43);
  assert.equal(isoDate(RACE), '2027-08-22');
});

test('Køge Jernmand ligger søndag 13. jun. 2027 (uge 33)', () => {
  const r = sessions.filter(x => x.s.s === 'race' && x.s.t.includes('Køge'));
  assert.equal(r.length, 1);
  assert.equal(r[0].date, '2027-06-13');
  assert.equal(r[0].w.n, 33);
  assert.equal(isoDate(TUNEUP), '2027-06-13');
  assert.ok(!JSON.stringify(weeks).includes('Helsingør'));
});

test('hver uge har 7 dage, og hver dag har mindst ét pas', () => {
  for (const w of weeks) {
    assert.equal(w.days.length, 7, `uge ${w.n}`);
    w.days.forEach((d, i) => assert.ok(d.length > 0, `uge ${w.n} dag ${i}`));
  }
});

test('alle pas uden for hvile har minutter > 0 og TSS > 0', () => {
  for (const { w, di, s } of sessions) {
    if (s.s === 'rest') { assert.equal(s.m, 0); continue; }
    assert.ok(s.m > 0, `uge ${w.n} dag ${di}: ${s.t}`);
    assert.ok(tss(s) > 0, `TSS uge ${w.n}: ${s.t}`);
  }
});

const hours = w => w.total / 60;

test('ugentlige timer ligger mellem 3,5 og 17, uge 1 mellem 4 og 5 og uge 10 højst 9', () => {
  for (const w of weeks) assert.ok(hours(w) >= 3.5 && hours(w) <= 17, `uge ${w.n}: ${hours(w).toFixed(1)} t`);
  assert.ok(hours(weeks[0]) >= 4 && hours(weeks[0]) <= 5, `uge 1: ${hours(weeks[0]).toFixed(1)} t`);
  assert.ok(hours(weeks[9]) <= 9, `uge 10: ${hours(weeks[9]).toFixed(1)} t`);
});

test('milder start: timer pr. uge i uge 1–11 følger det godkendte forløb', () => {
  const want = { 1: [4, 5], 2: [4.7, 5.3], 3: [5.5, 6], 4: [6.2, 6.8], 5: [5, 6], 6: [7.2, 7.8], 7: [4.7, 5.3], 8: [4.7, 5.3], 9: [7.7, 8.3], 10: [8.2, 8.8], 11: [5, 6] };
  for (const [n, [lo, hi]] of Object.entries(want)) assert.ok(hours(weeks[n - 1]) >= lo && hours(weeks[n - 1]) <= hi, `uge ${n}: ${hours(weeks[n - 1]).toFixed(2)} t, ventet ${lo}–${hi}`);
  assert.deepEqual(weeks.slice(0, 11).map(w => w.k), ['start', 'build', 'build', 'build', 'rec', 'build', 'exam', 'exam', 'build', 'build', 'rec']);
});

test('grundform 2 (uge 12–19): belastningsugerne ligger på 8,5–10,5 t, uden spring op i uge 20', () => {
  for (const n of [12, 13, 16, 17, 18]) assert.ok(hours(weeks[n - 1]) >= 8.5 && hours(weeks[n - 1]) <= 10.5, `uge ${n}: ${hours(weeks[n - 1]).toFixed(2)} t`);
  assert.ok(hours(weeks[13]) < hours(weeks[12]), 'ugen med 10 km-løbet er lettere');
  for (const n of [15, 19]) assert.ok(hours(weeks[n - 1]) < 7, `uge ${n} er en let uge`);
});

test('ingen spring i belastningen: uge 2–19 højst 16 % over de foregående belastningsuger (de seneste 5 uger)', () => {
  const loaded = w => w.k === 'start' || w.k === 'build';
  for (let i = 1; i < 19; i++) {
    if (!loaded(weeks[i])) continue;
    const prev = weeks.slice(Math.max(0, i - 5), i).filter(loaded).map(w => w.total);
    assert.ok(weeks[i].total <= 1.16 * Math.max(...prev), `uge ${i + 1}: ${weeks[i].total} min mod ${Math.max(...prev)} min`);
  }
});

test('uge 1 er en blid startuge uden tests; uge 5 er testugen med løbe-, svømme- og cykeltest', () => {
  const titles = w => w.days.flat().map(s => s.t);
  const tests = w => w.days.flat().filter(s => s.z === 'test').map(s => s.t);
  assert.deepEqual(tests(weeks[0]), []);
  assert.ok(!titles(weeks[0]).some(t => /test/i.test(t)));
  assert.deepEqual(tests(weeks[4]), ['Løbetest', 'Svømmetest (morgen)', 'Cykeltest']);
  for (const n of [2, 3, 4, 6, 7, 8, 9, 10]) assert.deepEqual(tests(weeks[n - 1]), [], `uge ${n}`);
  // uge 1: kun rolige Z1–Z2-pas, styrke som introduktion
  for (const s of weeks[0].days.flat()) {
    assert.ok(['rest', 'str', 'easy', 'z2'].includes(s.z), `${s.t}: ${s.z}`);
    assert.ok(!s.main, s.t);
  }
  assert.equal(weeks[0].days[0][0].s, 'rest', 'mandag er stadig hviledag');
  assert.equal(weeks[0].days[3].length, 1);
  assert.equal(weeks[0].days[3][0].s, 'swim');
  assert.equal(weeks[0].days[4][0].ind, true, 'fredagens spinner er rolig og indendørs');
  assert.equal(weeks[0].days[5][1].t, 'Brick-løb');
  assert.equal(weeks[0].days[5][1].m, 10);
  assert.equal(weeks[0].days[6][0].m, 40);
  assert.match(weeks[0].note, /uden tests/);
  assert.match(weeks[0].note, /Tilmeld dig IRONMAN Copenhagen/);
  assert.match(weeks[4].note, /^Testuge: notér resultaterne og send dem, så opdateres pace-zonerne/);
});

test('uge 2–4 trapper op fra roligt med strides til de første lette intervaller', () => {
  const [w2, w3, w4] = [weeks[1], weeks[2], weeks[3]];
  assert.equal(w2.days[1][0].t, 'Roligt løb med strides');
  assert.ok(w2.days.flat().every(s => !s.main), 'uge 2 har ingen intervaller');
  assert.equal(w3.days[1][0].t, 'Løbeintervaller');
  assert.equal(w3.days[1][0].main, 'z4');
  assert.match(w3.days[1][0].d, /5×1 min Z4/);
  assert.equal(w3.days[4][0].main, 'ss');
  assert.equal(w4.days[1][0].main, 'z4');
  assert.match(w4.days[1][0].d, /5×2 min Z4/);
});

test('uge 20–43 er uændrede: minutter og antal pas pr. uge', () => {
  const minutes = [745, 775, 805, 430, 805, 835, 590, 430, 845, 875, 345, 375, 900, 550, 320, 900, 890, 915, 525, 915, 900, 660, 500, 935];
  const counts = [11, 11, 11, 7, 11, 11, 10, 7, 11, 11, 6, 7, 11, 7, 5, 11, 11, 11, 7, 11, 11, 10, 10, 8];
  assert.deepEqual(weeks.slice(19).map(w => w.total), minutes);
  assert.deepEqual(weeks.slice(19).map(w => w.days.flat().filter(s => s.s !== 'rest').length), counts);
});

test('.ics: én VEVENT pr. pas, CRLF, foldet ≤ 75 oktetter, stabile UID', () => {
  const ics = buildIcs(weeks, new Date('2026-10-22T12:00:00Z'));
  const n = sessions.filter(x => x.s.s !== 'rest').length;
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, n);
  assert.ok(!/[^\r]\n/.test(ics), 'kun CRLF');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map(m => m[1]);
  assert.equal(new Set(uids).size, uids.length);
  assert.ok(uids.includes('u43-6-0@ironman2027'));
  assert.match(ics, /DTSTART;VALUE=DATE:20270822/); // uden skema er pas heldagsbegivenheder (starttider er private, se test/ics-marks.test.mjs)
  assert.equal(fold('a'.repeat(80)), 'a'.repeat(75) + '\r\n ' + 'a'.repeat(5));
});

test('.ics: hver DESCRIPTION har en "Anbefalet"-linje med fart (undtagen styrke), og den ligger efter pasets tekst', () => {
  const ics = buildIcs(weeks, new Date('2026-10-22T12:00:00Z')).replace(/\r\n /g, '');
  const events = ics.split('BEGIN:VEVENT\r\n').slice(1);
  assert.equal(events.length, sessions.filter(x => x.s.s !== 'rest').length);
  const unesc = t => t.replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');
  let withPace = 0;
  sessions.filter(x => x.s.s !== 'rest').forEach(({ w, di, si, s }) => {
    const ev = events.find(e => e.startsWith(`UID:${w.id}-${di}-${si}@ironman2027`));
    const desc = unesc(/^DESCRIPTION:(.*)$/m.exec(ev)[1]);
    if (s.s === 'str') { assert.ok(!desc.includes('Anbefalet'), `${w.id} ${s.t}`); return; }
    withPace++;
    const line = desc.split('\n').find(l => l.startsWith('Anbefalet: '));
    assert.ok(line, `${w.id}-${di}-${si} ${s.t}`);
    assert.ok(desc.indexOf(s.d) < desc.indexOf(line), 'efter pasets tekst');
    assert.ok(desc.indexOf(line) < desc.indexOf(`Uge ${w.n} · `), 'før ugelinjen');
  });
  assert.ok(withPace > 300);
  const run = unesc(/^DESCRIPTION:(.*)$/m.exec(events.find(e => e.startsWith('UID:u06-1-0@')))[1]);
  assert.match(run, /\nAnbefalet: 6:45–7:15 \/km · hovedsæt 5:25–5:35 \/km\n/);
});
