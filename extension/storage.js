(function (root) {
  'use strict';
  const P = root.Prism;
  const isExtension = !!(root.chrome?.runtime?.id && root.chrome?.storage?.local);
  const listeners = new Set();
  const ORIGIN_KEY = 'prismWriteOrigin',
    origin = root.crypto.randomUUID();
  let queue = Promise.resolve(),
    writeSequence = 0;
  // The web preview needs disk storage too: localStorage's small string quota
  // would force large original images and animations to be compressed again.
  let database;
  const channel =
    !isExtension && root.BroadcastChannel
      ? new root.BroadcastChannel('prism-preview-changes')
      : null;
  function previewDatabase() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const request = root.indexedDB.open('prism-preview', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('state', 'readwrite'),
            state = tx.objectStore('state');
          const current = state.get(P.SETTINGS_KEY);
          current.onsuccess = () => {
            if (current.result !== undefined) return;
            let legacy = {};
            try {
              legacy = JSON.parse(localStorage.getItem('prism-preview') || '{}');
            } catch {}
            state.put(P.normalizeSettings(legacy.settings), P.SETTINGS_KEY);
            state.put(legacy.image || null, P.IMAGE_KEY);
          };
          tx.oncomplete = () => {
            try {
              localStorage.removeItem('prism-preview');
            } catch {}
            resolve(db);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error || new Error('Preview storage is unavailable.'));
          };
        };
      }).catch((error) => {
        database = null;
        throw error;
      });
    return database;
  }
  async function previewState(values) {
    const db = await previewDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', values ? 'readwrite' : 'readonly'),
        state = tx.objectStore('state');
      let settings, image;
      if (values) {
        for (const [key, value] of Object.entries(values)) state.put(value, key);
      } else {
        const a = state.get(P.SETTINGS_KEY),
          b = state.get(P.IMAGE_KEY);
        a.onsuccess = () => {
          settings = a.result;
        };
        b.onsuccess = () => {
          image = b.result;
        };
      }
      tx.oncomplete = () =>
        resolve(values || { settings: P.normalizeSettings(settings), image: image || null });
      tx.onabort = () =>
        reject(
          tx.error ||
            new Error('The original file could not be saved. Free some browser storage and retry.')
        );
    });
  }
  async function read() {
    if (isExtension) {
      const data = await chrome.storage.local.get([P.SETTINGS_KEY, P.IMAGE_KEY]);
      return {
        settings: P.normalizeSettings(data[P.SETTINGS_KEY]),
        image: data[P.IMAGE_KEY] || null
      };
    }
    return previewState();
  }
  function write(values) {
    const operation = queue
      .catch(() => {})
      .then(async () => {
        const writer = { id: origin, sequence: ++writeSequence };
        if (isExtension) {
          await chrome.storage.local.set({ ...values, [ORIGIN_KEY]: writer });
          return;
        }
        await previewState(values);
        const data = {};
        if (P.SETTINGS_KEY in values) data.settings = values[P.SETTINGS_KEY];
        if (P.IMAGE_KEY in values) data.image = values[P.IMAGE_KEY];
        channel?.postMessage(data);
        listeners.forEach((fn) => fn(data, { own: true }));
      });
    queue = operation;
    return operation;
  }
  if (isExtension) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes[P.SETTINGS_KEY] || changes[P.IMAGE_KEY])) {
        // Deliver the exact event immediately. A later read could replace an
        // external choice with our own pending image write and lose that intent.
        const data = {};
        if (changes[P.SETTINGS_KEY])
          data.settings = P.normalizeSettings(changes[P.SETTINGS_KEY].newValue);
        if (changes[P.IMAGE_KEY]) data.image = changes[P.IMAGE_KEY].newValue || null;
        const own = changes[ORIGIN_KEY]?.newValue?.id === origin;
        listeners.forEach((fn) => fn(data, { own }));
      }
    });
  } else if (channel)
    channel.onmessage = (event) => listeners.forEach((fn) => fn(event.data, { own: false }));
  root.PrismStorage = {
    isExtension,
    read,
    saveSettings: (s) => write({ [P.SETTINGS_KEY]: P.normalizeSettings(s) }),
    saveImage: (image, s) =>
      write({ [P.IMAGE_KEY]: image, [P.SETTINGS_KEY]: P.normalizeSettings(s) }),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})(globalThis);
