# Ironman 2027 – træningskalender

43 ugers plan fra mandag 26. oktober 2026 til **IRONMAN Copenhagen søndag 22. august 2027**, med **Køge Jernmand** (mellemdistance, DM) søndag 13. juni 2027 som generalprøve.

Projektet har ingen afhængigheder – kun Node (v20+). Arkitekturen er beskrevet i [docs/architecture.md](docs/architecture.md).

## Guides

1. [Abonnér på kalenderen – iPhone](docs/guides/kalender-iphone.md)
2. [Abonnér på kalenderen – Google Kalender og Outlook](docs/guides/kalender-google.md)
3. [Installér appen på hjemmeskærmen](docs/guides/installer-app.md)
4. [Forbind GitHub (synk mellem enheder)](docs/guides/forbind-github.md)
5. [Opsætning og flytning af afkrydsninger](docs/guides/opsaetning.md)
6. [Strava-synk (flueben uden at sætte dem selv)](docs/guides/strava.md)

## Filer

| Fil | Indhold |
| --- | --- |
| `src/plan.js` | Plandata (faser, uger, pas) + `plan()`, TSS-estimat og PMC-beregning. ES-modul, bruges både af Node og inlinet i siden. |
| `src/progress.js` | Afkrydsninger og tider (skema v2): sammenfletning, validering og eksport. Ren logik, bruges i Node og i browseren. |
| `src/pace.js` | Anbefalet fart pr. pas ud fra tre grundtal (løbetærskel, CSS og cykeltærskel), plus visning og tolerant indtastning af faktisk pace. Ren logik, bruges i Node og i browseren. |
| `src/nutrition.js` | Kost: dagtyper, kulhydrat pr. kg, energi (estimat), før/under/efter pr. pas, vægt (kun lokalt) og kostguiden som data. Ren logik, bruges i Node og i browseren. |
| `src/app.html`, `src/app.js`, `src/styles.css`, `src/views.css` | Siden: fem faner med en menu i bunden (I dag, Kalender, Kost, Analyse, Mere), detaljevisning med log, præstationsgraf og guides. |
| `src/views.js` | Rene hjælpefunktioner til fanerne: routing (`#idag`, `#kalender`, `#kost`, `#analyse`, `#mere`, `#u12`), nøglepas, overholdelse pr. sport og stat-kort. Bruges i Node og i browseren. |
| `src/ics.js` | Kalendereksport (RFC 5545). |
| `build.mjs`, `build/` | Byggescript og mål: `artifact` (claude.ai) og `site` (GitHub Pages). |
| `scripts/` | Hent fremdrift til kalenderen (CI), opret Gist'en fra terminalen og Strava-synk (`strava-sync.mjs` i CI, `strava-auth.mjs` til engangsgodkendelsen, fælles kode i `scripts/lib/`). |
| `docs/` | Arkitektur, [Strava-design](docs/strava.md), guides og [kildebaseret kostrapport](docs/research/ernaering-kilder.md). |
| `test/` | Tests af plan, fremdrift, build og .ics-format. |

## Byg og test

```sh
node build.mjs                    # begge mål
node build.mjs --target=artifact  # dist/artifact/index.html (til claude.ai-Artifact)
node build.mjs --target=site      # dist/site/ (til GitHub Pages)
node --test                       # kører testene
```

Hver build skriver også `dist/ironman-2027.ics`. Den indeholder kun planen, uden afkrydsninger, og er til manuel import. Den udgives ikke.

Ret plan eller tekst i `src/`, og kør `node build.mjs` igen. Rediger aldrig filerne i `dist/` direkte.

## Kalenderen (.ics)

`dist/ironman-2027.ics` har én begivenhed pr. træningspas (ikke hviledage). Hver begivenhed har et fast UID, så en ny import opdaterer pas i stedet for at lave dubletter. Det gælder for abonnementer; ved import afhænger det af kalenderappen. Abonnement og import er beskrevet i guiderne ovenfor.

Bemærk: Importerer du filen igen efter ændringer i planen, kan nogle apps lave dubletter. Slet i så fald den gamle kalender, og importér på ny.

## Siden

Siden har fem faner med en menu i bunden (på brede skærme i venstre side): **I dag** (dagens pas med anbefalet fart, kost og log, Fitness/Form/Træthed, ugens fremdrift og næste nøglepas), **Kalender**, **Kost** (dagens og ugens mål samt guiden), **Analyse** (præstationsgraf, timer pr. uge og overholdelse pr. sport) og **Mere** (synk, vægt, eksport/import, zoner, regler og version). Adresserne er `#idag`, `#kalender`, `#kost`, `#analyse` og `#mere`, og `#u12` åbner kalenderen ved uge 12. Se [arkitekturen](docs/architecture.md) §2.4.

`dist/artifact/index.html` er bygget til at blive vist som et claude.ai-Artifact. Den gemmer afkrydsninger, faktisk tid, faktisk pace, RPE og noter i Artifact-databasen (samling `progress`, ét dokument pr. uge `u01`…`u43`), så du kan se dem fra både telefon og computer. Åbnes filen uden for claude.ai, gemmes det kun i den browser (localStorage).

`dist/site/` er den installerbare version til GitHub Pages, med synk via en GitHub Gist. Opsætningen står i [opsætningsguiden](docs/guides/opsaetning.md).

**Udgivelse:** Bed Claude om at udgive `dist/artifact/index.html` til den eksisterende claude.ai-side, så linket og dine gemte data bevares.

## Antagelser

- Løbsdatoerne er tjekket i oktober 2026. Tilmelding til Køge Jernmand: sportstiming.dk/event/18710.
- Eksamensugerne (uge 7–8 og 30–31) er antaget.
- 10 km (uge 14) og halvmaraton (uge 26) er pladsholdere: find et lokalt løb.
- Fartzonerne regnes ud fra tre forsigtige grundtal i `src/pace.js` (løbetærskel 5:45 /km, CSS 2:10 /100 m, cykeltærskel 29 km/t). De opdateres efter testugen i uge 5, og så flytter alle zoner sig med. Cykel vises kun i km/t; indendørs står der "efter følelse og kadence".
- Kost: tallene kommer fra [kostrapporten](docs/research/ernaering-kilder.md). Energi er et estimat (vægt × 37 kcal + træningstimer × vægt × 8,5 kcal, ±5 %), og de to konstanter er praktiske estimater, ikke målte tal. Din vægt angives i indstillingerne, gemmes kun på enheden og kommer aldrig i Gist, eksport eller kalender. Kalenderen får kun en linje med g/t til pas over 75 min.
- TSS er et groft estimat (minutter × intensitet² × 100/60), og start-CTL er sat til 25.
