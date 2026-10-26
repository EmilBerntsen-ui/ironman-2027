// ---- Fart: anbefalet pace pr. pas ud fra tre grundtal (ren logik, ingen DOM og ingen Node-API'er) ----
// Kører både i Node (tests, .ics) og i browseren (bundlet af build/bundle.mjs).
// Regler fra bundleren: én `export` pr. linje (ingen `export const a = 1, b = 2`), ingen default-eksport, ingen `export { … }`.
//
// Grundtal (forsigtige startværdier; opdateres efter testugen i uge 5):
//   run  = tærskelfart i sekunder pr. km        (5:45 /km)
//   swim = CSS i sekunder pr. 100 m             (2:10 /100 m)
//   bike = tærskelfart i km/t                   (29 km/t)
// Hver zone er et interval [lo, hi] givet som afstand fra grundtallet (OFFSETS nedenfor), så en ny grundværdi flytter alle zoner.
// Løb og svøm måles i sekunder (lavere = hurtigere), cykel i km/t (højere = hurtigere). Cykel vises kun i km/t.
//
// Et planlagt pas (plan.js) har en zone `z`, evt. en separat hovedsætzone `main`, evt. `ind` (cykel: true = kun indendørs,
// 'opt' = indendørs eller ude) og for triatlon-løb `legs` ({ swim, bike, run }). Zonerne er mærket direkte i plandata, aldrig ud fra tekst.

export const BASELINES = Object.freeze({ run: 345, swim: 130, bike: 29 });

export const INDOOR_TEXT = 'efter følelse og kadence';
export const PACE_UNIT = Object.freeze({ run: '/km', swim: '/100 m', bike: 'km/t' });
export const PACE_CMP_TEXT = Object.freeze({ faster: 'hurtigere end anbefalet', inzone: 'i zonen', slower: 'langsommere end anbefalet' });

// Afstand fra grundtallet: [lo, hi] (null = ingen nedre grænse); et tredje element 'ca' vises som "ca. midten".
//   run   i sek. pr. km:      IM-maratonfart 6:20–6:35 = +35…+50 fra 5:45, halvmaratonfart 5:55–6:05, tempo 5:50–6:00, tærskel 5:40–5:50, Z4 / 10 km 5:25–5:35
//   swim  i sek. pr. 100 m:   rolig ca. 2:25 (±5), CSS 2:08–2:12, racetempo 2:15–2:20
//   bike  i km/t:             Z1 under 22, Z2 22–25, IM-fart 24–26, sweet spot 26–27,5, tærskel 28–30
const OFFSETS = {
  run: { easy: [60, 90], z2: [60, 90], im: [35, 50], hm: [10, 20], tempo: [5, 15], thr: [-5, 5], z4: [-20, -10] },
  swim: { easy: [10, 20, 'ca'], z2: [10, 20, 'ca'], css: [-2, 2], thr: [-2, 2], im: [5, 10] },
  bike: { easy: [null, -7], z2: [-7, -4], im: [-5, -3], ss: [-3, -1.5], thr: [-1, 1] },
};
const LIMITS = { run: [150, 1200], swim: [50, 600], bike: [3, 70] }; // tilladt faktisk pace (sek./km, sek./100 m, km/t)
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// Zone → { lo, hi, approx? } for en sport, eller null (ukendt zone eller ingen fart for zonen, fx 'test').
export function zoneRange(sport, zone, base = BASELINES) {
  if (!hasOwn(OFFSETS, sport) || typeof zone !== 'string' || !hasOwn(OFFSETS[sport], zone)) return null;
  const b = base?.[sport];
  if (!isNum(b)) return null;
  const [lo, hi, approx] = OFFSETS[sport][zone];
  const round = sport === 'bike' ? v => Math.round(v * 2) / 2 : Math.round;
  const r = { lo: lo === null ? null : round(b + lo), hi: round(b + hi) };
  if (approx) r.approx = true;
  return r;
}

