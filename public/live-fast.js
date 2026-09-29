(function(){
  window.openLiveChannel = function(channelId, channelName){
    const t0 = performance.now();
    const liveDebug = (...args) => {
      try {
        if (channelId === 'tsports' || (typeof SV_DEBUG_LOGS !== 'undefined' && SV_DEBUG_LOGS)) {
          console.log('[Live TV:' + channelId + ']', Math.round(performance.now() - t0) + 'ms', ...args);
        }
      } catch {}
    };

    isLiveMode=true;
    currentStreamId=null;
    liveDebug('open', { channelId, channelName });

    if(hlsInstance){try{hlsInstance.destroy();}catch{} hlsInstance=null;}
    if(typeof vid._svLiveCleanup==='function'){
      try{vid._svLiveCleanup();}catch{}
      vid._svLiveCleanup=null;
    }

    clearInterval(vid._pi);
    vid.pause();
    vid.removeAttribute('src');
    try{vid.load();}catch{}
    vid.querySelectorAll('track').forEach(t=>t.remove());

    if(typeof clearSubtitleOverlay==='function')clearSubtitleOverlay();
    if(typeof closeAllDropdowns==='function')closeAllDropdowns();
    if(typeof hidePlayerNotice==='function')hidePlayerNotice();
    if(typeof hideSeriesPlayerBar==='function')hideSeriesPlayerBar();

    const title=document.getElementById('playerTitle');
    const sub=document.getElementById('playerSubTitle');
    const badge=document.getElementById('playerLiveBadge');
    const progress=document.getElementById('progressWrap');
    const spinner=document.getElementById('playerSpinner');

    if(title)title.textContent=channelName;
    if(sub)sub.textContent='Starting live stream...';
    badge?.classList.add('show');
    progress?.classList.add('live-mode');
    document.getElementById('timeDur').textContent='LIVE';
    document.getElementById('timeNow').textContent='';
    document.getElementById('playerModal').classList.add('open');
    spinner?.classList.add('on');
    document.body.style.overflow='hidden';
    if(typeof showUI==='function')showUI();

    const proxySrc = '/live/' + encodeURIComponent(channelId) + '/playlist.m3u8?fast=1';
    const relaySrc = '/live-relay/' + encodeURIComponent(channelId) + '/index.m3u8';
    let src = proxySrc;
    let sourceMode = 'proxy';
    let restartCount=0;
    let networkRecoveryCount=0;
    let mediaRecoveryCount=0;
    let started=false;
    let watchdog=null;
    let stallTimer=null;
    let restartTimer=null;

    function clearStallTimer(){
      if(stallTimer){clearTimeout(stallTimer); stallTimer=null;}
    }

    function hideSpin(){
      started=true;
      restartCount=0;
      spinner?.classList.remove('on');
      if(sub)sub.textContent='';
      if(watchdog)clearTimeout(watchdog);
      clearStallTimer();
    }

    function hardRestart(force=false){
      if(started && !force)return;
      restartCount++;
      clearStallTimer();
      if(restartTimer)return;
      if(sub)sub.textContent='Retrying live stream...';
      const delay=Math.min(5000,400*Math.pow(2,Math.min(restartCount-1,3)));
      liveDebug('schedule relay restart',{delay,restartCount});
      restartTimer=setTimeout(()=>{restartTimer=null;start();},delay);
    }

    function switchToRelay(reason){
      if(sourceMode === 'relay')return false;
      liveDebug('proxy failed; switching to relay fallback',{reason});
      src=relaySrc;
      sourceMode='relay';
      restartCount=0;
      networkRecoveryCount=0;
      mediaRecoveryCount=0;
      clearStallTimer();
      if(sub)sub.textContent='Retrying live stream...';
      if(restartTimer){clearTimeout(restartTimer);restartTimer=null;}
      restartTimer=setTimeout(()=>{restartTimer=null;start();},150);
      return true;
    }

    function nudgeLiveEdge(reason){
      liveDebug('live edge nudge', {reason});
      clearStallTimer();
      try{
        const pos = hlsInstance?.liveSyncPosition;
        if(Number.isFinite(pos) && Math.abs((vid.currentTime || 0) - pos) > 1.5){
          vid.currentTime = Math.max(0, pos);
        }
        hlsInstance?.startLoad?.(-1);
      }catch{}
      try{vid.play().catch(()=>{});}catch{}
    }

    function armStallTimer(reason){
      if(stallTimer)return;
      stallTimer=setTimeout(()=>{
        stallTimer=null;
        const before=Number(vid.currentTime)||0;
        nudgeLiveEdge(reason);
        stallTimer=setTimeout(()=>{
          stallTimer=null;
          const advanced=Math.abs((Number(vid.currentTime)||0)-before)>0.25;
          if(!advanced){
            liveDebug('stall recovery restart',{reason});
            hardRestart(true);
          }
        },6000);
      },5000);
    }

    function start(){
      if(hlsInstance){try{hlsInstance.destroy();}catch{} hlsInstance=null;}

      started=false;
      networkRecoveryCount=0;
      mediaRecoveryCount=0;
      clearStallTimer();
      spinner?.classList.add('on');

      if(watchdog)clearTimeout(watchdog);
      watchdog=setTimeout(()=>{
        liveDebug('first-playback watchdog restart');
        if(switchToRelay('startup watchdog'))return;
        hardRestart(true);
      }, sourceMode === 'proxy' ? 9000 : 15000);
      liveDebug('attach source', {src, sourceMode});

      if(typeof Hls!=='undefined' && Hls.isSupported()){
        hlsInstance=new Hls({
          enableWorker:true,
          startPosition:-1,

          // Sports streams keep a tiny live window; start close to the edge.
          lowLatencyMode:true,
          liveSyncDurationCount:1,
          liveMaxLatencyDurationCount:3,
          maxLiveSyncPlaybackRate:1.25,

          maxBufferLength:12,
          maxMaxBufferLength:24,
          backBufferLength:0,
          maxBufferHole:0.45,
          maxFragLookUpTolerance:0.2,
          liveDurationInfinity:true,

          // Let hls.js choose safely after the server rewrites upstream playlist URLs.
          testBandwidth:true,
          startFragPrefetch:true,
          capLevelToPlayerSize:true,

          manifestLoadingTimeOut:8000,
          levelLoadingTimeOut:8000,
          fragLoadingTimeOut:12000,
          manifestLoadingMaxRetry:2,
          levelLoadingMaxRetry:2,
          fragLoadingMaxRetry:4,
          manifestLoadingRetryDelay:300,
          levelLoadingRetryDelay:300,
          fragLoadingRetryDelay:300
        });

        hlsInstance.on(Hls.Events.MEDIA_ATTACHED,()=>hlsInstance.loadSource(src));

        hlsInstance.on(Hls.Events.MANIFEST_LOADED,(e,data)=>{
          liveDebug('manifest loaded', {
            url:data?.url || src,
            levels:data?.levels?.length || 0,
            stats:data?.stats || null
          });
        });

        hlsInstance.on(Hls.Events.LEVEL_LOADED,(e,data)=>{
          liveDebug('level loaded', {
            url:data?.details?.url || '',
            live:data?.details?.live,
            fragments:data?.details?.fragments?.length || 0
          });
        });

        hlsInstance.on(Hls.Events.FRAG_LOADING,(e,data)=>{
          liveDebug('frag loading', data?.frag?.url || '');
        });

        hlsInstance.on(Hls.Events.FRAG_LOADED,(e,data)=>{
          liveDebug('frag loaded', {
            url:data?.frag?.url || '',
            stats:data?.stats || null
          });
        });

        hlsInstance.on(Hls.Events.MANIFEST_PARSED,()=>{
          liveDebug('manifest parsed');
          vid.play().catch(()=>{});
        });

        hlsInstance.on(Hls.Events.FRAG_BUFFERED,()=>{
          liveDebug('frag buffered');
          hideSpin();
          try{vid.play().catch(()=>{});}catch{}
        });

        hlsInstance.on(Hls.Events.ERROR,(e,data)=>{
          if(!data)return;
          liveDebug(data.fatal ? 'fatal hls error' : 'hls warning', {
            type:data.type,
            details:data.details,
            fatal:data.fatal,
            response:data.response || null
          });

          if(!data.fatal){
            if(sourceMode === 'proxy' && data.details && /manifest|level|frag|load|timeout/i.test(data.details)){
              switchToRelay(data.details);
              return;
            }
            if(data.details && /buffer|stall/i.test(data.details)){
              armStallTimer(data.details);
              try{vid.play().catch(()=>{});}catch{}
            }
            return;
          }

          if(data.type===Hls.ErrorTypes.NETWORK_ERROR){
            if(switchToRelay(data.details || 'fatal network error'))return;
            if(networkRecoveryCount++ < 1){
              try{hlsInstance.startLoad(-1); return;}catch{}
            }
            hardRestart(true);
            return;
          }

          if(data.type===Hls.ErrorTypes.MEDIA_ERROR){
            if(mediaRecoveryCount++ < 1){
              try{hlsInstance.recoverMediaError(); return;}catch{}
            }
            hardRestart(true);
            return;
          }

          hardRestart(true);
        });

        hlsInstance.attachMedia(vid);
        return;
      }

      if(vid.canPlayType('application/vnd.apple.mpegurl')){
        liveDebug('native hls attach', src);
        vid.src=src;
        vid.play().catch(()=>{});
        return;
      }

      loadHlsScript().then(ok=>{
        if(ok && typeof Hls!=='undefined' && Hls.isSupported()) start();
        else {
          spinner?.classList.remove('on');
          if(typeof showToast==='function')showToast('HLS not supported');
        }
      });
    }

    const onPlaying=()=>{ liveDebug('video playing'); hideSpin(); };
    const onCanplay=()=>{ liveDebug('video canplay'); hideSpin(); };
    const onLoadedData=()=>{ liveDebug('video loadeddata'); hideSpin(); };
    const onWaiting=()=>{ liveDebug('video waiting'); armStallTimer('waiting'); };
    const onStalled=()=>{ liveDebug('video stalled'); armStallTimer('stalled'); };
    const onError=()=>{
      liveDebug('video error',vid.error?.code||0);
      if(switchToRelay('native video error'))return;
      hardRestart(true);
    };
    vid.addEventListener('playing', onPlaying);
    vid.addEventListener('canplay', onCanplay);
    vid.addEventListener('loadeddata', onLoadedData);
    vid.addEventListener('waiting', onWaiting);
    vid.addEventListener('stalled', onStalled);
    vid.addEventListener('error', onError);
    vid._svLiveCleanup=()=>{
      if(watchdog){clearTimeout(watchdog); watchdog=null;}
      if(restartTimer){clearTimeout(restartTimer); restartTimer=null;}
      clearStallTimer();
      vid.removeEventListener('playing', onPlaying);
      vid.removeEventListener('canplay', onCanplay);
      vid.removeEventListener('loadeddata', onLoadedData);
      vid.removeEventListener('waiting', onWaiting);
      vid.removeEventListener('stalled', onStalled);
      vid.removeEventListener('error', onError);
    };

    start();
  };
})();
