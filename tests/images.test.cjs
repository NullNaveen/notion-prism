'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '../extension/images.js');
const MB = 1024 * 1024;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6z8AAAAASUVORK5CYII=',
  'base64'
);

function loadImages(overrides = {}) {
  assert.ok(fs.existsSync(modulePath), 'The image import module must exist');
  const context = {
    URL,
    Blob,
    Response,
    Headers,
    Uint8Array,
    ArrayBuffer,
    DataView,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    module: { exports: {} },
    chrome: { permissions: { contains: async () => true } },
    fetch: async () => {
      throw new Error('Unexpected network request');
    },
    ...overrides
  };
  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.module.exports;
}

function imageResponse(bytes = PNG, options = {}) {
  return new Response(bytes, { headers: { 'content-type': 'image/png' }, ...options });
}

test('accepts public HTTPS URLs and normalizes a harmless fragment away', () => {
  const images = loadImages();
  assert.equal(
    images.validateURL('  https://images.example.com/a%20b.png?size=2#preview  ').href,
    'https://images.example.com/a%20b.png?size=2'
  );
  assert.equal(images.validateURL('https://8.8.8.8/image.png').hostname, '8.8.8.8');
  assert.equal(images.validateURL('https://[2606:4700:4700::1111]/a.png').protocol, 'https:');
});

test('metadata discovery never gives resource-loading page elements to the HTML parser', () => {
  const images = loadImages({
    DOMParser: class {
      parseFromString(input) {
        assert.doesNotMatch(input, /<(?:img|iframe|script|base)\b/i);
        assert.doesNotMatch(input, /http-equiv/i);
        assert.match(input, /og:image/);
        return {
          querySelectorAll: () => [
            {
              getAttribute: (key) => ({ property: 'og:image', content: '/photo.png' })[key] || null
            }
          ]
        };
      }
    }
  });
  const html =
    '<img src="https://tracker.example.com/pixel"><iframe src="https://other.example.com/"></iframe><script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://other.example.com"><meta property="og:image" content="/photo.png">';
  assert.equal(
    images.extractImageURL(html, 'https://example.com/page'),
    'https://example.com/photo.png'
  );
});

test('rejects non-HTTPS, credentials, private addresses and local names before fetching', () => {
  const images = loadImages();
  const unsafe = [
    '',
    'not a URL',
    '//example.com/a.png',
    'http://example.com/a.png',
    'https:example.com',
    'file:///tmp/a.png',
    'data:image/png;base64,AAA',
    'javascript:alert(1)',
    'https://user:pass@example.com/a.png',
    'https://localhost/a',
    'https://a.localhost/a',
    'https://localhost./a',
    'https://nas.local/a',
    'https://server.internal/a',
    'https://router/a',
    'https://127.0.0.1/a',
    'https://127.1/a',
    'https://2130706433/a',
    'https://0x7f000001/a',
    'https://0.0.0.0/a',
    'https://10.4.3.2/a',
    'https://172.16.0.1/a',
    'https://172.31.255.255/a',
    'https://192.168.1.2/a',
    'https://169.254.169.254/a',
    'https://100.64.0.1/a',
    'https://198.18.0.1/a',
    'https://192.0.2.1/a',
    'https://203.0.113.2/a',
    'https://224.0.0.1/a',
    'https://[::1]/a',
    'https://[::ffff:127.0.0.1]/a',
    'https://[fc00::1]/a',
    'https://[fe80::1]/a',
    'https://[2001:db8::1]/a',
    'https://[2002:7f00:1::]/a',
    'https://exa\nmple.com/a',
    'https://example.com\\@127.0.0.1/a'
  ];
  for (const value of unsafe) assert.throws(() => images.validateURL(value), undefined, value);
});

