// ---- Plan-råd: tommelfingerregler ud fra dine logs (ren logik, ingen DOM og ingen Node-API'er) ----
// Kører både i Node (tests) og i browseren (bundlet af build/bundle.mjs).
// Regler fra bundleren: én `export` pr. linje (ingen `export const a = 1, b = 2`), ingen default-eksport, ingen `export { … }`.
//
// Rådene er tommelfingerregler, ikke individuel rådgivning, og planen ændrer sig aldrig: kortene foreslår kun, hvad du kan gøre i dag.
// adviceFor() får planen, fremdriften (store.snapshot()), dagens indeks og de to PMC-serier og giver højst `limit` (standard 2) råd, alvorligste først.
//
//   missed  (info)  ≥ 2 planlagte pas ikke logget de seneste 7 hele dage (i dag tæller ikke, den er ikke slut). Ved ≥ 3 inkl. et langt pas foreslås det
//                   flyttet til den næste frie dag (kun hvilepas) i ugen, ellers springes det over. Kræver at der overhovedet er logget noget:
//                   uden logs er "sprunget over" bare et tegn på, at loggen ikke bruges (eller endnu ikke er hentet).
//   rpe     (warn)  to logs med RPE ≥ 9 inden for de seneste 4 dage (i dag og de 3 før), eller de seneste ≥ 3 rolige pas i træk (Z1–Z2 uden
//                   hovedsæt, i planens rækkefølge) alle logget med RPE ≥ 7 (det nyeste inden for 7 dage).
//   form-warn (warn) / form-stop (stop)  faktisk TSB < −25 / < −35. Kun med logs på mindst 10 forskellige dage, for en faktisk PMC med få logs
//                   er mest startværdi.
//   volume  (info)  de seneste 7 dage (i dag og de 6 før): logget minutter > planlagt × 1,2. Kræver ≥ 120 planlagte minutter i vinduet.
//   easy    (info)  i dag er en rolig dag eller hviledag (kun hvile, styrke og rolige pas, ingen lange ture), og de 3 dage før i dag er alle logget (≥ 1 pas eller ekstra).
// Et logget pas tæller de skrevne minutter, ellers de planlagte. Ekstra træning (progress.js) tæller som logs med minutter og RPE.
import { isDone, liveExtras } from './progress.js';

export const ADVICE_MAX = 2;
export const ADVICE_LEVELS = Object.freeze({ stop: 3, warn: 2, info: 1 });

const DAY_NAMES = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const DAY_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const EASY_ZONES = new Set(['easy', 'z2']);

