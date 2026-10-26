# Ernæring til IRONMAN Copenhagen (22. aug 2027) – kildebaseret evidensgrundlag

Udarbejdet 2026-10-26. Plan: ~43 uger, ~4,5 → ~15 t/uge. Udøver: dansk universitetsstuderende, mand, motionist, tidligere gennemført half-Ironman. Kropsvægt, højde, alder og fedtfri masse (FFM) er endnu ukendte, så alle tal er **pr. kg**.

**Sådan læses dokumentet**

- `[K#]` henviser til kildelisten (afsnit 11) (kilde, år, URL, hvad der er læst).
- **(afledt)** = min egen omregning/aritmetik af citerede tal (fx MJ til kcal, MET til kcal/kg/t).
- **(praktisk forslag)** = ingen kilde dækker det direkte. Det er en fornuftig implementering af et kildebaseret princip, ikke en dokumenteret anbefaling.
- **STRID** = kilder er uenige eller evidensen er omdiskuteret.
- Der er ikke opfundet tal. Hvor en kilde mangler, står der "ikke belagt".

**Kort om kildekvalitet.** Fuldtekst er hentet, og de relevante afsnit er læst, for ACSM/AND/DC 2016, IOC REDs 2023, IOC kosttilskud 2018, ISSN-stands (nutrient timing, protein, koffein, energidrikke, review-update, kreatin, probiotika, ultraløb), Jeukendrup 2014/2017, Podlogar & Wallis 2022, Impey 2016/2018, Baker 2017, ten Haaf 2014, NNR 2023 (udvalgte tabeller), Delany 2025 og Compendium 2024 (MET-sider). Kun abstract er læst for Burke 2011, Jeukendrup 2011, Kimber 2002, Pfeiffer 2012, Rowlands 2017, Aird 2018, Garthe 2011, Sim 2019, Clénin 2015, Costa 2017, Miall 2018 og UCI 2026. Sekundære kilder er markeret.

**En vigtig attribuering.** "Fuel for the work required" er **ikke** Burkes begreb. Det stammer fra Impey, Morton et al. (Liverpool John Moores), jf. [K7a, K7b]. Burke er medforfatter på ACSM-stand [K1], REDs [K2] og Burke 2011 [K3], som er den klassiske "high vs. low carbohydrate availability"-ramme.

---

## 1. Dagligt energibehov

### 1.1 Hvile-stofskifte (REE/BMR): hvilken ligning?

| Ligning | Formel | Nøjagtighed i rekreative atleter [K20] |
|---|---|---|
| Cunningham (1980) | REE (kcal/d) = 22 × FFM(kg) + 500 | 84,9 % af mænd inden for ±10 % af målt REE |
| ten Haaf & Weijs 2014, vægtbaseret | REE (kcal/d) = 11,936·kg + 587,728·højde(m) − 8,129·alder + 191,027·køn(M=1) + 29,279 | 83,0 % (mænd) |
| ten Haaf & Weijs 2014, FFM-baseret | REE (kcal/d) = 22,771·FFM + 484,264 | 83,0 % (mænd) |
| Mifflin-St Jeor (1990) | 9,99·kg + 625·højde(m) − 4,92·alder + 166·køn(M=1) − 161 (= 10·kg + 6,25·cm − 5·alder + 5 for mænd) | **<50 %** nøjagtige |
| Henry/Oxford 2005 (brugt af NNR 2023, mænd 19–30 år) | BEE (MJ/d) = 0,0600·kg + 1,31·højde(m) + 0,473 | ikke valideret i atleter i de læste kilder [K22] |

- Kilde for alle tal i tabellen: tabel 4 og resultater i [K20] (PLOS ONE, 2014). Henry-ligningen er fra [K22], tabel 4.
- Valideringsstudiet omfattede 90 hollandske rekreative atleter (53 M, 37 K, 18–35 år) med gennemsnitligt 9,1 ± 5,0 t træning/uge. Det svarer til brugerens træningsniveau midtvejs i planen.
- Forfatternes konklusion: Cunningham (kræver FFM) eller deres vægtbaserede ligning anbefales til sportsernæring. Harris-Benedict, WHO, Schofield, Mifflin og Owen havde <50 % nøjagtighed [K20].
- **STRID:** Mifflin-St Jeor er den mest brugte i praksis, men er i dette (ene) valideringsstudie klart dårligere end Cunningham/ten Haaf for trænede personer. Resultatet kommer fra én hollandsk kohorte og bør ikke overgeneraliseres.
- Illustrativt eksempel, **ikke brugerens data** (afledt): 70 kg, 175 cm, 30 år, 15 % fedt (FFM 59,5 kg) giver Mifflin ≈ 1.650 kcal, Henry ≈ 1.665 kcal, Cunningham ≈ 1.809 kcal og ten Haaf (vægt) ≈ 1.840 kcal. De to første ligger 145–190 kcal under de to sidste.
- FFM-måling: ifølge [K1] har DXA lavest standardfejl og hudfoldsmåling højest. BodPod kan undervurdere fedt med 2–3 %. Brug samme metode og protokol hver gang.

### 1.2 Samlet dagligt behov (TDEE)

**a) Ikke-trænings-baseline (Danmark).** NNR 2023, tabel 8 [K22], referencemand 18–24 år, 75,2 kg, BMI 23:

| | MJ/d | kcal/d (afledt) | kcal/kg/d (afledt) |
|---|---|---|---|
| BEE | 7,4 | ≈ 1.770 | ≈ 23,5 |
| PAL 1,4 (lavt aktiv) | 10,4 | ≈ 2.490 | ≈ 33 |
| PAL 1,6 (gennemsnit, "tæt på befolkningsmedian") | 11,8 | ≈ 2.820 | ≈ 37,5 |
| PAL 1,8 (aktiv livsstil) | 13,2 | ≈ 3.155 | ≈ 42 |

NNR-PAL inkluderer almindelig fritidsaktivitet. For en studerende, der træner separat, er PAL 1,4 som baseline uden træning mindst risikabel for dobbelttælling (praktisk forslag).

**b) Træningsomkostning (MET-baseret).** 1 MET ≈ 3,5 mL O₂/kg/min ≈ **1,0 kcal/kg/t** [K21a]. MET i Compendium er brutto (inkl. hvile), så nettotillæg er (MET − 1) × kg × timer (afledt).

| Aktivitet (Compendium 2024 [K21b]) | MET | Netto kcal/kg/t (afledt) |
|---|---|---|
| Cykling 10–11,9 mph (≈16–19 km/t), let | 6,8 | 5,8 |
| Cykling 12–13,9 mph (≈19–22 km/t), moderat | 8,0 | 7,0 |
| Cykling 14–15,9 mph (≈22,5–25,6 km/t), kraftig | 10,0 | 9,0 |
| Cykling 16–19 mph (≈25,7–30,6 km/t), "racing/ikke-drafting" | 12,0 | 11,0 |
| Cykling indendørs 126–150 W / 151–199 W / 200–229 W | 8,0 / 10,3 / 10,8 | 7,0 / 9,3 / 9,8 |
| Løb 6 mph (≈9,7 km/t) | 9,3 | 8,3 |
| Løb 7 mph (≈11,3 km/t) | 11,0 | 10,0 |
| Crawl-svømning, langsom/moderat | 5,8 | 4,8 |
| Crawl-svømning, hurtig/kraftig | 9,8 | 8,8 |

- Hastighedsbåndene i Compendium er grove. Min vurdering (ikke kildebelagt) er, at de sandsynligvis undervurderer den hastighed, en moderne landevejscykel opnår ved en given MET. Vælg derfor MET efter anstrengelse (RPE/zone), ikke kun km/t.
- Cykling med wattmåler: 1 kJ mekanisk arbejde ≈ 1 kcal metabolisk forbrug, fordi bruttoeffektivitet på ~20–25 % næsten ophæver 4,184 kJ/kcal. Kilden [K45] er en coachingblog uden fagfællebedømmelse og påstår "inden for 5 %". Behandl det som tommelfingerregel (praktisk forslag).
- **Samlet formel (praktisk forslag, bygget af ovenstående):**
  kcal/kg/dag ≈ 33 (PAL 1,4-baseline) + Σ (MET − 1) × timer.
  - 2 t let/moderat cykling (MET 8–10) → ≈ 47–51 kcal/kg
  - 1 t løb (MET 9,3) → ≈ 41 kcal/kg
  - 4 t cykling (MET 8–10) → ≈ 61–69 kcal/kg
  Justér efter 7-dages gennemsnitsvægt og energi/appetit.
- Plausibilitetstjek:
  - ISSN ultra-løb: 38–63 kcal/kg/d i træning [K15], men for en anden sport.
  - Verdensmester i Ironman: 7.019–8.506 kcal/d (dobbeltmærket vand) ved ~1.300–1.480 t træning/år [K44]. Det er en øvre grænse, ikke et mål for en amatør.
  - Selve Ironman-løbet: brugt energi 10.036 ± 931 kcal (mænd) og 8.570 ± 1.014 kcal (kvinder) mod indtag 3.940 ± 868 og 3.115 ± 914 kcal [K28]. Løbets energiunderskud kan ikke lukkes. Målet er kulhydratlevering, ikke energibalance.
  - Team Danmarks "kostrammer" spænder fra ca. 2.300–2.800 til 4.700–5.200 kcal [K41a]. De er til eliteudøvere.

### 1.3 Energitilgængelighed (EA) og risikotærskler