test('asks only for the supplied host except known Pinterest image infrastructure', () => {
  const images = loadImages();
  assert.deepEqual(Array.from(images.permissionOrigins('https://cdn.example.com/a.jpg')), [
    'https://cdn.example.com/*'
  ]);
  assert.deepEqual(
    new Set(images.permissionOrigins('https://pin.it/AbCd')),
    new Set(['https://pin.it/*', 'https://*.pinterest.com/*', 'https://*.pinimg.com/*'])
  );
  assert.deepEqual(Array.from(images.permissionOrigins('https://pinterest.com.evil.example/a')), [
    'https://pinterest.com.evil.example/*'
  ]);
});

function redirectBrowser(fetchImpl, contains = async () => true) {
  const listeners = new Set();
  const event = {
    addListener(listener, filter, extra) {
      assert.deepEqual(Array.from(filter.types), ['xmlhttprequest']);
      assert.deepEqual(Array.from(extra), ['responseHeaders']);
      listeners.add(listener);
    },
    removeListener: (listener) => listeners.delete(listener)
  };
  const chrome = {
    runtime: { id: 'prism-test' },
    permissions: { contains },
    webRequest: { onHeadersReceived: event }
  };
  const emit = (url, location, initiator = 'chrome-extension://prism-test') => {
    for (const listener of listeners)
      listener({
        url,
        initiator,
        statusCode: 302,
        responseHeaders: [{ name: 'Location', value: location }]
      });
  };
  return {
    images: loadImages({ chrome, fetch: (url, options) => fetchImpl(url, options, emit) }),
    listeners
  };
}

test('follows real-browser opaque redirects using only its own response metadata', async () => {
  const calls = [];
  const { images, listeners } = redirectBrowser(async (url, options, emit) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    if (url === 'https://pin.it/abc') {
      emit(url, 'https://api.pinterest.com/url_shortener/abc/redirect/');
      emit(url, 'https://wrong.example.com/other.png', 'https://unrelated.example.com');
      emit('https://pin.it/unrelated', 'https://wrong.example.com/other.png');
      return { type: 'opaqueredirect', status: 0, body: null };
    }
    if (url.includes('/url_shortener/')) {
      emit(url, 'https://i.pinimg.com/image.png');
      return { type: 'opaqueredirect', status: 0, body: null };
    }
    return imageResponse();
  });
  const result = await images.fetchRemote('https://pin.it/abc');
  assert.equal(result.blob.type, 'image/png');
  assert.deepEqual(calls, [
    'https://pin.it/abc',
    'https://api.pinterest.com/url_shortener/abc/redirect/',
    'https://i.pinimg.com/image.png'
  ]);
  assert.equal(listeners.size, 0);
});

test('opaque redirects still require permission and reject private destinations before following', async () => {
  for (const target of ['https://cdn.example.com/photo.png', 'https://127.0.0.1/private']) {
    let requests = 0;
    const { images, listeners } = redirectBrowser(
      async (url, options, emit) => {
        requests++;
        emit(url, target);
        return { type: 'opaqueredirect', status: 0, body: null };
      },
      async ({ origins }) => origins[0] === 'https://example.com/*'
    );
    await assert.rejects(
      images.fetchRemote('https://example.com/photo'),
      /Allow image access|public HTTPS host/
    );
    assert.equal(requests, 1);
    assert.equal(listeners.size, 0);
  }
});

test('redirect observers are removed when a download fails', async () => {
  const { images, listeners } = redirectBrowser(async () => {
    throw new Error('Connection lost');
  });
  await assert.rejects(images.fetchRemote('https://example.com/photo'), /Connection lost/);
  assert.equal(listeners.size, 0);
});

test('standalone preview can import a CORS-enabled direct image without extension permissions', async () => {
  const images = loadImages({ chrome: undefined, fetch: async () => imageResponse() });
  const result = await images.fetchRemote('https://images.example.com/photo.png');
  assert.equal(result.blob.type, 'image/png');
});

