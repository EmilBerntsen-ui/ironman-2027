// src/settings.js (Synkronisering-dialogen) mod en falsk DOM (test/dom-harness.mjs) og falske Stores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSettings } from '../src/settings.js';
import { fakeDocument, fakeWindow, memoryStorage } from './dom-harness.mjs';

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