- Definition: **EA = (energiindtag − træningsenergiforbrug) / FFM (kg)** [K1, K2].
- ACSM 2016 [K1]: ≈ **45 kcal/kg FFM/d** er forbundet med energibalance og optimal sundhed. Kronisk reduktion, især **<30 kcal/kg FFM/d**, er forbundet med forringelser af mange kropsfunktioner. Tallene stammer fra kvindelige forsøg (Loucks).
- IOC REDs 2023 [K2]:
  - Zoner fra sedentære kvinder: ≥45 = vækst/vedligehold, ~45 = tilstrækkelig, **30–45 = reduceret EA til masse/fedttab**, **≤30 = LEA med sundhedskonsekvenser**.
  - En universel afskæring på 30 er **omdiskuteret** for kvinder. For mænd findes ingen veldefineret tærskel, men den "synes lavere (fx ~9 til 25 kcal/kg FFM/d)".
  - Der er "risici ved at fastsætte en definitiv klinisk tærskel" pga. mange modererende faktorer. Modellen bruger kvalitative begreber (adaptiv vs. problematisk LEA) i stedet for faste tal.
  - Lav kulhydrattilgængelighed (LCA) forstærker virkningen af LEA. Kulhydrat falder typisk 25–60 % i LEA-forsøg.
- AIS [K40b]: ingen standardiserede EA-grænser, og måling i praksis er upræcis. Behandling ved REDs er typisk øget indtag på cirka 300–600 kcal/d (henviser til IOC).
- **STRID:** 30 kcal/kg FFM som "rød grænse" (ACSM 2016) mod IOC 2023, der fraråder en enkelt klinisk grænse. For en mandlig udholdenhedsudøver er 45 kcal/kg FFM + træningsforbrug et konservativt gulv. Det er min vurdering, ikke en kildeformulering.
- Illustrativt (ikke brugerens data, afledt): FFM 59,5 kg → 45 kcal/kg FFM = ≈ 2.678 kcal/d før træningsforbrug. ACSM-eksemplet [K1] bruger en 60 kg kvinde med EA 39,6 kcal/kg FFM.

**Advarselstegn på lav energitilgængelighed/REDs** [K2 (tabeller 2–3, 5) og K40b]:

- Faldende præstation, stagnation eller "træningsplateau". Faldende træningsrespons efter intensiveret træning.
- Hyppigere sygdom (infektioner), hyppigere skader, stressfrakturer (BSI), tabte træningsdage.
- Mænd: nedsat libido og færre morgenerektioner. REDs-modellen nævner dem som emergerende indikatorer.
- Lavt hvilepuls (<40 slag/min hos voksne atleter), lavt blodtryk (<90/60 mmHg), ortostatisk intolerans.
- Lav RMR (<30 kcal/kg FFM/d eller RMR-ratio <0,90), søvnforstyrrelser, GI-symptomer, nedsat humør/depression/angst.
- AIS-liste (tidlige tegn): vægttab, forstyrret spisning, tilbagevendende skader/sygdom, nedsat præstation, humørændringer.
- Kronisk faldende ferritin/hæmoglobin (potentiel indikator [K2]).
- Overlap med overtræning: LEA/LCA skal udelukkes før en OTS-diagnose [K2].

### 1.4 Vægttab under træning: rate og timing

- **Rate.** ACSM 2016 [K1]: <1 % af kropsvægt/uge bevarer bedre FFM og præstation. For de fleste atleter er et energiunderskud på ~250–500 kcal/d fra periodiseret behov, med uændret/let øget forbrug, nok til progression over ~3–6 uger.
- Garthe 2011 [K23]: 24 atleter, 0,7 %/uge mod 1,4 %/uge. LBM steg +2,1 % ved 0,7 %/uge og var uændret ved 1,4 %/uge, med styrketræning. **Samme fedtmassetab, bedre LBM og styrke ved den langsomme rate.**
- Scoping review af 73 ekspertdokumenter [K25]: typisk råd er 0,5–1,0 kg/uge (7 dokumenter). Ændringer placeres før konkurrencesæsonen/uden for sæson/præ-sæson. Dagligt protein 1,6–2,4 g/kg efter 2019. Kulhydrat 3–10 g/kg/d, hvor 3–6 g/kg fremhæves i vægttabsfaser. Forfatterne kritiserer generiske råd og manglende sportsspecifik vejledning.
- **Timing.** ACSM [K1]: aktivt vægttab bør planlægges i basefasen eller langt fra konkurrence, med langsom rate og øget protein (2,3 mod 1,0 g/kg/d i et 2-ugers forsøg bevarede muskelmasse). Hector & Phillips 2018 [K24]: 1,6–2,4 g protein/kg/d under vægttab (højere ved større underskud og mere intens træning).
- REDs 2023 [K2] er den modstående risiko: energi- og kulhydratrestriktion i perioder med stigende træning er den klassiske vej til LEA/REDs.
- **Praktisk forslag til planen (ingen kildetal ud over ovenstående):**
  - Hvis fedttab ønskes, så i den tidlige basefase med lav volumen.
  - Hold kulhydrat højt omkring de hårde pas (jf. afsnit 2).
  - Stop underskud før volumen/langture stiger, og ikke i build/peak/taper.
  - Mål kropsvægt som 7-dages gennemsnit, og vær opmærksom på advarselstegnene ovenfor.

---

## 2. Daglige makronæringsstoffer periodiseret efter belastning

### 2.1 Kulhydrat (g/kg/døgn)

| Dagtype | ACSM/AND/DC 2016 [K1] | Team Danmark [K41a] | ISSN 2018 [K12] |
|---|---|---|---|
| Let (lav intensitet/teknik) | **3–5** | 3–5 | (normal kost 3–5) |
| Moderat (~1 t/d) | **5–7** | 5–7 (1–2 t) | |
| Højt (udholdenhed 1–3 t/d, moderat-høj intensitet) | **6–10** | 7–10 (>2 t) | 5–8 (2–3 t/d, 5–6×/uge) |
| Meget højt (>4–5 t/d) | **8 til 12** | ≥10–12 (>6 t) | 8–10 (3–6 t/d) |
| "Fuelling up" før <90 min event | 7–12 pr. 24 t | | |

- Burke 2011 [K3], som ACSM bygger på, definerer *high carbohydrate availability* (dagligt indtag og timing matcher sessionens krav) mod *low availability*.
- ISSN ultra-løb [K15]: ~7–10 g/kg/d (60 % kulhydrat, 15 % protein, 25 % fedt) til gentagne udholdenhedsøvelser.
- Æld dansk reference [K43] (DIF/Team Danmark 2004, 2. udgave): 60–65 E% kulhydrat (≈8 g/kg). Den er forældet og bruges kun som historisk kontekst. Nordiske anbefalinger 1996 er referencen, og den er ikke relevant her.
- **STRID:** båndene er forskellige i grænserne. ACSM giver højere øvre bånd end ISSN (6–10 mod 5–8 ved 2–3 t/d). Team Danmark er et sted imellem og skifter bånd ved flere timer.
- **Periodisering ("fuel for the work required") [K7a, K7b]:**
  - Idéen er at justere kulhydrat dag for dag og måltid for måltid efter den kommende sessions krav ("train high" før/under/efter kvalitetspas, "train low" kun på udvalgte lette pas).
  - Impey 2018 (hypotese/"current opinion", ikke en dokumenteret protokol): tilpasningssignaler (AMPK/PGC-1α) ses især ved præ-øvelse muskelglykogen ≤300 mmol/kg tørvægt. Start med <200 mmol/kg tw **forringer sandsynligvis træningsintensiteten**. Gentagen daglig træning med reduceret kulhydrat kan øge sygdomsrisiko.
  - Marquet 2016 [K27]: "sleep low" 3 uger (n=21 triatleter, begge grupper 6 g/kg/d) forbedrede submaksimal cyklingsøkonomi og 10 km-løbstid. Det er et lille studie. Burke 2011 [K3] konkluderer, at nytten af "train low" for vel-trænede er uklar.
  - REDs 2023 [K2]: lav kulhydrattilgængelighed forstærker virkningen af LEA. Min fortolkning: kombinationen af train-low og energirestriktion øger risikoen og bør undgås.

### 2.2 Protein

- Dagligt: ACSM 2016 [K1] 1,2–2,0 g/kg/d. ISSN 2017 [K9] 1,4–2,0 g/kg/d "er tilstrækkeligt for de fleste". ISSN ultra [K15] 1,3–2,1 g/kg/d. Team Danmark [K41a] 1,0–2,0 g/kg/d (almenbefolkning 0,8) og ingen dokumenteret nytte over 2,0.
- Højere ved energirestriktion: op til 2,0+ g/kg/d [K1]. 1,6–2,4 g/kg/d [K24, K25].
- **Fordeling pr. måltid:**
  - ACSM [K1]: 0,25–0,3 g/kg (15–25 g) i 0–2 t efter anstrengende træning, og 0,3 g/kg efter nøglepas og hver 3.–5. time. >40 g viser ikke yderligere MPS og er måske kun relevant for de største atleter eller under vægttab.
  - ISSN 2017 [K8]: 20–40 g (0,25–0,40 g/kg/dosis) hver 3.–4. time.
- **Pre-søvn kasein:** 30–40 g kasein ~30 min før søvn øger MPS natten over og stofskifte uden at påvirke lipolyse [K8, K9]. Evidensen i de læste kilder bygger hovedsagelig på unge mænd med styrketræning. Endurance-specifik evidens er ikke belagt i kilderne.
- Kildekvalitet [K1, K16]: helfødevarer først, mælkebaserede proteiner er veldokumenterede (leucin). Tilskud skal være tredjepartstestet.

### 2.3 Fedt (minimum)

- ACSM [K1]: følg folkesundhedsråd (<10 E% mættet) og undgå kroniske indtag <20 E%.
- ISSN 2018 [K12]: ca. 30 E% moderat. Ved fedtreduktion 0,5–1 g/kg/d (kan give ~20 E%).
- Team Danmark [K41a]: 20–30 E%. NNR 2023 [K22]: 25–40 E% (almenbefolkning). ISSN ultra [K15]: 25 % = 1,0–1,5 g/kg/d.
- Fedtfattige måltider omkring træning anbefales [K41a].
- Kostfibre: NNR 2023 ≥25–35 g/d (hverdag). Reduceres omkring nøglepas/løbsdag (jf. afsnit 3 og 6).
- Højfedts/lavkulhydrat-kost: ACSM [K1] frarådes til konkurrenceudøvere, fordi den forringer højintensitets-præstation (nedregulering af kulhydratstofskifte).

