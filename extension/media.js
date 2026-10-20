(function (root) {
  'use strict';
  function mount(container, onError = () => {}) {
    let video = null,
      element = null,
      backdrop = null,
      backdropVideo = null,
      source = '',
      url = '',
      playing = true,
      rotation = 0;
    function layout() {
      if (!element) return;
      const sideways = rotation % 180 !== 0;
      element.style.width = sideways ? `${container.clientHeight}px` : '100%';
      element.style.height = sideways ? `${container.clientWidth}px` : '100%';
      element.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
      if (backdrop) {
        // Overscan prevents the blurred edge from revealing the plain canvas.
        backdrop.style.width = `${(sideways ? container.clientHeight : container.clientWidth) + 160}px`;
        backdrop.style.height = `${(sideways ? container.clientWidth : container.clientHeight) + 160}px`;
        backdrop.style.transform = element.style.transform;
      }
    }
    const observer = root.ResizeObserver ? new root.ResizeObserver(layout) : null;
    observer?.observe(container);
    function syncBackdrop() {
      if (!video || !backdropVideo || backdropVideo.readyState < 1) return;
      if (Math.abs(backdropVideo.currentTime - video.currentTime) > 0.15) {
        try {
          backdropVideo.currentTime = video.currentTime;
        } catch (_) {
          /* A new source may still be loading. */
        }
      }
    }
    function playback() {
      if (!video) return;
      syncBackdrop();
      if (playing && root.document.visibilityState !== 'hidden') {
        video.play().catch((error) => {
          if (error.name !== 'AbortError')
            onError('Video playback was blocked. Click Play background to retry.');
        });
        backdropVideo?.play().catch(() => {});
      } else {
        video.pause();
        backdropVideo?.pause();
      }
    }
    function clearBackdrop() {
      if (backdropVideo) {
        backdropVideo.pause();
        backdropVideo.removeAttribute('src');
        backdropVideo.load();
      }
      backdrop?.remove();
      backdrop = null;
      backdropVideo = null;
    }
    function makeVideo(className) {
      const player = root.document.createElement('video');
      player.className = className;
      player.muted = true;
      player.loop = true;
      player.playsInline = true;
      player.preload = 'auto';
      player.setAttribute('tabindex', '-1');
      player.setAttribute('aria-hidden', 'true');
      player.src = url;
      return player;
    }
    function clear() {
      clearBackdrop();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      element?.remove();
      if (url) root.URL.revokeObjectURL(url);
      video = null;
      element = null;
      source = '';
      url = '';
    }
    function update(image, settings) {
      if (
        !settings.enabled ||
        settings.backgroundMode !== 'image' ||
        !root.Prism.isMediaDataURL(image?.dataUrl)
      ) {
        clear();
        return;
      }
      playing = settings.videoPlaying;
      rotation = [0, 90, 180, 270].includes(settings.imageRotation) ? settings.imageRotation : 0;
      if (source !== image.dataUrl) {
        clear();
        source = image.dataUrl;
        const comma = source.indexOf(','),
          bytes = root.atob(source.slice(comma + 1));
        const buffer = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
        url = root.URL.createObjectURL(
          new Blob([buffer], { type: source.slice(5, source.indexOf(';')) })
        );
        if (root.Prism.isVideoDataURL(source)) {
          video = makeVideo('prism-background-media prism-background-video');
          element = video;
          video.addEventListener('error', () =>
            onError(
              'The background video could not play in this browser. Try an MP4 with H.264 video or a WebM file.'
            )
          );
          video.addEventListener('timeupdate', syncBackdrop);
          video.addEventListener('seeking', syncBackdrop);
        } else {
          // Large data URLs exceed Chrome's CSS custom-property token limit.
          // A short local Blob URL displays the exact original, including GIF frames.
          element = root.document.createElement('div');
          element.className = 'prism-background-media prism-background-image';
          element.style.backgroundImage = `url("${url}")`;
        }
        element.setAttribute('aria-hidden', 'true');
        container.appendChild(element);
      }
      if (settings.imageFit === 'contain' && settings.fitBackdrop !== false) {
        if (!backdrop) {
          if (video) {
            backdropVideo = makeVideo('prism-background-backdrop');
            backdrop = backdropVideo;
            backdropVideo.addEventListener('loadedmetadata', syncBackdrop);
          } else {
            backdrop = root.document.createElement('div');
            backdrop.className = 'prism-background-backdrop';
            backdrop.style.backgroundImage = `url("${url}")`;
            backdrop.setAttribute('aria-hidden', 'true');
          }
          container.prepend(backdrop);
        }
      } else clearBackdrop();
      layout();
      playback();
    }
    root.document.addEventListener('visibilitychange', playback);
    return {
      update,
      dispose() {
        clear();
        observer?.disconnect();
        root.document.removeEventListener('visibilitychange', playback);
      }
    };
  }
  root.PrismMedia = { mount };
})(globalThis);
