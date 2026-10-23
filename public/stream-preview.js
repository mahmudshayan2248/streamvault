/* StreamVault low-data streaming trial. Only runs on mobile with ?streamPreview=1. */
(function () {
  if (new URLSearchParams(location.search).get('streamPreview') !== '1' ||
      typeof isMobilePlaybackClient !== 'function' || !isMobilePlaybackClient()) return;

  window.SV_STREAM_PREVIEW_BUFFER = true;
  const normalLocalPlay = playMedia;
  const normalRemotePlay = playFtpMedia;
  const normalSeek = seekToTime;
  const normalClose = closePlayer;
  const video = vid;
  const spinner = document.getElementById('playerSpinner');
  const nav = document.querySelector('.player-top');
  let epoch = 0, active = null, queued = null, switching = false, replacing = false;
  let wantsPlay = true, stallTimer = null, lastSwitch = 0;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ctrl';
  button.textContent = 'Data saver (preview)';
  button.title = 'Switch to lower-bitrate mobile playback';
  button.style.cssText = 'font-size:12px;border:1px solid rgba(255,255,255,.35);margin-left:auto';
  nav?.appendChild(button);

  function connectionQuality() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return null;
    if (['slow-2g', '2g'].includes(c.effectiveType) || (c.downlink > 0 && c.downlink < 1.1)) return '360p';
    if (c.effectiveType === '3g' || (c.downlink >= 1.1 && c.downlink < 2)) return '480p';
    return null;
  }
  function identity() {
    if (isLiveMode) return '';
    if (_ftpStreamUrl) return 'ftp:' + _ftpStreamUrl;
    return currentStreamId == null ? '' : 'local:' + currentStreamId;
  }
  function hlsUrl(key, quality, seconds) {
    const q = new URLSearchParams({quality, start:String(Math.floor(Math.max(0, seconds)))});
    if (key.startsWith('ftp:')) {
      q.set('url', key.slice(4));
      if (currentAudioIdx > 0) q.set('audio', String(currentAudioIdx));
      const track = availableAudio[currentAudioIdx]?.streamIndex ?? availableAudio[currentAudioIdx]?.sourceIndex;
      if (Number.isFinite(track)) q.set('audioStream', String(track));
      return '/api/mobile-hls/ftp/index.m3u8?' + q;
    }
    return '/api/mobile-hls/local/' + encodeURIComponent(key.slice(6)) + '/index.m3u8?' + q;
  }
  function reset() {
    epoch++;
    active = queued = null;
    wantsPlay = true;
    clearTimeout(stallTimer);
    stallTimer = null;
    button.textContent = 'Data saver (preview)';
  }
  function requestQuality(quality, seconds = playbackTime()) {
    const key = identity();
    if (!key || !Number.isFinite(seconds)) return;
    const target = Math.max(0, seconds);
    if (active?.key === key && active.quality === quality && Math.abs(target - playbackTime()) < 1 && !video.seeking) return;
    queued = {key, quality, seconds:target, epoch};
    drain();
  }
  async function drain() {
    if (switching) return;
    switching = true;
    try {
      while (queued) {
        const next = queued;
        queued = null;
        if (next.epoch !== epoch || next.key !== identity()) continue;
        const src = hlsUrl(next.key, next.quality, next.seconds);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);
        try {
          // Keep existing playback alive until the replacement playlist is actually ready.
          let check;
          try { check = await fetch(src, {signal:controller.signal, cache:'no-store'}); }
          finally { clearTimeout(timeout); }
          if (!check.ok) throw new Error('HLS returned ' + check.status);
          if (queued || epoch !== next.epoch || identity() !== next.key) continue;

          const previous = active ? {src:active.src, mode:'hls', offset:video._sourceOffset}
                                  : {src:next.key.startsWith('ftp:') ? _currentFtpPlaybackPlan?.src : _currentPlaybackPlan?.src,
                                     mode:next.key.startsWith('ftp:') ? _currentFtpPlaybackPlan?.mode : _currentPlaybackPlan?.mode,
                                     offset:video._sourceOffset};
          const shouldPlay = wantsPlay;
          spinner?.classList.add('on');
          replacing = true;
          video._sourceOffset = next.seconds;
          video._sourceSeekRequired = true;
          video._mediaSourceSeekRequired = true;
          try {
            if (!await attachPlayerSource(src, 'hls')) throw new Error('HLS not supported');
          } catch (attachError) {
            if (previous.src && next.epoch === epoch) {
              video._sourceOffset = previous.offset || 0;
              await attachPlayerSource(previous.src, previous.mode || 'direct');
              if (shouldPlay) video.play().catch(() => {});
            }
            throw attachError;
          } finally {
            replacing = false;
          }
          if (epoch !== next.epoch || identity() !== next.key) continue;
          active = {key:next.key, quality:next.quality, src};
          lastSwitch = Date.now();
          button.textContent = 'Data saver: ' + next.quality + ' (preview)';
          if (shouldPlay) video.play().catch(() => {});
          else video.pause();
        } catch (error) {
          clearTimeout(timeout);
          if (epoch === next.epoch && identity() === next.key) {
            console.warn('[Stream preview] low-data playback unavailable:', error.message);
            showToast('Low-data unavailable; normal playback retained');
          }
        } finally {
          spinner?.classList.remove('on');
        }
      }
    } finally {
      switching = false;
    }
  }

  playMedia = async function (...args) {
    reset();
    const token = epoch;
    const result = await normalLocalPlay.apply(this, args);
    if (token === epoch && identity() && connectionQuality()) requestQuality(connectionQuality(), 0);
    return result;
  };
  playFtpMedia = async function (...args) {
    reset();
    const token = epoch;
    const result = await normalRemotePlay.apply(this, args);
    if (token === epoch && identity() && connectionQuality()) requestQuality(connectionQuality(), 0);
    return result;
  };
  seekToTime = function (seconds) {
    if (active?.key === identity() && Number.isFinite(seconds)) return requestQuality(active.quality, seconds);
    return normalSeek(seconds);
  };
  closePlayer = function (...args) {
    reset();
    return normalClose.apply(this, args);
  };

  button.addEventListener('click', () => requestQuality('360p'));
  video.addEventListener('play', () => { wantsPlay = true; });
  video.addEventListener('pause', () => { if (!replacing) wantsPlay = false; });
  video.addEventListener('playing', () => { clearTimeout(stallTimer); stallTimer = null; });
  video.addEventListener('waiting', () => {
    if (!identity() || !wantsPlay || isLiveMode || Date.now() - lastSwitch < 20000 || stallTimer) return;
    const key = identity();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (wantsPlay && identity() === key && !video.paused && video.readyState < 3 && active?.quality !== '360p') {
        requestQuality('360p');
      }
    }, 5500);
  });
})();