---

## 3. Før træning

### 3.1 Timing og mængde

- **ACSM 2016 [K1] (Table 1):** før øvelse >60 min **1–4 g/kg kulhydrat 1–4 t før**. Valg bør være lavt på fedt og fibre og lavt til moderat på protein for at undgå GI-gener. Flydende måltider er nyttige ved nervøsitet. Lavt-GI er valgfrit; der er ingen universel præstationsfordel.
- Ved insulinrebound: sikr ≥1 g/kg kulhydrat i pre-måltidet, tilføj protein, medtag nogle højintensive indsatser i opvarmningen og indtag kulhydrat under øvelsen [K1].
- Team Danmark [K41a] giver samme tal (1–4 g, 1–4 t før). ISSN 2017 [K8] støtter princippet.
- Eksperimentel reference: lab-protokoller bruger 8 g/kg i 24 t + 2 g/kg præ-øvelsesmåltid [K32b, K32c].
- **Væske:** 5–10 mL/kg i 2–4 timerne før for at starte euhydreret, og natrium i drikke/mad hjælper retention [K1]. Urinfarve/USG <1,020 indikerer euhydrering [K1].

### 3.2 Morgenpas: fastende eller ikke?

- Aird 2018 [K26]: metaanalyse af 46 studier. Mad før træning **forbedrede længerevarende** (P = 0,012), men **ikke kortere** aerob præstation (P = 0,687). Fastende træning øgede frie fedtsyrer efter træning. Forfatterne finder støtte for begge udfald (præstation vs. metabolisk tilpasning) og efterlyser mere forskning.
- ACSM [K1] kalder "træning fastende" en bevidst lav-kulhydrat-strategi, kun når fokus er tilpasning og kvaliteten af sessionen er mindre vigtig.
- Impey 2018 [K7b]: "train low" er teoretisk rettet mod lav-intensive pas. Kvalitets-/højintensive pas bør have høj kulhydrattilgængelighed (hypotese).
- **Praktisk regel (praktisk forslag, bygget på ovenstående):**
  - **OK fastende:** korte, rolige, aerobe pas (ACSM-tærskel for præ-event-fueling er >60 min), når den samlede energitilgængelighed er tilstrækkelig, og kun på udvalgte dage.
  - **Ikke fastende:** intervaller/tærskel/racepace, lange pas (>60–90 min), bricks, dage med to pas, uger med vægttab, ved sygdom eller når advarselstegn på LEA er til stede. Gentagen lav-kulhydrat-træning kan øge sygdomsrisiko og forstærke LEA [K2, K7b].
  - Hvis morgenmad er svær: en lille kulhydratportion (ACSM-intervallet 1–4 g/kg gælder for 1–4 t før; mindre tid → mindre portion, praktisk forslag).

### 3.3 Koffein

| Punkt | Tal | Kilde |
|---|---|---|
| Dosis | **3–6 mg/kg**; minimum effektiv muligvis ~2 mg/kg; ≥9 mg/kg giver flere bivirkninger uden ekstra gevinst | ISSN 2021 [K10]; IOC 2018 [K16] |
| Timing | ~60 min før (tyggegummi kortere) | [K10, K16] |
| Under øvelsen | 100–300 mg (efter 15–80 min) kan forbedre cykel-TT 3–7 %; <3 mg/kg (~200 mg) før og under sammen med kulhydrat | IOC 2018 [K16] |
| Effekt | 2–4 % forbedring af udholdenhed i mange studier. TT-meta: −3,0 % til +15,9 % (stor individuel variation) | [K10] |
| Bivirkninger | takykardi, uro/angst, hovedpine, søvnforstyrrelser. Eftermiddag/aften (fx 18:00) forstyrrede søvn hos 6 af 13 i ét studie. ADORA2A/CYP1A2-genetik påvirker respons | [K10] |
| Gentagen brug | ydeevnegevinst kan falde efter ~15–18 dages daglig brug; start ≤3 mg/kg; "top-up" hver 1–2 t i lange pas | Vitale & Getzin 2019 [K47] (forfatternes forslag) |
| Energidrikke | effekt afhænger af koffein (>200 mg eller >3 mg/kg); indhold varierer | ISSN 2023 [K11] |

- **STRID:** ISSN/IOC (3–6 mg/kg) mod **EFSA 2015** [K39]: engangsdoser op til **200 mg (≈3 mg/kg)** giver ingen sikkerhedsbekymring for raske voksne, heller ikke <2 t før intens træning. Dagligt op til **400 mg (≈5,7 mg/kg)**. 100 mg (≈1,4 mg/kg) kan påvirke søvnlængde/-mønster ved indtag tæt på sengetid. For en 70 kg udøver er 6 mg/kg ≈ 420 mg (afledt), altså over EFSA's engangsgrænse for almenbefolkningen. EFSA har ingen data for midaldrende/ældre ved intens træning.
- Praktisk: prøv i træning først [K16, K41c], og undgå dosering sent på dagen.
- Efter træning: den gamle "koffein = diuretikum"-advarsel er overdrevet ved moderat indtag (<180 mg) [K1].

---

## 4. Under træning

### 4.1 Kulhydrat (g/time)

| Varighed | Anbefaling | Kilde |
|---|---|---|
| <45 min | Ikke nødvendigt | ACSM 2016 [K1] |
| 45–75 min | Små mængder inkl. mundskylning (central effekt) | [K1]; Jeukendrup 2014 [K4] |
| 1–2,5 t | **30–60 g/t** | [K1]; Burke 2011 [K3] |
| >2,5–3 t | **op til 90 g/t**, glukose:fruktose-blandinger (multiple transportable carbohydrates, MTC) | [K1, K3, K4] |

- Jeukendrup 2014 [K4]: enkelt kilde (glukose) oxideres op til ~60 g/t. MTC er nødvendige ved højere indtag. Anbefalinger er **uafhængige af kropsvægt og træningsstatus**, men skal justeres nedad ved lav absolut intensitet (lavere kulhydratoxidation), og "aspirerende atleter" kan have brug for lavere tal. Det er relevant for en amatør i et længere, lavere-intensivt Ironman-tempo.
- Dosis-respons [K4]: Smith et al. (51 cyklister/triatleter, 10–120 g/t glukose:fruktose 2:1) fandt størst præstationsforbedring ved 60–80 g/t.
- **Ironman-feltdata:**
  - Pfeiffer 2012 [K29] (221 atleter): gennemsnitlig kulhydratindtag i Ironman 62 ± 26 (Hawaii) og 71 ± 25 g/t (Tyskland), 65 ± 25 g/t i 70.3. Individuelt interval 6–136 g/t. Højere indtag hang sammen med **mere kvalme og flatulens** men også **bedre Ironman-præstation**.
  - Kimber 2002 [K28, K4]: ~1,0–1,1 g/kg/t gennemsnit (mænd/kvinder), men ~1,5 g/kg/t på cyklen og cirka 3× så meget som på løbet. Mænds kulhydratindtag på løbet var omvendt korreleret med sluttid (r = −0,75).
  - Rowlands & Houltham 2017 [K30]: half-Ironman, 74 mænd, 78,6 ± 6,6 g/t (barer 25 %, geler 35 %, drik 40 %). MTC (2:1) gav −0,53 % tid (95 % CI −1,30 til +0,24 %). Fortolket som lille, adoptionsværdig fordel.
- Indtagsfrekvens: ISSN 2017 [K8] nævner 230–350 mL 6–8 % opløsning hver 10.–12. min.

#### 120 g/t: ny evidens og forbehold

- Podlogar & Wallis 2022 [K6] (review): "kan ikke anbefales" at hæve maksimum ud over 90 g/t. 120 g/t giver højere exogen oxidation, men **ingen yderligere skånsel af endogene lagre**, og præstationsfordel er uafklaret. Begrænset evidens for fordele ved 120 g/t på muskelskade/restitution. Forholdet glukose:fruktose tæt på 1:0,8 er muligvis bedre end 2:1 for både oxidationseffektivitet og tolerance (også under 60 g/t).
- Podlogar et al. 2022 [K32a]: 11 højt trænede cyklister, 3 t ved 95 % GET. Exogen oxidation 1,51 g/min (120 g/t, 0,8:1) mod 1,29 g/min (90 g/t, 1:2). Ingen forskel i endogen oxidation.
- Hearris et al. 2022 [K32b]: 9 trænede mænd, 120 g/t fra drik/gel/chews/mix (1:0,8). Samme exogene oxidation (~1,56–1,66 g/min) og minimale GI-symptomer.
- Norte et al. 2026 [K32c]: 16 cyklister/triatleter. 0/60/120 g/t reducerede faldet i critical power efter 3 t dosisafhængigt.
- Urdampilleta et al. 2020 [K32d]: 26 elite trailløbere, 120 g/t gav mindre neuromuskulær træthed 24 t efter end 90 og 60 g/t.
- UCI Sports Nutrition Project 2026 [K34]: professionelle cyklister rapporterer nu 90 og endda 120 g/t "on-bike" mod 30–60 g/t før 2010, kombineret med "training the gut". Podlogar & Rowlands 2026 [K34c] kritiserer metodiske forhold i 120 g/t-studier af elitemaratonløbere.
- **Forbehold for en amatør:** forsøgene bruger højt trænede personer ved høje absolutte intensiteter og efter 24 t med 8 g/kg kulhydrat. Ironman-tempo for en amatør giver lavere kulhydratoxidation [K4]. 120 g/t er derfor ikke en standardanbefaling for dig (praktisk forslag): gå ikke ud over 90 g/t før du har gut-trænet og haft problemfri tolerance.

### 4.2 Tarmtræning (gut training)

Evidens:

