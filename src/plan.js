// ---- Plan data: IRONMAN Copenhagen 2027, 43 uger fra man. 26. okt. 2026 ----
export const START = new Date(2026, 9, 26);
export const RACE = new Date(2027, 7, 22);   // IRONMAN Copenhagen, søn. 22. aug. 2027
export const TUNEUP = new Date(2027, 5, 13); // Køge Jernmand, søn. 13. jun. 2027

// Zoner (se src/pace.js): easy/z2 = rolig, im = IM-fart (racefart), hm = halvmaratonfart, tempo, ss = sweet spot, thr = tærskel,
// z4 = 10 km-fart, css = CSS (svøm). Hvert interval er [tekst, zone] (zone = hovedsættets zone); long/brick/lrun er [tekst, zone, hovedsætszone?].
export const PH = {
  base1: {
    name: 'Grundform 1', span: 'okt–dec',
    swim: [['8×100 m (20 s pause)', 'css'], ['10×100 m (20 s pause)', 'css'], ['6×200 m (30 s pause)', 'css']],
    bike: [['3×8 min sweet spot, 4 min pause', 'ss'], ['3×10 min sweet spot', 'ss'], ['3×12 min sweet spot', 'ss']],
    run: [['6×2 min Z4 / 2 min jog', 'z4'], ['5×3 min Z4 / 2 min jog', 'z4'], ['5×4 min Z4 / 2 min jog', 'z4']],
    long: ['Z2 hele vejen, kadence 85–95. Drik og spis lidt hver 20. min', 'z2'],
    brick: ['Lige efter cyklen, roligt', 'easy'],
    lrun: ['Z2, snakketempo. Gå gerne 1 min hver 10. min de første uger', 'z2'],
    strTue: 'Tunge basisløft 3×6–8: squat, rumænsk dødløft, split squat, pull-ups, planke',
    strTueMin: 40,
    fri: ['Styrke (på arbejdet)', 'Let: step-ups, enbens-dødløft, sidelæns planke, hofteløft. Højst 30 min', 30],
  },
  base2: {
    name: 'Grundform 2', span: 'jan–feb',
    swim: [['12×100 m i CSS-fart (15 s pause)', 'css'], ['5×200 m CSS (20 s pause)', 'css'], ['4×300 m (30 s pause)', 'css']],
    bike: [['3×12 min sweet spot', 'ss'], ['2×20 min sweet spot', 'ss'], ['3×15 min sweet spot', 'ss']],
    run: [['6×4 min Z4 / 2 min jog', 'z4'], ['4×6 min tærskel / 2 min jog', 'thr'], ['3×8 min tærskel / 2 min jog', 'thr']],
    long: ['Z2, kadence 85–95. Ude når vejret tillader, ellers 2 t indendørs + resten ude', 'z2'],
    brick: ['Lige efter cyklen, roligt', 'easy'],
    lrun: ['Z2, snakketempo', 'z2'],
    strTue: 'Basisløft 3×6–8: squat, rumænsk dødløft, split squat, pull-ups, planke',
    strTueMin: 40,
    fri: ['Styrke (på arbejdet)', 'Let: step-ups, enbens-dødløft, sidelæns planke, hofteløft. Højst 30 min', 30],
  },
  build1: {
    name: 'Opbygning 1', span: 'mar–apr',
    swim: [['3×400 m (30 s pause)', 'css'], ['10×150 m CSS (20 s pause)', 'css'], ['2×600 m (45 s pause)', 'css']],
    bike: [['4×8 min tærskel, 4 min pause', 'thr'], ['3×12 min tærskel', 'thr'], ['2×20 min tærskel', 'thr']],
    run: [['3×10 min tærskel / 2 min jog', 'thr'], ['2×15 min tærskel / 3 min jog', 'thr'], ['5×1 km i 10 km-fart / 90 s jog', 'z4']],
    long: ['Z2 med 2×20 min IM-fart. Spis 60–80 g kulhydrat i timen', 'z2', 'im'],
    brick: ['Lige efter cyklen, første 10 min i IM-maratonfart', 'easy', 'im'],
    lrun: ['Z2, sidste 15 min i IM-maratonfart', 'z2', 'im'],
    strTue: 'Vedligehold 2×6: squat, dødløft, step-ups, core',
    strTueMin: 30,
    fri: ['Hviledag', 'Fri. Eventuelt 15 min mobilitet', 0],
  },
  build2: {
    name: 'Opbygning 2', span: 'maj–jun',
    swim: [['4×400 m (30 s pause)', 'css'], ['3×600 m (45 s pause)', 'css'], ['1500 m tempo, jævnt', 'im']],
    bike: [['3×20 min sweet spot', 'ss'], ['2×30 min IM-fart + 10 min tærskel', 'im'], ['4×10 min tærskel', 'thr']],
    run: [['3×12 min tærskel / 2 min jog', 'thr'], ['40 min i halvmaratonfart', 'hm'], ['2×20 min tærskel / 3 min jog', 'thr']],
    long: ['Z2 med 3×30 min IM-fart. Ét lige så spisested som på racedagen: 70–90 g kulhydrat i timen', 'z2', 'im'],
    brick: ['Lige efter cyklen i IM-maratonfart', 'im'],
    lrun: ['Z2, sidste 25 min i IM-maratonfart', 'z2', 'im'],
    strTue: 'Vedligehold 2×6: squat, dødløft, core',
    strTueMin: 25,
    fri: ['Hviledag', 'Fri. Eventuelt 15 min mobilitet', 0],
  },
  peak: {
    name: 'Specifik fase', span: 'jul',
    swim: [['3×800 m i racetempo (45 s pause)', 'im'], ['20×100 m CSS (10 s pause)', 'css'], ['2000 m sammenhængende i racetempo', 'im']],
    bike: [['2×30 min sweet spot', 'ss'], ['3×20 min lige over IM-fart', 'ss'], ['60 min IM-fart i ét stræk', 'im']],
    run: [['3×15 min tempo / 3 min jog', 'tempo'], ['50 min i IM-maratonfart', 'im'], ['6×5 min tærskel / 90 s jog', 'thr']],
    long: ['Z2 med 3×45 min IM-fart i aero. Fuld racedagsernæring: 80–90 g kulhydrat i timen, samme produkter som på dagen', 'z2', 'im'],
    brick: ['Lige efter cyklen i IM-maratonfart', 'im'],
    lrun: ['Z2 med 2×20 min IM-maratonfart. Øv gel/drik undervejs', 'z2', 'im'],
    strTue: 'Core og mobilitet',
    strTueMin: 20,
    fri: ['Hviledag', 'Fri. Eventuelt 15 min mobilitet', 0],
  },
  taper: {
    name: 'Nedtrapning', span: 'aug',
    swim: [['6×200 m racetempo', 'im'], ['8×100 m racetempo', 'im'], ['4×100 m racetempo', 'im']],
    bike: [['3×15 min IM-fart', 'im'], ['3×10 min IM-fart', 'im'], ['3×5 min IM-fart', 'im']],
    run: [['3×10 min IM-maratonfart', 'im'], ['4×5 min IM-maratonfart', 'im'], ['4×3 min IM-maratonfart', 'im']],
    long: ['Z2 med 2×30 min IM-fart. Racedagsernæring og racetøj', 'z2', 'im'],
    brick: ['IM-maratonfart', 'im'],
    lrun: ['Z2, sidste 15 min i IM-maratonfart', 'z2', 'im'],
    strTue: 'Core og mobilitet',
    strTueMin: 15,
    fri: ['Hviledag', 'Fri', 0],
  },
};

