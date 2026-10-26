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

test('ugentlige timer ligger mellem 4 og 17', () => {
  for (const w of weeks) {
    const h = w.total / 60;
    assert.ok(h >= 4 && h <= 17, `uge ${w.n}: ${h.toFixed(1)} t`);
  }
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
