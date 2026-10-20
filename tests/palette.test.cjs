const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../extension/core.js');
let A;
try {
  A = require('../extension/palette.js');
} catch {
  A = {};
}

function pixels(...regions) {
  return Uint8ClampedArray.from(
    regions.flatMap(([r, g, b, count = 100, a = 255]) =>
      Array.from({ length: count }, () => [r, g, b, a]).flat()
    )
  );
}

test('image colors produce their own coordinated palette rather than selecting a preset', () => {
  assert.equal(typeof A.fromPixels, 'function');
  const blue = A.fromPixels(pixels([20, 70, 190]));
  const red = A.fromPixels(pixels([185, 36, 35]));
  const bt = A.toTheme(blue),
    rt = A.toTheme(red);
  assert.notEqual(bt.accent, rt.accent);
  assert.notEqual(bt.panel, rt.panel);
  assert.ok(
    parseInt(bt.accent.slice(5, 7), 16) > parseInt(bt.accent.slice(1, 3), 16),
    'blue accent retains blue hue'
  );
  assert.ok(
    parseInt(rt.accent.slice(1, 3), 16) > parseInt(rt.accent.slice(5, 7), 16),
    'red accent retains red hue'
  );
  assert.equal(
    P.THEMES.some((t) => t.panel === bt.panel),
    false
  );
});

test('bright and dark images choose appropriate text polarity, including grayscale', () => {
  for (const [color, mood] of [
    [[10, 18, 35], 'dark'],
    [[243, 218, 222], 'light'],
    [[0, 0, 0], 'dark'],
    [[255, 255, 255], 'light']
  ]) {
    const palette = A.fromPixels(pixels([...color]));
    assert.equal(palette.mood, mood);
    const t = A.toTheme(palette);
    for (const background of [t.surface, t.panel]) {
      assert.ok(P.contrast(t.text, background) >= 7, `${color} body text`);
      assert.ok(P.contrast(t.muted, background) >= 4.5, `${color} secondary text`);
      assert.ok(P.contrast(t.accent, background) >= 4.5, `${color} links`);
    }
  }
});

test('dominant colors beat tiny vivid outliers, and transparent pixels do not bias extraction', () => {
  const palette = A.fromPixels(pixels([20, 70, 190, 900], [240, 30, 30, 1], [0, 240, 0, 1000, 0]));
  assert.ok(parseInt(palette.seed.slice(5, 7), 16) > parseInt(palette.seed.slice(1, 3), 16));
  assert.deepEqual(
    A.fromPixels(pixels([20, 70, 190])),
    A.fromPixels(pixels([20, 70, 190, 100], [0, 240, 0, 1000, 0]))
  );
  assert.equal(A.fromPixels(pixels([0, 0, 0, 100, 0])).seed, '#808080');
});

test('neutral backgrounds still allow a meaningful colored region to supply the accent', () => {
  const palette = A.fromPixels(pixels([235, 235, 235, 850], [180, 50, 75, 150]));
  assert.ok(parseInt(palette.seed.slice(1, 3), 16) > parseInt(palette.seed.slice(5, 7), 16));
  assert.equal(palette.mood, 'light');
});

test('muted natural colors are not discarded in favor of gray sky or stone', () => {
  const palette = A.fromPixels(pixels([195, 199, 199, 650], [60, 77, 69, 200], [11, 16, 11, 150]));
  const r = parseInt(palette.seed.slice(1, 3), 16),
    g = parseInt(palette.seed.slice(3, 5), 16);
  assert.ok(g - r >= 10, 'the forest green supplies the palette instead of gray sky');
  assert.notEqual(A.toTheme(palette).panel, '#181818');
});

test('extraction is deterministic for mixed images and insensitive to pixel ordering', () => {
  const data = pixels(
    [12, 70, 100, 300],
    [47, 124, 78, 200],
    [210, 175, 90, 120],
    [15, 20, 22, 400]
  );
  const reversed = Uint8ClampedArray.from(
    Array.from({ length: data.length / 4 }, (_, i) => Array.from(data.slice(i * 4, i * 4 + 4)))
      .reverse()
      .flat()
  );
  assert.deepEqual(A.fromPixels(data), A.fromPixels(reversed));
});

test('stored palette validation excludes malformed colors and CSS injection', () => {
  for (const palette of [
    null,
    { version: 1, seed: 'red;display:none', mood: 'dark' },
    { version: 1, seed: '#123456', mood: 'evil' },
    { version: 99, seed: '#123456', mood: 'dark' }
  ]) {
    assert.equal(A.normalize(palette), null);
  }
  const valid = A.normalize({
    version: 1,
    seed: '#ABCDEF',
    mood: 'light',
    swatches: ['#123456', 'url(evil)'],
    surface: 'red;display:none'
  });
  assert.equal(valid.seed, '#abcdef');
  assert.equal('surface' in valid, false);
  assert.deepEqual(valid.swatches, ['#123456']);
});

