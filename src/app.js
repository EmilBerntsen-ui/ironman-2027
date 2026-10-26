// ---- App: fem faner (I dag, Kalender, Kost, Analyse, Mere), detaljevisning, PMC-graf og gemning ----
// Forudsætter at disse er inlinet før denne fil: plan.js (plan, PH, START, RACE, TUNEUP, addDays, isoDate, tss, extraTss, pmc, plannedDailyTss),
// progress.js (isDone, isExtra, liveExtras, newExtraKey, sessionSig), pace.js (anbefalet og faktisk fart), nutrition.js (kost), views.js (routing, nøglepas, overholdelse, stat-kort),
// store/local.js (LocalStore), settings.js (mountSettings) og BUILD fra bundleren.
// ArtifactDbStore (kun artifact-målet) og GistStore (kun site-målet) findes kun i deres eget mål: brug typeof-vagt.
const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const DAYS_LONG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const MON = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const KIND = { start: 'Startuge', build: 'Opbygning', rec: 'Let uge + test', exam: 'Eksamen', race70: 'Køge Jernmand', post70: 'Restitution', taper: 'Nedtrapning', race: 'Raceuge' };
const SPORT = { swim: 'Svømning', bike: 'Cykling', run: 'Løb', str: 'Styrke', race: 'Konkurrence', rest: 'Hvile', other: 'Andet' };
const SPORTS = ['swim', 'bike', 'run', 'str', 'race'];
const DAY_MS = 864e5;

const weeks = plan();
const NDAYS = weeks.length * 7;
// I dag regnes om, når siden bliver synlig igen (en åben fane eller installeret app kan ligge i baggrunden i dagevis): se rollDay().
let today, todayIdx, nowIdx;
function setToday() {
  today = new Date(); today.setHours(0, 0, 0, 0);
  todayIdx = Math.round((today - START) / DAY_MS); // dag-indeks fra START (kan være negativt)
  nowIdx = Math.min(weeks.length - 1, Math.max(0, Math.floor(todayIdx / 7)));
}
setToday();
let selIdx = nowIdx;

