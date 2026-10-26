// ---- Kost: dagtyper, makroer og fueling pr. pas (ren logik, ingen DOM og ingen Node-API'er) ----
// Kører både i Node (tests, .ics) og i browseren (bundlet af build/bundle.mjs).
// Regler fra bundleren: én `export` pr. linje (ingen `export const a = 1, b = 2`), ingen default-eksport, ingen `export { … }`.
//
// Tallene kommer fra docs/research/ernaering-kilder.md ("rapporten"; [K#] og § henviser til den). Rapporten regner pr. kg kropsvægt, og det gør vi også:
// kendes vægten (readWeight), vises gram, ellers g/kg. Alt er rammer og estimater, ikke recepter og ikke individuel rådgivning.
//
// Dagtype ud fra dagens planlagte pas (minutter i alt): hvile 0, let ≤ 60, moderat 61–180, lang > 180, plus opladning (2 døgn før
// IRONMAN Copenhagen og dagen før Køge Jernmand) og race (selve løbsdagene). Kulhydrat pr. dagtype: rapportens §2.1 og §12 (ACSM/AND/DC 2016 [K1],
// Team Danmark [K41a]); opladning 10–12 g/kg i 36–48 t: §6.1. Protein: 1,2–2,0 g/kg [K1], 0,3 g/kg pr. måltid [K1] (1,6 er et punkt i rammen, praktisk valg).
//
// Energi (estimat) = vægt × KCAL_BASE_PER_KG + træningsminutter × (vægt × KCAL_TRAIN_PER_KG_H) / 60, vist som ±5 % (KCAL_BAND).
//   De to konstanter er PRAKTISKE ESTIMATER, ikke målte tal, bygget på rapportens §1.2 ("Samlet formel", selv markeret som praktisk forslag):
//   - 37 kcal/kg/dag uden træning ≈ NNR 2023 PAL 1,6 (≈ 37,5 kcal/kg/d, §1.2a). Rapporten foreslår selv PAL 1,4 (≈ 33) som baseline, for at
//     undgå dobbelttælling med fritidsaktivitet; 37 kan derfor give et lidt højt estimat på lette dage.
//   - 8,5 kcal/kg pr. træningstime ≈ midten af nettotillægget (MET − 1) i §1.2b: cykling 7,0–9,0 (MET 8,0–10,0), løb 8,3 (MET 9,3), svøm 4,8–8,8.
//   ±5 % er et visningsbånd, ikke en fejlmargin: justér efter 7-dages gennemsnitsvægt og appetit (§1.2). På opladnings- og racedage vises intet
//   kcal-tal: kulhydratmålet styrer (opladning), og løbets energiunderskud kan ikke lukkes (§1.2, [K28]).
//
// Fueling pr. pas (før/under/efter) følger rapportens §3–§6. Tal i citationstegn i det godkendte design (30 g/banan, 30–50 g 30–60 min før, måltid 2–3 t før
// med 1–2 g/kg) er praktiske forslag inden for rapportens ramme (1–4 g/kg 1–4 t før [K1]), ikke selvstændige kildetal (§3.2).
// Vægten er personlig: den gemmes kun i localStorage på enheden (WEIGHT_KEY), aldrig i Gist/Artifact-databasen og aldrig i .ics.
import { RACE, TUNEUP, addDays, isoDate } from './plan.js';

export const KOST_REPORT_URL = 'https://github.com/EmilBerntsen-ui/ironman-2027/blob/main/docs/research/ernaering-kilder.md';

export const WEIGHT_KEY = 'im2027-weight-kg';
export const WEIGHT_MIN = 35;
export const WEIGHT_MAX = 200;

export const KCAL_BASE_PER_KG = 37;
export const KCAL_TRAIN_PER_KG_H = 8.5;
export const KCAL_BAND = 0.05;

export const PROTEIN_G_PER_KG = 1.6;
export const PROTEIN_RANGE = Object.freeze([1.2, 2.0]);
export const PROTEIN_MEAL_G_PER_KG = 0.3;
export const PROTEIN_MEALS = Object.freeze([4, 5]);

