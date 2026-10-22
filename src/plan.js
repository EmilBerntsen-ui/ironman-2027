// ---- Plan data: IRONMAN Copenhagen 2027, 43 uger fra man. 26. okt. 2026 ----
export const START = new Date(2026, 9, 26);
export const RACE = new Date(2027, 7, 22);   // IRONMAN Copenhagen, søn. 22. aug. 2027
export const TUNEUP = new Date(2027, 5, 13); // Køge Jernmand, søn. 13. jun. 2027

export const PH = {
  base1: {
    name: 'Grundform 1', span: 'okt–dec',
    swim: ['8×100 m (20 s pause)', '10×100 m (20 s pause)', '6×200 m (30 s pause)'],
    bike: ['3×8 min sweet spot (88–93 % FTP), 4 min pause', '3×10 min sweet spot', '3×12 min sweet spot'],
    run: ['6×2 min Z4 / 2 min jog', '5×3 min Z4 / 2 min jog', '5×4 min Z4 / 2 min jog'],
    long: 'Z2 hele vejen, kadence 85–95. Drik og spis lidt hver 20. min',
    brick: 'Lige efter cyklen, roligt',
    lrun: 'Z2, snakketempo. Gå gerne 1 min hver 10. min de første uger',
    strTue: 'Tunge basisløft 3×6–8: squat, rumænsk dødløft, split squat, pull-ups, planke',
    strTueMin: 40,
    fri: ['Styrke (på arbejdet)', 'Let: step-ups, enbens-dødløft, sidelæns planke, hofteløft. Højst 30 min', 30],
  },
  base2: {
    name: 'Grundform 2', span: 'jan–feb',
    swim: ['12×100 m i CSS-fart (15 s pause)', '5×200 m CSS (20 s pause)', '4×300 m (30 s pause)'],
    bike: ['3×12 min sweet spot', '2×20 min sweet spot', '3×15 min sweet spot'],
    run: ['6×4 min Z4 / 2 min jog', '4×6 min tærskel / 2 min jog', '3×8 min tærskel / 2 min jog'],
    long: 'Z2, kadence 85–95. Ude når vejret tillader, ellers 2 t indendørs + resten ude',
    brick: 'Lige efter cyklen, roligt',
    lrun: 'Z2, snakketempo',
    strTue: 'Basisløft 3×6–8: squat, rumænsk dødløft, split squat, pull-ups, planke',
    strTueMin: 40,
    fri: ['Styrke (på arbejdet)', 'Let: step-ups, enbens-dødløft, sidelæns planke, hofteløft. Højst 30 min', 30],
  },
  build1: {
    name: 'Opbygning 1', span: 'mar–apr',
    swim: ['3×400 m (30 s pause)', '10×150 m CSS (20 s pause)', '2×600 m (45 s pause)'],
    bike: ['4×8 min tærskel (95–100 % FTP), 4 min pause', '3×12 min tærskel', '2×20 min tærskel'],
    run: ['3×10 min tærskel / 2 min jog', '2×15 min tærskel / 3 min jog', '5×1 km i 10 km-fart / 90 s jog'],
    long: 'Z2 med 2×20 min IM-watt (65–75 % FTP). Spis 60–80 g kulhydrat i timen',
    brick: 'Lige efter cyklen, første 10 min i IM-maratonfart',
    lrun: 'Z2, sidste 15 min i IM-maratonfart',
    strTue: 'Vedligehold 2×6: squat, dødløft, step-ups, core',
    strTueMin: 30,
    fri: ['Hviledag', 'Fri. Eventuelt 15 min mobilitet', 0],
  },
  build2: {
    name: 'Opbygning 2', span: 'maj–jun',
    swim: ['4×400 m (30 s pause)', '3×600 m (45 s pause)', '1500 m tempo, jævnt'],
    bike: ['3×20 min sweet spot', '2×30 min IM-watt + 10 min tærskel', '4×10 min tærskel'],
    run: ['3×12 min tærskel / 2 min jog', '40 min i halvmaratonfart', '2×20 min tærskel / 3 min jog'],
    long: 'Z2 med 3×30 min IM-watt. Ét lige så spisested som på racedagen: 70–90 g kulhydrat i timen',
    brick: 'Lige efter cyklen i IM-maratonfart',
    lrun: 'Z2, sidste 25 min i IM-maratonfart',
    strTue: 'Vedligehold 2×6: squat, dødløft, core',
    strTueMin: 25,
    fri: ['Hviledag', 'Fri. Eventuelt 15 min mobilitet', 0],
  },
  peak: {
    name: 'Specifik fase', span: 'jul',
    swim: ['3×800 m i racetempo (45 s pause)', '20×100 m CSS (10 s pause)', '2000 m sammenhængende i racetempo'],
    bike: ['2×30 min sweet spot', '3×20 min lige over IM-watt', '60 min IM-watt i ét stræk'],
    run: ['3×15 min tempo / 3 min jog', '50 min i IM-maratonfart', '6×5 min tærskel / 90 s jog'],
    long: 'Z2 med 3×45 min IM-watt i aero. Fuld racedagsernæring: 80–90 g kulhydrat i timen, samme produkter som på dagen',
    brick: 'Lige efter cyklen i IM-maratonfart',
    lrun: 'Z2 med 2×20 min IM-maratonfart. Øv gel/drik undervejs',
    strTue: 'Core og mobilitet',
    strTueMin: 20,
    fri: ['Hviledag', 'Fri. Eventuelt 15 min mobilitet', 0],
  },
  taper: {
    name: 'Nedtrapning', span: 'aug',
    swim: ['6×200 m racetempo', '8×100 m racetempo', '4×100 m racetempo'],
    bike: ['3×15 min IM-watt', '3×10 min IM-watt', '3×5 min IM-watt'],
    run: ['3×10 min IM-maratonfart', '4×5 min IM-maratonfart', '4×3 min IM-maratonfart'],
    long: 'Z2 med 2×30 min IM-watt. Racedagsernæring og racetøj',
    brick: 'IM-maratonfart',
    lrun: 'Z2, sidste 15 min i IM-maratonfart',
    strTue: 'Core og mobilitet',
    strTueMin: 15,
    fri: ['Hviledag', 'Fri', 0],
  },
};