test('automatic image mode, manual presets, and returning to a gradient resolve consistently', () => {
  assert.equal(typeof P.resolveTheme, 'function');
  const image = {
    dataUrl: 'data:image/png;base64,AA==',
    palette: A.fromPixels(pixels([20, 70, 190]))
  };
  const auto = P.normalizeSettings({ backgroundMode: 'image', themeId: 'sakura' });
  assert.equal(auto.imagePaletteMode, 'auto');
  assert.equal(P.resolveTheme(auto, image).id, 'image');
  const manual = P.selectPreset(auto, 'ember');
  assert.equal(manual.imagePaletteMode, 'manual');
  assert.equal(P.resolveTheme(manual, image).id, 'ember');
  assert.equal(P.resolveTheme({ ...auto, backgroundMode: 'theme' }, image).id, 'sakura');
  assert.equal(P.resolveTheme(auto, { ...image, palette: null }).id, 'sakura');
  assert.equal(P.resolveTheme(auto, { ...image, dataUrl: 'url(evil)' }).id, 'sakura');
  assert.equal(
    P.selectPreset(P.DEFAULTS, 'sakura').imagePaletteMode,
    'auto',
    'selecting a gradient keeps future image matching enabled'
  );
});

test('readability protection covers text and links over either extreme behind translucent panels', () => {
  assert.equal(typeof P.readability, 'function');
  const mix = (front, back, a) =>
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(front.slice(i, i + 2), 16) * a + parseInt(back.slice(i, i + 2), 16) * (1 - a)
        )
          .toString(16)
          .padStart(2, '0')
      )
      .join('');
  const image = {
    dataUrl: 'data:image/png;base64,AA==',
    palette: A.fromPixels(pixels([12, 95, 118]))
  };
  for (const themeId of P.THEMES.map((t) => t.id))
    for (const dim of [0, 30, 80])
      for (const imagePaletteMode of ['auto', 'manual']) {
        const s = {
          themeId,
          backgroundMode: 'image',
          imagePaletteMode,
          dim,
          surfaceOpacity: 65,
          accent: '#ffff00'
        };
        const r = P.readability(s, image),
          t = P.resolveTheme(s, image);
        const top = Math.round(255 * (1 - dim / 100))
          .toString(16)
          .padStart(2, '0');
        for (const base of [t.panel, t.surface])
          for (const under of ['#000000', '#' + top.repeat(3)]) {
            const bg = mix(base, under, r.opacity / 100);
            for (const surface of [bg, mix(r.accent, bg, 0.13)])
              for (const fg of [r.text, r.muted, r.accent]) {
                assert.ok(
                  P.contrast(fg, surface) >= 4.5,
                  `${themeId} ${imagePaletteMode} dim ${dim} ${fg} on ${surface}`
                );
              }
          }
        assert.ok(r.opacity >= 65 && r.opacity <= 100);
        const vars = P.buildVariables(s, image);
        assert.equal(vars['--prism-accent'], r.accent);
        assert.equal(vars['--prism-text'], r.text);
        assert.ok(P.contrast(vars['--prism-accent'], vars['--prism-accent-ink']) >= 4.5);
      }
});

test('the RGB color range generates valid themes with readable text and action labels', () => {
  for (const r of [0, 85, 170, 255])
    for (const g of [0, 85, 170, 255])
      for (const b of [0, 85, 170, 255]) {
        const palette = A.fromPixels(pixels([r, g, b]));
        const image = { dataUrl: 'data:image/png;base64,AA==', palette };
        const settings = {
          backgroundMode: 'image',
          imagePaletteMode: 'auto',
          dim: 0,
          surfaceOpacity: 65
        };
        const t = P.resolveTheme(settings, image),
          safe = P.readability(settings, image),
          v = P.buildVariables(settings, image);
        for (const key of ['bg', 'panel', 'surface', 'text', 'muted', 'accent', 'border'])
          assert.match(t[key], /^#[0-9a-f]{6}$/);
        for (const bg of [t.panel, t.surface])
          for (const fg of [safe.text, safe.muted, safe.accent])
            assert.ok(P.contrast(fg, bg) >= 4.5, `${r},${g},${b}: ${fg} on ${bg}`);
        assert.ok(P.contrast(v['--prism-accent'], v['--prism-accent-ink']) >= 4.5);
        for (const family of [
          'gray',
          'brown',
          'orange',
          'yellow',
          'green',
          'blue',
          'purple',
          'pink',
          'red'
        ]) {
          assert.ok(
            P.contrast(v[`--prism-label-${family}-ink`], v[`--prism-label-${family}-bg`]) >= 4.5,
            `${r},${g},${b}: ${family} label`
          );
        }
      }
});
