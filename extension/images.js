(function (root) {
  'use strict';

  const MB = 1024 * 1024;
  const SOURCE_LIMIT = 20 * MB;
  const HTML_LIMIT = 2 * MB;
  const MAX_SOURCE_SIDE = 16384;
  const MAX_PIXELS = 48000000;
  const RASTER_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
    'image/gif'
  ]);
  const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
  const PLAYLIST_TYPES = new Set([
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'audio/mpegurl',
    'audio/x-mpegurl'
  ]);
  const REDIRECTS = new Set([301, 302, 303, 307, 308]);
  const FORMAT_ERROR =
    'Choose a PNG, JPEG, WebP, AVIF, GIF, MP4 or WebM file. SVG and other file formats are not supported.';

  function validateURL(raw) {
    if (typeof raw !== 'string' || raw.length > 8192)
      throw new Error('Enter a public HTTPS image or page URL.');
    const value = raw.trim();
    if (!/^https:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) {
      throw new Error('Use a complete public HTTPS URL.');
    }
    let url;
    try {
      url = new URL(value);
    } catch (_) {
      throw new Error('Enter a valid public HTTPS URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Only public HTTPS URLs without embedded credentials are supported.');
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    const ipv6 = host.startsWith('[');
    let privateHost = false;
    if (ipv4) {
      const [a, b, c] = host.split('.').map(Number);
      privateHost =
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113);
    } else if (ipv6) {
      // Accept global unicast only; mapped IPv4, link-local, ULA and transition ranges stay out.
      const words = host.slice(1, -1).split(':');
      const first = parseInt(words[0] || '0', 16);
      const second = parseInt(words[1] || '0', 16);
      privateHost =
        first < 0x2000 ||
        first > 0x3fff ||
        first === 0x2002 ||
        first === 0x3fff ||
        (first === 0x2001 && (second < 0x200 || second === 0xdb8));
    } else {
      privateHost =
        !host.includes('.') ||
        /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|test|invalid|onion)$/.test(
          host
        ) ||
        host.endsWith('.home.arpa') ||
        host.endsWith('.in-addr.arpa') ||
        host.endsWith('.ip6.arpa');
    }
    if (!host || privateHost)
      throw new Error(
        'Use a public HTTPS host. Local, private and reserved addresses are not supported.'
      );
    // Canonicalizing a trailing DNS dot also makes the permission pattern unambiguous.
    if (!ipv6) url.hostname = host;
    url.hash = '';
    return url;
  }

  function originPattern(url) {
    // Chrome host permissions cover all ports on a host and do not include a port in the pattern.
    return `https://${url.hostname}/*`;
  }

  function permissionOrigins(raw) {
    const url = validateURL(raw);
    const host = url.hostname;
    if (host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com')) {
      // Short links use api.pinterest.com; regional pages use in/uk/au/etc.
      return ['https://pin.it/*', 'https://*.pinterest.com/*', 'https://*.pinimg.com/*'];
    }
    return [originPattern(url)];
  }

  function extractImageURL(html, baseURL) {
    const base = validateURL(baseURL);
    if (typeof html !== 'string' || html.length > HTML_LIMIT)
      throw new Error('The page exceeds the 2 MB HTML limit.');
    if (typeof root.DOMParser !== 'function')
      throw new Error('Page image discovery is available in the Chrome extension.');
    // Detached HTML documents can still load img/iframe resources. Parse only
    // passive meta tags, so discovering a background cannot load a page's trackers.
    const metadata = (html.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || [])
      .filter((tag) => !/\bhttp-equiv\s*=/i.test(tag))
      .map((tag) => '<meta' + tag.slice(5, -1).replace(/</g, '&lt;') + '>')
      .join('');
    const document = new root.DOMParser().parseFromString(metadata, 'text/html');
    const meta = Array.from(document.querySelectorAll('meta'));
    const fields = [
      'og:image:secure_url',
      'og:image',
      'og:image:url',
      'twitter:image',
      'twitter:image:src'
    ];
    for (const field of fields) {
      for (const entry of meta) {
        const key = (entry.getAttribute('property') || entry.getAttribute('name') || '')
          .toLowerCase()
          .trim();
        if (key !== field) continue;
        const content = (entry.getAttribute('content') || '').trim();
        if (!content) continue;
        try {
          // Resolve against the fetched URL, never a page-controlled <base> element.
          return validateURL(new URL(content, base.href).href).href;
        } catch (_) {
          /* A later metadata entry may contain a usable public image. */
        }
      }
    }
    throw new Error(
      'No public HTTPS image was found on this page. Copy the direct image URL or upload the image file.'
    );
  }

  function contentType(response) {
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return type === 'image/jpg' ? 'image/jpeg' : type;
  }

  function discoverMedia(html, baseURL) {
    const base = validateURL(baseURL),
      candidates = [],
      schemaVideos = [],
      pinImages = [];
    if (typeof html !== 'string' || html.length > HTML_LIMIT)
      throw new Error('The page exceeds the 2 MB HTML limit.');
    const isPinterest =
      base.hostname === 'pinterest.com' || base.hostname.endsWith('.pinterest.com');
    const pinID = isPinterest ? base.pathname.match(/\/pin\/(\d+)/)?.[1] : '';
    let hasVideo = false,
      matchedPin = false,
      visited = 0;
    const add = (value, width = 0, height = 0, priority = 0, stream = false) => {
      if (typeof value !== 'string') return;
      try {
        const url = validateURL(new URL(value, base).href);
        const dimension = (value) =>
          typeof value === 'number'
            ? value
            : /^\d+(?:\s*px)?$/.test(String(value))
              ? parseInt(value, 10)
              : 0;
        const area = dimension(width) * dimension(height);
        candidates.push({
          url: url.href,
          area: Number.isFinite(area) && area > 0 ? area : 0,
          priority,
          direct: stream || /\.(?:mp4|webm|m3u8)(?:$|\?)/i.test(url.href)
        });
      } catch (_) {
        /* Ignore unusable metadata, never fetch it. */
      }
    };
    // Parse inert JSON only. Keep primary pin records separate from related
    // JSON-LD objects before choosing the highest-resolution available clip.
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 25 || ++visited > 20000) return;
      if (
        value['@type'] === 'VideoObject' ||
        (Array.isArray(value['@type']) && value['@type'].includes('VideoObject'))
      )
        schemaVideos.push(value);
      if (
        pinID &&
        String(value.id) === pinID &&
        ('is_video' in value || 'videos' in value || 'story_pin_data' in value || 'images' in value)
      ) {
        matchedPin = true;
        if (value.is_video) hasVideo = true;
        const lists = [value.videos?.video_list];
        for (const page of value.story_pin_data?.pages || []) {
          lists.push(page.video?.video_list);
          for (const block of page.blocks || []) lists.push(block.video?.video_list);
        }
        for (const list of lists) {
          if (!list) continue;
          hasVideo = true;
          for (const video of Object.values(list)) add(video?.url, video?.width, video?.height, 3);
        }
        for (const entry of Object.values(value.images || {})) {
          try {
            const url = validateURL(new URL(entry.url, base).href).href;
            pinImages.push({ url, area: Number(entry.width) * Number(entry.height) || 0 });
          } catch (_) {
            /* A malformed rendition must not hide a usable original. */
          }
        }
      }
      for (const child of Object.values(value)) walk(child, depth + 1);
    };
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (
        !/(?:type\s*=\s*["']application\/(?:ld\+)?json["']|id\s*=\s*["']__PWS_DATA__["'])/i.test(
          match[1]
        )
      )
        continue;
      try {
        walk(JSON.parse(match[2]));
      } catch (_) {
        /* Not valid inert JSON. */
      }
    }
    for (const video of schemaVideos) {
      const identity = [
        video.url,
        video['@id'],
        video.mainEntityOfPage?.['@id'],
        video.mainEntityOfPage
      ]
        .filter((value) => typeof value === 'string')
        .map((value) => {
          try {
            return new URL(value, base).pathname.match(/\/pin\/(\d+)/)?.[1];
          } catch (_) {
            return '';
          }
        })
        .filter(Boolean);
      if (
        pinID &&
        !identity.includes(pinID) &&
        (matchedPin || identity.length || schemaVideos.length !== 1)
      )
        continue;
      hasVideo = true;
      add(
        video.contentUrl,
        video.width,
        video.height,
        identity.includes(pinID) ? 3 : pinID ? 2 : 1
      );
    }
    if (root.DOMParser) {
      const tags = (html.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || [])
        .filter((tag) => !/\bhttp-equiv\s*=/i.test(tag))
        .map((tag) => '<meta' + tag.slice(5, -1).replace(/</g, '&lt;') + '>')
        .join('');
      const doc = new root.DOMParser().parseFromString(tags, 'text/html');
      for (const entry of doc.querySelectorAll('meta')) {
        const key = (entry.getAttribute('property') || entry.getAttribute('name') || '')
          .toLowerCase()
          .trim();
        const content = (entry.getAttribute('content') || '').trim();
        if (
          ['og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player:stream'].includes(key)
        ) {
          hasVideo = true;
          add(content, 0, 0, 1, key === 'twitter:player:stream');
        }
        if (key === 'og:type' && /^video(?:\.|$)/i.test(content)) hasVideo = true;
      }
    }
    if (candidates.length) {
      candidates.sort(
        (a, b) => b.priority - a.priority || Number(b.direct) - Number(a.direct) || b.area - a.area
      );
      return {
        kind: 'video',
        urls: [...new Set(candidates.map((candidate) => candidate.url))].slice(0, 8)
      };
    }
    if (hasVideo)
      throw new Error(
        'This page exposes a video cover, but no downloadable clip. Paste a direct MP4/WebM URL or upload the original video file.'
      );
    if (pinImages.length)
      return {
        kind: 'image',
        urls: [
          ...new Set(pinImages.sort((a, b) => b.area - a.area).map((entry) => entry.url))
        ].slice(0, 8)
      };
    return { kind: 'image', urls: [extractImageURL(html, base.href)] };
  }

  function extractMediaURL(html, baseURL) {
    return discoverMedia(html, baseURL).urls[0];
  }

  async function requirePermission(url) {
    // The standalone studio can still use hosts that explicitly allow web access.
    if (!root.chrome?.permissions?.contains) return;
    const origins = [originPattern(url)];
    if (!(await root.chrome.permissions.contains({ origins }))) {
      const error = new Error(`Allow image access to ${url.hostname}, then retry the import.`);
      error.requiredOrigins = origins;
      throw error;
    }
  }

  async function cancelBody(response) {
    try {
      await response.body?.cancel();
    } catch (_) {
      /* Already canceled or consumed. */
    }
  }

  async function fetchStep(url, signal) {
    let location = '';
    const headers = root.chrome?.webRequest?.onHeadersReceived;
    const origin = root.chrome?.runtime?.id ? `chrome-extension://${root.chrome.runtime.id}` : '';
    const observe = (details) => {
      // Observe only this extension's import. Never inspect other tabs' traffic.
      if (
        details.initiator !== origin ||
        details.url !== url.href ||
        !REDIRECTS.has(details.statusCode)
      )
        return;
      location =
        details.responseHeaders?.find((header) => header.name.toLowerCase() === 'location')
          ?.value || '';
    };
    // Fetch deliberately hides redirect headers behind an opaqueredirect response.
    // Read-only webRequest metadata lets us validate and permission-check each hop
    // before fetching it, rather than blindly following an arbitrary destination.
    if (headers && origin)
      headers.addListener(observe, { urls: [originPattern(url)], types: ['xmlhttprequest'] }, [
        'responseHeaders'
      ]);
    try {
      const response = await root.fetch(url.href, {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'manual',
        cache: 'no-store',
        signal
      });
      return { response, location };
    } finally {
      if (headers && origin) headers.removeListener(observe);
    }
  }

  async function fetchWithRedirects(initialURL, signal) {
    let url = initialURL;
    const visited = new Set();
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (visited.has(url.href))
        throw new Error('The site returned a redirect loop. Paste a direct image URL instead.');
      visited.add(url.href);
      await requirePermission(url);
      if (signal.aborted)
        throw new Error('The image download timed out after 15 seconds. Please try again.');
      const { response, location: redirectLocation } = await fetchStep(url, signal);
      if (response.type === 'opaqueredirect') {
        await cancelBody(response);
        if (!redirectLocation)
          throw new Error(
            'This link redirects. Open the installed Prism extension to follow it, or paste the final direct image URL.'
          );
        url = validateURL(new URL(redirectLocation, url.href).href);
        continue;
      }
      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get('location');
        await cancelBody(response);
        if (!location)
          throw new Error(
            'The site hid its redirect destination. Open the link and paste the final URL.'
          );
        url = validateURL(new URL(location, url.href).href);
        continue;
      }
      if (response.redirected) {
        await cancelBody(response);
        throw new Error(
          'An unexpected redirect could not be validated. Paste the final direct image URL.'
        );
      }
      if (!response.ok) {
        await cancelBody(response);
        throw new Error(
          `The site returned HTTP ${response.status}. It may require a login or block public downloads. Try a direct image URL or upload the file.`
        );
      }
      return { response, url };
    }
    throw new Error('The site redirected too many times. Paste the final direct image URL.');
  }

  function ascii(bytes, start, length) {
    let text = '';
    for (let index = start; index < Math.min(bytes.length, start + length); index++)
      text += String.fromCharCode(bytes[index]);
    return text;
  }

  function sniffRaster(bytes) {
    if (
      bytes.length >= 8 &&
      bytes[0] === 137 &&
      ascii(bytes, 1, 3) === 'PNG' &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    )
      return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      return 'image/jpeg';
    if (bytes.length >= 6 && /GIF8[79]a/.test(ascii(bytes, 0, 6))) return 'image/gif';
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')
      return 'image/webp';
    if (bytes.length >= 16 && ascii(bytes, 4, 4) === 'ftyp') {
      const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
      for (let index = 8; index + 4 <= Math.min(bytes.length, boxSize); index += 4) {
        if (index !== 12 && /^(avif|avis)$/.test(ascii(bytes, index, 4))) return 'image/avif';
      }
    }
    return '';
  }

  function sniffVideo(bytes) {
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3 &&
      ascii(bytes, 0, 128).includes('webm')
    )
      return 'video/webm';
    if (
      bytes.length >= 16 &&
      ascii(bytes, 4, 4) === 'ftyp' &&
      /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |dash)$/.test(ascii(bytes, 8, 4))
    )
      return 'video/mp4';
    return '';
  }
  const sniffMedia = (bytes) => sniffRaster(bytes) || sniffVideo(bytes);

  async function readResponse(response) {
    const type = contentType(response);
    const isHTML = type === 'text/html' || type === 'application/xhtml+xml';
    const isPlaylist = PLAYLIST_TYPES.has(type);
    const generic =
      !type ||
      type === 'application/octet-stream' ||
      type === 'binary/octet-stream' ||
      type === 'text/plain';
    if (!isHTML && !isPlaylist && !generic && !RASTER_TYPES.has(type) && !VIDEO_TYPES.has(type)) {
      await cancelBody(response);
      throw new Error(FORMAT_ERROR);
    }
    let limit = isHTML || isPlaylist ? HTML_LIMIT : SOURCE_LIMIT;
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      await cancelBody(response);
      throw new Error(
        `This ${isHTML ? 'page' : 'image'} exceeds the ${limit / MB} MB download limit.`
      );
    }
    if (!response.body) throw new Error('The site returned an empty image.');
    const reader = response.body.getReader();
    const chunks = [];
    const prefix = new Uint8Array(128);
    let prefixLength = 0;
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        if (prefixLength < prefix.length) {
          const sample = value.subarray(0, prefix.length - prefixLength);
          prefix.set(sample, prefixLength);
          prefixLength += sample.length;
        }
        // A missing/incorrect Content-Type must not let an HTML document use the larger image budget.
        if (generic)
          limit = sniffMedia(prefix.subarray(0, prefixLength)) ? SOURCE_LIMIT : HTML_LIMIT;
        length += value.byteLength;
        if (length > limit)
          throw new Error(
            `This ${limit === HTML_LIMIT ? 'page' : 'image'} exceeds the ${limit / MB} MB download limit.`
          );
        chunks.push(value);
      }
    } catch (error) {
      try {
        await reader.cancel();
      } catch (_) {
        /* Abort may already have canceled it. */
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (!length) throw new Error('The site returned an empty image.');
    const blob = new Blob(chunks, { type });
    const detected = sniffMedia(prefix.subarray(0, prefixLength));
    if (isPlaylist || (generic && /^\s*#EXTM3U(?:\r?\n|$)/.test(ascii(prefix, 0, prefixLength)))) {
      if (blob.size > HTML_LIMIT) throw new Error('The playlist exceeds the 2 MB limit.');
      return { playlist: await blob.text() };
    }
    if (isHTML || (generic && !detected)) {
      if (blob.size > HTML_LIMIT) throw new Error('The page exceeds the 2 MB HTML limit.');
      return { html: await blob.text() };
    }
    const raster = blob.type === detected ? blob : new Blob([blob], { type: detected });
    await inspectSource(raster);
    return { blob: raster };
  }

  function cleanName(name) {
    return (
      String(name || 'Imported image')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 160) || 'Imported image'
    );
  }

  function urlName(url) {
    const name = url.pathname.split('/').filter(Boolean).pop() || 'Imported image';
    try {
      return cleanName(decodeURIComponent(name));
    } catch (_) {
      return cleanName(name);
    }
  }

  function playlistAttributes(line) {
    return Object.fromEntries(
      Array.from(
        line.slice(line.indexOf(':') + 1).matchAll(/(?:^|,)([A-Z0-9-]+)=("[^"]*"|[^,]*)/g),
        (match) => [match[1], match[2].replace(/^"|"$/g, '')]
      )
    );
  }

  async function downloadMedia(fetched, signal, seen = new Set()) {
    if (seen.has(fetched.url.href) || seen.size >= 4) {
      await cancelBody(fetched.response);
      throw new Error(
        'This playlist is nested too deeply or contains a loop. Upload the original MP4 instead.'
      );
    }
    const payload = await readResponse(fetched.response);
    if (payload.playlist === undefined) return { fetched, payload };
    seen.add(fetched.url.href);
    const lines = payload.playlist
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const unsupported = () =>
      new Error(
        'This playlist is live, encrypted, or not a supported single-file video. Upload the original MP4/WebM instead.'
      );
    if (
      lines[0] !== '#EXTM3U' ||
      lines.some(
        (line) =>
          /^#EXT-X-(?:SESSION-KEY|DISCONTINUITY)(?::|$)/.test(line) ||
          (line.startsWith('#EXT-X-KEY:') && playlistAttributes(line).METHOD !== 'NONE')
      )
    )
      throw unsupported();
    const variants = [];
    let pending;
    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) pending = playlistAttributes(line);
      else if (!line.startsWith('#') && pending) {
        const [width, height] = (pending.RESOLUTION || '').split('x').map(Number);
        variants.push({
          url: validateURL(new URL(line, fetched.url).href),
          area: width * height || 0,
          bitrate: Number(pending['AVERAGE-BANDWIDTH'] || pending.BANDWIDTH) || 0
        });
        pending = null;
      }
    }
    if (variants.length) {
      // Choose once by resolution, then bitrate. Network speed must not silently
      // lower the quality of a wallpaper that will be stored and played offline.
      const best = variants.sort((a, b) => b.area - a.area || b.bitrate - a.bitrate)[0];
      if (seen.has(best.url.href))
        throw new Error('This playlist contains a loop. Upload the original MP4 instead.');
      return downloadMedia(await fetchWithRedirects(best.url, signal), signal, seen);
    }
    const maps = lines.filter((line) => line.startsWith('#EXT-X-MAP:')).map(playlistAttributes);
    const segments = lines
      .filter((line) => !line.startsWith('#'))
      .map((line) => validateURL(new URL(line, fetched.url).href).href);
    if (
      !lines.includes('#EXT-X-ENDLIST') ||
      maps.length !== 1 ||
      !maps[0].URI ||
      !segments.length ||
      !/^\d+@0$/.test(maps[0].BYTERANGE || '') ||
      !lines.some((line) => line.startsWith('#EXT-X-BYTERANGE:'))
    )
      throw unsupported();
    const file = validateURL(new URL(maps[0].URI, fetched.url).href);
    if (segments.some((url) => url !== file.href)) throw unsupported();
    // Pinterest's VOD playlist uses byte ranges of one complete fragmented MP4.
    // Keep that file byte-for-byte; no transcoder, frame capture, or audio fetch.
    const media = await fetchWithRedirects(file, signal);
    const downloaded = await readResponse(media.response);
    if (downloaded.blob?.type !== 'video/mp4') throw unsupported();
    return { fetched: media, payload: downloaded };
  }

  async function fetchRemote(raw) {
    const source = validateURL(raw);
    const controller = new AbortController();
    const timer = root.setTimeout(() => controller.abort(), 15000);
    try {
      let { fetched, payload } = await downloadMedia(
        await fetchWithRedirects(source, controller.signal),
        controller.signal
      );
      if (payload.html !== undefined) {
        const media = discoverMedia(payload.html, fetched.url.href);
        let failure;
        for (const candidate of media.urls) {
          try {
            const { fetched: next, payload: downloaded } = await downloadMedia(
              await fetchWithRedirects(validateURL(candidate), controller.signal),
              controller.signal
            );
            if (!downloaded.blob)
              throw new Error(
                'The page points to an embedded player instead of a downloadable file. Paste a direct MP4/WebM or image URL, or upload the file.'
              );
            if (media.kind === 'video' && !VIDEO_TYPES.has(downloaded.blob.type)) {
              throw new Error(
                'The video link returned a still cover instead of a playable clip. Paste a direct MP4/WebM URL or upload the original video.'
              );
            }
            fetched = next;
            payload = downloaded;
            failure = null;
            break;
          } catch (error) {
            if (error.requiredOrigins || controller.signal.aborted) throw error;
            failure = error;
          }
        }
        if (failure) throw failure;
      }
      return {
        blob: payload.blob,
        sourceUrl: source.href,
        name: urlName(fetched.url).replace(/\.cmfv$/i, '.mp4')
      };
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new Error('The image download timed out after 15 seconds. Please try again.');
      }
      if (error instanceof TypeError || error?.name === 'TypeError') {
        if (!root.chrome?.runtime?.id) {
          throw new Error(
            'This website does not allow image imports in the preview. Open Prism from Chrome’s Extensions menu to import this link, or choose an image from your device.'
          );
        }
        throw new Error(
          'The image could not be downloaded. The site may block public access. Try a direct image URL or upload the file.'
        );
      }
      throw error;
    } finally {
      root.clearTimeout(timer);
      controller.abort();
    }
  }

  function checkDimensions(width, height) {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error('The image has invalid dimensions. Try another image file.');
    }
    if (width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE || width * height > MAX_PIXELS) {
      throw new Error(
        'This image is too large to decode safely. Resize it below 48 megapixels and 16384 pixels per side.'
      );
    }
  }

  function declaredDimensions(bytes, type) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (offset, little = false) => view.getUint16(offset, little);
    const u32 = (offset, little = false) => view.getUint32(offset, little);
    if (type === 'image/png' && bytes.length >= 24 && ascii(bytes, 12, 4) === 'IHDR')
      return [u32(16), u32(20)];
    if (type === 'image/gif' && bytes.length >= 10) return [u16(6, true), u16(8, true)];
    if (type === 'image/jpeg') {
      let offset = 2;
      while (offset + 4 <= bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
        if (offset + 2 > bytes.length) break;
        const length = u16(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if (
          [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
            marker
          ) &&
          length >= 7
        ) {
          return [u16(offset + 5), u16(offset + 3)];
        }
        offset += length;
      }
    }
    if (type === 'image/webp') {
      for (let offset = 12; offset + 8 <= bytes.length;) {
        const kind = ascii(bytes, offset, 4);
        const size = u32(offset + 4, true);
        const start = offset + 8;
        if (start + size > bytes.length) break;
        if (kind === 'VP8X' && size >= 10) {
          const u24 = (index) => bytes[index] + bytes[index + 1] * 256 + bytes[index + 2] * 65536;
          return [u24(start + 4) + 1, u24(start + 7) + 1];
        }
        if (kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
          const packed = u32(start + 1, true);
          return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
        }
        if (
          kind === 'VP8 ' &&
          size >= 10 &&
          bytes[start + 3] === 0x9d &&
          bytes[start + 4] === 1 &&
          bytes[start + 5] === 0x2a
        ) {
          return [u16(start + 6, true) & 0x3fff, u16(start + 8, true) & 0x3fff];
        }
        offset = start + size + (size % 2);
      }
    }
    if (type === 'image/avif') {
      let dimensions;
      let boxes = 0;
      function walk(start, end, depth) {
        if (depth > 8) return;
        for (let offset = start; offset + 8 <= end && boxes++ < 10000;) {
          let size = u32(offset);
          let header = 8;
          const kind = ascii(bytes, offset + 4, 4);
          if (size === 1) {
            if (offset + 16 > end || u32(offset + 8) !== 0) return;
            size = u32(offset + 12);
            header = 16;
          } else if (size === 0) size = end - offset;
          if (size < header || offset + size > end) return;
          const content = offset + header;
          if (kind === 'ispe' && size >= header + 12) {
            const width = u32(content + 4),
              height = u32(content + 8);
            checkDimensions(width, height);
            if (!dimensions || width * height > dimensions[0] * dimensions[1])
              dimensions = [width, height];
          } else if (kind === 'meta') walk(content + 4, offset + size, depth + 1);
          else if (kind === 'iprp' || kind === 'ipco') walk(content, offset + size, depth + 1);
          offset += size;
        }
      }
      walk(0, bytes.length, 0);
      return dimensions;
    }
    return undefined;
  }

  async function inspectRaster(blob) {
    if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isFinite(blob.size))
      throw new Error(FORMAT_ERROR);
    if (blob.size > SOURCE_LIMIT)
      throw new Error('The image exceeds the 20 MB source limit. Choose a smaller image.');
    if (!blob.size) throw new Error('The image file is empty.');
    const advertised = (blob.type || '').split(';')[0].toLowerCase();
    if (
      advertised &&
      advertised !== 'application/octet-stream' &&
      advertised !== 'binary/octet-stream' &&
      advertised !== 'image/jpg' &&
      !RASTER_TYPES.has(advertised)
    )
      throw new Error(FORMAT_ERROR);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const type = sniffRaster(bytes);
    if (!type) throw new Error(FORMAT_ERROR);
    const dimensions = declaredDimensions(bytes, type);
    if (!dimensions)
      throw new Error(
        'The image header is invalid or its dimensions could not be read. Try another image file.'
      );
    checkDimensions(...dimensions);
    return { type, dimensions };
  }

  async function inspectSource(blob) {
    if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isFinite(blob.size))
      throw new Error(FORMAT_ERROR);
    if (blob.size > SOURCE_LIMIT)
      throw new Error(
        'This file exceeds the 20 MB source limit. Choose a smaller file; Prism never compresses it.'
      );
    if (!blob.size) throw new Error('The file is empty.');
    const type = sniffVideo(new Uint8Array(await blob.slice(0, 128).arrayBuffer()));
    if (type) {
      const advertised = (blob.type || '').split(';')[0].toLowerCase();
      if (
        advertised &&
        !VIDEO_TYPES.has(advertised) &&
        !['application/octet-stream', 'binary/octet-stream'].includes(advertised)
      )
        throw new Error(FORMAT_ERROR);
      return { type };
    }
    return inspectRaster(blob);
  }

  function paletteFromBitmap(bitmap) {
    if (!root.PrismPalette) throw new Error('Reload Prism to enable image color matching.');
    const canvas = root.document.createElement('canvas');
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The image colors could not be read. Please try again.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return root.PrismPalette.fromPixels(
      context.getImageData(0, 0, canvas.width, canvas.height).data
    );
  }

  async function analyzeImage(dataUrl) {
    if (!root.Prism?.isMediaDataURL(dataUrl))
      throw new Error('Choose a valid saved background to match its colors.');
    // data: is the already-saved raster; this makes no network request.
    const blob = await (await root.fetch(dataUrl)).blob();
    const inspected = await inspectSource(blob);
    if (VIDEO_TYPES.has(inspected.type)) return (await prepareVideo(blob, inspected.type)).palette;
    const bitmap = await root.createImageBitmap(blob);
    try {
      checkDimensions(bitmap.width, bitmap.height);
      return paletteFromBitmap(bitmap);
    } finally {
      bitmap.close();
    }
  }

  function originalDataURL(blob, type) {
    return new Promise((resolve, reject) => {
      const reader = new root.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error('The original file could not be read. Please try again.'));
      reader.readAsDataURL(new Blob([blob], { type }));
    });
  }

  async function prepareVideo(blob, type) {
    const video = root.document.createElement('video'),
      url = root.URL.createObjectURL(new Blob([blob], { type }));
    let timer;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    try {
      await new Promise((resolve, reject) => {
        timer = root.setTimeout(
          () =>
            reject(
              new Error(
                'The video could not be decoded within 15 seconds. Try an MP4 with H.264 video or a WebM file.'
              )
            ),
          15000
        );
        video.onloadedmetadata = () => {
          try {
            checkDimensions(video.videoWidth, video.videoHeight);
          } catch (error) {
            reject(error);
          }
        };
        video.onloadeddata = resolve;
        video.onerror = () =>
          reject(
            new Error(
              'This video codec could not be played. Try an MP4 with H.264 video or a WebM file.'
            )
          );
        video.src = url;
        video.load();
      });
      checkDimensions(video.videoWidth, video.videoHeight);
      const frame = root.document.createElement('canvas');
      const scale = Math.min(1, 128 / Math.max(video.videoWidth, video.videoHeight));
      frame.width = Math.max(1, Math.round(video.videoWidth * scale));
      frame.height = Math.max(1, Math.round(video.videoHeight * scale));
      frame.getContext('2d').drawImage(video, 0, 0, frame.width, frame.height);
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        palette: paletteFromBitmap(frame),
        thumbnail: frame.toDataURL('image/png')
      };
    } finally {
      root.clearTimeout(timer);
      video.onloadedmetadata = video.onloadeddata = video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      root.URL.revokeObjectURL(url);
    }
  }

  async function prepareFile(blob, name, sourceUrl = '') {
    const source = sourceUrl ? validateURL(sourceUrl).href : '';
    const inspected = await inspectSource(blob);
    if (VIDEO_TYPES.has(inspected.type)) {
      const metadata = await prepareVideo(blob, inspected.type);
      return {
        ...metadata,
        dataUrl: await originalDataURL(blob, inspected.type),
        name: cleanName(name),
        sourceUrl: source,
        original: true,
        bytes: blob.size,
        type: inspected.type
      };
    }
    if (typeof root.createImageBitmap !== 'function' || !root.document?.createElement) {
      throw new Error('Image preparation is available in the Chrome extension.');
    }
    let bitmap;
    try {
      bitmap = await root.createImageBitmap(new Blob([blob], { type: inspected.type }));
    } catch (_) {
      throw new Error(
        'This image could not be decoded. It may be damaged or use an unsupported format. Try another file.'
      );
    }
    try {
      checkDimensions(bitmap.width, bitmap.height);
      const palette = paletteFromBitmap(bitmap);
      // Only the small color-analysis sample goes through a canvas. Keep the
      // display file byte-for-byte, including animation, transparency and profiles.
      const dataUrl = await originalDataURL(blob, inspected.type);
      return {
        dataUrl,
        name: cleanName(name),
        sourceUrl: source,
        width: bitmap.width,
        height: bitmap.height,
        palette,
        original: true,
        bytes: blob.size,
        type: inspected.type
      };
    } finally {
      bitmap.close();
    }
  }

  const api = Object.freeze({
    validateURL,
    permissionOrigins,
    extractImageURL,
    extractMediaURL,
    fetchRemote,
    prepareFile,
    analyzeImage
  });
  root.PrismImages = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
