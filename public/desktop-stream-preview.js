/* StreamVault desktop weak-network preview. Opt in with ?streamPreview=1.
   Never starts on phones; never touches live TV, download routes or the default player. */
(function() {
  const params = new URLSearchParams(location.search);
  if (params.get('streamPreview') !== '1' || isMobilePlaybackClient()) return;
  window.SV_DESKTOP_STREAM_PREVIEW = true;

  const originalLocal = playMedia;
  const originalFtp = playFtpMedia;
  const originalSeek = seekToTime;
  const originalClose = closePlayer;
  const video = vid;
  const list = document.querySelector('.player-bottom .controls-row');
  const spinner = document.getElementById('playerSpinner');
  if (!list) return;

  const wrapper = document.createElement('label');
  wrapper.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:12px;color:#fff;white-space:nowrap;';
  wrapper.textContent = 'Data Saver (Preview)';
  const selector = document.createElement('select');
  selector.setAttribute('aria-label', 'Desktop streaming quality preview');
  selector.style.cssText = 'background:#15151e;color:#fff;border:1px solid #777;border-radius:6px;padding:7px;';
  [['auto','Auto'],['480p','480p'],['360p','360p']].forEach(([value,label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    selector.appendChild(option);
  });
  wrapper.appendChild(selector);
  list.appendChild(wrapper);

  let token = 0;
  let playingIntent = true;
  let active = null;
  let pending = null;
  let inSwitch = false;
  let changing = false;
  let stallTimer = null;
  let lastSwitch = 0;
  let weakNetworkEvents = 0;

  function sourceKey() {
    if (isLiveMode) return null;
    if (_ftpStreamUrl) return { kind:'ftp', id:_ftpStreamUrl };
    if (currentStreamId != null) return { kind:'local', id:String(currentStreamId) };
    return null;
  }
  function sameSource(a,b) {
    return !!a && !!b && a.kind === b.kind && a.id === b.id;
  }
  function clearStall() {
    clearTimeout(stallTimer);
    stallTimer = null;
  }
  function reset() {
    token++;
    pending = active = null;
    changing = false;
    clearStall();
    weakNetworkEvents = 0;
    lastSwitch = 0;
    playingIntent = true;
    selector.value = 'auto';
    video._hlsNoticeOnFatal = true;
  }
  function profileUrl(s, quality, seconds) {
    const q = new URLSearchParams({
      quality, start:String(Math.floor(Math.max(0,seconds))),
      audio:String(Math.max(0,currentAudioIdx || 0))
    });
    if (s.kind === 'ftp') {
      q.set('url', s.id);
      const idx = availableAudio[currentAudioIdx]?.streamIndex ?? availableAudio[currentAudioIdx]?.sourceIndex;
      if (Number.isSafeInteger(idx) && idx >= 0) q.set('audioStream', String(idx));
      return '/api/desktop-hls/ftp/index.m3u8?' + q.toString();
    }
    return '/api/desktop-hls/local/' + encodeURIComponent(s.id) + '/index.m3u8?' + q.toString();
  }
  function requestChange(quality, seconds) {
    const source = sourceKey();
    if (!source || !['auto','360p','480p'].includes(quality)) return;
    const time = Number.isFinite(seconds) ? seconds : playbackTime();
    pending = { quality, source, seconds:Math.max(0,time), token };
    flushChanges();
  }
  async function attachNormal(source, seconds) {
    // Restore the existing playback-planner decisions, including source-seek requirements.
    const plan = source.kind === 'ftp'
      ? await fetchFtpPlaybackPlan(source.id, seconds)
      : await fetchLocalPlaybackPlan(source.id, seconds);
    return plan;
  }
  async function flushChanges() {
    if (inSwitch) return;
    inSwitch = true;
    try {
      while (pending) {
        const job = pending;
        pending = null;
        if (job.token !== token || !sameSource(job.source,sourceKey())) continue;
        let url = '', mode = 'hls', plan = null, didInterrupt = false;
        const desiredPlay = playingIntent;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          if (job.quality !== 'auto') {
            url = profileUrl(job.source, job.quality, job.seconds);
            // Do not interrupt a playing movie unless at least one complete HLS fragment exists.
            const check = await fetch(url, {signal:controller.signal, cache:'no-store'});
            if (!check.ok) throw new Error('Low-bitrate stream unavailable (' + check.status + ')');
            const body = await check.text();
            if (!body.includes('#EXTINF') || !body.includes('.ts')) throw new Error('HLS playlist not yet ready');
          } else {
            plan = await attachNormal(job.source, job.seconds);
            url = plan.src;
            mode = plan.mode || 'direct';
          }
          if (job.token !== token || pending || !sameSource(job.source,sourceKey())) continue;
          changing = true;
          const previous = active;
          video._hlsNoticeOnFatal = job.quality === 'auto';
          video._sourceOffset = job.quality !== 'auto' ? job.seconds : (job.seconds > 0 && mode !== 'direct' ? job.seconds : 0);
          video._sourceSeekRequired = job.quality !== 'auto' || (plan && planNeedsSourceSeek(plan));
          video._mediaSourceSeekRequired = video._sourceSeekRequired;
          if (job.source.kind === 'ftp') _ftpNeedsTranscode = !!video._sourceSeekRequired;
          spinner?.classList.add('on');
          didInterrupt = true;
          const attached = await attachPlayerSource(url, mode);
          if (!attached) throw new Error('Browser rejected replacement stream');
          if (job.quality === 'auto' && mode === 'direct' && job.seconds > 0) {
            video.addEventListener('loadedmetadata', function onMeta() {
              if (token === job.token) { try { video.currentTime = job.seconds; } catch (_) {} }
            }, {once:true});
          }
          if (job.token !== token || !sameSource(job.source,sourceKey())) continue;
          active = job.quality === 'auto' ? null : {quality:job.quality,source:job.source};
          selector.value = job.quality;
          lastSwitch = Date.now();
          if (desiredPlay) video.play().catch(() => {});
          else video.pause();
          weakNetworkEvents = 0;
          if (previous?.quality && job.quality !== previous.quality) {
            console.info('[Desktop preview] switched from', previous.quality, 'to', job.quality);
          }
        } catch (error) {
          if (job.token === token && sameSource(job.source,sourceKey())) {
            console.warn('[Desktop preview]', error.message);
            if (didInterrupt) {
              // Never leave a broken HLS source installed after a failed switch.
              try {
                const fallback = await attachNormal(job.source, job.seconds);
                if (job.token === token && !pending && sameSource(job.source,sourceKey())) {
                  video._sourceOffset = fallback.mode === 'direct' ? 0 : job.seconds;
                  video._sourceSeekRequired = planNeedsSourceSeek(fallback);
                  video._mediaSourceSeekRequired = video._sourceSeekRequired;
                  if (job.source.kind === 'ftp') _ftpNeedsTranscode = !!video._sourceSeekRequired;
                  video._hlsNoticeOnFatal = true;
                  await attachPlayerSource(fallback.src, fallback.mode || 'direct');
                  active = null;
                  selector.value = 'auto';
                  if (desiredPlay) video.play().catch(() => {});
                }
              } catch (restoreError) {
                console.warn('[Desktop preview] restore failed:', restoreError.message);
              }
            }
            showToast('Data Saver preview failed; restoring original stream');
          }
        } finally {
          clearTimeout(timeout);
          changing = false;
          spinner?.classList.remove('on');
        }
      }
    } finally { inSwitch = false; }
  }

  playMedia = async function(...args) {
    reset();
    return originalLocal.apply(this,args);
  };
  playFtpMedia = async function(...args) {
    reset();
    return originalFtp.apply(this,args);
  };
  seekToTime = function(seconds) {
    if (active && sameSource(active.source, sourceKey())) {
      return requestChange(active.quality,seconds);
    }
    return originalSeek(seconds);
  };
  closePlayer = function(...args) {
    reset();
    return originalClose.apply(this,args);
  };

  selector.addEventListener('change', () => {
    if (!sourceKey()) return;
    requestChange(selector.value,playbackTime());
  });
  video.addEventListener('play', () => { if (!changing) playingIntent = true; });
  video.addEventListener('pause', () => { if (!changing) playingIntent = false; });
  video.addEventListener('error', () => {
    if (active && !changing && sameSource(active.source,sourceKey())) requestChange('auto',playbackTime());
  });
  video.addEventListener('playing', clearStall);
  video.addEventListener('canplay', clearStall);
  video.addEventListener('waiting', () => {
    if (changing || isLiveMode || !playingIntent || video.paused || !sourceKey() ||
        Date.now() - lastSwitch < 15000 || stallTimer) return;
    const observed = sourceKey();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (!sameSource(observed,sourceKey()) || !playingIntent || video.paused ||
          video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      weakNetworkEvents++;
      // One stall => 480p; repeated stall => 360p. Never claim this is a full ABR ladder.
      const target = active?.quality === '480p' || weakNetworkEvents > 1 ? '360p' : '480p';
      if (active?.quality === target) return;
      requestChange(target,playbackTime());
    }, 6000);
  });
})();