test('raster bytes with a generic text MIME are accepted without accepting disguised non-images', async () => {
  const images = loadImages({
    fetch: async () => new Response(PNG, { headers: { 'content-type': 'text/plain' } })
  });
  const result = await images.fetchRemote('https://example.com/download');
  assert.equal(result.blob.type, 'image/png');
});

test('missing permission returns the exact requested origin without network access', async () => {
  let requests = 0;
  const images = loadImages({
    chrome: { permissions: { contains: async () => false } },
    fetch: async () => {
      requests++;
      return imageResponse();
    }
  });
  await assert.rejects(images.fetchRemote('https://images.example.com/a.png'), (error) => {
    assert.deepEqual(Array.from(error.requiredOrigins), ['https://images.example.com/*']);
    return true;
  });
  assert.equal(requests, 0);
});

test('direct images use credential-free manual requests and retain the source URL', async () => {
  const images = loadImages({
    fetch: async (url, options) => {
      assert.equal(url, 'https://images.example.com/a.png');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.ok(options.signal);
      return imageResponse();
    }
  });
  const result = await images.fetchRemote('https://images.example.com/a.png#fragment');
  assert.equal(result.sourceUrl, 'https://images.example.com/a.png');
  assert.equal(result.name, 'a.png');
  assert.equal(result.blob.type, 'image/png');
  assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), PNG);
});

test('a redirect to a second host is permission checked before following', async () => {
  const calls = [];
  const images = loadImages({
    chrome: {
      permissions: { contains: async ({ origins }) => origins[0] === 'https://example.com/*' }
    },
    fetch: async (url) => {
      calls.push(url);
      return new Response(null, {
        status: 302,
        headers: { location: 'https://cdn.example.net/image.png' }
      });
    }
  });
  await assert.rejects(images.fetchRemote('https://example.com/image'), (error) => {
    assert.deepEqual(Array.from(error.requiredOrigins), ['https://cdn.example.net/*']);
    return true;
  });
  assert.deepEqual(calls, ['https://example.com/image']);
});

test('readable redirects are bounded and reject private targets', async () => {
  let calls = 0;
  const loop = loadImages({
    fetch: async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: '/again' } });
    }
  });
  await assert.rejects(loop.fetchRemote('https://example.com/a'), /redirect/i);
  assert.ok(calls <= 6);
  const privateRedirect = loadImages({
    fetch: async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://169.254.169.254/secret' }
      })
  });
  await assert.rejects(
    privateRedirect.fetchRemote('https://example.com/a'),
    /public|private|local/i
  );
});

test('opaque browser redirects give the user an expanded-link recovery', async () => {
  const images = loadImages({
    fetch: async () => ({ type: 'opaqueredirect', status: 0, body: null })
  });
  await assert.rejects(
    images.fetchRemote('https://pin.it/abc'),
    /redirect.*(open|expanded|final|direct)/i
  );
});

test('rejects huge declared payloads before reading the response body', async () => {
  let canceled = false;
  const images = loadImages({
    fetch: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          }
        }),
        {
          headers: { 'content-type': 'image/png', 'content-length': String(21 * MB) }
        }
      )
  });
  await assert.rejects(images.fetchRemote('https://example.com/huge.png'), /20 MB/i);
  assert.equal(canceled, true);
});

test('caps streamed image bytes even when content-length is absent', async () => {
  let reads = 0;
  let canceled = false;
  const images = loadImages({
    fetch: async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(MB));
          },
          cancel() {
            canceled = true;
          }
        }),
        { headers: { 'content-type': 'image/png' } }
      )
  });
  await assert.rejects(images.fetchRemote('https://example.com/huge.png'), /20 MB/i);
  assert.ok(reads <= 23, `stopped after ${reads} MB`);
  assert.equal(canceled, true);
});

test('HTML pages use a lower streamed limit', async () => {
  const images = loadImages({
    fetch: async () =>
      new Response('x'.repeat(2 * MB + 1), { headers: { 'content-type': 'text/html' } })
  });
  await assert.rejects(images.fetchRemote('https://example.com/page'), /2 MB/i);
});