// kind: start | build | rec | exam | race70 | post70 | taper | race
// p: si = svømmeintervaller (m), sl = lang svøm (m), rE = roligt løb tor. (0 = intet), bT = cykel fre., bW = cykel ons.,
//    rI = løb tir., lr = lang cykel, br = brick, ln = langt løb (min); st = styrke tir. og fs = styrke fre. (min; standard: fasen / 20 om vinteren)
// lv: 1–3 = blid opstart (INTRO) i stedet for fasens intervaller
export const WEEKS = [
  { k: 'start', ph: 'base1', note: 'Blid startuge uden tests: kun rolige pas i Z1–Z2, så kroppen vænner sig til belastningen. Tilmeld dig IRONMAN Copenhagen (søn. 22. aug. 2027) hurtigst muligt. Køge Jernmand (13. jun.) kan tilmeldes på sportstiming.dk/event/18710.' },
  { k: 'build', ph: 'base1', lv: 1, p: { si: 1200, sl: 1400, rE: 0, bT: 40, bW: 30, rI: 30, lr: 60, br: 10, ln: 45, st: 30, fs: 0 } },
  { k: 'build', ph: 'base1', lv: 2, p: { si: 1400, sl: 1600, rE: 20, bT: 45, bW: 25, rI: 35, lr: 70, br: 10, ln: 45, st: 30, fs: 0 } },
  { k: 'build', ph: 'base1', lv: 3, p: { si: 1400, sl: 1600, rE: 20, bT: 45, bW: 30, rI: 35, lr: 85, br: 10, ln: 50, st: 30, fs: 20 } },
  { k: 'rec', ph: 'base1', note: 'Testuge: notér resultaterne og send dem, så opdateres pace-zonerne.' },
  { k: 'build', ph: 'base1', p: { si: 1800, sl: 2000, rE: 25, bT: 55, bW: 30, rI: 40, lr: 95, br: 10, ln: 50 }, note: 'Sidste uge før eksamen. Læg pas om morgenen, så læsedagen er fri.' },
  { k: 'exam', ph: 'base1' },
  { k: 'exam', ph: 'base1' },
  { k: 'build', ph: 'base1', p: { si: 1800, sl: 2000, rE: 25, bT: 60, bW: 35, rI: 45, lr: 105, br: 10, ln: 55 }, note: 'Juleferie: ekstra tid. Juleaften er torsdag: svøm om morgenen, og drop det rolige løb.' },
  { k: 'build', ph: 'base1', p: { si: 2000, sl: 2200, rE: 30, bT: 60, bW: 35, rI: 50, lr: 110, br: 10, ln: 60 }, note: 'Nytårsaften er torsdag. Svømmehallen kan have kortere åbningstider i helligdagene.' },
  { k: 'rec', ph: 'base1' },
  { k: 'build', ph: 'base2', p: { si: 2000, sl: 2200, rE: 30, bT: 60, bW: 40, rI: 50, lr: 120, br: 10, ln: 60 } },
  { k: 'build', ph: 'base2', p: { si: 2200, sl: 2400, rE: 30, bT: 65, bW: 40, rI: 50, lr: 135, br: 15, ln: 65 } },
  { k: 'build', ph: 'base2', p: { si: 2200, sl: 2400, rE: 30, bT: 60, bW: 40, rI: 40, lr: 90, br: 0, ln: 0 }, event: ['10 km-løb', 'Første mellemmål. Fuld indsats. Torsdag kort, lørdag rolig.'], note: 'Find et 10 km-løb i slutningen af januar, eller løb en tidskørsel alene.' },
  { k: 'rec', ph: 'base2', note: 'Nyt semester starter. Når skemaet ligger fast, så flyt dagene, men behold rækkefølgen hård/let.' },
  { k: 'build', ph: 'base2', p: { si: 2200, sl: 2600, rE: 30, bT: 70, bW: 40, rI: 50, lr: 135, br: 15, ln: 70 } },
  { k: 'build', ph: 'base2', p: { si: 2400, sl: 2600, rE: 30, bT: 70, bW: 45, rI: 50, lr: 150, br: 15, ln: 75 } },
  { k: 'build', ph: 'base2', p: { si: 2400, sl: 2800, rE: 30, bT: 75, bW: 45, rI: 55, lr: 150, br: 20, ln: 80 } },
  { k: 'rec', ph: 'base2', note: 'Book en bikefit nu, så du har tid til at vænne dig til positionen før de lange ture.' },
  { k: 'build', ph: 'build1', p: { si: 2800, sl: 3200, rE: 40, bT: 90, bW: 45, rI: 60, lr: 195, br: 25, ln: 95 } },
  { k: 'build', ph: 'build1', p: { si: 3000, sl: 3400, rE: 40, bT: 90, bW: 45, rI: 60, lr: 210, br: 25, ln: 100 } },
  { k: 'build', ph: 'build1', p: { si: 3000, sl: 3500, rE: 45, bT: 90, bW: 45, rI: 60, lr: 225, br: 30, ln: 105 } },
  { k: 'rec', ph: 'build1', note: 'Påske. Fri fra skole er god tid til en ekstra lang, rolig tur, men hold ugen let.' },
  { k: 'build', ph: 'build1', p: { si: 3000, sl: 3500, rE: 45, bT: 90, bW: 45, rI: 60, lr: 225, br: 30, ln: 105 } },
  { k: 'build', ph: 'build1', p: { si: 3200, sl: 3600, rE: 45, bT: 90, bW: 45, rI: 60, lr: 240, br: 30, ln: 110 } },
  { k: 'build', ph: 'build1', p: { si: 3200, sl: 3600, rE: 45, bT: 90, bW: 45, rI: 40, lr: 75, br: 0, ln: 0 }, event: ['Halvmaraton', 'Andet mellemmål. Løb i tærskelfart de første 15 km, giv alt de sidste 6. Lørdag kort og rolig.'], note: 'Find et halvmaraton sidst i april, eller løb 21,1 km alene som test.' },
  { k: 'rec', ph: 'build1' },
  { k: 'build', ph: 'build2', p: { si: 3200, sl: 3800, rE: 35, bT: 90, bW: 45, rI: 60, lr: 255, br: 30, ln: 115 }, note: 'Lange ture ude fra nu. Tjek dæk, kæde og bremser.' },
  { k: 'build', ph: 'build2', p: { si: 3400, sl: 3800, rE: 35, bT: 90, bW: 45, rI: 60, lr: 270, br: 35, ln: 120 } },
  { k: 'exam', ph: 'build2' },
  { k: 'exam', ph: 'build2', test: true },
  { k: 'build', ph: 'build2', p: { si: 3400, sl: 4000, rE: 35, bT: 90, bW: 45, rI: 60, lr: 285, br: 40, ln: 120 }, note: 'Open water-sæsonen starter. Svøm aldrig alene i åbent vand; brug en svømmebøje.', ow: true },
  { k: 'race70', ph: 'build2', note: 'Generalprøve: Køge Jernmand søndag 13. juni (1,9 km / 90 km / 21,1 km, DM Middeldistance). Tilmelding på sportstiming.dk/event/18710. Test udstyr, ernæring og skift præcis som på racedagen.' },
  { k: 'post70', ph: 'build2' },
  { k: 'build', ph: 'build2', p: { si: 3400, sl: 4000, rE: 35, bT: 90, bW: 45, rI: 60, lr: 285, br: 40, ln: 120 }, ow: true },
  { k: 'build', ph: 'peak', p: { si: 3400, sl: 3600, rE: 30, bT: 90, bW: 45, rI: 60, lr: 300, br: 30, ln: 125 }, ow: true },
  { k: 'build', ph: 'peak', p: { si: 3400, sl: 3800, rE: 30, bT: 90, bW: 40, rI: 60, lr: 315, br: 30, ln: 135 }, ow: true, note: 'En af planens to største uger.' },
  { k: 'rec', ph: 'peak', ow: true },
  { k: 'build', ph: 'peak', p: { si: 3400, sl: 3800, rE: 30, bT: 90, bW: 40, rI: 60, lr: 315, br: 30, ln: 135 }, ow: true },
  { k: 'build', ph: 'peak', p: { si: 3400, sl: 3800, rE: 30, bT: 90, bW: 40, rI: 60, lr: 300, br: 30, ln: 135 }, ow: true, note: 'Sidste lange tur og sidste lange løb. Gennemfør ernæringsplanen fra A til Z.' },
  { k: 'taper', ph: 'taper', p: { si: 2800, sl: 3000, rE: 30, bT: 75, bW: 45, rI: 50, lr: 210, br: 20, ln: 90 }, ow: true, note: 'Nedtrapning: mindre volumen, behold lidt fart. Det er normalt at føle sig tung.' },
  { k: 'taper', ph: 'taper', p: { si: 2200, sl: 2400, rE: 25, bT: 60, bW: 40, rI: 40, lr: 135, br: 15, ln: 65 }, ow: true, note: 'Sov meget. Pak og tjek udstyret. Lav en tidsplan for racedagen.' },
  { k: 'race', ph: 'taper', note: 'Raceuge. Spis kulhydratrigt fra torsdag. Ingenting nyt på racedagen.' },
];