- Jeukendrup 2017 [K5]: mave/tarm er trænbar. Højt kulhydratindtag øger SGLT1-transportører og -aktivitet. Humane data er begrænsede. Dyredata: mus 1,9× SGLT1 efter 2 ugers kulhydratrig kost, og ud fra dyredata kunne 40→70 % kulhydrat give ca. fordobling over 2 uger. Ændringer i mavetømning ses efter ~3 dages kostændring. "Flere dage og sikkert 2 uger" giver signifikante ændringer. Ved vægttab/lavt kulhydratindtag reduceres tarmens kapacitet, så inkluder dage med højt kulhydratindtag.
- Cox 2010 (refereret i [K4, K5]): 28 dage, 16 t træning/uge, 6,5 g/kg/d (inkl. +1,5 g/kg pr. træningstime som supplement) gav højere exogen oxidation end 5 g/kg/d.
- Costa 2017 [K33a]: 25 løbere, 2 ugers gentagen "gut challenge" (30 g 2:1 geldiske hver 20. min ≈ 90 g/t under 2 t ved 60 % VO₂max). GI-symptomer faldt 60–63 %, malabsorption faldt, og distance i en efterfølgende test steg 4,3–5,2 % (placebo −2,1 %).
- Miall 2018 [K33b]: 18 løbere, 2 uger dagligt 1 t ved 90 g/t. Mindre GI-ubehag og malabsorption (H₂-peak 13 → 6 ppm).
- Forbehold [K6]: uafklaret om forbedringen skyldes øget absorption eller blot bedre tolerance.

**Praktisk protokol (praktisk forslag, bygget på [K5, K33a, K33b]):** de konkrete trin er mine, ikke en kildeformulering.

1. Test indtag af den planlagte kilde og de planlagte væskemængder i alle pas >60–90 min. Øg gradvist mod det niveau, du agter at bruge i løbet.
2. Medtag mindst 2 ugers sammenhængende træning med højt kulhydratindtag under pas (jf. Costa/Miall), og gentag før hver long-session-blok.
3. Træn den præcise produktmix (drik/gel/chews/barer) og de samme tidspunkter som i løbet. Hearris [K32b] viste ens oxidation på tværs af former.
4. Brug "race rehearsal"-pas (lang cykel + løb) i build-fasen. Registrér symptomer (kvalme, oppustethed, diarré) og juster.
5. Ved vægttab eller lave kulhydratdage: indskyd højkulhydrat-dage [K5].

### 4.3 Væske

- **Mål:** begræns væskeunderskud til **<2 % af kropsvægt** (ACSM 2007 [K17], ACSM 2016 [K1]; 2–3 % i [K31]). Svedrater 0,3–2,4 L/t. Typisk væskeplan 0,4–0,8 L/t, individualiseret [K1]. 1 kg vægttab ≈ 1 L sved [K1].
- Team Danmark [K41b]: 2 %-reglen er "tommelfingerregel", ikke absolut. Maks. optag ~1.000–1.200 mL/t. Drik ikke så meget, at vægten stiger under træning.
- **STRID, drikke efter tørst vs. plan:**
  - Hew-Butler et al. 2015, 3. internationale konsensus om exercise-associated hyponatraemia (CJSM/BJSM) [K18]: drik "efter tørst" ("no more, no less", gengivet via [K18b]). Vitoria-Gasteiz Ironman 2017 efter uddannelse i tørstbaseret drikning: af 94 gennemførende var 1 (1 %) hyponatræmisk, 77,6 % eunatræmiske og 21,2 % hypernatræmiske [K18b].
  - ISSN ultra [K15]: drik-efter-tørst som standard for hydrering, med 450–750 mL/t (150–250 mL/20 min) i løb.
  - ACSM 2007/2016 [K1, K17]: individuel plan, der begrænser tab til <2 %, men advarer om overdrikning. Rekreative, langsommere atleter og kvinder har størst risiko for hyponatræmi (plasma-Na <135 mmol/L; symptomer typisk <130). Overdrikning er hovedårsagen.
  - Meta-analyse af Ironman [K48]: deltagerne var moderat dehydrerede efter målgang (SMD 0,494; 95 % CI 0,220–0,767). Min kommentar: det viser ikke i sig selv, at man bør drikke mere end tørsten kræver, da hyponatræmi er den farligste fejl [K1].
- **Svedrate-test (metode)** [K19a, tabel 3]:
  - Formel: **WBSR = [kropsmasse før − (kropsmasse efter − væskeindtag + urin)] / varighed**.
  - Veje helst nøgen eller i minimalt tøj, efter vandladning, i duplikat. Registrér tøj. Notér drikkeindtag og toiletbesøg. Korriger for mad/afføring.
  - Test under forhold repræsentative for træning/konkurrence, og gentag i forskellige forhold. Dag-til-dag-variation af svedrate er ~5–7 %.
  - Korriger for respirationsvand/metabolisk masse ved >2–3 t, høj intensitet eller tør luft.
  - Team Danmarks væsketest [K41b] er et gratis regneværktøj.
  - Typisk atletgennemsnit [K19b]: 1,21 ± 0,68 L/t (n=506, mange sportsgrene, inkl. triatlon).
- **Natrium i drikken (mg/L, 1 mmol Na = 23 mg, afledt):**

| Kilde | mmol/L | mg/L |
|---|---|---|
| Gennemsnitlig svedkoncentration, ACSM [K1] | ~50 | ~1.150 ("~1 g/L") |
| Hele-kroppen svedkoncentration, 506 atleter [K19b] | 35,9 ± 10,4 (18,2–70,8) | ≈ 826 (≈ 419–1.628) |
| Sportsdrik (IOC-tabel 1) [K16] | 10–35 | ≈ 230–805 |
| Elektrolyttilskud (IOC-tabel 1) [K16] | 50–60 | ≈ 1.150–1.380 |
| ISSN ultra: mål for indtag i væske [K15] | | **500–700** (varmt/fugtigt: 300–600 mg/t) |
| ISSN ultra: smagsgrænse | | >~1.000 reducerer smag |

- ACSM [K1]: indtag natrium under øvelsen ved store tab: svedrate >1,2 L/t, salt sved eller >2 t. ISSN ultra [K15]: natriumindtag kan mindske risikoen for hyponatræmi, men er ikke tilstrækkeligt ved samtidig overdrikning.
- Praktisk: kør svedtest og vælg natrium efter den (praktisk forslag).

---

## 5. Efter træning

### 5.1 Kulhydrat

- **ACSM 2016 [K1]:** hurtig genopfyldning ved <8 t mellem to krævende pas: **1–1,2 g/kg/t i de første 4 t**, derefter normale daglige behov. Glykogensyntese er ~5 %/t. Ellers er almindelige måltider nok.
- ISSN 2017 [K8]: 1,2 g/kg/t (gerne højt GI >70) hvis <4 t.
- Team Danmark [K41a]: umiddelbart efter 1 g/kg, og snacks hvert 15.–60. min ved <8 t til næste pas.
- Alternativ: 0,8 g/kg kulhydrat + 0,4 g/kg protein giver samme glykogenresyntese/restitution som 1,2 g/kg kulhydrat alene [K1].
- Podlogar & Wallis 2022 [K6]: dosisrespons til ~1,8 g/kg/t, men kun ét studie sammenligner 1,2 med 1,6 g/kg/t. Muligvis fordelagtigt for elite.
- Hvis hurtig restitution ikke er nødvendig, og dagligt indtag dækker behovet, er timing af kulhydrat mindre vigtig [K8]. ACSM bruger <8 t til næste krævende pas som grænse for "speedy refuelling" [K1].

### 5.2 Protein

- **0,25–0,3 g/kg (15–25 g)** i 0–2 t efter [K1] (ISSN 0,25–0,40 g/kg [K8]). Team Danmarks restitutionseksempel: 50–75 g kulhydrat + 15–20 g protein [K41a]. IOC: protein-tilskud 20–50 g pr. portion [K16].
- Mælkebaseret protein er veldokumenteret [K1].

### 5.3 Væske og alkohol

- **Væske: 125–150 % af tabet** (1,25–1,5 L pr. kg tabt) [K1, K41b]. ISSN [K15]: 150 % + ≥460 mg/L natrium. Begræns ikke natrium efter store tab [K1].
- **Alkohol:** ACSM [K1]: forringer glykogenlagring, bremser rehydrering (ADH-hæmning), svækker MPS, og effekten på styrke/præstation kan vare flere timer efter. Stort indtag i restitutionen frarådes.
- Sundhedsstyrelsen [K46] (sekundær kilde: Kræftens Bekæmpelse-notat 2026; primærsiden ikke hentet): højst 10 genstande/uge og 4 pr. lejlighed for voksne (siden marts 2022). Verificér på sst.dk.
- Jern: undgå jerntilskud lige efter hård træning (hepcidin) [K1].

---

## 6. Løbsuge og løbsdag (IRONMAN Copenhagen)

### 6.1 Kulhydratopbygning

- **ACSM/Burke [K1, K3]:** til events >90 min, **10–12 g/kg/døgn i 36–48 t**. Glykogen kan normaliseres med 24 t reduceret træning og adækvat indtag. Trænede kan supercompensere ved at forlænge kulhydratrig kost og tapere over ~48 t. ACSM-tabellen anbefaler kulhydratrige kilder, der er lave i fibre/residue og lette at indtage, både for at nå målet og for mave-komfort.
- Jeukendrup 2011 [K31]: høj glykogen er gavnligt, men den klassiske supercompensation-protokol er ikke nødvendig.
- ISSN ultra [K15]: "moderne" kulhydratopbygning i 48 t før løb.
- **Feltdata, IRONMAN VM 2024** [K35]: kun 6 af 23 kvindelige triatleter (26 %) nåede 8 til 12 g/kg/d. Gennemsnit 6,4 ± 2,1 g/kg. Højere kulhydratindtag korrelerede med hurtigere sluttid (r = −0,50). **Fiberindtag korrelerede stærkt med GI-symptomer** (r = 0,85). Forfatterne forklarer fejlen med psykosociale/logistiske faktorer snarere end viden.
- Illustration (afledt, ikke brugerens data): 70 kg × 10–12 g/kg = 700–840 g kulhydrat/døgn. Det er svært at nå med fast føde alene, så brug flydende kilder/lavt-fibre mad (praktisk forslag).

