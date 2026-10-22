// ---- App: kalender, detaljevisning, PMC-graf og gemning ----
// Forudsætter at disse er inlinet før denne fil: plan.js (plan, PH, START, RACE, TUNEUP, addDays, tss, pmc, plannedDailyTss),
// progress.js (isDone, sessionSig), store/local.js (LocalStore), settings.js (mountSettings) og BUILD fra bundleren.
// ArtifactDbStore (kun artifact-målet) og GistStore (kun site-målet) findes kun i deres eget mål: brug typeof-vagt.
const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const DAYS_LONG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const MON = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const KIND = { start: 'Startuge', build: 'Opbygning', rec: 'Let uge + test', exam: 'Eksamen', race70: 'Køge Jernmand', post70: 'Restitution', taper: 'Nedtrapning', race: 'Raceuge' };
const SPORT = { swim: 'Svømning', bike: 'Cykling', run: 'Løb', str: 'Styrke', race: 'Konkurrence', rest: 'Hvile' };
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

function status(wi, di, si, s) {
  if (s.s === 'rest') return 'rest';
  const e = entry(weeks[wi].id, `${di}-${si}`);
  if (e) return (typeof e.min === 'number' && s.m && Math.abs(e.min - s.m) / s.m > 0.2) ? 'off' : 'done';
  return dayIdxOf(wi, di) < todayIdx ? 'miss' : 'future';
}
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
  return { plan, done, n, nDone, tssP, planMin: sum(plan), doneMin: sum(done) };
}

// ---- Header ----
function paintHeader() {
  $('days').textContent = Math.max(0, Math.round((RACE - today) / DAY_MS));
  const toK = Math.round((TUNEUP - today) / DAY_MS);
  $('tuneup').textContent = toK > 0 ? `Køge Jernmand om ${toK} dage (13. jun.)` : toK === 0 ? 'Køge Jernmand i dag!' : '';
}
paintHeader();

// ---- Kort (workout card) ----
function cardHtml(w, wi, di, si, s) {
  const key = `${w.id}-${di}-${si}`;
  const chk = s.s === 'rest' ? '' : `<button class="chk" data-chk="${key}" aria-label="Markér ${esc(s.t)} som gennemført"></button>`;
  return `<div class="card c-${s.s} ${s.s} st-${status(wi, di, si, s)}" data-key="${key}">` +
    `<button class="open" data-open="${key}"><span class="t">${esc(s.t)}</span>${s.m ? `<span class="m">${dur(s.m)}</span>` : ''}<span class="d">${esc(s.d)}</span></button>${chk}</div>`;
}
const pills = (w, wi) => `<span class="pill k-${w.k}">${KIND[w.k]}</span><span class="pill">${PH[w.ph].name}</span>` +
  (w.event ? `<span class="pill evt">${esc(w.event[0])}</span>` : '') +
  (wi === nowIdx ? `<span class="pill nowpill">${todayIdx < 0 ? 'Starter mandag' : 'Denne uge'}</span>` : '');

