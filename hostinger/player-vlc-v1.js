/* Player-v7 view adapter. Playback ownership lives exclusively in PlayerSession. */
(function() {
  'use strict';
  if(window.playerSession) return;
  const video = document.getElementById('videoPlayer');
  const modal = document.getElementById('playerModal');
  if(!video || !window.PlayerSession) throw new Error('PlayerSession must load before the player view');
  function capabilityParams(){
    const can=value=>video.canPlayType(value)!=='';
    const params=new URLSearchParams();
    params.set('h264',can('video/mp4; codecs="avc1.42E01E"')?'1':'0');
    params.set('hevc',(can('video/mp4; codecs="hvc1.1.6.L93.B0"')||can('video/mp4; codecs="hev1.1.6.L93.B0"'))?'1':'0');
    params.set('vp8',can('video/webm; codecs="vp8"')?'1':'0');
    params.set('vp9',can('video/webm; codecs="vp09.00.10.08"')?'1':'0');
    params.set('av1',(can('video/mp4; codecs="av01.0.05M.08"')||can('video/webm; codecs="av01.0.05M.08"'))?'1':'0');
    params.set('aac',can('audio/mp4; codecs="mp4a.40.2"')?'1':'0');
    params.set('mp3',can('audio/mpeg')?'1':'0');
    params.set('opus',(can('audio/webm; codecs="opus"')||can('audio/ogg; codecs="opus"'))?'1':'0');
    params.set('vorbis',(can('audio/webm; codecs="vorbis"')||can('audio/ogg; codecs="vorbis"'))?'1':'0');
    return params;
  }

  function backendUrl(pathname){
    try{return svBackendUrl(pathname);}catch(_){return `${window.API_BASE||''}${pathname}`;}
  }

  async function fetchCapability(source,signal,options={}){
    const params=capabilityParams();
    params.set('sidecars',options.sidecars?'1':'0');
    if(Number(options.start)>0)params.set('start',String(Number(options.start)));
    if(source.name)params.set('title',String(source.name));
    if(source.year)params.set('year',String(source.year));
    let pathname;
    if(source.kind==='remote'){
      params.set('url',source.url);
      pathname=`/api/playback/remote?${params.toString()}`;
    }else{
      pathname=`/api/playback/${encodeURIComponent(source.id)}?${params.toString()}`;
    }
    const response=await fetch(backendUrl(pathname),{signal,cache:'no-store'});
    let payload=null;
    try{payload=await response.json();}catch(_){ }
    if(!response.ok || !payload?.ok){
      const error=new Error(payload?.error||`Playback capability request failed (${response.status})`);
      error.status=response.status;
      error.code=payload?.code||'';
      error.endpointUnavailable=response.status===404 && !payload?.code;
      throw error;
    }
    try{
      const normalized=svNormalizeBackendUrls(payload);
      normalized.mode=payload.mode;
      normalized.strategy=payload.strategy;
      return normalized;
    }catch(_){return payload;}
  }

  function languageName(code){
    try{
      const label=mediaLanguageLabel?.(code);
      if(label)return label;
    }catch(_){ }
    const normalized=String(code||'').toLowerCase();
    const fallback={eng:'English',en:'English',hin:'Hindi',hi:'Hindi',ben:'Bengali',bn:'Bengali',jpn:'Japanese',ja:'Japanese',spa:'Spanish',es:'Spanish',fra:'French',fre:'French',fr:'French',deu:'German',ger:'German',de:'German',kor:'Korean',ko:'Korean'};
    return fallback[normalized]||'';
  }

  function usefulTitle(title){
    const value=String(title||'').trim();
    if(!value || /^(audio(?: track)? \d+|default audio|unknown)$/i.test(value))return '';
    if(/\.(?:com|net|org|town|site)$/i.test(value) || /(?:moviesmod|mkvcinemas|encoded by|www\.)/i.test(value))return '';
    return value;
  }

  function channelLabel(track){
    const layout=String(track.channelLayout||'').trim();
    if(layout && !/^unknown$/i.test(layout)){
      if(/^stereo$/i.test(layout))return '2.0';
      if(/^mono$/i.test(layout))return '1.0';
      return layout.replace(/\(side\)/i,'');
    }
    const channels=Number(track.channels)||0;
    if(channels===1)return '1.0';
    if(channels===2)return '2.0';
    if(channels===6)return '5.1';
    if(channels===8)return '7.1';
    return channels?`${channels}ch`:'';
  }

  function audioLabel(track,index){
    const language=languageName(track.language);
    const title=usefulTitle(track.title);
    const base=language||title||`Audio Track ${index+1}`;
    const detailTitle=title && title.toLowerCase()!==base.toLowerCase()?title:'';
    const sourceTechnical=[String(track.codec||'').toUpperCase(),channelLabel(track)].filter(Boolean).join(' ');
    const outputTechnical=track.outputAction && track.outputAction!=='copy'
      ? [String(track.outputCodec||'AAC').toUpperCase(),channelLabel({channels:track.outputChannels,channelLayout:track.outputChannelLayout})].filter(Boolean).join(' ')
      : '';
    const technical=outputTechnical?`${sourceTechnical} → ${outputTechnical}`:sourceTechnical;
    return [base,detailTitle,technical].filter(Boolean).join(' — ');
  }

  function subtitleLabel(track,index){
    const language=languageName(track.language);
    const title=String(track.title||'').trim();
    let base=title && !/^subtitle(?: track)? \d+$/i.test(title)?title:(language||`Subtitle Track ${index+1}`);
    if(language && title && !title.toLowerCase().includes(language.toLowerCase()))base=`${language} — ${title}`;
    if(track.sourceType==='external')base+= ' — External';
    if(!track.supported)base+= ' — Unsupported';
    return base;
  }

  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let menuKey = '';
  let lastSaved = 0;
  let lastAutoHidePlaybackState = '';
  function syncAutoHideForPlaybackState(state) {
    const playbackState = String(state?.state || '');
    if(playbackState === lastAutoHidePlaybackState) return;
    lastAutoHidePlaybackState = playbackState;
    if(!state?.active) return;
    if(['RESOLVING','PREPARING','BUFFERING','SEEKING'].includes(playbackState) || !state.wantsPlay || ['ENDED','ERROR'].includes(playbackState)) {
      if(typeof showUI === 'function') showUI();
      return;
    }
    if(playbackState === 'PLAYING' && typeof scheduleHideUI === 'function') scheduleHideUI();
  }
  function render(state) {
    modal.dataset.playbackState = state.state;
    if(!state.active) return;
    const busy = ['RESOLVING','PREPARING','BUFFERING'].includes(state.state);
    syncAutoHideForPlaybackState(state);
    document.getElementById('playerSpinner')?.classList.toggle('on', busy);
    const paused = !state.wantsPlay || ['ENDED','ERROR'].includes(state.state);
    const path = paused ? 'M8 5v14l11-7z' : 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
    const center = document.getElementById('ppCenterBtn') || document.querySelector('.play-pause-center');
    if(center) {
      const stateKey = busy ? 'loading' : paused ? 'paused' : 'playing';
      if(center.dataset.playbackState !== stateKey) center.innerHTML = busy
        ? '<span class="central-playback-spinner" role="status" aria-label="Loading playback"></span>'
        : `<svg id="ppCenterIcon" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
      center.dataset.playbackState = stateKey;
      center.setAttribute('aria-label', paused ? 'Play' : 'Pause');
      center.setAttribute('aria-busy', String(busy));
      center.removeAttribute('aria-disabled');
    }
    const icon = document.getElementById('ppIcon');
    if(icon) icon.innerHTML = `<path d="${path}"/>`;
    setDurationTimer(fmtTime(state.globalCurrentTime), state.globalDuration ? fmtTime(state.globalDuration) : '--:--');
    if(!progressDragging && state.globalDuration) {
      const percent = window.SeekGeometry.percent(state.globalCurrentTime,state.globalDuration);
      document.getElementById('progressPlayed').style.width = percent;
      document.getElementById('progressThumb').style.left = percent;
    }
    document.getElementById('progressBuffered').style.width = window.SeekGeometry.percent(state.health.bufferedEnd || 0,state.globalDuration);
    const progress = document.getElementById('progressWrap');
    progress.setAttribute('role','slider');
    progress.setAttribute('aria-label','Playback position');
    progress.setAttribute('aria-valuemin','0');
    progress.setAttribute('aria-valuemax', String(state.globalDuration));
    progress.setAttribute('aria-valuenow', String(state.globalCurrentTime));
    progress.setAttribute('aria-valuetext', `${fmtTime(state.globalCurrentTime)} of ${fmtTime(state.globalDuration)}`);
    progress.tabIndex = 0;
    const key = JSON.stringify([state.audioTracks,state.subtitleTracks,state.audioIndex,state.subtitleIndex]);
    if(key !== menuKey) {
      menuKey = key;
      // These arrays are read-only view projections for existing layout helpers.
      availableAudio = state.audioTracks.map((track,index) => ({...track,index,title:audioLabel(track,index)}));
      availableSubs = state.subtitleTracks.map((track,index) => ({...track,index,label:subtitleLabel(track,index)}));
      currentAudioIdx = state.audioIndex;
      currentSubIdx = state.subtitleIndex;
      const item = (label, active, action, disabled=false) => `<button type="button" class="pd-item${active?' active':''}${disabled?' disabled':''}" ${disabled?'disabled':`onclick="${action}"`}><span>${escape(label)}</span><span class="check">✓</span></button>`;
      document.getElementById('audioList').innerHTML = availableAudio.map((t,i) => item(t.title,i===state.audioIndex,`setAudio(${i})`)).join('') || item('No audio track',false,'',true);
      document.getElementById('subList').innerHTML = item('Off',state.subtitleIndex<0,'setSub(-1)') + availableSubs.map((t,i) => item(t.label,i===state.subtitleIndex,`setSub(${i})`,!t.supported)).join('');
      updateAudioBtn();
      updateSubBtn();
      refreshPlayerControlVisibility();
    }
    currentSpeed = state.speed;
    updateSpeedBtn();
    updateVolIcon();
    document.getElementById('volSlider').value = state.muted ? 0 : state.volume;
    if(state.error) showPlayerNotice(state.error);
    if(!state.seeking && state.globalDuration && Date.now()-lastSaved > 2000) {
      lastSaved = Date.now();
      updateWatchProgress(state.canonicalMediaId,state.globalCurrentTime,state.globalDuration);
    }
    window.dispatchEvent(new CustomEvent('streamvault:playback-state',{detail:state}));
  }

  const session = window.playerSession = new PlayerSession({
    video,
    resolve:(source, options) => fetchCapability(source,options.signal,options),
    release:async capability => {
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(),5000);
      try { await fetch(backendUrl(`/api/playback-hls/${encodeURIComponent(capability.cacheKey)}/release`),{method:'POST',signal:controller.signal,keepalive:true}); }
      finally { clearTimeout(timer); }
    },
    loadHls:async () => { await loadHlsScript(); return window.Hls; },
    status:async (key,signal) => {
      const response = await fetch(backendUrl('/api/playback/status'),{signal,cache:'no-store'});
      const body = await response.json();
      return body.sessions?.find(item=>item.key===key);
    },
    fetchText:async (url,signal) => {
      const response = await fetch(url,{signal,cache:'force-cache'});
      if(!response.ok) throw new Error('Subtitle track unavailable');
      return response.text();
    },
    onChange:render,
  });

  function start(source) {
    // Live TV hands ownership back before a VOD session is created.
    if(isLiveMode) closePlayer();
    abortPlaybackRequestScope('PlayerSession owns VOD');
    clearMediaStartupWatchdog();
    clearFtpPostStartMetadataSchedule();
    clearAudioLock();
    stopPlayerUiClock();
    if(typeof ensureCentralPlaybackController === 'function') ensureCentralPlaybackController()?.unbind?.();
    if(hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    isLiveMode = false;
    svActivePlaybackType = 'media';
    currentStreamId = source.id || null;
    _ftpStreamUrl = '';
    _ftpNeedsTranscode = false;
    _currentPlaybackPlan = _currentFtpPlaybackPlan = null;
    video._svPlaybackShouldPlay = false;
    video._sourceOffset = 0;
    video._sourceSeekRequired = video._mediaSourceSeekRequired = false;
    video._apiDuration = video._stableDuration = 0;
    video.preload = 'auto';
    clearSubtitleOverlay();
    hidePlayerNotice();
    closeAllDropdowns();
    closeAllSeriesDropdowns();
    document.getElementById('playerTitle').textContent = source.name || '';
    document.getElementById('playerSubTitle').textContent = source.year || '';
    document.getElementById('playerLiveBadge')?.classList.remove('show');
    document.getElementById('progressWrap').classList.remove('live-mode');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    menuKey = '';
    lastAutoHidePlaybackState = '';
    showUI();
    if(isMobilePlaybackClient()) enterMobileLandscapeMode();
    return session.start(source,{resume:current => {
      const saved = watchProgress[current.canonicalMediaId];
      return saved?.progress > .02 && saved.progress < .95 ? saved.progress*current.globalDuration : 0;
    }});
  }
  function close() {
    if(session.canonicalMediaId && session.globalDuration) updateWatchProgress(session.canonicalMediaId,session.globalCurrentTime,session.globalDuration);
    session.close();
    lastAutoHidePlaybackState = '';
    if(typeof clearUiHideTimer === 'function') clearUiHideTimer();
    else clearTimeout(uiHideTimer);
    stopPlayerUiClock();
    resetSeekPreview();
    progressDragging = false;
    document.getElementById('progressWrap').classList.remove('dragging');
    exitMobileLandscapeMode();
    modal.classList.remove('open');
    document.getElementById('playerSpinner').classList.remove('on');
    document.body.style.overflow = '';
    hidePlayerNotice();
    closeAllDropdowns();
    closeAllSeriesDropdowns();
    hideSeriesPlayerBar();
    svActivePlaybackType = 'idle';
  }
  window.StreamVaultPlayerView = {start, close, render};
  window.STREAMVAULT_PLAYER_VERSION = 'controls-autohide-v1';
  window.STREAMVAULT_PLAYER_BUILD = '20260914-controls-autohide-v1';
  video.disablePictureInPicture = false;
  video.removeAttribute('disablepictureinpicture');
})();