test('HTTP failures and vector images produce actionable errors', async () => {
  const denied = loadImages({ fetch: async () => new Response('login', { status: 403 }) });
  await assert.rejects(
    denied.fetchRemote('https://www.pinterest.com/pin/123/'),
    /403|blocked|public/i
  );
  const svg = loadImages({
    fetch: async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
  });
  await assert.rejects(svg.fetchRemote('https://example.com/a.svg'), /PNG|JPEG|WebP|AVIF|GIF|SVG/i);
  const disguised = loadImages({ fetch: async () => imageResponse(Buffer.from('<svg/>')) });
  await assert.rejects(disguised.fetchRemote('https://example.com/a.png'), /image|raster|format/i);
});

test('timeout covers the streamed body as well as initial fetch', async () => {
  let timer;
  const images = loadImages({
    setTimeout(fn, delay) {
      assert.equal(delay, 15000);
      timer = fn;
      return 1;
    },
    clearTimeout() {},
    fetch: async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener('abort', () =>
              controller.error(new DOMException('Aborted', 'AbortError'))
            );
            queueMicrotask(() => timer());
          }
        }),
        { headers: { 'content-type': 'image/png' } }
      )
  });
  await assert.rejects(images.fetchRemote('https://example.com/slow.png'), /timed out|15 seconds/i);
});

test('file preparation rejects non-images and oversized source files before decoding', async () => {
  const images = loadImages();
  await assert.rejects(
    images.prepareFile(new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'a.svg'),
    /PNG|JPEG|WebP|AVIF|GIF|SVG/i
  );
  await assert.rejects(
    images.prepareFile(new Blob(['wrong'], { type: 'image/png' }), 'a.png'),
    /image|raster|format/i
  );
  await assert.rejects(
    images.prepareFile(new Blob([new Uint8Array(20 * MB + 1)], { type: 'image/png' }), 'a.png'),
    /20 MB/i
  );
});

test('file preparation checks declared PNG dimensions before invoking a decoder', async () => {
  const giant = Buffer.from(PNG);
  giant.writeUInt32BE(60000, 16);
  giant.writeUInt32BE(60000, 20);
  let decoded = false;
  const images = loadImages({
    createImageBitmap: async () => {
      decoded = true;
      throw new Error('decoder invoked');
    }
  });
  await assert.rejects(
    images.prepareFile(new Blob([giant], { type: 'image/png' }), 'giant.png'),
    /dimension|megapixel|pixel/i
  );
  assert.equal(decoded, false);
});

test('GIF, JPEG, WebP and AVIF headers cannot bypass the pre-decode pixel limit', async () => {
  const gif = Buffer.from('474946383961ffffffff000000', 'hex');
  const jpeg = Buffer.from('ffd8ffc0000808ffffffff01ffd9', 'hex');
  const webp = Buffer.from('524946461600000057454250565038580a00000000000000feff00feff00', 'hex');
  const avif = Buffer.from(
    '00000018667479706176696600000000617669666d696631' +
      '000000306d6574610000000000000024697072700000001c6970636f0000001469737065000000000000ffff0000ffff',
    'hex'
  );
  let decoded = 0;
  const images = loadImages({
    createImageBitmap: async () => {
      decoded++;
      throw new Error('decoder invoked');
    }
  });
  for (const [type, bytes] of [
    ['image/gif', gif],
    ['image/jpeg', jpeg],
    ['image/webp', webp],
    ['image/avif', avif]
  ]) {
    await assert.rejects(
      images.prepareFile(new Blob([bytes], { type }), 'giant'),
      /megapixel|pixel/i,
      type
    );
  }
  assert.equal(decoded, 0);
});