// carb = g/kg/døgn. kcal: om dagtypen får et kcal-estimat. when: kort forklaring til guiden.
export const DAY_TYPES = Object.freeze({
  hvile: Object.freeze({ label: 'Hvile', carb: Object.freeze([3, 5]), kcal: true, when: 'ingen træning' }),
  let: Object.freeze({ label: 'Let', carb: Object.freeze([5, 7]), kcal: true, when: 'op til 60 min' }),
  moderat: Object.freeze({ label: 'Moderat', carb: Object.freeze([6, 10]), kcal: true, when: '61 til 180 min' }),
  lang: Object.freeze({ label: 'Lang', carb: Object.freeze([8, 12]), kcal: true, when: 'over 180 min' }),
  opladning: Object.freeze({ label: 'Opladning', carb: Object.freeze([10, 12]), kcal: false, when: '2 dage før IRONMAN, dagen før Køge Jernmand' }),
  race: Object.freeze({ label: 'Race', carb: null, kcal: false, when: 'løbsdagen' }),
});

// ---- Små hjælpere ----
const step = (v, s) => Math.round(v / s) * s;
const dk = n => String(Math.round(n * 100) / 100).replace('.', ',');   // 1.2 → '1,2', 12 → '12'
const dk1 = n => n.toFixed(1).replace('.', ',');                        // 2 → '2,0'
const grp = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // 3700 → '3.700'
const span = (a, b, f = dk) => (a === b ? f(a) : `${f(a)}–${f(b)}`);
const validWeight = w => (typeof w === 'number' && Number.isFinite(w) && w >= WEIGHT_MIN && w <= WEIGHT_MAX ? w : null);

// ---- Vægt: kun lokalt ----
export const WEIGHT_ERROR = `Skriv en vægt mellem ${WEIGHT_MIN} og ${WEIGHT_MAX} kg, fx 70 eller 72,5.`;
export const WEIGHT_STORE_ERROR = 'Kunne ikke gemme vægten: browseren tillader ikke lokal lagring.';

// "72", "72,5", "72.5 kg" → 72 / 72.5 / 72.5 (én decimal), ellers null (også uden for 35–200 kg).
export function parseWeight(input) {
  const m = /^(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg)?$/i.exec(String(input ?? '').trim());
  if (!m) return null;
  const raw = parseFloat(m[1].replace(',', '.'));
  return raw >= WEIGHT_MIN && raw <= WEIGHT_MAX ? Math.round(raw * 10) / 10 : null;
}
export function readWeight(storage) {
  try { const v = storage ? storage.getItem(WEIGHT_KEY) : null; return v === null || v === undefined ? null : parseWeight(v); } catch { return null; }
}
// Tom tekst fjerner vægten. → { ok: true, kg } (kg null = fjernet) eller { ok: false, error }.
export function saveWeight(storage, input) {
  const text = String(input ?? '').trim();
  if (text === '') {
    try { if (storage) storage.removeItem(WEIGHT_KEY); return { ok: true, kg: null }; } catch { return { ok: false, error: WEIGHT_STORE_ERROR }; }
  }
  const kg = parseWeight(text);
  if (kg === null) return { ok: false, error: WEIGHT_ERROR };
  try { storage.setItem(WEIGHT_KEY, String(kg)); } catch { return { ok: false, error: WEIGHT_STORE_ERROR }; }
  return { ok: true, kg };
}

// ---- Dagtype ----
const CARB_LOAD_DAYS = new Set([addDays(RACE, -2), addDays(RACE, -1), addDays(TUNEUP, -1)].map(isoDate));
const RACE_DAYS = new Set([RACE, TUNEUP].map(isoDate));

export const dayMinutes = sessions => (sessions || []).reduce((a, s) => a + (s.s === 'rest' ? 0 : s.m || 0), 0);

// sessions = dagens pas (plan().days[i]), date = dagens dato. → 'hvile' | 'let' | 'moderat' | 'lang' | 'opladning' | 'race'
export function dayType(sessions, date) {
  const key = isoDate(date);
  if (RACE_DAYS.has(key)) return 'race';
  if (CARB_LOAD_DAYS.has(key)) return 'opladning';
  const m = dayMinutes(sessions);
  return m === 0 ? 'hvile' : m <= 60 ? 'let' : m <= 180 ? 'moderat' : 'lang';
}

// ---- Energi ----
const kcalRaw = (w, minutes) => w * KCAL_BASE_PER_KG + minutes * (w * KCAL_TRAIN_PER_KG_H) / 60;

// → { mid, lo, hi } afrundet til 50 kcal, eller null uden gyldig vægt.
export function kcalEstimate(weightKg, minutes = 0) {
  const w = validWeight(weightKg);
  if (w === null) return null;
  const k = kcalRaw(w, minutes);
  return { mid: step(k, 50), lo: step(k * (1 - KCAL_BAND), 50), hi: step(k * (1 + KCAL_BAND), 50) };
}