const dur = m => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} t` : `${m} min`);
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Et planlagt pas er langt, hvis det er en lang cykel- eller løbetur ("Lang cykeltur", "Langt løb", "Rolig lang tur").
export const isLongSession = s => !!s && (s.s === 'bike' || s.s === 'run') && /\blang/i.test(String(s.t));
// Et roligt pas: zonen er Z1–Z2 uden hovedsæt (intervaller har et hovedsæt), og det er ikke et løb.
export const isEasySession = s => !!s && s.s !== 'rest' && s.s !== 'race' && !s.main && EASY_ZONES.has(s.z);
// En rolig dag: kun hvile, styrke og rolige pas, og ingen lange ture (en tom dag tæller også). En lang Z2-tur er rolig i fart, men ikke en restitutionsdag.
export const isEasyDay = sessions => (sessions || []).every(s => s.s === 'rest' || s.s === 'str' || (isEasySession(s) && !isLongSession(s)));

// Dag for dag til og med i dag: planlagte pas (med deres gennemførte post) og logs (pas og ekstra) med minutter og RPE.
function collectDays(weeks, progress, todayIdx) {
  const extrasByDay = new Map();
  for (const x of liveExtras(progress)) {
    if (x.dayIdx < 0 || x.dayIdx > todayIdx) continue;
    (extrasByDay.get(x.dayIdx) ?? extrasByDay.set(x.dayIdx, []).get(x.dayIdx)).push(x);
  }
  const days = [];
  for (let d = 0; d <= todayIdx; d++) {
    const w = weeks[Math.floor(d / 7)], di = d % 7, week = (progress && progress[w.id]) || {};
    const planned = w.days[di].map((s, si) => {
      const e = week[`${di}-${si}`];
      return { s, si, e: isDone(e) ? e : null };
    });
    const logs = [];
    for (const p of planned) if (p.e) logs.push({ kind: 'plan', s: p.s, min: Number.isInteger(p.e.min) ? p.e.min : p.s.m, rpe: Number.isInteger(p.e.rpe) ? p.e.rpe : null });
    for (const x of extrasByDay.get(d) || []) logs.push({ kind: 'extra', sport: x.e.sport, min: x.e.min, rpe: Number.isInteger(x.e.rpe) ? x.e.rpe : null });
    days.push({ d, wi: Math.floor(d / 7), di, planned, logs });
  }
  return days;
}

// ---- Reglerne: hver giver et råd eller null ----

function missedRule(days, todayIdx, weeks) {
  if (!days.some(x => x.logs.length)) return null; // uden logs ved vi intet om, hvad der er sprunget over
  const from = Math.max(0, todayIdx - 7);
  const last7 = days.slice(from, todayIdx); // de 7 hele dage før i dag
  const plannedAll = [], missed = [];
  for (const day of last7) for (const p of day.planned) {
    if (p.s.s === 'rest' || !(p.s.m > 0)) continue;
    plannedAll.push(p);
    if (!p.e) missed.push({ ...p, d: day.d, di: day.di });
  }
  if (missed.length < 2) return null;
  const list = missed.slice(-3).map(m => `${DAY_SHORT[m.di]} ${m.s.t}`).join(', ');
  const reason = `${missed.length} af ${plannedAll.length} planlagte pas de seneste 7 dage er ikke logget (${list}${missed.length > 3 ? ', …' : ''}).`;
  let text = 'Spring de sprungne pas over, og fortsæt med dagens pas som planlagt. Du skal ikke indhente dem.';
  const long = [...missed].reverse().find(m => isLongSession(m.s));
  if (missed.length >= 3 && long) {
    // Næste frie dag i denne uge: en dag efter i dag uden planlagte pas (kun hvile) og uden logs. Ellers springes det lange pas over.
    const today = days[todayIdx], weekEnd = today.wi * 7 + 6;
    let free = null;
    for (let d = todayIdx + 1; d <= weekEnd && free === null; d++) {
      const w = weeks[Math.floor(d / 7)];
      if (w.days[d % 7].every(s => s.s === 'rest' || !(s.m > 0))) free = d % 7;
    }
    text = free !== null
      ? `Flyt ${long.s.t} (${dur(long.s.m)}) til ${DAY_NAMES[free]}, den næste frie dag i ugen, hvis du er frisk. Ellers spring det over. De andre sprungne pas indhenter du ikke.`
      : `Der er ingen fri dag tilbage i ugen til ${long.s.t} (${dur(long.s.m)}): spring det over, og fortsæt med dagens pas. Du skal ikke indhente det.`;
  }
  return { level: 'info', title: 'Fortsæt planen – indhent ikke', text, rule: 'missed', reason };
}

function rpeRule(days, todayIdx) {
  const reasons = [];
  // To hårde logs (RPE 9–10) inden for de seneste 4 dage
  const hard = days.slice(Math.max(0, todayIdx - 3)).flatMap(day => day.logs.filter(l => l.rpe !== null && l.rpe >= 9).map(l => ({ d: day.d, rpe: l.rpe })));
  if (hard.length >= 2) reasons.push(`${hard.length} logs med RPE ${hard.map(h => h.rpe).join(' og ')} de seneste 4 dage.`);
  // Tre rolige pas i træk logget med RPE ≥ 7: det trailing stykke af de rolige pas (et pas i dag der endnu ikke er logget, venter)
  const easy = [];
  for (const day of days) for (const p of day.planned) {
    if (!isEasySession(p.s) || !(p.s.m > 0)) continue;
    if (day.d === todayIdx && !p.e) continue;
    easy.push({ d: day.d, rpe: p.e && Number.isInteger(p.e.rpe) ? p.e.rpe : null });
  }
  let run = 0;
  for (let i = easy.length - 1; i >= 0 && easy[i].rpe !== null && easy[i].rpe >= 7; i--) run++;
  if (run >= 3 && easy[easy.length - 1].d >= todayIdx - 6) {
    reasons.push(`De seneste ${run} rolige pas i træk er logget med RPE ${easy.slice(-run).map(e => e.rpe).join(', ')}.`);
  }
  if (!reasons.length) return null;
  return { level: 'warn', title: 'Gør dagens intervaller rolige (Z2) eller tag en ekstra hviledag', text: 'Du har haft hård belastning på det seneste. Kør dagens intervaller som rolig Z2, eller tag en ekstra hviledag. Spring ikke fremad i planen.', rule: 'rpe', reason: reasons.join(' ') };
}

function formRule(days, todayIdx, actualPmc, plannedPmc) {
  if (!Array.isArray(actualPmc) || !actualPmc.length) return null;
  if (days.filter(x => x.logs.length).length < 10) return null; // for få logs: den faktiske PMC er mest startværdi
  const now = actualPmc[Math.min(actualPmc.length - 1, todayIdx)];
  if (!now || !Number.isFinite(now.tsb) || !(now.tsb < -25)) return null;
  const plannedNow = Array.isArray(plannedPmc) && plannedPmc[Math.min(plannedPmc.length - 1, todayIdx)];
  const tsb = Math.round(now.tsb);
  const reason = `Form (TSB) er ${signed(tsb)}${plannedNow && Number.isFinite(plannedNow.tsb) ? `; planen regner med ${signed(Math.round(plannedNow.tsb))}` : ''}. Grænserne er −25 og −35.`;
  return now.tsb < -35
    ? { level: 'stop', title: 'Tag hviledag i dag', text: 'Du er meget træt. Tag en hviledag i dag, også selv om der står et pas i planen. Planen indhenter du ikke bagefter.', rule: 'form-stop', reason }
    : { level: 'warn', title: 'Høj træthed: gør dagens hårde pas roligt', text: 'Du er træt. Gør dagens hårde pas roligt (Z2), og hold igen, til formen er tilbage over −25.', rule: 'form-warn', reason };
}

function volumeRule(days, todayIdx) {
  const last7 = days.slice(Math.max(0, todayIdx - 6)); // i dag og de 6 før
  let planned = 0, logged = 0;
  for (const day of last7) {
    for (const p of day.planned) if (p.s.s !== 'rest') planned += p.s.m || 0;
    for (const l of day.logs) logged += l.min;
  }
  if (planned < 120 || !(logged > planned * 1.2)) return null;
  const over = Math.round((logged / planned - 1) * 100);
  return {
    level: 'info', title: 'Du træner mere end planen – hold de rolige pas rolige',
    text: 'Du træner mere end planen. Det ekstra gør de rolige pas hårdere, end de skal være: hold dem rolige, og lad de hårde pas være de eneste hårde.',
    rule: 'volume', reason: `Logget ${dur(logged)} mod planlagt ${dur(planned)} de seneste 7 dage (+${over} %, grænsen er +20 %).`,
  };
}

function easyRule(days, todayIdx, weeks) {
  const today = days[todayIdx];
  if (!isEasyDay(weeks[today.wi].days[today.di])) return null;
  let run = 0;
  for (let d = todayIdx - 1; d >= 0 && days[d].logs.length; d--) run++;
  if (run < 3) return null;
  const rest = weeks[today.wi].days[today.di].every(s => s.s === 'rest');
  return {
    level: 'info', title: rest ? 'Hviledag i dag – brug den' : 'Rolig dag i dag – hold den rolig',
    text: rest ? 'Hold hviledagen fri, og lad kroppen tage imod træningen.' : 'Dagens pas er roligt. Hold det roligt, og lad kroppen tage imod træningen.',
    rule: 'easy', reason: `Du har trænet ${plural(run, 'dag', 'dage')} i træk uden hvile (${days.slice(todayIdx - run, todayIdx).map(x => DAY_SHORT[x.di]).join(', ')}).`,
  };
}

// → [{ level: 'info'|'warn'|'stop', title, text, rule, reason }], højst `limit`, alvorligste først (ved lige alvor: form, rpe, missed, volume, easy).
//   rule = regelens id (bruges til at skjule kortet for i dag), reason = tallene bag rådet. dismissed = regel-id'er der ikke skal med (og ikke fylder).
//   weeks = plan(), progress = store.snapshot(), actualPmc/plannedPmc = pmc()-serier (én post pr. dag fra planstart). Uden for planen: [].
export function adviceFor({ weeks, progress, todayIdx, actualPmc = [], plannedPmc = [], dismissed = [], limit = ADVICE_MAX } = {}) {
  if (!Array.isArray(weeks) || !weeks.length || !Number.isInteger(todayIdx) || todayIdx < 0 || todayIdx >= weeks.length * 7) return [];
  const days = collectDays(weeks, progress, todayIdx);
  const hits = [
    formRule(days, todayIdx, actualPmc, plannedPmc),
    rpeRule(days, todayIdx),
    missedRule(days, todayIdx, weeks),
    volumeRule(days, todayIdx),
    easyRule(days, todayIdx, weeks),
  ].filter(Boolean);
  const skip = new Set(dismissed);
  return hits
    .filter(a => !skip.has(a.rule))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ADVICE_LEVELS[y.a.level] - ADVICE_LEVELS[x.a.level] || x.i - y.i)
    .map(x => x.a)
    .slice(0, Math.max(0, limit));
}