test('a generic binary MIME still accepts raster signatures but limits unknown pages to 2 MB', async () => {
  const image = loadImages({
    fetch: async () =>
      new Response(PNG, { headers: { 'content-type': 'application/octet-stream' } })
  });
  const result = await image.fetchRemote('https://cdn.example.com/download');
  assert.equal(result.blob.type, 'image/png');
  const page = loadImages({
    fetch: async () =>
      new Response('<html>' + 'x'.repeat(2 * MB), {
        headers: { 'content-type': 'application/octet-stream' }
      })
  });
  await assert.rejects(page.fetchRemote('https://example.com/page'), /2 MB/i);
});

test('video metadata chooses the largest matching Pinterest pin clip instead of its cover or related pins', () => {
  const images = loadImages();
  const state = {
    pins: {
      one: {
        id: '123',
        videos: {
          video_list: {
            small: { url: 'https://v.pinimg.com/small.mp4', width: 180, height: 320 },
            large: { url: 'https://v.pinimg.com/large.mp4', width: 1080, height: 1920 }
          }
        }
      },
      other: {
        id: '999',
        videos: {
          video_list: {
            large: { url: 'https://v.pinimg.com/unrelated.mp4', width: 2160, height: 3840 }
          }
        }
      }
    }
  };
  const html =
    '<script id="__PWS_DATA__" type="application/json">' +
    JSON.stringify(state) +
    '</script><meta property="og:image" content="https://i.pinimg.com/cover.jpg">';
  assert.equal(
    images.extractMediaURL(html, 'https://www.pinterest.com/pin/123/'),
    'https://v.pinimg.com/large.mp4'
  );
});

test('a video-only page without a downloadable clip does not silently become a still image', () => {
  const images = loadImages();
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify({
      '@type': 'VideoObject',
      embedUrl: 'https://example.com/embed',
      thumbnailUrl: 'https://example.com/cover.jpg'
    }) +
    '</script>';
  assert.throws(
    () => images.extractMediaURL(html, 'https://example.com/page'),
    /playable|video|MP4/i
  );
});

test('direct MP4 bytes with a generic MIME are imported without alteration', async () => {
  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/portrait.mp4'));
  const images = loadImages({
    fetch: async () =>
      new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })
  });
  const result = await images.fetchRemote('https://example.com/background');
  assert.equal(result.blob.type, 'video/mp4');
  assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), bytes);
});

test('a matching Pinterest video takes precedence over unrelated JSON-LD clips', () => {
  const images = loadImages();
  const pin = {
    id: '123',
    videos: {
      video_list: {
        original: { url: 'https://v.pinimg.com/primary.mp4', width: 1080, height: 1920 }
      }
    }
  };
  const related = {
    '@type': 'VideoObject',
    contentUrl: 'https://v.pinimg.com/related.mp4',
    width: 2160,
    height: 3840
  };
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify(related) +
    '</script><script id="__PWS_DATA__">' +
    JSON.stringify(pin) +
    '</script>';
  assert.equal(
    images.extractMediaURL(html, 'https://www.pinterest.com/pin/123/'),
    'https://v.pinimg.com/primary.mp4'
  );
  const unavailable = html.replace(
    JSON.stringify(pin),
    JSON.stringify({ id: '123', is_video: true })
  );
  assert.throws(
    () => images.extractMediaURL(unavailable, 'https://www.pinterest.com/pin/123/'),
    /video|MP4/i
  );
});

test('a discovered video resolving to a raster cover is rejected', async () => {
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify({ '@type': 'VideoObject', contentUrl: 'https://example.com/cover.png' }) +
    '</script>';
  const images = loadImages({
    fetch: async (url) =>
      url.endsWith('/page')
        ? new Response(html, { headers: { 'content-type': 'text/html' } })
        : imageResponse()
  });
  await assert.rejects(
    images.fetchRemote('https://example.com/page'),
    /video.*(still|cover)|still.*video/i
  );
});

