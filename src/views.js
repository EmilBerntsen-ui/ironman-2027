// ---- Faner: rene hjælpefunktioner til routing, nøglepas, overholdelse og stat-kort (ingen DOM, bruges i Node og i browseren) ----
// app.js tegner HTML ud fra tallene herfra. Alt her er deterministisk, så det kan testes uden browser.

// Hash-tokens til fanerne. Bevidst ikke "settings": det ord er reserveret af claude.ai-viseren.
export const ROUTES = Object.freeze(['idag', 'kalender', 'kost', 'analyse', 'mere']);
export const DEFAULT_ROUTE = 'idag';
export const ROUTE_TITLES = Object.freeze({ idag: 'I dag', kalender: 'Kalender', kost: 'Kost', analyse: 'Analyse', mere: 'Mere' });

// '#kost' → { route: 'kost', week: null }. '#u12' (ugelink) → { route: 'kalender', week: 11 } (0-baseret ugeindeks).
// Tom eller ukendt hash → I dag. weekCount: antal uger i planen (et ugelink uden for planen er ukendt).
export function parseRoute(hash, weekCount = 0) {
  const token = String(hash || '').replace(/^#/, '').toLowerCase();
  if (ROUTES.includes(token)) return { route: token, week: null };
  const m = /^u(\d{2})$/.exec(token);
  if (m && +m[1] >= 1 && +m[1] <= weekCount) return { route: 'kalender', week: +m[1] - 1 };
  return { route: DEFAULT_ROUTE, week: null };
}

// ---- Nøglepas ----
// Løb, tests og de lange cykel- og løbeture. Hvile og almindelige pas er ikke nøglepas.
export function isKeySession(s) {
  if (!s || s.s === 'rest') return false;
  if (s.s === 'race' || /test/i.test(s.t)) return true;
  return (s.s === 'bike' || s.s === 'run') && /^lang/i.test(s.t);
}

// Første nøglepas fra dag-indeks `from` (inklusive) som endnu ikke er gennemført. isDone(wi, di, si) → bool.
// → { wi, di, si, s, dayIdx } eller null.
export function nextKeySession(weeks, from, isDone) {
  for (let d = Math.max(0, from); d < weeks.length * 7; d++) {
    const wi = Math.floor(d / 7), di = d % 7, day = weeks[wi].days[di];
    for (let si = 0; si < day.length; si++) if (isKeySession(day[si]) && !isDone(wi, di, si)) return { wi, di, si, s: day[si], dayIdx: d };
  }
  return null;
}

// ---- Overholdelse pr. sport "indtil nu" ----
export const SPORT_ORDER = Object.freeze(['swim', 'bike', 'run', 'str', 'race']);

// Planlagt = pas på dage før i dag. Gennemført = gennemførte pas til og med i dag. Et pas der er gennemført i dag tæller også som planlagt,
// så en dag der kun er halvt overstået ikke trækker procenten ned. Fremtidige pas tæller ikke. Minutter: det du har skrevet, ellers det planlagte.
// entryOf(wi, di, si) → gennemført post eller null. extras: [{ dayIdx, sport, min }] (ekstra træning, se progress.js liveExtras) til og med i dag;
// de lægges i `extra` (minutter) pr. sport og rører hverken pas, planlagte minutter eller procenten. En sport uden planlagte pas (fx 'other') får en række,
// hvis den har ekstra (ukendt sport tæller som 'other'). → { rows: [{ sport, n, nDone, min, minDone, extra }] (sportsgrene med planlagte pas eller ekstra), total }.
export function complianceBySport(weeks, todayIdx, entryOf, extras = []) {
  const zero = sport => ({ sport, n: 0, nDone: 0, min: 0, minDone: 0, extra: 0 });
  const by = Object.fromEntries(SPORT_ORDER.map(s => [s, zero(s)]));
  weeks.forEach((w, wi) => w.days.forEach((day, di) => {
    const d = wi * 7 + di;
    if (d > todayIdx) return;
    day.forEach((s, si) => {
      if (s.s === 'rest' || !by[s.s]) return;
      const e = entryOf(wi, di, si), r = by[s.s];
      if (e) { r.nDone++; r.minDone += typeof e.min === 'number' ? e.min : s.m; }
      if (d < todayIdx || e) { r.n++; r.min += s.m; }
    });
  }));
  for (const x of extras || []) {
    if (!x || !(x.dayIdx <= todayIdx) || !(x.min > 0) || typeof x.sport !== 'string') continue;
    const sport = SPORT_ORDER.includes(x.sport) ? x.sport : 'other'; // ukendt sport = andet
    (by[sport] ??= zero(sport)).extra += x.min;
  }
  const rows = [...SPORT_ORDER, 'other'].map(s => by[s]).filter(r => r && (r.n > 0 || r.extra > 0));
  const total = rows.reduce((a, r) => ({ sport: 'all', n: a.n + r.n, nDone: a.nDone + r.nDone, min: a.min + r.min, minDone: a.minDone + r.minDone, extra: a.extra + r.extra }), zero('all'));
  return { rows, total };
}
// Andel 0–100 (hele procent), eller null uden planlagt.
export const pct = (done, planned) => planned > 0 ? Math.round(done / planned * 100) : null;

// ---- Stat-kort (Fitness/Form/Træthed) ----
// planned og actual er pmc()-serier fra plan.js (én post pr. dag fra planstart). Før der er logget noget (hasLogs = false) bruges planen,
// for en faktisk serie uden logs ville bare dø ud fra startværdien. idx = i dag, klemt til serien.
// → { source: 'plan' | 'actual', series, idx, now: { ctl, atl, tsb } (afrundet), delta: ændring de seneste 7 dage eller null }
export function pmcView(planned, actual, hasLogs, todayIdx) {
  const useActual = !!hasLogs && actual.length > 0;
  const series = useActual ? actual : planned;
  const idx = Math.min(series.length - 1, Math.max(0, todayIdx));
  const at = i => ({ ctl: Math.round(series[i].ctl), atl: Math.round(series[i].atl), tsb: Math.round(series[i].tsb) });
  const now = at(idx);
  const delta = idx >= 7 ? Object.fromEntries(Object.entries(now).map(([k, v]) => [k, v - at(idx - 7)[k]])) : null;
  return { source: useActual ? 'actual' : 'plan', series, idx, now, delta };
}

// Punkter til en polyline (viewBox 0 0 w h) over de seneste `days` dage til og med idx. Tom streng under to punkter.
export function sparkPoints(series, idx, key, { days = 28, w = 100, h = 28, pad = 2 } = {}) {
  const vals = series.slice(Math.max(0, idx - days + 1), idx + 1).map(p => p[key]);
  if (vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - pad - (v - lo) / span * (h - 2 * pad)).toFixed(1)}`).join(' ');
}

// Fortegn med rigtigt minustegn: 3 → '+3', -5 → '−5', 0 → '0'.
export const signed = n => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