### 6.2 Løbsmorgen

- ACSM [K1]: **1–4 g/kg kulhydrat 1–4 t før** (lavt fedt/fibre, lavt-moderat protein). Min. 1 g/kg ved rebound-risiko. Væske 5–10 mL/kg i 2–4 t før. Flydende ved nervøsitet. Træn præcis måltidet.
- Team Danmark [K41a] samme. Lab-protokoller bruger 2 g/kg [K32b, K32c].

### 6.3 Fueling pr. disciplin

| Del | Anbefaling | Kilde/status |
|---|---|---|
| Svømning | Ingen praktisk indtagsmulighed | praktisk forslag |
| Cykel | **60–90 g kulhydrat/t** som MTC (glukose:fruktose 2:1 eller ~1:0,8), start tidligt og fordel jævnt, gut-trænet. Indtag i Ironman-felt: 62–71 g/t [K29]; observeret ~1,5 g/kg/t på cykel [K4]. | ACSM [K1], Jeukendrup [K4], Podlogar & Wallis [K6] |
| Løb | Fortsæt så højt som tolerabelt inden for **30–90 g/t**. Observeret indtag på løbet er kun ~1/3 af cykelindtaget [K4, K28], og kulhydratindtag på løbet hang sammen med sluttid hos mænd [K28]. Exogen oxidation er ens på cykel og løb [K4]. Skift evt. til flydende/gel/cola ved mavegener. | tal fra [K1, K4]; tilpasning er praktisk forslag |
| Væske | 0,4–0,8 L/t individualiseret [K1] (ISSN ultra 450–750 mL/t [K15]), eller tørstbaseret [K18]. **Ikke vægtøgning i løbet.** | STRID, jf. 4.3 |
| Natrium | 500–700 mg/L [K15]. Svedtest afgør niveau. | [K15, K19] |
| Koffein | 3–6 mg/kg ~60 min før [K10], eller små doser (100–300 mg) senere i løbet [K16]. Lav dosis sent (fx cola) er sammenlignelig med større dose tidligere [K10]. Tag EFSA-grænsen i betragtning [K39]. | prøv i træning |

- Energi: løbets energiunderskud er stort og kan ikke lukkes (se 1.2) [K28]. Fokus på kulhydrat og væske/natrium.
- **Øv i træning:** ACSM [K1]: løsninger kræver "eksperimentering og tilvænning". Jeukendrup [K4, K5]: øv strategien, og indtag-niveau i træning bestemmer tolerance. Team Danmark [K41c]: afprøv i træning før konkurrence. **Ingen nye produkter i løbsugen.**

---

## 7. Mikronæringsstoffer og kosttilskud

Rangering (AIS-ramme [K40a]): Gruppe A = stærk evidens i bestemte situationer (sportsføde, medicinske tilskud: calcium, folat, jern, D-vitamin, zink; præstationstilskud: koffein, beta-alanin, nitrat/rødbede, bikarbonat, kreatin, glycerol). Gruppe B = emergerende/blandet (bl.a. probiotika, vitamin C, multivitamin, fiskeolie, kollagen, ketoner).

### 7.1 Jern

- **Screening:** serum-ferritin sammen med transferrinmætning, Hb, MCV m.fl. [K16]. Ferritin er acute-phase-protein, så fortolk med betændelsestal [K1].
- **Grænseværdier (STRID):** Clénin 2015 [K36b]: <15 µg/L = tomt, 15–30 = lavt, **cut-off 30 µg/L** hos voksne. Gentag baseline-blodprøver **to gange årligt**. ACSM [K1]: "ingen enighed", forslag fra <10 til <35 ng/mL (<22 til <79 pmol/L).
- Forekomst [K36a]: jernmangel hos ca. 5–11 % af mandlige atletkohorter (15–35 % hos kvinder).
- NNR 2023 [K22]: anbefalet indtag mænd 9 mg/d. ACSM [K1]: ~6 mg jern pr. 1.000 kcal.
- **Tilskud kun ved påvist mangel** [K1, K16]. Rutinemæssigt, ukontrolleret tilskud frarådes og kan give GI-gener. Højdosis-tilskud ikke uden mangel [K16]. Burden 2015 [K36c]: hos jernmangel-uden-anæmi forbedrer jernbehandling ferritin og aerob kapacitet (meta, 17 studier).
- Hepcidin: undgå indtag umiddelbart efter hård træning [K1].
- Team Danmark [K41c]: jern, D- og C-vitamin hører under "bekræftet mangel".
- **Praktisk forslag:** tag baseline ferritin/Hb nu (okt 2026) og igen ved første halvår (jf. Clénin: to gange årligt). Spis hæm-jern + C-vitamin-kilder (ACSM [K1]).

### 7.2 D-vitamin (nordisk breddegrad)

- **Risiko:** ACSM [K1]: personer >35. breddegrad (København ligger ca. 55,7° N, afledt) har højere risiko for insufficiens (25(OH)D 50–75 nmol/L) og deficiens (<50 nmol/L). Morgen/aften-træning (lav UVB) øger risikoen.
- **Doser (STRID):**
  - NNR 2023 [K22]: anbefalet indtag **10 µg/d** (voksne 25–50 år), **20 µg/d** ved lidt/ingen sol. Øvre grænse 100 µg/d.
  - IOC 2018 [K16]: 800–2.000 IE/d (20–50 µg) til vedligehold. Ingen etableret atletspecifik retningslinje. Højdosis (50.000 IE/uge i 8–16 uger) kun til at genoprette mangel under kontrol. Ingen konsensus om tærskler.
  - ACSM [K1]: 1.500–2.000 IE/d (38–50 µg) til knoglesundhed ved LEA. Mål-niveauer 80–100 nmol/L, men D-vitamin er "ikke ergogent".
  - Owens 2018 [K37]: toksicitet først >180 nmol/L (IoM), men egne data tyder på problemer ved højdosis. 4.000 IE/d (>75 nmol/L) gav bedre kraftrestitution i et RCT. Screening kan være unødvendig, og korrekt målt "frit" D-vitamin er uafklaret.
  - Sekundær dansk kilde [K46]: officielt råd 5–10 µg/d fra oktober til april. Primærkilden kunne ikke hentes. Verificér på Fødevarestyrelsen/sundhed.dk.
- **Praktisk forslag:** 25(OH)D-prøve sidst i vinteren eller nu. Hvis tilskud: oktober–april ved NNR-niveau (10 µg, op til 20 µg ved lidt sol), før højere doser kun efter prøve/læge.

### 7.3 Calcium

NNR 2023 [K22]: **950 mg/d** (25–50 år), 1.000 mg/d (18–24 år). ACSM/IOC [K1, K16]: 1.500 mg/d (+1.500–2.000 IE D) kun ved LEA/menstruationsforstyrrelser. Tilskud kun efter kostanalyse [K1, K40a]. Mejeriprodukter dækker typisk behovet (praktisk forslag).

### 7.4 Koffein: se 3.3.

### 7.5 Nitrat/rødbede

- IOC 2018 [K16]: 5–9 mmol (310–560 mg) 2–3 t før. 1–3 % forbedring af TT <40 min og 4–25 % af tid til udmattelse. Evidens uklar for <12 min. Gevinst sværere at opnå hos højt trænede. Ingen ekstra gevinst ved 16,8 mmol mod 8,4 mmol. Mulige GI-gener.
- ACSM 2016 [K1]: effekt "mindre klar hos højt trænede".
- Poon 2025 [K38] (paraplyreview, 20 meta-analyser, 180 studier): forbedring af tid til udmattelse (SMD 0,33) og total distance (SMD 0,42), mest ved ≥6 mmol/d (372 mg) i >3 dage. **Ingen signifikante forbedringer i andre præstationsmål.** Reviewene er af lav til kritisk lav kvalitet (AMSTAR-2).
- **Vurdering:** ingen kilde dokumenterer effekt i ~9–14 timers events. Evidensen dækker TT <40 min. Lav prioritet til Ironman (praktisk vurdering).

### 7.5b Natriumbikarbonat

IOC 2018 [K16]: 0,2–0,4 g/kg 60–150 min før. ~2 % forbedring i ~60 s-indsatser, mindre effekt >10 min. Veldokumenteret GI-gener (kan afbøde med ~1,5 g/kg kulhydrat). **Ikke relevant til Ironman** (ACSM: gavner events på 1–7 min [K1]).

### 7.6 Kreatin

ISSN 2017 [K13]: loading 0,3 g/kg/d (≈ 4×5 g) i 5–7 dage, vedligehold 3–5 g/d. IOC 2018 [K16]: 20 g/d i 5 dage, derefter 3–5 g/d. Vægtøgning: 0,6–1 kg (ACSM [K1]) til 1–2 kg (IOC [K16]), mest vand. Gavner gentagne højintensive indsatser og styrketræning. **Relevans for Ironman er lav og kan være negativ ved løb (vægt)**. Kan overvejes ved styrkeblokke (praktisk vurdering).

### 7.7 Probiotika

- IOC 2018 [K16]: "moderat støtte" i atleter. Dosis ~10¹⁰ levende bakterier/dag. Cochrane-review (12 studier, n=3.720): ~50 % færre øvre luftvejsinfektioner (URS) og ~2 dage kortere varighed.
- ISSN 2019 [K14]: effekt er stamme- og dosisafhængig. Produktet skal angive slægt/art/stamme og CFU ved udløb.
- **STRID:** AIS placerer probiotika i Gruppe B (emergerende/blandet) [K40a].

### 7.8 Øvrigt kort