// Sporten som en faktisk pace gælder for: swim | bike | run, ellers null (styrke, hvile, triatlon-løb, indendørs cykel).
export function paceSport(s) {
  if (!s || s.s === 'rest' || s.s === 'str') return null;
  if (s.s === 'race') return s.legs ? null : 'run';
  if (s.s === 'bike' && s.ind === true) return null;
  return s.s === 'swim' || s.s === 'bike' || s.s === 'run' ? s.s : null;
}

// ---- Visning ----

// 330 → '5:30' (løb, svøm); 27.5 → '27,5' (cykel).
export function formatPace(sport, v) {
  if (!isNum(v)) return '';
  if (sport === 'bike') return String(Math.round(v * 10) / 10).replace('.', ',');
  const t = Math.round(v);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// { lo, hi } → '6:45–7:15 /km', 'ca. 2:25 /100 m', 'under 22 km/t', '22–25 km/t'. { unit: false } udelader enheden.
export function formatRange(sport, r, { unit = true } = {}) {
  if (!r) return '';
  const u = unit ? ` ${PACE_UNIT[sport]}` : '';
  if (r.approx) return `ca. ${formatPace(sport, (r.lo + r.hi) / 2)}${u}`;
  if (r.lo === null) return `under ${formatPace(sport, r.hi)}${u}`;
  return `${formatPace(sport, r.lo)}–${formatPace(sport, r.hi)}${u}`;
}

// Et enkelt fartstal med enhed: '5:42 /km', '27,5 km/t'.
export const formatPaceUnit = (sport, v) => `${formatPace(sport, v)} ${PACE_UNIT[sport]}`;

// Den linje der vises i arket og i .ics: 'Anbefalet: 6:45–7:15 /km · hovedsæt 5:40–5:50 /km'. null for styrke og hvile.
export function paceText(s, base = BASELINES) {
  if (!s || s.s === 'rest' || s.s === 'str') return null;
  if (s.legs) {
    const parts = [];
    for (const [sp, label] of [['swim', 'svøm'], ['bike', 'cykel'], ['run', 'løb']]) {
      const r = zoneRange(sp, s.legs[sp], base);
      if (!r) return null;
      parts.push(`${label} ${formatRange(sp, r)}`);
    }
    return 'Anbefalet: ' + parts.join(' · ');
  }
  if (s.z === 'test') return 'Anbefalet: hård og jævn indsats, notér resultatet';
  if (s.s === 'bike' && s.ind === true) return `Anbefalet: ${INDOOR_TEXT}`;
  const sp = s.s === 'race' ? 'run' : s.s;
  const main = s.main ? zoneRange(sp, s.main, base) : null;
  const first = zoneRange(sp, s.z, base);
  if (!first || (s.main && !main)) return null;
  const parts = [formatRange(sp, first)];
  if (main) parts.push(`hovedsæt ${formatRange(sp, main)}`);
  if (sp === 'bike' && s.ind === 'opt') parts.push(`indendørs: ${INDOOR_TEXT}`);
  return 'Anbefalet: ' + parts.join(' · ');
}

// Kort udgave til kortene: hovedsættets fart (ellers pasets), eller INDOOR_TEXT. null for tests og triatlon-løb.
export function paceCompact(s, base = BASELINES) {
  if (!s || s.s === 'rest' || s.s === 'str' || s.legs || s.z === 'test') return null;
  if (s.s === 'bike' && s.ind === true) return INDOOR_TEXT;
  const sp = s.s === 'race' ? 'run' : s.s;
  const r = zoneRange(sp, s.main || s.z, base);
  return r ? formatRange(sp, r) : null;
}

// ---- Indtastning og sammenligning ----

// Tolerant tekst → tal (sek./km, sek./100 m eller km/t), eller null. Accepterer '5:30', '5.30', '5,30' (= 5:30), '5.5' (= 5,5 min),
// '5' (= 5:00), '27,5', '27.5 km/t' og '5:30 /km'. Tal uden for rimelige grænser (LIMITS) afvises.
export function parsePace(sport, input) {
  if (!hasOwn(LIMITS, sport)) return null;
  const s = String(input ?? '').trim().split(/[^\d:.,\s]/)[0].replace(/\s+/g, '');
  if (!s) return null;
  let v;
  if (sport === 'bike') {
    if (!/^\d{1,2}(?:[.,]\d{1,2})?$/.test(s)) return null;
    v = Math.round(parseFloat(s.replace(',', '.')) * 10) / 10;
  } else {
    const m = /^(\d{1,2})(?:([:.,])(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    const min = Number(m[1]);
    if (m[3] === undefined) v = min * 60;
    else if (m[2] === ':' || m[3].length === 2) { // m:ss, og m.ss / m,ss
      if (m[3].length !== 2 || Number(m[3]) > 59) return null;
      v = min * 60 + Number(m[3]);
    } else v = Math.round((min + Number(m[3]) / 10) * 60); // m.t = tiendedele af et minut
  }
  const [lo, hi] = LIMITS[sport];
  return v >= lo && v <= hi ? v : null;
}

// Fart ud fra distance (m) og tid (min), fx fra Strava. null hvis tallene er ubrugelige eller urimelige.
export function derivePace(sport, dist, min) {
  if (!hasOwn(LIMITS, sport) || !isNum(dist) || !isNum(min) || dist <= 0 || min <= 0) return null;
  const v = sport === 'run' ? Math.round(min * 60 / (dist / 1000))
    : sport === 'swim' ? Math.round(min * 60 / (dist / 100))
      : Math.round(dist / 1000 / (min / 60) * 10) / 10;
  const [lo, hi] = LIMITS[sport];
  return v >= lo && v <= hi ? v : null;
}

// Faktisk pace sammenlignet med et zoneinterval: 'faster' | 'inzone' | 'slower' (løb og svøm: lavere tal er hurtigere), ellers null.
export function comparePace(sport, pace, r) {
  if (!r || !isNum(pace)) return null;
  const lo = r.lo ?? -Infinity, hi = r.hi ?? Infinity;
  if (sport === 'bike') return pace > hi ? 'faster' : pace < lo ? 'slower' : 'inzone';
  return pace < lo ? 'faster' : pace > hi ? 'slower' : 'inzone';
}

// Et gennemført pas' fart: { sport, value, derived, cmp } eller null.
//   value   entry.pace, ellers beregnet af dist og min (Strava): derived = true
//   cmp     sammenlignes med hovedsættets zone (en selvindtastet pace regnes som hovedsættets). En beregnet gennemsnitsfart
//           for et pas med hovedsæt er blandet med opvarmning og nedløb og får derfor ingen vurdering. Ingen vurdering for tests.
export function actualPace(s, e, base = BASELINES) {
  const sport = paceSport(s);
  if (!sport || !e) return null;
  const manual = isNum(e.pace) && e.pace > 0;
  const value = manual ? e.pace : derivePace(sport, e.dist, e.min);
  if (value === null) return null;
  const range = s.z === 'test' || (!manual && s.main) ? null : zoneRange(sport, s.main || s.z, base);
  return { sport, value, derived: !manual, cmp: comparePace(sport, value, range) };
}

// ---- Guide: zonetabellen i appen, regnet ud fra grundtallene ----
export function guideRows(base = BASELINES) {
  const cell = (sp, z) => formatRange(sp, zoneRange(sp, z, base), { unit: false }) || '–';
  return [
    { name: 'Z1', run: 'som Z2', swim: 'som Z2', bike: cell('bike', 'easy') },
    { name: 'Z2 (rolig)', run: cell('run', 'z2'), swim: cell('swim', 'z2'), bike: cell('bike', 'z2') },
    { name: 'IM-fart', run: cell('run', 'im'), swim: cell('swim', 'im'), bike: cell('bike', 'im') },
    { name: 'Halvmaratonfart', run: cell('run', 'hm'), swim: '–', bike: '–' },
    { name: 'Tempo', run: cell('run', 'tempo'), swim: '–', bike: '–' },
    { name: 'Sweet spot', run: '–', swim: '–', bike: cell('bike', 'ss') },
    { name: 'Tærskel / CSS', run: cell('run', 'thr'), swim: cell('swim', 'css'), bike: cell('bike', 'thr') },
    { name: 'Z4 (10 km)', run: cell('run', 'z4'), swim: '–', bike: '–' },
  ];
}
