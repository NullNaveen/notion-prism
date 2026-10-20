const test = require('node:test');
const assert = require('node:assert/strict');
let P;
try {
  P = require('../extension/core.js');
} catch {
  P = {};
}

test('corrupted settings fall back without retaining unknown fields', () => {
  assert.equal(typeof P.normalizeSettings, 'function');
  const s = P.normalizeSettings({
    themeId: 'missing',
    dim: 999,
    blur: -1,
    positionX: NaN,
    surfaceOpacity: 0,
    accent: 'red;display:none',
    junk: 1,
    enabled: 'false'
  });
  assert.equal(s.themeId, 'aurora');
  assert.equal(s.dim, 80);
  assert.equal(s.blur, 0);
  assert.equal(s.positionX, 50);
  assert.equal(s.surfaceOpacity, 65);
  assert.equal(s.accent, '');
  assert.equal(s.enabled, true);
  assert.equal('junk' in s, false);
});

test('all curated reading surfaces have accessible text and muted text', () => {
  assert.ok(P.THEMES?.length >= 8);
  for (const t of P.THEMES) {
    assert.ok(P.contrast(t.text, t.surface) >= 4.5, t.name + ' text');
    assert.ok(P.contrast(t.muted, t.surface) >= 4.5, t.name + ' muted');
    assert.ok(P.contrast(t.text, t.panel) >= 4.5, t.name + ' sidebar');
  }
});

test('invalid background data never becomes CSS', () => {
  assert.equal(typeof P.buildVariables, 'function');
  const settings = { ...P.DEFAULTS, backgroundMode: 'image' };
  const v = P.buildVariables(settings, { dataUrl: 'https://evil.test/a");}body{display:none' });
  assert.equal(v['--prism-wallpaper'], P.getTheme('aurora').gradient);
  assert.equal(v['--prism-overlay'], 'transparent');
});

test('image controls and custom accent create bounded CSS values', () => {
  assert.equal(typeof P.buildVariables, 'function');
  const v = P.buildVariables(
    { backgroundMode: 'image', dim: 40, blur: 12, positionX: 25, positionY: 70, accent: '#aaff11' },
    { dataUrl: 'data:image/webp;base64,UklGRg==' }
  );
  assert.equal(v['--prism-wallpaper'], 'none'); // The media layer supplies a short Blob URL.
  assert.equal(v['--prism-overlay'], 'rgba(0, 0, 0, 0.4)');
  assert.equal(v['--prism-blur'], '12px');
  assert.equal(v['--prism-position'], '25% 70%');
  assert.ok(P.contrast(v['--prism-accent'], v['--prism-accent-ink']) >= 4.5);
});

