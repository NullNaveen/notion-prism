(function (root) {
  'use strict';
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const hex = (channels) =>
    '#' +
    channels
      .map((n) =>
        Math.round(clamp(n, 0, 255))
          .toString(16)
          .padStart(2, '0')
      )
      .join('');
  const rgb = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const linear = (n) => {
    n /= 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const encoded = (n) => 255 * (n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055);

  // Oklab separates perceived lightness from hue/chroma. Its conversion matrices
  // are documented at https://bottosson.github.io/posts/oklab/.
  function lab(channels) {
    const [r, g, b] = channels.map(linear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ];
  }
  function linearFromLab(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ];
  }
  function tone(L, C, hue) {
    // Reduce chroma into sRGB while keeping hue and lightness, avoiding clipping
    // that would turn saturated blues, reds or greens into an unrelated hue.
    let lo = 0,
      hi = C;
    for (let i = 0; i < 18; i++) {
      const c = (lo + hi) / 2;
      const values = linearFromLab(L, Math.cos(hue) * c, Math.sin(hue) * c);
      if (values.every((v) => v >= 0 && v <= 1)) lo = c;
      else hi = c;
    }
    return hex(
      linearFromLab(L, Math.cos(hue) * lo, Math.sin(hue) * lo).map((v) => encoded(clamp(v)))
    );
  }
  const distance = (a, b) => a.reduce((n, v, i) => n + (v - b[i]) ** 2, 0);
  const validHex = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  function normalize(value) {
    if (
      !value ||
      value.version !== 1 ||
      !validHex(value.seed) ||
      !['light', 'dark'].includes(value.mood)
    )
      return null;
    return {
      version: 1,
      seed: value.seed.toLowerCase(),
      mood: value.mood,
      swatches: Array.isArray(value.swatches)
        ? value.swatches
            .filter(validHex)
            .slice(0, 6)
            .map((c) => c.toLowerCase())
        : [value.seed.toLowerCase()]
    };
  }

  function fromPixels(data) {
    const bins = new Map();
    const step = Math.max(1, Math.ceil((data?.length || 0) / 4 / 16384)) * 4;
    for (let i = 0; i + 3 < (data?.length || 0); i += step) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (![r, g, b, a].every(Number.isFinite) || a < 16) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      if (!bins.has(key)) bins.set(key, { key, weight: 0, sum: [0, 0, 0] });
      const bin = bins.get(key);
      bin.weight += a;
      [r, g, b].forEach((c, j) => (bin.sum[j] += c * a));
    }
    const points = [...bins.values()]
      .sort((a, b) => a.key - b.key)
      .map((bin) => {
        const channels = bin.sum.map((n) => n / bin.weight);
        return { ...bin, rgb: channels, lab: lab(channels) };
      });
    if (!points.length) return { version: 1, seed: '#808080', mood: 'dark', swatches: ['#808080'] };
    const total = points.reduce((sum, p) => sum + p.weight, 0);
    const first = [...points].sort((a, b) => b.weight - a.weight || a.key - b.key)[0];
    let centers = [first.lab];
    while (centers.length < 6) {
      let best = null,
        score = 0;
      for (const p of points) {
        const candidate = Math.min(...centers.map((c) => distance(c, p.lab))) * Math.sqrt(p.weight);
        if (candidate > score) {
          score = candidate;
          best = p;
        }
      }
      if (!best || score < 1e-8) break;
      centers.push(best.lab);
    }
    function groups() {
      const result = centers.map(() => ({ weight: 0, lab: [0, 0, 0], rgb: [0, 0, 0] }));
      for (const p of points) {
        let index = 0,
          best = Infinity;
        centers.forEach((c, i) => {
          const d = distance(c, p.lab);
          if (d < best) {
            best = d;
            index = i;
          }
        });
        const group = result[index];
        group.weight += p.weight;
        for (let j = 0; j < 3; j++) {
          group.lab[j] += p.lab[j] * p.weight;
          group.rgb[j] += p.rgb[j] * p.weight;
        }
      }
      return result
        .filter((g) => g.weight)
        .map((g) => ({
          ...g,
          lab: g.lab.map((n) => n / g.weight),
          rgb: g.rgb.map((n) => n / g.weight)
        }));
    }
    for (let i = 0; i < 10; i++) centers = groups().map((g) => g.lab);
    const clusters = groups().sort(
      (a, b) => b.weight - a.weight || hex(a.rgb).localeCompare(hex(b.rgb))
    );
    const chroma = (g) => Math.hypot(g.lab[1], g.lab[2]);
    const colored = clusters.filter((g) => g.weight / total >= 0.015 && chroma(g) >= 0.018);
    const candidates = colored.length ? colored : clusters;
    const seed = [...candidates].sort(
      (a, b) => b.weight * (0.05 + 2 * chroma(b)) - a.weight * (0.05 + 2 * chroma(a))
    )[0];
    const lightness = points.reduce((sum, p) => sum + p.lab[0] * p.weight, 0) / total;
    return {
      version: 1,
      seed: hex(seed.rgb),
      mood: lightness >= 0.7 ? 'light' : 'dark',
      swatches: clusters.map((g) => hex(g.rgb))
    };
  }

  function toTheme(value) {
    const palette = normalize(value);
    if (!palette) return null;
    const [, a, b] = lab(rgb(palette.seed));
    const C = Math.hypot(a, b),
      hue = Math.atan2(b, a),
      neutral = C < 0.01;
    const surfaceChroma = neutral ? 0 : clamp(C * 0.18, 0.012, 0.032);
    const accentChroma = neutral ? 0 : clamp(C, 0.08, 0.17);
    const dark = palette.mood === 'dark';
    const color = (L, c = surfaceChroma) => tone(L, c, hue);
    const bg = color(dark ? 0.16 : 0.94),
      panel = color(dark ? 0.21 : 0.97),
      surface = color(dark ? 0.255 : 0.99);
    return {
      id: 'image',
      name: 'Image palette',
      mood: palette.mood,
      description: 'A palette drawn from your background.',
      seed: palette.seed,
      bg,
      panel,
      surface,
      text: color(dark ? 0.96 : 0.22, neutral ? 0 : 0.012),
      muted: color(dark ? 0.79 : 0.44, neutral ? 0 : 0.035),
      accent: color(dark ? 0.82 : 0.43, accentChroma),
      border: color(dark ? 0.52 : 0.72, neutral ? 0 : 0.045),
      gradient: `linear-gradient(135deg, ${bg}, ${panel})`
    };
  }
  const api = { fromPixels, normalize, toTheme };
  root.PrismPalette = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
