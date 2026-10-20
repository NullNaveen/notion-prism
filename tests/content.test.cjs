const test = require('node:test');
const assert = require('node:assert/strict');
let Adapter;
try {
  Adapter = require('../extension/content.js');
} catch {
  Adapter = {};
}

// The external Chrome storage and DOM host are small boundary doubles. Color
// classification and the controller are production code; browser QA uses notion.html.
function environment(initial = {}, delayedRead = false) {
  const listeners = new Set();
  const frames = new Map();
  let frameId = 0;
  let resolveRead;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.attrs = new Map();
      this.children = [];
      this.parentElement = null;
      this.textContent = '';
      this.style = { getPropertyValue: () => '' };
    }
    get id() {
      return this.getAttribute('id') || '';
    }
    set id(value) {
      this.setAttribute('id', value);
    }
    get isConnected() {
      return this === document.documentElement || !!this.parentElement?.isConnected;
    }
    setAttribute(key, value) {
      this.attrs.set(key, String(value));
    }
    getAttribute(key) {
      return this.attrs.get(key) ?? null;
    }
    hasAttribute(key) {
      return this.attrs.has(key);
    }
    removeAttribute(key) {
      this.attrs.delete(key);
    }
    appendChild(node) {
      node.remove();
      this.children.push(node);
      node.parentElement = this;
      return node;
    }
    prepend(node) {
      node.remove();
      this.children.unshift(node);
      node.parentElement = this;
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter((x) => x !== this);
      this.parentElement = null;
    }
    contains(node) {
      return node === this || this.children.some((child) => child.contains(node));
    }
    matches(selector) {
      return selector.includes('[data-prism-owned]') && this.hasAttribute('data-prism-owned');
    }
    closest(selector) {
      return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;
    }
    querySelectorAll() {
      return this.children
        .flatMap((child) => [child, ...child.querySelectorAll()])
        .filter((child) => child.hasAttribute('style') || child.hasAttribute('data-prism-style'));
    }
  }
  const document = { createElement: (tag) => new Element(tag), readyState: 'complete' };
  document.documentElement = new Element('html');
  document.head = document.documentElement.appendChild(new Element('head'));
  document.body = document.documentElement.appendChild(new Element('body'));
  document.getElementById = (id) => {
    const visit = (node) => (node.id === id ? node : node.children.map(visit).find(Boolean));
    return visit(document.documentElement) || null;
  };
  const observers = [];
  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      observers.push(this);
    }
    observe() {
      this.connected = true;
    }
    disconnect() {
      this.connected = false;
    }
    takeRecords() {
      return [];
    }
  }
  const Prism = {
    SETTINGS_KEY: 'prismSettings',
    IMAGE_KEY: 'prismImage',
    normalizeSettings: (input) => ({ enabled: true, themeId: 'aurora', ...(input || {}) }),
    getTheme: (id) => ({ mood: id === 'paper' ? 'light' : 'dark' }),
    resolveTheme: (settings) => ({ mood: settings.themeId === 'paper' ? 'light' : 'dark' }),
    buildVariables: (settings, image) => ({
      '--prism-text': settings.themeId === 'paper' ? '#222222' : '#eeeeee',
      '--prism-wallpaper': image?.dataUrl
        ? 'url("data:image/png;base64,AAAA")'
        : 'linear-gradient(#111111, #222222)'
    })
  };
  const chrome = {
    storage: {
      local: {
        get: (keys) => {
          assert.deepEqual(keys, ['prismSettings', 'prismImage']);
          return delayedRead
            ? new Promise((resolve) => {
                resolveRead = resolve;
              })
            : Promise.resolve(initial);
        }
      },
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener)
      }
    }
  };
  return {
    document,
    Prism,
    chrome,
    MutationObserver: Observer,
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    flush: () => {
      for (let rounds = 0; frames.size && rounds < 100; rounds++) {
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback());
      }
      assert.equal(frames.size, 0, 'mutation work must settle');
    },
    change: (changes, area = 'local') => listeners.forEach((listener) => listener(changes, area)),
    mutate: (records) =>
      observers
        .filter((observer) => observer.connected)
        .forEach((observer) => observer.callback(records)),
    resolveRead: (value) => resolveRead(value),
    get listenerCount() {
      return listeners.size;
    },
    get pendingFrames() {
      return frames.size;
    },
    get observing() {
      return observers.some((observer) => observer.connected);
    }
  };
}