- Antioxidanter/vitamin C: ACSM [K1] anbefaler ikke tilskud (kan blokere tilpasning). IOC [K16] viser "moderat støtte" for vitamin C 0,25–1,0 g/d til forebyggelse af URS hos hårdt trænende (STRID).
- Protein- og kulhydratprodukter er "Gruppe A sportsføde" [K40a]. Geler/bars/drik har dokumenteret sammensætning i IOC-tabel 1 [K16]: sportsdrik 5–8 % kulhydrat, geler ~25 g kulhydrat pr. sachet, bars 40–50 g kulhydrat, flydende måltid 1–1,5 kcal/mL (15–20 % protein, 50–70 % kulhydrat).

### 7.9 Batch-test og antidoping (dansk kontekst)

- IOC 2018 [K16]: i et banebrydende studie indeholdt ~15 % af >600 produkter fra hele verden uanmeldte prohormoner. Der findes ingen absolut garanti. Tredjepartstest sænker risikoen.
- **Team Danmark [K41d]:** 10–15 % risiko for forurenet produkt blandt de mest populære tilskud, og tæt på **50 % for tabletter**. Anbefaler kun renhedstestede produkter (Informed-Sport, NSF Certified for Sport). Det giver ikke 100 % garanti. Atleten har altid selv ansvaret. Praktisk guide til Informed-Sport [K41e].
- **Anti Doping Danmark [K42]:** anbefaler programmer som Informed-Sport, NSF Certified for Sport, BSCG Certified Drug Free, Cologne List, HASTA. Certificeringen gælder "det specifikke produkt med det specifikke batchnummer". Gem batch-testcertifikat og kvittering, før log, og angiv brug inden for 7 dage på dopingkontrolformularen. ADD rådgiver ikke om brug af kosttilskud, hvorfor man bør kontakte en diætist.
- Team Danmark [K41c]: **undgå blandingsprodukter** med flere præstationsfremmende stoffer. Afprøv i træning før konkurrence. Optimér kost/træning/restitution først.
- Relevans for dig (sekundær, verificér): IRONMAN tester også aldersgruppeatleter, og sager følger WADA-koden og IRONMANs antidopingregler [K49]. Verificér gældende regler for IRONMAN Copenhagen 2027 hos IRONMAN/Anti Doping Danmark.
- Praktisk forslag: tag kun tilskud med klar indikation (jern/D-vitamin ved mangel, evt. koffein), brug batch-testede produkter, og foretræk **mad frem for kapsler/tabletter**.

---

## 8. Danske måltidseksempler (praktiske forslag)

**Alle eksempler er praktiske forslag.** Hvert understøtter et kildebaseret princip, men mængder/madvarer er ikke fra en kilde. Slå gram kulhydrat op på emballagen eller i fødevaredatabanken Frida (fcdb.fooddata.dk), da jeg ikke har hentet næringsdata.

| Situation | Eksempel | Princip og kilde |
|---|---|---|
| Præ-pas (1–4 t før, >60 min) | Havregrød med banan og honning, franskbrød/toast med marmelade, ris eller pasta med lidt sovs | 1–4 g/kg, lavt fedt/fibre, lavt-moderat protein [K1]. Rugbrød er fiberrigt og passer bedre i hverdagen end før et nøglepas/løbsdag. |
| Før løb / nøglepas, nervøs mave | Flydende måltidserstatning eller let sødmælk-/juice-baseret shake | Flydende kulhydrat ved nervøsitet [K1] |
| Under pas (1–2,5 t) | Sportsdrik + gel/chews/banan | 30–60 g/t [K1]. IOC-tabel 1: drik 5–8 %, gel ~25 g kulhydrat/sachet [K16] |
| Under lange pas (>2,5 t) | Blanding af drik + geler + chews/bar (mix-and-match) | Op til 90 g/t MTC [K1, K4]; ens oxidation fra forskellige former [K32b] |
| Efter pas, kort til næste pas (<8 t) | Skyr/kvark + banan + havregryn; eller mælk + sandwich; plus kulhydratrigt tilbehør (ris/kartofler) | 1–1,2 g/kg/t i 4 t + 0,3 g/kg protein [K1]. Mejeriprotein er veldokumenteret (leucin) [K1]. Team Danmark: 50–75 g kulhydrat + 15–20 g protein [K41a] |
| Almindelig hverdag | Rugbrød med laks/æg/hytteost, grøntsager, frugt, fuldkorn, kartofler | NNR: fibre ≥25–35 g/d [K22]. Team Danmark: fisk 200–300 g/uge, frugt/grønt til hvert måltid [K41a] |
| Pre-søvn (hård træningsdag) | Skyr eller kvark (kasein-rig) | 30–40 g kasein før søvn [K8, K9] (evidens primært fra styrketræning) |
| Jern (hvis lav) | Rødt kød/leverpostej + C-vitamin-kilde (peberfrugt, appelsin) | Hæm-jern, ikke-hæm-jern + C-vitamin [K1] |
| Calcium/D | Mælk, yoghurt, ost; fed fisk (sild, laks, makrel) | NNR calcium 950 mg/d, D 10 µg/d [K22]. Kost alene dækker sjældent D om vinteren [K1] |
| Opbygning 36–48 t før løb | Hvidt brød/ris/pasta, kartofler, juice, moset frugt, havregrød; lavt fiber | 10–12 g/kg, lavt fiber/residue [K1]. Fiber ↔ GI-symptomer r = 0,85 [K35] |

---

## 9. Vigtigste uenigheder mellem kilderne

1. **EA-tærskel:** ACSM 2016 [K1] bruger 30 kcal/kg FFM/d som risikogrænse. IOC 2023 [K2] fraråder en enkelt klinisk tærskel. For mænd er niveauet muligvis lavere (~9–25).
2. **Kulhydrat pr. dag:** ACSM 6–10 (1–3 t) og 8 til 12 (>4–5 t) mod ISSN 5–8 (2–3 t) og 8–10 (3–6 t) og Team Danmark 7–10 (>2 t) og ≥10–12 (>6 t) [K1, K12, K41a].
3. **Kulhydrat under pas >90 g/t:** Podlogar & Wallis 2022 [K6] "kan ikke anbefales" mod Hearris 2022 [K32b], Norte 2026 [K32c] og Urdampilleta 2020 [K32d] (fordele ved 120 g/t) mod Podlogar & Rowlands 2026 [K34c] (metodisk kritik). Ratio 2:1 mod ~1:0,8 [K6]. ACSM kalder evidensen for fordele ved MTC "equivocal" (uafklaret) [K1], mens Jeukendrup/Rowlands [K4, K30] ser en fordel.
4. **Væske:** tørstbaseret (Hew-Butler 2015 [K18]; ISSN ultra [K15]) mod plan der begrænser tab til <2 % (ACSM [K1, K17]; Team Danmark [K41b]; 2–3 % hos Jeukendrup [K31]).
5. **Koffein:** ISSN/IOC 3–6 mg/kg [K10, K16] mod EFSA 200 mg engangsdosis (≈3 mg/kg) og 400 mg/d [K39].
6. **Protein:** 1,0–2,0 (Team Danmark) mod 1,2–2,0 (ACSM) mod 1,4–2,0 (ISSN). Pr. måltid 0,25–0,3 (ACSM) mod 0,25–0,40 g/kg (ISSN). Pre-søvn kasein bygger på styrketræning.
7. **D-vitamin:** tærskler (ACSM <50/50–75 nmol/L vs. IOC "ingen konsensus") og doser (10 µg NNR / 5–10 µg dansk sekundær kilde / 20–50 µg IOC / 38–50 µg ACSM ved LEA). Owens 2018 [K37] advarer mod højdosis og rutinescreening.
8. **Ferritin-cut-off:** 30 µg/L (Clénin [K36b]) mod "ingen enighed" 10–35 ng/mL (ACSM [K1]).
9. **Fastende træning:** Aird 2018 [K26]: mad hjælper længere pas, men ikke korte. Train-low-adaptationer er tvetydige i præstation [K3, K7b, K27]. REDs [K2] advarer om forstærket LEA.
10. **Nitrat:** IOC [K16] 1–3 % i TT <40 min mod paraplyreview [K38] med blandede effekter og lav metodisk kvalitet. Ironman-varighed er ikke undersøgt.
11. **BMR-ligning:** Mifflin <50 % nøjagtig mod Cunningham/ten Haaf ~75–85 % i én hollandsk kohorte [K20].
12. **Probiotika, vitamin C, antioxidanter:** IOC "moderat støtte" mod AIS Gruppe B (probiotika) og ACSM "anbefales ikke" (antioxidanter) [K1, K16, K40a].
13. **Kulhydratopbygning:** ACSM 10–12 g/kg i 36–48 t [K1] mod 8 til 12 i IRONMAN VM-studiet [K35] og Jeukendrup 2011 [K31], der siger, at klassisk supercompensation ikke er nødvendig.

---

## 10. Åbne punkter og hvad der mangler

- **Kropsvægt, højde, alder, fedtfri masse:** nødvendige til EA, Cunningham og kg-baserede mål. Brug samme måling hver gang [K1].
- **Baseline-blodprøver (praktisk forslag):** ferritin (+Hb, transferrinmætning), 25(OH)D.
- **Svedtest** på både cykel og løb (formel i 4.3). Natriumkoncentration kan ikke estimeres uden specialmåling [K19a].
- **Gut-training-protokol:** tidsplan i 4.2 er et forslag, ikke en dokumenteret protokol.
- **Ikke læst i fuld tekst:** UCI Sports Nutrition Project 2026 (position statement + 14 reviews) og Burke 2011/Jeukendrup 2011/Kimber 2002/Pfeiffer 2012. Kun abstract eller sekundær gengivelse er brugt. Relevante for cykel-/Ironman-fueling og værd at få læst, hvis detaljer skal tilføjes.
- **Ikke verificeret mod primærside:** Sundhedsstyrelsens alkoholgrænse, danske D-vitaminråd, IRONMAN's antidopingpolitik for aldersgrupper og Hew-Butler-konsensussens ordlyd (gengivet via sekundære kilder).
- Ikke belagt i kilderne: endurance-specifik evidens for pre-søvn kasein, og et fast tal for "hvor ofte kan man træne fastende".