test('video discovery prefers a direct stream over an embedded player and tries alternatives', async () => {
  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/portrait.mp4'));
  const calls = [];
  const metadata = [
    ['og:video', 'https://example.com/embed/player'],
    ['twitter:player:stream', 'https://example.com/original.mp4']
  ];
  const images = loadImages({
    DOMParser: class {
      parseFromString() {
        return {
          querySelectorAll: () =>
            metadata.map(([property, content]) => ({
              getAttribute: (key) => ({ property, content })[key] || null
            }))
        };
      }
    },
    fetch: async (url) => {
      calls.push(url);
      return url.endsWith('.mp4')
        ? new Response(bytes, { headers: { 'content-type': 'video/mp4' } })
        : new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
    }
  });
  const result = await images.fetchRemote('https://example.com/page');
  assert.equal(result.blob.type, 'video/mp4');
  assert.deepEqual(calls, ['https://example.com/page', 'https://example.com/original.mp4']);
  metadata.splice(
    0,
    metadata.length,
    ['og:video', 'https://example.com/first.mp4'],
    ['og:video:secure_url', 'https://example.com/second.mp4']
  );
  const fallback = loadImages({
    DOMParser: class {
      parseFromString() {
        return {
          querySelectorAll: () =>
            metadata.map(([property, content]) => ({
              getAttribute: (key) => ({ property, content })[key] || null
            }))
        };
      }
    },
    fetch: async (url) =>
      url.endsWith('/page') || url.endsWith('first.mp4')
        ? new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
        : new Response(bytes, { headers: { 'content-type': 'video/mp4' } })
  });
  assert.equal((await fallback.fetchRemote('https://example.com/page')).blob.type, 'video/mp4');
});

test('Pinterest story pins expose their animation even when is_video is false', () => {
  const pin = fs.readFileSync(path.join(__dirname, 'fixtures/pinterest-story.json'), 'utf8');
  const html = '<script id="__PWS_DATA__">' + pin + '</script>';
  assert.equal(
    loadImages().extractMediaURL(html, 'https://www.pinterest.com/pin/2814818512984454/'),
    'https://v1.pinimg.com/videos/iht/hls/ca/d5/75/cad57515ec100bc5b81ed3debacc1f68.m3u8'
  );
});

test('matching pin quality wins across direct clips and identified schema streams with px dimensions', () => {
  const pin = {
    id: '123',
    videos: {
      video_list: { small: { url: 'https://v.pinimg.com/small.mp4', width: 360, height: 640 } }
    }
  };
  const schema = {
    '@type': 'VideoObject',
    '@id': 'https://www.pinterest.com/pin/123/',
    contentUrl: 'https://v.pinimg.com/master.m3u8',
    width: '720 px',
    height: '1280 px'
  };
  const html =
    '<script type="application/json">' +
    JSON.stringify(pin) +
    '</script><script type="application/ld+json">' +
    JSON.stringify(schema) +
    '</script>';
  assert.equal(
    loadImages().extractMediaURL(html, 'https://www.pinterest.com/pin/123/'),
    'https://v.pinimg.com/master.m3u8'
  );
});

test('still Pinterest pins use the published original instead of a smaller share thumbnail', () => {
  const pin = {
    id: '123',
    is_video: false,
    images: {
      '736x': { url: 'https://i.pinimg.com/736x/photo.jpg', width: 736, height: 1308 },
      orig: { url: 'https://i.pinimg.com/originals/photo.jpg', width: 1200, height: 2133 }
    }
  };
  const other = {
    id: '456',
    images: { orig: { url: 'https://i.pinimg.com/other.jpg', width: 4000, height: 6000 } }
  };
  const html = '<script type="application/json">' + JSON.stringify([pin, other]) + '</script>';
  assert.equal(
    loadImages().extractMediaURL(html, 'https://www.pinterest.com/pin/123/'),
    'https://i.pinimg.com/originals/photo.jpg'
  );
});

const hlsMaster =
  '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=360x640\nsmall.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=720x1280\nlarge.m3u8\n';
