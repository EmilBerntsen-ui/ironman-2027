# Strava-synk (flueben uden at sætte dem selv)

Når Strava-synk er sat op, læser en GitHub Action dine seneste Strava-aktiviteter, finder det planlagte pas de passer til, og sætter fluebenet i din Gist. Appen viser det inden for ét minut (den tjekker Gist'en hvert minut), og kalenderen får ✅ ved næste opbygning. Du skal ikke gøre andet end at træne og uploade til Strava.

Synken kører to gange i døgnet: **kl. 04:17** og **kl. 22:17** (dansk tid), så et pas fra aftenen står som gennemført samme aften. Den kører også ved hver ændring i repoet og når du starter den selv.

Kun den, der ejer repoet, kan sætte det op. Kommandoerne køres fra roden af repoet på din Mac, med `gh` logget ind.

## Det her gemmes (og ikke)

Aktiviteter der ikke passer til et planlagt pas (en gåtur, en ekstra løbetur), kommer i appen som et stiplet "Ekstra"-kort med sport, minutter, afstand og puls. Slet dem i appen, hvis du ikke vil se dem; de kommer ikke tilbage. Kalenderen (.ics) viser stadig kun planen.

Hvert flueben fra Strava får: gennemført, tidspunkt, **minutter**, **afstand** og **gennemsnitspuls** (hvis uret målte den), og id'et på aktiviteten, så appen kan linke til den (*Se på Strava* i pasets detaljevisning).

Aldrig gemt eller skrevet i logs: aktivitetens navn, beskrivelse, kort, rute, GPS, sted, udstyr, enhed eller dit Strava-navn. Logfilerne på GitHub er offentlige, så de indeholder kun tal, fx `Strava: 6 aktiviteter i vinduet · 3 nye pas · 0 genskabt · 1 optaget (manuel/fjernet) · 1 ekstra`. Hvilke pas du har gennemført, står aldrig i loggen.

## Engangsopsætning

- [ ] **1. Opret Strava-appen** på [strava.com/settings/api](https://www.strava.com/settings/api) (log ind i en browser først; det virker ikke i Strava-appen):
  - Navn: `IM2027 Sync` (Strava tillader ikke ordet "Strava" i navnet).
  - Kategori: *Training*.
  - Hjemmeside: `https://emilberntsen-ui.github.io/ironman-2027/`
  - **Authorization Callback Domain: `localhost`**
  - Upload `assets/icons/icon-512.png` som ikon.
  - Skriv **Client ID** (et tal) og **Client Secret** ned. Secret er hemmelig: del den ikke.

- [ ] **2. Lav et nyt GitHub-token** til Action'en, adskilt fra tokenene på dine enheder, så det kan tilbagekaldes for sig:
  1. Åbn https://github.com/settings/personal-access-tokens/new.
  2. **Token name:** `IM2027 CI write`. **Expiration:** *Custom*, **30. september 2027**.
  3. **Repository access:** *Public repositories*. **Account permissions:** **Gists → Read and write**. Ingen andre rettigheder.
  4. Gem det som secret (`gh` spørger efter værdien):
     ```sh
     gh secret set GIST_WRITE_TOKEN
     ```

- [ ] **3. Hent Strava-tokenet** (engangsgodkendelse i browseren):
  ```sh
  read -rs STRAVA_CLIENT_SECRET && export STRAVA_CLIENT_SECRET   # indsæt Client Secret (det vises ikke), og tryk Enter
  STRAVA_CLIENT_ID=<id> node scripts/strava-auth.mjs
  ```
  1. Browseren åbner Strava. Tryk **Authorize**, og **lad fluebenet for aktiviteter være sat**.
  2. Scriptet gemmer selv de tre secrets `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` og `STRAVA_REFRESH_TOKEN`. Det udskriver aldrig tokenet.
  3. Ryd op:
     ```sh
     unset STRAVA_CLIENT_SECRET
     ```
  - **Har du sat dine aktiviteter til "Kun dig" (Only You) i Strava?** Så ser synken dem ikke med standardtilladelsen (`activity:read`). Kør i stedet scriptet med `--read-all`, som beder om `activity:read_all`:
    ```sh
    STRAVA_CLIENT_ID=<id> node scripts/strava-auth.mjs --read-all
    ```
    Aktiviteter, der er synlige for dine følgere eller alle, ses også uden `--read-all`. Strava skjuler stadig dine privatlivszoner, og GPS bliver aldrig gemt eller logget, uanset valg.
  - **Mangler du `gh`?** Kør med `--print`. Så skrives kun refresh-tokenet til skærmen, og du gemmer det selv med `gh secret set STRAVA_REFRESH_TOKEN` (og de to andre med `gh secret set STRAVA_CLIENT_ID` og `gh secret set STRAVA_CLIENT_SECRET`).
  - Står der "Du fjernede flueben ved aktiviteter": du fjernede fluebenet på Stravas samtykkeside. Kør scriptet igen.

- [ ] **4. Første kørsel** (7 dage tilbage, så du får de seneste pas med):
  ```sh
  gh workflow run pages.yml -f strava_days=7 && gh run watch --exit-status
  ```
  Tjek, at loggen i trinnet *Strava sync* skriver `Strava: … nye pas`, og at appen viser fluebenene.

- [ ] **5. Tjek, at den er idempotent:** kør kommandoen igen. Loggen skal nu skrive `0 nye pas`, og appen ændrer sig ikke.

Mangler en eller flere af de fire secrets (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, `GIST_WRITE_TOKEN`) eller `GIST_ID`, springer trinnet over med en grå besked (*Strava er ikke sat op*) eller en gul advarsel, der nævner, hvad der mangler. Siden bygges og udrulles som før.

## Sådan matcher synken

- En aktivitet hører til **den danske dag**, den startede på, og til passet i **samme sportsgren**: svømning, cykling (også virtuel og grus), løb (også trail), styrke. Gåture og andet bliver ignoreret.
- Aktiviteten skal være mindst 5 minutter og mindst en fjerdedel af det planlagte pas. Er der to pas i samme gren samme dag, får hvert den aktivitet, der passer bedst til dets længde.
- Et løbspas på **Køge Jernmand** eller **IRONMAN** samler alle dagens svømme-, cykel- og løbsaktiviteter i ét pas.
- Minutter: for svømning og styrke den samlede tid, ellers bevægelsestiden.
- **Dit eget flueben vinder altid.** Synken rører aldrig et pas, du har sat flueben på, og et flueben, du selv sætter efter træningen, slår Strava-passet. Fjerner du fluebenet på et pas fra Strava, kommer det ikke tilbage.
- Synken kigger de seneste dage tilbage (standard 3). Er du bagud, så start den med flere dage: `gh workflow run pages.yml -f strava_days=14`. Højst 30.
- Trænede du en anden dag end planlagt, eller delte du ét pas i to optagelser, så sæt fluebenet selv.
- Sletter eller ændrer du en aktivitet på Strava bagefter, ændrer fluebenet i appen sig ikke.

## Hvis noget går galt

Siden udrulles altid, også når Strava fejler. Er det alvorligt, fejler kørslen **bagefter**, og GitHub sender dig en mail.

| Du ser | Betydning | Gør |
| --- | --- | --- |
| Mail: *Strava-synk fejlede (auth)* | Strava-adgangen er udløbet eller tilbagekaldt | Kør `node scripts/strava-auth.mjs` igen (trin 3). Brug samme `--read-all` som før, hvis du valgte den |
| Mail: *Strava-synk fejlede (error)* | Fx udløbet `GIST_WRITE_TOKEN` (30. sep. 2027), forkert `GIST_ID`, eller tokenet kunne ikke gemmes | Åbn kørslen på GitHub (*Actions*), og læs den røde linje i trinnet *Strava sync*. Lav et nyt token (trin 2), eller ret secret'en |
| Gul advarsel: *Strava kunne ikke nås* | Strava eller GitHub var nede, eller du ramte en grænse | Intet. Næste kørsel tager de seneste dage igen |
| Flueben mangler i appen | Aktiviteten er i en anden gren, for kort, eller en anden dag end planlagt | Sæt fluebenet selv. Start evt. synken med flere dage |
| Appen viser ikke et nyt pas | Appen tjekker Gist'en hvert minut, så vent lidt | Luk og åbn appen igen |

Når du kører `strava-auth.mjs` igen, opdager Action'en det nye token ved næste kørsel og bruger det i stedet for det gamle. Du skal ikke gøre mere.

## Stop Strava-synk

1. Tilbagekald appen på https://www.strava.com/settings/apps (*IM2027 Sync*, **Revoke Access**).
2. Slet secrets:
   ```sh
   gh secret delete STRAVA_CLIENT_ID && gh secret delete STRAVA_CLIENT_SECRET && gh secret delete STRAVA_REFRESH_TOKEN && gh secret delete GIST_WRITE_TOKEN
   ```
3. Tilbagekald tokenet *IM2027 CI write* under https://github.com/settings/personal-access-tokens.

Fluebenene, der allerede er sat, bliver stående. Uden secrets springer trinnet bare over.

## Til dig der vil vide mere

Det tekniske design står i [docs/strava.md](../strava.md). Strava-tokenet fornyes ved hver kørsel; det nyeste token gemmes **krypteret** i Gist'en (filen `_strava.json`), så det ikke går tabt mellem kørsler. Nøglen er din Client Secret, som kun ligger i GitHub-secrets.