const swimMin = m => Math.round(m / 100 * 2.2 / 5) * 5;
// Hvert pas bærer sin zone `z` (se src/pace.js), evt. `main` (hovedsættets zone), `ind` (cykel: true = indendørs, 'opt' = indendørs eller ude)
// og `legs` (triatlon-løb: zone pr. gren). Zonerne er mærket her og aldrig udledt af teksten.
const x = (main, ind) => ({ ...(main ? { main } : {}), ...(ind ? { ind } : {}) });
const S = {
  swim: (t, d, m, z, o) => ({ s: 'swim', t, d: d + ` · ${m.toLocaleString('da-DK')} m`, m: swimMin(m), z, ...o }),
  bike: (t, d, m, z, o) => ({ s: 'bike', t, d, m, z, ...o }),
  run: (t, d, m, z, o) => ({ s: 'run', t, d, m, z, ...o }),
  str: (t, d, m) => ({ s: 'str', t, d, m, z: 'str' }),
  rest: (t, d) => ({ s: 'rest', t, d, m: 0, z: 'rest' }),
  race: (t, d, m, z, o) => ({ s: 'race', t, d, m, z, ...o }),
};

const WINTER = ph => ph === 'base1' || ph === 'base2';
// Uge 2–4 (lv 1–3): blid opstart i stedet for fasens intervaller. [tekst, hovedsætszone]; null = ingen hovedsæt, hele passet er roligt.
// Uge 2 er roligt med strides, uge 3 de første lette intervaller, uge 4 lidt mere (og fasens styrke).
const INTRO = [
  { swim: ['6×100 m roligt, fokus på teknik (20 s pause)', null], bike: null, run: null, str: ['Styrke – let', 'Let: 2×8 squat, rumænsk dødløft, split squat og planke. Halv vægt, god teknik'] },
  { swim: ['6×100 m i CSS-fart (20 s pause)', 'css'], bike: ['3×6 min sweet spot, 4 min pause', 'ss'], run: ['5×1 min Z4 / 2 min jog', 'z4'], str: ['Styrke', 'Basisløft 2×8, moderat vægt: squat, rumænsk dødløft, split squat, pull-ups, planke'] },
  { swim: ['8×100 m (20 s pause)', 'css'], bike: ['3×8 min sweet spot, 4 min pause', 'ss'], run: ['5×2 min Z4 / 2 min jog', 'z4'], str: null },
];
const spinWhere = ph => WINTER(ph) ? 'Spinneren på arbejdspladsen, frokost eller lige efter arbejde' : 'Ude efter arbejde, eller spinneren på arbejdspladsen';