function style(properties) {
  return { getPropertyValue: (property) => properties[property] || '' };
}

test('neutral interface colors adapt while intentional document hues remain intact', () => {
  assert.equal(typeof Adapter.inlineTokens, 'function');
  assert.deepEqual(
    Adapter.inlineTokens(
      style({
        color: 'rgb(55, 53, 47)',
        'background-color': 'white',
        'border-top-color': 'rgba(0, 0, 0, 0.1)'
      }),
      {}
    ),
    ['text', 'surface', 'border-top']
  );
  assert.deepEqual(
    Adapter.inlineTokens(
      style({ color: '#d44c47', 'background-color': '#fdebec', 'border-top-color': '#e255a1' }),
      {}
    ),
    []
  );
  assert.deepEqual(
    Adapter.inlineTokens(
      style({ color: 'var(--c-redTexPri)', 'background-color': 'var(--c-yelBacPri)' }),
      {}
    ),
    []
  );
});

test('authored gray text, highlight backgrounds, gradients and code are preserved', () => {
  assert.equal(typeof Adapter.inlineTokens, 'function');
  assert.deepEqual(
    Adapter.inlineTokens(
      style({ color: 'rgb(120, 119, 116)', 'background-color': 'rgb(241, 241, 239)' }),
      { document: true }
    ),
    []
  );
  assert.deepEqual(Adapter.inlineTokens(style({ color: '#37352f' }), { document: true }), ['text']);
  assert.deepEqual(
    Adapter.inlineTokens(
      style({ 'background-color': '#fff', 'background-image': 'linear-gradient(red, blue)' }),
      {}
    ),
    []
  );
  assert.deepEqual(
    Adapter.inlineTokens(style({ color: '#777', 'background-color': '#fff' }), { preserve: true }),
    []
  );
});

test('sidebar, popup and translucent interactive surfaces use coordinated roles', () => {
  assert.equal(typeof Adapter.inlineTokens, 'function');
  assert.deepEqual(
    Adapter.inlineTokens(style({ 'background-color': '#f7f7f5' }), { sidebar: true }),
    ['panel']
  );
  assert.deepEqual(Adapter.inlineTokens(style({ 'background-color': '#fff' }), { overlay: true }), [
    'surface-solid'
  ]);
  assert.deepEqual(
    Adapter.inlineTokens(
      style({ 'background-color': 'rgba(55,53,47,0.08)', color: 'rgba(55,53,47,0.65)' }),
      {}
    ),
    ['muted', 'hover']
  );
  assert.deepEqual(
    Adapter.inlineTokens(style({ 'background-color': 'transparent', color: 'currentColor' }), {}),
    []
  );
});

test('default foreground on an authored highlight stays paired with that highlight', () => {
  assert.deepEqual(
    Adapter.inlineTokens(
      style({ color: 'rgb(55, 53, 47)', 'background-color': 'rgb(241, 241, 239)' }),
      { document: true }
    ),
    []
  );
  assert.deepEqual(
    Adapter.inlineTokens(style({ color: '#37352f', 'background-color': '#fff2a6' }), {
      document: true
    }),
    []
  );
});

test('authored highlight surfaces get readable inherited ink without recoloring their background', () => {
  const token = style({ 'background-color': 'var(--c-purBacPri)' });
  assert.equal(
    Adapter.authoredInk(token, { document: true, resolvedBackground: 'rgb(243,238,247)' }),
    'authored-light'
  );
  assert.equal(
    Adapter.authoredInk(token, { document: true, resolvedBackground: 'rgb(49,36,60)' }),
    'authored-dark'
  );
  assert.equal(
    Adapter.authoredInk(style({ 'background-color': '#fff2a6' }), { document: true }),
    'authored-light'
  );
  assert.equal(Adapter.authoredInk(style({ 'background-color': 'white' }), { document: true }), '');
  assert.equal(
    Adapter.authoredInk(token, { document: false, resolvedBackground: 'rgb(243,238,247)' }),
    ''
  );
  assert.equal(
    Adapter.authoredInk(token, {
      document: true,
      art: true,
      resolvedBackground: 'rgb(243,238,247)'
    }),
    ''
  );
});

