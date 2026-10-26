// owned by 2b
// ---- Synkronisering: dialog til forbindelse, status og eksport/import (docs/architecture.md §3.6 og §4.3) ----
// Bygges med DOM-metoder og textContent (aldrig innerHTML med data), så noter og alt fra GitHub kun nogensinde er tekst.
// Ingen bivirkninger ved indlæsning; alt sker i mountSettings().
import { parseAny, toExport } from './progress.js';
import { WEIGHT_MAX, WEIGHT_MIN, readWeight, saveWeight } from './nutrition.js';

const PAT_NEW_URL = 'https://github.com/settings/personal-access-tokens/new';
const PAT_LIST_URL = 'https://github.com/settings/personal-access-tokens';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== undefined && c !== null && c !== false) n.append(c);
  return n;
}
const hhmm = iso => {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
};
const countSessions = p => Object.values(p).reduce((n, w) => n + Object.keys(w).length, 0);
const weeksOf = n => `${n} ${n === 1 ? 'uge' : 'uger'}`;

// store: den aktive Store. target: 'artifact' | 'site'. gist: GistStore-klassen (site) eller null (artifact).
// openButton: knappen (eller en liste af knapper) der åbner dialogen: statuslinjen og "Indstillinger"-knappen i headeren.
// onWeight(kg|null): kaldes, når vægten er gemt (null = fjernet). Vægten er personlig og bor kun i localStorage på enheden (src/nutrition.js),
// aldrig i Store'en, så den hverken synkroniseres, eksporteres eller kommer i kalenderen.
// container: tegn indstillingerne direkte i dette element (fanen Mere) i stedet for i en dialog. Så er der ingen dialog, og openButton er valgfri
// (knapperne kalder blot open(), og aria-haspopup sættes ikke).
// open() kalder i så fald onReveal({ focusWeight }), som skal vise containeren (app.js skifter til fanen Mere), og lægger derefter markøren i vægtfeltet, hvis det er bedt om.
// → { open({ focusWeight }), close(), setStore(next), syncWeight(), dispose() }. open({ focusWeight: true }) åbner med markøren i vægtfeltet. setStore skifter Store (fx fra LocalStore til ArtifactDbStore, når databasen er klar).
// syncWeight() henter vægten fra lageret igen (fx efter en ændring i en anden fane), uden at røre feltet mens man skriver i det.
export function mountSettings({ store, target, version, openButton, gist = null, onWeight = null, container = null, onReveal = null } = {}) {
  const openers = [].concat(openButton || []).filter(Boolean);
  const inline = !!container;
  if (!store || (!openers.length && !inline) || typeof document === 'undefined') return null;
  const isSite = target === 'site';
  let framed = false;
  try { framed = window.top !== window.self; } catch { framed = true; }

  const dlg = inline ? container : el('dialog', { class: 'sheet settings', 'aria-labelledby': 'setTitle', lang: 'da' });
  if (!inline) document.body.append(dlg);
  if (!inline) for (const b of openers) b.setAttribute('aria-haspopup', 'dialog');
  let refs = {};
  let blobUrl = null;
  let authShown = false; // om dialogen viser feltet til et nyt token (status 'auth')

  const say = (node, text, bad) => { if (node) { node.textContent = text; node.classList.toggle('bad', !!bad); } };

  function paintStatus(s = store.status) {
    if (!refs.status) return;
    say(refs.status, s.label);
    refs.status.dataset.state = s.state;
    say(refs.detail, s.detail && (s.state === 'error' || s.state === 'auth') ? s.detail : '', true);
    if (refs.pending) refs.pending.textContent = String(s.pending);
    if (refs.last) refs.last.textContent = s.lastSync ? `kl. ${hhmm(s.lastSync)}` : 'endnu ikke';
    paintWipeWarn(s);
  }
  // Advarsel ved fluebenet, så man ser det inden man trykker: ventende uger forsvinder, hvis den lokale kopi slettes.
  function paintWipeWarn(s = store.status) {
    if (!refs.wipeWarn) return;
    const n = s.pending || 0;
    say(refs.wipeWarn, refs.wipe && refs.wipe.checked && n > 0
      ? `${weeksOf(n)} er endnu ikke sendt til GitHub. Slettes data på denne enhed nu, mister du dem. Tryk Synk nu først, eller eksportér.` : '', true);
  }

  // ---- afsnit ----
  // reconnect: gist-id'et på den eksisterende forbindelse. Så er det et nyt token til samme gist (uden at afbryde og miste kø/data).
  function connectSection({ reconnect = null } = {}) {
    if (framed) return el('section', null, el('h4', null, 'Forbind GitHub'), el('p', null, 'Af sikkerhedshensyn kan du ikke indtaste et token på en indlejret side. Åbn siden direkte i en browserfane.'));
    const token = el('input', { type: 'password', id: 'setToken', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'github_pat_…' });
    const gistId = reconnect ? null : el('input', { type: 'text', id: 'setGistId', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '32 tegn' });
    const msg = el('div', { class: 'msg', role: 'status' });
    const go = el('button', { type: 'button', class: 'btn primary' }, reconnect ? 'Gem nyt token' : 'Forbind');
    go.addEventListener('click', async () => {
      go.disabled = true; say(msg, reconnect ? 'Tjekker tokenet…' : 'Forbinder…');
      try {
        await gist.connect(token.value, { gistId: reconnect || (gistId.value.trim() || undefined) });
        token.value = '';
        say(msg, reconnect ? 'Tokenet er gemt. Genindlæser…' : 'Forbundet. Genindlæser…');
        location.reload();
      } catch (e) {
        say(msg, e && e.message ? e.message : 'Kunne ikke forbinde.', true);
        go.disabled = false;
      }
    });
    return el('section', { id: reconnect ? 'setReconnect' : undefined },
      el('h4', null, reconnect ? 'Nyt token' : 'Forbind GitHub'),
      reconnect
        ? el('p', null, 'GitHub afviste tokenet. Det er udløbet, tilbagekaldt eller mangler rettigheder. Indsæt et nyt token her, så sendes de ændringer, der venter. Du behøver ikke afbryde forbindelsen.')
        : [el('p', null, 'Dine pas gemmes lige nu kun på denne enhed. Forbind GitHub, så telefon og computer holder samme log.'),
           el('p', null, 'Synkroniseringen bruger en hemmelig Gist på din egen GitHub-konto. Tokenet gemmes kun på denne enhed og sendes kun til GitHub.'),
           el('p', null, 'Lav ét token pr. enhed, og forbind inde i den installerede app.')],
      el('p', null, el('a', { href: PAT_NEW_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Opret et token på GitHub')),
      el('ul', { class: 'steps' },
        el('li', null, 'Token name: fx ', el('code', null, 'IM2027 iPhone')),
        el('li', null, 'Expiration: Custom, ', el('code', null, '2027-09-30')),
        el('li', null, 'Repository access: ', el('code', null, 'Public repositories')),
        el('li', null, 'Account permissions: ', el('code', null, 'Gists'), ' → ', el('code', null, 'Read and write'), ' (intet andet)')),
      el('label', { class: 'field' }, 'Token', token),
      gistId && el('details', null, el('summary', null, 'Avanceret: gist-id'),
        el('p', { class: 'hint' }, 'Bruges kun hvis automatisk søgning fejler. Gisten skal indeholde filen _ironman-2027.json.'),
        el('label', { class: 'field' }, 'Gist-id', gistId)),
      el('div', { class: 'sh-actions' }, go), msg);
  }

  function connectedSection() {
    const c = store.config || {};
    refs.pending = el('b', { class: 'num' });
    refs.last = el('b');
    const msg = el('div', { class: 'msg', role: 'status' });
    const now = el('button', { type: 'button', class: 'btn' }, 'Synk nu');
    now.addEventListener('click', async () => {
      now.disabled = true; say(msg, '');
      try { await store.syncNow(); } finally { now.disabled = false; paintStatus(); }
    });
    const wipe = el('input', { type: 'checkbox', id: 'setWipe' });
    refs.wipeWarn = el('p', { class: 'hint bad', role: 'status' });
    wipe.addEventListener('change', () => paintWipeWarn());
    const off = el('button', { type: 'button', class: 'btn danger' }, 'Afbryd forbindelse');
    off.addEventListener('click', () => {
      if (wipe.checked) {
        const n = store.status.pending;
        // Uger der venter findes kun på denne enhed: slettes de, er de væk for altid. Teksten må ikke love, at alt ligger på GitHub.
        const text = n > 0
          ? `${weeksOf(n)} er endnu ikke sendt til GitHub. Sletter du data på denne enhed nu, mister du dem for altid, for de findes ikke andre steder. Vil du slette alligevel?`
          : 'Slet alle pas på denne enhed? Det du har gemt på GitHub bliver liggende.';
        if (!confirm(text)) return;
      }
      gist.disconnect(localStorage, { wipeLocal: wipe.checked });
      location.reload();
    });
    refs.wipe = wipe;
    return el('section', null,
      el('h4', null, 'Forbundet til GitHub'),
      el('dl', { class: 'facts' },
        c.login ? [el('dt', null, 'Konto'), el('dd', null, c.login)] : null,
        el('dt', null, 'Sidst synkroniseret'), el('dd', null, refs.last),
        el('dt', null, 'Uger der venter'), el('dd', null, refs.pending),
        c.tokenHint ? [el('dt', null, 'Token'), el('dd', null, el('code', null, c.tokenHint))] : null,
        el('dt', null, 'Gist-id'), el('dd', null, el('code', { class: 'sel' }, c.gistId || ''))),
      el('p', { class: 'hint' }, 'Gist-id\'et bruges som GIST_ID-hemmelighed i GitHub Actions. Hold det for dig selv: alle der kender det, kan læse dine noter.'),
      el('div', { class: 'sh-actions left' }, now), msg,
      el('div', { class: 'danger-zone' },
        el('label', { class: 'chkrow small' }, wipe, 'Slet også data på denne enhed'),
        refs.wipeWarn,
        el('div', { class: 'sh-actions left' }, off),
        el('p', { class: 'hint' }, el('a', { href: PAT_LIST_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Tilbagekald token på GitHub'), ' (hvis enheden er mistet)')));
  }

  function transferSection() {
    const out = el('textarea', { class: 'mono', readonly: true, rows: 6, 'aria-label': 'Eksporteret JSON', spellcheck: 'false' });
    const outBox = el('div', { class: 'xfer', hidden: true }, out);
    const outMsg = el('div', { class: 'msg', role: 'status' });
    const outBtns = el('div', { class: 'sh-actions left' });
    const exportBtn = el('button', { type: 'button', class: 'btn' }, 'Eksportér');
    exportBtn.addEventListener('click', () => {
      const data = toExport(store.snapshot(), new Date());
      const text = JSON.stringify(data, null, 2);
      out.value = text;
      outBox.hidden = false;
      say(outMsg, `${countSessions(data.weeks)} pas i ${Object.keys(data.weeks).length} uger.`);
      outBtns.replaceChildren();
      const copy = el('button', { type: 'button', class: 'btn' }, 'Kopiér');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(text); say(outMsg, 'Kopieret.'); return; } catch { /* prøv næste vej */ }
        out.focus(); out.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* ligegyldigt */ }
        say(outMsg, ok ? 'Kopieret.' : 'Kunne ikke kopiere automatisk. Markér teksten og kopiér den selv.', !ok);
      });
      outBtns.append(copy);
      if (isSite) { // sandboxen i Artifact kan blokere downloads
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        outBtns.append(el('a', { class: 'btn', href: blobUrl, download: `ironman-2027-fremdrift-${data.exportedAt.slice(0, 10)}.json` }, 'Download'));
      }
    });

    const inp = el('textarea', { class: 'mono', rows: 4, placeholder: 'Indsæt JSON her, eller vælg en fil', 'aria-label': 'JSON der skal importeres', spellcheck: 'false' });
    const file = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Vælg JSON-fil' });
    const inMsg = el('div', { class: 'msg', role: 'status' });
    const imp = el('button', { type: 'button', class: 'btn' }, 'Importér');
    imp.addEventListener('click', async () => {
      imp.disabled = true; say(inMsg, '');
      try {
        let text = inp.value.trim();
        if (!text && file.files && file.files[0]) {
          if (file.files[0].size > MAX_IMPORT_BYTES) throw new RangeError('Filen er for stor.');
          text = (await file.files[0].text()).trim();
        }
        if (!text) throw new RangeError('Indsæt JSON eller vælg en fil først.');
        const parsed = parseAny(text);
        if (!countSessions(parsed)) throw new RangeError('Filen indeholder ingen pas.');
        const { changed } = await store.importProgress(parsed);
        say(inMsg, changed ? `Importerede ${changed} pas.` : 'Intet nyt: alt var allerede med.');
        inp.value = ''; file.value = '';
      } catch (e) {
        say(inMsg, e instanceof SyntaxError ? 'Det er ikke gyldig JSON.' : e && e.message ? e.message : 'Kunne ikke importere.', true);
      } finally { imp.disabled = false; }
    });
    return el('section', null,
      el('h4', null, 'Eksportér og importér'),
      el('p', { class: 'hint' }, 'Flyt din log mellem Artifact og appen. Import fletter ind: nyere ændringer vinder, og intet slettes.'),
      el('div', { class: 'sh-actions left' }, exportBtn), outBox, outBtns, outMsg,
      el('label', { class: 'field' }, 'Importér', inp), file,
      el('div', { class: 'sh-actions left' }, imp), inMsg);
  }

  // Vægtfeltet følger lageret (forudfyldt ved tegning, og igen via syncWeight). Et felt man er i gang med at skrive i røres ikke.
  function syncWeight() {
    if (!refs.weight || (document.activeElement === refs.weight && refs.weight.value !== '')) return;
    let ls = null;
    try { ls = localStorage; } catch { /* blokeret: så er vægten ukendt */ }
    const current = readWeight(ls);
    refs.weight.value = current === null ? '' : String(current).replace('.', ',');
  }

  // Din vægt (kg): kun lokalt. Tom tekst fjerner den. Intet her rører Store'en.
  function weightSection() {
    let ls = null;
    try { ls = localStorage; } catch { /* blokeret: saveWeight melder det */ }
    const input = el('input', { type: 'text', id: 'setWeight', inputmode: 'decimal', autocomplete: 'off', maxlength: '6', placeholder: 'fx 70' });
    refs.weight = input;
    syncWeight();
    const msg = el('div', { class: 'msg', role: 'status' });
    const apply = () => {
      const r = saveWeight(ls, input.value);
      if (!r.ok) { say(msg, r.error, true); return; }
      say(msg, r.kg === null ? 'Vægten er fjernet fra denne enhed.' : 'Gemt på denne enhed.');
      if (onWeight) onWeight(r.kg);
    };
    const save = el('button', { type: 'button', class: 'btn' }, 'Gem vægt');
    save.addEventListener('click', apply);
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); apply(); } });
    return el('section', { id: 'setWeightSection' },
      el('h4', null, 'Din vægt'),
      el('p', { class: 'hint' }, `Bruges kun til at regne kost ud i gram og kcal. Vægten gemmes kun på denne enhed og sendes aldrig til GitHub, til kalenderen eller andre steder. Tilladt: ${WEIGHT_MIN} til ${WEIGHT_MAX} kg. Tomt felt fjerner den.`),
      el('label', { class: 'field' }, 'Din vægt (kg)', input),
      el('div', { class: 'sh-actions left' }, save), msg);
  }

  function render() {
    refs = {};
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    const s = store.status;
    refs.status = el('p', { class: 'set-status', 'aria-live': 'polite' });
    refs.detail = el('p', { class: 'hint bad' });
    const close = el('button', { type: 'button', class: 'x', 'aria-label': 'Luk' }, '×');
    close.addEventListener('click', () => dlg.close());
    let body;
    authShown = s.state === 'auth';
    if (store.kind === 'gist') body = [authShown ? connectSection({ reconnect: (store.config || {}).gistId }) : null, connectedSection()]; // afvist token: et felt til et nyt, uden at afbryde
    else if (store.kind === 'local' && gist && isSite) body = connectSection();
    else if (store.kind === 'artifact') body = el('section', null, el('h4', null, 'Delt lager'), el('p', null, 'Dine pas gemmes af Claude-siden og følger din konto. Vil du i stedet bruge den installerede app med GitHub-synk, så eksportér her og importér i appen.'));
    else body = el('section', null, el('h4', null, 'Gemmes kun på denne enhed'), el('p', null, 'Her er der ingen synkronisering. Eksportér, hvis du vil tage din log med.'));
    // I en fane har siden selv overskrift og versionslinje, så dialogens topbjælke og version udelades.
    dlg.replaceChildren(el('div', { class: 'sh set' },
      !inline && el('div', { class: 'sh-top' }, el('div', null, el('div', { class: 'sh-sport' }, 'Indstillinger'), el('h3', { id: 'setTitle' }, 'Synkronisering')), close),
      refs.status, refs.detail, body, weightSection(), transferSection(),
      !inline && el('p', { class: 'ver' }, `Version ${version || ''}`)));
    paintStatus(s);
  }

  // focusWeight: "Angiv vægt"-linkene. Dialogen tegnes forfra, og markøren står i vægtfeltet (rullet frem), så man kan skrive med det samme.
  const open = ({ focusWeight = false } = {}) => {
    if (inline) {
      if (onReveal) onReveal({ focusWeight }); // viser containeren (fanen Mere); først derefter kan feltet få fokus
      syncWeight();
    } else {
      render();
      if (!dlg.open) dlg.showModal();
    }
    if (focusWeight && refs.weight) { refs.weight.scrollIntoView({ block: 'center' }); refs.weight.focus(); }
  };
  const onOpen = () => open();
  const onBackdrop = ev => { if (ev.target === dlg) dlg.close(); };
  const onClose = () => { if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } };
  for (const b of openers) b.addEventListener('click', onOpen);
  if (!inline) { dlg.addEventListener('click', onBackdrop); dlg.addEventListener('close', onClose); }
  // Skifter status ind i eller ud af 'auth' mens dialogen er åben, tegnes den om, så feltet til et nyt token dukker op.
  const onStatus = s => { if (!inline && !dlg.open) return; if ((s.state === 'auth') !== authShown) render(); else paintStatus(s); };
  let offStatus = store.onStatus(onStatus);
  if (inline) render();

  return {
    open,
    close: () => { if (!inline) dlg.close(); },
    syncWeight,
    setStore(next) {
      if (!next || next === store) return;
      offStatus();
      store = next;
      offStatus = store.onStatus(onStatus);
      if (inline || dlg.open) render();
    },
    dispose() {
      offStatus();
      for (const b of openers) b.removeEventListener('click', onOpen);
      if (inline) { onClose(); dlg.replaceChildren(); return; }
      dlg.removeEventListener('click', onBackdrop);
      dlg.removeEventListener('close', onClose);
      onClose();
      dlg.remove();
    },
  };
}