// Ugen: man hvile/rolig svøm · tir løbeintervaller + styrke · ons lang svøm + let cykel
// tor din faste morgensvømning (intervaller) + roligt løb · fre spinner med intervaller · lør lang cykel · søn langt løb
function buildDays(w, pos) {
  const p = w.p, ph = PH[w.ph], i = (pos - 1) % 3;
  const wk = w.lv ? INTRO[w.lv - 1] : null;
  const [swT, swZ] = wk ? wk.swim : ph.swim[i], [bkT, bkZ] = wk ? wk.bike ?? [] : ph.bike[i], [rnT, rnZ] = wk ? wk.run ?? [] : ph.run[i];
  const [lgT, lgZ, lgM] = ph.long, [brT, brZ, brM] = ph.brick, [lrT, lrZ, lrM] = ph.lrun;
  const ow = w.ow ? ' Open water med våddragt, hvis vandet er over 15 °C, ellers i bassin.' : '';
  const spin = WINTER(w.ph) ? true : 'opt'; // fredagens cykel: spinneren om vinteren, ellers ude eller spinneren
  const mon = WINTER(w.ph) || w.ph === 'taper'
    ? [S.rest('Hviledag', 'Fri efter weekenden. Eventuelt 15 min mobilitet')]
    : [S.swim('Restitutionssvøm', 'Helt roligt, teknik og pull buoy. Spring over, hvis du er træt', 1500, 'easy')];
  const fri = [bkT
    ? S.bike('Cykel med intervaller', `Z2 med ${bkT}. ${spinWhere(w.ph)}`, p.bT, 'z2', x(bkZ, spin))
    : S.bike('Rolig cykel', `Z2 hele vejen, jævn kadence 85–95. ${spinWhere(w.ph)}`, p.bT, 'z2', x(null, spin))];
  const fs = p.fs ?? 20;
  if (WINTER(w.ph) && fs) fri.push(S.str('Styrke (på arbejdet)', 'Let i træningsrummet: step-ups, enbens-dødløft, sidelæns planke, hofteløft', fs));
  const days = [
    mon,
    [rnT
      ? S.run('Løbeintervaller', `15 min opvarmning · ${rnT} · resten nedløb`, p.rI, 'easy', x(rnZ))
      : S.run('Roligt løb med strides', 'Z2, snakketempo. Afslut med 5 strides à 20 s: let og løbende, ikke sprint. Gå tilbage imellem', p.rI, 'z2'),
     wk?.str ? S.str(wk.str[0], wk.str[1], p.st) : S.str('Styrke', ph.strTue, p.st ?? ph.strTueMin)],
    [S.swim('Lang svømmetur', 'Sammenhængende i jævnt tempo, pull buoy på sidste tredjedel.' + ow, p.sl, 'easy'),
     S.bike('Let cykeltur', 'Z1–Z2, høj kadence. cyklen på studiet eller ude', p.bW, 'easy', x(null, 'opt'))],
    [S.swim('Svømmeintervaller (morgen)', `Din faste torsdagssvømning: opv. 300 m · teknik 4×50 m · hovedsæt ${swT} · resten roligt`, p.si, 'easy', x(swZ)),
     ...(p.rE ? [S.run('Roligt løb', 'Z2, snakketempo. Efter studiet', p.rE, 'z2')] : [])],
    fri,
    [S.bike('Lang cykeltur', lgT, p.lr, lgZ, x(lgM, w.ph === 'base2' ? 'opt' : null))],
    [],
  ];
  if (p.br) days[5].push(S.run('Brick-løb', brT, p.br, brZ, x(brM)));
  if (w.event) {
    const half = w.event[0] === 'Halvmaraton';
    days[1] = [S.run('Løbeintervaller', '15 min opv. · 4×4 min i løbsfart · nedløb', 45, 'easy', x(half ? 'hm' : 'z4')), S.str('Styrke', ph.strTue, ph.strTueMin)];
    days[4] = [S.bike('Rolig spinner', 'Z2 med 3×3 min sweet spot. ' + spinWhere(w.ph), 45, 'z2', x('ss', spin))];
    days[5] = [S.bike('Rolig cykeltur', 'Z1–Z2, 3 korte spurter. Gør klar til i morgen', p.lr, 'easy', x(null, WINTER(w.ph) ? 'opt' : null))];
    days[6] = [S.race(w.event[0], w.event[1], half ? 120 : 75, half ? 'thr' : 'z4')];
  } else {
    days[6] = [S.run('Langt løb', lrT, p.ln, lrZ, x(lrM))];
  }
  return days;
}

