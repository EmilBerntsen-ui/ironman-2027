// src/settings.js (Synkronisering-dialogen) mod en falsk DOM (test/dom-harness.mjs) og falske Stores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSettings } from '../src/settings.js';
import { WEIGHT_ERROR, WEIGHT_KEY } from '../src/nutrition.js';
import { FORMAT, GIST_DESCRIPTION, META_FILE } from '../src/progress.js';
import { GistStore } from '../src/store/gist.js';
import { fakeDocument, fakeWindow, memoryStorage } from './dom-harness.mjs';
import { TEST_LOGIN, TEST_TOKEN, createClock, createFakeGitHub, settle } from './fake-gist.mjs';

const GIST = '0123456789abcdef0123456789abcdef';
const NEW_TOKEN = 'github_pat_NYTTOKEN0000000000000000';

// settings.js bruger globalerne document, window, location, confirm og localStorage. Sættes og gendannes pr. test.
async function withBrowser({ framed = false, confirmAnswer = true } = {}, fn) {
  const doc = fakeDocument();
  const win = fakeWindow(doc);
  if (framed) win.top = {};
  const storage = memoryStorage({ 'im2027-progress-v2': '{"v":2,"weeks":{}}' });
  const env = { reloads: 0, confirms: [], doc, win, storage };
  const globals = {
    document: doc, window: win, localStorage: storage,
    location: { reload() { env.reloads++; } },
    confirm: msg => { env.confirms.push(msg); return confirmAnswer; },
  };
  const saved = Object.fromEntries(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, value] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  try { return await fn(env); } finally {
    for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  }
}

