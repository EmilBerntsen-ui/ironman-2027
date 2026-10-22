// owned by 2a
// PWA-laget (kun site): service worker-registrering, opdateringstoast og iOS-installationstip. Kontrakt: docs/architecture.md §6.3.
// Ingen eksporter: filen bliver en selvkørende IIFE sidst i site-bundlen. Alt DOM bygges med textContent (CSP: ingen inline script/handlers).
const UPDATE_CHECK_MS = 5 * 60 * 1000; // iOS-appen genoptages uden navigation, så vi tjekker ved synlighed, højst hvert 5. minut
const HINT_KEY = 'im2027-install-hint';

const sw = navigator.serviceWorker; // undefined uden sikker kontekst (http uden for localhost)
let reg = null;
let waiting = false;      // en ny version står klar og afventer
let dismissed = false;    // toasten er lukket i denne sidevisning
let userAsked = false;    // brugeren har trykket Opdatér; kun da må siden genindlæse sig selv
let reloading = false;

function layer() {
  let el = document.getElementById('pwaLayer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pwaLayer';
    el.className = 'pwa-layer';
    document.body.append(el);
  }
  return el;
}
function button(label, className, onClick, aria) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}
function note(id, text, ...controls) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'pwa-note';
  el.setAttribute('role', 'status');
  const msg = document.createElement('span');
  msg.textContent = text;
  el.append(msg, ...controls);
  layer().append(el);
  return el;
}
const closeNote = id => { const el = document.getElementById(id); if (el) el.remove(); };
const modalOpen = () => !!document.querySelector('dialog[open]');

// ---- Opdateringstoast: aldrig automatisk genindlæsning, og ikke mens et ark/en dialog er åben ----
function offerUpdate() {
  if (!waiting || dismissed || modalOpen() || document.getElementById('pwaUpdate')) return;
  note('pwaUpdate', 'Ny version af planen er klar',
    button('Opdatér', 'btn primary', applyUpdate),
    button('×', 'pwa-x', () => { dismissed = true; closeNote('pwaUpdate'); }, 'Senere'));
}
function applyUpdate() {
  userAsked = true;
  if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload(); // intet ventende: en anden fane nåede det, og den nye version styrer allerede
}
function check() { // kaldes ved registrering, updatefound og efter reg.update()
  if (reg && reg.waiting && sw.controller) { waiting = true; offerUpdate(); }
}

function register() {
  sw.register('sw.js', { scope: './', updateViaCache: 'none' }).then(r => {
    reg = r;
    check();
    r.addEventListener('updatefound', () => {
      const nw = r.installing;
      if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed') check(); });
    });
  }).catch(err => console.warn('Service worker kunne ikke registreres', err));
}

if (sw) {
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  sw.addEventListener('controllerchange', () => {
    if (!userAsked || reloading) return; // første installation (clients.claim) og andre fanes opdateringer genindlæser ikke
    reloading = true;
    location.reload();
  });

  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !reg) return;
    const t = Date.now();
    if (t - lastCheck < UPDATE_CHECK_MS) return;
    lastCheck = t;
    reg.update().then(check, () => {}); // offline: stilfærdigt, vi prøver igen næste gang
  });

  // 'close' bobler ikke, men fanges i capture-fasen: når et ark lukkes, kan toasten, der ventede, vises.
  document.addEventListener('close', () => setTimeout(offerUpdate, 0), true);
}

// Bed om vedvarende lager (iOS/Chrome kan ellers rydde det). Fejl er uden betydning.
try { Promise.resolve(navigator.storage && navigator.storage.persist && navigator.storage.persist()).catch(() => {}); } catch (e) {}

// ---- iOS: ingen beforeinstallprompt, så et engangstip om Del → Føj til hjemmeskærm ----
function iosHint() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS udgiver sig for Mac
  const safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!ios || !safari || standalone) return;
  try { if (localStorage.getItem(HINT_KEY)) return; } catch (e) { return; } // uden lager kunne tippet ikke afvises for altid
  note('pwaHint', 'Tryk Del → Føj til hjemmeskærm',
    button('×', 'pwa-x', () => {
      try { localStorage.setItem(HINT_KEY, '1'); } catch (e) {}
      closeNote('pwaHint');
    }, 'Luk'));
}
iosHint();