const hlsMedia =
  '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MAP:URI="original.cmfv",BYTERANGE="972@0"\n#EXTINF:2\n#EXT-X-BYTERANGE:1000@1072\noriginal.cmfv\n#EXTINF:2\n#EXT-X-BYTERANGE:1000\noriginal.cmfv\n#EXT-X-ENDLIST\n';

test('HLS imports the highest-resolution single-file video without changing its bytes or fetching audio', async () => {
  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/portrait.mp4')),
    calls = [];
  const images = loadImages({
    fetch: async (url, options) => {
      calls.push(url);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'manual');
      if (url.endsWith('master.m3u8'))
        return new Response(hlsMaster, {
          headers: { 'content-type': 'application/vnd.apple.mpegurl' }
        });
      if (url.endsWith('large.m3u8'))
        return new Response(hlsMedia, { headers: { 'content-type': 'text/plain' } });
      if (url.endsWith('original.cmfv'))
        return new Response(bytes, { headers: { 'content-type': 'video/mp4' } });
      throw new Error('Unexpected rendition: ' + url);
    }
  });
  const result = await images.fetchRemote('https://v.pinimg.com/master.m3u8');
  assert.equal(result.blob.type, 'video/mp4');
  assert.equal(result.name, 'original.mp4');
  assert.equal(result.sourceUrl, 'https://v.pinimg.com/master.m3u8');
  assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), bytes);
  assert.deepEqual(calls, [
    'https://v.pinimg.com/master.m3u8',
    'https://v.pinimg.com/large.m3u8',
    'https://v.pinimg.com/original.cmfv'
  ]);
});

test('encrypted, live, or multiple-file playlists fail before fetching media', async () => {
  for (const playlist of [
    hlsMedia.replace('#EXTINF:2', '#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:2'),
    hlsMedia.replace('#EXT-X-ENDLIST', ''),
    hlsMedia.replace('original.cmfv\n#EXT-X-ENDLIST', 'other.cmfv\n#EXT-X-ENDLIST')
  ]) {
    let requests = 0;
    const images = loadImages({
      fetch: async () => {
        requests++;
        return new Response(playlist, { headers: { 'content-type': 'application/x-mpegURL' } });
      }
    });
    await assert.rejects(
      images.fetchRemote('https://v.pinimg.com/stream.m3u8'),
      /single.file|live|encrypted|playlist/i
    );
    assert.equal(requests, 1);
  }
});

test('playlist destinations retain public-address and host-permission checks', async () => {
  for (const target of ['https://127.0.0.1/video.cmfv', 'https://other.example.com/video.cmfv']) {
    const calls = [];
    const images = loadImages({
      chrome: {
        permissions: { contains: async ({ origins }) => origins[0] === 'https://v.pinimg.com/*' }
      },
      fetch: async (url) => {
        calls.push(url);
        return new Response(hlsMedia.replaceAll('original.cmfv', target), {
          headers: { 'content-type': 'application/vnd.apple.mpegurl' }
        });
      }
    });
    await assert.rejects(
      images.fetchRemote('https://v.pinimg.com/large.m3u8'),
      /public HTTPS host|Allow image access/
    );
    assert.equal(calls.length, 1);
  }
});

test('cyclic playlists stop without repeated requests and overlarge playlists are rejected', async () => {
  let requests = 0;
  const cycle = loadImages({
    fetch: async () => {
      requests++;
      return new Response('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=720x1280\nmaster.m3u8', {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' }
      });
    }
  });
  await assert.rejects(
    cycle.fetchRemote('https://v.pinimg.com/master.m3u8'),
    /playlist.*(loop|nested)|nested.*playlist/i
  );
  assert.equal(requests, 1);
  const large = loadImages({
    fetch: async () =>
      new Response('#EXTM3U\n' + 'x'.repeat(2 * MB), {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' }
      })
  });
  await assert.rejects(large.fetchRemote('https://v.pinimg.com/master.m3u8'), /2 MB/i);
});