const $ = id => document.getElementById(id);
const fmt = d => `${d.getDate()}. ${MON[d.getMonth()]}`;
const hrs = m => (Math.round(m / 6) / 10).toLocaleString('da-DK', { minimumFractionDigits: 1 });
const dur = m => m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} t` : `${m} min`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dayIdxOf = (wi, di) => wi * 7 + di;
const byKey = {}; // "u01-2-0" -> { w, wi, di, si, s }
weeks.forEach((w, wi) => w.days.forEach((d, di) => d.forEach((s, si) => { byKey[`${w.id}-${di}-${si}`] = { w, wi, di, si, s }; })));

// ---- State: store.snapshot() = { weekId: { "<d>-<s>": Entry } } (skema v2, se progress.js). Kun gennemførte pas tæller. ----
let state = {};
const entry = (wk, key) => { const e = state[wk] && state[wk][key]; return isDone(e) ? e : null; };

// ---- Ekstra træning: uplanlagte pas under nøglen x-<id> i ugens dokument (progress.js, docs/architecture.md §3.10) ----
// Ligger i planens dage (ekstra uden for planen vises ikke) og huskes pr. tilstand: store.snapshot() er et nyt objekt efter hver ændring.
let exMemo = { s: null, list: [], byDay: new Map(), byWeek: new Map() };
function extrasMemo() {
  if (exMemo.s !== state) {
    const list = liveExtras(state).filter(x => x.dayIdx >= 0 && x.dayIdx < NDAYS), byDay = new Map(), byWeek = new Map();
    for (const x of list) {
      (byDay.get(x.dayIdx) ?? byDay.set(x.dayIdx, []).get(x.dayIdx)).push(x);
      (byWeek.get(x.weekId) ?? byWeek.set(x.weekId, []).get(x.weekId)).push(x);
    }
    exMemo = { s: state, list, byDay, byWeek };
  }
  return exMemo;
}
const allExtras = () => extrasMemo().list;
const extrasOnDay = d => extrasMemo().byDay.get(d) || [];
const extrasInWeek = id => extrasMemo().byWeek.get(id) || [];
// Hvad grid'et viser af ekstra: når det ændrer sig, bygges grid'et igen (se refresh).
const extrasSig = () => allExtras().map(x => `${x.weekId}${x.key}${x.e.updatedAt}`).join('|');
let exSig = '';

function status(wi, di, si, s) {
  if (s.s === 'rest') return 'rest';
  const e = entry(weeks[wi].id, `${di}-${si}`);
  if (e) return (typeof e.min === 'number' && s.m && Math.abs(e.min - s.m) / s.m > 0.2) ? 'off' : 'done';
  return dayIdxOf(wi, di) < todayIdx ? 'miss' : 'future';
}
// doneMin = gennemførte pas (skrevet tid, ellers planlagt) plus ekstra træning (extraMin); pas og kortfarver tæller kun de planlagte.
function weekStats(w) {
  const plan = { swim: 0, bike: 0, run: 0, str: 0, race: 0 }, done = { swim: 0, bike: 0, run: 0, str: 0, race: 0 };
  let n = 0, nDone = 0, tssP = 0;
  w.days.forEach((d, di) => d.forEach((s, si) => {
    if (s.s === 'rest') return;
    n++; plan[s.s] += s.m; tssP += tss(s);
    const e = entry(w.id, `${di}-${si}`);
    if (e) { nDone++; done[s.s] += typeof e.min === 'number' ? e.min : s.m; }
  }));
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const xs = extrasInWeek(w.id), extraMin = xs.reduce((a, x) => a + x.e.min, 0);
  return { plan, done, n, nDone, tssP, planMin: sum(plan), doneMin: sum(done) + extraMin, extraMin, nExtra: xs.length };
}

// ---- Kost (src/nutrition.js) ----
// Vægten er personlig: den læses kun fra localStorage på denne enhed og indgår aldrig i Store'en, eksporten eller kalenderen.
let weight = null; // kg eller null (uden vægt vises g/kg i stedet for gram og kcal)
function loadWeight() {
  let ls = null;
  try { ls = localStorage; } catch (e) { /* blokeret: så er vægten ukendt */ }
  return readWeight(ls);
}
weight = loadWeight();
const nextDayOf = (wi, di) => di < 6 ? weeks[wi].days[di + 1] : (weeks[wi + 1] ? weeks[wi + 1].days[0] : []);
// Dagens kost regnes ud fra de planlagte pas plus dagens ekstra træning (hver ekstra tæller som et pas af sin sport med de skrevne minutter).
const dayWithExtras = (wi, di) => {
  const d = weeks[wi].days[di], xs = extrasOnDay(dayIdxOf(wi, di));
  return xs.length ? d.concat(xs.map(x => ({ s: x.e.sport, m: x.e.min }))) : d;
};
const dayKost = (wi, di) => { const d = dayWithExtras(wi, di); return dayNutrition(dayType(d, addDays(weeks[wi].start, di)), dayMinutes(d), weight); };
const weekKcal = wi => weekKcalAverage(weeks[wi].days.map((_, di) => dayWithExtras(wi, di)), weeks[wi].start, weight);
// "Angiv vægt": et link-agtigt knapelement, som document-lytteren (data-weight) knytter til indstillingerne med markøren i vægtfeltet. Vises kun uden vægt.
const weightBtn = `<button type="button" class="linkbtn" data-weight>Angiv vægt</button>`;
const kostChip = (wi, di) => { const n = dayKost(wi, di); return `<span class="kc k-${n.type}">${esc(n.chip)}</span>`; };
// "Kost"-blokken i arket: dagen (dagtype, energi, kulhydrat, protein) og før/under/efter for passet.
function kostSheetHtml(k) {
  const { w, wi, di, si, s } = k, n = dayKost(wi, di);
  const f = s.s === 'rest' ? null : sessionFueling(w.days[di], si, { next: nextDayOf(wi, di), weight });
  const row = (dt, dd, subs = []) => `<dt>${dt}</dt><dd>${esc(dd)}${subs.filter(Boolean).map(x => `<small>${esc(x)}</small>`).join('')}</dd>`;
  return `<section class="sh-kost"><h4>Kost</h4><dl>${row('Dagen', n.text, [n.proteinText, n.note])}` +
    (f ? row('Før', f.before) + row('Under', f.during) + row('Efter', f.after) : '') + `</dl>` +
    `<p class="hint">${weight === null ? `${weightBtn} for at få gram og kcal i stedet for g/kg. ` : ''}Estimat og generel vejledning. Se guiden Kost.</p></section>`;
}
// Guiden "Kost": data fra kostGuide() (nutrition.js), tegnet her. Linket til rapporten bor her og ikke i app.html (siden må kun nævne api.github.com).
function paintKost() {
  const cell = tag => c => `<${tag}>${esc(c)}</${tag}>`;
  const sec = s => `<section><h3>${esc(s.title)}</h3>` +
    (s.table ? `<table class="zones kost-table"><tr>${s.table.head.map(cell('th')).join('')}</tr>${s.table.rows.map(r => `<tr>${r.map(cell('td')).join('')}</tr>`).join('')}</table>` : '') +
    (s.items ? `<ul>${s.items.map(i => `<li>${i.b ? `<b>${esc(i.b)}:</b> ` : ''}${esc(i.t)}</li>`).join('')}</ul>` : '') +
    (s.notes || []).map(t => `<p class="kost-p">${esc(t)}</p>`).join('') +
    (s.link ? `<p class="kost-p"><a href="${esc(s.link.href)}" target="_blank" rel="noopener noreferrer">${esc(s.link.text)}</a></p>` : '') + `</section>`;
  $('kostGuide').innerHTML = `<p class="kost-note">${esc(KOST_DISCLAIMER)}</p>` +
    (weight === null ? `<p class="kost-p kost-weight">Tabellen viser g/kg. ${weightBtn} for at få en kolonne med gram.</p>` : '') + kostGuide(weight).map(sec).join('');
  // Linjen over kalenderen: uden vægt vises g/kg, og "Angiv vægt" står lige ved chipsene.
  $('kostCap').innerHTML = `Under hver dag: dagtype · energi (estimat) · kulhydrat. ${weight === null ? `Uden vægt vises g/kg. ${weightBtn} for at få gram og kcal. ` : ''}Se guiden Kost.`;
  paintKostTab();
}
// Kost-fanen: dagens og ugens mål (energi, kulhydrat, protein). Med vægt i gram og kcal, uden i g/kg og med "Angiv vægt". Estimater, se nutrition.js.
const num = n => n.toLocaleString('da-DK');
const rng = (a, b) => a === b ? num(a) : `${num(a)}–${num(b)}`;
function kostTargets(n) {
  return {
    kcal: n.kcal ? `${rng(n.kcal.lo, n.kcal.hi)} kcal` : null,
    carb: n.carb ? (n.carb.grams ? `${rng(...n.carb.grams)} g` : `${rng(...n.carb.perKg)} g/kg`) : null,
    protein: n.protein.grams ? `ca. ${num(n.protein.grams.day)} g` : `${num(n.protein.perKg)} g/kg`,
  };
}
function kostTodayHtml() {
  if (!inPlan()) return `<h3>Dagens kost</h3><p class="kt-none">${todayIdx < 0 ? `Planen starter ${fmt(START)}. Ugens mål står herunder.` : 'Planen er slut.'}</p>`;
  const wi = Math.floor(todayIdx / 7), di = todayIdx % 7, n = dayKost(wi, di), t = kostTargets(n), w = weeks[wi];
  const tile = (label, value, sub) => `<div class="kt"><div class="kt-l">${label}</div><div class="kt-v num">${value || '–'}</div><div class="kt-s">${sub}</div></div>`;
  const kcalSub = weight === null ? `${weightBtn} for kcal` : n.kcal ? 'estimat, ±5 %' : n.type === 'race' ? 'se løbsdagsplanen' : 'ikke et kcal-mål';
  return `<h3>I dag · ${DAYS_LONG[di]} ${fmt(addDays(w.start, di))}</h3><div class="kt-head"><span class="kc k-${n.type}">${esc(n.label)}</span><span class="kt-min">${n.minutes ? `Træning ${dur(n.minutes)}` : 'Ingen træning'}</span></div>` +
    `<div class="kt-tiles">${tile('Energi', t.kcal, kcalSub)}${tile('Kulhydrat', t.carb, n.carb && n.carb.grams ? `${rng(...n.carb.perKg)} g/kg` : 'pr. kg kropsvægt')}` +
    `${tile('Protein', t.protein, n.protein.grams ? `ramme ${rng(...n.protein.grams.range)} g` : `ramme ${num(n.protein.range[0])}–${num(n.protein.range[1])} g/kg`)}</div>` +
    (n.note ? `<p class="kt-note">${esc(n.note)}</p>` : '') + `<p class="kt-note">${esc(n.proteinText)}</p>`;
}
function kostWeekHtml() {
  const w = weeks[nowIdx], avg = weekKcal(nowIdx);
  const head = `<tr><th scope="col">Dag</th>${weight === null ? '' : '<th scope="col">Energi</th>'}<th scope="col">Kulhydrat</th><th scope="col">Protein</th></tr>`;
  const rows = w.days.map((d, di) => {
    const n = dayKost(nowIdx, di), t = kostTargets(n), isToday = dayIdxOf(nowIdx, di) === todayIdx;
    return `<tr${isToday ? ' class="today" aria-current="date"' : ''}><th scope="row">${DAYS[di]} <small>${fmt(addDays(w.start, di))}</small><span class="kc k-${n.type}">${esc(n.label)}</span></th>` +
      `${weight === null ? '' : `<td class="num">${n.kcal ? esc(t.kcal.replace(' kcal', '')) : '–'}</td>`}<td class="num">${t.carb ? esc(t.carb) : '–'}</td><td class="num">${esc(t.protein)}</td></tr>`;
  }).join('');
  return `<h3>${todayIdx < 0 ? 'Første uge' : 'Denne uge'} · uge ${w.n}</h3>` +
    (weight === null ? `<p class="kt-note">Uden vægt vises g/kg. ${weightBtn} for kcal og gram.</p>` : '') +
    `<table class="zones kt-week"><thead>${head}</thead><tbody>${rows}</tbody></table>` +
    `<p class="kt-note">${avg ? `Gennemsnit pr. dag: ${esc(avg.text)} (estimat). ` : ''}Energi er et estimat, og opladnings- og løbsdage har intet kcal-mål. Se guiden herunder.</p>`;
}
function paintKostTab() {
  $('kostToday').innerHTML = kostTodayHtml();
  $('kostWeek').innerHTML = kostWeekHtml();
}

// Vægten er ændret (indstillingerne, eller en anden fane): tegn chips, ugesummer og guide igen uden at miste rullepositionen.
function repaintKost() {
  const grid = $('grid'), scroll = grid.scrollTop;
  buildGrid();
  grid.scrollTop = scroll;
  refresh();
  paintKost();
}

// Er et pasark åbent under indstillingerne ("Angiv vægt" fra arket), får kost-blokken ny vægt uden at røre formularen under den.
function repaintSheetKost() {
  const k = openKey && byKey[openKey], block = k && sheet.querySelector('.sh-kost');
  if (block) block.outerHTML = kostSheetHtml(k);
}

// ---- Header ----
function paintHeader() {
  $('days').textContent = Math.max(0, Math.round((RACE - today) / DAY_MS));
  const toK = Math.round((TUNEUP - today) / DAY_MS);
  $('tuneup').textContent = toK > 0 ? `Køge Jernmand om ${toK} dage (13. jun.)` : toK === 0 ? 'Køge Jernmand i dag!' : '';
}
paintHeader();

// ---- Kort (workout card) ----
// Faktisk fart for et gennemført pas (selvindtastet, eller beregnet af distance og tid fra Strava) og hvordan den ligger i forhold til zonen.
// Kort tekst til kortene, lang til arket. null uden fart. Zonefarven (st-*) afhænger aldrig af farten, kun af varigheden.
function paceSummary(s, e) {
  const a = e && actualPace(s, e);
  if (!a) return null;
  const val = formatPaceUnit(a.sport, a.value), cmp = a.cmp ? ` · ${PACE_CMP_TEXT[a.cmp]}` : '';
  return a.derived
    ? { card: `⌀ ${val}${cmp}`, sheet: `Gennemsnitsfart (beregnet ud fra distance og tid): ${val}${cmp}` }
    : { card: `Faktisk ${val}${cmp}`, sheet: `Faktisk pace: ${val}${cmp}` };
}
const cardPace = (wk, di, si, s) => { const p = paceSummary(s, entry(wk, `${di}-${si}`)); return p ? p.card : ''; };
function cardHtml(w, wi, di, si, s) {
  const key = `${w.id}-${di}-${si}`;
  const chk = s.s === 'rest' ? '' : `<button class="chk" data-chk="${key}" aria-label="Markér ${esc(s.t)} som gennemført"></button>`;
  const pz = paceCompact(s);
  return `<div class="card c-${s.s} ${s.s} st-${status(wi, di, si, s)}" data-key="${key}">` +
    `<button class="open" data-open="${key}"><span class="t">${esc(s.t)}</span>${s.m ? `<span class="m">${dur(s.m)}</span>` : ''}` +
    `${pz ? `<span class="pz">${esc(pz)}</span>` : ''}<span class="pa">${esc(cardPace(w.id, di, si, s))}</span><span class="d">${esc(s.d)}</span></button>${chk}</div>`;
}
const pills = (w, wi) => `<span class="pill k-${w.k}">${KIND[w.k]}</span><span class="pill">${PH[w.ph].name}</span>` +
  (w.event ? `<span class="pill evt">${esc(w.event[0])}</span>` : '') +
  (wi === nowIdx ? `<span class="pill nowpill">${todayIdx < 0 ? 'Starter mandag' : 'Denne uge'}</span>` : '');

// ---- Desktop: ugegitter ----
function sumHtml(w) {
  const st = weekStats(w), kost = weekKcal(w.n - 1);
  return `<div class="hh num">${hrs(st.doneMin)}<small> / ${hrs(st.planMin)} t</small></div>` +
    `<div class="row"><span>Pas</span><b>${st.nDone}/${st.n}</b></div>` +
    (st.extraMin ? `<div class="row ex"><span>Ekstra</span><b>${dur(st.extraMin)}</b></div>` : '') +
    `<div class="row"><span>Planlagt TSS</span><b>${st.tssP}</b></div>` +
    (kost ? `<div class="row kost"><span>Kost ⌀/dag, estimat</span><b>${esc(kost.text)}</b></div>` : '') +
    SPORTS.filter(s => st.plan[s]).map(s => `<div class="row c-${s}"><span class="sp">${SPORT[s]}</span><b>${st.done[s] ? dur(st.done[s]) + ' / ' : ''}${dur(st.plan[s])}</b></div>`).join('');
}
function buildGrid() {
  let h = `<div class="gcols gdow">${DAYS.map(d => `<div>${d}</div>`).join('')}<div>Ugesum</div></div>`;
  weeks.forEach((w, wi) => {
    const end = addDays(w.start, 6);
    h += `<div class="gw${wi === nowIdx ? ' now' : ''}" id="g-${w.id}">` +
      `<div class="gw-head"><span class="wn">Uge ${w.n}</span><span class="dates">${fmt(w.start)} – ${fmt(end)}</span>${pills(w, wi)}${w.note ? `<span class="note">${esc(w.note)}</span>` : ''}</div>` +
      `<div class="gcols">` +
      w.days.map((d, di) => {
        const date = addDays(w.start, di);
        const isToday = dayIdxOf(wi, di) === todayIdx;
        return `<div class="gd${isToday ? ' today' : ''}"><span class="dt">${isToday ? 'I dag · ' : ''}${fmt(date)}</span>${kostChip(wi, di)}${d.map((s, si) => cardHtml(w, wi, di, si, s)).join('')}${extraCardsHtml(dayIdxOf(wi, di))}</div>`;
      }).join('') +
      `<div class="gsum" data-sum="${w.id}">${sumHtml(w)}</div></div></div>`;
  });
  $('grid').innerHTML = h;
  exSig = extrasSig();
}
function scrollGridTo(wi, smooth) {
  const g = $('grid'), el = $('g-' + weeks[wi].id), head = g.querySelector('.gdow');
  if (!el || !g.clientHeight) return;
  g.scrollTo({ top: el.offsetTop - head.offsetHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
}

// ---- Telefon: dagsliste for valgt uge ----
function buildAgenda() {
  const wi = selIdx, w = weeks[wi], st = weekStats(w), end = addDays(w.start, 6), kostAvg = weekKcal(wi);
  const mix = SPORTS.filter(s => st.plan[s]).map(s => `<i style="flex:${st.plan[s]};background:var(--${s})"></i>`).join('');
  let h = `<div class="ag-head${wi === nowIdx ? ' now' : ''}">` +
    `<div class="ag-top"><span class="wn">Uge ${w.n}</span><span>${fmt(w.start)} – ${fmt(end)}</span></div>` +
    `<div class="ag-top">${pills(w, wi)}</div>` +
    `<div class="ag-stats"><span>Timer <b>${hrs(st.doneMin)} / ${hrs(st.planMin)}</b></span><span>Pas <b>${st.nDone}/${st.n}</b></span>${st.extraMin ? `<span>Ekstra <b>${dur(st.extraMin)}</b></span>` : ''}<span>TSS <b>${st.tssP}</b></span>${kostAvg ? `<span>Kost ⌀/dag, estimat <b>${esc(kostAvg.text)}</b></span>` : ''}</div>` +
    `<div class="mix" aria-hidden="true">${mix}</div>` +
    (w.note ? `<div class="ag-note">${esc(w.note)}</div>` : '') + `</div>`;
  w.days.forEach((d, di) => {
    const date = addDays(w.start, di), isToday = dayIdxOf(wi, di) === todayIdx;
    h += `<div class="ag-day${isToday ? ' today' : ''}"><div class="lbl">${DAYS_LONG[di]}<small>${fmt(date)}${isToday ? ' · i dag' : ''}</small>${kostChip(wi, di)}</div>${d.map((s, si) => cardHtml(w, wi, di, si, s)).join('')}${extraCardsHtml(dayIdxOf(wi, di))}</div>`;
  });
  $('agenda').innerHTML = h;
}
function selectWeek(i) {
  selIdx = Math.min(weeks.length - 1, Math.max(0, i));
  buildAgenda();
  $('prevWk').disabled = selIdx === 0; $('nextWk').disabled = selIdx === weeks.length - 1;
}

// ---- Opdater status uden at genopbygge DOM'en ----
function refresh() {
  if (extrasSig() !== exSig) { // ekstra træning er kommet til, ændret eller væk: grid'et og dagens kost tegnes igen (rulleposition bevares)
    const grid = $('grid'), scroll = grid.scrollTop;
    buildGrid();
    grid.scrollTop = scroll;
    paintKostTab();
  }
  document.querySelectorAll('.card[data-key]').forEach(el => {
    const k = byKey[el.dataset.key]; if (!k) return;
    el.className = el.className.replace(/\bst-\w+/, 'st-' + status(k.wi, k.di, k.si, k.s));
    const pa = el.querySelector('.pa');
    if (pa) pa.textContent = cardPace(k.w.id, k.di, k.si, k.s);
  });
  weeks.forEach(w => { const el = document.querySelector(`[data-sum="${w.id}"]`); if (el) el.innerHTML = sumHtml(w); });
  buildAgenda();
  let done = 0, total = 0;
  weeks.forEach(w => { const st = weekStats(w); done += st.nDone; total += st.n; });
  const nx = allExtras().length;
  $('ptext').textContent = `${done} af ${total} pas gennemført${nx ? ` · + ${nx} ekstra` : ''}`;
  $('pbar').style.width = (done / total * 100) + '%';
  paintToday();
  paintCompliance();
  drawPerf();
}

// ---- Gemning: en Store (src/store/*) ----
let store = new LocalStore(); // lokal cache fra første billede; skiftes ud når GistStore/ArtifactDbStore er klar
let detach = () => {};
let settings = null;
const savemode = $('savemode');
// Synk-status vises to steder, og kun ét er synligt ad gangen: i race-headeren på I dag og i den slanke topbjælke på de andre faner.
const statusButtons = [savemode, $('savemodeTop')];
function paintStatus(st) { for (const b of statusButtons) { b.textContent = st.label; b.dataset.state = st.state; } }
function attach(next) {
  detach();
  store = next;
  state = next.snapshot();
  const offs = [next.subscribe(p => { state = p; refresh(); }), next.onStatus(paintStatus)];
  detach = () => offs.forEach(off => off());
  paintStatus(next.status);
  next.load().then(p => { if (store === next) { state = p; refresh(); } });
}
// Skift den aktive Store; indstillingsdialogen følger med. Den gamle LocalStore har allerede gemt alt i localStorage,
// og den nye læser det derfra, så ændringer lavet inden skiftet følger med.
function swapTo(next) {
  const old = store;
  attach(next);
  old.dispose();
  if (settings) settings.setStore(next);
}
// Site: GistStore hvis der er forbundet; ellers null (bliv ved LocalStore). Artifact skifter først bagefter, se start nedenfor.
function pickStore() {
  try {
    const cfg = BUILD.target !== 'artifact' && typeof GistStore !== 'undefined' ? GistStore.readConfig(localStorage) : null;
    return cfg ? new GistStore(cfg) : null;
  } catch (e) { return null; }
}
// val = felter for et gennemført pas (eller null = fjern afkrydsningen). Storen stempler updatedAt/dev og giver subscribe-besked.
function setEntry(key, val) {
  const k = byKey[key];
  store.save(k.w.id, `${k.di}-${k.si}`, val ? { ...val, done: true, sig: sessionSig(k.s) } : null);
}

// ---- Detaljevisning ----
const sheet = $('sheet');
const STRAVA_ID = /^\d{1,20}$/;
// Faktisk pace i logformularen: løb mm:ss pr. km, svøm mm:ss pr. 100 m, cykel km/t (tolerant indtastning, se parsePace i pace.js).
const PACE_FIELD = {
  run: { label: 'Faktisk pace', unit: 'min:sek pr. km', ph: '5:30', err: 'Skriv pace som min:sek pr. km, fx 5:30.' },
  swim: { label: 'Faktisk pace', unit: 'min:sek pr. 100 m', ph: '2:10', err: 'Skriv pace som min:sek pr. 100 m, fx 2:10.' },
  bike: { label: 'Faktisk pace', unit: 'km/t', ph: '27,5', err: 'Skriv farten i km/t, fx 27,5.' },
};
// Importeret fra Strava: én linje under faktaboksene (docs/strava.md §5) og et link til den første aktivitet. Kun tal og esc(), aldrig rå tekst.
function stravaHtml(e) {
  const parts = ['Fra Strava'];
  if (Number.isInteger(e.dist) && e.dist > 0) parts.push(`${(e.dist / 1000).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`);
  if (Number.isInteger(e.hr)) parts.push(`⌀ ${e.hr} bpm`);
  const id = typeof e.extId === 'string' ? e.extId.split(',')[0] : '';
  const link = STRAVA_ID.test(id) ? ` · <a href="https://www.strava.com/activities/${id}" target="_blank" rel="noopener noreferrer">Se på Strava</a>` : '';
  return `<p class="desc sh-strava">${parts.map(esc).join(' · ')}${link}</p>`;
}
let openKey = null, rpe = null;
function openSheet(key) {
  const k = byKey[key]; if (!k) return;
  const { w, di, s } = k; openKey = key; exOpen = null;
  const e = entry(w.id, `${k.di}-${k.si}`);
  rpe = e && e.rpe ? e.rpe : null;
  const date = addDays(w.start, di);
  const rec = paceText(s);
  const facts = s.s === 'rest' ? '' : `<div class="sh-facts"><div><small>Planlagt</small><b class="num">${dur(s.m)}</b></div><div><small>Est. TSS</small><b class="num">${tss(s)}</b></div>${rec ? `<div class="sh-rec">${esc(rec)}</div>` : ''}</div>`;
  const ps = paceSummary(s, e);
  const psport = paceSport(s);
  const pf = psport && PACE_FIELD[psport];
  const paceField = pf ? `<label class="field">${pf.label}${s.main ? ' i hovedsættet' : ''} (${pf.unit})<input type="text" id="fPace" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="${pf.ph}" value="${e && typeof e.pace === 'number' ? formatPace(psport, e.pace) : ''}"></label>` : '';
  const form = s.s === 'rest' ? '' : `<form id="logf">
      <label class="chkrow"><input type="checkbox" id="fDone"${e ? ' checked' : ''}> Gennemført</label>
      <label class="field">Faktisk varighed (min)<input type="number" id="fMin" inputmode="numeric" min="0" max="900" step="1" placeholder="${s.m}" value="${e && typeof e.min === 'number' ? e.min : ''}"></label>
      ${paceField}
      <div class="field"><span id="rpeLbl">RPE (1 = meget let, 10 = maks)</span><div class="rpe" role="group" aria-labelledby="rpeLbl">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-rpe="${i + 1}" aria-pressed="${rpe === i + 1}">${i + 1}</button>`).join('')}</div></div>
      <label class="field">Note<textarea id="fNote" maxlength="1000" placeholder="Hvordan gik det?">${e && e.note ? esc(e.note) : ''}</textarea></label>
      <div class="msg" id="fMsg"></div>
      <div class="sh-actions"><button type="button" class="btn" id="fCancel">Annuller</button><button type="submit" class="btn primary">Gem</button></div>
    </form>`;
  const sh = $('sh');
  sh.className = `sh c-${s.s}`;
  sh.innerHTML = `<div class="sh-top"><div><div class="sh-sport">${SPORT[s.s]}</div><h3 id="shTitle">${esc(s.t)}</h3><div class="when">${DAYS_LONG[di]} ${fmt(date)} ${date.getFullYear()} · Uge ${w.n} · ${PH[w.ph].name}</div></div><button class="x" id="fClose" aria-label="Luk">×</button></div>
    <p class="desc">${esc(s.d)}</p>${facts}${ps ? `<p class="desc sh-pace">${esc(ps.sheet)}</p>` : ''}${e && e.src === 'strava' ? stravaHtml(e) : ''}${kostSheetHtml(k)}${form}`;
  if (!sheet.open) sheet.showModal();
}
sheet.addEventListener('click', ev => {
  if (ev.target === sheet || ev.target.closest('#fClose') || ev.target.closest('#fCancel')) { sheet.close(); return; }
  if (ev.target.closest('[data-xdel]')) { $('exActs').innerHTML = exConfirmHtml(); return; } // bekræftelse i arket, ikke confirm()
  if (ev.target.closest('[data-xkeep]')) { $('exActs').innerHTML = exActionsHtml(); return; }
  if (ev.target.closest('[data-xdelok]')) { if (exOpen) store.save(exOpen.weekId, exOpen.key, null); sheet.close(); return; }
  const xr = ev.target.closest('[data-xrpe]');
  if (xr) { toggleXRpe(xr.dataset.xp, +xr.dataset.xrpe, sheet); return; }
  const b = ev.target.closest('[data-rpe]');
  if (b) {
    const v = +b.dataset.rpe; rpe = rpe === v ? null : v;
    sheet.querySelectorAll('[data-rpe]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.rpe === rpe)));
    if (rpe) $('fDone').checked = true;
  }
});
sheet.addEventListener('input', ev => { if (ev.target.id === 'fMin' || ev.target.id === 'fNote' || ev.target.id === 'fPace') { if (ev.target.value) $('fDone').checked = true; } });
sheet.addEventListener('submit', ev => {
  ev.preventDefault();
  if (exOpen) { submitEdit(); return; }
  const k = byKey[openKey]; if (!k) return;
  const prev = entry(k.w.id, `${k.di}-${k.si}`);
  if (!$('fDone').checked) { setEntry(openKey, null); sheet.close(); return; }
  const raw = $('fMin').value.trim(), min = raw === '' ? null : Math.round(Number(raw));
  if (raw !== '' && !(min >= 0 && min <= 900)) { $('fMsg').textContent = 'Skriv varigheden i hele minutter (0–900).'; return; }
  const sport = paceSport(k.s), rawPace = sport ? $('fPace').value.trim() : '';
  const pace = rawPace === '' ? null : parsePace(sport, rawPace);
  if (rawPace !== '' && pace === null) { $('fMsg').textContent = PACE_FIELD[sport].err; return; }
  const note = $('fNote').value.trim();
  const val = { at: (prev && prev.at) || new Date().toISOString() };
  if (min !== null) val.min = min;
  if (pace !== null) val.pace = pace;
  if (rpe) val.rpe = rpe;
  if (note) val.note = note;
  if (prev && prev.src === 'strava') { // en redigeret Strava-post bliver ved med at høre til Strava; brugerens min/RPE/note vinder
    val.src = 'strava';
    if (prev.extId) val.extId = prev.extId;
    if (prev.dist != null) val.dist = prev.dist;
    if (prev.hr != null) val.hr = prev.hr;
  }
  setEntry(openKey, val); sheet.close();
});
sheet.addEventListener('change', ev => { if (ev.target.id === 'exSport') syncPaceField('ex'); });
sheet.addEventListener('close', () => { openKey = null; exOpen = null; });

document.addEventListener('click', ev => {
  const link = ev.target.closest('a[href^="#"]'); // fanerne og ugelinks (#u12): som et almindeligt hashlink, men også hvor adresselinjen er låst
  if (link && !(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0)) { ev.preventDefault(); goHash(link.getAttribute('href')); return; }
  const c = ev.target.closest('[data-chk]');
  if (c) {
    const k = byKey[c.dataset.chk], e = entry(k.w.id, `${k.di}-${k.si}`);
    if (e && (e.min != null || e.rpe || e.note || e.pace != null)) openSheet(c.dataset.chk); // har detaljer: åbn i stedet for at slette
    else setEntry(c.dataset.chk, e ? null : { at: new Date().toISOString() });
    return;
  }
  if (ev.target.closest('[data-weight]')) { // "Angiv vægt": fanen Mere med markøren i vægtfeltet (et åbent pasark lukkes først, for det dækker siden)
    if (sheet.open) sheet.close();
    if (settings) settings.open({ focusWeight: true });
    return;
  }
  const xo = ev.target.closest('[data-open-x]');
  if (xo) { openExtraSheet(xo.dataset.openX); return; }
  const o = ev.target.closest('[data-open]');
  if (o) openSheet(o.dataset.open);
});

// ---- Ekstra træning: kort, formular ("+ Tilføj træning" på I dag) og redigeringsark ----
// Uplanlagt træning gemmes som x-<id> i ugens dokument (progress.js, docs/architecture.md §3.10) og tæller i ugens timer, i overholdelsen (som "+ ekstra")
// og i den faktiske PMC, men aldrig i planens pas, kortfarverne eller kalenderen (.ics).
const XSPORTS = ['swim', 'bike', 'run', 'str', 'other'];
const xRef = x => `${x.weekId}|${x.key}`;
const xTitle = e => e.title || SPORT[e.sport];
// Fart for en ekstra (kun svøm, cykel og løb): den indtastede, ellers beregnet af distance og tid (Strava). null uden fart.
function extraPace(e) {
  if (!PACE_FIELD[e.sport]) return null;
  const manual = typeof e.pace === 'number', v = manual ? e.pace : derivePace(e.sport, e.dist, e.min);
  return v === null || v === undefined ? null : `${manual ? 'Faktisk' : '⌀'} ${formatPaceUnit(e.sport, v)}`;
}
// Stiplet "Ekstra"-kort i kalenderen (gitter og dagsliste). Ingen data-key: refresh() og afkrydsningen rører kun planlagte pas.
function extraCardHtml(x) {
  const e = x.e, pz = extraPace(e);
  return `<div class="card ex c-${e.sport}" data-xkey="${xRef(x)}"><button type="button" class="open" data-open-x="${xRef(x)}">` +
    `<span class="xtag">Ekstra</span><span class="t">${esc(xTitle(e))}</span><span class="m">${dur(e.min)}${e.rpe ? ` · RPE ${e.rpe}` : ''}</span>${pz ? `<span class="pa">${esc(pz)}</span>` : ''}</button></div>`;
}
const extraCardsHtml = dayIdx => extrasOnDay(dayIdx).map(extraCardHtml).join('');
// Dagens ekstra på I dag, efter de planlagte pas.
function todayExtraHtml(x) {
  const e = x.e, logged = [extraPace(e), e.rpe ? `RPE ${e.rpe}` : '', Number.isInteger(e.hr) ? `⌀ ${e.hr} bpm` : ''].filter(Boolean).join(' · ');
  return `<article class="tc ex c-${e.sport}" data-today-x="${xRef(x)}"><div class="tc-top"><span class="tc-sport">${SPORT[e.sport]}</span><span class="tc-state">Ekstra</span></div>` +
    `<h3 class="tc-title">${esc(xTitle(e))}</h3><div class="tc-meta num">${dur(e.min)} · Est. TSS ${extraTss(e)}</div>` +
    (logged ? `<p class="tc-logged">${esc(logged)}</p>` : '') + (e.note ? `<p class="tc-desc">${esc(e.note)}</p>` : '') +
    `<div class="tc-actions"><button type="button" class="btn" data-open-x="${xRef(x)}">Redigér</button></div></article>`;
}

// Formularen bruges to steder med hvert sit præfiks p: 'ax' (inline på I dag) og 'ex' (redigeringsarket). v = startværdier.
const xRpe = { ax: null, ex: null };
function extraFormHtml(p, v) {
  const pf = PACE_FIELD[v.sport];
  return `<label class="field">Dato<input type="date" id="${p}Date" min="${isoDate(START)}" max="${isoDate(today)}" value="${esc(v.date)}"></label>` +
    `<label class="field">Sport<select id="${p}Sport">${XSPORTS.map(sp => `<option value="${sp}"${sp === v.sport ? ' selected' : ''}>${SPORT[sp]}</option>`).join('')}</select></label>` +
    `<label class="field">Hvad? (valgfri)<input type="text" id="${p}Title" maxlength="80" autocomplete="off" placeholder="fx Fodbold" value="${esc(v.title)}"></label>` +
    `<label class="field">Varighed (min)<input type="number" id="${p}Min" inputmode="numeric" min="1" max="900" step="1" placeholder="60" value="${esc(v.min)}"></label>` +
    `<label class="field" id="${p}PaceBox"${pf ? '' : ' hidden'}><span id="${p}PaceLbl">${pf ? `${pf.label} (${pf.unit})` : ''}</span><input type="text" id="${p}Pace" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="${pf ? pf.ph : ''}" value="${esc(v.pace)}"></label>` +
    `<div class="field"><span id="${p}RpeLbl">RPE (1 = meget let, 10 = maks)</span><div class="rpe" role="group" aria-labelledby="${p}RpeLbl">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-xrpe="${i + 1}" data-xp="${p}" aria-pressed="${xRpe[p] === i + 1}">${i + 1}</button>`).join('')}</div></div>` +
    `<label class="field">Note<textarea id="${p}Note" maxlength="1000" placeholder="Hvordan gik det?">${esc(v.note)}</textarea></label>` +
    `<div class="msg" id="${p}Msg" role="status"></div>`;
}
// Skift af sport: farten har sin egen enhed pr. sport, og styrke og andet har ingen fart.
function syncPaceField(p) {
  const pf = PACE_FIELD[$(p + 'Sport').value];
  $(p + 'PaceBox').hidden = !pf;
  if (pf) { $(p + 'PaceLbl').textContent = `${pf.label} (${pf.unit})`; $(p + 'Pace').placeholder = pf.ph; }
}
function toggleXRpe(p, v, root) {
  xRpe[p] = xRpe[p] === v ? null : v;
  root.querySelectorAll('[data-xrpe]').forEach(b => { if (b.dataset.xp === p) b.setAttribute('aria-pressed', String(+b.dataset.xrpe === xRpe[p])); });
}
// Læs og valider formularen → { patch, weekId, dayIdx } eller { error }. Datoen skal ligge fra planens start til og med i dag.
function readExtraForm(p) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String($(p + 'Date').value));
  const idx = m ? Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - START) / DAY_MS) : NaN;
  if (!Number.isInteger(idx) || idx < 0 || idx > todayIdx || idx >= NDAYS) return { error: 'Vælg en dato fra planens start til og med i dag.' };
  const sport = $(p + 'Sport').value;
  if (!XSPORTS.includes(sport)) return { error: 'Vælg en sport.' };
  const rawMin = String($(p + 'Min').value).trim(), min = Math.round(Number(rawMin));
  if (rawMin === '' || !(min >= 1 && min <= 900)) return { error: 'Skriv varigheden i hele minutter (1–900).' };
  const pf = PACE_FIELD[sport], rawPace = pf ? String($(p + 'Pace').value).trim() : '';
  const pace = rawPace === '' ? null : parsePace(sport, rawPace);
  if (rawPace !== '' && pace === null) return { error: pf.err };
  const title = String($(p + 'Title').value).trim(), note = String($(p + 'Note').value).trim();
  const patch = { day: idx % 7, sport, min };
  if (title) patch.title = title;
  if (pace !== null) patch.pace = pace;
  if (xRpe[p]) patch.rpe = xRpe[p];
  if (note) patch.note = note;
  return { patch, weekId: weeks[Math.floor(idx / 7)].id, dayIdx: idx };
}

// "+ Tilføj træning": en knap, der folder formularen ud på stedet. Tegnes kun når tilstanden skifter, så en igangværende indtastning ikke
// overskrives, når I dag tegnes igen (synk, dagsskifte). Uden for planen (før start, efter løbet) er der ingen knap.
let addOpen = false, addNote = '';
const addBox = $('addWorkout');
function paintAdd() {
  const want = !inPlan() ? 'none' : addOpen ? 'form' : 'button', mode = `${want}|${addNote}`;
  if (addBox.dataset.mode === mode) return;
  addBox.dataset.mode = mode;
  addBox.innerHTML = want === 'none' ? '' : want === 'button'
    ? `${addNote ? `<p class="add-note" role="status">${esc(addNote)}</p>` : ''}<button type="button" class="btn add-btn" data-add>+ Tilføj træning</button>`
    : `<form class="panel xform" id="axForm" novalidate><h3>Tilføj træning</h3><p class="x-hint">Træning der ikke står i planen. Den tæller i ugens timer og i belastningen, men ikke i planens pas.</p>` +
      extraFormHtml('ax', { date: isoDate(today), sport: 'run', title: '', min: '', pace: '', note: '' }) +
      `<div class="sh-actions"><button type="button" class="btn" data-xcancel>Annuller</button><button type="submit" class="btn primary">Gem</button></div></form>`;
}
function submitAdd() {
  const f = readExtraForm('ax');
  if (f.error) { $('axMsg').textContent = f.error; return; }
  store.save(f.weekId, newExtraKey(), { ...f.patch, source: 'manual' });
  addOpen = false;
  addNote = `Gemt: ${SPORT[f.patch.sport]} ${dur(f.patch.min)} · ${DAYS[f.dayIdx % 7]} ${fmt(addDays(START, f.dayIdx))}`;
  paintAdd();
}
addBox.addEventListener('click', ev => {
  if (ev.target.closest('[data-add]')) {
    addOpen = true; addNote = ''; xRpe.ax = null;
    paintAdd();
    const first = $('axMin');
    if (first && typeof first.focus === 'function') first.focus();
    return;
  }
  if (ev.target.closest('[data-xcancel]')) { addOpen = false; paintAdd(); return; }
  const r = ev.target.closest('[data-xrpe]');
  if (r) toggleXRpe(r.dataset.xp, +r.dataset.xrpe, addBox);
});
addBox.addEventListener('submit', ev => { ev.preventDefault(); submitAdd(); });
addBox.addEventListener('change', ev => { if (ev.target.id === 'axSport') syncPaceField('ax'); });

// Redigeringsarket: samme formular, plus "Slet" med en bekræftelse i arket (aldrig confirm()). En sletning er en gravsten, så den når alle enheder.
let exOpen = null; // { weekId, key } mens arket viser en ekstra
const exActionsHtml = () => `<button type="button" class="btn danger" data-xdel>Slet</button><button type="button" class="btn" id="fCancel">Annuller</button><button type="submit" class="btn primary">Gem</button>`;
const exConfirmHtml = () => `<span class="x-confirm" role="alert">Slet denne træning? Den fjernes på alle dine enheder.</span><button type="button" class="btn" data-xkeep>Behold</button><button type="button" class="btn danger" data-xdelok>Ja, slet</button>`;
function extraSourceHtml(e) {
  if (e.source === 'strava') return stravaHtml({ dist: e.dist, hr: e.hr, extId: e.activityId });
  if (e.source === 'intervals') return `<p class="desc sh-strava">Fra intervals.icu</p>`;
  return '';
}
function openExtraSheet(ref) {
  const [weekId, key] = String(ref).split('|');
  const e = state[weekId] && state[weekId][key], w = weeks[Number(String(weekId).slice(1)) - 1];
  if (!isExtra(e) || !w) return;
  exOpen = { weekId, key }; openKey = null;
  xRpe.ex = e.rpe || null;
  const date = addDays(w.start, e.day);
  const v = { date: isoDate(date), sport: e.sport, title: e.title || '', min: e.min, pace: typeof e.pace === 'number' && PACE_FIELD[e.sport] ? formatPace(e.sport, e.pace) : '', note: e.note || '' };
  const sh = $('sh');
  sh.className = `sh c-${e.sport}`;
  sh.innerHTML = `<div class="sh-top"><div><div class="sh-sport">Ekstra · ${SPORT[e.sport]}</div><h3 id="shTitle">${esc(xTitle(e))}</h3><div class="when">${DAYS_LONG[e.day]} ${fmt(date)} ${date.getFullYear()} · Uge ${w.n}</div></div><button class="x" id="fClose" aria-label="Luk">×</button></div>` +
    `<p class="desc">Uplanlagt træning. Den tæller i ugens timer og i belastningen (Est. TSS ${extraTss(e)}), men ikke i planens pas.</p>${extraSourceHtml(e)}` +
    `<form id="xf" novalidate>${extraFormHtml('ex', v)}<div class="sh-actions" id="exActs">${exActionsHtml()}</div></form>`;
  if (!sheet.open) sheet.showModal();
}
function submitEdit() {
  const cur = exOpen, prev = cur && state[cur.weekId] && state[cur.weekId][cur.key];
  if (!cur || !isExtra(prev)) { sheet.close(); return; }
  const f = readExtraForm('ex');
  if (f.error) { $('exMsg').textContent = f.error; return; }
  const patch = { ...f.patch, source: prev.source };
  for (const k of ['activityId', 'dist', 'hr']) if (prev[k] != null) patch[k] = prev[k]; // hører til Strava/intervals-aktiviteten og bevares
  if (f.weekId === cur.weekId) store.save(cur.weekId, cur.key, patch);
  else { store.save(cur.weekId, cur.key, null); store.save(f.weekId, newExtraKey(), patch); } // en ny uge er et nyt dokument: gravsten her, ny nøgle der
  sheet.close();
}

// ---- Navigation ----
$('prevWk').addEventListener('click', () => selectWeek(selIdx - 1));
$('nextWk').addEventListener('click', () => selectWeek(selIdx + 1));
$('todayBtn').addEventListener('click', () => { selectWeek(nowIdx); scrollGridTo(nowIdx, true); });
let touch = null;
$('agenda').addEventListener('touchstart', e => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
$('agenda').addEventListener('touchend', e => {
  if (!touch) return; const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y; touch = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { selectWeek(selIdx + (dx < 0 ? 1 : -1)); $('agenda').scrollIntoView({ block: 'start' }); }
}, { passive: true });
// Søjlerne i Analyse: åbn kalenderen ved den uge.
function goToWeek(wi) {
  selectWeek(wi);
  navigate('kalender');
}

// ---- Faner og routing ----
// Hash-routing med plain tokens (views.js): #idag (standard), #kalender, #kost, #analyse og #mere. Tabbarens links er almindelige <a href="#…">,
// så tilbage-knappen virker uden ekstra kode. Et ugelink (#u12) åbner kalenderen ved den uge, og en ukendt hash viser I dag.
// Hver fane er en <section class="view" id="<token>">; kun den aktive er synlig (hidden).
let route = null;
// forced: { route, week } når hashen ikke kunne sættes (fx i en sandkasse, hvor adresselinjen er låst): så vises fanen alligevel.
function applyRoute(forced) {
  const { route: next, week } = forced || parseRoute(location.hash, weeks.length);
  if (week !== null) selectWeek(week);
  const changed = next !== route;
  route = next;
  for (const r of ROUTES) {
    $(r).hidden = r !== next;
    if (r === next) $('tab-' + r).setAttribute('aria-current', 'page'); else $('tab-' + r).removeAttribute('aria-current');
  }
  $('topbar').hidden = next === 'idag';
  $('settingsTop').hidden = next === 'mere';
  $('topTitle').textContent = ROUTE_TITLES[next];
  if (!changed && week === null) return;
  if (changed && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
  // Det der måler sig selv, kan først tegnes eller rulles, når fanen er synlig
  if (next === 'analyse') drawPerf();
  if (next === 'kalender') scrollGridTo(selIdx, false);
}
// Skift fane fra koden og fra links (<a href="#kost">): sæt hashen (så tilbage-knappen virker) og vis fanen med det samme.
// hashchange kommer bagefter og er så en tom handling. Kan hashen ikke sættes, vises fanen alligevel.
function goHash(hash) {
  try { if (location.hash !== hash) location.hash = hash; } catch (e) { /* låst adresselinje */ }
  applyRoute(location.hash === hash ? null : parseRoute(hash, weeks.length));
}
const navigate = name => goHash('#' + name);
window.addEventListener('hashchange', () => applyRoute());
for (const b of [savemode, $('settingsBtn'), $('savemodeTop'), $('settingsTop')]) b.addEventListener('click', () => navigate('mere'));

// ---- I dag ----
// paintToday() tegner hele I dag-fanen (dagens pas, stat-kort, ugens fremdrift og næste nøglepas) ud fra state, vægt og dags dato.
// Den kaldes sidst i refresh(), så den følger enhver tilstandsændring: afkrydsning/log (store.subscribe), indlæsning af Store, ny vægt (repaintKost)
// og dagsskifte (rollDay). Monteringspunkterne #addWorkout ("+ Tilføj træning") og #advice (plan-justering) ligger i fanen og er tomme: tegn i dem herfra.
const STATE_TEXT = { done: 'Gennemført', off: 'Gennemført · varighed skæv', future: 'Planlagt', miss: 'Ikke gennemført' };
const inPlan = () => todayIdx >= 0 && todayIdx < NDAYS;
const daysFromNow = n => n === 0 ? 'i dag' : n === 1 ? 'i morgen' : `om ${n} dage`;
const sparkSvg = pts => `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true" focusable="false">${pts ? `<polyline points="${pts}" fill="none" stroke="var(--sc)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : ''}</svg>`;

function todayHeadHtml() {
  if (todayIdx < 0) return `<div class="th-date">Planen starter <b>${fmt(START)}</b></div><div class="th-meta">Om ${-todayIdx} ${todayIdx === -1 ? 'dag' : 'dage'}. Her kommer dagens pas, når planen er i gang.</div>`;
  if (todayIdx >= NDAYS) return `<div class="th-date">Planen er <b>slut</b></div><div class="th-meta">IRONMAN Copenhagen er overstået. Godt kørt.</div>`;
  const wi = Math.floor(todayIdx / 7), di = todayIdx % 7, w = weeks[wi];
  return `<div class="th-date">${DAYS_LONG[di]} <b>${fmt(addDays(w.start, di))}</b></div>` +
    `<div class="th-meta">Uge ${w.n} · ${KIND[w.k]} · ${PH[w.ph].name}</div>` +
    `<div class="th-kost">${kostChip(wi, di)}${weight === null ? `<span class="th-hint">${weightBtn} for gram og kcal</span>` : ''}</div>`;
}
function todayCardHtml(w, wi, di, si, s) {
  if (s.s === 'rest') return `<article class="tc c-rest rest"><div class="tc-top"><span class="tc-sport">${SPORT.rest}</span></div><h3 class="tc-title">${esc(s.t)}</h3><p class="tc-desc">${esc(s.d)}</p></article>`;
  const key = `${w.id}-${di}-${si}`, st = status(wi, di, si, s), e = entry(w.id, `${di}-${si}`);
  const rec = paceText(s), ps = paceSummary(s, e), f = sessionFueling(w.days[di], si, { next: nextDayOf(wi, di), weight });
  const logged = e ? [typeof e.min === 'number' ? `Logget ${dur(e.min)}` : 'Logget', ps && ps.card, e.rpe ? `RPE ${e.rpe}` : ''].filter(Boolean).join(' · ') : '';
  return `<article class="tc c-${s.s} st-${st}" data-today="${key}">` +
    `<div class="tc-top"><span class="tc-sport">${SPORT[s.s]}</span><span class="tc-state">${STATE_TEXT[st]}</span></div>` +
    `<h3 class="tc-title">${esc(s.t)}</h3><div class="tc-meta num">${dur(s.m)} · Est. TSS ${tss(s)}</div>` +
    (rec ? `<p class="tc-pace">${esc(rec)}</p>` : '') + `<p class="tc-desc">${esc(s.d)}</p>` + (logged ? `<p class="tc-logged">${esc(logged)}</p>` : '') +
    `<h4 class="tc-kh">Kost</h4><dl class="tc-kost"><dt>Før</dt><dd>${esc(f.before)}</dd><dt>Under</dt><dd>${esc(f.during)}</dd><dt>Efter</dt><dd>${esc(f.after)}</dd></dl>` +
    `<div class="tc-actions"><button type="button" class="btn primary" data-open="${key}">${e ? 'Rediger log' : 'Log pas'}</button>` +
    (e ? '' : `<button type="button" class="btn" data-chk="${key}" aria-label="Markér ${esc(s.t)} som gennemført">Markér gennemført</button>`) + `</div></article>`;
}
function todaySessionsHtml() {
  if (!inPlan()) return '';
  const wi = Math.floor(todayIdx / 7), di = todayIdx % 7, w = weeks[wi];
  return w.days[di].map((s, si) => todayCardHtml(w, wi, di, si, s)).join('') + extrasOnDay(todayIdx).map(todayExtraHtml).join('');
}

// Fitness (CTL), Form (TSB) og Træthed (ATL) med den faktiske PMC; før der er logget noget bruges den planlagte.
function statCardsHtml() {
  const daily = actualDaily(), logged = daily.slice(0, actualUpto()).some(v => v > 0);
  const v = pmcView(plannedPmc, actualPmc(daily), logged, todayIdx);
  const src = v.source === 'actual' ? 'Faktisk' : 'Plan';
  const card = (key, label, abbr, color) => {
    const d = v.delta ? `${signed(v.delta[key])} på 7 dage` : '';
    const shown = key === 'tsb' ? signed(v.now[key]) : String(v.now[key]);
    return `<div class="stat" style="--sc: var(${color})" role="group" aria-label="${label} (${abbr}) ${shown}, ${src.toLowerCase()}${d ? ', ' + d : ''}">` +
      `<div class="stat-l">${label} <small>${abbr}</small></div><div class="stat-v num">${shown}</div>` +
      `${sparkSvg(sparkPoints(v.series, v.idx, key))}<div class="stat-d num">${d || '&nbsp;'}</div><div class="stat-s">${src}</div></div>`;
  };
  return card('ctl', 'Fitness', 'CTL', '--ctl') + card('tsb', 'Form', 'TSB', '--tsb') + card('atl', 'Træthed', 'ATL', '--atl');
}

function weekProgressHtml() {
  const w = weeks[nowIdx], st = weekStats(w), pct = st.planMin ? Math.min(100, Math.round(st.doneMin / st.planMin * 100)) : 0;
  return `<h3>${todayIdx < 0 ? 'Første uge' : 'Denne uge'} · uge ${w.n}</h3>` +
    `<div class="wp-row"><span class="hh num">${hrs(st.doneMin)}<small> / ${hrs(st.planMin)} t</small></span><span class="num">Pas <b>${st.nDone}/${st.n}</b></span></div>` +
    `<div class="bar" role="img" aria-label="${pct} % af ugens timer"><i style="width:${pct}%"></i></div>` +
    (w.note ? `<p class="wp-note">${esc(w.note)}</p>` : '') + `<a class="wp-link" href="#${w.id}">Se ugen i kalenderen</a>`;
}

function nextKeyHtml() {
  const k = nextKeySession(weeks, todayIdx, (wi, di, si) => !!entry(weeks[wi].id, `${di}-${si}`));
  if (!k) return `<h3>Næste nøglepas</h3><p class="nk-none">Ingen flere nøglepas i planen.</p>`;
  const w = weeks[k.wi], s = k.s, key = `${w.id}-${k.di}-${k.si}`, pz = paceCompact(s);
  return `<h3>Næste nøglepas</h3><button type="button" class="nk c-${s.s}" data-open="${key}"><span class="nk-t">${esc(s.t)}</span>` +
    `<span class="nk-m num">${DAYS[k.di]} ${fmt(addDays(w.start, k.di))} · ${daysFromNow(k.dayIdx - todayIdx)} · ${dur(s.m)}</span>${pz ? `<span class="nk-p">${esc(pz)}</span>` : ''}</button>`;
}

// ---- Analyse: overholdelse pr. sport ----
// Planlagt til og med i går (plus det du allerede har gennemført i dag) mod gennemført: pas og minutter. Se complianceBySport i views.js.
function paintCompliance() {
  const c = complianceBySport(weeks, todayIdx, (wi, di, si) => entry(weeks[wi].id, `${di}-${si}`), allExtras().map(x => ({ dayIdx: x.dayIdx, sport: x.e.sport, min: x.e.min })));
  if (!c.rows.length) { $('compliance').innerHTML = `<p class="kt-none">Der er ingen planlagte pas endnu. Overholdelsen vises fra planens start.</p>`; return; }
  const tone = p => p === null ? 'miss' : p >= 90 ? 'ok' : p >= 60 ? 'warn' : 'miss';
  const row = r => {
    const p = pct(r.minDone, r.min), all = r.sport === 'all', plain = r.n === 0 && r.extra > 0; // en sport med kun ekstra træning har intet planlagt at måle mod
    const xtra = r.extra ? `<small class="ex-note">+ ${dur(r.extra)} ekstra</small>` : '';
    return `<tr${all ? ' class="total"' : ''}><th scope="row">${all ? 'Alle' : `<span class="sp c-${r.sport}">${SPORT[r.sport]}</span>`}</th><td class="num">${plain ? '–' : `${r.nDone}/${r.n}`}</td><td class="num">${plain ? '' : `${dur(r.minDone)} / ${dur(r.min)}`}${xtra}</td>` +
      `<td class="cp"><span class="cbar" aria-hidden="true"><i class="t-${tone(p)}" style="width:${Math.min(100, p || 0)}%"></i></span><b class="num">${p === null ? '–' : p + ' %'}</b></td></tr>`;
  };
  $('compliance').innerHTML = `<table class="zones comp"><thead><tr><th scope="col">Sport</th><th scope="col">Pas</th><th scope="col">Minutter</th><th scope="col">Overholdt</th></tr></thead><tbody>${c.rows.concat(c.total).map(row).join('')}</tbody></table>` +
    `<p class="kt-note">Planlagt til og med i går, plus det du har gennemført i dag. Minutter er det, du har skrevet, ellers det planlagte. Overholdt er gennemførte minutter af de planlagte. Ekstra træning (uplanlagt) står som + ekstra og indgår ikke i procenten.</p>`;
}

function paintToday() {
  $('todayHead').innerHTML = todayHeadHtml();
  $('todaySessions').innerHTML = todaySessionsHtml();
  paintAdd();
  $('statCards').innerHTML = statCardsHtml();
  $('weekProgress').innerHTML = weekProgressHtml();
  $('nextKey').innerHTML = nextKeyHtml();
}

// ---- Præstationsgraf (SVG) ----
const plannedTss = plannedDailyTss(weeks);
const plannedPmc = pmc(plannedTss);
const SVGNS = 'http://www.w3.org/2000/svg';
const phaseSpans = [];
weeks.forEach((w, wi) => { const last = phaseSpans[phaseSpans.length - 1]; if (last && last.ph === w.ph) last.to = wi + 1; else phaseSpans.push({ ph: w.ph, from: wi, to: wi + 1 }); });
const markers = [
  { d: Math.round((TUNEUP - START) / DAY_MS), label: 'Køge', c: 'var(--race)' },
  { d: Math.round((RACE - START) / DAY_MS), label: 'IM CPH', c: 'var(--race)' },
];
// Faktisk TSS pr. dag fra planstart: gennemførte pas (med de skrevne minutter hvis der er nogen) plus ekstra træning.
function actualDaily() {
  const daily = new Array(NDAYS).fill(0);
  Object.keys(byKey).forEach(key => {
    const k = byKey[key]; const e = entry(k.w.id, `${k.di}-${k.si}`);
    if (e) daily[dayIdxOf(k.wi, k.di)] += tss(k.s, typeof e.min === 'number' ? e.min : k.s.m);
  });
  for (const x of allExtras()) daily[x.dayIdx] += extraTss(x.e); // ekstra træning: TSS ud fra minutter og RPE (plan.js)
  return daily;
}
const actualUpto = () => Math.min(NDAYS, todayIdx + 1); // dage fra planstart til og med i dag (0 før planstart)
function actualPmc(daily = actualDaily()) {
  const upto = actualUpto();
  return upto > 0 ? pmc(daily.slice(0, upto)) : [];
}
let lastW = 0;
function drawPerf() {
  const box = $('pmc');
  if (!box.clientWidth) return; // fanen Analyse er skjult: grafen tegnes, når den vises (applyRoute) eller får en bredde (ResizeObserver)
  const W = Math.max(300, box.clientWidth); lastW = W;
  const padL = 30, padR = 8, H = 230, top = 22, bottom = 22, ih = H - top - bottom, iw = W - padL - padR;
  const x = d => padL + (d / (NDAYS - 1)) * iw;
  const act = actualPmc();
  const all = plannedPmc.concat(act);
  const yMax = Math.ceil(Math.max(...all.map(p => Math.max(p.ctl, p.atl))) / 20) * 20;
  const yMin = Math.min(0, Math.floor(Math.min(...all.map(p => p.tsb)) / 20) * 20);
  const y = v => top + (yMax - v) / (yMax - yMin) * ih;
  const path = (arr, f) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Planlagt fitness, træthed og friskhed over hele planen">`;
  phaseSpans.forEach((p, i) => {
    const x0 = x(p.from * 7), x1 = x(p.to * 7 - 1);
    if (i % 2 === 0) s += `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${ih}" fill="var(--sunk)" opacity=".6"/>`;
    if (x1 - x0 > PH[p.ph].name.length * 6.5 + 6) s += `<text class="ptitle" x="${x0 + 4}" y="${top - 8}">${PH[p.ph].name}</text>`;
  });
  for (let v = yMin; v <= yMax; v += 20) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" ${v === 0 ? '' : 'stroke-dasharray="2 3"'}/><text x="${padL - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  let lastM = -1;
  for (let d = 0; d < NDAYS; d++) { const dt = addDays(START, d); if (dt.getDate() === 1 && dt.getMonth() !== lastM) { lastM = dt.getMonth(); s += `<line x1="${x(d)}" x2="${x(d)}" y1="${top + ih}" y2="${top + ih + 4}" stroke="var(--muted)"/><text x="${x(d) + 2}" y="${H - 6}">${MON[dt.getMonth()].replace('.', '')}</text>`; } }
  s += `<path d="${path(plannedPmc, p => p.tsb)}" fill="none" stroke="var(--tsb)" stroke-width="1.5"/>`;
  s += `<path d="${path(plannedPmc, p => p.atl)}" fill="none" stroke="var(--atl)" stroke-width="1" opacity=".75"/>`;
  s += `<path d="${path(plannedPmc, p => p.ctl)}" fill="none" stroke="var(--ctl)" stroke-width="2.5"/>`;
  if (act.length > 1) s += `<path d="${path(act, p => p.ctl)}" fill="none" stroke="var(--ok)" stroke-width="3"/>`;
  markers.forEach(m => { s += `<line x1="${x(m.d)}" x2="${x(m.d)}" y1="${top}" y2="${top + ih}" stroke="${m.c}" stroke-width="1.5"/><text x="${x(m.d) - 3}" y="${top + 10}" text-anchor="end" style="fill:${m.c}">${m.label}</text>`; });
  if (todayIdx >= 0 && todayIdx < NDAYS) s += `<line x1="${x(todayIdx)}" x2="${x(todayIdx)}" y1="${top}" y2="${top + ih}" stroke="var(--accent)" stroke-dasharray="4 3"/><text x="${x(todayIdx) + 3}" y="${top + 10}" style="fill:var(--accent)">I dag</text>`;
  s += `<line id="hov" x1="0" x2="0" y1="${top}" y2="${top + ih}" stroke="var(--ink)" opacity="0"/><rect id="hit" x="${padL}" y="${top}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  box.innerHTML = s;
  const hit = box.querySelector('#hit'), hov = box.querySelector('#hov'), tip = $('tip');
  hit.addEventListener('pointermove', ev => {
    const r = box.getBoundingClientRect(), px = ev.clientX - r.left;
    const d = Math.min(NDAYS - 1, Math.max(0, Math.round((px - padL) / iw * (NDAYS - 1)))), p = plannedPmc[d], a = act[d];
    hov.setAttribute('x1', x(d)); hov.setAttribute('x2', x(d)); hov.setAttribute('opacity', '.35');
    const dt = addDays(START, d);
    tip.innerHTML = `${DAYS[dt.getDay() === 0 ? 6 : dt.getDay() - 1]} ${fmt(dt)} · TSS ${plannedTss[d]}<br>CTL <b>${p.ctl.toFixed(0)}</b> · ATL <b>${p.atl.toFixed(0)}</b> · TSB <b>${p.tsb.toFixed(0)}</b>${a ? `<br>Faktisk CTL <b>${a.ctl.toFixed(0)}</b>` : ''}`;
    tip.style.display = 'block';
    const bx = $('perf').getBoundingClientRect();
    tip.style.left = Math.min(bx.width - 90, Math.max(90, ev.clientX - bx.left)) + 'px';
    tip.style.top = (r.top - bx.top + top) + 'px';
  });
  hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; hov.setAttribute('opacity', '0'); });
  drawBars(W);
}
function drawBars(W) {
  const padL = 30, padR = 8, H = 156, top = 24, bottom = 6, ih = H - top - bottom, iw = W - padL - padR, maxH = 16;
  const slot = iw / weeks.length, bw = Math.max(3, slot - 2);
  const y = h => top + ih - h / maxH * ih;
  let s = `<svg class="bars-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Timer pr. uge"><text class="ptitle" x="${padL}" y="${top - 10}">Timer pr. uge</text>`;
  phaseSpans.forEach((p, i) => { if (i % 2 === 0) s += `<rect x="${padL + p.from * slot}" y="${top}" width="${(p.to - p.from) * slot}" height="${ih}" fill="var(--sunk)" opacity=".6"/>`; });
  [5, 10, 15].forEach(h => { s += `<line x1="${padL}" x2="${W - padR}" y1="${y(h)}" y2="${y(h)}" stroke="var(--line)" stroke-dasharray="2 3"/><text x="${padL - 4}" y="${y(h) + 3}" text-anchor="end">${h} t</text>`; });
  weeks.forEach((w, wi) => {
    const x0 = padL + wi * slot + (slot - bw) / 2, light = ['rec', 'exam', 'post70'].includes(w.k);
    let yy = top + ih;
    const name = `Uge ${w.n}: ${hrs(w.total)} timer, ${KIND[w.k]}`; // samme tekst som tooltippen, så det tilgængelige navn indeholder den synlige tekst
    s += `<g data-wk="${wi}" tabindex="0" role="button" aria-label="${name}"><title>${name}</title><rect x="${padL + wi * slot}" y="${top}" width="${slot}" height="${ih}" fill="transparent"/>`;
    SPORTS.forEach(sp => { if (!w.min[sp]) return; const hgt = w.min[sp] / 60 / maxH * ih; yy -= hgt; s += `<rect x="${x0}" y="${yy}" width="${bw}" height="${hgt}" fill="var(--${sp})" opacity="${light ? .45 : .9}"/>`; });
    s += `</g>`;
    if (wi === nowIdx) s += `<circle cx="${x0 + bw / 2}" cy="${top + ih + 3}" r="2.5" fill="var(--accent)"/>`;
  });
  s += `</svg>`;
  $('bars').innerHTML = s;
}
$('bars').addEventListener('click', e => { const g = e.target.closest('[data-wk]'); if (g) goToWeek(+g.dataset.wk); });
$('bars').addEventListener('keydown', e => { const g = e.target.closest('[data-wk]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goToWeek(+g.dataset.wk); } });
if (window.ResizeObserver) new ResizeObserver(() => { if (Math.abs($('pmc').clientWidth - lastW) > 4) drawPerf(); }).observe($('perf'));

// ---- Dagsskifte ----
// Fanen/appen kan have ligget i baggrunden siden i går: når den bliver synlig igen og datoen er en anden, regnes i dag og denne uge om,
// og alt der afhænger af dem tegnes igen. Står man på den uge der var "denne uge", følger man med til den nye.
function rollDay() {
  const prevIdx = todayIdx, prevNow = nowIdx;
  setToday();
  if (todayIdx === prevIdx) return;
  const follow = selIdx === prevNow, grid = $('grid'), scroll = grid.scrollTop;
  paintHeader();
  buildGrid();
  selectWeek(follow ? nowIdx : selIdx);
  paintKostTab(); // dagens og ugens kost
  refresh();
  if (follow) scrollGridTo(nowIdx, false); else grid.scrollTop = scroll;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') rollDay(); });
window.addEventListener('pageshow', rollDay);
window.addEventListener('focus', rollDay);

// ---- Guide: zonetabellen regnes ud fra grundtallene i pace.js, så den altid passer til fartene i planen ----
function paintZones() {
  const cell = v => `<td>${esc(v)}</td>`;
  $('zones').innerHTML = '<tr><th></th><th>Løb /km</th><th>Svøm /100 m</th><th>Cykel km/t</th></tr>' +
    guideRows().map(r => `<tr><td>${esc(r.name)}</td>${cell(r.run)}${cell(r.swim)}${cell(r.bike)}</tr>`).join('');
  $('zonesNote').textContent = `Z1–Z2 er snakketempo: løb under 89 % af tærskelpuls. Z4 er hårdt, kun korte ord. Zonerne regnes ud fra tre grundtal: tærskelløb ${formatPaceUnit('run', BASELINES.run)}, CSS ${formatPaceUnit('swim', BASELINES.swim)} og cykeltærskel ${formatPaceUnit('bike', BASELINES.bike)}. De er forsigtige startværdier og opdateres efter testugen i uge 5. Indendørs (spinner) køres cyklen ${INDOOR_TEXT} i stedet for km/t.`;
}
paintZones();
paintKost();

// ---- Mere: kalenderabonnement og version ----
// Selve abonnements-URL'en er hemmelig og står aldrig i siden. Linkene peger på guiderne på GitHub og tegnes her (siden selv nævner ingen eksterne adresser).
const GUIDE_URL = 'https://github.com/EmilBerntsen-ui/ironman-2027/blob/main/docs/guides/';
function paintMore() {
  const link = (file, text) => `<a href="${GUIDE_URL}${file}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  $('calSub').innerHTML = `<p>Abonnér på kalenderen i din egen kalenderapp, så står pas (og ✅ ved de gennemførte) i telefonen.</p>` +
    `<p><b>Linket er hemmeligt og står ikke her.</b> Du finder det i dine noter. Trinene står i guiderne (mappen docs/guides): ${link('kalender-iphone.md', 'iPhone')} og ${link('kalender-google.md', 'Google Kalender og Outlook')}.</p>`;
  $('aboutVersion').textContent = `Version ${BUILD.version} · ${BUILD.target === 'artifact' ? 'Artifact' : 'app'}`;
}
paintMore();