test('Notion blue action controls use the selected accent with a paired foreground', () => {
  assert.deepEqual(
    Adapter.inlineTokens(
      style({
        color: 'white',
        'background-color': 'rgb(35, 131, 226)',
        'background-image': 'linear-gradient(transparent, rgba(0,0,0,.05))'
      }),
      { control: true, accentControl: true }
    ),
    ['accent-ink', 'accent-bg']
  );
  assert.deepEqual(
    Adapter.inlineTokens(style({ color: 'white', 'background-color': 'rgb(35, 131, 226)' }), {
      document: true
    }),
    []
  );
});

test('document action buttons are not mistaken for authored highlights', () => {
  const action = style({ color: 'white', 'background-color': 'rgb(35,131,226)' });
  assert.equal(Adapter.authoredInk(action, { document: true, control: true }), '');
  assert.equal(Adapter.authoredInk(action, { document: true }), 'authored-light');
  assert.deepEqual(
    Adapter.inlineTokens(action, { document: true, control: true, accentControl: true }),
    ['accent-ink', 'accent-bg']
  );
});

test('database card variables are adapted with their foreground instead of retaining white cards', () => {
  const card = style({ color: 'var(--c-texPri)', 'background-color': 'var(--c-grpColEle)' });
  assert.deepEqual(
    Adapter.inlineTokens(card, { database: true, resolvedBackground: 'rgb(255,255,255)' }),
    ['database-surface']
  );
  assert.deepEqual(
    Adapter.inlineTokens(style({ color: '#37352f', background: '#fff' }), { database: true }),
    ['text', 'database-surface']
  );
  assert.deepEqual(
    Adapter.inlineTokens(card, {
      database: true,
      overlay: true,
      resolvedBackground: 'rgb(255,255,255)'
    }),
    ['surface-solid']
  );
});

test('database status labels keep semantic colors with a paired opaque surface', () => {
  const label = style({ color: 'rgb(93,23,21)', 'background-color': 'rgba(228,79,67,0.2)' });
  assert.deepEqual(Adapter.inlineTokens(label, { database: true, label: 'red' }), [
    'label',
    'label-red'
  ]);
  assert.deepEqual(Adapter.inlineTokens(label, { document: true }), []);
});

test('stylesheet foregrounds and text-fill colors adapt like inline native text', () => {
  assert.deepEqual(
    Adapter.inlineTokens(style({}), {
      document: true,
      resolvedText: 'rgb(44,44,43)',
      resolvedFill: 'rgb(44,44,43)',
      hasText: true
    }),
    ['text', 'text-fill']
  );
  assert.ok(Adapter.inlineTokens(style({ color: '#5f5e59' }), { document: true }).includes('text'));
});

test('coordinated document colors are optional and never recolor preserved artwork', () => {
  assert.ok(
    Adapter.inlineTokens(style({ color: '#d44c47' }), { document: true, matchText: true }).includes(
      'text'
    )
  );
  assert.deepEqual(
    Adapter.inlineTokens(style({ color: '#d44c47' }), { document: true, matchText: false }),
    []
  );
  assert.deepEqual(
    Adapter.inlineTokens(style({ color: '#d44c47' }), {
      document: true,
      matchText: true,
      preserve: true
    }),
    []
  );
});

test('matching document text also resets an explicit colored text fill', () => {
  assert.deepEqual(
    Adapter.inlineTokens(style({ color: '#d44c47', '-webkit-text-fill-color': '#d44c47' }), {
      document: true,
      matchText: true,
      hasText: true
    }),
    ['text', 'text-fill']
  );
});

test('native surface variables and action accent variables cannot become status chips', () => {
  assert.equal(Adapter.labelFamily('var(--c-bacPri)', [29, 32, 52, 0.16]), '');
  assert.equal(Adapter.labelFamily('var(--c-bluBacAccPri)', [184, 160, 255, 1]), '');
  assert.equal(Adapter.labelFamily('var(--ca-graBacTerTra)', [28, 19, 1, 0.11]), 'gray');
});

test('Chrome background shorthand initial value does not leave native white surfaces', () => {
  const shorthand = style({ 'background-color': 'white', 'background-image': 'initial' });
  assert.deepEqual(
    Adapter.inlineTokens(shorthand, { database: true, resolvedBackgroundImage: 'none' }),
    ['database-surface']
  );
  assert.deepEqual(
    Adapter.inlineTokens(shorthand, {
      database: true,
      resolvedBackgroundImage: 'linear-gradient(red,blue)'
    }),
    []
  );
});