---

## 11. Kildeliste

Alle kilder er tilgået 2026-10-26. "Fuldtekst" = læst i fuld tekst. "Abstract" = kun abstract. "Sekundær" = gengivet via anden kilde.

**Position stands, konsensus, retningslinjer**

- **[K1]** Thomas DT, Erdman KA, Burke LM. *Nutrition and Athletic Performance* (joint position of Academy of Nutrition and Dietetics, Dietitians of Canada, ACSM), 2016 (revideret dec. 2016). MSSE 48(3):543–568; doi 10.1249/MSS.0000000000000852. Fuldtekst: https://www.dietitians.ca/DietitiansOfCanada/media/Documents/Resources/noap-position-paper.pdf
- **[K2]** Mountjoy M et al. *2023 IOC consensus statement on Relative Energy Deficiency in Sport (REDs)*. Br J Sports Med 2023;57(17):1073–1097; doi 10.1136/bjsports-2023-106994. Fuldtekst læst via kopi på https://forening.sls.se/media/a4cl4crj/idrottsnutrition_2023-ioc-consenses-on-red-s-1.pdf (kanonisk: https://pubmed.ncbi.nlm.nih.gov/37752011/)
- **[K8]** Kerksick CM et al. *ISSN position stand: nutrient timing*. J Int Soc Sports Nutr 2017;14:33. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/
- **[K9]** Jäger R et al. *ISSN position stand: protein and exercise*. JISSN 2017;14:20. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
- **[K10]** Guest NS et al. *ISSN position stand: caffeine and exercise performance*. JISSN 2021;18:1. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC7777221/
- **[K11]** Jagim AR et al. *ISSN position stand: energy drinks and energy shots*. JISSN 2023;20:1. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC9987737/
- **[K12]** Kerksick CM et al. *ISSN exercise & sports nutrition review update*. JISSN 2018;15:38. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC6090881/
- **[K13]** Kreider RB et al. *ISSN position stand: safety and efficacy of creatine supplementation*. JISSN 2017;14:18. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/
- **[K14]** Jäger R et al. *ISSN position stand: probiotics*. JISSN 2019;16:62. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC6925426/
- **[K15]** Tiller NB et al. *ISSN position stand: nutritional considerations for single-stage ultra-marathon training and racing*. JISSN 2019;16:50. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC6839090/ (ultraløb, ikke Ironman; tal er brugt som sammenligning)
- **[K16]** Maughan RJ et al. *IOC consensus statement: dietary supplements and the high-performance athlete*. Br J Sports Med 2018;52:439–455. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/
- **[K17]** Sawka MN et al. *ACSM position stand. Exercise and fluid replacement*. MSSE 2007;39:377–390. Abstract: https://pubmed.ncbi.nlm.nih.gov/17277604/
- **[K18]** Hew-Butler T et al. *Statement of the 3rd International Exercise-Associated Hyponatremia Consensus Development Conference, Carlsbad 2015*. Clin J Sport Med 2015;25:303–320; doi 10.1097/JSM.0000000000000221. https://pubmed.ncbi.nlm.nih.gov/26102445/. Ordlyd ("drik efter tørst") gengivet via **[K18b]** López de Lara D et al. Front Nutr 2021, https://www.frontiersin.org/articles/10.3389/fnut.2021.781229/full (sekundær).
- **[K25]** Delany LV et al. *Dietary recommendations for body mass and composition manipulation in male and female athletes: scoping review of consensus statements…* Sports Med 2025. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC12513969/
- **[K34]** UCI Sports Nutrition Project 2026 (Int J Sport Nutr Exerc Metab): **[K34a]** Burke LM et al., position statement, https://pubmed.ncbi.nlm.nih.gov/42744290/; **[K34b]** Jeukendrup AE et al., race nutrition for road cycling, https://pubmed.ncbi.nlm.nih.gov/41911900/; **[K34c]** Podlogar T, Rowlands DS, J Appl Physiol 2026 (kommentar om 120 g/t), https://pubmed.ncbi.nlm.nih.gov/42284230/. Kun abstract/titel.
- **[K40]** AIS (Australian Institute of Sport): **[K40a]** Sports Supplement Framework, https://www.ausport.gov.au/ais/nutrition/supplements (+ /group_a, /group_b); **[K40b]** Energy availability, https://www.ausport.gov.au/ais/nutrition/energy-availability. Webside, tilgået 2026.
- **[K22]** Nordic Council of Ministers. *Nordic Nutrition Recommendations 2023* (NORD2023-003). https://pub.norden.org/nord2023-003/ (PDF læst: tabeller 8, 13–14, box 2, appendiks 4).
- **[K39]** EFSA. *Scientific Opinion on the safety of caffeine*, EFSA Journal 2015;13(5):4102. Læst via "EFSA explains caffeine"-faktaark: https://www.efsa.europa.eu/sites/default/files/corporate_publications/files/efsaexplainscaffeine150527.pdf

**Dansk kontekst**

- **[K41]** Team Danmark: **[K41a]** Kost (kulhydrat/protein/fedt), https://www.teamdanmark.dk/til-atleter/sportsernaering/kost/energikilder-og-naeringsstoffer/ (og /kost: energirammer); **[K41b]** Væske og væsketest, https://www.teamdanmark.dk/til-atleter/sportsernaering/vaeske og /vaesketest; **[K41c]** Kosttilskud + anvendelse, https://teamdanmark.dk/til-atleter/sportsernaering/kosttilskud; **[K41d]** Anskaffelse, https://www.teamdanmark.dk/til-atleter/sportsernaering/kosttilskud/anskaffelse; **[K41e]** Praktisk guide til Informed Sport, https://www.teamdanmark.dk/media/1682/justeret-praktisk-guide-til-informed-sport.pdf. Websider (elitefokus), årstal ikke angivet på siderne.
- **[K42]** Anti Doping Danmark. *Kosttilskud*. https://www.antidoping.dk/doping/kosttilskud
- **[K43]** Danmarks Idrætsforbund/Team Danmark. *Ernæring* (2. udg. 2004). https://www.dif.dk/media/q0wbemje/ernæring-hæfte.pdf. **Forældet; kun historisk kontekst.**
- **[K46]** Sekundære danske kilder (ikke verificeret mod primærside): alkohol, Kræftens Bekæmpelse-notat 2026 og Sundhedsstyrelsens notat, https://sst.dk/-/media/Udgivelser/2022/Alkohol/Notat-om-Sundhedsstyrelsens-alkoholudmeldinger_version-1_2.ashx (siden gav HTTP 429); D-vitamin 5–10 µg okt–apr, via sundhed.dk (https://www.sundhed.dk/borger/patienthaandbogen/hormoner-og-stofskifte/sygdomme/oevrige-sygdomme/d-vitamin-mangel/) og kommunale sider. Fødevarestyrelsens egen side kunne ikke hentes.
- **[K49]** IRONMAN antidoping for aldersgruppe (sekundær, 2015–2019): https://triathlonmagazine.ca/feature/ironman-releases-three-age-group-positives-from-kona-2018/ og https://slowtwitch.com/news/more-ironman-ag-doping-testing/

**Kulhydrat, fueling, tarm, løb**

- **[K3]** Burke LM, Hawley JA, Wong SH, Jeukendrup AE. *Carbohydrates for training and competition*. J Sports Sci 2011;29(S1):S17–S27. Abstract: https://pubmed.ncbi.nlm.nih.gov/21660838/
- **[K4]** Jeukendrup A. *A step towards personalized sports nutrition: carbohydrate intake during exercise*. Sports Med 2014;44(S1):S25–S33. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC4008807/
- **[K5]** Jeukendrup AE. *Training the gut for athletes*. Sports Med 2017;47(S1):101–110. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5371619/
- **[K6]** Podlogar T, Wallis GA. *New horizons in carbohydrate research and application for endurance athletes*. Sports Med 2022;52(S1):5–23. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC9734239/
- **[K7a]** Impey SG et al. *Fuel for the work required: a practical approach to amalgamating train-low paradigms for endurance athletes*. Physiol Rep 2016;4(10):e12803. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC4886170/
- **[K7b]** Impey SG et al. *Fuel for the work required: a theoretical framework for carbohydrate periodization and the glycogen threshold hypothesis*. Sports Med 2018;48:1031–1048. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5889771/
- **[K26]** Aird TP, Davies RW, Carson BP. *Effects of fasted vs fed-state exercise on performance and post-exercise metabolism: systematic review and meta-analysis*. Scand J Med Sci Sports 2018;28:1476–1493. Abstract: https://pubmed.ncbi.nlm.nih.gov/29315892/
- **[K27]** Marquet LA et al. *Enhanced endurance performance by periodization of carbohydrate intake: "sleep low" strategy*. MSSE 2016. Abstract: https://pubmed.ncbi.nlm.nih.gov/26741119/
- **[K28]** Kimber NE, Ross JJ, Mason SL, Speedy DB. *Energy balance during an Ironman triathlon in male and female triathletes*. Int J Sport Nutr Exerc Metab 2002;12:47–62. Abstract: https://pubmed.ncbi.nlm.nih.gov/11993622/
- **[K29]** Pfeiffer B et al. *Nutritional intake and gastrointestinal problems during competitive endurance events*. MSSE 2012;44:344–351. Abstract: https://pubmed.ncbi.nlm.nih.gov/21775906/
- **[K30]** Rowlands DS, Houltham SD. *Multiple-transportable carbohydrate effect on long-distance triathlon performance*. MSSE 2017;49:1734–1744. Abstract: https://pubmed.ncbi.nlm.nih.gov/28350714/
- **[K31]** Jeukendrup AE. *Nutrition for endurance sports: marathon, triathlon, and road cycling*. J Sports Sci 2011;29(S1):S91–S99. Abstract: https://pubmed.ncbi.nlm.nih.gov/21916794/
- **[K32]** 120 g/t-studier: **[K32a]** Podlogar T et al., Eur J Appl Physiol 2022, https://pmc.ncbi.nlm.nih.gov/articles/PMC9560939/; **[K32b]** Hearris MA et al., J Appl Physiol 2022, https://pubmed.ncbi.nlm.nih.gov/35446596/; **[K32c]** Norte BR et al., Scand J Med Sci Sports 2026, https://pmc.ncbi.nlm.nih.gov/articles/PMC13282445/; **[K32d]** Urdampilleta A et al., Nutrients 2020, https://pmc.ncbi.nlm.nih.gov/articles/PMC7400827/. Abstract.
- **[K33]** Gut training: **[K33a]** Costa RJS et al., Appl Physiol Nutr Metab 2017, https://pubmed.ncbi.nlm.nih.gov/28177715/; **[K33b]** Miall A et al., Scand J Med Sci Sports 2018, https://pubmed.ncbi.nlm.nih.gov/28508559/. Abstract.
- **[K35]** Fortis HO et al. *…Pre-race nutrition… female endurance athletes at the IRONMAN World Championships*. Eur J Sport Sci 2026. https://pmc.ncbi.nlm.nih.gov/articles/PMC13256053/
- **[K48]** Sousa CV et al. *Hydration status after an Ironman triathlon: a meta-analysis*. J Hum Kinet 2019. https://pubmed.ncbi.nlm.nih.gov/31915479/ (abstract)
- **[K47]** Vitale K, Getzin A. *Nutrition and supplement update for the endurance athlete: review and recommendations*. Nutrients 2019. https://pmc.ncbi.nlm.nih.gov/articles/PMC6628334/

