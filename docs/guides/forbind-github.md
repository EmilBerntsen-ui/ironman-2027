# Forbind GitHub (synk mellem enheder)

Synk gemmer dine afkrydsninger, tider, RPE og noter i en hemmelig GitHub-Gist. Hver enhed får sin egen adgangsnøgle (et fine-grained personal access token, PAT), som kun kan læse og skrive dine Gists.

En hemmelig Gist er skjult, ikke privat: den, der har linket eller ID'et, kan læse den. Del derfor aldrig gist-ID'et eller tokenet.

## 1. Opret tokenet (én gang pr. enhed)

1. Åbn **https://github.com/settings/personal-access-tokens/new**, og log ind først. Eller gå til github.com → profilbillede → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `IM2027 iPhone` (eller `IM2027 Mac`). Lav ét token pr. enhed.
3. **Resource owner:** din konto, `EmilBerntsen-ui`.
4. **Expiration:** vælg *Custom*, og sæt datoen til **30. september 2027**.
5. **Repository access:** *Public repositories*. Det er den mindste rettighed, GitHub tilbyder.
6. **Account permissions:** find **Gists**, og sæt den til **Read and write**. Sæt ingen andre rettigheder.
7. Tryk på **Generate token**, og kopiér tokenet. Det begynder med `github_pat_`. GitHub viser det kun én gang.

## 2. Forbind i appen

1. Åbn den **installerede** app (se [Installér appen](installer-app.md)).
2. Tryk på synk-statusknappen øverst. Dialogen *Synkronisering* åbnes.
3. Indsæt tokenet i feltet, og tryk på **Forbind**.
4. Appen finder den eksisterende Gist, eller opretter en, hvis der ikke er én endnu. Status skifter til *Synkroniseret kl. HH:MM*.

Finder appen ikke Gist'en, kan du under **Avanceret** indtaste gist-ID'et selv.

Fejlbeskeder:
- *Tokenet blev afvist:* Tjek, at du har kopieret hele tokenet, og at det ikke er udløbet.
- *Tokenet mangler Gists: Read and write:* Ret rettighederne på tokenet i GitHub, eller opret et nyt.

## 3. Læse-token til den natlige kalender

Kalenderen får ✅ ved de pas, du har gennemført. Mærkerne bygges om natten, og til det kræves et separat læse-token, som ikke behøver nogen rettigheder. **Uden tokenet får kalenderen ingen ✅-mærker.** Den natlige opbygning fejler ikke af den grund, men viser en gul advarsel (*GIST_READ_TOKEN er ikke sat*) og bygger kalenderen uden mærker.

1. Opret et nyt fine-grained token som i trin 1, med navnet `IM2027 build (læs)`.
2. **Repository access:** *Public repositories*. Ingen **Account permissions**.
3. Samme udløbsdato: **30. september 2027**.
4. Gem tokenet som GitHub-secret med `gh secret set GIST_READ_TOKEN` (se [opsætning](opsaetning.md)).

Fejler den natlige opbygning med 404, når gisten hentes, så giv tokenet **Gists → Read-only** i GitHub, og kør opbygningen igen.

## Afbryd og tilbagekald

- **En enhed:** Gå til **https://github.com/settings/personal-access-tokens**, åbn tokenet `IM2027 …` for den enhed, og tryk på **Revoke**. De andre enheder virker videre.
- **I appen:** Åbn *Synkronisering*, og tryk på **Afbryd forbindelse**. Sæt flueben i *Slet også data på denne enhed*, hvis enheden skal være helt ren.
- **Udløb:** Når tokenet udløber, viser appen *Forbind GitHub igen*. Ændringer, der venter på at blive sendt, ligger i køen, indtil du forbinder igen.

Tokenet gemmes kun i browserens lager på den enhed, hvor du forbinder. Læg det aldrig i repoet, i chat eller på skærmbilleder.