function recDays(w) {
  const ow = w.ow ? ' Open water, hvis muligt.' : '';
  const big = { base1: [1500, 75, 45], base2: [2000, 105, 55], build1: [2400, 135, 70], build2: [2600, 165, 75], peak: [2800, 210, 85] }[w.ph];
  return [
    [S.rest('Hviledag', 'Fri')],
    [S.run('Løbetest', '15 min opv. · 30 min all-out alene · notér gennemsnitspace og gennemsnitspuls for de sidste 20 min (= tærskelfart og tærskelpuls)', 55, 'test'),
     S.str('Styrke, let', 'Halv vægt, kun teknik', 20)],
    [S.swim('Rolig svømning', 'Teknik og roligt.' + ow, big[0], 'easy')],
    [S.swim('Svømmetest (morgen)', 'Opv. 400 m · 400 m all-out · 5 min pause · 200 m all-out · CSS-fart pr. 100 m = (tid400 − tid200) / 2. Notér begge tider', 1600, 'test')],
    [S.bike('Cykeltest', 'Opv. 20 min med 3×1 min hårdt · 20 min all-out, notér gennemsnitsfart og puls. Brug samme rute og samme cykel hver gang, helst i stille vejr', 60, 'test')],
    [S.bike('Rolig lang tur', 'Z2 hele vejen', big[1], 'z2', x(null, WINTER(w.ph) ? 'opt' : null))],
    [S.run('Roligt løb', 'Z2', big[2], 'z2')],
  ];
}

