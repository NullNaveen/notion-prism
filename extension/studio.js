(async function () {
  'use strict';
  const P = globalThis.Prism,
    S = globalThis.PrismStorage,
    I = globalThis.PrismImages;
  const $ = (id) => document.getElementById(id);
  let previewMedia = globalThis.PrismMedia.mount($('preview-wallpaper'), (message) =>
    showImport(message, true)
  );
  let settings = { ...P.DEFAULTS },
    image = null,
    filter = 'all',
    saveTimer,
    pendingImport = null,
    importing = false,
    linkEditorOpen = false,
    localRevision = 0,
    lastSavedRevision = 0;
  const settingRevisions = new Map(),
    localSettingRevisions = new Map();
  const grid = $('theme-grid');
  function renderQuality() {
    if (!image) return;
    if (!image.original) {
      $('image-quality-help').textContent =
        'This image was saved by an older version. Replace it with the original file to restore lost detail or animation.';
      return;
    }
    const metrics = P.framingMetrics(
      image,
      settings,
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1
    );
    const notes = ['Source file saved without resizing or recompression.'];
    if (metrics) {
      if (metrics.pixelScale > 1.05) {
        notes.push(
          `At this window size and screen density, the ${image.width} × ${image.height} source is enlarged ${metrics.pixelScale.toFixed(1)}×, so it can look soft.`
        );
        if (settings.imageFit === 'cover' && metrics.visibleFraction < 0.95)
          notes.push(
            `Fill shows about ${Math.round(metrics.visibleFraction * 100)}% of the frame. Choose Show entire image to reduce enlargement and show every edge.`
          );
        else notes.push('A sharper result at this size needs a higher-resolution source.');
      } else notes.push('The source has enough pixels for this window size and screen density.');
    }
    if (metrics?.distorted)
      notes.push(
        'Stretch uses different horizontal and vertical scales; shapes will look wider or taller.'
      );
    if (settings.blur)
      notes.push(`Soft focus also adds ${settings.blur} px of blur. Clear dim & blur removes it.`);
    $('image-quality-help').textContent = notes.join(' ');
  }
  function renderThemes() {
    grid.replaceChildren();
    P.THEMES.filter((t) => filter === 'all' || t.mood === filter).forEach((t) => {
      const button = document.createElement('button');
      button.className = 'theme-card';
      button.dataset.theme = t.id;
      button.setAttribute('aria-pressed', String(t.id === P.resolveTheme(settings, image).id));
      button.setAttribute('aria-label', t.name + ' — ' + t.mood + ' theme');
      // This markup is packaged UI only. User supplied strings are always assigned with textContent.
      button.innerHTML =
        '<span class="theme-art"><span class="mini-window"><span class="mini-sidebar"></span><span class="mini-page"><i></i><i></i><i></i></span></span></span><span class="theme-label"><span></span><small></small></span><span class="theme-check" aria-hidden="true">✓</span>';
      button.querySelector('.theme-art').style.background = t.gradient;
      button.style.setProperty('--mini-panel', t.panel + 'eb');
      button.style.setProperty('--mini-surface', t.surface + 'e6');
      button.style.setProperty('--mini-text', t.text);
      button.querySelector('.theme-label span').textContent = t.name;
      button.querySelector('.theme-label small').textContent = t.mood === 'dark' ? 'Dark' : 'Light';
      button.addEventListener('click', () => {
        const next = P.selectPreset(settings, t.id);
        change({
          themeId: next.themeId,
          accent: next.accent,
          imagePaletteMode: next.imagePaletteMode
        });
      });
      grid.append(button);
    });
  }
  function render() {
    const t = P.resolveTheme(settings, image),
      safe = P.readability(settings, image);
    Object.entries(P.buildVariables(settings, image)).forEach(([key, value]) =>
      $('preview-window').style.setProperty(key, value)
    );
    previewMedia.update(image, settings);
    $('preview-window').style.colorScheme = t.mood;
    $('preview-theme-name').textContent =
      t.name + (settings.backgroundMode === 'image' && image ? ' + your image' : '');
    $('theme-description').textContent = t.description;
    document
      .querySelectorAll('[data-theme]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.theme === t.id)));
    $('palette-swatches').replaceChildren(
      ...[safe.accent, safe.muted, t.panel, t.surface].map((color) => {
        const swatch = document.createElement('i');
        swatch.style.background = color;
        return swatch;
      })
    );
    const automatic = settings.imagePaletteMode === 'auto';
    $('palette-auto').setAttribute('aria-pressed', String(automatic));
    $('palette-manual').setAttribute('aria-pressed', String(!automatic));
    $('palette-mode-help').textContent = automatic
      ? t.id === 'image'
        ? `A ${t.mood} palette sampled from your image. Text, panels, and accents match automatically.`
        : 'Add an image to create matching text, panels, and accents.'
      : `Keep ${P.getTheme(settings.themeId).name} and your chosen accent, even when you replace the image.`;
    $('choose-preset').hidden = automatic;
    $('auto-theme-notice').hidden = t.id !== 'image';
    const sourcePalette = globalThis.PrismPalette.normalize(image?.palette);
    $('image-palette-swatches').hidden = !sourcePalette;
    $('image-palette-swatches').replaceChildren(
      ...(sourcePalette?.swatches || []).map((color) => {
        const swatch = document.createElement('i');
        swatch.style.background = color;
        swatch.title = color;
        return swatch;
      })
    );
    $('contrast-help').textContent =
      (safe.protected
        ? `Reading panels use ${safe.opacity}% opacity to keep text and links readable.`
        : 'Reading panels protect text contrast.') +
      ' Tables and boards stay transparent, with protected text and status labels.';
    $('match-text-colors').checked = settings.matchTextColors;
    $('enabled').checked = settings.enabled;
    $('enabled-text').textContent = settings.enabled ? 'on' : 'off';
    $('enabled-help').textContent = settings.enabled
      ? 'A little color, everywhere in Notion.'
      : 'Your original Notion appearance.';
    $('paused-overlay').hidden = settings.enabled;
    $('gradient-mode').setAttribute('aria-pressed', String(settings.backgroundMode === 'theme'));
    $('image-mode').setAttribute('aria-pressed', String(settings.backgroundMode === 'image'));
    $('fit-image').setAttribute('aria-pressed', String(settings.imageFit === 'contain'));
    $('fill-image').setAttribute('aria-pressed', String(settings.imageFit === 'cover'));
    $('stretch-image').setAttribute('aria-pressed', String(settings.imageFit === 'fill'));
    for (const key of ['positionX', 'positionY']) $(key).disabled = settings.imageFit === 'fill';
    $('fit-backdrop').checked = settings.fitBackdrop;
    $('fit-backdrop-control').hidden = settings.imageFit !== 'contain';
    $('framing-help').textContent =
      settings.imageFit === 'fill'
        ? 'Stretch shows the entire image edge to edge, without cropping or gaps. Its proportions change to match the window; choose Show entire image to restore them.'
        : settings.imageFit === 'contain'
          ? settings.fitBackdrop
            ? 'Show the entire image without cropping or distortion. A soft copy fills any extra space.'
            : 'Show the entire image without cropping or distortion. Different proportions leave margins; enable the soft backdrop to fill them.'
          : 'Fill every edge while keeping the image proportional. Some edges are cropped; use the position sliders to choose what stays visible.';
    const portrait = image && image.height > image.width,
      rotated = settings.imageRotation !== 0;
    $('auto-landscape').checked = settings.autoLandscape;
    $('orientation-help').textContent = rotated
      ? `Rotated ${settings.imageRotation}° for display. The subject rotates too. Your original file is unchanged.`
      : settings.imageFit === 'fill'
        ? 'Stretched to fit the window. The subject stays upright but may look wider or taller. Revert restores the original proportions.'
        : portrait && settings.imageFit === 'cover'
          ? 'Adjusted to landscape with cropping. The subject stays upright; the top and bottom may be hidden. Revert shows the whole portrait without cropping.'
          : portrait
            ? 'Portrait source. Fill screen creates an upright landscape crop. Rotate turns the entire image or video sideways.'
            : 'Original orientation. Rotate changes the display only; the source file stays intact.';
    $('revert-orientation').hidden =
      !rotated && settings.imageFit !== 'fill' && !(portrait && settings.imageFit === 'cover');
    const video = P.isVideoDataURL(image?.dataUrl);
    $('video-playback').hidden = !video;
    $('video-help').hidden = !video;
    $('video-playback').textContent = settings.videoPlaying
      ? 'Pause background'
      : 'Play background';
    document.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      input.value = settings[key];
      $(key + '-value').textContent = settings[key] + (key === 'blur' ? ' px' : '%');
    });
    $('accent').value = settings.accent || t.accent;
    $('accent-hex').textContent = (settings.accent || t.accent).toUpperCase();
    $('current-image').hidden = !image;
    $('image-controls').hidden = !image;
    $('drop-zone').hidden = !!image;
    $('link-divider').hidden = !!image;
    $('url-editor').hidden = !!image && !linkEditorOpen;
    $('cancel-replace').hidden = !image;
    $('import-label').textContent = importing
      ? 'Importing…'
      : image
        ? 'Replace background'
        : 'Use image';
    if (image) {
      const thumbnail = video ? image.thumbnail : image.dataUrl;
      if (P.isImageDataURL(thumbnail)) {
        if ($('image-thumbnail').getAttribute('src') !== thumbnail)
          $('image-thumbnail').src = thumbnail;
      } else $('image-thumbnail').removeAttribute('src');
      $('image-name').textContent = image.name || 'Your image';
      $('image-size').textContent =
        image.width +
        ' × ' +
        image.height +
        (image.bytes ? ' · ' + (image.bytes / 1048576).toFixed(2) + ' MB' : '') +
        ' · saved locally';
      renderQuality();
    } else {
      $('image-thumbnail').removeAttribute('src');
    }
  }
  async function persist(revision = localRevision) {
    clearTimeout(saveTimer);
    saveTimer = null;
    const snapshot = { ...settings };
    try {
      await S.saveSettings(snapshot);
      lastSavedRevision = Math.max(lastSavedRevision, revision);
      if (revision === localRevision)
        $('save-status').textContent = S.isExtension
          ? 'Saved on this device'
          : 'Saved in preview only';
    } catch (error) {
      $('save-status').textContent = 'Could not save. Please try again.';
      console.error('Prism: settings could not be saved', error);
    }
  }
  function change(patch) {
    settings = P.normalizeSettings({ ...settings, ...patch });
    localRevision++;
    Object.keys(patch).forEach((key) => {
      settingRevisions.set(key, localRevision);
      localSettingRevisions.set(key, localRevision);
    });
    render();
    $('save-status').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(localRevision), 180);
  }
  async function commitImage(nextImage, makePatch = () => ({})) {
    const revision = localRevision,
      next = P.normalizeSettings({ ...settings, ...makePatch(settings) });
    clearTimeout(saveTimer);
    saveTimer = null;
    await S.saveImage(nextImage, next);
    image = nextImage;
    if (localRevision === revision) {
      settings = next;
      localRevision++;
      lastSavedRevision = localRevision;
    } else {
      // An import must not undo a newer theme, accent, or background choice.
      const patch = Object.fromEntries(
        Object.entries(makePatch(settings)).filter(
          ([key]) => (settingRevisions.get(key) || 0) <= revision
        )
      );
      settings = P.normalizeSettings({ ...settings, ...patch });
      localRevision++;
      await persist(localRevision);
    }
    if (localRevision === lastSavedRevision)
      $('save-status').textContent = S.isExtension
        ? 'Saved on this device'
        : 'Saved in preview only';
  }
  function showTab(name, focus = false) {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $(button.dataset.tab + '-panel').hidden = !active;
      if (active && focus) button.focus();
    });
  }
  document
    .querySelectorAll('[data-tab]')
    .forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
  document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-tab]')];
    let index = tabs.indexOf(document.activeElement);
    index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    showTab(tabs[index].dataset.tab, true);
  });
  document.querySelectorAll('[data-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((el) => {
        const active = el === button;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
      });
      renderThemes();
    })
  );
  document
    .querySelectorAll('[data-setting]')
    .forEach((input) =>
      input.addEventListener('input', () =>
        change({ [input.dataset.setting]: Number(input.value) })
      )
    );
  $('enabled').addEventListener('change', () => change({ enabled: $('enabled').checked }));
  $('accent').addEventListener('input', () => change({ accent: $('accent').value }));
  $('reset-accent').addEventListener('click', () => change({ accent: '' }));
  $('reset-settings').addEventListener('click', () => change({ ...P.DEFAULTS }));
  $('fit-image').addEventListener('click', () =>
    change({ imageFit: 'contain', positionX: 50, positionY: 50 })
  );
  window.addEventListener('resize', renderQuality);
  $('fit-backdrop').addEventListener('change', () =>
    change({ fitBackdrop: $('fit-backdrop').checked })
  );
  $('fill-image').addEventListener('click', () => change({ imageFit: 'cover' }));
  $('stretch-image').addEventListener('click', () =>
    change({ imageFit: 'fill', positionX: 50, positionY: 50 })
  );
  $('match-text-colors').addEventListener('change', () =>
    change({ matchTextColors: $('match-text-colors').checked })
  );
  $('clear-image-effects').addEventListener('click', () => change({ dim: 0, blur: 0 }));
  $('video-playback').addEventListener('click', () =>
    change({ videoPlaying: !settings.videoPlaying })
  );
  $('auto-landscape').addEventListener('change', () =>
    change({ autoLandscape: $('auto-landscape').checked })
  );
  $('rotate-left').addEventListener('click', () =>
    change({
      imageRotation: (settings.imageRotation + 270) % 360,
      imageFit: 'contain',
      positionX: 50,
      positionY: 50
    })
  );
  $('rotate-right').addEventListener('click', () =>
    change({
      imageRotation: (settings.imageRotation + 90) % 360,
      imageFit: 'contain',
      positionX: 50,
      positionY: 50
    })
  );
  $('revert-orientation').addEventListener('click', () =>
    change({ imageRotation: 0, imageFit: 'contain', positionX: 50, positionY: 50 })
  );
  $('palette-auto').addEventListener('click', () =>
    change({ imagePaletteMode: 'auto', accent: '', ...(image ? { backgroundMode: 'image' } : {}) })
  );
  $('palette-manual').addEventListener('click', () => change({ imagePaletteMode: 'manual' }));
  $('choose-preset').addEventListener('click', () => showTab('themes', true));
  $('gradient-mode').addEventListener('click', () => change({ backgroundMode: 'theme' }));
  $('image-mode').addEventListener('click', () => {
    if (image) change({ backgroundMode: 'image' });
    else {
      showImport('Choose an image or paste a link to get started.');
      $('image-file').focus();
    }
  });
  function showImport(message, error = false) {
    $('import-status').textContent = message;
    $('import-status').classList.toggle('error', error);
  }
  function busy(value) {
    importing = value;
    [
      'import-button',
      'image-file',
      'image-url',
      'grant-button',
      'remove-image',
      'replace-image',
      'replace-link',
      'cancel-replace'
    ].forEach((id) => ($(id).disabled = value));
    $('url-form').setAttribute('aria-busy', String(value));
    $('import-label').textContent = value
      ? 'Importing…'
      : image
        ? 'Replace background'
        : 'Use image';
    if (!value && image && !linkEditorOpen) $('replace-image').focus();
  }
  async function acceptImage(blob, name, sourceUrl = '') {
    const result = await I.prepareFile(blob, name, sourceUrl);
    await commitImage(result, (current) => ({
      backgroundMode: 'image',
      imageRotation: 0,
      positionX: 50,
      positionY: 50,
      ...(current.autoLandscape
        ? {
            imageFit:
              result.height > result.width &&
              $('preview-window').clientWidth > $('preview-window').clientHeight
                ? 'cover'
                : 'contain'
          }
        : {}),
      ...(current.imagePaletteMode === 'auto' ? { accent: '' } : {})
    }));
    linkEditorOpen = false;
    render();
    showImport(
      (P.isVideoDataURL(result.dataUrl)
        ? 'Your video is ready and loops silently. '
        : 'Your background is ready. ') +
        (settings.imagePaletteMode === 'auto'
          ? 'Colors match automatically.'
          : 'Your chosen theme stays in place.')
    );
  }
  async function importFile(file) {
    if (!file || importing) return;
    busy(true);
    showImport('Preparing your image…');
    $('grant-button').hidden = true;
    pendingImport = null;
    try {
      await acceptImage(file, file.name);
    } catch (error) {
      showImport(error.message || 'This image could not be imported.', true);
    } finally {
      busy(false);
      $('image-file').value = '';
    }
  }
  $('image-file').addEventListener('change', (event) => importFile(event.target.files[0]));
  $('replace-image').addEventListener('click', () => {
    if (!importing) $('image-file').click();
  });
  $('replace-link').addEventListener('click', () => {
    linkEditorOpen = true;
    pendingImport = null;
    $('grant-button').hidden = true;
    $('image-url').value = '';
    render();
    showImport('Your current background stays until the new image is ready.');
    $('image-url').focus();
  });
  $('cancel-replace').addEventListener('click', () => {
    linkEditorOpen = false;
    pendingImport = null;
    $('grant-button').hidden = true;
    render();
    showImport('');
    $('replace-link').focus();
  });
  const drop = $('drop-zone');
  ['dragenter', 'dragover'].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('dragging');
    })
  );
  ['dragleave', 'drop'].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.remove('dragging');
    })
  );
  drop.addEventListener('drop', (event) => importFile(event.dataTransfer.files[0]));
  async function remoteFlow(raw, permissionPromise) {
    busy(true);
    showImport(S.isExtension ? 'Allow image access in Chrome if prompted…' : 'Finding your image…');
    $('grant-button').hidden = true;
    try {
      if (!(await permissionPromise))
        throw new Error(
          'Image access was not granted. You can try again or upload the image from your device.'
        );
      showImport('Finding your image…');
      const result = await I.fetchRemote(raw);
      await acceptImage(result.blob, result.name, result.sourceUrl);
      pendingImport = null;
    } catch (error) {
      showImport(
        error.message || 'The image could not be imported. Try a direct image URL or upload it.',
        true
      );
      if (error.requiredOrigins?.length) {
        pendingImport = { raw, origins: error.requiredOrigins };
        $('grant-button').textContent =
          'Allow ' +
          new URL(error.requiredOrigins[0].replace('*', 'image')).hostname +
          ' and retry';
        $('grant-button').hidden = false;
      }
    } finally {
      busy(false);
    }
  }
  $('url-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (importing) return;
    const raw = $('image-url').value.trim();
    pendingImport = null;
    $('grant-button').hidden = true;
    try {
      const origins = I.permissionOrigins(raw);
      // Keep request() in the click/submit event's user gesture, before any await.
      const permission = S.isExtension
        ? chrome.permissions.request({ origins })
        : Promise.resolve(true);
      remoteFlow(raw, permission);
    } catch (error) {
      showImport(error.message, true);
    }
  });
  $('grant-button').addEventListener('click', () => {
    if (!pendingImport || importing) return;
    const { raw, origins } = pendingImport;
    remoteFlow(
      raw,
      S.isExtension ? chrome.permissions.request({ origins }) : Promise.resolve(true)
    );
  });
  $('remove-image').addEventListener('click', async () => {
    if (importing) return;
    busy(true);
    try {
      await commitImage(null, () => ({ backgroundMode: 'theme' }));
      linkEditorOpen = false;
      pendingImport = null;
      $('grant-button').hidden = true;
      render();
      showImport('Image removed from this device.');
    } catch (error) {
      showImport('Could not remove the image. Please try again.', true);
    } finally {
      busy(false);
    }
  });
  addEventListener('pagehide', () => {
    if (saveTimer) persist(localRevision);
  });
  addEventListener('pagehide', () => previewMedia.dispose());
  addEventListener('pageshow', (event) => {
    if (event.persisted) {
      previewMedia = globalThis.PrismMedia.mount($('preview-wallpaper'), (message) =>
        showImport(message, true)
      );
      render();
    }
  });
  $('preview-banner').hidden = S.isExtension;
  $('save-status').textContent = S.isExtension ? 'Saved on this device' : 'Saved in preview only';
  $('preview-import-note').hidden = S.isExtension;
  try {
    ({ settings, image } = await S.read());
  } catch {
    $('save-status').textContent = 'Storage is unavailable. Changes may not save.';
  }
  if (image && !P.isMediaDataURL(image.dataUrl)) image = null;
  renderThemes();
  render();
  S.subscribe((data, event) => {
    if (event?.own) return;
    const patch = Object.fromEntries(
      Object.entries(data.settings || {}).filter(
        ([key, value]) =>
          value !== settings[key] && (localSettingRevisions.get(key) || 0) <= lastSavedRevision
      )
    );
    if (Object.keys(patch).length) {
      settings = P.normalizeSettings({ ...settings, ...patch });
      localRevision++;
      Object.keys(patch).forEach((key) => settingRevisions.set(key, localRevision));
      if (![...localSettingRevisions.values()].some((revision) => revision > lastSavedRevision))
        lastSavedRevision = localRevision;
    }
    if (!importing && 'image' in data)
      image = P.isMediaDataURL(data.image?.dataUrl) ? data.image : null;
    render();
  });
  if (image && !globalThis.PrismPalette.normalize(image.palette)) {
    // Upgrade a previously saved image once, without recompressing it or
    // replacing an image selected in another studio while analysis runs.
    const original = image,
      revision = localRevision;
    busy(true);
    showImport('Finding the colors in your saved image…');
    try {
      const palette = await I.analyzeImage(original.dataUrl),
        latest = await S.read();
      if (latest.image?.dataUrl === original.dataUrl) {
        if (localRevision === revision) settings = latest.settings;
        await commitImage({ ...original, palette });
        showImport('Your saved image is ready for automatic color matching.');
      } else {
        settings = latest.settings;
        image = P.isMediaDataURL(latest.image?.dataUrl) ? latest.image : null;
      }
    } catch {
      showImport(
        'The saved image could not be analyzed. Choose a preset theme or replace the image to try again.',
        true
      );
    } finally {
      busy(false);
      render();
    }
  }
})();
