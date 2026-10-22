# Ironman 2027 – træningskalender

43 ugers plan fra mandag 26. oktober 2026 til **IRONMAN Copenhagen søndag 22. august 2027**, med **Køge Jernmand** (mellemdistance, DM) søndag 13. juni 2027 som generalprøve.

Projektet har ingen afhængigheder – kun Node (v20+). Arkitekturen er beskrevet i [docs/architecture.md](docs/architecture.md).

## Guides

1. [Abonnér på kalenderen – iPhone](docs/guides/kalender-iphone.md)
2. [Abonnér på kalenderen – Google Kalender og Outlook](docs/guides/kalender-google.md)
3. [Installér appen på hjemmeskærmen](docs/guides/installer-app.md)
4. [Forbind GitHub (synk mellem enheder)](docs/guides/forbind-github.md)
5. [Opsætning og flytning af afkrydsninger](docs/guides/opsaetning.md)

## Filer

| Fil | Indhold |
| --- | --- |
| `src/plan.js` | Plandata (faser, uger, pas) + `plan()`, TSS-estimat og PMC-beregning. ES-modul, bruges både af Node og inlinet i siden. |
| `src/progress.js` | Afkrydsninger og tider (skema v2): sammenfletning, validering og eksport. Ren logik, bruges i Node og i browseren. |
| `src/app.html`, `src/app.js`, `src/styles.css` | Siden: kalender, detaljevisning med log, præstationsgraf og guide. |
| `src/ics.js` | Kalendereksport (RFC 5545). |
| `build.mjs`, `build/` | Byggescript og mål: `artifact` (claude.ai) og `site` (GitHub Pages). |
| `scripts/` | Hent fremdrift til kalenderen (CI) og opret Gist'en fra terminalen. |
| `docs/` | Arkitektur og guides. |
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

`dist/artifact/index.html` er bygget til at blive vist som et claude.ai-Artifact. Den gemmer afkrydsninger, faktisk tid, RPE og noter i Artifact-databasen (samling `progress`, ét dokument pr. uge `u01`…`u43`), så du kan se dem fra både telefon og computer. Åbnes filen uden for claude.ai, gemmes det kun i den browser (localStorage).

`dist/site/` er den installerbare version til GitHub Pages, med synk via en GitHub Gist. Opsætningen står i [opsætningsguiden](docs/guides/opsaetning.md).

**Udgivelse:** Bed Claude om at udgive `dist/artifact/index.html` til den eksisterende claude.ai-side, så linket og dine gemte data bevares.

## Antagelser

- Løbsdatoerne er tjekket i oktober 2026. Tilmelding til Køge Jernmand: sportstiming.dk/event/18710.
- Eksamensugerne (uge 7–8 og 30–31) er antaget.
- 10 km (uge 14) og halvmaraton (uge 26) er pladsholdere: find et lokalt løb.
- TSS er et groft estimat (minutter × intensitet² × 100/60), og start-CTL er sat til 25.