function fakeStore(kind, status = {}, extra = {}) {
  const subs = new Set();
  const store = {
    kind, subs,
    status: { kind, state: 'ready', pending: 0, lastSync: null, label: kind === 'gist' ? 'Synkroniseret' : 'Gemmes', detail: '', ...status },
    config: kind === 'gist' ? { gistId: GIST, login: 'testuser', tokenHint: 'github_pat_…abcd' } : undefined,
    onStatus(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    snapshot: () => ({}), syncNow: async () => {}, importProgress: async () => ({ changed: 0 }),
    emit(next) { store.status = { ...store.status, ...next }; for (const cb of [...subs]) cb(store.status); },
    ...extra,
  };
  return store;
}
function fakeGistClass() {
  const calls = { connect: [], disconnect: [] };
  return {
    calls, connectError: null,
    async connect(token, deps) { calls.connect.push({ token, deps }); if (this.connectError) throw this.connectError; return { gistId: GIST }; },
    disconnect(storage, opts) { calls.disconnect.push(opts); },
  };
}
function open(env, store, gist = fakeGistClass(), target = 'site') {
  const button = env.doc.createElement('button');
  const ui = mountSettings({ store, target, version: 'test', openButton: button, gist });
  button.click();
  return { ui, button, gist, dlg: env.doc.body.find(e => e.tag === 'dialog') };
}
const input = (dlg, id) => dlg.byId(id);

// ---- afvist token: nyt token uden at afbryde forbindelsen ----

test('status auth: dialogen viser et felt til et nyt token, som bruger det eksisterende gist-id (ingen afbrydelse, ingen gist-id-felt)', async () => {
  await withBrowser({}, async env => {
    const store = fakeStore('gist', { state: 'auth', label: 'Forbind GitHub igen', detail: 'Tokenet blev afvist', pending: 2 });
    const { dlg, gist } = open(env, store);
    const token = input(dlg, 'setToken');
    assert.ok(token, 'token-feltet er der, selv om forbindelsen ikke er afbrudt');
    assert.equal(token.attrs.type, 'password');
    assert.equal(input(dlg, 'setGistId'), null, 'gist-id kendes allerede');
    assert.match(dlg.textContent, /Nyt token/);
    assert.match(dlg.textContent, /Tokenet blev afvist/);
    assert.ok(dlg.byId('setWipe'), 'forbindelsens egne handlinger er der stadig');
    token.value = `  ${NEW_TOKEN}  `;
    dlg.buttons('Gem nyt token')[0].click();
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(gist.calls.connect, [{ token: `  ${NEW_TOKEN}  `, deps: { gistId: GIST } }]);
    assert.deepEqual(gist.calls.disconnect, [], 'forbindelsen afbrydes ikke');
    assert.equal(env.reloads, 1);
    assert.equal(token.value, '', 'tokenet ryddes fra feltet');
  });
});

test('nyt token der også afvises: fejlen vises, knappen kan bruges igen, og intet genindlæses', async () => {
  await withBrowser({}, async env => {
    const store = fakeStore('gist', { state: 'auth', label: 'Forbind GitHub igen' });
    const gist = fakeGistClass();
    gist.connectError = new Error('Tokenet blev afvist');
    const { dlg } = open(env, store, gist);
    input(dlg, 'setToken').value = NEW_TOKEN;
    const go = dlg.buttons('Gem nyt token')[0];
    go.click();
    await Promise.resolve(); await Promise.resolve();
    assert.match(dlg.textContent, /Tokenet blev afvist/);
    assert.equal(go.disabled, false);
    assert.equal(env.reloads, 0);
  });
});

test('uden status auth er der intet token-felt, og feltet dukker op, når status skifter til auth mens dialogen er åben (og forsvinder igen)', async () => {
  await withBrowser({}, async env => {
    const store = fakeStore('gist');
    const { dlg } = open(env, store);
    assert.equal(input(dlg, 'setToken'), null);
    store.emit({ state: 'auth', label: 'Forbind GitHub igen', detail: 'Tokenet blev afvist' });
    assert.ok(input(dlg, 'setToken'));
    store.emit({ state: 'auth', label: 'Forbind GitHub igen', pending: 3 }); // samme tilstand: tegnes ikke om (ingen tabt indtastning)
    const field = input(dlg, 'setToken');
    store.emit({ pending: 4 });
    assert.equal(input(dlg, 'setToken'), field);
    store.emit({ state: 'ready', label: 'Synkroniseret', detail: '' });
    assert.equal(input(dlg, 'setToken'), null);
  });
});

test('et token kan ikke indtastes på en indlejret side, heller ikke ved status auth', async () => {
  await withBrowser({ framed: true }, async env => {
    const { dlg } = open(env, fakeStore('gist', { state: 'auth' }));
    assert.equal(input(dlg, 'setToken'), null);
    assert.match(dlg.textContent, /indlejret side/);
  });
});

// ---- "Slet også data på denne enhed" ----

test('slet-data med ventende uger: advarslen vises ved fluebenet, og bekræftelsen siger, at de forsvinder for altid', async () => {
  await withBrowser({ confirmAnswer: false }, async env => {
    const store = fakeStore('gist', { pending: 2 });
    const { dlg, gist } = open(env, store);
    const wipe = dlg.byId('setWipe');
    const off = dlg.buttons('Afbryd forbindelse')[0];
    assert.doesNotMatch(dlg.textContent, /ikke sendt til GitHub endnu/, 'ingen advarsel før fluebenet');
    wipe.checked = true; wipe.dispatch('change');
    assert.match(dlg.textContent, /2 uger er endnu ikke sendt til GitHub\. Slettes data på denne enhed nu, mister du dem/);
    off.click();
    assert.equal(env.confirms.length, 1);
    assert.match(env.confirms[0], /2 uger er endnu ikke sendt til GitHub/);
    assert.match(env.confirms[0], /mister du dem for altid/);
    assert.doesNotMatch(env.confirms[0], /bliver liggende/, 'må ikke love at alt ligger på GitHub');
    assert.deepEqual(gist.calls.disconnect, [], 'afvist bekræftelse: intet slettes');
    assert.equal(env.reloads, 0);
    wipe.checked = false; wipe.dispatch('change');
    assert.doesNotMatch(dlg.textContent, /ikke sendt til GitHub endnu/, 'advarslen forsvinder med fluebenet');
  });
  await withBrowser({ confirmAnswer: true }, async env => {
    const { dlg, gist } = open(env, fakeStore('gist', { pending: 1 }));
    dlg.byId('setWipe').checked = true;
    dlg.buttons('Afbryd forbindelse')[0].click();
    assert.match(env.confirms[0], /^1 uge er endnu ikke sendt/);
    assert.deepEqual(gist.calls.disconnect, [{ wipeLocal: true }], 'bekræftet: slettes');
    assert.equal(env.reloads, 1);
  });
});

test('slet-data uden ventende uger: den almindelige bekræftelse; uden flueben ingen bekræftelse og ingen sletning', async () => {
  await withBrowser({}, async env => {
    const { dlg, gist } = open(env, fakeStore('gist', { pending: 0 }));
    dlg.byId('setWipe').checked = true;
    dlg.buttons('Afbryd forbindelse')[0].click();
    assert.equal(env.confirms.length, 1);
    assert.match(env.confirms[0], /Det du har gemt på GitHub bliver liggende/);
    assert.deepEqual(gist.calls.disconnect, [{ wipeLocal: true }]);
  });
  await withBrowser({}, async env => {
    const { dlg, gist } = open(env, fakeStore('gist', { pending: 5 }));
    dlg.buttons('Afbryd forbindelse')[0].click(); // uden flueben: ingen data slettes, så ingen advarsel
    assert.deepEqual(env.confirms, []);
    assert.deepEqual(gist.calls.disconnect, [{ wipeLocal: false }]);
    assert.equal(env.reloads, 1);
  });
});

test('advarslen følger antallet af ventende uger, mens dialogen er åben', async () => {
  await withBrowser({}, async env => {
    const store = fakeStore('gist', { pending: 0 });
    const { dlg } = open(env, store);
    dlg.byId('setWipe').checked = true; dlg.byId('setWipe').dispatch('change');
    assert.doesNotMatch(dlg.textContent, /ikke sendt til GitHub endnu/);
    store.emit({ pending: 3 });
    assert.match(dlg.textContent, /3 uger er endnu ikke sendt/);
    store.emit({ pending: 0 });
    assert.doesNotMatch(dlg.textContent, /ikke sendt til GitHub endnu/);
  });
});

// ---- skift af Store ----

test('setStore: dialogen følger med, når en LocalStore afløses af en anden Store (og lytter kun på den nye)', async () => {
  await withBrowser({}, async env => {
    const local = fakeStore('local', { label: 'Gemmes kun på denne enhed' });
    const { ui, dlg } = open(env, local, null, 'artifact');
    assert.match(dlg.textContent, /Gemmes kun på denne enhed/);
    assert.equal(local.subs.size, 1);
    const shared = fakeStore('artifact', { label: 'Gemmes på tværs af enheder' });
    ui.setStore(shared);
    assert.equal(local.subs.size, 0);
    assert.equal(shared.subs.size, 1);
    assert.match(dlg.textContent, /Delt lager/);
    assert.match(dlg.textContent, /Gemmes på tværs af enheder/);
    shared.emit({ label: 'Synkroniserer…', state: 'syncing' });
    assert.match(dlg.textContent, /Synkroniserer…/);
    ui.setStore(shared); // samme Store: ingen dobbelt lytter
    assert.equal(shared.subs.size, 1);
    ui.dispose();
    assert.equal(shared.subs.size, 0);
    assert.equal(env.doc.body.find(e => e.tag === 'dialog'), null);
  });
});

// ---- Flere knapper, og fokus i vægtfeltet ----

test('openButton kan være en liste (statuslinjen og Indstillinger-knappen): alle åbner samme dialog, får aria-haspopup, og dispose fjerner alle lyttere', async () => {
  await withBrowser({}, async env => {
    const status = env.doc.createElement('button'), gear = env.doc.createElement('button');
    const ui = mountSettings({ store: fakeStore('local'), target: 'site', version: 'test', openButton: [status, gear], gist: fakeGistClass() });
    for (const b of [status, gear]) assert.equal(b.getAttribute('aria-haspopup'), 'dialog');
    const dlg = env.doc.body.find(e => e.tag === 'dialog');
    for (const b of [status, gear]) {
      b.click();
      assert.equal(dlg.open, true);
      assert.equal(env.doc.body.findAll(e => e.tag === 'dialog').length, 1, 'én dialog, ikke én pr. knap');
      dlg.close();
    }
    ui.dispose();
    for (const b of [status, gear]) assert.equal((b.handlers.click ?? []).length, 0);
  });
  await withBrowser({}, async env => {
    assert.equal(mountSettings({ store: fakeStore('local'), target: 'site', openButton: [] }), null, 'uden knapper');
    assert.equal(mountSettings({ store: fakeStore('local'), target: 'site', openButton: [null] }), null);
  });
});

test('open({ focusWeight: true }) åbner dialogen med markøren i vægtfeltet; et almindeligt åbne gør ikke', async () => {
  await withBrowser({}, async env => {
    const button = env.doc.createElement('button');
    const ui = mountSettings({ store: fakeStore('local'), target: 'site', version: 'test', openButton: button, gist: fakeGistClass() });
    const dlg = env.doc.body.find(e => e.tag === 'dialog');
    ui.open({ focusWeight: true });
    assert.equal(dlg.open, true);
    assert.equal(env.doc.activeElement, dlg.byId('setWeight'));
    dlg.close();
    env.doc.activeElement = null;
    button.click();
    assert.equal(env.doc.activeElement, null, 'tryk på en åbne-knap flytter ikke fokus');
    ui.open();
    assert.equal(env.doc.activeElement, null);
  });
  for (const kind of ['artifact', 'gist']) {
    await withBrowser({}, async env => {
      const ui = mountSettings({ store: fakeStore(kind), target: kind === 'gist' ? 'site' : 'artifact', version: 'test', openButton: env.doc.createElement('button'), gist: fakeGistClass() });
      ui.open({ focusWeight: true });
      assert.equal(env.doc.activeElement, env.doc.body.find(e => e.tag === 'dialog').byId('setWeight'), kind);
    });
  }
});

// ---- Din vægt (kun lokalt) ----

function openWeight(env, store, extra = {}) {
  const button = env.doc.createElement('button');
  const calls = [];
  const ui = mountSettings({ store, target: 'site', version: 'test', openButton: button, gist: fakeGistClass(), onWeight: kg => calls.push(kg), ...extra });
  button.click();
  return { ui, calls, dlg: env.doc.body.find(e => e.tag === 'dialog') };
}
const msgOf = dlg => dlg.findAll(e => e.tag === 'div' && e.className.split(' ').includes('msg')).map(e => e.textContent).filter(Boolean);
const badMsg = dlg => dlg.find(e => e.className.split(' ').includes('msg') && e.className.split(' ').includes('bad'));

test('vægtfeltet findes i alle indstillingsdialoger (lokal, Artifact og GitHub), forklarer at vægten kun bliver på enheden, og er forudfyldt', async () => {
  for (const kind of ['local', 'artifact', 'gist']) {
    await withBrowser({}, async env => {
      env.storage.setItem(WEIGHT_KEY, '72.5');
      const { dlg } = openWeight(env, fakeStore(kind));
      const field = dlg.byId('setWeight');
      assert.ok(field, kind);
      assert.equal(field.value, '72,5', 'vist med dansk komma');
      assert.match(dlg.textContent, /Din vægt \(kg\)/);
      assert.match(dlg.textContent, /gemmes kun på denne enhed og sendes aldrig til GitHub, til kalenderen eller andre steder/);
      assert.match(dlg.textContent, /35 til 200 kg/);
    });
  }
  await withBrowser({}, async env => assert.equal(openWeight(env, fakeStore('local')).dlg.byId('setWeight').value, '', 'uden vægt er feltet tomt'));
});

test('vægt: gem med knap og Enter lægger den kun i localStorage under sin egen nøgle, melder tilbage, og tomt felt fjerner den', async () => {
  await withBrowser({}, async env => {
    const { dlg, calls } = openWeight(env, fakeStore('gist'));
    const field = dlg.byId('setWeight');
    field.value = ' 70,5 ';
    dlg.buttons('Gem vægt')[0].click();
    assert.equal(env.storage.getItem(WEIGHT_KEY), '70.5');
    assert.deepEqual(calls, [70.5]);
    assert.deepEqual(msgOf(dlg), ['Gemt på denne enhed.']);
    field.value = '72';
    let prevented = 0;
    field.dispatch('keydown', { key: 'Enter', preventDefault() { prevented++; } });
    assert.equal(env.storage.getItem(WEIGHT_KEY), '72');
    assert.equal(prevented, 1);
    assert.deepEqual(calls, [70.5, 72]);
    field.dispatch('keydown', { key: 'a' });
    assert.deepEqual(calls, [70.5, 72], 'andre taster gemmer ikke');
    field.value = '';
    dlg.buttons('Gem vægt')[0].click();
    assert.equal(env.storage.getItem(WEIGHT_KEY), null);
    assert.deepEqual(calls, [70.5, 72, null]);
    assert.deepEqual(msgOf(dlg), ['Vægten er fjernet fra denne enhed.']);
    assert.deepEqual(env.storage.keys().sort(), ['im2027-progress-v2'], 'kun fremdriften er tilbage');
  });
});

test('vægt: uden for 35–200 kg og alt der ikke er et tal afvises med en forklaring og ændrer intet', async () => {
  await withBrowser({}, async env => {
    env.storage.setItem(WEIGHT_KEY, '70');
    const { dlg, calls } = openWeight(env, fakeStore('local'));
    for (const bad of ['34,9', '200,1', '0', 'tung', '70 kg og lidt']) {
      dlg.byId('setWeight').value = bad;
      dlg.buttons('Gem vægt')[0].click();
      assert.equal(badMsg(dlg)?.textContent, WEIGHT_ERROR, bad);
      assert.equal(env.storage.getItem(WEIGHT_KEY), '70', `${bad}: uændret`);
    }
    assert.deepEqual(calls, []);
    dlg.byId('setWeight').value = '35';
    dlg.buttons('Gem vægt')[0].click();
    assert.equal(env.storage.getItem(WEIGHT_KEY), '35');
    assert.equal(badMsg(dlg), null, 'fejlen forsvinder, når en gyldig vægt gemmes');
    assert.deepEqual(calls, [35]);
  });
});

test('vægt: blokeret lokal lagring giver en fejl og ingen tilbagemelding', async () => {
  await withBrowser({}, async env => {
    env.storage.setItem = () => { throw new Error('blokeret'); };
    const { dlg, calls } = openWeight(env, fakeStore('local'));
    dlg.byId('setWeight').value = '70';
    dlg.buttons('Gem vægt')[0].click();
    assert.match(badMsg(dlg)?.textContent ?? '', /lokal lagring/);
    assert.deepEqual(calls, []);
  });
});

test('vægt: den forlader aldrig enheden. Ingen gist-fil, ingen anmodning til GitHub, intet i eksporten og intet i Store-data indeholder den', async () => {
  const GIST = '0123456789abcdef0123456789abcdef';
  await withBrowser({}, async env => {
    const clock = createClock('2026-11-24T10:00:00.000Z');
    const fake = createFakeGitHub({ now: clock.now });
    fake.addGist({ id: GIST, description: GIST_DESCRIPTION, files: { [META_FILE]: { format: FORMAT, v: 2, kind: 'meta', start: '2026-10-26', createdAt: '2026-11-01T00:00:00.000Z' } } });
    const store = new GistStore({ token: TEST_TOKEN, gistId: GIST, login: TEST_LOGIN, connectedAt: '2026-11-20T00:00:00.000Z' }, {
      fetch: fake.fetch, storage: env.storage, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, random: () => 0.5, poll: false, win: null, locks: null,
    });
    await store.load();
    const { dlg } = openWeight(env, store);
    dlg.byId('setWeight').value = '71,3';
    dlg.buttons('Gem vægt')[0].click();
    assert.equal(env.storage.getItem(WEIGHT_KEY), '71.3');

    store.save('u05', '1-0', { done: true, min: 42, rpe: 6, note: 'Fin tur', sig: 'run:Løb' });
    store.save('u06', '2-0', { done: true, sig: 'bike:Cykel' });
    await clock.advance(1500);
    await store.syncNow();
    await settle();
    assert.ok(fake.count({ method: 'PATCH' }) >= 1, 'der blev skrevet til gisten');

    const wire = JSON.stringify(fake.requests.map(r => ({ url: r.url, body: r.body })));  // alt der er sendt til GitHub
    const files = JSON.stringify(fake.gist(GIST));                                        // alt der ligger i gisten
    const snapshot = JSON.stringify(store.snapshot());
    dlg.buttons('Eksportér')[0].click();
    const exported = dlg.find(e => e.tag === 'textarea' && e.attrs['aria-label'] === 'Eksporteret JSON').value;
    assert.ok(exported.includes('"u05"'), 'eksporten har fremdriften');
    for (const [name, text] of Object.entries({ wire, files, snapshot, exported })) {
      assert.doesNotMatch(text, /71[.,]3/, `${name}: vægten`);
      assert.doesNotMatch(text, /im2027-weight|weight|vægt/i, `${name}: nøglen`);
    }
    assert.deepEqual(fake.fileNames(GIST), ['_ironman-2027.json', 'u05.json', 'u06.json'], 'ingen ekstra gist-fil til vægten');
    store.dispose();
  });
});
