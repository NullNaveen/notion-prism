(function (root) {
  'use strict';
  const palettes =
    root.PrismPalette || (typeof require === 'function' ? require('./palette.js') : null);
  const THEMES = [
    {
      id: 'aurora',
      name: 'Aurora',
      mood: 'dark',
      description: 'Violet skies. A little northern light.',
      bg: '#111221',
      panel: '#17172b',
      surface: '#1d2034',
      text: '#f0f0fc',
      muted: '#b6bad3',
      accent: '#b8a0ff',
      border: '#444663',
      gradient:
        'radial-gradient(ellipse at 10% 15%, #7842bd 0%, transparent 55%), radial-gradient(ellipse at 92% 90%, #147f82 0%, transparent 55%), linear-gradient(135deg, #18162e, #172946)'
    },
    {
      id: 'nebula',
      name: 'Nebula',
      mood: 'dark',
      description: 'A soft landing somewhere in space.',
      bg: '#1a1029',
      panel: '#251633',
      surface: '#2c1d3b',
      text: '#faefff',
      muted: '#cbb5dc',
      accent: '#f0a0dc',
      border: '#60456d',
      gradient:
        'radial-gradient(ellipse at 85% 15%, #ba408e 0%, transparent 60%), radial-gradient(ellipse at 12% 90%, #6339b5 0%, transparent 60%), linear-gradient(145deg, #41164b, #211a49)'
    },
    {
      id: 'tide',
      name: 'Tide',
      mood: 'dark',
      description: 'Deep ocean, clear mind.',
      bg: '#0b1c27',
      panel: '#102632',
      surface: '#15303e',
      text: '#e5f8fc',
      muted: '#accad8',
      accent: '#7bdddc',
      border: '#355f70',
      gradient:
        'radial-gradient(ellipse at 15% 10%, #0d8792 0%, transparent 65%), radial-gradient(ellipse at 95% 95%, #194fb1 0%, transparent 60%), linear-gradient(140deg, #123952, #081e34)'
    },
    {
      id: 'ember',
      name: 'Ember',
      mood: 'dark',
      description: 'Golden hour, long after sunset.',
      bg: '#241614',
      panel: '#2e1e1b',
      surface: '#382723',
      text: '#fff1e8',
      muted: '#d7b8aa',
      accent: '#ffb987',
      border: '#745248',
      gradient:
        'radial-gradient(ellipse at 10% 5%, #b65635 0%, transparent 65%), radial-gradient(ellipse at 95% 95%, #8c335d 0%, transparent 65%), linear-gradient(130deg, #54291c, #2f1732)'
    },
    {
      id: 'sakura',
      name: 'Sakura',
      mood: 'light',
      description: 'A blush of possibility.',
      bg: '#f6e8ee',
      panel: '#fbf1f6',
      surface: '#fff6fa',
      text: '#493046',
      muted: '#76516c',
      accent: '#a84179',
      border: '#d8b7ca',
      gradient:
        'radial-gradient(ellipse at 5% 5%, #f7b4c7 0%, transparent 65%), radial-gradient(ellipse at 95% 95%, #beafe9 0%, transparent 60%), linear-gradient(135deg, #ffdee7, #e4d9f5)'
    },
    {
      id: 'matcha',
      name: 'Matcha',
      mood: 'light',
      description: 'Room to breathe. Space to grow.',
      bg: '#e3ecd9',
      panel: '#f0f4e8',
      surface: '#f6f8ed',
      text: '#2d4435',
      muted: '#536a48',
      accent: '#4a6d38',
      border: '#bbcbae',
      gradient:
        'radial-gradient(ellipse at 5% 5%, #9bb892 0%, transparent 60%), radial-gradient(ellipse at 90% 95%, #e5d098 0%, transparent 65%), linear-gradient(140deg, #d8e7b8, #c2d7c8)'
    },
    {
      id: 'solstice',
      name: 'Solstice',
      mood: 'light',
      description: 'Bring a little sunshine inside.',
      bg: '#f6ead9',
      panel: '#fbf2e6',
      surface: '#fff8ee',
      text: '#51372b',
      muted: '#806049',
      accent: '#ae542b',
      border: '#dcc0a3',
      gradient:
        'radial-gradient(ellipse at 5% 5%, #edb05e 0%, transparent 60%), radial-gradient(ellipse at 95% 95%, #ed9f9f 0%, transparent 65%), linear-gradient(145deg, #f9dfa3, #f6beae)'
    },
    {
      id: 'glacier',
      name: 'Glacier',
      mood: 'light',
      description: 'Fresh air for your next big idea.',
      bg: '#e4ecf7',
      panel: '#eef3fb',
      surface: '#f6f9ff',
      text: '#29405b',
      muted: '#546985',
      accent: '#4267b5',
      border: '#b9cce4',
      gradient:
        'radial-gradient(ellipse at 10% 10%, #aabbee 0%, transparent 65%), radial-gradient(ellipse at 90% 90%, #97d6d3 0%, transparent 60%), linear-gradient(130deg, #d5e1ff, #c8eaf0)'
    }
  ].map(Object.freeze);
  Object.freeze(THEMES);
  const DEFAULTS = Object.freeze({
    version: 2,
    enabled: true,
    themeId: 'aurora',
    backgroundMode: 'theme',
    imagePaletteMode: 'auto',
    imageFit: 'contain',
    matchTextColors: true,
    fitBackdrop: true,
    imageRotation: 0,
    autoLandscape: true,
    videoPlaying: true,
    dim: 30,
    blur: 0,
    positionX: 50,
    positionY: 50,
    surfaceOpacity: 92,
    accent: ''
  });
  const SETTINGS_KEY = 'prismSettings';
  const IMAGE_KEY = 'prismImage';
  const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
  const bound = (v, min, max, fallback) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.round(Math.max(min, Math.min(max, v)))
      : fallback;
  function normalizeSettings(input) {
    const s = input && typeof input === 'object' ? input : {};
    return {
      version: 2,
      enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
      themeId: getTheme(s.themeId).id,
      backgroundMode: s.backgroundMode === 'image' ? 'image' : 'theme',
      imagePaletteMode: s.imagePaletteMode === 'manual' ? 'manual' : 'auto',
      imageFit: ['cover', 'fill'].includes(s.imageFit) ? s.imageFit : 'contain',
      matchTextColors: s.matchTextColors !== false,
      fitBackdrop: s.fitBackdrop !== false,
      imageRotation: [0, 90, 180, 270].includes(s.imageRotation) ? s.imageRotation : 0,
      autoLandscape: s.autoLandscape !== false,
      videoPlaying: s.videoPlaying !== false,
      dim: bound(s.dim, 0, 80, 30),
      blur: bound(s.blur, 0, 30, 0),
      positionX: bound(s.positionX, 0, 100, 50),
      positionY: bound(s.positionY, 0, 100, 50),
      surfaceOpacity: bound(s.surfaceOpacity, 65, 100, 92),
      accent:
        typeof s.accent === 'string' && /^#[\da-f]{6}$/i.test(s.accent)
          ? s.accent.toLowerCase()
          : ''
    };
  }
  function rgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  function contrast(a, b) {
    const luminance = (h) =>
      rgb(h)
        .map((c) => {
          c /= 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  let validatedSource = '',
    validatedKind = '';
  function mediaKind(value) {
    // 20 MiB of original bytes plus base64 expansion and the MIME prefix.
    if (typeof value !== 'string' || value.length > 4 * Math.ceil((20 * 1024 * 1024) / 3) + 40)
      return '';
    if (value === validatedSource) return validatedKind;
    const kind = /^data:image\/(?:png|jpeg|webp|avif|gif);base64,/.test(value)
      ? 'image'
      : /^data:video\/(?:mp4|webm);base64,/.test(value)
        ? 'video'
        : '';
    const valid =
      kind && /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(value.indexOf(',') + 1)) ? kind : '';
    // Retain only one large, immutable source. Tiny video thumbnails must not
    // evict it and force a multi-megabyte validation on every slider movement.
    if (value.length > 65536) {
      validatedSource = value;
      validatedKind = valid;
    }
    return valid;
  }
  const isImageDataURL = (value) => mediaKind(value) === 'image';
  const isVideoDataURL = (value) => mediaKind(value) === 'video';
  const isMediaDataURL = (value) => !!mediaKind(value);
  function resolveTheme(input, image) {
    const s = normalizeSettings(input);
    if (
      s.imagePaletteMode === 'auto' &&
      s.backgroundMode === 'image' &&
      isMediaDataURL(image?.dataUrl)
    ) {
      const derived = palettes?.toTheme(image.palette);
      if (derived) return derived;
    }
    return getTheme(s.themeId);
  }
  function selectPreset(input, id) {
    const s = normalizeSettings(input);
    return normalizeSettings({
      ...s,
      themeId: getTheme(id).id,
      accent: '',
      imagePaletteMode: s.backgroundMode === 'image' ? 'manual' : s.imagePaletteMode
    });
  }
  function mix(front, back, alpha) {
    const a = rgb(front),
      b = rgb(back);
    return (
      '#' +
      a
        .map((n, i) =>
          Math.round(n * alpha + b[i] * (1 - alpha))
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    );
  }
  function readableColor(color, backgrounds, mood) {
    const target = mood === 'dark' ? '#ffffff' : '#000000';
    for (let step = 0; step <= 100; step++) {
      const candidate = mix(target, color, step / 100);
      if (backgrounds.every((bg) => contrast(candidate, bg) >= 4.6)) return candidate;
    }
    return target;
  }
  function readability(input, image) {
    const s = normalizeSettings(input),
      t = resolveTheme(s, image);
    const bases = [t.panel, t.surface];
    let accent = s.accent || t.accent;
    // Include hover tints when protecting links and secondary text.
    for (let pass = 0; pass < 3; pass++)
      accent = readableColor(
        accent,
        [...bases, ...bases.map((bg) => mix(accent, bg, 0.13))],
        t.mood
      );
    const opaque = [...bases, ...bases.map((bg) => mix(accent, bg, 0.13))];
    const text = readableColor(t.text, opaque, t.mood),
      muted = readableColor(t.muted, opaque, t.mood);
    const hasImage = s.backgroundMode === 'image' && isMediaDataURL(image?.dataUrl);
    const brightest = hasImage ? Math.round(255 * (1 - s.dim / 100)) : 255;
    const top = '#' + brightest.toString(16).padStart(2, '0').repeat(3);
    let opacity = s.surfaceOpacity;
    for (; opacity < 100; opacity++) {
      const surfaces = bases.flatMap((bg) =>
        ['#000000', top].map((under) => mix(bg, under, opacity / 100))
      );
      const backgrounds = [...surfaces, ...surfaces.map((bg) => mix(accent, bg, 0.13))];
      if ([text, muted, accent].every((fg) => backgrounds.every((bg) => contrast(fg, bg) >= 4.5)))
        break;
    }
    return { opacity, text, muted, accent, protected: opacity > s.surfaceOpacity };
  }
  function buildVariables(input, image) {
    const s = normalizeSettings(input),
      t = resolveTheme(s, image),
      safe = readability(s, image),
      accent = safe.accent;
    const alpha = (hex, a) => `rgba(${rgb(hex).join(', ')}, ${a})`;
    const hasImage = s.backgroundMode === 'image' && isMediaDataURL(image?.dataUrl);
    const labels = {};
    for (const [name, hue] of Object.entries({
      gray: '#787774',
      brown: '#a56a42',
      orange: '#cf7628',
      yellow: '#bd9400',
      green: '#328761',
      blue: '#287dbd',
      purple: '#9065b0',
      pink: '#b94b88',
      red: '#c94f48'
    })) {
      const background = mix(hue, t.surface, 0.22);
      labels[`--prism-label-${name}-bg`] = background;
      labels[`--prism-group-${name}-bg`] = alpha(hue, 0.1);
      const backdrop = hasImage
        ? '#' +
          Math.round(255 * (1 - s.dim / 100))
            .toString(16)
            .padStart(2, '0')
            .repeat(3)
        : '#ffffff';
      const bases = [t.surface, t.panel].flatMap((base) => [
        base,
        ...['#000000', backdrop].map((under) => mix(base, under, safe.opacity / 100))
      ]);
      labels[`--prism-label-${name}-ink`] = readableColor(hue, [background, ...bases], t.mood);
    }
    return {
      ...labels,
      '--prism-bg': t.bg,
      '--prism-canvas': alpha(t.surface, 0.18),
      '--prism-panel': alpha(t.panel, safe.opacity / 100),
      '--prism-panel-solid': t.panel,
      '--prism-surface': alpha(t.surface, safe.opacity / 100),
      '--prism-surface-solid': t.surface,
      '--prism-database-surface': alpha(t.surface, 0.16),
      '--prism-text': safe.text,
      '--prism-muted': safe.muted,
      '--prism-accent': accent,
      '--prism-accent-ink':
        contrast(accent, '#ffffff') >= contrast(accent, '#141422') ? '#ffffff' : '#141422',
      '--prism-border': alpha(t.border, 0.65),
      '--prism-hover': alpha(accent, 0.13),
      '--prism-gradient': t.gradient,
      '--prism-wallpaper': hasImage ? 'none' : t.gradient,
      '--prism-overlay': hasImage ? `rgba(0, 0, 0, ${s.dim / 100})` : 'transparent',
      '--prism-blur': hasImage ? `${s.blur}px` : '0px',
      '--prism-position': `${s.positionX}% ${s.positionY}%`,
      '--prism-size': hasImage ? (s.imageFit === 'fill' ? '100% 100%' : s.imageFit) : 'cover',
      '--prism-object-fit': hasImage ? s.imageFit : 'cover',
      '--prism-color-scheme': t.mood
    };
  }
  function framingMetrics(image, input, width, height, density = 1) {
    if (
      ![image?.width, image?.height, width, height, density].every(
        (n) => Number.isFinite(n) && n > 0
      )
    )
      return null;
    const s = normalizeSettings(input),
      sideways = s.imageRotation % 180 !== 0;
    const sourceWidth = sideways ? image.height : image.width,
      sourceHeight = sideways ? image.width : image.height;
    const x = width / sourceWidth,
      y = height / sourceHeight;
    const scale = s.imageFit === 'contain' ? Math.min(x, y) : Math.max(x, y);
    return {
      pixelScale: scale * density,
      visibleFraction: s.imageFit === 'fill' ? 1 : Math.min(1, x / scale) * Math.min(1, y / scale),
      distorted: s.imageFit === 'fill' && Math.abs(x / y - 1) > 0.01
    };
  }
  const api = {
    THEMES,
    DEFAULTS,
    SETTINGS_KEY,
    IMAGE_KEY,
    getTheme,
    normalizeSettings,
    contrast,
    buildVariables,
    isImageDataURL,
    isMediaDataURL,
    isVideoDataURL,
    resolveTheme,
    selectPreset,
    readability,
    framingMetrics
  };
  root.Prism = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