// ---- Desktop: ugegitter ----
function sumHtml(w) {
  const st = weekStats(w);
  return `<div class="hh num">${hrs(st.doneMin)}<small> / ${hrs(st.planMin)} t</small></div>` +
    `<div class="row"><span>Pas</span><b>${st.nDone}/${st.n}</b></div>` +
    `<div class="row"><span>Planlagt TSS</span><b>${st.tssP}</b></div>` +
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
        return `<div class="gd${isToday ? ' today' : ''}"><span class="dt">${isToday ? 'I dag · ' : ''}${fmt(date)}</span>${d.map((s, si) => cardHtml(w, wi, di, si, s)).join('')}</div>`;
      }).join('') +
      `<div class="gsum" data-sum="${w.id}">${sumHtml(w)}</div></div></div>`;
  });
  $('grid').innerHTML = h;
}
function scrollGridTo(wi, smooth) {
  const g = $('grid'), el = $('g-' + weeks[wi].id), head = g.querySelector('.gdow');
  if (!el || !g.clientHeight) return;
  g.scrollTo({ top: el.offsetTop - head.offsetHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
}

// ---- Telefon: dagsliste for valgt uge ----
function buildAgenda() {
  const wi = selIdx, w = weeks[wi], st = weekStats(w), end = addDays(w.start, 6);
  const mix = SPORTS.filter(s => st.plan[s]).map(s => `<i style="flex:${st.plan[s]};background:var(--${s})"></i>`).join('');
  let h = `<div class="ag-head${wi === nowIdx ? ' now' : ''}">` +
    `<div class="ag-top"><span class="wn">Uge ${w.n}</span><span>${fmt(w.start)} – ${fmt(end)}</span></div>` +
    `<div class="ag-top">${pills(w, wi)}</div>` +
    `<div class="ag-stats"><span>Timer <b>${hrs(st.doneMin)} / ${hrs(st.planMin)}</b></span><span>Pas <b>${st.nDone}/${st.n}</b></span><span>TSS <b>${st.tssP}</b></span></div>` +
    `<div class="mix" aria-hidden="true">${mix}</div>` +
    (w.note ? `<div class="ag-note">${esc(w.note)}</div>` : '') + `</div>`;
  w.days.forEach((d, di) => {
    const date = addDays(w.start, di), isToday = dayIdxOf(wi, di) === todayIdx;
    h += `<div class="ag-day${isToday ? ' today' : ''}"><div class="lbl">${DAYS_LONG[di]}<small>${fmt(date)}${isToday ? ' · i dag' : ''}</small></div>${d.map((s, si) => cardHtml(w, wi, di, si, s)).join('')}</div>`;
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
  document.querySelectorAll('.card[data-key]').forEach(el => {
    const k = byKey[el.dataset.key]; if (!k) return;
    el.className = el.className.replace(/\bst-\w+/, 'st-' + status(k.wi, k.di, k.si, k.s));
  });
  weeks.forEach(w => { const el = document.querySelector(`[data-sum="${w.id}"]`); if (el) el.innerHTML = sumHtml(w); });
  buildAgenda();
  let done = 0, total = 0;
  weeks.forEach(w => { const st = weekStats(w); done += st.nDone; total += st.n; });
  $('ptext').textContent = `${done} af ${total} pas gennemført`;
  $('pbar').style.width = (done / total * 100) + '%';
  drawPerf();
}

// ---- Gemning: en Store (src/store/*) ----
let store = new LocalStore(); // lokal cache fra første billede; skiftes ud når GistStore/ArtifactDbStore er klar
let detach = () => {};
let settings = null;
const savemode = $('savemode');
function paintStatus(st) { savemode.textContent = st.label; savemode.dataset.state = st.state; }
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
let openKey = null, rpe = null;
function openSheet(key) {
  const k = byKey[key]; if (!k) return;
  const { w, di, s } = k; openKey = key;
  const e = entry(w.id, `${k.di}-${k.si}`);
  rpe = e && e.rpe ? e.rpe : null;
  const date = addDays(w.start, di);
  const facts = s.s === 'rest' ? '' : `<div class="sh-facts"><div><small>Planlagt</small><b class="num">${dur(s.m)}</b></div><div><small>Est. TSS</small><b class="num">${tss(s)}</b></div><div><small>Intensitet</small><b class="num">${s.s === 'str' ? '–' : intensity(s).toLocaleString('da-DK')}</b></div></div>`;
  const form = s.s === 'rest' ? '' : `<form id="logf">
      <label class="chkrow"><input type="checkbox" id="fDone"${e ? ' checked' : ''}> Gennemført</label>
      <label class="field">Faktisk varighed (min)<input type="number" id="fMin" inputmode="numeric" min="0" max="900" step="1" placeholder="${s.m}" value="${e && typeof e.min === 'number' ? e.min : ''}"></label>
      <div class="field"><span id="rpeLbl">RPE (1 = meget let, 10 = maks)</span><div class="rpe" role="group" aria-labelledby="rpeLbl">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-rpe="${i + 1}" aria-pressed="${rpe === i + 1}">${i + 1}</button>`).join('')}</div></div>
      <label class="field">Note<textarea id="fNote" maxlength="1000" placeholder="Hvordan gik det?">${e && e.note ? esc(e.note) : ''}</textarea></label>
      <div class="msg" id="fMsg"></div>
      <div class="sh-actions"><button type="button" class="btn" id="fCancel">Annuller</button><button type="submit" class="btn primary">Gem</button></div>
    </form>`;
  const sh = $('sh');
  sh.className = `sh c-${s.s}`;
  sh.innerHTML = `<div class="sh-top"><div><div class="sh-sport">${SPORT[s.s]}</div><h3 id="shTitle">${esc(s.t)}</h3><div class="when">${DAYS_LONG[di]} ${fmt(date)} ${date.getFullYear()} · Uge ${w.n} · ${PH[w.ph].name}</div></div><button class="x" id="fClose" aria-label="Luk">×</button></div>
    <p class="desc">${esc(s.d)}</p>${facts}${form}`;
  if (!sheet.open) sheet.showModal();
}
sheet.addEventListener('click', ev => {
  if (ev.target === sheet || ev.target.closest('#fClose') || ev.target.closest('#fCancel')) { sheet.close(); return; }
  const b = ev.target.closest('[data-rpe]');
  if (b) {
    const v = +b.dataset.rpe; rpe = rpe === v ? null : v;
    sheet.querySelectorAll('[data-rpe]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.rpe === rpe)));
    if (rpe) $('fDone').checked = true;
  }
});
sheet.addEventListener('input', ev => { if (ev.target.id === 'fMin' || ev.target.id === 'fNote') { if (ev.target.value) $('fDone').checked = true; } });
sheet.addEventListener('submit', ev => {
  ev.preventDefault();
  const k = byKey[openKey]; if (!k) return;
  const prev = entry(k.w.id, `${k.di}-${k.si}`);
  if (!$('fDone').checked) { setEntry(openKey, null); sheet.close(); return; }
  const raw = $('fMin').value.trim(), min = raw === '' ? null : Math.round(Number(raw));
  if (raw !== '' && !(min >= 0 && min <= 900)) { $('fMsg').textContent = 'Skriv varigheden i hele minutter (0–900).'; return; }
  const note = $('fNote').value.trim();
  const val = { at: (prev && prev.at) || new Date().toISOString() };
  if (min !== null) val.min = min;
  if (rpe) val.rpe = rpe;
  if (note) val.note = note;
  setEntry(openKey, val); sheet.close();
});
sheet.addEventListener('close', () => { openKey = null; });

document.addEventListener('click', ev => {
  const c = ev.target.closest('[data-chk]');
  if (c) {
    const k = byKey[c.dataset.chk], e = entry(k.w.id, `${k.di}-${k.si}`);
    if (e && (e.min != null || e.rpe || e.note)) openSheet(c.dataset.chk); // har detaljer: åbn i stedet for at slette
    else setEntry(c.dataset.chk, e ? null : { at: new Date().toISOString() });
    return;
  }
  const o = ev.target.closest('[data-open]');
  if (o) openSheet(o.dataset.open);
});

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
function goToWeek(wi) {
  selectWeek(wi);
  const target = $('grid').clientHeight ? $('grid') : $('agenda');
  target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  scrollGridTo(wi, false);
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
function actualPmc() {
  const daily = new Array(NDAYS).fill(0);
  Object.keys(byKey).forEach(key => {
    const k = byKey[key]; const e = entry(k.w.id, `${k.di}-${k.si}`);
    if (e) daily[dayIdxOf(k.wi, k.di)] += tss(k.s, typeof e.min === 'number' ? e.min : k.s.m);
  });
  const upto = Math.min(NDAYS, todayIdx + 1);
  return upto > 0 ? pmc(daily.slice(0, upto)) : [];
}
let lastW = 0;
function drawPerf() {
  const box = $('pmc'); const W = Math.max(300, box.clientWidth); lastW = W;
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
  refresh();
  if (follow) scrollGridTo(nowIdx, false); else grid.scrollTop = scroll;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') rollDay(); });
window.addEventListener('pageshow', rollDay);
window.addEventListener('focus', rollDay);

// ---- Start ----
buildGrid();
selectWeek(nowIdx);
refresh();
requestAnimationFrame(() => scrollGridTo(nowIdx, false));

attach(store);
const first = pickStore();
if (first) swapTo(first);
settings = mountSettings({ store, target: BUILD.target, version: BUILD.version, openButton: savemode, gist: typeof GistStore !== 'undefined' ? GistStore : null });
// Artifact: claude.use('db') kan tage op til 10 s. Start straks på LocalStore (alt gemmes lokalt), og skift, når databasen er klar.
if (BUILD.target === 'artifact' && typeof ArtifactDbStore !== 'undefined') {
  savemode.textContent = 'Forbinder…';
  ArtifactDbStore.open().then(db => { if (db) swapTo(db); else paintStatus(store.status); }, () => paintStatus(store.status));
}