// ---- Start ----
state = store.snapshot(); // det der allerede ligger lokalt, så første billede viser det gennemførte (attach() nedenfor henter resten)
buildGrid();
paintKostTab(); // paintKost() ovenfor kørte, før tilstanden var læst: dagens kost skal også have de ekstra der allerede ligger lokalt
const startRoute = parseRoute(location.hash, weeks.length);
selectWeek(startRoute.week !== null ? startRoute.week : nowIdx); // et ugelink (#u12) åbner kalenderen ved den uge
refresh();
applyRoute();
requestAnimationFrame(() => scrollGridTo(selIdx, false));

attach(store);
const first = pickStore();
if (first) swapTo(first);
// Indstillingerne tegnes direkte i fanen Mere (#settingsMount). Statusknapperne og ⚙ åbner fanen (navigate), og "Angiv vægt" åbner den med markøren i vægtfeltet.
settings = mountSettings({ store, target: BUILD.target, version: BUILD.version, container: $('settingsMount'), onReveal: () => navigate('mere'),
  gist: typeof GistStore !== 'undefined' ? GistStore : null, onWeight: kg => { weight = kg; repaintKost(); repaintSheetKost(); } });
// En anden fane har ændret vægten: følg med (storage-hændelsen kommer kun fra andre faner).
window.addEventListener('storage', ev => {
  if (ev.key !== null && ev.key !== WEIGHT_KEY) return;
  const next = loadWeight();
  if (next !== weight) { weight = next; repaintKost(); if (settings) settings.syncWeight(); }
});
// Artifact: claude.use('db') kan tage op til 10 s. Start straks på LocalStore (alt gemmes lokalt), og skift, når databasen er klar.
if (BUILD.target === 'artifact' && typeof ArtifactDbStore !== 'undefined') {
  savemode.textContent = 'Forbinder…';
  ArtifactDbStore.open().then(db => { if (db) swapTo(db); else paintStatus(store.status); }, () => paintStatus(store.status));
}