test('storage activation and changes update the existing wallpaper and color variables', async () => {
  assert.equal(typeof Adapter.createController, 'function');
  const host = environment({ prismSettings: { themeId: 'aurora' } });
  const controller = Adapter.createController(host);
  await controller.start();
  host.flush();
  const root = host.document.documentElement;
  const wallpaper = host.document.getElementById('prism-wallpaper');
  assert.equal(root.getAttribute('data-prism-enabled'), 'true');
  assert.equal(root.getAttribute('data-prism-mode'), 'dark');
  assert.equal(wallpaper?.getAttribute('aria-hidden'), 'true');
  assert.match(host.document.getElementById('prism-variables').textContent, /--prism-text:#eeeeee/);
  host.change({
    prismSettings: { newValue: { themeId: 'paper' } },
    prismImage: { newValue: { dataUrl: 'data:image/png;base64,AAAA' } }
  });
  assert.equal(root.getAttribute('data-prism-mode'), 'light');
  assert.strictEqual(host.document.getElementById('prism-wallpaper'), wallpaper);
  assert.match(host.document.getElementById('prism-variables').textContent, /--prism-text:#222222/);
  assert.match(host.document.getElementById('prism-variables').textContent, /data:image\/png/);
  controller.stop();
});

test('disable removes every owned effect without overwriting changed inline page styles', async () => {
  assert.equal(typeof Adapter.createController, 'function');
  const host = environment();
  const node = host.document.body.appendChild(host.document.createElement('div'));
  node.setAttribute('style', 'color:rgb(55,53,47)');
  let originalColor = 'rgb(55,53,47)';
  node.style = { getPropertyValue: (key) => (key === 'color' ? originalColor : '') };
  const controller = Adapter.createController(host);
  await controller.start();
  host.flush();
  assert.equal(node.getAttribute('data-prism-style'), 'text');
  originalColor = '#d44c47';
  node.setAttribute('style', 'color:#d44c47');
  host.mutate([{ type: 'attributes', attributeName: 'style', target: node }]);
  host.flush();
  assert.equal(node.hasAttribute('data-prism-style'), false);
  host.change({ prismSettings: { newValue: { enabled: false } } });
  assert.equal(node.getAttribute('style'), 'color:#d44c47');
  assert.equal(host.document.documentElement.hasAttribute('data-prism-enabled'), false);
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
  assert.equal(host.document.getElementById('prism-variables'), null);
  assert.equal(host.observing, false);
  controller.stop();
  assert.equal(host.listenerCount, 0);
});

test('SPA mutations batch once and ignore extension-owned nodes', async () => {
  assert.equal(typeof Adapter.createController, 'function');
  const host = environment();
  const controller = Adapter.createController(host);
  await controller.start();
  host.flush();
  const popup = host.document.body.appendChild(host.document.createElement('div'));
  popup.setAttribute('style', 'background-color:white');
  popup.style = style({ 'background-color': 'white' });
  const record = {
    type: 'childList',
    target: host.document.body,
    addedNodes: [popup],
    removedNodes: []
  };
  host.mutate([record, record, record]);
  assert.equal(host.pendingFrames, 1);
  host.flush();
  assert.equal(popup.getAttribute('data-prism-style'), 'surface');
  host.mutate([
    {
      type: 'childList',
      target: host.document.getElementById('prism-variables'),
      addedNodes: [],
      removedNodes: []
    }
  ]);
  assert.equal(host.pendingFrames, 0);
  controller.stop();
  assert.equal(popup.hasAttribute('data-prism-style'), false);
});

test('typing into an existing empty styled element adapts the new text', async () => {
  for (const type of ['characterData', 'childList']) {
    const host = environment(),
      node = host.document.body.appendChild(host.document.createElement('span'));
    node.setAttribute('style', '');
    node.childNodes = [];
    host.getComputedStyle = () => ({
      color: 'rgb(44,44,43)',
      webkitTextFillColor: 'rgb(44,44,43)',
      backgroundColor: 'rgba(0,0,0,0)',
      backgroundImage: 'none'
    });
    const controller = Adapter.createController(host);
    await controller.start();
    host.flush();
    assert.equal(node.hasAttribute('data-prism-style'), false);
    const textNode = { nodeType: 3, textContent: 'New text', parentElement: node };
    node.childNodes = [textNode];
    host.mutate([
      type === 'characterData'
        ? { type, target: textNode }
        : { type, target: node, addedNodes: [textNode], removedNodes: [] }
    ]);
    host.flush();
    assert.ok(node.getAttribute('data-prism-style')?.includes('text-fill'), type);
    controller.stop();
  }
});

test('a storage update during initial read wins over stale stored settings', async () => {
  assert.equal(typeof Adapter.createController, 'function');
  const host = environment({}, true);
  const controller = Adapter.createController(host);
  const starting = controller.start();
  host.change({ prismSettings: { newValue: { enabled: false } } });
  host.resolveRead({ prismSettings: { enabled: true, themeId: 'aurora' } });
  await starting;
  host.flush();
  assert.equal(host.document.documentElement.hasAttribute('data-prism-enabled'), false);
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
  controller.stop();
});

test('an extension reload removes storage without breaking page cleanup or restart', async () => {
  const host = environment();
  const controller = Adapter.createController(host);
  await controller.start();
  host.flush();
  delete host.chrome.storage;
  assert.doesNotThrow(() => controller.stop());
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
  assert.equal(host.document.documentElement.hasAttribute('data-prism-enabled'), false);
  assert.equal(host.observing, false);
  assert.equal(host.listenerCount, 0);
  await assert.doesNotReject(() => controller.start());
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
});

test('invalidated Chrome event methods cannot interrupt cleanup', async () => {
  const host = environment();
  const controller = Adapter.createController(host);
  await controller.start();
  host.chrome.storage.onChanged.removeListener = () => {
    throw new Error('Extension context invalidated.');
  };
  assert.doesNotThrow(() => controller.stop());
  assert.equal(host.pendingFrames, 0);
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
  assert.equal(host.observing, false);
  // Even if Chrome cannot detach the now-dead event, it must not resurrect UI.
  host.change({ prismSettings: { newValue: { enabled: true } } });
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
  host.chrome.storage.onChanged.addListener = () => {
    throw new Error('Extension context invalidated.');
  };
  await assert.doesNotReject(() => controller.start());
});

test('a storage read failing during extension reload leaves no unhandled rejection', async () => {
  const host = environment();
  host.chrome.storage.local.get = async () => {
    delete host.chrome.storage;
    throw new Error('Extension context invalidated.');
  };
  await assert.doesNotReject(() => Adapter.createController(host).start());
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
  assert.equal(host.listenerCount, 0);
});

test('page lifecycle restart attaches once and a stopped pending read cannot repaint', async () => {
  const host = environment({}, true);
  const controller = Adapter.createController(host);
  const first = controller.start();
  await controller.start();
  assert.equal(host.listenerCount, 1);
  controller.stop();
  host.resolveRead({ prismSettings: { enabled: true } });
  await first;
  assert.equal(host.document.getElementById('prism-wallpaper'), null);
  const resumed = controller.start();
  host.resolveRead({ prismSettings: { enabled: true } });
  await resumed;
  host.flush();
  assert.equal(host.listenerCount, 1);
  assert.ok(host.document.getElementById('prism-wallpaper'));
  controller.stop();
  controller.stop();
  assert.equal(host.listenerCount, 0);
});

test('image palette updates control Notion light/dark mode independently of the saved preset', async () => {
  const settings = {
    enabled: true,
    themeId: 'aurora',
    backgroundMode: 'image',
    imagePaletteMode: 'auto'
  };
  const image = {
    dataUrl: 'data:image/png;base64,AAAA',
    palette: { version: 1, seed: '#f0c4b0', mood: 'light' }
  };
  const host = environment({ prismSettings: settings, prismImage: image });
  host.Prism = require('../extension/core.js');
  const controller = Adapter.createController(host);
  await controller.start();
  host.flush();
  assert.equal(host.document.documentElement.getAttribute('data-prism-mode'), 'light');
  const variables = host.document.getElementById('prism-variables');
  assert.match(variables.textContent, /--prism-color-scheme:light/);
  host.change({
    prismImage: { newValue: { ...image, palette: { version: 1, seed: '#16468a', mood: 'dark' } } }
  });
  assert.equal(host.document.documentElement.getAttribute('data-prism-mode'), 'dark');
  host.change({
    prismSettings: { newValue: { ...settings, themeId: 'sakura', imagePaletteMode: 'manual' } }
  });
  assert.equal(host.document.documentElement.getAttribute('data-prism-mode'), 'light');
  assert.match(variables.textContent, /--prism-surface-solid:#fff6fa/);
  controller.stop();
});
