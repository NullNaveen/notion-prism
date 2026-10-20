const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const P = require('../extension/core.js');
const source = fs.readFileSync(require.resolve('../extension/storage.js'), 'utf8');

function sharedStorage() {
  const data = {},
    listeners = [];
  async function set(values) {
    const changes = {};
    for (const [key, newValue] of Object.entries(values)) {
      if (JSON.stringify(data[key]) !== JSON.stringify(newValue))
        changes[key] = { oldValue: data[key], newValue };
      data[key] = structuredClone(newValue);
    }
    await Promise.all(listeners.map((fn) => fn(changes, 'local')));
  }
  function view(id) {
    const context = {
      Prism: P,
      crypto: { randomUUID: () => id },
      chrome: {
        runtime: { id: 'prism' },
        storage: {
          local: {
            get: async (keys) =>
              Object.fromEntries(keys.map((key) => [key, structuredClone(data[key])])),
            set
          },
          onChanged: { addListener: (fn) => listeners.push(fn) }
        }
      }
    };
    vm.runInNewContext(source, context);
    return context.PrismStorage;
  }
  return { view, set, data };
}

test('storage distinguishes own saves from changes made in another extension view', async () => {
  const host = sharedStorage(),
    studio = host.view('studio'),
    popup = host.view('popup');
  const a = [],
    b = [];
  studio.subscribe((data, event) => a.push({ theme: data.settings.themeId, own: event.own }));
  popup.subscribe((data, event) => b.push({ theme: data.settings.themeId, own: event.own }));
  await studio.saveSettings({ ...P.DEFAULTS, themeId: 'nebula' });
  assert.deepEqual(a.at(-1), { theme: 'nebula', own: true });
  assert.deepEqual(b.at(-1), { theme: 'nebula', own: false });
  await popup.saveSettings({ ...P.DEFAULTS, themeId: 'tide' });
  assert.deepEqual(a.at(-1), { theme: 'tide', own: false });
  assert.deepEqual(b.at(-1), { theme: 'tide', own: true });
  assert.deepEqual(Object.keys(await studio.read()).sort(), ['image', 'settings']);
});

test('legacy views without an origin marker remain external even after an own save', async () => {
  const host = sharedStorage(),
    studio = host.view('studio'),
    seen = [];
  studio.subscribe((data, event) => seen.push({ theme: data.settings.themeId, own: event.own }));
  await studio.saveSettings({ ...P.DEFAULTS, themeId: 'nebula' });
  await host.set({ [P.SETTINGS_KEY]: { ...P.DEFAULTS, themeId: 'sakura' } });
  assert.deepEqual(seen.at(-1), { theme: 'sakura', own: false });
  const before = host.data.prismWriteOrigin.sequence;
  await studio.saveSettings({ ...P.DEFAULTS, themeId: 'glacier' });
  assert.equal(host.data.prismWriteOrigin.sequence, before + 1);
  assert.deepEqual(seen.at(-1), { theme: 'glacier', own: true });
});

test('external settings intent is delivered immediately even while a storage read is delayed', async () => {
  const reads = [],
    listeners = [],
    seen = [];
  const context = {
    Prism: P,
    crypto: { randomUUID: () => 'studio' },
    chrome: {
      runtime: { id: 'prism' },
      storage: {
        local: { get: () => new Promise((resolve) => reads.push(resolve)), set: async () => {} },
        onChanged: { addListener: (fn) => listeners.push(fn) }
      }
    }
  };
  vm.runInNewContext(source, context);
  context.PrismStorage.subscribe((data, event) =>
    seen.push({ theme: data.settings.themeId, own: event.own })
  );
  const reading = context.PrismStorage.read();
  listeners[0](
    {
      prismSettings: { newValue: { themeId: 'nebula' } },
      prismWriteOrigin: { newValue: { id: 'popup', sequence: 1 } }
    },
    'local'
  );
  assert.deepEqual(seen, [{ theme: 'nebula', own: false }]);
  listeners[0](
    {
      prismSettings: { newValue: { themeId: 'aurora' } },
      prismWriteOrigin: { newValue: { id: 'studio', sequence: 1 } }
    },
    'local'
  );
  assert.deepEqual(seen.at(-1), { theme: 'aurora', own: true });
  assert.equal(reads.length, 1, 'notifications must not require another asynchronous read');
  reads[0]({ prismSettings: { themeId: 'aurora' } });
  await reading;
});

test('image-only changes do not reset settings and removals are explicit', async () => {
  const host = sharedStorage(),
    studio = host.view('studio'),
    seen = [];
  studio.subscribe((data) => seen.push(data));
  await host.set({ [P.IMAGE_KEY]: { name: 'sample' } });
  assert.deepEqual(Object.keys(seen.at(-1)), ['image']);
  assert.equal(seen.at(-1).image.name, 'sample');
  await host.set({ [P.IMAGE_KEY]: null });
  assert.equal(seen.at(-1).image, null);
});
