import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { plan } from '../src/plan.js';
import { buildIcs, parseSchedule } from '../src/ics.js';
import { parseAny } from '../src/progress.js';

const weeks = plan();
const now = new Date('2026-11-02T12:00:00Z');
const fixture = readFileSync(fileURLToPath(new URL('./fixtures/progress.v2.json', import.meta.url)), 'utf8');
const progress = parseAny(fixture);

// Syntetisk skema (ikke de rigtige tider): to pas samme dag, en kort dagsliste og et løb.
const SCHEDULE = { days: [['06:15'], ['06:15', '06:30'], ['13:00'], ['06:15', '18:20'], ['12:30'], ['09:45'], ['10:15']], race: '06:30' };

const unfold = ics => ics.replace(/\r\n /g, '');
const events = ics => unfold(ics).split('BEGIN:VEVENT\r\n').slice(1).map(b => 'BEGIN:VEVENT\r\n' + b.split('END:VEVENT')[0] + 'END:VEVENT');
const byUid = ics => new Map(events(ics).map(e => [/^UID:(.+)$/m.exec(e)[1], e]));
const field = (ev, name) => new RegExp(`^${name}[:;](.*)$`, 'm').exec(ev)?.[1];
const baseline = buildIcs(weeks, now);
const marked = buildIcs(weeks, now, { progress });

test('gennemført pas får ✅ og "Gennemført · 42 min" som første beskrivelseslinje', () => {
  const ev = byUid(marked).get('u01-1-0@ironman2027');
  assert.match(ev, /^SUMMARY:✅ 🏃 Roligt løb \(25 min\)$/m);
  assert.match(ev, /^DESCRIPTION:Gennemført · 42 min\\n\\n/m);
  assert.match(byUid(marked).get('u01-2-1@ironman2027'), /^DESCRIPTION:Gennemført · 90 min\\n\\n/m);
});

test('gennemført uden registreret tid får blot "Gennemført"', () => {
  const ev = byUid(marked).get('u01-1-1@ironman2027');
  assert.match(ev, /^SUMMARY:✅ 🏋️ /m);
  assert.match(ev, /^DESCRIPTION:Gennemført\\n\\n/m);
});

test('Q1: gravsten og manglende pas får intet mærke, heller ikke når de ligger i fortiden', () => {
  const base = byUid(baseline), mk = byUid(marked);
  // u01-2-0 er en gravsten i fixturen; u01-3-0 har slet ingen post. Begge er før "nu" (2. nov. 2026).
  for (const uid of ['u01-2-0@ironman2027', 'u01-3-0@ironman2027', 'u02-2-0@ironman2027']) {
    assert.equal(mk.get(uid), base.get(uid), uid);
  }
  assert.ok(!marked.includes('❌'));
  assert.ok(!marked.includes('Ikke registreret'));
});

test('mærkerne afhænger ikke af datoen: samme fremdrift giver samme mærker uanset "nu"', () => {
  const later = buildIcs(weeks, new Date('2027-09-01T12:00:00Z'), { progress });
  const strip = s => s.replace(/^DTSTAMP:.*$/gm, '');
  assert.equal(strip(later), strip(marked));
});

test('kun gennemførte pas ændres, og kun i SUMMARY og DESCRIPTION; UID-sættet er uændret', () => {
  const base = byUid(baseline), mk = byUid(marked);
  assert.deepEqual([...mk.keys()], [...base.keys()]);
  let changed = 0;
  for (const [uid, ev] of mk) {
    if (ev === base.get(uid)) continue;
    changed++;
    const strip = e => e.replace(/^(SUMMARY|DESCRIPTION):.*\r\n/gm, '');
    assert.equal(strip(ev), strip(base.get(uid)), uid);
  }
  assert.equal(changed, 4);
  assert.equal((marked.match(/^SUMMARY:✅/gm) || []).length, 4);
});

test('noter, RPE og andre felter fra fremdriften lækker aldrig ind i .ics', () => {
  assert.ok(fixture.includes('HEMMELIG-NOTE-XYZ'));
  for (const text of [marked, unfold(marked), buildIcs(weeks, now, { progress, schedule: SCHEDULE })]) {
    for (const secret of ['HEMMELIG', 'NOTE-XYZ', 'fixture1', 'fixture2', 'RPE', 'rpe', 'run:Roligt løb']) assert.ok(!text.includes(secret), secret);
  }
});

test('Strava-felterne dist og hr (fra fixturen) når aldrig .ics; kun ✅ og minutter gør', () => {
  const stravaEntry = progress.u01['2-1'];
  assert.equal(stravaEntry.src, 'strava');
  assert.equal(stravaEntry.dist, 98765, 'fixturen bærer dist');
  assert.equal(stravaEntry.hr, 187, 'fixturen bærer hr');
  for (const ics of [marked, unfold(marked), buildIcs(weeks, now, { progress, schedule: SCHEDULE })]) {
    assert.ok(!/(?<!\d)98765(?!\d)/.test(ics), 'dist');
    assert.ok(!/(?<!\d)187(?!\d)/.test(ics), 'hr');
    for (const word of ['strava', 'Strava', '12345678901', 'bpm']) assert.ok(!ics.includes(word), word);
  }
  assert.match(byUid(marked).get('u01-2-1@ironman2027'), /^DESCRIPTION:Gennemført · 90 min\\n\\n/m);
});

