// ---- .ics-eksport (RFC 5545) ----
// Kører kun i Node (build og tests), bundles ikke ind i siden.
import { addDays, PH } from './plan.js';
import { isDone } from './progress.js';

const EMOJI = { swim: '🏊', bike: '🚴', run: '🏃', str: '🏋️', race: '🏁' };

// Starttider er private og ligger bevidst ikke i repoet. Uden skema bliver hvert pas en heldagsbegivenhed
// (DTSTART;VALUE=DATE). Med skema (secret CAL_SCHEDULE eller den lokale, gitignorerede cal-schedule.local.json)
// bliver pas timede begivenheder i Europe/Copenhagen. Format (ugedag man = 0):
//   { "days": [ ["HH:MM", …], …7 arrays… ], "race": "HH:MM" }
// Pas nr. 2+ en dag bruger næste tid i dagens liste, eller starter lige efter forrige pas, hvis listen er kortere.
// Et pas uden kendt starttid (og uden et timet pas før sig samme dag) forbliver en heldagsbegivenhed.
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// Validerer og normaliserer et skema. Fejlene nævner kun feltets sti, aldrig værdien (værdien er en secret i CI-loggen).
export function parseSchedule(raw) {
  const obj = x => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (!obj(raw)) throw new TypeError('skemaet skal være et objekt');
  if (!Array.isArray(raw.days) || raw.days.length !== 7) throw new TypeError('days skal være en liste med 7 lister (man–søn)');
  const days = raw.days.map((day, di) => {
    if (!Array.isArray(day)) throw new TypeError(`days[${di}] skal være en liste`);
    return day.map((t, si) => {
      if (t === null) return null;
      if (typeof t !== 'string' || !HHMM.test(t)) throw new TypeError(`days[${di}][${si}] skal være HH:MM eller null`);
      return t;
    });
  });
  let race = null;
  if (raw.race !== undefined && raw.race !== null) {
    if (typeof raw.race !== 'string' || !HHMM.test(raw.race)) throw new TypeError('race skal være HH:MM');
    race = raw.race;
  }
  return { days, race };
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Copenhagen', 'X-LIC-LOCATION:Europe/Copenhagen',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

export const escapeText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Fold til højst 75 oktetter pr. linje uden at splitte UTF-8-tegn; fortsættelseslinjer starter med ét mellemrum.
export function fold(line) {
  const enc = new TextEncoder();
  const out = []; let cur = ''; let bytes = 0; let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const dur = m => m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} t` : `${m} min`;
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
// Minutter efter midnat (≥ 1440) ruller over på næste dato i stedet for at give et ugyldigt klokkeslæt.
const stamp = (d, min) => `${ymd(addDays(d, Math.floor(min / 1440)))}T${String(Math.floor(min % 1440 / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`;

// buildIcs(weeks, now, { progress, schedule })
//   progress: Progress (ugeId → pasnøgle → Entry) eller null. Kun `done` og `min` læses (noter og RPE forlader aldrig gisten).
//             Gennemførte pas får ✅ foran titlen og "Gennemført" først i beskrivelsen. Mislykkede/udeblevne pas får intet mærke.
//   schedule: se parseSchedule(), eller null for heldagsbegivenheder.
export function buildIcs(weeks, now = new Date(), { progress = null, schedule = null } = {}) {
  const sched = schedule ? parseSchedule(schedule) : null;
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = [];
  let timed = false;
  for (const w of weeks) {
    let noted = false;
    w.days.forEach((sess, di) => {
      const date = addDays(w.start, di);
      let prevEnd = null; // minutter siden midnat for forrige timede pas samme dag
      sess.forEach((s, si) => {
        if (s.s === 'rest' || !s.m) return;
        const slot = sched ? (s.s === 'race' ? sched.race : sched.days[di][si]) : null;
        let start = null;
        if (slot) start = prevEnd === null ? toMin(slot) : Math.max(toMin(slot), prevEnd);
        else if (sched && prevEnd !== null) start = prevEnd;
        prevEnd = start === null ? null : start + s.m;

        const e = progress?.[w.id]?.[`${di}-${si}`];
        const done = isDone(e);
        const mark = done ? `Gennemført${Number.isInteger(e.min) && e.min > 0 ? ` · ${e.min} min` : ''}\n\n` : '';
        const desc = `${mark}${s.d}\n\nUge ${w.n} · ${PH[w.ph].name}${w.note && !noted ? '\n' + w.note : ''}`;
        noted = true;

        const when = start === null
          ? [`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(addDays(date, 1))}`]
          : [`DTSTART;TZID=Europe/Copenhagen:${stamp(date, start)}`,
             `DURATION:PT${Math.floor(s.m / 60) ? Math.floor(s.m / 60) + 'H' : ''}${s.m % 60 ? (s.m % 60) + 'M' : ''}`];
        if (start !== null) timed = true;
        events.push('BEGIN:VEVENT',
          `UID:${w.id}-${di}-${si}@ironman2027`,
          `DTSTAMP:${dtstamp}`,
          ...when,
          `SUMMARY:${escapeText(`${done ? '✅ ' : ''}${EMOJI[s.s]} ${s.t} (${dur(s.m)})`)}`,
          `DESCRIPTION:${escapeText(desc)}`,
          `CATEGORIES:${escapeText({ swim: 'Svømning', bike: 'Cykling', run: 'Løb', str: 'Styrke', race: 'Konkurrence' }[s.s])}`,
          // Heldagsbegivenheder må ikke gøre hele dagen "optaget" i kalenderen.
          `TRANSP:${start === null ? 'TRANSPARENT' : 'OPAQUE'}`,
          'END:VEVENT');
      });
    });
  }
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ironman-2027//Træningsplan//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Ironman 2027', 'X-WR-TIMEZONE:Europe/Copenhagen',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    ...(timed ? VTIMEZONE : []),
    ...events,
    'END:VCALENDAR',
  ];
  return L.map(fold).join('\r\n') + '\r\n';
}