// Gennemsnit pr. dag for en uge (days = uge.days, start = ugens mandag). Opladnings- og racedage har intet kcal-tal og udelades.
// → { avg, days, skipped } eller null (uden vægt, eller hvis ingen dage har et estimat).
export function weekKcalAverage(days, start, weightKg) {
  const w = validWeight(weightKg);
  if (w === null) return null;
  let sum = 0, n = 0;
  days.forEach((d, i) => {
    if (!DAY_TYPES[dayType(d, addDays(start, i))].kcal) return;
    sum += kcalRaw(w, dayMinutes(d)); n++;
  });
  return n ? { avg: step(sum / n, 50), days: n, skipped: days.length - n } : null;
}

// ---- Dagens kost ----
// → { type, label, minutes, carb: { perKg, grams|null }|null, kcal: { mid, lo, hi }|null, protein, chip, text, proteinText, note }
//   chip  = 'Moderat · 3.600–3.950 kcal · 420–700 g KH' (uden vægt: 'Moderat · 6–10 g/kg KH'); text = som chip, men med "(estimat)" efter kcal.
export function dayNutrition(type, minutes = 0, weightKg = null) {
  const t = DAY_TYPES[type];
  if (!t) throw new RangeError(`ukendt dagtype: ${type}`);
  const w = validWeight(weightKg);
  const carb = t.carb ? { perKg: t.carb, grams: w === null ? null : [step(t.carb[0] * w, 10), step(t.carb[1] * w, 10)] } : null;
  const kcal = t.kcal ? kcalEstimate(w, minutes) : null;
  const protein = {
    perKg: PROTEIN_G_PER_KG, range: PROTEIN_RANGE, mealPerKg: PROTEIN_MEAL_G_PER_KG, meals: PROTEIN_MEALS,
    grams: w === null ? null : { day: step(PROTEIN_G_PER_KG * w, 5), range: PROTEIN_RANGE.map(r => Math.round(r * w)), meal: Math.round(PROTEIN_MEAL_G_PER_KG * w) },
  };
  const kcalText = kcal ? `${grp(kcal.lo)}–${grp(kcal.hi)} kcal` : null;
  const carbText = carb ? (carb.grams ? `${span(carb.grams[0], carb.grams[1], grp)} g KH` : `${span(carb.perKg[0], carb.perKg[1])} g/kg KH`) : null;
  const race = type === 'race';
  const proteinText = protein.grams
    ? `Protein ca. ${protein.grams.day} g om dagen (${span(...protein.grams.range)} g): ${span(...PROTEIN_MEALS)} måltider à ca. ${protein.grams.meal} g`
    : `Protein ${dk(PROTEIN_G_PER_KG)} g/kg om dagen (${dk1(PROTEIN_RANGE[0])}–${dk1(PROTEIN_RANGE[1])}): ${span(...PROTEIN_MEALS)} måltider à ca. ${dk(PROTEIN_MEAL_G_PER_KG)} g/kg`;
  const note = type === 'opladning' ? 'Kulhydratmålet gælder, ikke et kcal-mål: lavt fiber og fedt, og flydende kilder gør det lettere at nå det (36 til 48 t før løbet).'
    : race ? 'Løbets energiunderskud kan ikke lukkes: fokus er kulhydrat og væske. Intet nyt på løbsdagen.'
      : '';
  return {
    type, label: t.label, minutes, carb, kcal, protein, proteinText, note,
    chip: race ? 'Race · se løbsdagsplanen' : [t.label, kcalText, carbText].filter(Boolean).join(' · '),
    text: race ? 'Race: se løbsdagsplanen i guiden Kost' : [t.label, kcalText && `${kcalText} (estimat)`, carbText].filter(Boolean).join(' · '),
  };
}