function examDays(w) {
  const e = w.ph === 'base1' // eksamensugerne i december/januar er lettere end de senere
    ? { run: 35, sl: 1600, si: 1400, bT: 50, lr: 90, ln: 60 }
    : { run: 40, sl: 2000, si: 1500, bT: 60, lr: 105, ln: 60 };
  return [
    [S.rest('Hviledag', 'Fri')],
    [S.run('Kort løb med fart', '10 min opv. · 5×2 min Z4 · nedløb', e.run, 'easy', x('z4'))],
    [S.swim('Rolig svømning', 'Sammenhængende, roligt. Fin pause fra læsningen', e.sl, 'easy')],
    [S.swim('Svømning (morgen)', 'Teknik + 6×100 m roligt-moderat', e.si, 'easy')],
    [S.bike('Spinner', 'Z2 med 2×10 min sweet spot. Spinneren på arbejdspladsen, eller cyklen på studiet tæt på læsepladsen', e.bT, 'z2', x('ss', true))],
    [S.bike('Cykeltur', 'Z2. Kun hvis eksamen tillader det, ellers 45 min indendørs', e.lr, 'z2', x(null, 'opt'))],
    [S.run('Roligt løb', 'Z2', e.ln, 'z2')],
  ];
}

function specialDays(w) {
  if (w.k === 'start') return [ // blid startuge (≈ 4,5 t): kun rolige Z1–Z2-pas og ingen tests (testene ligger i uge 5)
    [S.rest('Hviledag', 'Fri')],
    [S.run('Roligt løb', 'Z2, snakketempo. Gå gerne 1 min, hvis du får brug for det', 25, 'z2'),
     S.str('Styrke – introduktion', 'Let: find startvægte på squat, rumænsk dødløft, split squat og planke. 2×8, langt fra udmattelse', 25)],
    [S.swim('Rolig svømning', 'Teknik og roligt, ingen intervaller', 1200, 'easy'),
     S.bike('Let cykeltur', 'Z1–Z2, høj kadence', 25, 'easy', x(null, 'opt'))],
    [S.swim('Rolig svømning (morgen)', 'Din faste torsdagssvømning, men kun roligt: teknik og lange, afslappede tag', 1000, 'easy')],
    [S.bike('Rolig spinner', `Z1–Z2, jævn kadence 85–95. ${spinWhere(w.ph)}`, 40, 'easy', x(null, true))],
    [S.bike('Rolig tur', 'Z2, jævnt. Kort og rolig', 60, 'z2', x(null, 'opt')), S.run('Brick-løb', 'Lige efter cyklen, 10 min meget roligt', 10, 'easy')],
    [S.run('Roligt løb', 'Z2, snakketempo', 40, 'z2')],
  ];
  if (w.k === 'race70') return [
    [S.bike('Cykel', 'Z2 med 3×5 min racefart', 60, 'z2', x('ss'))],
    [S.run('Kort løb', '10 min opv. · 4×3 min racefart · nedløb', 35, 'easy', x('hm'))],
    [S.swim('Rolig svømning', 'Open water i våddragt, hvis muligt', 1500, 'easy')],
    [S.swim('Svømning (morgen)', 'Opv. · 4×100 m i racetempo · roligt', 2000, 'easy', x('im'))],
    [S.rest('Hviledag', 'Pak taske. Tjek cyklen')],
    [S.bike('Aktivering', '30 min rolig cykel med 3×1 min racefart', 30, 'easy', x('ss')), S.run('Aktivering', '3 strides', 15, 'easy')],
    [S.race('Køge Jernmand', 'Mellemdistance (DM): 1,9 km svøm · 90 km cykel · 21,1 km løb. Test ernæring, skift og pacing', 330, 'race', { legs: { swim: 'im', bike: 'ss', run: 'hm' } })],
  ];
  if (w.k === 'post70') return [
    [S.rest('Hviledag', 'Fri')],
    [S.bike('Rolig cykel', 'Z1, ben ud', 45, 'easy', x(null, 'opt'))],
    [S.swim('Rolig svømning', 'Roligt', 1500, 'easy')],
    [S.run('Roligt løb', 'Z2, kun hvis benene er friske', 30, 'z2')],
    [S.rest('Hviledag', 'Skriv 3 ting ned fra racet, som du vil gøre anderledes i august')],
    [S.bike('Lang tur', 'Z2', 150, 'z2')],
    [S.run('Roligt løb', 'Z2', 60, 'z2')],
  ];
  if (w.k === 'race') return [
    [S.bike('Cykel', 'Z2 med 3×5 min IM-fart', 60, 'z2', x('im'))],
    [S.run('Kort løb', '20 min roligt med 4 strides', 20, 'easy')],
    [S.swim('Open water', 'I racevåddragten, gerne på racebanen', 1200, 'easy')],
    [S.swim('Svømning (morgen)', 'Opv. · 4×100 m racetempo · roligt', 1500, 'easy', x('im')), S.bike('Kort cykel', '30 min rolig, tjek gear og bremser', 30, 'easy')],
    [S.rest('Hviledag', 'Check-in, race briefing. Kulhydratrig mad')],
    [S.swim('Aktivering', '15 min rolig svømning', 600, 'easy'), S.bike('Aktivering', '30 min med 3×1 min IM-fart. Aflever cyklen i skifteområdet', 30, 'easy', x('im'))],
    [S.race('IRONMAN', '3,8 km svøm · 180 km cykel · 42,2 km løb', 720, 'race', { legs: { swim: 'im', bike: 'im', run: 'im' } })],
  ];
}