// kind: start | build | rec | exam | race70 | post70 | taper | race
// p: si = svømmeintervaller (m), sl = lang svøm (m), rE = roligt løb man., bT = cykel tir.,
//    bW = cykel ons., rI = løbeintervaller tor., lr = lang cykel, br = brick, ln = langt løb (min)
export const WEEKS = [
  { k: 'start', ph: 'base1', note: 'Start med test, så zonerne passer. Tilmeld dig IRONMAN Copenhagen (søn. 22. aug. 2027) hurtigst muligt. Køge Jernmand (13. jun.) kan tilmeldes på sportstiming.dk/event/18710.' },
  { k: 'build', ph: 'base1', p: { si: 1600, sl: 1800, rE: 25, bT: 60, bW: 30, rI: 40, lr: 90, br: 10, ln: 50 } },
  { k: 'build', ph: 'base1', p: { si: 1800, sl: 2000, rE: 30, bT: 60, bW: 40, rI: 45, lr: 105, br: 10, ln: 55 } },
  { k: 'build', ph: 'base1', p: { si: 2000, sl: 2200, rE: 30, bT: 60, bW: 45, rI: 45, lr: 120, br: 15, ln: 60 } },
  { k: 'rec', ph: 'base1' },
  { k: 'build', ph: 'base1', p: { si: 2000, sl: 2400, rE: 30, bT: 60, bW: 45, rI: 50, lr: 135, br: 15, ln: 65 }, note: 'Sidste uge før eksamen. Læg pas om morgenen, så læsedagen er fri.' },
  { k: 'exam', ph: 'base1' },
  { k: 'exam', ph: 'base1' },
  { k: 'build', ph: 'base1', p: { si: 2200, sl: 2500, rE: 30, bT: 75, bW: 45, rI: 50, lr: 150, br: 15, ln: 70 }, note: 'Juleferie: ekstra tid. Juleaften er torsdag: svøm om morgenen, og drop det rolige løb.' },
  { k: 'build', ph: 'base1', p: { si: 2400, sl: 2800, rE: 35, bT: 75, bW: 45, rI: 50, lr: 165, br: 20, ln: 75 }, note: 'Nytårsaften er torsdag. Svømmehallen kan have kortere åbningstider i helligdagene.' },
  { k: 'rec', ph: 'base1' },
  { k: 'build', ph: 'base2', p: { si: 2200, sl: 2600, rE: 30, bT: 75, bW: 45, rI: 50, lr: 135, br: 15, ln: 70 } },
  { k: 'build', ph: 'base2', p: { si: 2400, sl: 2800, rE: 35, bT: 75, bW: 45, rI: 55, lr: 150, br: 15, ln: 75 } },
  { k: 'build', ph: 'base2', p: { si: 2400, sl: 2800, rE: 30, bT: 75, bW: 45, rI: 40, lr: 90, br: 0, ln: 0 }, event: ['10 km-løb', 'Første mellemmål. Fuld indsats. Torsdag kort, lørdag rolig.'], note: 'Find et 10 km-løb i slutningen af januar, eller løb en tidskørsel alene.' },
  { k: 'rec', ph: 'base2', note: 'Nyt semester starter. Når skemaet ligger fast, så flyt dagene, men behold rækkefølgen hård/let.' },
  { k: 'build', ph: 'base2', p: { si: 2500, sl: 3000, rE: 35, bT: 75, bW: 45, rI: 55, lr: 150, br: 20, ln: 80 } },
  { k: 'build', ph: 'base2', p: { si: 2600, sl: 3000, rE: 35, bT: 75, bW: 45, rI: 55, lr: 165, br: 20, ln: 85 } },
  { k: 'build', ph: 'base2', p: { si: 2600, sl: 3000, rE: 35, bT: 75, bW: 45, rI: 60, lr: 165, br: 20, ln: 90 } },
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
const S = {
  swim: (t, d, m) => ({ s: 'swim', t, d: d + ` · ${m.toLocaleString('da-DK')} m`, m: swimMin(m) }),
  bike: (t, d, m) => ({ s: 'bike', t, d, m }),
  run: (t, d, m) => ({ s: 'run', t, d, m }),
  str: (t, d, m) => ({ s: 'str', t, d, m }),
  rest: (t, d) => ({ s: 'rest', t, d, m: 0 }),
  race: (t, d, m) => ({ s: 'race', t, d, m }),
};

const WINTER = ph => ph === 'base1' || ph === 'base2';
const spinWhere = ph => WINTER(ph) ? 'Spinneren på arbejdspladsen, frokost eller lige efter arbejde' : 'Ude efter arbejde, eller spinneren på arbejdspladsen';

// Ugen: man hvile/rolig svøm · tir løbeintervaller + styrke · ons lang svøm + let cykel
// tor din faste morgensvømning (intervaller) + roligt løb · fre spinner med intervaller · lør lang cykel · søn langt løb
function buildDays(w, pos) {
  const p = w.p, ph = PH[w.ph], i = (pos - 1) % 3;
  const ow = w.ow ? ' Open water med våddragt, hvis vandet er over 15 °C, ellers i bassin.' : '';
  const mon = WINTER(w.ph) || w.ph === 'taper'
    ? [S.rest('Hviledag', 'Fri efter weekenden. Eventuelt 15 min mobilitet')]
    : [S.swim('Restitutionssvøm', 'Helt roligt, teknik og pull buoy. Spring over, hvis du er træt', 1500)];
  const fri = [S.bike('Cykel med intervaller', `Z2 med ${ph.bike[i]}. ${spinWhere(w.ph)}`, p.bT)];
  if (WINTER(w.ph)) fri.push(S.str('Styrke (på arbejdet)', 'Let i træningsrummet: step-ups, enbens-dødløft, sidelæns planke, hofteløft', 20));
  const days = [
    mon,
    [S.run('Løbeintervaller', `15 min opvarmning · ${ph.run[i]} · resten nedløb`, p.rI),
     S.str('Styrke', ph.strTue, ph.strTueMin)],
    [S.swim('Lang svømmetur', 'Sammenhængende i jævnt tempo, pull buoy på sidste tredjedel.' + ow, p.sl),
     S.bike('Let cykeltur', 'Z1–Z2, høj kadence. cyklen på studiet eller ude', p.bW)],
    [S.swim('Svømmeintervaller (morgen)', `Din faste torsdagssvømning: opv. 300 m · teknik 4×50 m · hovedsæt ${ph.swim[i]} · resten roligt`, p.si),
     S.run('Roligt løb', 'Z2, snakketempo. Efter studiet', p.rE)],
    fri,
    [S.bike('Lang cykeltur', ph.long, p.lr)],
    [],
  ];
  if (p.br) days[5].push(S.run('Brick-løb', ph.brick, p.br));
  if (w.event) {
    days[1] = [S.run('Løbeintervaller', '15 min opv. · 4×4 min i løbsfart · nedløb', 45), S.str('Styrke', ph.strTue, ph.strTueMin)];
    days[4] = [S.bike('Rolig spinner', 'Z2 med 3×3 min sweet spot. ' + spinWhere(w.ph), 45)];
    days[5] = [S.bike('Rolig cykeltur', 'Z1–Z2, 3 korte spurter. Gør klar til i morgen', p.lr)];
    days[6] = [S.race(w.event[0], w.event[1], w.event[0] === 'Halvmaraton' ? 120 : 75)];
  } else {
    days[6] = [S.run('Langt løb', ph.lrun, p.ln)];
  }
  return days;
}

function recDays(w) {
  const ow = w.ow ? ' Open water, hvis muligt.' : '';
  const big = { base1: [1500, 75, 45], base2: [2000, 105, 55], build1: [2400, 135, 70], build2: [2600, 165, 75], peak: [2800, 210, 85] }[w.ph];
  return [
    [S.rest('Hviledag', 'Fri')],
    [S.run('Løbetest', '15 min opv. · 30 min all-out alene · gennemsnitspuls sidste 20 min = tærskelpuls. Opdater løbezoner', 55),
     S.str('Styrke, let', 'Halv vægt, kun teknik', 20)],
    [S.swim('Rolig svømning', 'Teknik og roligt.' + ow, big[0])],
    [S.swim('Svømmetest (morgen)', 'Opv. 400 m · 400 m all-out · 5 min pause · 200 m all-out · CSS = 200 / (tid400 − tid200) m/s. Opdater svømmezoner', 1600)],
    [S.bike('FTP-test', 'Opv. 20 min med 3×1 min hårdt · 20 min all-out · FTP = 95 % af gennemsnitswatt. Brug samme cykel hver gang (spinneren, hvis den måler watt)', 60)],
    [S.bike('Rolig lang tur', 'Z2 hele vejen', big[1])],
    [S.run('Roligt løb', 'Z2', big[2])],
  ];
}

function examDays(w) {
  return [
    [S.rest('Hviledag', 'Fri')],
    [S.run('Kort løb med fart', '10 min opv. · 5×2 min Z4 · nedløb', 40)],
    [S.swim('Rolig svømning', 'Sammenhængende, roligt. Fin pause fra læsningen', 2000)],
    [S.swim('Svømning (morgen)', 'Teknik + 6×100 m roligt-moderat', 1500)],
    [S.bike('Spinner', 'Z2 med 2×10 min sweet spot. Spinneren på arbejdspladsen, eller cyklen på studiet tæt på læsepladsen', 60)],
    [S.bike('Cykeltur', 'Z2. Kun hvis eksamen tillader det, ellers 45 min indendørs', 105)],
    [S.run('Roligt løb', 'Z2', 60)],
  ];
}

function specialDays(w) {
  if (w.k === 'start') return [
    [S.rest('Hviledag', 'Fri')],
    [S.run('Løbetest', '15 min opv. · 30 min hårdt men jævnt · gennemsnitspuls sidste 20 min = tærskelpuls', 55),
     S.str('Styrke – introduktion', 'Find startvægte: squat, rumænsk dødløft, split squat, pull-ups, planke. 2×8, let', 35)],
    [S.swim('Rolig svømning', 'Teknik og roligt', 1500),
     S.bike('Let cykeltur', 'Z1–Z2', 40)],
    [S.swim('Svømmetest (morgen)', 'Opv. 400 m · 400 m all-out · 5 min pause · 200 m all-out. Noter tiderne, så sætter du CSS-fart', 1400),
     S.run('Roligt løb', 'Z2, snakketempo', 25)],
    [S.bike('FTP-test', 'På spinneren på arbejdspladsen (hvis den måler watt), ellers på egen cykel med wattmåler. Opv. 20 min · 20 min all-out · FTP = 95 % af gennemsnitswatt', 60)],
    [S.bike('Rolig tur', 'Z2', 90), S.run('Brick-løb', 'Lige efter cyklen, meget roligt', 10)],
    [S.run('Roligt løb', 'Z2, snakketempo', 45)],
  ];
  if (w.k === 'race70') return [
    [S.bike('Cykel', 'Z2 med 3×5 min racewatt', 60)],
    [S.run('Kort løb', '10 min opv. · 4×3 min racefart · nedløb', 35)],
    [S.swim('Rolig svømning', 'Open water i våddragt, hvis muligt', 1500)],
    [S.swim('Svømning (morgen)', 'Opv. · 4×100 m i racetempo · roligt', 2000)],
    [S.rest('Hviledag', 'Pak taske. Tjek cyklen')],
    [S.bike('Aktivering', '30 min rolig cykel med 3×1 min racewatt', 30), S.run('Aktivering', '3 strides', 15)],
    [S.race('Køge Jernmand', 'Mellemdistance (DM): 1,9 km svøm · 90 km cykel · 21,1 km løb. Test ernæring, skift og pacing', 330)],
  ];
  if (w.k === 'post70') return [
    [S.rest('Hviledag', 'Fri')],
    [S.bike('Rolig cykel', 'Z1, ben ud', 45)],
    [S.swim('Rolig svømning', 'Roligt', 1500)],
    [S.run('Roligt løb', 'Z2, kun hvis benene er friske', 30)],
    [S.rest('Hviledag', 'Skriv 3 ting ned fra racet, som du vil gøre anderledes i august')],
    [S.bike('Lang tur', 'Z2', 150)],
    [S.run('Roligt løb', 'Z2', 60)],
  ];
  if (w.k === 'race') return [
    [S.bike('Cykel', 'Z2 med 3×5 min IM-watt', 60)],
    [S.run('Kort løb', '20 min roligt med 4 strides', 20)],
    [S.swim('Open water', 'I racevåddragten, gerne på racebanen', 1200)],
    [S.swim('Svømning (morgen)', 'Opv. · 4×100 m racetempo · roligt', 1500), S.bike('Kort cykel', '30 min rolig, tjek gear og bremser', 30)],
    [S.rest('Hviledag', 'Check-in, race briefing. Kulhydratrig mad')],
    [S.swim('Aktivering', '15 min rolig svømning', 600), S.bike('Aktivering', '30 min med 3×1 min IM-watt. Aflever cyklen i skifteområdet', 30)],
    [S.race('IRONMAN', '3,8 km svøm · 180 km cykel · 42,2 km løb', 720)],
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
    if (w.k === 'exam' && w.test) days = days.map((d, i) => i === 5 ? [S.bike('Rolig tur', 'Z2', 90)] : i === 6 ? [S.run('Roligt løb', 'Z2', 60)] : d);
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