// ---- Fueling pr. pas ----
const HARD_ZONES = new Set(['im', 'hm', 'tempo', 'ss', 'thr', 'z4', 'css', 'test', 'race']);
// Hårdt pas = zonen (z eller hovedsættets main) er en intensitetszone (se src/pace.js). Styrke og hvile er aldrig hårde.
export function isHardSession(s) {
  if (!s || s.s === 'rest' || s.s === 'str') return false;
  return HARD_ZONES.has(s.z) || HARD_ZONES.has(s.main);
}
const isMorning = s => /\(morgen\)/i.test(s.t || '');
const isBrick = s => s.s === 'run' && /^brick/i.test(s.t || '');
const isLong = s => s.m > 60;                                  // ACSM: fueling før pas over 60 min [K1]
const isDemanding = s => isHardSession(s) || isLong(s);
// Nøglepas (valgfri koffein): tests, løb, lange pas og hårde pas på 90 min eller mere.
const isKeySession = s => s.z === 'test' || s.s === 'race' || s.m > 150 || (isHardSession(s) && s.m >= 90);

const RACE_BIKE_RUN = 'Cykel 60–90 g kulhydrat/t (glukose + fruktose), løb 30–90 g/t efter tolerance';
const FLUID = 'Drik så du hverken taber over 2 % eller tager på';
const SODIUM = ' og tilsæt 500–700 mg natrium pr. liter';

// Kulhydrat under pas: < 75 min kun vand, 75–150 min 30–60 g/t, over 150 min 60–90 g/t (glukose + fruktose) [K1, K4]. Uafhængigt af vægt.
function carbDuring(s) {
  if (s.s === 'race' && s.legs) return RACE_BIKE_RUN;
  if (s.m < 75) return 'Kun vand';
  return s.m <= 150 ? '30–60 g kulhydrat/t' : '60–90 g/t (glukose + fruktose)';
}

// Linjen i .ics-beskrivelsen: kun pas over 75 min, kun g/t (ingen vægt), ellers null.
export function energyLine(s) {
  if (!s || s.s === 'rest' || !(s.m > 75)) return null;
  const carb = carbDuring(s);
  return `Energi undervejs: ${s.legs ? carb.charAt(0).toLowerCase() + carb.slice(1) : carb}`;
}

const grams = (lo, hi, w, unit, s) => (w === null ? '' : ` (${span(step(lo * w, s), step(hi * w, s), grp)} ${unit})`);

// day = dagens pas (inkl. hvile), idx = indeks i day, next = næste dags pas (til "hårdt pas i morgen tidlig"), weight = kg eller null.
// → { before, during, after, key, hard, morning, backToBack } (tekstlinjer på dansk), eller null for hvile.
// Tilnærmelse til "under 8 t til næste krævende pas" [K1]: et andet krævende pas senere samme dag, eller et hårdt pas ("(morgen)") første
// pas næste dag, og selve dagen er krævende (pas over 60 min eller hårdt). Brick-løbet følger straks efter cyklen og regnes ikke som en pause.
export function sessionFueling(day, idx, { next = [], weight = null } = {}) {
  const s = day[idx];
  if (!s || s.s === 'rest' || !s.m) return null;
  const w = validWeight(weight);
  const active = day.filter(x => x.s !== 'rest' && x.m > 0);
  const pos = active.indexOf(s);
  const prev = pos > 0 ? active[pos - 1] : null;
  const later = active.slice(pos + 1);
  const nextFirst = (next || []).find(x => x.s !== 'rest' && x.m > 0);
  const hard = isHardSession(s), morning = isMorning(s), key = isKeySession(s);
  const brickBefore = !!prev && prev.s === 'bike' && isBrick(s);
  const brickNext = later.length > 0 && later[0].s === 'run' && isBrick(later[0]) && s.s === 'bike';

  // Før
  const caffeine = key ? `. Valgfrit: koffein ca. 3 mg/kg${w === null ? '' : ` (ca. ${step(3 * w, 10)} mg)`} ca. 60 min før (prøv det i træning først, og undgå det sent på dagen)` : '';
  let before;
  if (s.s === 'race' && s.legs) {
    before = `Morgenmad 1–4 g/kg kulhydrat 1–4 t før${grams(1, 4, w, 'g', 10)}, lavt fedt og fiber, gerne flydende, og 5–10 mL/kg væske 2–4 t før${grams(5, 10, w, 'mL', 50)}. Intet nyt på løbsdagen`;
  } else if (brickBefore) {
    before = 'Følger lige efter cyklen: fortsæt med kulhydrat og væske som på cyklen';
  } else if (morning && !hard && s.m <= 60) {
    before = 'Kan klares fastende eller med 30 g kulhydrat (fx en banan)';
  } else if (morning && s.m <= 90 && (hard || isLong(s))) {
    before = '30–50 g kulhydrat 30–60 min før';
  } else if (hard || isLong(s)) {
    before = `Måltid 2–3 t før med 1–2 g/kg kulhydrat${grams(1, 2, w, 'g', 10)}, lidt fedt og fiber`;
  } else {
    before = 'Normal kost, ingen særlig forberedelse';
  }
  before += caffeine;

  // Under
  let during = carbDuring(s);
  if (s.s === 'race' && s.legs) during += `. ${FLUID}${SODIUM}. Intet nyt på løbsdagen`;
  else if (s.m >= 75) during += `. ${FLUID}${s.m > 120 ? SODIUM : ''}`;

  // Efter
  const lastActive = active[active.length - 1] === s;
  const nextHardMorning = lastActive && !!nextFirst && isMorning(nextFirst) && isHardSession(nextFirst);
  const dayDemanding = dayMinutes(day) > 60 || day.some(isHardSession);
  const backToBack = !brickNext && ((isDemanding(s) && later.some(isDemanding)) || (nextHardMorning && dayDemanding));
  let after;
  if (brickNext) after = 'Brick-løbet følger lige efter: restitutionsmåltidet tages efter løbet';
  else if (backToBack) {
    after = `Kort tid til næste krævende pas: 1–1,2 g/kg/t kulhydrat i 4 t${grams(1, 1.2, w, 'g/t', 1)} + 0,3 g/kg protein${w === null ? '' : ` (ca. ${Math.round(0.3 * w)} g)`}`;
  } else after = 'Måltid inden for 1–2 t med 20–40 g protein + kulhydrat';
  if (!brickNext && (s.m >= 75 || s.s === 'race')) after += '. Væske: 1,25–1,5 L pr. kg tabt';

  return { before, during, after, key, hard, morning, backToBack };
}