**Energi, hydrering/sved, vægttab, mikronæringsstoffer, tilskud**

- **[K19a]** Baker LB. *Sweating rate and sweat sodium concentration in athletes: a review of methodology and intra/interindividual variability*. Sports Med 2017;47(S1):111–128. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5371639/; **[K19b]** Baker LB et al. *Normative data for regional sweat sodium concentration and whole-body sweating rate in athletes*. J Sports Sci 2016, https://pubmed.ncbi.nlm.nih.gov/26070030/ (abstract)
- **[K20]** ten Haaf T, Weijs PJM. *Resting energy expenditure prediction in recreational athletes of 18–35 years…* PLoS ONE 2014;9(10):e108460. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0108460 (fuldtekst/PDF læst: ligninger og tabel 4, hvor også Cunningham 1980 og Mifflin et al. 1990 er gengivet)
- **[K21]** Compendium: **[K21a]** Herrmann SD et al. *2024 Adult Compendium of Physical Activities*, J Sport Health Sci 2024, https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/ (1 MET ≈ 3,5 mL/kg/min ≈ 1,0 kcal/kg/t); **[K21b]** MET-værdier: https://pacompendium.com/bicycling/ , https://pacompendium.com/running/ , https://pacompendium.com/water-activities/
- **[K23]** Garthe I et al. *Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes*. IJSNEM 2011;21:97–104. Abstract: https://pubmed.ncbi.nlm.nih.gov/21558571/
- **[K24]** Hector AJ, Phillips SM. *Protein recommendations for weight loss in elite athletes*. IJSNEM 2018;28:170–177. Abstract: https://pubmed.ncbi.nlm.nih.gov/29182451/
- **[K36]** Jern: **[K36a]** Sim M et al., Eur J Appl Physiol 2019, https://pubmed.ncbi.nlm.nih.gov/31055680/; **[K36b]** Clénin G et al., Swiss Med Wkly 2015, https://pubmed.ncbi.nlm.nih.gov/26512429/; **[K36c]** Burden RJ et al., Br J Sports Med 2015, https://pubmed.ncbi.nlm.nih.gov/25361786/. Abstract.
- **[K37]** Owens DJ, Allison R, Close GL. *Vitamin D and the athlete: current perspectives and new challenges*. Sports Med 2018;48(S1):3–16. Fuldtekst: https://pmc.ncbi.nlm.nih.gov/articles/PMC5790847/
- **[K38]** Poon ET et al. *Dietary nitrate supplementation and exercise performance: umbrella review of 20 systematic reviews with meta-analyses*. Sports Med 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12106159/
- **[K44]** Dasa MS et al. *Training volume and total energy expenditure of an Olympic and Ironman world champion…* J Appl Physiol 2024. https://pubmed.ncbi.nlm.nih.gov/39480269/ (abstract)
- **[K45]** TrainerRoad (blog). *Calories and power* (kJ ≈ kcal). https://www.trainerroad.com/blog/calories-and-power/ (praktisk kilde uden fagfællebedømmelse)

---

## 12. Resumétabel (én side): træningsdag-type → energi / kulhydrat / protein + før / under / efter (pr. kg kropsvægt)

Forudsætninger: manden er rask, kropsvægten ukendt, og alle værdier er pr. kg kropsvægt (BW). Energi er afledt (se 1.2). Tallene er rammer, ikke recepter.

| Dagtype | Energi (kcal/kg/d) | Kulhydrat (g/kg/d) | Protein | Før | Under | Efter |
|---|---|---|---|---|---|---|
| **Hvile / meget let** (<45 min let, mobilitet, teknik) | ≈ 33–38 (baseline PAL 1,4–1,6, afledt fra [K22]). Gulv: EA ≥45 kcal/kg FFM + træning [K1, K2]. | **3–5** [K1, K41a] | 1,2–2,0 g/kg/d [K1]; 0,25–0,40 g/kg pr. måltid hver 3.–5. t [K1, K8] | Normalt måltid | Ingen (<45 min) [K1] | Normale måltider; 0,3 g/kg protein [K1] |
| **Moderat** (~1 t) | ≈ 33 + 5–9 pr. time (afledt) ≈ 38–45 | **5–7** [K1, K41a] | som ovenfor | >60 min: 1–4 g/kg 1–4 t før [K1]; rolig <60 min kan køres fastende (praktisk, jf. 3.2) | 45–75 min: små mængder/mundskylning [K1, K4] | Normale måltider + 0,3 g/kg protein |
| **Udholdenhed 1–3 t** | ≈ 33 + 7–9 pr. time cykling (MET 8–10) ≈ 45–60 (afledt) | **6–10** [K1]; (ISSN 5–8 [K12]; TD 7–10 [K41a]) | 1,2–2,0 g/kg/d; 0,3 g/kg efter | 1–4 g/kg 1–4 t før [K1]; væske 5–10 mL/kg 2–4 t før [K1] | **30–60 g/t** (1–2,5 t); mod 60–90 g/t fra ~2,5 t [K1, K4]; væske 0,4–0,8 L/t [K1]; natrium ved >2 t eller svedrate >1,2 L/t [K1] | Ved <8 t til næste krævende pas: 1–1,2 g/kg/t i 4 t + 0,3 g/kg protein; væske 125–150 % af tab [K1] |
| **Lang dag >3–4 t** (lang cykel/brick) | ≈ 33 + 7–9 pr. time (afledt) → 4 t ≈ 61–69; 5 t ≈ 68–78 | **8 til 12** (>4–5 t) [K1]; TD ≥10–12 (>6 t) [K41a] | 1,2–2,0 g/kg/d (op til 2,0+ ved underskud) [K1, K24] | 1–4 g/kg 1–4 t før [K1] | **Op til 90 g/t MTC** [K1, K4]; 120 g/t kun eksperimentelt [K6]; natrium ~500–700 mg/L [K15]; gut-trænet | 1–1,2 g/kg/t i 4 t; 0,3 g/kg protein; 125–150 % væske [K1]; evt. kasein før søvn 30–40 g [K8] |
| **Kvalitetspas** (intervaller/tærskel/racepace, uanset varighed) | efter varighed | efter varighed; **høj tilgængelighed** [K7b] | som ovenfor | 1–4 g/kg 1–4 t før; ikke fastende (<200 mmol/kg tw glykogen forringer intensitet [K7b]) | >60 min: 30–60 g/t [K1] | ≤8 t til næste: 1–1,2 g/kg/t + 0,3 g/kg protein [K1] |
| **"Train-low" rolig dag** (valgfri, sparsomt) | uændret energibalance | lavere kulhydrat før/under, men totalt ≥ båndet for dagen | som ovenfor | fastende/lavt kulhydrat kun lette pas [K7b, K26] | – | Fuld refuel resten af dagen [K7b]. Ikke i vægttab, ved LEA-tegn, ved sygdom eller to dage i træk (praktisk, jf. [K2, K7b]) |
| **Vægttabsdag** (kun basefase) | underskud ~250–500 kcal/d [K1], rate <1 %/uge (ca. 0,7 % [K23]) | 3–6 g/kg [K25]; højt omkring nøglepas | **1,6–2,4** [K24, K25] | som relevant dagtype | som relevant dagtype | som relevant dagtype. Ingen vægttab i build/peak/taper (jf. 1.4) |
| **Race −2 døgn** (kulhydratopbygning) | højt kulhydrat, taperet træning | **10–12 for 36–48 t** [K1, K3] | normalt | – | – | Lavt fiber/fedt [K1, K35] |
| **Løbsdag (Ironman)** | ikke dækkende (stort underskud er uundgåeligt [K28]) | – | – | **1–4 g/kg 1–4 t før** [K1]; væske 5–10 mL/kg 2–4 t før [K1]; koffein 3–6 mg/kg ~60 min før [K10] | **Cykel 60–90 g/t** MTC; **løb 30–90 g/t** efter tolerance [K1, K4]; væske 0,4–0,8 L/t eller tørst [K1, K18]; natrium 500–700 mg/L [K15] | 1–1,2 g/kg/t i 4 t + 0,3 g/kg protein; 125–150 % væske [K1] |
