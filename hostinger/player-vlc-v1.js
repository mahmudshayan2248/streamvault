(function streamVaultVlcPlayerV1(){
  'use strict';

  if(window.StreamVaultVlcPlayerV1)return;
  const video=document.getElementById('videoPlayer');
  const modal=document.getElementById('playerModal');
  if(!video || !modal)return;

  const legacy={
    playMedia:window.playMedia,
    playFtpMedia:window.playFtpMedia,
    setAudio:window.setAudio,
    setSub:window.setSub,
    closePlayer:window.closePlayer,
  };
  const STATES={
    IDLE:'IDLE',
    LOADING_METADATA:'LOADING_METADATA',
    PREPARING_SOURCE:'PREPARING_SOURCE',
    READY:'READY',
    PLAYING:'PLAYING',
    BUFFERING:'BUFFERING',
    PAUSED:'PAUSED',
    ENDED:'ENDED',
    ERROR:'ERROR',
  };
  const session={
    active:false,
    sequence:0,
    state:STATES.IDLE,
    abort:null,
    cleanups:[],
    spinnerTimer:0,
    bufferTimer:0,
    capability:null,
    source:null,
    hls:null,
    metrics:null,
    seekSequence:0,
    releasePromise:Promise.resolve(),
  };

  function transition(next,detail){
    session.state=next;
    modal.dataset.playbackState=next;
    if(window.dispatchEvent){
      window.dispatchEvent(new CustomEvent('streamvault:playback-state',{detail:{state:next,...(detail||{})}}));
    }
  }

  function addCleanup(fn){session.cleanups.push(fn);return fn;}
  function listen(target,event,handler,options){
    target.addEventListener(event,handler,options);
    addCleanup(()=>target.removeEventListener(event,handler,options));
  }
  function clearSessionTimers(){
    clearTimeout(session.spinnerTimer);
    clearTimeout(session.bufferTimer);
    session.spinnerTimer=0;
    session.bufferTimer=0;
  }
  function spinner(on){document.getElementById('playerSpinner')?.classList.toggle('on',!!on);}
  function delayedSpinner(delay=200){
    clearTimeout(session.spinnerTimer);
    session.spinnerTimer=setTimeout(()=>{if(session.active)spinner(true);},delay);
  }
  function stopBufferSpinner(){
    clearTimeout(session.bufferTimer);
    session.bufferTimer=0;
    spinner(false);
  }

  function destroyEngine(){
    try{if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}}catch(_){ }
    session.hls=null;
    try{video.querySelectorAll('track[data-sv-v2]').forEach(track=>track.remove());}catch(_){ }
    try{for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode='disabled';}catch(_){ }
    try{clearSubtitleOverlay?.();}catch(_){ }
    try{playerAttachedSourceKey='';playerSourceAttachToken+=1;}catch(_){ }
  }

  function resetSession(reason='reset'){
    const release=releaseCompatibilitySession(session.capability);
    session.releasePromise=Promise.allSettled([session.releasePromise,release]).then(()=>undefined);
    session.sequence+=1;
    session.seekSequence+=1;
    session.active=false;
    try{session.abort?.abort();}catch(_){ }
    session.abort=null;
    clearSessionTimers();
    session.cleanups.splice(0).forEach(fn=>{try{fn();}catch(_){ }});
    destroyEngine();
    session.capability=null;
    session.source=null;
    session.hls=null;
    session.metrics=null;
    transition(STATES.IDLE,{reason});
    return session.releasePromise;
  }

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

  async function releaseCompatibilitySession(capability){
    const key=String(capability?.cacheKey||'');
    if(!key)return false;
    try{
      const response=await fetch(backendUrl(`/api/playback-hls/${encodeURIComponent(key)}/release`),{
        method:'POST',cache:'no-store',keepalive:true
      });
      return response.ok;
    }catch(_){return false;}
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

  function defaultAudioIndex(tracks){
    const selected=tracks.findIndex(track=>track.default);
    return selected>=0?selected:0;
  }

  function releaseLegacyAudioAuthority(){
    try{
      svMediaPlayerState.audioLocked=false;
      svMediaPlayerState.serverAudioIndex=null;
      svMediaPlayerState.manifestAudioIndex=null;
    }catch(_){ }
    video._svAudioLockedIndex=null;
    video._svMappedAudioStartupRequired=false;
    clearAudioLock?.();
  }

  function renderCapabilityAudioOnly(capability){
    releaseLegacyAudioAuthority();
    availableAudio=(capability.audioTracks||[]).map((track,index)=>({
      ...track,
      index,
      title:audioLabel(track,index),
      hls:capability.mode==='hls',
      hlsIndex:index,
    }));
    if(!availableAudio.length)availableAudio=[{index:0,title:'Default Audio'}];
    const engineIndex=Number(hlsInstance?.audioTrack);
    currentAudioIdx=Number.isInteger(engineIndex) && engineIndex>=0
      ? Math.min(availableAudio.length-1,engineIndex)
      : Math.min(availableAudio.length-1,defaultAudioIndex(availableAudio));
    setAppliedAudioIndex?.(currentAudioIdx,'playback v2 startup');
    renderAudioTracks?.();
  }

  function renderCapabilityMenus(capability){
    renderCapabilityAudioOnly(capability);

    availableSubs=(capability.subtitleTracks||[]).map((track,index)=>({
      ...track,
      index,
      label:subtitleLabel(track,index),
      lang:track.language||'en',
      src:track.url,
    }));
    currentSubIdx=-1;
    const list=document.getElementById('subList');
    if(list){
      const escape=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      list.innerHTML='<div class="pd-item active" onclick="setSub(-1)"><span>Off</span><span class="check">✓</span></div>'+
        (availableSubs.length?availableSubs.map((track,index)=>`<div class="pd-item${track.supported?'':' disabled'}" onclick="setSub(${index})"><span>${escape(track.label)}</span><span class="check">✓</span></div>`).join(''):'<div class="pd-item disabled"><span>No subtitles found</span></div>');
    }
    updateSubBtn?.();
    refreshPlayerControlVisibility?.();
  }

  async function hydrateRemoteSidecars(source,sequence){
    if(source.kind!=='remote' || !session.active)return;
    try{
      const hydrated=await fetchCapability(source,session.abort.signal,{sidecars:true});
      if(!session.active || sequence!==session.sequence)return;
      session.capability.subtitleTracks=hydrated.subtitleTracks||session.capability.subtitleTracks||[];
      availableSubs=(session.capability.subtitleTracks||[]).map((track,index)=>({
        ...track,
        index,
        label:subtitleLabel(track,index),
        lang:track.language||'en',
        src:track.url,
      }));
      if(currentSubIdx>=availableSubs.length)currentSubIdx=-1;
      renderCapabilityMenusSubtitlesOnly();
      updateSubBtn?.();
      refreshPlayerControlVisibility?.();
    }catch(error){
      if(error?.name!=='AbortError')console.debug('[Playback v2] external subtitle discovery unavailable',error.message);
    }
  }

  function playerShell(source){
    isLiveMode=false;
    svActivePlaybackType='media';
    try{svBeginMediaPlayback(source.kind==='remote'?'ftp':'local',source.kind==='remote'?source.url:source.id,source.name||'');}catch(_){ }
    closeAllDropdowns?.();
    closeAllSeriesDropdowns?.();
    hidePlayerNotice?.();
    clearMediaStartupWatchdog?.();
    try{clearFtpPostStartMetadataSchedule?.();}catch(_){ }
    try{resetFtpHeavyPlaybackState?.();}catch(_){ }
    video.pause();
    video.removeAttribute('src');
    try{video.load();}catch(_){ }
    destroyEngine();
    currentStreamId=source.kind==='local'?source.id:null;
    _ftpStreamUrl=source.kind==='remote'?source.url:'';
    _ftpDuration=0;
    _ftpCurrentTime=0;
    _ftpNeedsTranscode=false;
    _currentPlaybackPlan=null;
    _currentFtpPlaybackPlan=null;
    currentQuality='auto';
    currentSubIdx=-1;
    currentAudioIdx=0;
    availableAudio=[];
    availableSubs=[];
    video._sourceOffset=0;
    video._sourceSeekRequired=false;
    video._mediaSourceSeekRequired=false;
    video._svPlaybackShouldPlay=true;
    video._apiDuration=0;
    video._stableDuration=0;
    video.playbackRate=currentSpeed||1;
    document.getElementById('playerTitle').textContent=source.name||'';
    document.getElementById('playerSubTitle').textContent=source.year||'';
    document.getElementById('playerLiveBadge')?.classList.remove('show');
    document.getElementById('progressWrap')?.classList.remove('live-mode');
    document.getElementById('progressPlayed').style.width='0%';
    document.getElementById('progressBuffered').style.width='0%';
    document.getElementById('progressThumb').style.left='0%';
    setDurationTimer?.('0:00','--:--');
    modal.classList.add('open');
    document.body.style.overflow='hidden';
    if(isMobilePlaybackClient?.())enterMobileLandscapeMode?.();
    showUI?.();
    spinner(false);
    delayedSpinner();
  }

  function bindPlaybackEvents(sequence){
    const current=()=>session.active && sequence===session.sequence;
    listen(video,'loadedmetadata',()=>{
      if(!current())return;
      if(session.capability)renderCapabilityAudioOnly(session.capability);
      if(Number.isFinite(video.duration) && video.duration>0)setPlayerDuration?.(video.duration,'native');
      transition(STATES.READY);
      stopBufferSpinner();
    });
    listen(video,'canplay',()=>{if(current()){transition(video.paused?STATES.READY:STATES.PLAYING);stopBufferSpinner();}});
    listen(video,'playing',()=>{if(current()){
      transition(STATES.PLAYING);
      stopBufferSpinner();
      if(session.metrics && !session.metrics.firstPlayingAt)session.metrics.firstPlayingAt=performance.now();
      if(session.metrics?.activeBufferStart){
        session.metrics.bufferEvents.push({startedAt:session.metrics.activeBufferStart,endedAt:performance.now(),durationMs:performance.now()-session.metrics.activeBufferStart});
        session.metrics.activeBufferStart=0;
      }
    }});
    listen(video,'pause',()=>{if(current() && !video.ended){transition(STATES.PAUSED);stopBufferSpinner();}});
    listen(video,'waiting',()=>{
      if(!current())return;
      if(session.metrics && !session.metrics.activeBufferStart)session.metrics.activeBufferStart=performance.now();
      clearTimeout(session.bufferTimer);
      session.bufferTimer=setTimeout(()=>{if(current()){transition(STATES.BUFFERING);spinner(true);}},200);
    });
    listen(video,'stalled',()=>{
      if(!current())return;
      if(session.metrics && !session.metrics.activeBufferStart)session.metrics.activeBufferStart=performance.now();
      clearTimeout(session.bufferTimer);
      session.bufferTimer=setTimeout(()=>{if(current()){transition(STATES.BUFFERING);spinner(true);}},200);
    });
    listen(video,'seeking',()=>{
      if(!current())return;
      clearTimeout(session.bufferTimer);
      session.bufferTimer=setTimeout(()=>{if(current())spinner(true);},180);
    });
    listen(video,'seeked',()=>{if(current())stopBufferSpinner();});
    listen(video,'ended',()=>{if(current()){transition(STATES.ENDED);stopBufferSpinner();}});
    listen(video,'error',()=>{
      if(!current() || hlsInstance)return;
      failPlayback('Browser cannot decode this source');
    });
  }

  function shouldUseNativeHls(){
    if(!video.canPlayType('application/vnd.apple.mpegurl'))return false;
    const ua=String(navigator.userAgent||'');
    const ios=/iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && Number(navigator.maxTouchPoints)>1);
    const safari=/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS|Firefox/i.test(ua);
    return ios || safari;
  }

  async function attachHls(capability,sequence){
    const src=capability.hlsUrl;
    if(shouldUseNativeHls()){
      video.src=src;
      playerAttachedSourceKey=`hls|${src}`;
      return true;
    }
    const loaded=await loadHlsScript();
    if(!session.active || sequence!==session.sequence)throw new DOMException('Stale playback request','AbortError');
    if(!loaded || typeof Hls==='undefined' || !Hls.isSupported())throw new Error('Compatibility HLS is not supported by this browser');
    return new Promise((resolve,reject)=>{
      let settled=false;
      let networkRetries=0;
      let mediaRetries=0;
      const hls=new Hls({
        enableWorker:true,
        lowLatencyMode:false,
        startFragPrefetch:true,
        backBufferLength:45,
        maxBufferLength:isMobilePlaybackClient?.()?24:60,
        maxMaxBufferLength:isMobilePlaybackClient?.()?60:120,
        manifestLoadingTimeOut:30000,
        levelLoadingTimeOut:30000,
        fragLoadingTimeOut:30000,
      });
      hlsInstance=hls;
      session.hls=hls;
      const finish=(ok,error)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timeout);
        if(error)reject(error);else resolve(ok);
      };
      const stale=()=>!session.active || sequence!==session.sequence || hls!==hlsInstance;
      hls.on(Hls.Events.MEDIA_ATTACHED,()=>{if(!stale())hls.loadSource(src);});
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{
        if(stale())return finish(false,new DOMException('Stale playback request','AbortError'));
        const selected=Math.min(currentAudioIdx,Math.max(0,hls.audioTracks.length-1));
        if(hls.audioTracks.length)hls.audioTrack=hls.audioTracks[selected]?.id??selected;
        playerAttachedSourceKey=`hls|${src}`;
        finish(true);
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED,()=>{
        if(stale() || !hls.audioTracks.length)return;
        const selected=Math.min(currentAudioIdx,hls.audioTracks.length-1);
        hls.audioTrack=hls.audioTracks[selected]?.id??selected;
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED,(_event,data)=>{
        if(stale())return;
        const selected=hls.audioTracks.findIndex(track=>track.id===data?.id);
        if(selected>=0 && selected<availableAudio.length){
          currentAudioIdx=selected;
          setAppliedAudioIndex?.(selected,'playback v2 HLS track switch');
          renderAudioTracks?.();
        }
      });
      hls.on(Hls.Events.ERROR,(_event,data)=>{
        if(stale())return;
        if(session.metrics)session.metrics.hlsErrors.push({
          at:performance.now(),type:data?.type||'',details:data?.details||'',fatal:!!data?.fatal,
          reason:String(data?.reason||data?.error?.message||'').slice(0,240)
        });
        if(!data?.fatal)return;
        if(data.type===Hls.ErrorTypes.NETWORK_ERROR && networkRetries<2){
          networkRetries+=1;
          setTimeout(()=>{if(!stale()){try{hls.startLoad();}catch(_){hls.loadSource(src);}}},networkRetries*500);
          return;
        }
        if(data.type===Hls.ErrorTypes.MEDIA_ERROR && mediaRetries<1){
          mediaRetries+=1;
          try{hls.recoverMediaError();return;}catch(_){ }
        }
        const error=new Error(`Compatibility stream failed${data?.details?`: ${data.details}`:''}`);
        if(settled)failPlayback(userError(error));
        else finish(false,error);
      });
      const timeout=setTimeout(()=>finish(false,new Error('Compatibility stream startup timed out')),35000);
      hls.attachMedia(video);
    });
  }

  async function attachCapability(capability,sequence){
    transition(STATES.PREPARING_SOURCE,{mode:capability.mode,strategy:capability.strategy});
    const src=capability.mode==='direct'?capability.directUrl:capability.hlsUrl;
    if(!src)throw new Error('No playable source was returned');
    if(capability.mode==='hls')return attachHls(capability,sequence);
    video.src=src;
    playerAttachedSourceKey=`direct|${src}`;
    return true;
  }

  function userError(error){
    if(error?.code==='SOURCE_MISSING')return 'Source file missing';
    if(error?.code==='PLAYBACK_BUSY')return 'Compatibility stream is busy';
    if(error?.name==='TypeError')return 'Unable to reach media server';
    if(/decode|codec/i.test(error?.message||''))return 'Browser cannot decode this source';
    if(/HLS|compatibility/i.test(error?.message||''))return 'Compatibility stream failed';
    return 'Unable to play this media';
  }

  function failPlayback(message){
    transition(STATES.ERROR,{message});
    stopBufferSpinner();
    showPlayerNotice?.(message);
    showToast?.(message);
  }

  async function start(source){
    await resetSession('new media');
    session.active=true;
    session.sequence+=1;
    const sequence=session.sequence;
    session.source=source;
    session.metrics={
      startedAt:performance.now(),firstPlayingAt:0,activeBufferStart:0,
      bufferEvents:[],hlsErrors:[],seekEvents:[],source:{...source}
    };
    session.abort=new AbortController();
    try{beginPlaybackRequestScope?.('playback v2 startup');}catch(_){ }
    if(source.kind==='local'){
      try{
        const movie=movies.find(item=>String(item.id)===String(source.id))||{};
        recordWatchHistory?.(source.id,movie.name||source.name,movie.genre||'','movie');
      }catch(_){ }
    }
    playerShell(source);
    bindPlaybackEvents(sequence);
    transition(STATES.LOADING_METADATA);
    try{
      const capability=await fetchCapability(source,session.abort.signal);
      if(!session.active || sequence!==session.sequence)return;
      session.capability=capability;
      renderCapabilityMenus(capability);
      video._sourceOffset=Number(capability.windowStart)||0;
      if(Number(capability.duration)>0){
        if(source.kind==='remote')_ftpDuration=Number(capability.duration);
        setPlayerDuration?.(Number(capability.duration),'api');
      }
      const attached=await attachCapability(capability,sequence);
      if(!attached || !session.active || sequence!==session.sequence)return;
      video.playbackRate=currentSpeed||1;
      try{
        await video.play();
        transition(STATES.PLAYING);
      }catch(error){
        if(error?.name==='NotAllowedError'){
          transition(STATES.READY);
          updatePlayIcons?.(true);
          showUI?.();
        }else throw error;
      }
      setTimeout(()=>hydrateRemoteSidecars(source,sequence),0);
    }catch(error){
      if(error?.name==='AbortError' || !session.active || sequence!==session.sequence)return;
      console.error('[Playback v2] startup failed',error);
      failPlayback(error.endpointUnavailable?'Player service unavailable':userError(error));
    }
  }

  function seekInsideCurrentHlsWindow(target){
    const offset=Number(session.capability?.windowStart)||0;
    const localTarget=target-offset;
    if(localTarget<0 || !video.seekable?.length)return false;
    for(let index=0;index<video.seekable.length;index++){
      const start=video.seekable.start(index);
      const end=video.seekable.end(index);
      if(localTarget>=start && localTarget<=end){
        video.currentTime=Math.min(localTarget,Math.max(start,end-0.05));
        return true;
      }
    }
    return false;
  }

  async function seekHlsWindow(targetSeconds){
    if(!session.active || session.capability?.mode!=='hls' || !session.source)return false;
    const duration=Number(session.capability.duration)||0;
    const target=Math.max(0,duration?Math.min(duration-1,targetSeconds):targetSeconds);
    if(seekInsideCurrentHlsWindow(target))return true;
    const seekSequence=++session.seekSequence;
    const sequence=session.sequence;
    const startedAt=performance.now();
    const wasPaused=video.paused;
    const audioIndex=currentAudioIdx;
    const subtitleIndex=currentSubIdx;
    const oldCapability=session.capability;
    transition(STATES.PREPARING_SOURCE,{mode:'hls',strategy:'seek-window',target});
    spinner(true);
    try{
      const capability=await fetchCapability(session.source,session.abort.signal,{start:target});
      if(!session.active || sequence!==session.sequence || seekSequence!==session.seekSequence)return false;
      if(capability.mode!=='hls')throw new Error('Seek window did not return HLS');
      destroyEngine();
      await releaseCompatibilitySession(oldCapability);
      if(!session.active || sequence!==session.sequence || seekSequence!==session.seekSequence)return false;
      video.pause();
      video.removeAttribute('src');
      try{video.load();}catch(_){ }
      session.capability=capability;
      renderCapabilityMenus(capability);
      currentAudioIdx=Math.min(audioIndex,Math.max(0,availableAudio.length-1));
      setAppliedAudioIndex?.(currentAudioIdx,'playback v2 seek window');
      renderAudioTracks?.();
      video._sourceOffset=Number(capability.windowStart)||target;
      if(session.source.kind==='remote')_ftpCurrentTime=video._sourceOffset;
      await attachHls(capability,sequence);
      if(!session.active || sequence!==session.sequence || seekSequence!==session.seekSequence)return false;
      video.playbackRate=currentSpeed||1;
      if(!wasPaused)await video.play();
      else transition(STATES.READY);
      if(subtitleIndex>=0 && availableSubs[subtitleIndex]?.supported)setSubV2(subtitleIndex);
      stopBufferSpinner();
      session.metrics?.seekEvents.push({target,windowStart:video._sourceOffset,durationMs:performance.now()-startedAt,ok:true});
      return true;
    }catch(error){
      if(error?.name==='AbortError' || !session.active || sequence!==session.sequence || seekSequence!==session.seekSequence)return false;
      session.metrics?.seekEvents.push({target,durationMs:performance.now()-startedAt,ok:false,error:String(error.message||error)});
      failPlayback(userError(error));
      return false;
    }
  }

  function preserveTrackSwitchState(action){
    const snapshot={
      time:Number(video.currentTime)||0,
      paused:video.paused,
      rate:video.playbackRate,
      volume:video.volume,
      muted:video.muted,
    };
    action();
    video.playbackRate=snapshot.rate;
    video.volume=snapshot.volume;
    video.muted=snapshot.muted;
    setTimeout(()=>{
      if(!session.active)return;
      if(Math.abs((Number(video.currentTime)||0)-snapshot.time)>1){
        try{video.currentTime=snapshot.time;}catch(_){ }
      }
      video.playbackRate=snapshot.rate;
      if(snapshot.paused && !video.paused)video.pause();
      if(!snapshot.paused && video.paused)video.play().catch(()=>{});
    },250);
    return snapshot;
  }

  function setAudioV2(index){
    if(!session.active || !session.capability || isLiveMode)return legacy.setAudio?.(index);
    releaseLegacyAudioAuthority();
    const track=availableAudio[index];
    if(!track)return showToast?.('Audio track unavailable');
    if(index===currentAudioIdx){closeAllDropdowns?.();return;}
    let switched=false;
    const sourceBefore=video.currentSrc;
    preserveTrackSwitchState(()=>{
      if(hlsInstance && Array.isArray(hlsInstance.audioTracks) && hlsInstance.audioTracks.length){
        const hlsTrack=hlsInstance.audioTracks[index];
        if(hlsTrack){hlsInstance.audioTrack=hlsTrack.id??index;switched=true;}
      }else if(video.audioTracks?.length){
        for(let i=0;i<video.audioTracks.length;i++)video.audioTracks[i].enabled=i===index;
        switched=index<video.audioTracks.length;
      }
    });
    if(!switched){
      closeAllDropdowns?.();
      return showToast?.('Audio track unavailable in this browser');
    }
    currentAudioIdx=index;
    setAppliedAudioIndex?.(index,'playback v2 source-preserving switch');
    renderAudioTracks?.();
    closeAllDropdowns?.();
    showToast?.(`Audio: ${track.title||audioLabel(track,index)}`);
    console.debug('[Playback v2] audio switch',{index,time:video.currentTime,sourceUnchanged:sourceBefore===video.currentSrc});
  }

  function setSubV2(index){
    if(!session.active || !session.capability || isLiveMode)return legacy.setSub?.(index);
    const selected=index>=0?availableSubs[index]:null;
    if(selected && (!selected.supported || !selected.src)){
      closeAllDropdowns?.();
      return showToast?.(selected.unsupportedReason||'Subtitle track unavailable');
    }
    const sourceBefore=video.currentSrc;
    const snapshot={time:video.currentTime,paused:video.paused,rate:video.playbackRate,volume:video.volume,muted:video.muted};
    video.querySelectorAll('track[data-sv-v2]').forEach(track=>track.remove());
    try{for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode='disabled';}catch(_){ }
    currentSubIdx=selected?index:-1;
    if(selected){
      const element=document.createElement('track');
      element.kind='subtitles';
      element.label=selected.label;
      element.srclang=selected.lang||'en';
      element.src=selected.src;
      element.default=true;
      element.dataset.svV2='1';
      element.setAttribute('data-idx',String(index));
      element.addEventListener('load',()=>{
        try{element.track.mode='hidden';updateSubtitleOverlay?.();}catch(_){ }
      },{once:true});
      element.addEventListener('error',()=>showToast?.('Subtitle track unavailable'),{once:true});
      video.appendChild(element);
      try{element.track.mode='hidden';}catch(_){ }
    }else{
      clearSubtitleOverlay?.();
    }
    video.playbackRate=snapshot.rate;
    video.volume=snapshot.volume;
    video.muted=snapshot.muted;
    if(snapshot.paused && !video.paused)video.pause();
    renderCapabilityMenusSubtitlesOnly();
    closeAllDropdowns?.();
    updateSubBtn?.();
    showToast?.(selected?`Subtitles: ${selected.label}`:'Subtitles off');
    console.debug('[Playback v2] subtitle switch',{index:currentSubIdx,time:video.currentTime,sourceUnchanged:sourceBefore===video.currentSrc});
  }

  function renderCapabilityMenusSubtitlesOnly(){
    const list=document.getElementById('subList');
    if(!list)return;
    const escape=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    list.innerHTML=`<div class="pd-item${currentSubIdx===-1?' active':''}" onclick="setSub(-1)"><span>Off</span><span class="check">✓</span></div>`+
      (availableSubs.length?availableSubs.map((track,index)=>`<div class="pd-item${index===currentSubIdx?' active':''}${track.supported?'':' disabled'}" onclick="setSub(${index})"><span>${escape(track.label)}</span><span class="check">✓</span></div>`).join(''):'<div class="pd-item disabled"><span>No subtitles found</span></div>');
  }

  async function togglePictureInPictureV2(){
    if(!session.active || !document.pictureInPictureEnabled || !video.requestPictureInPicture){
      showToast?.('Picture-in-Picture is not available');
      return;
    }
    try{
      if(document.pictureInPictureElement)await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    }catch(error){showToast?.('Picture-in-Picture could not start');}
  }

  function closeV2(){
    resetSession('player close');
    return legacy.closePlayer?.();
  }

  window.playMedia=(id,name,year)=>start({kind:'local',id,name:name||'',year:year||''});
  window.playFtpMedia=(url,name,year)=>start({kind:'remote',url:String(url||''),name:name||'',year:year||''});
  window.setAudio=setAudioV2;
  window.setSub=setSubV2;
  window.closePlayer=closeV2;
  window.togglePictureInPicture=togglePictureInPictureV2;
  try{
    const openLegacyDropdown=openDropdown;
    openDropdown=(id,button)=>{
      if(session.active && session.capability && (id==='audioDD' || id==='subDD')){
        const remoteSource=_ftpStreamUrl;
        const localSource=currentStreamId;
        _ftpStreamUrl='';
        currentStreamId=null;
        try{return openLegacyDropdown(id,button);}
        finally{
          _ftpStreamUrl=remoteSource;
          currentStreamId=localSource;
        }
      }
      return openLegacyDropdown(id,button);
    };
  }catch(_){ }
  try{
    const applyLegacyAudioAuthority=svApplyServerAudioAuthority;
    svApplyServerAudioAuthority=(...args)=>{
      if(session.active && session.capability){
        releaseLegacyAudioAuthority();
        return false;
      }
      return applyLegacyAudioAuthority(...args);
    };
  }catch(_){ }
  try{
    const seekToTimeLegacy=seekToTime;
    seekToTime=(seconds)=>{
      if(session.active && session.capability?.mode==='hls'){
        seekHlsWindow(Number(seconds)||0).catch(error=>failPlayback(userError(error)));
        return;
      }
      if(session.active && session.capability?.mode==='direct'){
        const requested=Number(seconds)||0;
        const duration=Number(video.duration);
        const target=Number.isFinite(duration) && duration>0
          ? Math.max(0,Math.min(requested,Math.max(0,duration-.05)))
          : Math.max(0,requested);
        video.currentTime=target;
        return;
      }
      return seekToTimeLegacy(seconds);
    };
  }catch(_){ }
  try{video.disablePictureInPicture=false;}catch(_){ }
  video.removeAttribute('disablepictureinpicture');
  window.STREAMVAULT_PLAYER_BUILD='20260904-player-v7.1';
  window.STREAMVAULT_PLAYER_VERSION='player-v7';
  window.StreamVaultVlcPlayerV1={version:'player-v7',STATES,session,start,reset:resetSession};
  console.log('[Playback v2] VLC-like capability player-v7 active');
})();