// ---- Guide: "Kost" i appen. Ren data; app.js tegner den (og linket til rapporten). ----
// → [{ title, table?: { head, rows }, items?: [{ b?, t }], notes?: [tekst], link?: { href, text } }]
export function kostGuide(weightKg = null) {
  const w = validWeight(weightKg);
  const types = ['hvile', 'let', 'moderat', 'lang', 'opladning'];
  const head = ['Dagtype', 'Træning', 'Kulhydrat g/kg'].concat(w === null ? [] : ['Med din vægt']);
  const rows = types.map(k => {
    const t = DAY_TYPES[k];
    return [t.label, t.when, span(t.carb[0], t.carb[1])].concat(w === null ? [] : [`${span(step(t.carb[0] * w, 10), step(t.carb[1] * w, 10), grp)} g`]);
  });
  rows.push(['Race', DAY_TYPES.race.when, 'se løbsugen'].concat(w === null ? [] : ['']));
  return [
    {
      title: 'Dag for dag',
      table: { head, rows },
      notes: [
        `Protein: ${dk(PROTEIN_G_PER_KG)} g/kg om dagen (ramme ${dk1(PROTEIN_RANGE[0])}–${dk1(PROTEIN_RANGE[1])}), fordelt på ${span(...PROTEIN_MEALS)} måltider à ca. ${dk(PROTEIN_MEAL_G_PER_KG)} g/kg.`,
        `Energi (estimat): vægt × ${KCAL_BASE_PER_KG} kcal + træningstimer × vægt × ${dk(KCAL_TRAIN_PER_KG_H)} kcal, vist som ±${Math.round(KCAL_BAND * 100)} %. De to tal er praktiske estimater bygget på rapportens afsnit 1.2 (NNR 2023 og Compendium 2024), ikke målte tal. Justér efter ugens gennemsnitsvægt og din appetit.`,
        'Kulhydrat er rammer pr. kg kropsvægt: spis i den høje ende omkring hårde og lange pas.',
      ],
    },
    {
      title: 'Før, under og efter',
      items: [
        { b: 'Før', t: 'Rolig morgen på højst 60 min: kan klares fastende eller med 30 g kulhydrat (fx en banan). Morgenintervaller: 30–50 g kulhydrat 30–60 min før. Lange eller hårde pas: måltid 2–3 t før med 1–2 g/kg kulhydrat, lidt fedt og fiber (rammen er 1–4 g/kg 1–4 t før).' },
        { b: 'Koffein', t: 'Nøglepas, tests og løb: ca. 3 mg/kg ca. 60 min før er valgfrit. Prøv det i træning først, og undgå det sent på dagen.' },
        { b: 'Under', t: 'Under 75 min: kun vand. 75 til 150 min: 30–60 g kulhydrat/t. Over 150 min: 60–90 g/t som glukose + fruktose. Gå ikke over 90 g/t, før du har tarmtrænet og tåler det.' },
        { b: 'Væske', t: `${FLUID}. På lange pas: 500–700 mg natrium pr. liter. En svedtest (vej dig før og efter) viser dit eget niveau.` },
        { b: 'Efter', t: 'Normalt: måltid inden for 1–2 t med 20–40 g protein + kulhydrat. Under 8 t til næste hårde eller lange pas (samme dag, eller hårdt pas næste morgen): 1–1,2 g/kg/t kulhydrat i 4 t + 0,3 g/kg protein. Væske: 1,25–1,5 L pr. kg tabt.' },
        { b: 'Tarmtræning', t: 'Øv det planlagte indtag i alle pas over 60 til 90 min, med de samme produkter og tidspunkter som på løbsdagen (praktisk forslag, rapportens afsnit 4.2).' },
      ],
    },
    {
      title: 'Løbsuge og løbsdag',
      items: [
        { b: 'Opladning', t: '10–12 g/kg kulhydrat i 36 til 48 t før løbet (fredag og lørdag før IRONMAN, lørdag før Køge Jernmand). Lavt fiber og fedt, og flydende kilder hjælper, for det er svært at nå med fast føde.' },
        { b: 'Løbsmorgen', t: '1–4 g/kg kulhydrat 1–4 t før (lavt fedt og fiber, gerne flydende) og 5–10 mL/kg væske 2–4 t før.' },
        { b: 'Cykel og løb', t: 'Cykel: 60–90 g kulhydrat/t som glukose + fruktose, start tidligt og fordel det jævnt. Løb: så højt som du tåler, inden for 30–90 g/t.' },
        { b: 'Væske og koffein', t: `${FLUID}, og tilsæt 500–700 mg natrium pr. liter. Koffein ca. 3 mg/kg ca. 60 min før, hvis du har prøvet det.` },
        { b: 'Intet nyt', t: 'Ingenting nyt på løbsdagen: test morgenmad, produkter og tider i de lange pas og til Køge Jernmand (13. jun.).' },
      ],
    },
    {
      title: 'Kosttilskud',
      items: [
        { b: 'D-vitamin', t: '10 µg om dagen fra oktober til april (NNR 2023). Højere doser kun efter blodprøve eller læge.' },
        { b: 'Jern', t: 'Få målt ferritin (og hæmoglobin) nu og igen i foråret. Jern kun, hvis du har mangel, og ikke lige efter hård træning.' },
        { b: 'Koffein', t: 'Forskningen bruger 3–6 mg/kg ca. 60 min før (ISSN, IOC). EFSA ser ingen sikkerhedsbekymring ved engangsdoser på op til 200 mg (ca. 3 mg/kg), og det er derfor, appen foreslår ca. 3 mg/kg.' },
        { b: 'Rene produkter', t: 'Vælg batch-testede produkter (Informed-Sport, NSF Certified for Sport). Team Danmark: 10–15 % af de mest populære kosttilskud er forurenede. Anti Doping Danmark anbefaler batch-certificering, og du har altid selv ansvaret. Foretræk mad frem for kapsler og tabletter.' },
      ],
    },
    {
      title: 'Advarselstegn og vægt',
      items: [
        { b: 'For lidt energi', t: 'Faldende præstation eller stilstand, hyppige infektioner, skader eller stressfrakturer, nedsat libido og færre morgenerektioner, dårlig søvn, nedtrykt humør, mavegener og en hvilepuls under 40 slag/min. Passer flere af dem, så spis mere (især kulhydrat omkring pas) og tal med din læge.' },
        { b: 'Vej dig ugentligt', t: 'Om morgenen efter toiletbesøg, før mad og drikke, på samme vægt. Mister du uønsket mere end 0,5 kg over 2 til 3 uger, så spis mere (praktisk regel).' },
      ],
    },
    {
      title: 'Kilder',
      notes: [
        'Alle tal og kilder står i rapporten. Det, der er praktiske forslag frem for kildetal, er markeret dér.',
        'Generel vejledning, ikke individuel lægefaglig rådgivning.',
      ],
      link: { href: KOST_REPORT_URL, text: 'Kildegrundlag og alle tal (docs/research/ernaering-kilder.md)' },
    },
  ];
}