test('buildIcs læser kun `done` og `min` fra et pas', () => {
  const touched = new Set();
  const spy = entry => new Proxy(entry, { get(t, k, r) { if (typeof k === 'string') touched.add(k); return Reflect.get(t, k, r); } });
  const spied = Object.fromEntries(Object.entries(progress).map(([w, wk]) => [w, Object.fromEntries(Object.entries(wk).map(([k, e]) => [k, spy(e)]))]));
  assert.equal(buildIcs(weeks, now, { progress: spied }), marked);
  assert.ok(touched.size > 0);
  for (const k of touched) assert.ok(k === 'done' || k === 'min', `læste '${k}'`);
});

test('progress = null og progress = {} giver samme output som uden fremdrift', () => {
  assert.equal(buildIcs(weeks, now, { progress: null }), baseline);
  assert.equal(buildIcs(weeks, now, { progress: {} }), baseline);
});

test('standard: heldagsbegivenheder uden klokkeslæt og uden VTIMEZONE', () => {
  assert.ok(!baseline.includes('VTIMEZONE'));
  assert.ok(!baseline.includes('TZID=Europe/Copenhagen:'));
  assert.ok(!/^DURATION:/m.test(baseline));
  assert.ok(!/^DTSTART[^:]*:\d{8}T/m.test(baseline));
  const race = byUid(baseline).get('u43-6-0@ironman2027');
  assert.equal(field(race, 'DTSTART;VALUE=DATE'), '20270822');
  assert.equal(field(race, 'DTEND;VALUE=DATE'), '20270823');
  assert.equal(field(race, 'TRANSP'), 'TRANSPARENT');
  for (const ev of byUid(baseline).values()) {
    const s = /^DTSTART;VALUE=DATE:(\d{8})$/m.exec(ev)[1], e = /^DTEND;VALUE=DATE:(\d{8})$/m.exec(ev)[1];
    assert.ok(e > s);
  }
});

test('med skema: timede begivenheder i Europe/Copenhagen, VTIMEZONE med, løb efter eget klokkeslæt', () => {
  const ics = buildIcs(weeks, now, { schedule: SCHEDULE });
  const ev = byUid(ics);
  assert.equal((ics.match(/BEGIN:VTIMEZONE/g) || []).length, 1);
  assert.match(ics, /^TZID:Europe\/Copenhagen$/m);
  assert.ok(!/DTSTART;VALUE=DATE/.test(ics));
  assert.equal(field(ev.get('u43-6-0@ironman2027'), 'DTSTART;TZID=Europe/Copenhagen'), '20270822T063000');
  assert.equal(field(ev.get('u43-6-0@ironman2027'), 'DURATION'), 'PT12H');
  assert.equal(field(ev.get('u01-5-0@ironman2027'), 'DTSTART;TZID=Europe/Copenhagen'), '20261031T094500');
  assert.equal(field(ev.get('u01-2-0@ironman2027'), 'TRANSP'), 'OPAQUE');
});

test('med skema: pas nr. 2 starter på sin tid, men aldrig før forrige pas er slut; manglende tid = lige efter forrige', () => {
  const ev = byUid(buildIcs(weeks, now, { schedule: SCHEDULE }));
  // tirsdag u01: løb 25 min fra 06:15 (slut 06:40), styrke ønsket 06:30 → 06:40
  assert.equal(field(ev.get('u01-1-0@ironman2027'), 'DTSTART;TZID=Europe/Copenhagen'), '20261027T061500');
  assert.equal(field(ev.get('u01-1-1@ironman2027'), 'DTSTART;TZID=Europe/Copenhagen'), '20261027T064000');
  // onsdag har kun én tid i skemaet: pas nr. 2 (25 min) følger lige efter pas nr. 1 (25 min fra 13:00)
  assert.equal(field(ev.get('u01-2-1@ironman2027'), 'DTSTART;TZID=Europe/Copenhagen'), '20261028T132500');
  // lørdag u01: brick-løb (pas 2) har ingen tid og følger lige efter 60 min cykling fra 09:45
  assert.equal(field(ev.get('u01-5-1@ironman2027'), 'DTSTART;TZID=Europe/Copenhagen'), '20261031T104500');
});