export function plan() {
  let pos = 0;
  return WEEKS.map((w, idx) => {
    const start = new Date(START); start.setDate(start.getDate() + idx * 7);
    let days;
    if (w.k === 'build' || w.k === 'taper') { pos++; days = buildDays(w, pos); }
    else {
      pos = 0;
      days = w.k === 'rec' ? recDays(w) : w.k === 'exam' ? (w.test ? recDays(w) : examDays(w)) : specialDays(w);
    }
    if (w.k === 'exam' && w.test) days = days.map((d, i) => i === 5 ? [S.bike('Rolig tur', 'Z2', 90, 'z2')] : i === 6 ? [S.run('Roligt løb', 'Z2', 60, 'z2')] : d);
    const min = { swim: 0, bike: 0, run: 0, str: 0, race: 0 };
    days.flat().forEach(s => { if (s.s in min) min[s.s] += s.m; });
    const total = Object.values(min).reduce((a, b) => a + b, 0);
    return { ...w, n: idx + 1, id: 'u' + String(idx + 1).padStart(2, '0'), start, days, min, total };
  });
}


// ---- Dato-hjælpere ----
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- Planlagt TSS (forenklet): min × IF² × 100/60 ----
// IF efter type: hvile 0, rolig/Z2 0,65, lang 0,70, intervaller/tempo 0,80, test 0,85,
// konkurrence 0,80 (≤ 6 t) / 0,75 (Ironman). Styrke: fast 20–30.
export function intensity(s) {
  if (s.s === 'rest' || !s.m) return 0;
  if (s.s === 'race') return s.m > 360 ? 0.75 : 0.8;
  const t = s.t.toLowerCase();
  if (t.includes('test')) return 0.85;
  if (/interval|fart|tempo/.test(t) || (t.includes('spinner') && !t.includes('rolig'))) return 0.8;
  if (/^lang/.test(t)) return 0.7;
  return 0.65;
}
export function tss(s, minutes) {
  const m = minutes ?? s.m;
  if (s.s === 'rest' || !m) return 0;
  if (s.s === 'str') return m >= 40 ? 30 : m > 20 ? 25 : 20;
  const f = intensity(s);
  return Math.round(m * f * f * 100 / 60);
}

