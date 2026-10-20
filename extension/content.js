(function (root, factory) {
  'use strict';
  const adapter = factory();
  if (typeof module === 'object' && module.exports) module.exports = adapter;
  if (!root.document || !root.chrome?.storage || !root.Prism) return;
  const controller = adapter.createController({
    document: root.document,
    chrome: root.chrome,
    Prism: root.Prism,
    PrismMedia: root.PrismMedia,
    getComputedStyle: root.getComputedStyle.bind(root),
    MutationObserver: root.MutationObserver,
    requestAnimationFrame: root.requestAnimationFrame.bind(root),
    cancelAnimationFrame: root.cancelAnimationFrame.bind(root)
  });
  const start = () => controller.start();
  if (root.document.readyState === 'loading')
    root.document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  root.addEventListener('pagehide', () => controller.stop());
  root.addEventListener('pageshow', (event) => {
    if (event.persisted) start();
  });
})(globalThis, function () {
  'use strict';

  const MARKER = 'data-prism-style';
  const OWNED = '[data-prism-owned]';
  const CANDIDATES = '*';
  const ART =
    'head, script, style, svg, math, img, picture, video, canvas, iframe, pre, code, .notion-code-block, .notion-image-block, .notion-video-block, .notion-embed-block, .notion-equation-block, .notion-page-cover, .notion-page-cover-wrapper, [data-prism-preserve]';
  const PRESERVE =
    ART +
    ', [data-color]:not([data-color="default"]), [data-block-color]:not([data-block-color="default"])';
  const DOCUMENT =
    '.notion-page-content, .notion-page-content-inner, [contenteditable="true"], [data-content-editable-leaf]';
  const DATABASE =
    '.notion-collection_view-block, .notion-collection_view_page-block, .notion-collection-view-body, .notion-board-view, .notion-table-view, .notion-list-view, .notion-gallery-view, .notion-calendar-view, .notion-timeline-view, .notion-feed-view, .notion-chart-view, .notion-form-view';
  const SIDEBAR = '.notion-sidebar-container, .notion-sidebar, #skeleton-sidebar';
  const OVERLAY =
    '[role="menu"], [role="dialog"], [role="listbox"], .notion-peek-renderer, .notion-selectable-menu, .notion-settings';
  const SHELL =
    'html, body, #notion-app, .notion-app, .notion-app-inner, .notion-frame, .notion-main, .notion-cursor-listener, .notion-scroller';
  const BORDER_SIDES = ['top', 'right', 'bottom', 'left'];
  const DEFAULT_TEXT = new Set([
    '0,0,0',
    '255,255,255',
    '55,53,47',
    '44,44,43',
    '50,48,44',
    '95,94,89',
    '240,239,237',
    '235,235,234',
    '230,230,230'
  ]);
  const MUTED_TEXT = new Set(['125,122,117', '161,158,153', '142,139,134', '173,169,163']);
  const DEFAULT_BACKGROUNDS = new Set([
    '0,0,0',
    '255,255,255',
    '25,25,25',
    '32,32,32',
    '47,47,47',
    '249,248,247',
    '251,251,250'
  ]);
  // Warm translucent neutrals in Notion's current design tokens. These are
  // interface shades, not a license to recolor the authored hue palettes.
  const WARM_NEUTRALS = new Set([
    '28,19,1',
    '42,28,0',
    '27,21,0',
    '66,35,3',
    '33,27,23',
    '21,14,0'
  ]);

  function parseColor(value) {
    if (typeof value !== 'string') return null;
    const color = value.trim().toLowerCase();
    if (color === 'white') return [255, 255, 255, 1];
    if (color === 'black') return [0, 0, 0, 1];
    if (color === 'transparent') return [0, 0, 0, 0];
    const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(color);
    if (hex) {
      const digits = hex[1].length < 5 ? [...hex[1]].map((char) => char + char).join('') : hex[1];
      return [
        parseInt(digits.slice(0, 2), 16),
        parseInt(digits.slice(2, 4), 16),
        parseInt(digits.slice(4, 6), 16),
        digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1
      ];
    }
    const rgb = /^rgba?\(([^()]+)\)$/.exec(color);
    if (!rgb) return null;
    const parts = rgb[1].trim().split(/\s*[,/]\s*|\s+/);
    if (
      parts.length < 3 ||
      parts.length > 4 ||
      parts.some((part) => !/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(part))
    )
      return null;
    const values = parts.map((part, index) => {
      const number = parseFloat(part);
      return part.endsWith('%') ? number * (index < 3 ? 2.55 : 0.01) : number;
    });
    if (values.some((value, index) => value < 0 || value > (index < 3 ? 255 : 1))) return null;
    return [Math.round(values[0]), Math.round(values[1]), Math.round(values[2]), values[3] ?? 1];
  }

  function isNeutral(color) {
    if (!color || color[3] < 0.015) return false;
    const channels = color.slice(0, 3);
    return (
      Math.max(...channels) - Math.min(...channels) <= 14 ||
      (color[3] <= 0.35 && WARM_NEUTRALS.has(channels.join(',')))
    );
  }

  function isNotionAccent(color) {
    return (
      color && color[3] > 0.4 && ['35,131,226', '39,131,222'].includes(color.slice(0, 3).join(','))
    );
  }

  const backgroundValue = (style) =>
    style.getPropertyValue('background-color') || style.getPropertyValue('background');

  function authoredInk(style, context = {}) {
    if (!context.document || context.art) return '';
    const raw = backgroundValue(style);
    const literal = parseColor(raw);
    if (context.control && isNotionAccent(literal)) return '';
    const semantic =
      /var\(\s*--(?:c-(?:gra|bro|ora|yel|gre|blu|pur|pin|red)Bac(?:Pri|Sec)|color-background-(?:gray|brown|orange|yellow|green|blue|purple|pink|red))\b/.test(
        raw
      );
    if (!semantic && (!literal || DEFAULT_BACKGROUNDS.has(literal.slice(0, 3).join(','))))
      return '';
    const background = literal || parseColor(context.resolvedBackground);
    if (!background || background[3] < 0.95) return '';
    const linear = background.slice(0, 3).map((channel) => {
      const n = channel / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    return luminance >= 0.179 ? 'authored-light' : 'authored-dark';
  }

  function inlineTokens(style, context = {}) {
    if (!style || context.preserve) return [];
    if (context.label) return ['label', 'label-' + context.label];
    const tokens = [];
    const rawText = style.getPropertyValue('color');
    const coordinateText =
      context.matchText &&
      context.document &&
      rawText &&
      !/--(?:c[a]?-tex|color-text-default)/.test(rawText);
    const text = parseColor(rawText) || parseColor(context.resolvedText);
    const background = parseColor(backgroundValue(style)) || parseColor(context.resolvedBackground);
    const authoredBackground =
      context.document &&
      background &&
      background[3] > 0.4 &&
      !DEFAULT_BACKGROUNDS.has(background.slice(0, 3).join(','));
    if (context.accentControl && isNeutral(text)) {
      tokens.push('accent-ink');
    } else if (coordinateText) {
      tokens.push('text');
    } else if (
      !authoredBackground &&
      isNeutral(text) &&
      (!context.document ||
        DEFAULT_TEXT.has(text.slice(0, 3).join(',')) ||
        MUTED_TEXT.has(text.slice(0, 3).join(',')))
    ) {
      const brightness = (text[0] + text[1] + text[2]) / 3;
      tokens.push(
        text[3] < 0.8 ||
          MUTED_TEXT.has(text.slice(0, 3).join(',')) ||
          (!context.document && brightness > 70 && brightness < 185)
          ? 'muted'
          : 'text'
      );
    }
    const rawFill = style.getPropertyValue('-webkit-text-fill-color');
    const fill = parseColor(rawFill) || parseColor(context.resolvedFill);
    if (
      context.hasText &&
      (coordinateText ||
        (!rawFill.includes('var(') &&
          isNeutral(fill) &&
          (DEFAULT_TEXT.has(fill.slice(0, 3).join(',')) ||
            tokens.some((token) => ['text', 'muted', 'accent-ink'].includes(token)))))
    )
      tokens.push('text-fill');
    // Chrome serializes background:white as background-image:initial. Use
    // the resolved image to distinguish a plain surface from actual artwork.
    const image = context.resolvedBackgroundImage || style.getPropertyValue('background-image');
    if (context.control && isNotionAccent(background)) tokens.push('accent-bg');
    if (
      (!image || ['none', 'initial', 'unset'].includes(image)) &&
      isNeutral(background) &&
      (!context.document || DEFAULT_BACKGROUNDS.has(background.slice(0, 3).join(',')))
    ) {
      tokens.push(
        context.shell
          ? 'transparent'
          : context.overlay
            ? 'surface-solid'
            : context.database
              ? 'database-surface'
              : background[3] < 0.4
                ? 'hover'
                : context.sidebar
                  ? 'panel'
                  : 'surface'
      );
    }
    for (const side of BORDER_SIDES) {
      if (isNeutral(parseColor(style.getPropertyValue('border-' + side + '-color'))))
        tokens.push('border-' + side);
    }
    return tokens;
  }

  function labelFamily(raw, background) {
    const families = {
      gra: 'gray',
      bro: 'brown',
      ora: 'orange',
      yel: 'yellow',
      gre: 'green',
      blu: 'blue',
      pur: 'purple',
      pin: 'pink',
      red: 'red'
    };
    const token = raw.match(
      /--c[a]?-(gra|bro|ora|yel|gre|blu|pur|pin|red)(?:Bac|Tex)(?:Pri|Sec|Ter|Int)(?:Tra)?\b/
    );
    if (token) return families[token[1]];
    // A normal surface can be colorful after theming. Its computed hue does
    // not turn a cell, card, or action button into a semantic status chip.
    if (raw.includes('var(')) return '';
    if (!background || background[3] <= 0.01) return '';
    if (isNeutral(background))
      return background[3] < 0.6 && background[0] > 55 && background[0] < 210 ? 'gray' : '';
    const [r, g, b] = background.slice(0, 3).map((n) => n / 255),
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min;
    let hue = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
    hue = (hue * 60 + 360) % 360;
    if (hue < 15 || hue >= 350) return 'red';
    if (hue < 38) return max < 0.7 ? 'brown' : 'orange';
    if (hue < 70) return 'yellow';
    if (hue < 175) return 'green';
    if (hue < 255) return 'blue';
    if (hue < 295) return 'purple';
    return 'pink';
  }

  function createController(host) {
    const {
      document,
      chrome,
      Prism,
      MutationObserver,
      requestAnimationFrame,
      cancelAnimationFrame
    } = host;
    const html = document.documentElement;
    const tracked = new Map();
    const pending = new Map();
    const work = new Set();
    const rootAttributes = new Map();
    let settings = Prism.normalizeSettings();
    let image = null;
    let started = false;
    let active = false;
    let lifecycle = 0;
    let frame = null;
    let observer = null;
    let wallpaper = null;
    let media = null;
    let variables = null;
    let reading = false;
    let storageEvents = null;
    let lastTextMode;
    const changedDuringRead = new Set();

    function owned(node) {
      return node?.nodeType === 1 && !!node.closest(OWNED);
    }

    function restoreMarker(node, record) {
      if (node.getAttribute(MARKER) !== record.applied) return;
      if (record.original === null) node.removeAttribute(MARKER);
      else node.setAttribute(MARKER, record.original);
    }

    function adapt(node) {
      if (node.nodeType !== 1 || owned(node)) return;
      const record = tracked.get(node);
      const art = !!node.closest(ART);
      if (art) {
        if (record) {
          restoreMarker(node, record);
          tracked.delete(node);
        }
        return;
      }
      const control = node.closest('button, [role="button"], [role="checkbox"]');
      const documentContent = !!node.closest(DOCUMENT);
      const database = !!node.closest(DATABASE),
        overlay = !!node.closest(OVERLAY);
      const hasText =
        Array.from(node.childNodes || []).some(
          (child) => child.nodeType === 3 && child.textContent.trim()
        ) || node.matches('input, textarea');
      const background = backgroundValue(node.style);
      // Inspect the native foreground, not our previous override. The marker
      // is restored synchronously before painting and isn't observed by us.
      const inspecting = record && node.getAttribute(MARKER) === record.applied;
      if (inspecting) node.removeAttribute(MARKER);
      // Resolve a native variable before our marker's background override. Reading
      // only backgroundColor would see our own surface on the next SPA mutation.
      const computed = host.getComputedStyle?.(node);
      const variable = background.match(/^var\(\s*(--[\w-]+)/)?.[1];
      const originalVariable = variable ? computed?.getPropertyValue(variable) : '';
      const resolvedBackground = parseColor(originalVariable)
        ? originalVariable
        : computed?.backgroundColor || '';
      const backgroundColor = parseColor(background) || parseColor(resolvedBackground);
      let label = '';
      if (
        (database || overlay) &&
        background &&
        !isNotionAccent(backgroundColor) &&
        node.textContent.length <= 160
      ) {
        const family = labelFamily(background, backgroundColor);
        if (family) {
          const bounds = node.getBoundingClientRect();
          const compactWidth = Math.min(
            420,
            (node.textContent.trim().length + 3) * (parseFloat(computed?.fontSize) || 14) * 0.9
          );
          if (bounds.height > 0 && bounds.height <= 44 && bounds.width <= compactWidth)
            label = family;
        }
      }
      const ink = authoredInk(node.style, {
        document: documentContent && !database,
        control: !!control,
        art,
        resolvedBackground
      });
      const tokens = [
        ...inlineTokens(node.style, {
          preserve: !settings.matchTextColors && !database && !!node.closest(PRESERVE),
          matchText: settings.matchTextColors,
          hasText,
          resolvedText: hasText ? computed?.color : '',
          resolvedFill: hasText ? computed?.webkitTextFillColor : '',
          database,
          label,
          resolvedBackground,
          resolvedBackgroundImage: computed?.backgroundImage,
          document: documentContent && !database,
          sidebar: !!node.closest(SIDEBAR),
          overlay,
          control: !!control,
          accentControl:
            !!control &&
            (isNotionAccent(parseColor(backgroundValue(control.style))) ||
              /--c-(?:bluBacAccPri|bacAccPri)\b/.test(backgroundValue(control.style))),
          shell: node.matches(SHELL)
        }),
        ...(ink ? [ink] : [])
      ].join(' ');
      if (!tokens) {
        if (record) {
          // The native inspection removed our applied marker above.
          if (inspecting) {
            if (record.original === null) node.removeAttribute(MARKER);
            else node.setAttribute(MARKER, record.original);
          }
          tracked.delete(node);
        }
        return;
      }
      if (!record) tracked.set(node, { original: node.getAttribute(MARKER), applied: tokens });
      else record.applied = tokens;
      if (node.getAttribute(MARKER) !== tokens) node.setAttribute(MARKER, tokens);
    }

    function schedule(node, descendants = false) {
      if (!active || node?.nodeType !== 1 || owned(node)) return;
      pending.set(node, pending.get(node) || descendants);
      if (frame === null) frame = requestAnimationFrame(flush);
    }

    function flush() {
      frame = null;
      if (!active) return;
      for (const [node, descendants] of pending) {
        if (!node.isConnected) continue;
        work.add(node);
        if (descendants) for (const child of node.querySelectorAll(CANDIDATES)) work.add(child);
      }
      pending.clear();
      // Keep edits and typing responsive even on very large database pages.
      let remaining = 180;
      for (const node of work) {
        work.delete(node);
        if (node.isConnected) adapt(node);
        if (--remaining === 0) break;
      }
      for (const [node, record] of tracked) {
        if (!node.isConnected) {
          restoreMarker(node, record);
          tracked.delete(node);
        }
      }
      if (work.size) frame = requestAnimationFrame(flush);
    }

    function ensureOwnedNodes() {
      if (!variables) {
        variables = document.createElement('style');
        variables.id = 'prism-variables';
        variables.setAttribute('data-prism-owned', 'variables');
      }
      if (!variables.isConnected) (document.head || html).appendChild(variables);
      if (!wallpaper) {
        wallpaper = document.createElement('div');
        wallpaper.id = 'prism-wallpaper';
        wallpaper.setAttribute('data-prism-owned', 'wallpaper');
        wallpaper.setAttribute('aria-hidden', 'true');
        media = host.PrismMedia?.mount(wallpaper);
      }
      const parent = document.body || html;
      if (wallpaper.parentElement !== parent) parent.prepend(wallpaper);
    }

    function mutations(records) {
      if (!active) return;
      let removed = false;
      for (const record of records) {
        if (owned(record.target)) continue;
        if (record.type === 'attributes') {
          schedule(record.target, record.attributeName !== 'style');
        } else if (record.type === 'characterData') {
          schedule(record.target.parentElement);
        } else if (record.type === 'childList') {
          schedule(record.target);
          for (const node of record.addedNodes) schedule(node, true);
          if (record.removedNodes.length) removed = true;
        }
      }
      if (removed) {
        ensureOwnedNodes();
        if (frame === null) frame = requestAnimationFrame(flush);
      }
    }

    function setRootAttribute(name, value) {
      if (!rootAttributes.has(name)) rootAttributes.set(name, html.getAttribute(name));
      html.setAttribute(name, value);
    }

    function disable() {
      active = false;
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pending.clear();
      work.clear();
      for (const [node, record] of tracked) restoreMarker(node, record);
      tracked.clear();
      for (const [name, value] of rootAttributes) {
        if (value === null) html.removeAttribute(name);
        else html.setAttribute(name, value);
      }
      rootAttributes.clear();
      variables?.remove();
      media?.dispose();
      media = null;
      wallpaper?.remove();
      variables = null;
      wallpaper = null;
    }

    function render() {
      if (!started) return;
      if (!settings.enabled) {
        disable();
        return;
      }
      const initial = !active;
      active = true;
      setRootAttribute('data-prism-enabled', 'true');
      setRootAttribute('data-prism-mode', Prism.resolveTheme(settings, image).mood);
      setRootAttribute('data-prism-text-colors', settings.matchTextColors ? 'theme' : 'preserve');
      ensureOwnedNodes();
      media?.update(image, settings);
      // Values come exclusively from the shared, validated Prism builder.
      // textContent avoids HTML interpretation, including for imported images.
      const declarations = Object.entries(Prism.buildVariables(settings, image))
        .filter(([name, value]) => /^--prism-[a-z-]+$/.test(name) && typeof value === 'string')
        .map(([name, value]) => name + ':' + value + ';')
        .join('');
      const rule = 'html[data-prism-enabled="true"]{' + declarations + '}';
      if (variables.textContent !== rule) variables.textContent = rule;
      if (initial) {
        if (!observer) observer = new MutationObserver(mutations);
        observer.observe(html, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'contenteditable', 'data-color', 'data-block-color']
        });
      }
      if (initial || lastTextMode !== settings.matchTextColors) schedule(html, true);
      lastTextMode = settings.matchTextColors;
    }

    function storageChanged(changes, area) {
      if (!started || area !== 'local') return;
      let relevant = false;
      if (Object.prototype.hasOwnProperty.call(changes, Prism.SETTINGS_KEY)) {
        settings = Prism.normalizeSettings(changes[Prism.SETTINGS_KEY].newValue);
        if (reading) changedDuringRead.add(Prism.SETTINGS_KEY);
        relevant = true;
      }
      if (Object.prototype.hasOwnProperty.call(changes, Prism.IMAGE_KEY)) {
        image = changes[Prism.IMAGE_KEY].newValue || null;
        if (reading) changedDuringRead.add(Prism.IMAGE_KEY);
        relevant = true;
      }
      if (relevant) render();
    }

    async function start() {
      if (started) return;
      started = true;
      const current = ++lifecycle;
      reading = true;
      changedDuringRead.clear();
      try {
        // An old tab can outlive its extension context after Reload, including
        // a later pageshow from the back/forward cache. Capture the event handle
        // while it exists; neither registration nor removal is safe afterward.
        const storage = chrome?.storage;
        if (!storage?.local?.get || !storage?.onChanged?.addListener) {
          stop();
          return;
        }
        storageEvents = storage.onChanged;
        storageEvents.addListener(storageChanged);
        const stored = await storage.local.get([Prism.SETTINGS_KEY, Prism.IMAGE_KEY]);
        if (!started || current !== lifecycle) return;
        if (!changedDuringRead.has(Prism.SETTINGS_KEY))
          settings = Prism.normalizeSettings(stored[Prism.SETTINGS_KEY]);
        if (!changedDuringRead.has(Prism.IMAGE_KEY)) image = stored[Prism.IMAGE_KEY] || null;
        reading = false;
        render();
      } catch (_) {
        // Storage can disappear when an extension is reloaded. Fail closed.
        if (current === lifecycle) stop();
      }
    }

    function stop() {
      started = false;
      lifecycle++;
      reading = false;
      const events = storageEvents;
      storageEvents = null;
      try {
        events?.removeListener(storageChanged);
      } catch (_) {
        /* Chrome may already have invalidated this event handle. */
      } finally {
        disable();
      }
    }

    return { start, stop };
  }

  return { parseColor, inlineTokens, authoredInk, labelFamily, createController };
});
