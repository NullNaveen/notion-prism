(async function () {
  const P = globalThis.Prism,
    S = globalThis.PrismStorage,
    $ = (id) => document.getElementById(id);
  let settings = { ...P.DEFAULTS },
    image = null;
  function render() {
    const t = P.resolveTheme(settings, image);
    Object.entries(P.buildVariables(settings, image)).forEach(([key, value]) =>
      $('popup-hero').style.setProperty(key, value)
    );
    $('enabled').checked = settings.enabled;
    $('active-theme').textContent = settings.enabled
      ? t.name +
        ' · ' +
        (t.id === 'image'
          ? 'Automatic'
          : settings.backgroundMode === 'image'
            ? 'Manual + image'
            : 'Active')
      : 'Prism is paused';
    $('match-image').hidden =
      !P.isMediaDataURL(image?.dataUrl) || !globalThis.PrismPalette.normalize(image?.palette);
    $('match-image').setAttribute('aria-pressed', String(t.id === 'image'));
    document
      .querySelectorAll('[data-theme]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.theme === t.id)));
  }
  async function save(patch) {
    settings = P.normalizeSettings({ ...settings, ...patch });
    render();
    $('status').textContent = 'Saving…';
    try {
      await S.saveSettings(settings);
      $('status').textContent = 'Saved on this device';
    } catch {
      $('status').textContent = 'Could not save. Try again.';
    }
  }
  P.THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'theme-card';
    b.dataset.theme = t.id;
    b.setAttribute('aria-label', t.name + ' — ' + t.mood + ' theme');
    b.innerHTML =
      '<span class="theme-art"></span><span class="theme-label"></span><span class="theme-check" aria-hidden="true">✓</span>';
    b.querySelector('.theme-art').style.background = t.gradient;
    b.querySelector('.theme-label').textContent = t.name;
    b.addEventListener('click', () => save(P.selectPreset(settings, t.id)));
    $('theme-grid').append(b);
  });
  $('match-image').addEventListener('click', () =>
    save({ imagePaletteMode: 'auto', backgroundMode: 'image', accent: '' })
  );
  $('enabled').addEventListener('change', () => save({ enabled: $('enabled').checked }));
  $('open-studio').addEventListener('click', () => {
    if (S.isExtension) chrome.runtime.openOptionsPage();
    else window.open('studio.html', '_blank', 'noopener');
  });
  $('open-notion').addEventListener('click', () => {
    if (S.isExtension) chrome.tabs.create({ url: 'https://www.notion.so' });
    else window.open('https://www.notion.so', '_blank', 'noopener');
  });
  try {
    ({ settings, image } = await S.read());
  } catch {
    $('status').textContent = 'Storage unavailable';
  }
  render();
  S.subscribe((data) => {
    if (data.settings) settings = data.settings;
    if ('image' in data) image = data.image;
    render();
  });
})();