// Ekstra (uplanlagt) træning: TSS = min × IF² × 100/60 med IF efter RPE (≤ 3: 0,65 · 4–6: 0,75 · 7–8: 0,85 · 9–10: 0,9 · uden RPE: 0,7).
// Styrke har fast TSS som i tss(). e = { sport, min, rpe? }.
export function extraIf(rpe) {
  if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return 0.7;
  return rpe <= 3 ? 0.65 : rpe <= 6 ? 0.75 : rpe <= 8 ? 0.85 : 0.9;
}
export function extraTss(e) {
  const m = e && e.min;
  if (!(m > 0)) return 0;
  if (e.sport === 'str') return tss({ s: 'str', t: '' }, m);
  const f = extraIf(e.rpe);
  return Math.round(m * f * f * 100 / 60);
}

// ---- PMC: CTL (42 d), ATL (7 d), TSB = gårsdagens CTL − ATL ----
// dailyTss: array af TSS pr. dag fra START. seed: antaget start-CTL/ATL.
export function pmc(dailyTss, seed = 25) {
  let ctl = seed, atl = seed;
  return dailyTss.map(t => {
    const tsb = ctl - atl;
    ctl += (t - ctl) / 42; atl += (t - atl) / 7;
    return { ctl, atl, tsb };
  });
}
export const plannedDailyTss = weeks => weeks.flatMap(w => w.days.map(d => d.reduce((a, s) => a + tss(s), 0)));