test('med skema: pas uden kendt starttid bliver heldagsbegivenhed (og VTIMEZONE kun hvis noget er timet)', () => {
  const partial = { days: [[], [], [], [], [], [], []], race: null };
  const none = buildIcs(weeks, now, { schedule: partial });
  assert.equal(none, baseline);
  const some = buildIcs(weeks, now, { schedule: { ...partial, days: [[], ['06:00'], [], [], [], [], []] } });
  const ev = byUid(some);
  assert.match(ev.get('u01-1-0@ironman2027'), /^DTSTART;TZID=Europe\/Copenhagen:20261027T060000$/m);
  assert.match(ev.get('u01-3-0@ironman2027'), /^DTSTART;VALUE=DATE:20261029$/m);
  assert.ok(some.includes('BEGIN:VTIMEZONE'));
});

test('med skema: et pas der løber over midnat får gyldigt klokkeslæt på næste dato', () => {
  const late = { days: [['23:30'], ['23:30'], ['23:30'], ['23:30'], ['23:30'], ['23:30'], ['23:30']], race: '23:30' };
  const ev = byUid(buildIcs(weeks, now, { schedule: late }));
  // u01 lørdag: rolig tur fra 23:30 (60 min), brick-løbet følger lige efter → starter 24:30 = søndag 00:30
  assert.equal(field(ev.get('u01-5-1@ironman2027'), 'DTSTART;TZID=Europe/Copenhagen'), '20261101T003000');
  assert.ok(!/T24\d\d\d\d/.test(buildIcs(weeks, now, { schedule: late })));
});

test('timede begivenheder med mærker: UID, DTSTART og DURATION er uændrede ift. uden mærker', () => {
  const a = byUid(buildIcs(weeks, now, { schedule: SCHEDULE })), b = byUid(buildIcs(weeks, now, { schedule: SCHEDULE, progress }));
  for (const [uid, ev] of b) for (const f of ['DTSTART;TZID=Europe/Copenhagen', 'DURATION', 'TRANSP']) assert.equal(field(ev, f), field(a.get(uid), f), uid + f);
});

test('gyldig .ics i alle varianter: CRLF, ≤ 75 oktetter, unikke UID, balancerede blokke, kalenderhoved', () => {
  const variants = { baseline, marked, timed: buildIcs(weeks, now, { schedule: SCHEDULE }), both: buildIcs(weeks, now, { schedule: SCHEDULE, progress }) };
  for (const [name, ics] of Object.entries(variants)) {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'), name);
    assert.ok(!/[^\r]\n/.test(ics) && !/\r[^\n]/.test(ics), `${name}: kun CRLF`);
    for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `${name}: ${line}`);
    const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map(m => m[1]);
    assert.equal(uids.length, (ics.match(/^BEGIN:VEVENT$/gm) || []).length, name);
    assert.equal(new Set(uids).size, uids.length, `${name}: unikke UID`);
    for (const block of ['VEVENT', 'VTIMEZONE', 'DAYLIGHT', 'STANDARD']) {
      assert.equal((ics.match(new RegExp(`^BEGIN:${block}$`, 'gm')) || []).length, (ics.match(new RegExp(`^END:${block}$`, 'gm')) || []).length, `${name}: ${block}`);
    }
    assert.match(ics, /^REFRESH-INTERVAL;VALUE=DURATION:PT6H$/m);
    assert.match(ics, /^X-PUBLISHED-TTL:PT6H$/m);
    assert.equal(ics.includes('BEGIN:VTIMEZONE'), name === 'timed' || name === 'both', `${name}: VTIMEZONE kun når der er timede begivenheder`);
  }
  assert.equal([...byUid(variants.timed).keys()].join(), [...byUid(baseline).keys()].join(), 'samme UID-sæt med og uden skema');
});

test('parseSchedule: afviser ugyldige skemaer, og fejlen citerer aldrig værdien', () => {
  const ok = { days: [['06:00'], [], [], [], [], [], []], race: '07:30' };
  assert.deepEqual(parseSchedule(ok), ok);
  assert.deepEqual(parseSchedule({ days: [[null, '06:00'], [], [], [], [], [], []] }), { days: [[null, '06:00'], [], [], [], [], [], []], race: null });
  const bad = [
    null, [], 'x', {}, { days: [] }, { days: Array(6).fill([]) }, { days: Array(8).fill([]) },
    { days: [...Array(6).fill([]), 'HEMMELIG'] },
    { days: [['6:00'], [], [], [], [], [], []] }, { days: [['24:00'], [], [], [], [], [], []] }, { days: [['06:60'], [], [], [], [], [], []] }, { days: [[600], [], [], [], [], [], []] },
    { days: Array(7).fill([]), race: 'HEMMELIG' }, { days: Array(7).fill([]), race: 730 },
  ];
  for (const b of bad) assert.throws(() => parseSchedule(b), e => e instanceof TypeError && !/HEMMELIG|6:00|24:00|06:60/.test(e.message), JSON.stringify(b));
  assert.throws(() => buildIcs(weeks, now, { schedule: { days: [] } }), TypeError);
});