test('image framing shows the whole image by default and permits intentional cropping', () => {
  const image = { dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' };
  assert.equal(P.buildVariables({ backgroundMode: 'image' }, image)['--prism-size'], 'contain');
  assert.equal(
    P.buildVariables({ backgroundMode: 'image', imageFit: 'cover' }, image)['--prism-size'],
    'cover'
  );
  assert.equal(
    P.buildVariables({ backgroundMode: 'image', imageFit: 'bad;display:none' }, image)[
      '--prism-size'
    ],
    'contain'
  );
  assert.equal(
    P.buildVariables({ backgroundMode: 'theme', imageFit: 'contain' }, image)['--prism-size'],
    'cover'
  );
});

test('stretch shows the entire source at both screen edges for images and videos', () => {
  for (const mime of ['image/png', 'image/gif', 'video/mp4']) {
    const v = P.buildVariables(
      { backgroundMode: 'image', imageFit: 'fill' },
      { dataUrl: `data:${mime};base64,AAAA` }
    );
    assert.equal(v['--prism-size'], '100% 100%');
    assert.equal(v['--prism-object-fit'], 'fill');
  }
  const metrics = P.framingMetrics(
    { width: 720, height: 1280 },
    { imageFit: 'fill' },
    2292,
    851,
    2
  );
  assert.equal(metrics.visibleFraction, 1);
  assert.equal(metrics.pixelScale, (2292 / 720) * 2);
  assert.equal(metrics.distorted, true);
});

test('coordinating document colors defaults on and an explicit opt-out persists', () => {
  assert.equal(P.normalizeSettings().matchTextColors, true);
  assert.equal(P.normalizeSettings({ matchTextColors: false }).matchTextColors, false);
  assert.equal(P.normalizeSettings({ matchTextColors: 'false' }).matchTextColors, true);
  assert.equal(P.normalizeSettings({ imageFit: 'fill' }).imageFit, 'fill');
});

test('whole-image fitting can fill unused space without changing the foreground framing', () => {
  const image = { dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' };
  assert.equal(P.normalizeSettings({}).fitBackdrop, true);
  assert.equal(P.normalizeSettings({ fitBackdrop: false }).fitBackdrop, false);
  assert.equal(P.normalizeSettings({ fitBackdrop: 'false' }).fitBackdrop, true);
  assert.equal(
    P.buildVariables({ backgroundMode: 'image', fitBackdrop: true }, image)['--prism-size'],
    'contain'
  );
  assert.equal(
    P.buildVariables({ backgroundMode: 'image', fitBackdrop: false }, image)['--prism-size'],
    'contain'
  );
});

test('original backgrounds above the old storage cap remain usable but malformed data is rejected', () => {
  assert.equal(P.isImageDataURL('data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024)), true);
  assert.equal(P.isImageDataURL('data:image/png;base64,' + 'A'.repeat(29 * 1024 * 1024)), false);
  assert.equal(P.isImageDataURL('data:image/gif;base64,AAAA\");color:red'), false);
});

test('video backgrounds retain the image palette and dimming while using a video layer', () => {
  const image = { dataUrl: 'data:video/mp4;base64,AAAA' };
  assert.equal(P.isVideoDataURL(image.dataUrl), true);
  assert.equal(P.isMediaDataURL(image.dataUrl), true);
  const v = P.buildVariables({ backgroundMode: 'image', dim: 20 }, image);
  assert.equal(v['--prism-overlay'], 'rgba(0, 0, 0, 0.2)');
  assert.equal(v['--prism-size'], 'contain');
  assert.ok(!v['--prism-wallpaper'].includes('data:video'));
  assert.equal(P.isVideoDataURL('data:text/html;base64,AAAA'), false);
});

test('orientation accepts only quarter turns and automatic landscape fitting can be disabled', () => {
  assert.equal(P.normalizeSettings({}).autoLandscape, true);
  for (const angle of [0, 90, 180, 270])
    assert.equal(P.normalizeSettings({ imageRotation: angle }).imageRotation, angle);
  for (const angle of [-90, 45, 360, '90', NaN])
    assert.equal(P.normalizeSettings({ imageRotation: angle }).imageRotation, 0);
  assert.equal(P.normalizeSettings({ autoLandscape: false }).autoLandscape, false);
});

test('semantic database labels retain readable colors across all curated themes', () => {
  for (const theme of P.THEMES) {
    const v = P.buildVariables({ themeId: theme.id });
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
      assert.ok(v[`--prism-label-${family}-bg`], `${theme.id} ${family} exists`);
      assert.ok(
        P.contrast(v[`--prism-label-${family}-ink`], v[`--prism-label-${family}-bg`]) >= 4.5,
        `${theme.id} ${family} contrast`
      );
    }
  }
});

test('quality estimate explains the supplied portrait clip on an ultrawide window', () => {
  const image = { width: 720, height: 1280 };
  const fill = P.framingMetrics(image, { imageFit: 'cover' }, 2292, 851, 1);
  assert.ok(Math.abs(fill.pixelScale - 3.1833) < 0.001);
  assert.ok(fill.visibleFraction > 0.2 && fill.visibleFraction < 0.22);
  const fit = P.framingMetrics(image, { imageFit: 'contain' }, 2292, 851, 1);
  assert.ok(fit.pixelScale < 1);
  assert.equal(fit.visibleFraction, 1);
});

test('quality estimate accounts for screen density and rotation without changing source dimensions', () => {
  const image = { width: 720, height: 1280 };
  const rotated = P.framingMetrics(image, { imageFit: 'contain', imageRotation: 90 }, 1280, 720, 2);
  assert.equal(rotated.pixelScale, 2);
  assert.equal(rotated.visibleFraction, 1);
  assert.deepEqual(image, { width: 720, height: 1280 });
  assert.equal(P.framingMetrics({ width: 0, height: 1280 }, {}, 1440, 900, 1), null);
});
