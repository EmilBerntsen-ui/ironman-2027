# Opsætning og flytning af afkrydsninger

Del 1 er engangsopsætningen af repoet, og den gælder kun for ejeren. Del 2 flytter dine afkrydsninger fra claude.ai-siden til den nye app. Kommandoerne køres fra roden af repoet, med `gh` logget ind.

## Del 1: Engangsopsætning (ejer)

1. **Lav kalender-tokenet:**
   ```sh
   openssl rand -hex 20
   ```
   Gem værdien i din adgangskodemanager. Den er 40 tegn.
2. **Gem tokenet som secret:**
   ```sh
   gh secret set CAL_TOKEN
   ```
   `gh` spørger efter værdien. Indsæt den, og tryk Enter.
3. **Slå GitHub Pages til med GitHub Actions som kilde:**
   ```sh
   gh api -X POST repos/EmilBerntsen-ui/ironman-2027/pages -f build_type=workflow
   ```
   Har Pages allerede været slået til, giver kommandoen en fejl. Skift i stedet kilden til **GitHub Actions** under repoets *Settings → Pages*.
4. **Udgiv siden,** så appen kan åbnes:
   ```sh
   gh workflow run pages.yml && gh run watch --exit-status
   ```
5. **Forbind appen** (se [Forbind GitHub](forbind-github.md)). Det første forbind opretter Gist'en. Kopiér gist-ID'et fra synk-dialogen, og gem det:
   ```sh
   gh secret set GIST_ID
   ```
   **Eller opret Gist'en fra terminalen,** fx før appen er forbundet. Scriptet `scripts/create-gist.mjs` gør det samme som appen ved første forbindelse (samme markørfil og beskrivelse) og skriver kun gist-ID'et. Tokenet skal have **Gists → Read and write**, som tokenet i appen, og læses fra miljøvariablen `GITHUB_TOKEN`:
   ```sh
   read -rs GITHUB_TOKEN && export GITHUB_TOKEN   # indsæt tokenet (det vises ikke), og tryk Enter
   node scripts/create-gist.mjs | gh secret set GIST_ID
   unset GITHUB_TOKEN
   ```
   Findes der allerede en Gist fra appen, opretter scriptet ikke en ny. Det skriver i stedet ID'et på den eksisterende (og en besked om det på fejlkanalen), så kommandoen kan køres igen uden skade. Når du bagefter forbinder appen, finder den Gist'en selv.
6. **Læse-token (påkrævet for ✅-mærkerne):** Gem tokenet fra [Forbind GitHub, afsnit 3](forbind-github.md#3-læse-token-til-den-natlige-kalender):
   ```sh
   gh secret set GIST_READ_TOKEN
   ```
   Både `GIST_ID` og `GIST_READ_TOKEN` skal være sat, før kalenderen får ✅. Mangler en af dem, springer opbygningen hentningen over, viser en gul advarsel i loggen og bygger kalenderen uden mærker. Udrulningen fejler ikke.
7. **Kør workflowet igen,** så kalenderen får afkrydsningerne fra Gist'en:
   ```sh
   gh workflow run pages.yml && gh run watch --exit-status
   ```
8. **Tjek kalenderfilen.** Svaret skal indeholde `content-type: text/calendar`:
   ```sh
   curl -sI "https://emilberntsen-ui.github.io/ironman-2027/cal/<din-token>/ironman-2027.ics" | grep -i 'content-type: text/calendar'
   ```

Mærkerne følger det sidste build. Efter ændringer i planen kan du køre `gh workflow run pages.yml` for at opdatere med det samme.

## Del 2: Flyt dine afkrydsninger fra claude.ai-siden

Gør det én gang. Forudsætningen er, at appen er forbundet til GitHub (del 1, trin 5).

1. **Udgiv den nye version af Artifact'et.** Byg med `node build.mjs --target=artifact`, og bed Claude om at udgive `dist/artifact/index.html` til det eksisterende Artifact. Åbn det bagefter.
2. **Eksportér.** Tryk på synk-statusknappen øverst i Artifact'et, og vælg **Eksportér**. Kopiér JSON-teksten.
3. **Gem JSON'en uden for repoet,** fx i en mappe på skrivebordet. Filen indeholder dine noter og RPE.
4. **Importér i appen.** Åbn den installerede app, tryk på synk-statusknappen, vælg **Importér**, og indsæt JSON'en eller vælg filen. Importen flettes ind i det, appen allerede har. Findes en session begge steder, vinder den nyeste ændring.
5. **Slet eksportfilen,** når du har tjekket et par pas.

Alternativ uden knapperne: Bed Claude om at læse samlingen `progress` i Artifact'ets database og lave samme JSON.

**Bemærk:** Artifact'et og appen synkroniseres ikke med hinanden. Efter flytningen opdateres kun appen. Artifact'ets egne data bliver liggende.
