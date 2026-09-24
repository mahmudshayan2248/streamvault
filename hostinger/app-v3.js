window.API_BASE = window.STREAMVAULT_CONFIG?.backendOrigin || window.API_BASE || '';
window.StreamVaultPlayerUi?.installDisplayTextRepair?.(document);
function svBackendUrl(value){
  return window.StreamVaultConfig?.normalizeBackendUrls?.(value) ?? value;
}
function svNormalizeBackendUrls(value){
  return window.StreamVaultConfig?.normalizeBackendUrls?.(value) ?? value;
}
const SV_THEME_KEY = 'sv_theme';
const SV_MEDIA_FIX_MARKER = 'SV_MEDIA_FIX_ACTIVE_stable_tracks_layout';
const SV_ASSET_VERSION = '20260716-backend-audio-authority-v1';
const SV_SMOOTH_BUFFER_TRIGGER_COUNT = Math.max(1, Number(window.SMOOTH_BUFFER_TRIGGER_COUNT || 3) || 3);
const svNativeConsoleLog = (()=>{try{return console.log.bind(console);}catch(_){return ()=>{};}})();
function svLiveConsoleLog(...args){
  try{svNativeConsoleLog(...args);}catch(_){}
}
function svDebugLoggingEnabled(){
  try{
    return new URLSearchParams(location.search).has('debug')
      || localStorage.getItem('sv_debug') === '1'
      || localStorage.getItem('sv_media_logs') === '1';
  }catch(_){
    return false;
  }
}
function mediaFixLog(step, data={}){
  try{
    if(svDebugLoggingEnabled())console.warn(`[${SV_MEDIA_FIX_MARKER}] ${step}`, data);
  }catch(_){}
}
try{
  window.SV_MEDIA_FIX_MARKER = SV_MEDIA_FIX_MARKER;
  window.SV_ASSET_VERSION = SV_ASSET_VERSION;
  mediaFixLog('active', {assetVersion: SV_ASSET_VERSION});
}catch(_){}
const SV_DEBUG_LOGS = svDebugLoggingEnabled();
const svPlaybackSessionApi=window.StreamVaultPlaybackSession || null;
const svAudioSession=svPlaybackSessionApi?.createAudioSessionController?.({
  debug:SV_DEBUG_LOGS,
  logger:console
}) || {
  begin:context=>({key:String(context?.sourceIdentity || ''),preferredLanguage:null,preferredLanguageReason:'fallback',manualIndex:null}),
  clear:()=>{},
  restore:()=>{},
  select:tracks=>({selectedIndex:(tracks || []).findIndex(audioTrackIsAudible),selectedTrack:(tracks || []).find(audioTrackIsAudible) || null,reason:'fallback-first-playable',manual:false}),
  setManual:()=>true,
  setPreferredLanguage:()=>false,
  snapshot:()=>({}),
};
if(!SV_DEBUG_LOGS){
  console.log = function(){};
  console.debug = function(){};
  console.info = function(){};
}
function preferredTheme(){
  try{return localStorage.getItem(SV_THEME_KEY) || 'light';}catch{return 'light';}
}
function applyTheme(theme, persist=true){
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content', next === 'dark' ? '#070708' : '#f7f7f4');
  if(persist){
    try{localStorage.setItem(SV_THEME_KEY, next);}catch{}
  }
  const btn = document.getElementById('themeToggle');
  if(btn)btn.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}
function toggleTheme(){
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}
applyTheme(preferredTheme(), false);
// ══════════════════ STATE ══════════════════
let trendingMovies = [], trendingSeries = [];
let _rowSeen = new Map();
let movies=[],series=[],channels=[];
let heroMovies=[],heroIdx=0,heroTimer=null;
let currentTab='discover';
let watchProgress={};
try{watchProgress=JSON.parse(localStorage.getItem('sv_progress')||'{}');}catch{}
let watchHistory=[];
try{watchHistory=JSON.parse(localStorage.getItem('sv_history')||'[]');}catch{}
let movieWatchlist=[];
try{movieWatchlist=JSON.parse(localStorage.getItem('sv_movie_watchlist')||'[]');}catch{}
let seriesWatchlist=[];
try{seriesWatchlist=JSON.parse(localStorage.getItem('sv_series_watchlist')||'[]');}catch{}
let _movieDetailRegistry = new Map();
let _movieDetailSeq = 0;
let _seriesDetailRegistry = new Map();
let _seriesDetailSeq = 0;
let _titleDetailsCache = new Map();
let _titleDetailsToken = 0;
let detailRequestController = null;
let detailRequestToken = 0;
let svDetailHistoryLock = false;
let svPlayerReturnState = null;
let svPlayerReturnItem = null;
let svPlayerLaunchSnapshot = null;
let svPlayerLaunchItem = null;
let svPlayerClosePending = false;
let svModalArtworkToken = 0;
let svModalPreloadActive = 0;
const svModalArtworkPreviewCache = new Map();
const svModalArtworkHdCache = new Map();
const svModalArtworkFailureCache = new Map();
const svModalArtworkDecodeCache = new Map();
const svModalArtworkDimensionsCache = new Map();
const svModalPreloadQueue = [];
const SV_MODAL_ARTWORK_CACHE_LIMIT = 80;
const SV_MODAL_PRELOAD_LIMIT = 2;
const SV_MODAL_ARTWORK_RETRY_COOLDOWN_MS = 15000;
const svMediaInfoDataCache = new Map();
const svMediaInfoPromiseCache = new Map();
let currentDetailMovie = null;
let currentMediaModalItem=null;
let currentMediaModalType='movie';
let mediaModalRenderToken=0;
let mediaModalBodyOverflow='';
let svMediaModalSelectedEpisode=null;
let currentStreamId=null,currentQuality='auto',currentSpeed=1,currentSubIdx=-1;
let availableSubs=[];
let _localTrackLoadPromise=null;
let currentShow=null,currentSeason=1;
let _playerShow=null,_playerSeason=null,_playerEpIdx=null;
let uiHideTimer=null,uiVisible=true;
let isDragging=false,lastTapTime=0,lastTapX=0;
let progressDragging=false,progressDragTime=0;
let playerHovering=false;
let seekPreviewVisible=false;
let seekPreviewRaf=0;
let seekPreviewPending=null;
let seekPreviewMetrics=null;
let seekPreviewMoveRaf=0;
let seekPreviewMovePending=null;
let seekPreviewHideTimer=null;
let playerDomCache=null;
let playerProgressRaf=0;
let playerProgressPending=null;
let playerBufferedRaf=0;
let playerBufferedPending=null;
let subtitleOverlayRaf=0;
let playerUiClock=null;
let playerUiHeavyRenderAt=0;
let playerPointerRaf=0;
let playerSourceAttachToken=0;
let playerAttachedSourceKey='';
let playerPlayToken=0;
let playerPlayPromise=null;
let playbackRequestController=null;
let playbackRequestToken=0;
let currentLiveCat='All';
let isLiveMode=false;
let hlsInstance=null;
let _hlsLoader=null;
let _currentPlaybackPlan=null;
let _currentFtpPlaybackPlan=null;
let svActivePlaybackType='idle';
const svMediaPlayerState={
  playbackType:'idle',
  mediaKind:'',
  sourceKey:'',
  title:'',
  selectedSourceUrl:'',
  recoverySourceUrl:'',
  fallbackReason:'',
  serverAudioIndex:null,
  manifestAudioIndex:null,
  manualAudioIndex:null,
  sessionKey:'',
  mediaType:'',
  mediaId:'',
  season:null,
  episode:null,
  sourceIdentity:'',
  preferredAudioLanguage:null,
  preferredAudioReason:'',
  audioSelectionReason:'',
  audioLocked:false,
  sessionToken:0
};
const svLivePlayerState={
  playbackType:'idle',
  currentChannelId:'',
  currentChannelName:'',
  selectedSourceUrl:'',
  fallbackSourceUrl:'',
  recoverySourceUrl:'',
  fallbackReason:'',
  sessionToken:0
};
const SV_PLAYER_TIMEUPDATE_MIN_MS = 180;
const SV_PLAYER_PROGRESS_MIN_MS = 250;
const SV_PLAYER_WAITING_MIN_MS = 450;
const SV_PLAYER_SEEKING_MIN_MS = 120;
let svMediaAudioWatchdogTimer=null;
let liveCongestionScore=0;
let liveLastSwitchTime=0;
let lastSwitchDirection=0;
const MIN_LEVEL=0;
const ABR_SWITCH_INTERVAL=8000;
let abrFreezeUntil=0;
let liveAbrTimer=null;
let liveRecoveryTimer=null;

function svPlaybackStateLog(step, data={}){
  try{
    if(step !== 'blocked live fallback attempt' && !svDebugLoggingEnabled())return;
    console.warn('[Playback State]', step, data);
  }catch(_){}
}

function svPlayerNow(){
  try{return performance.now();}catch(_){return Date.now();}
}

function svThrottlePlayerEvent(key, minMs){
  const video=svPlayerVideo();
  if(!video)return true;
  const state=video._svEventThrottle || (video._svEventThrottle = {});
  const now=svPlayerNow();
  if(now - (state[key] || 0) < minMs)return false;
  state[key]=now;
  return true;
}

function svAbortPendingPlayRequest(reason=''){
  playerPlayToken += 1;
  playerPlayPromise = null;
  if(SV_DEBUG_LOGS && reason)console.debug('[Playback] aborted pending play:', reason);
}

function svAbortPendingPlayerTasks(reason=''){
  svAbortPendingPlayRequest(reason);
  try{if(vid)vid._seekToken=(vid._seekToken || 0) + 1;}catch(_){}
}

function svCanonicalSource(value){
  try{return new URL(String(value || ''), window.location.href).href;}catch(_){return String(value || '').trim();}
}

function svPlayerSourceKey(src, mode){
  return `${String(mode || 'direct').toLowerCase()}|${svCanonicalSource(src)}`;
}

function svCurrentVideoSourceMatches(src){
  const current=svCanonicalSource(vid?.currentSrc || vid?.getAttribute?.('src') || vid?.src || '');
  return !!current && current === svCanonicalSource(src);
}

function svPlayerSourceAlreadyAttached(src, mode, isHls){
  if(!playerAttachedSourceKey || playerAttachedSourceKey !== svPlayerSourceKey(src, mode))return false;
  if(vid?.error)return false;
  if(isHls)return !!hlsInstance || svCurrentVideoSourceMatches(src);
  return svCurrentVideoSourceMatches(src);
}

function svStalePlaybackError(reason='Stale playback request'){
  try{return new DOMException(reason, 'AbortError');}catch(_){
    const error=new Error(reason);
    error.name='AbortError';
    return error;
  }
}

function svPlayVideo(reason='', options={}){
  if(window.playerSession?.active) { return window.playerSession.play(); }

  const scope=options.scope || null;
  if(scope && !isCurrentPlaybackScope(scope))return Promise.resolve(false);
  if(playerPlayPromise && !options.force)return playerPlayPromise;
  const token=++playerPlayToken;
  let rawPromise;
  try{rawPromise=vid.play();}catch(error){rawPromise=Promise.reject(error);}
  playerPlayPromise=Promise.resolve(rawPromise)
    .then(()=>true)
    .catch(error=>{
      if(token !== playerPlayToken || (scope && !isCurrentPlaybackScope(scope)))return false;
      if(error?.name === 'AbortError')return false;
      if(typeof options.onError === 'function')return options.onError(error);
      throw error;
    })
    .finally(()=>{
      if(token === playerPlayToken)playerPlayPromise=null;
    });
  if(SV_DEBUG_LOGS && reason)playerPlayPromise.catch(()=>{});
  return playerPlayPromise;
}

function beginPlaybackRequestScope(reason='playback'){
  playbackRequestToken += 1;
  svAbortPendingPlayerTasks(reason);
  try{playbackRequestController?.abort?.();}catch(_){}
  playbackRequestController = new AbortController();
  playbackRequestController._svReason = reason;
  return { token:playbackRequestToken, signal:playbackRequestController.signal, reason };
}

function isCurrentPlaybackScope(scope){
  return !!scope && scope.token === playbackRequestToken && !scope.signal?.aborted;
}

function abortPlaybackRequestScope(reason='playback stopped'){
  playbackRequestToken += 1;
  svAbortPendingPlayerTasks(reason);
  try{playbackRequestController?.abort?.();}catch(_){}
  playbackRequestController = null;
  if(SV_DEBUG_LOGS)console.debug('[Playback] aborted stale requests:', reason);
}

function svPlayerVideo(){
  try{return typeof vid !== 'undefined' ? vid : null;}catch(_){return null;}
}

function svAudioResetSearchText(src=''){
  const parts=[
    src,
    svMediaPlayerState.selectedSourceUrl,
    svMediaPlayerState.sourceKey,
    svMediaPlayerState.title,
    typeof _ftpStreamUrl !== 'undefined' ? _ftpStreamUrl : '',
    document.getElementById('playerTitle')?.textContent || ''
  ];
  return parts.map(value=>String(value || '')).join(' ');
}

function svIsLighthouseMediaSource(src=''){
  return /(?:^|[^a-z0-9])lighthouse(?:[^a-z0-9]|$)/i.test(svAudioResetSearchText(src));
}

function svIsHlsMediaSource(src='', mode='direct'){
  return String(mode || '').toLowerCase() === 'hls' || /\.m3u8(?:$|\?)/i.test(String(src || ''));
}

function svIsCompatibilityMediaSource(src='', mode='direct'){
  const normalizedMode=String(mode || '').toLowerCase();
  if(['stream','audio','remux'].includes(normalizedMode))return true;
  const value=String(src || '');
  return /\/api\/ftp\/stream(?:\?|$)/i.test(value)
    || (/\/api\/playback\/(?:local|ftp)(?:\/|\?)/i.test(value) && /[?&]mode=(?:audio|remux)(?:&|$)/i.test(value));
}

function svMediaAudioResetContext(src='', mode='direct', options={}){
  const playbackType=options.playbackType || ((isLiveMode && svActivePlaybackType === 'live') ? 'live' : 'media');
  if(playbackType === 'live' || svActivePlaybackType === 'live' || svPlayerVideo()?._svPlaybackType === 'live')return null;
  const isHls=svIsHlsMediaSource(src, mode);
  const isLighthouse=svIsLighthouseMediaSource(src);
  const isCompatibility=svIsCompatibilityMediaSource(src, mode);
  if(!isHls && !isLighthouse && !isCompatibility)return null;
  return {
    sourceKey:svPlayerSourceKey(src, mode),
    src:String(src || ''),
    mode:String(mode || 'direct'),
    isHls,
    isLighthouse,
    isCompatibility,
    hasManifestAudio:false,
    nativeReady:false,
    lastReloadAt:0
  };
}

function svSetMediaAudioResetContext(src='', mode='direct', options={}){
  const video=svPlayerVideo();
  if(!video)return null;
  const context=svMediaAudioResetContext(src, mode, options);
  video._svAudioResetContext=context;
  if(context)svEnsureMediaAudioWatchdog();
  return context;
}

function svSyncVolumeUi(video=svPlayerVideo()){
  try{
    const slider=document.getElementById('volSlider');
    if(slider && video)slider.value=video.muted ? 0 : video.volume;
    if(typeof updateVolIcon === 'function')updateVolIcon();
  }catch(_){}
}

function svAudioDebugAssignment(caller, previousTrack, targetTrack, reason, extra={}){
  try{
    if(window.SV_AUDIO_DEBUG !== true)return;
    const {target,previous,...details}=extra;
    svLiveConsoleLog('[SV AUDIO ASSIGNMENT]',{
      caller:String(caller || 'unknown'),
      mediaSessionKey:svMediaPlayerState.sessionKey || '',
      preferredLanguage:svMediaPlayerState.preferredAudioLanguage || null,
      targetTrack:target ?? targetTrack,
      previousTrack:previous ?? previousTrack,
      targetIndex:targetTrack !== null && targetTrack !== undefined && Number.isInteger(Number(targetTrack))
        ? Number(targetTrack)
        : null,
      previousIndex:previousTrack !== null && previousTrack !== undefined && Number.isInteger(Number(previousTrack))
        ? Number(previousTrack)
        : null,
      reason:String(reason || ''),
      ...details,
    });
  }catch(_){}
}

function svSetCurrentAudioIndex(index, caller='audio selection', reason=''){
  const next=Number(index);
  if(!Number.isInteger(next) || next < 0)return false;
  const previous=currentAudioIdx;
  currentAudioIdx=next;
  svAudioDebugAssignment(caller,previous,next,reason,{
    assignment:'selectedAudioIndex',
    target:audioDebugSummary(availableAudio[next],next),
    previous:audioDebugSummary(availableAudio[previous],previous),
  });
  return true;
}

function svAssignHlsAudioTrack(hls, targetIndex, caller, reason, logicalIndex){
  const next=Number(targetIndex);
  if(!hls || !Number.isInteger(next) || next < 0 || !hls.audioTracks?.[next])return false;
  const previous=Number(hls.audioTrack);
  if(previous !== next)hls.audioTrack=next;
  svAudioDebugAssignment(caller,previous,next,reason,{
    assignment:'hls.audioTrack',
    logicalIndex,
    target:audioDebugSummary(hls.audioTracks[next],next),
    previous:audioDebugSummary(hls.audioTracks[previous],previous),
  });
  return Number(hls.audioTrack) === next;
}

function svAssignNativeAudioTrack(nativeTracks, targetIndex, caller, reason, logicalIndex){
  const next=Number(targetIndex);
  if(!Array.isArray(nativeTracks) || !Number.isInteger(next) || next < 0 || !nativeTracks[next])return false;
  const previous=nativeTracks.findIndex(track=>track?.enabled);
  nativeTracks.forEach((track,index)=>{
    try{track.enabled=index===next;}catch(_){}
  });
  svAudioDebugAssignment(caller,previous,next,reason,{
    assignment:'audioTracks[index].enabled',
    logicalIndex,
    target:audioDebugSummary(nativeTracks[next],next),
    previous:audioDebugSummary(nativeTracks[previous],previous),
  });
  return true;
}

function svResolveActualAudioIndex(tracks, logicalTrack, logicalIndex, preferredLanguage){
  if(!Array.isArray(tracks) || !tracks.length)return -1;
  const mapped=Number(logicalTrack?.hlsIndex);
  if(Number.isInteger(mapped) && mapped >= 0 && tracks[mapped])return mapped;
  const nativeTrack=logicalTrack?.nativeTrack;
  if(nativeTrack){
    const nativeIndex=tracks.indexOf(nativeTrack);
    if(nativeIndex >= 0)return nativeIndex;
  }
  if(preferredLanguage){
    const languageIndex=tracks.findIndex(track=>
      svPlaybackSessionApi?.trackLanguage?.(track) === preferredLanguage &&
      audioTrackIsAudible(track)
    );
    if(languageIndex >= 0)return languageIndex;
  }
  if(tracks.length === 1)return 0;
  if(Number.isInteger(logicalIndex) && logicalIndex >= 0 && tracks[logicalIndex] && audioTrackIsAudible(tracks[logicalIndex]))return logicalIndex;
  return tracks.findIndex(audioTrackIsAudible);
}

function svApplyActiveAudioAuthority(hls=hlsInstance, video=svPlayerVideo(), caller='active audio authority', options={}){
  if(window.playerSession && !isLiveMode) return;

  if(svActivePlaybackType !== 'media')return false;
  const logicalTracks=Array.isArray(options.logicalTracks) && options.logicalTracks.length
    ? options.logicalTracks
    : availableAudio;
  if(!Array.isArray(logicalTracks) || !logicalTracks.length)return false;
  const decision=Number.isInteger(Number(options.logicalIndex)) && Number(options.logicalIndex) >= 0
    ? {
        selectedIndex:Number(options.logicalIndex),
        selectedTrack:logicalTracks[Number(options.logicalIndex)] || null,
        manual:svMediaPlayerState.manualAudioIndex !== null,
        reason:options.reason || caller,
      }
    : svPreferredAudioDecision(logicalTracks,options.reason || caller);
  const logicalIndex=Math.max(0,Math.min(logicalTracks.length-1,Number(decision.selectedIndex) || 0));
  const logicalTrack=logicalTracks[logicalIndex] || null;
  const logicalLanguage=svPlaybackSessionApi?.trackLanguage?.(logicalTrack) || '';
  const preferredLanguage=decision.manual
    ? logicalLanguage
    : (svMediaPlayerState.preferredAudioLanguage || logicalLanguage);
  const reason=String(options.reason || decision.reason || caller);

  svSetCurrentAudioIndex(logicalIndex,caller,reason);
  if(svMediaPlayerState.manualAudioIndex === null){
    const previous=svMediaPlayerState.serverAudioIndex;
    svMediaPlayerState.serverAudioIndex=logicalIndex;
    svAudioDebugAssignment(caller,previous,logicalIndex,reason,{
      assignment:'serverAudioIndex',
      target:audioDebugSummary(logicalTrack,logicalIndex),
    });
  }

  let applied=false;
  if(options.applyDiscovered !== false){
    const hlsTracks=Array.isArray(hls?.audioTracks) ? hls.audioTracks : [];
    if(hlsTracks.length){
      const targetIndex=svResolveActualAudioIndex(hlsTracks,logicalTrack,logicalIndex,preferredLanguage);
      if(targetIndex >= 0){
        applied=svAssignHlsAudioTrack(hls,targetIndex,caller,reason,logicalIndex);
        if(applied){
          const previous=svMediaPlayerState.manifestAudioIndex;
          svMediaPlayerState.manifestAudioIndex=targetIndex;
          svAudioDebugAssignment(caller,previous,targetIndex,reason,{
            assignment:'manifestAudioIndex',
            logicalIndex,
          });
        }
      }
    }else{
      const nativeList=video?.audioTracks;
      const nativeTracks=Number.isFinite(Number(nativeList?.length))
        ? Array.from({length:Number(nativeList.length)},(_,index)=>nativeList[index]).filter(Boolean)
        : [];
      if(nativeTracks.length){
        const targetIndex=svResolveActualAudioIndex(nativeTracks,logicalTrack,logicalIndex,preferredLanguage);
        if(targetIndex >= 0)applied=svAssignNativeAudioTrack(nativeTracks,targetIndex,caller,reason,logicalIndex);
      }
    }
  }

  if(video)video._svAudioLockedIndex=logicalIndex;
  setAppliedAudioIndex(logicalIndex,reason);
  svMediaPlayerState.audioLocked=true;
  svMediaPlayerState.audioSelectionReason=reason;
  svAudioDebugAssignment(caller,null,logicalIndex,reason,{
    assignment:'active-audio-authority',
    appliedToDiscoveredTracks:applied,
    preferredLanguage,
    target:audioDebugSummary(logicalTrack,logicalIndex),
  });
  renderAudioTracks();
  return true;
}

function svForceMediaAudioOutput(video=svPlayerVideo(), reason='audio reset'){
  if(window.playerSession && !isLiveMode) return;

  if(!video)return false;
  let changed=false;
  if(video.muted){
    video.muted=false;
    changed=true;
  }
  if(video.volume !== 1){
    video.volume=1;
    changed=true;
  }
  if(changed){
    svSyncVolumeUi(video);
    mediaFixLog('forced media audio output', {reason, muted:video.muted, volume:video.volume});
  }
  return changed;
}

function svShouldForceMediaAudioOutput(video, context){
  if(!video || !context)return false;
  return context.isHls || context.isLighthouse || video.muted === true || Number(video.volume) === 0;
}

function svSelectDefaultHlsAudioTrack(hls, video=svPlayerVideo(), reason='HLS audio reset'){
  if(video?._svAudioResetContext)video._svAudioResetContext.hasManifestAudio=true;
  return svApplyActiveAudioAuthority(hls,video,'svSelectDefaultHlsAudioTrack',{reason});
}

function svCaptureServerAudioDecision(payload, caller='svCaptureServerAudioDecision'){
  const index=Number(payload?.audioIndex ?? payload?.defaultAudioIndex);
  const preferredLanguage=svPlaybackSessionApi?.normalizeLanguage?.(payload?.preferredAudioLanguage);
  if(preferredLanguage){
    const previous=svMediaPlayerState.preferredAudioLanguage;
    svMediaPlayerState.preferredAudioLanguage=preferredLanguage;
    svMediaPlayerState.preferredAudioReason=String(payload?.titleLanguageReason || 'server-preferred-language');
    svAudioSession.setPreferredLanguage(preferredLanguage,svMediaPlayerState.preferredAudioReason);
    svAudioDebugAssignment(caller,previous,preferredLanguage,svMediaPlayerState.preferredAudioReason,{
      assignment:'preferredAudioLanguage',
    });
  }
  if(payload?.audioSelectionReason)svMediaPlayerState.audioSelectionReason=String(payload.audioSelectionReason);
  const manualIndex=svMediaPlayerState.manualAudioIndex === null ? NaN : Number(svMediaPlayerState.manualAudioIndex);
  if(Number.isInteger(manualIndex) && manualIndex >= 0){
    const previous=svMediaPlayerState.serverAudioIndex;
    svMediaPlayerState.serverAudioIndex=manualIndex;
    svAudioDebugAssignment(caller,previous,manualIndex,'manual session authority',{
      assignment:'serverAudioIndex',
    });
    return true;
  }
  if(Number.isInteger(index) && index >= 0){
    if(svMediaPlayerState.audioLocked && svMediaPlayerState.preferredAudioLanguage){
      svAudioDebugAssignment(caller,index,svMediaPlayerState.serverAudioIndex,'ignored later server default after preferred-language lock',{
        assignment:'serverAudioIndex',
        ignored:true,
      });
      return false;
    }
    if(Number(svMediaPlayerState.serverAudioIndex) !== index && !Array.isArray(hlsInstance?.audioTracks)){
      svMediaPlayerState.audioLocked=false;
      const video=svPlayerVideo();
      if(video)video._svAudioLockedIndex=null;
    }
    const previous=svMediaPlayerState.serverAudioIndex;
    svMediaPlayerState.serverAudioIndex=index;
    svAudioDebugAssignment(caller,previous,index,payload?.audioSelectionReason || 'server audio decision',{
      assignment:'serverAudioIndex',
    });
  }
  return Number.isInteger(index) && index >= 0;
}

function svApplyServerAudioAuthority(hls=hlsInstance, video=svPlayerVideo(), reason='server audio authority'){
  if(window.playerSession && !isLiveMode) return;

  return svApplyActiveAudioAuthority(hls,video,'svApplyServerAudioAuthority',{reason});
}

function svSelectDefaultNativeAudioTrack(video=svPlayerVideo(), reason='native audio reset'){
  return svApplyActiveAudioAuthority(null,video,'svSelectDefaultNativeAudioTrack',{reason});
}

function svArmNativeAudioResetOnLoad(context, reason='source load'){
  if(window.playerSession && !isLiveMode) return;

  const video=svPlayerVideo();
  if(!video || !context)return;
  const sourceKey=context.sourceKey;
  const sessionKey=svMediaPlayerState.sessionKey;
  const reset=event=>{
    const active=video._svAudioResetContext;
    if(!active || active.sourceKey !== sourceKey || svMediaPlayerState.sessionKey !== sessionKey)return;
    active.nativeReady=true;
    const eventReason=`${reason}: ${event?.type || 'track discovery'}`;
    svApplyActiveAudioAuthority(null,video,'svArmNativeAudioResetOnLoad',{reason:eventReason});
    if(svShouldForceMediaAudioOutput(video, active))svForceMediaAudioOutput(video, eventReason);
  };
  video.addEventListener('loadedmetadata', reset, {once:true});
  video.addEventListener('canplay', reset, {once:true});
  video.addEventListener('playing', reset, {once:true});
}

function svResetMediaAudioOnSourceSwitch(context, reason='stream switch', options={}){
  if(window.playerSession && !isLiveMode) return;

  const video=svPlayerVideo();
  if(!video || !context)return;
  const authorityRaw=svMediaPlayerState.manualAudioIndex ?? svMediaPlayerState.serverAudioIndex;
  const serverIndex=authorityRaw === null || authorityRaw === undefined ? NaN : Number(authorityRaw);
  if(hlsInstance && context.isHls)svSelectDefaultHlsAudioTrack(hlsInstance,video,reason);
  else if(Number.isInteger(serverIndex) && serverIndex >= 0)svApplyServerAudioAuthority(null,video,reason);
  if(svShouldForceMediaAudioOutput(video, context))svForceMediaAudioOutput(video, reason);
  if(options.reload){
    try{video.load();}catch(_){}
  }
}

function svMediaAudioWatchdogSilent(video, context){
  const hlsTracks=hlsInstance && Array.isArray(hlsInstance.audioTracks) ? hlsInstance.audioTracks : [];
  const nativeList=video.audioTracks;
  const nativeLength=Number.isFinite(Number(nativeList?.length)) ? Number(nativeList.length) : null;
  const hlsMissingSelection=context.isHls && hlsTracks.length > 0
    && (Number(hlsInstance.audioTrack) < 0 || Number(hlsInstance.audioTrack) >= hlsTracks.length);
  const nativeMissing=context.isLighthouse && context.nativeReady && nativeLength === 0;
  if(context.isCompatibility && video.muted !== true && Number(video.volume) !== 0 && !hlsMissingSelection)return false;
  return video.muted === true || Number(video.volume) === 0 || hlsMissingSelection || nativeMissing;
}

function svReloadMediaForAudio(video, context, reason='audio watchdog'){
  const now=Date.now();
  if(now - (context.lastReloadAt || 0) < 4500)return;
  context.lastReloadAt=now;
  const wasPlaying=!video.paused;
  mediaFixLog('audio watchdog reload', {
    reason,
    mode:context.mode,
    isHls:context.isHls,
    isLighthouse:context.isLighthouse,
    isCompatibility:context.isCompatibility
  });
  try{video.load();}catch(_){}
  if(wasPlaying)svPlayVideo('audio watchdog reload', {force:true}).catch(()=>{});
}

function svRunMediaAudioWatchdog(){
  if(window.playerSession && !isLiveMode) return;

  const video=svPlayerVideo();
  const context=video?._svAudioResetContext;
  if(!video || !context)return;
  if(svActivePlaybackType === 'live' || video._svPlaybackType === 'live')return;
  if(!svMediaAudioWatchdogSilent(video, context))return;
  if(context.isHls)svSelectDefaultHlsAudioTrack(hlsInstance, video, 'audio watchdog');
  else svSelectDefaultNativeAudioTrack(video, 'audio watchdog');
  svForceMediaAudioOutput(video, 'audio watchdog');
  svReloadMediaForAudio(video, context, 'audio watchdog');
}

function svEnsureMediaAudioWatchdog(){
  if(svMediaAudioWatchdogTimer)return;
  svMediaAudioWatchdogTimer=setInterval(svRunMediaAudioWatchdog, 5000);
}

function svDecodeForGuard(value){
  const text=String(value || '');
  try{return decodeURIComponent(text);}catch(_){return text;}
}

function svNormalizeGuardUrl(value){
  try{return new URL(String(value || ''), window.location.href).href;}catch(_){return String(value || '').trim();}
}

function svLiveChannelGuardEntries(){
  const list=Array.isArray(channels) ? channels : [];
  const entries=[];
  list.forEach(channel=>{
    if(!channel)return;
    const id=String(channel.id || '').trim().toLowerCase();
    const name=String(channel.name || '').trim().toLowerCase();
    const urls=[channel.url, ...(Array.isArray(channel.fallbackUrls) ? channel.fallbackUrls : [])]
      .map(svNormalizeGuardUrl)
      .filter(Boolean);
    entries.push({id,name,urls});
  });
  if(!entries.some(entry=>entry.id === 'tsports')){
    entries.push({id:'tsports',name:'t sports',urls:[]});
  }
  return entries;
}

function svLiveSourceBlockReason(src){
  const raw=String(src || '').trim();
  if(!raw)return '';
  const decoded=svDecodeForGuard(raw);
  const normalized=svNormalizeGuardUrl(decoded);
  const lower=decoded.toLowerCase();
  const normalizedLower=normalized.toLowerCase();

  let parsed=null;
  try{parsed=new URL(decoded, window.location.href);}catch(_){}
  const path=(parsed?.pathname || '').toLowerCase();
  const pathParts=path.split('/').filter(Boolean).map(part=>svDecodeForGuard(part).toLowerCase());

  if(path.startsWith('/live/'))return 'media source points at /live';
  if(path.startsWith('/live-relay/'))return 'media source points at /live-relay';
  if(lower.includes('/live/') || lower.includes('/live-relay/'))return 'media source contains live route';
  if(lower.includes('playlist.m3u8'))return 'media source contains live playlist';
  if(/\btsports(?:hd)?\b|t[ ._-]*sports/i.test(decoded))return 'media source contains T Sports';

  const nestedValues=[];
  if(parsed){
    ['url','src','streamUrl','movie','movieUrl'].forEach(name=>{
      const value=parsed.searchParams.get(name);
      if(value)nestedValues.push(value);
    });
  }
  for(const value of nestedValues){
    const nestedReason=svLiveSourceBlockReason(value);
    if(nestedReason)return nestedReason;
  }

  for(const entry of svLiveChannelGuardEntries()){
    if(entry.id && pathParts.includes(entry.id))return `media source contains live channel id ${entry.id}`;
    if(entry.name === 't sports' && /t[ ._-]*sports/i.test(decoded))return 'media source contains T Sports';
    if(entry.urls.some(url=>url && (normalizedLower === url.toLowerCase() || lower.includes(url.toLowerCase())))){
      return `media source matches live channel ${entry.id || entry.name || 'source'}`;
    }
  }
  return '';
}

function svShowBlockedLiveMediaSource(src, reason, context={}){
  setCentralPlaybackLoading(false);
  showPlayerNotice('Media playback failed. Live TV fallback was blocked for this movie or episode.');
  svPlaybackStateLog('blocked live fallback attempt', {
    playbackType:'media',
    selectedSourceUrl:src,
    fallbackReason:context.fallbackReason || context.reason || '',
    mode:context.mode || '',
    reason
  });
}

function svAssertNoLiveSourceForMedia(src, context={}){
  const reason=svLiveSourceBlockReason(src);
  if(!reason)return true;
  svShowBlockedLiveMediaSource(src, reason, context);
  return false;
}

function svSameDecodedUrl(a,b){
  try{return new URL(svDecodeForGuard(a), window.location.href).href === new URL(svDecodeForGuard(b), window.location.href).href;}catch(_){
    return String(a || '').trim() === String(b || '').trim();
  }
}

function svMediaSourceMatchesExpected(src, expected={}){
  const value=String(src || '');
  let parsed=null;
  try{parsed=new URL(value, window.location.href);}catch(_){return true;}
  if(expected.localId !== undefined && expected.localId !== null){
    const id=String(expected.localId);
    const parts=parsed.pathname.split('/').filter(Boolean).map(part=>svDecodeForGuard(part));
    if(parsed.pathname.startsWith('/stream/'))return parts[1] === id;
    if(parsed.pathname.startsWith('/api/playback/local/'))return parts[3] === id;
    if(parsed.pathname.startsWith('/api/mobile-hls/local/'))return parts[3] === id;
  }
  if(expected.ftpUrl){
    const nested=parsed.searchParams.get('url') || parsed.searchParams.get('streamUrl') || parsed.searchParams.get('movie') || parsed.searchParams.get('movieUrl') || parsed.searchParams.get('src');
    if(nested)return svSameDecodedUrl(nested, expected.ftpUrl);
    return svSameDecodedUrl(value, expected.ftpUrl);
  }
  return true;
}

function validateMediaPlaybackSource(src, step, expected={}){
  if(!validPlaybackSourceUrl(src))throw new Error(`Invalid ${step || 'fallback'} playback source`);
  const context={fallbackReason:step || expected.fallbackReason || '', mode:expected.mode || ''};
  if(!svAssertNoLiveSourceForMedia(src, context))throw new Error('Blocked live TV fallback for media playback');
  if(!svMediaSourceMatchesExpected(src, expected)){
    svPlaybackStateLog('blocked mismatched media source', {
      playbackType:'media',
      selectedSourceUrl:src,
      fallbackReason:step || expected.fallbackReason || '',
      expectedLocalId:expected.localId ?? null,
      expectedFtpUrl:expected.ftpUrl || ''
    });
    throw new Error('Fallback source did not match current media');
  }
  return src;
}

function svStopLivePlaybackForMedia(reason='media playback start'){
  const player=svPlayerVideo();
  svLivePlayerState.sessionToken++;
  if(typeof player?._svLiveCleanup === 'function'){
    try{player._svLiveCleanup();}catch(_){}
    player._svLiveCleanup=null;
  }
  svLivePlayerState.playbackType='idle';
  svLivePlayerState.currentChannelId='';
  svLivePlayerState.currentChannelName='';
  svLivePlayerState.selectedSourceUrl='';
  svLivePlayerState.fallbackSourceUrl='';
  svLivePlayerState.recoverySourceUrl='';
  svLivePlayerState.fallbackReason=reason;
}

function svPlaybackMediaId(item, fallback=''){
  return item?.tmdbId || item?.id || item?.streamId || item?.name || item?.title || fallback || '';
}

function svPlaybackContextForMovie(movie={}){
  return {
    mediaType:'movie',
    mediaId:svPlaybackMediaId(movie, movie.streamUrl),
    sourceIdentity:movie.streamId ?? movie.id ?? movie.streamUrl ?? movie.file ?? movie.name ?? '',
    title:movie.name || movie.title || '',
    titleMetadata:{...movie,title:movie.name || movie.title || '',filename:movie.file || movie.filename || ''},
    item:movie,
  };
}

function svPlaybackContextForEpisode(show={}, season=null, epIdx=null, episode={}){
  return {
    mediaType:'series',
    mediaId:svPlaybackMediaId(show, show.name),
    season:Number.isFinite(Number(season)) ? Number(season) : null,
    episode:Number.isFinite(Number(episode?.episode ?? epIdx)) ? Number(episode?.episode ?? epIdx) : null,
    sourceIdentity:episode?.streamId ?? episode?.streamUrl ?? episode?.file ?? `${show.name || ''}:s${season}:e${epIdx}`,
    title:show.name || show.title || '',
    titleMetadata:{
      ...show,
      ...episode,
      title:show.name || show.title || '',
      name:show.name || show.title || '',
      filename:episode?.file || episode?.filename || '',
      streamUrl:episode?.streamUrl || '',
      mediaType:'episode',
    },
    item:show,
  };
}

function svPlaybackContextForSource(sourceKey, title=''){
  const source=svCanonicalSource(sourceKey);
  const movie=movies.find(item=>svCanonicalSource(item?.streamUrl || item?.file || '') === source);
  if(movie)return svPlaybackContextForMovie(movie);
  for(const show of series){
    for(const [seasonValue,episodes] of Object.entries(show?.seasons || {})){
      const epIdx=(Array.isArray(episodes) ? episodes : []).findIndex(episode=>
        svCanonicalSource(episode?.streamUrl || episode?.file || '') === source
      );
      if(epIdx >= 0)return svPlaybackContextForEpisode(show,Number(seasonValue),epIdx,episodes[epIdx]);
    }
  }
  return {
    mediaType:'movie',
    mediaId:sourceKey || title,
    sourceIdentity:sourceKey || title,
    title,
    titleMetadata:{title,name:title,source:sourceKey,streamUrl:sourceKey},
  };
}

function svBeginMediaPlayback(mediaKind, sourceKey, title='', suppliedContext={}){
  svStopLivePlaybackForMedia(`${mediaKind || 'media'} playback start`);
  const fallbackContext=mediaKind === 'ftp'
    ? svPlaybackContextForSource(sourceKey,title)
    : {
      mediaType:'movie',
      mediaId:sourceKey,
      sourceIdentity:sourceKey,
      title,
      titleMetadata:{title,name:title,source:sourceKey},
    };
  const context={
    ...fallbackContext,
    ...(suppliedContext || {}),
    title:title || suppliedContext?.title || fallbackContext.title || '',
    titleMetadata:{
      ...(fallbackContext.titleMetadata || {}),
      ...(suppliedContext?.titleMetadata || {}),
    },
  };
  const audioSession=svAudioSession.begin(context);
  svActivePlaybackType='media';
  svMediaPlayerState.playbackType='media';
  svMediaPlayerState.mediaKind=mediaKind || 'media';
  svMediaPlayerState.sourceKey=String(sourceKey ?? '');
  svMediaPlayerState.title=String(context.title || title || '');
  svMediaPlayerState.selectedSourceUrl='';
  svMediaPlayerState.recoverySourceUrl='';
  svMediaPlayerState.fallbackReason='';
  svMediaPlayerState.serverAudioIndex=null;
  svMediaPlayerState.manifestAudioIndex=null;
  svMediaPlayerState.manualAudioIndex=null;
  svMediaPlayerState.sessionKey=String(audioSession.key || '');
  svMediaPlayerState.mediaType=String(context.mediaType || 'movie');
  svMediaPlayerState.mediaId=String(context.mediaId || sourceKey || '');
  svMediaPlayerState.season=context.season ?? null;
  svMediaPlayerState.episode=context.episode ?? null;
  svMediaPlayerState.sourceIdentity=String(context.sourceIdentity ?? sourceKey ?? '');
  svMediaPlayerState.preferredAudioLanguage=audioSession.preferredLanguage || null;
  svMediaPlayerState.preferredAudioReason=audioSession.preferredLanguageReason || '';
  svMediaPlayerState.audioSelectionReason='';
  svMediaPlayerState.audioLocked=false;
  svMediaPlayerState.sessionToken++;
  const player=svPlayerVideo();
  if(player)player._svPlaybackType='media';
  svPlaybackStateLog('begin media playback', {
    playbackType:'media',
    mediaKind:svMediaPlayerState.mediaKind,
    sourceKey:svMediaPlayerState.sourceKey,
    mediaSessionKey:svMediaPlayerState.sessionKey,
    preferredAudioLanguage:svMediaPlayerState.preferredAudioLanguage,
    preferredAudioReason:svMediaPlayerState.preferredAudioReason,
    title:svMediaPlayerState.title
  });
  return svMediaPlayerState.sessionToken;
}

function svBeginLivePlayback(channelId, channelName=''){
  abortPlaybackRequestScope('live playback start');
  svActivePlaybackType='live';
  svMediaPlayerState.playbackType='idle';
  svMediaPlayerState.audioLocked=false;
  svMediaPlayerState.serverAudioIndex=null;
  svMediaPlayerState.manifestAudioIndex=null;
  svMediaPlayerState.manualAudioIndex=null;
  svMediaPlayerState.sessionKey='';
  svMediaPlayerState.preferredAudioLanguage=null;
  svMediaPlayerState.preferredAudioReason='';
  svAudioSession.clear();
  svPlayerReturnState=null;
  svPlayerReturnItem=null;
  svPlayerLaunchSnapshot=null;
  svPlayerLaunchItem=null;
  svMediaPlayerState.selectedSourceUrl='';
  svMediaPlayerState.recoverySourceUrl='';
  svMediaPlayerState.fallbackReason='';
  svLivePlayerState.playbackType='live';
  svLivePlayerState.currentChannelId=String(channelId || '');
  svLivePlayerState.currentChannelName=String(channelName || '');
  svLivePlayerState.selectedSourceUrl='';
  svLivePlayerState.fallbackSourceUrl='';
  svLivePlayerState.recoverySourceUrl='';
  svLivePlayerState.fallbackReason='';
  svLivePlayerState.sessionToken++;
  const player=svPlayerVideo();
  if(player)player._svPlaybackType='live';
  svPlaybackStateLog('begin live playback', {
    playbackType:'live',
    channelId:svLivePlayerState.currentChannelId,
    channelName:svLivePlayerState.currentChannelName
  });
  return svLivePlayerState.sessionToken;
}

function svIsLivePlaybackSession(token, channelId=''){
  return svActivePlaybackType === 'live'
    && isLiveMode
    && svLivePlayerState.playbackType === 'live'
    && svLivePlayerState.sessionToken === token
    && (!channelId || svLivePlayerState.currentChannelId === String(channelId || ''));
}

function svNoteSelectedSource(playbackType, src, context={}){
  const type=playbackType === 'live' ? 'live' : 'media';
  if(type === 'live'){
    svLivePlayerState.selectedSourceUrl=String(src || '');
    if(context.fallbackReason)svLivePlayerState.fallbackReason=context.fallbackReason;
    if(context.recoverySourceUrl)svLivePlayerState.recoverySourceUrl=context.recoverySourceUrl;
  }else{
    svMediaPlayerState.selectedSourceUrl=String(src || '');
    if(context.fallbackReason)svMediaPlayerState.fallbackReason=context.fallbackReason;
    if(context.recoverySourceUrl)svMediaPlayerState.recoverySourceUrl=context.recoverySourceUrl;
  }
  svPlaybackStateLog('selected source URL', {
    playbackType:type,
    selectedSourceUrl:src,
    fallbackReason:context.fallbackReason || '',
    mode:context.mode || ''
  });
}

function loadHlsScript(){
  if(typeof Hls !== 'undefined')return Promise.resolve(true);
  if(_hlsLoader)return _hlsLoader;
  _hlsLoader = new Promise(resolve=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js';
    script.async=true;
    script.onload=()=>resolve(typeof Hls !== 'undefined');
    script.onerror=()=>resolve(false);
    document.head.appendChild(script);
  });
  return _hlsLoader;
}

async function attachPlayerSource(src, mode='direct', options={}){
  src=svBackendUrl(src);
  if(!src)return false;
  const playbackType=options.playbackType || ((isLiveMode && svActivePlaybackType === 'live') ? 'live' : 'media');
  const fallbackReason=options.fallbackReason || options.reason || '';
  if(playbackType !== 'live'){
    if(!svAssertNoLiveSourceForMedia(src, {mode, fallbackReason}))return false;
  }
  svNoteSelectedSource(playbackType, src, {mode, fallbackReason});
  const isHls = mode === 'hls' || /\.m3u8(?:$|\?)/i.test(String(src));
  const audioResetContext=svSetMediaAudioResetContext(src, mode, {playbackType, fallbackReason});
  const attachToken=++playerSourceAttachToken;
  if(svPlayerSourceAlreadyAttached(src, mode, isHls)){
    if(audioResetContext)svResetMediaAudioOnSourceSwitch(audioResetContext, 'duplicate source audio reset');
    mediaFixLog('skipped duplicate source attach', {mode, src, fallbackReason});
    return true;
  }
  setCentralPlaybackLoading(true);
  if(audioResetContext)svResetMediaAudioOnSourceSwitch(audioResetContext, 'source switch audio reset');
  svAbortPendingPlayRequest('source attach');
  if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}
  if(!isHls){
    if(attachToken !== playerSourceAttachToken)throw svStalePlaybackError('Superseded source attach');
    vid.src = src;
    svArmNativeAudioResetOnLoad(audioResetContext, 'source load');
    playerAttachedSourceKey=svPlayerSourceKey(src, mode);
    return true;
  }

  if(vid.canPlayType('application/vnd.apple.mpegurl')){
    if(attachToken !== playerSourceAttachToken)throw svStalePlaybackError('Superseded native HLS attach');
    vid.src = src;
    svArmNativeAudioResetOnLoad(audioResetContext, 'native HLS source load');
    playerAttachedSourceKey=svPlayerSourceKey(src, mode);
    return true;
  }

  const ok = await loadHlsScript();
  if(attachToken !== playerSourceAttachToken)throw svStalePlaybackError('Superseded HLS loader');
  if(!ok || typeof Hls === 'undefined' || !Hls.isSupported())return false;

  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(value,error=null)=>{
      if(settled)return;
      settled=true;
      if(error)reject(error);
      else resolve(value);
    };
    const abortIfStale=()=>attachToken !== playerSourceAttachToken;
    hlsInstance=new Hls({
      enableWorker:true,
      lowLatencyMode:false,
      startFragPrefetch:true,
      capLevelToPlayerSize:true,
      maxBufferLength:isMobilePlaybackClient()?24:60,
      maxMaxBufferLength:isMobilePlaybackClient()?60:120,
      maxBufferSize:isMobilePlaybackClient()?28*1000*1000:80*1000*1000,
      backBufferLength:isMobilePlaybackClient()?30:45,
      fragLoadingTimeOut:20000,
      manifestLoadingTimeOut:15000,
    });
    hlsInstance.on(Hls.Events.MEDIA_ATTACHED,()=>{
      if(abortIfStale())return finish(false, svStalePlaybackError('Superseded HLS attach'));
      hlsInstance.loadSource(src);
    });
    hlsInstance.on(Hls.Events.LEVEL_LOADED,()=>{
      if(abortIfStale())return;
      svSelectDefaultHlsAudioTrack(hlsInstance,vid,'HLS level loaded');
    });
    if(Hls.Events.AUDIO_TRACKS_UPDATED){
      hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED,()=>{
        if(abortIfStale())return;
        svApplyActiveAudioAuthority(hlsInstance,vid,'HLS AUDIO_TRACKS_UPDATED',{reason:'HLS audio tracks discovered'});
      });
    }
    if(Hls.Events.AUDIO_TRACK_SWITCHING){
      hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHING,(_event,data)=>{
        if(abortIfStale() || !svMediaPlayerState.audioLocked)return;
        const manifestIndex=Number(svMediaPlayerState.manifestAudioIndex);
        if(Number.isInteger(manifestIndex) && Number(data?.id) !== manifestIndex){
          queueMicrotask(()=>svApplyActiveAudioAuthority(hlsInstance,vid,'HLS AUDIO_TRACK_SWITCHING',{reason:'blocked HLS automatic audio switch'}));
        }
      });
    }
    if(Hls.Events.AUDIO_TRACK_SWITCHED){
      hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED,(_event,data)=>{
        if(abortIfStale() || !svMediaPlayerState.audioLocked)return;
        const manifestIndex=Number(svMediaPlayerState.manifestAudioIndex);
        if(Number.isInteger(manifestIndex) && Number(data?.id) !== manifestIndex){
          queueMicrotask(()=>svApplyActiveAudioAuthority(hlsInstance,vid,'HLS AUDIO_TRACK_SWITCHED',{reason:'reapplied preferred audio after HLS switch'}));
        }
      });
    }
    hlsInstance.on(Hls.Events.MANIFEST_PARSED,()=>{
      if(abortIfStale())return finish(false, svStalePlaybackError('Superseded HLS manifest'));
      svSelectDefaultHlsAudioTrack(hlsInstance,vid,'HLS manifest parsed');
      svForceMediaAudioOutput(vid,'HLS manifest parsed');
      playerAttachedSourceKey=svPlayerSourceKey(src, mode);
      finish(true);
    });
    hlsInstance.on(Hls.Events.ERROR,(e,data)=>{
      if(abortIfStale())return finish(false, svStalePlaybackError('Superseded HLS error'));
      if(!data?.fatal)return;
      setCentralPlaybackError(true);
      console.warn('[HLS] fatal error:', data.type, data.details);
      try{hlsInstance?.destroy();}catch(_){}
      hlsInstance=null;
      if(playerAttachedSourceKey === svPlayerSourceKey(src, mode))playerAttachedSourceKey='';
      finish(false);
    });
    hlsInstance.attachMedia(vid);
    setTimeout(()=>{
      if(abortIfStale())return finish(false, svStalePlaybackError('Superseded HLS timeout'));
      playerAttachedSourceKey=svPlayerSourceKey(src, mode);
      finish(true);
    }, 5000);
  });
}
let _totalMoviePages=0;
let _movieBrowsePageSize=100;
let _homeMoviesLoaded=false;
let _allMoviesLoaded=false;
let _allSeriesLoaded=false;

function movieListKey(m){
  return String(m?.id ?? m?.streamUrl ?? m?.name ?? '').toLowerCase();
}
function mergeMovieList(incoming=[]){
  const seen = new Set(movies.map(movieListKey));
  for(const movie of incoming){
    const key = movieListKey(movie);
    if(!key || seen.has(key))continue;
    seen.add(key);
    movies.push(movie);
  }
}


// ── Missing function stubs ──────────────────────────────────────────────
function checkParentalLock(rating){ return true; }
function trackView(id){}
function updateWatchProgress(id, currentTime, duration){}
let availableAudio = [];
let currentAudioIdx = 0;
const SV_STARTUP_AUDIO_TIMEOUT_MS = 9000;
const SV_STARTUP_MULTI_AUDIO_TIMEOUT_MS = 9000;
const SV_MEDIA_SOURCE_STARTUP_TIMEOUT_MS = 12000;
const SV_MEDIA_TRANSCODE_STARTUP_TIMEOUT_MS = 25000;

function clearMediaStartupWatchdog(){
  const cleanup=vid?._mediaStartupWatchdogCleanup;
  vid._mediaStartupWatchdogCleanup=null;
  if(typeof cleanup === 'function')cleanup();
}

function beginDetailRequestScope(reason='detail'){
  detailRequestToken += 1;
  try{detailRequestController?.abort?.();}catch(_){}
  detailRequestController = new AbortController();
  detailRequestController._svReason = reason;
  return {token:detailRequestToken, signal:detailRequestController.signal, reason};
}

function isCurrentDetailScope(scope){
  return !!scope && scope.token === detailRequestToken && !scope.signal?.aborted;
}

function abortDetailRequestScope(){
  detailRequestToken += 1;
  try{detailRequestController?.abort?.();}catch(_){}
  detailRequestController = null;
}

function armMediaStartupWatchdog(src, context, isCurrent, onTimeout, timeoutMs=SV_MEDIA_SOURCE_STARTUP_TIMEOUT_MS){
  clearMediaStartupWatchdog();
  const expected=(()=>{try{return new URL(src, window.location.href).href;}catch{return String(src||'');}})();
  const events=['loadeddata','canplay','playing'];
  let timer=0;
  let settled=false;
  const sourceMatches=()=>{
    const current=vid.currentSrc || vid.src || '';
    if(!current)return false;
    try{return new URL(current, window.location.href).href === expected;}catch{return current === expected;}
  };
  const cleanup=()=>{
    clearTimeout(timer);
    events.forEach(event=>vid.removeEventListener(event,onReady));
    if(vid._mediaStartupWatchdogCleanup === cleanup)vid._mediaStartupWatchdogCleanup=null;
  };
  const finish=()=>{
    if(settled)return;
    settled=true;
    cleanup();
  };
  const onReady=()=>{
    if(!isCurrent() || !sourceMatches())return;
    if(vid.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && vid.videoWidth > 0 && vid.videoHeight > 0)finish();
  };
  events.forEach(event=>vid.addEventListener(event,onReady));
  timer=setTimeout(()=>{
    if(settled || !isCurrent() || !sourceMatches())return finish();
    if(vid.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && vid.videoWidth > 0 && vid.videoHeight > 0)return finish();
    finish();
    playbackDebug('media source startup timeout', {
      context,
      src,
      readyState:vid.readyState,
      videoWidth:vid.videoWidth,
      videoHeight:vid.videoHeight,
      error:videoErrorInfo()
    });
    Promise.resolve(onTimeout()).catch(error=>{
      playbackDebug('media startup timeout fallback failed', {context,message:error?.message || String(error)});
    });
  }, timeoutMs);
  vid._mediaStartupWatchdogCleanup=cleanup;
}

function appliedAudioIndex(){
  return Number.isInteger(vid?._appliedAudioIdx) ? vid._appliedAudioIdx : currentAudioIdx;
}

function setAppliedAudioIndex(idx, reason=''){
  if(window.playerSession && !isLiveMode) return;

  if(!Number.isInteger(idx))return;
  vid._appliedAudioIdx = idx;
  if(reason)mediaFixLog('applied audio index', {
    idx,
    reason,
    selected:audioDebugSummary(availableAudio[idx],idx)
  });
}

function mediaLanguageLabel(value){
  const raw = String(value || '').trim();
  if(!raw || raw.toLowerCase() === 'und')return '';
  const key = raw.toLowerCase().replace(/[^a-z]/g,'');
  const names = {
    en:'English', eng:'English', english:'English',
    hi:'Hindi', hin:'Hindi', hindi:'Hindi',
    bn:'Bengali', ben:'Bengali', bengali:'Bengali', bangla:'Bengali',
    ar:'Arabic', ara:'Arabic', arabic:'Arabic',
    ta:'Tamil', tam:'Tamil', tamil:'Tamil',
    te:'Telugu', tel:'Telugu', telugu:'Telugu',
    ml:'Malayalam', mal:'Malayalam', malayalam:'Malayalam',
    kn:'Kannada', kan:'Kannada', kannada:'Kannada',
    ur:'Urdu', urd:'Urdu', urdu:'Urdu',
    ja:'Japanese', jpn:'Japanese', japanese:'Japanese',
    ko:'Korean', kor:'Korean', korean:'Korean',
    zh:'Chinese', chi:'Chinese', zho:'Chinese', chinese:'Chinese',
    es:'Spanish', spa:'Spanish', spanish:'Spanish',
    fr:'French', fre:'French', fra:'French', french:'French',
    de:'German', ger:'German', deu:'German', german:'German'
  };
  return names[key] || raw.toUpperCase();
}

function audioTrackTitle(track, index){
  const lang = mediaLanguageLabel(track?.language);
  const title = track?.title && !/^Audio \d+$/i.test(track.title) ? track.title : '';
  const codec = track?.codec ? track.codec.toUpperCase() : '';
  const bits = [lang, title, codec].filter(Boolean).join(' - ');
  return bits || `Audio ${index + 1}`;
}

function filenameAudioHints(value){
  const decoded=(()=>{try{return decodeURIComponent(String(value||''));}catch{return String(value||'');}})();
  const match=decoded.match(/\[(?:Dual|Multi) Audio\]\[([^\]]+)\]/i) || decoded.match(/\[([^\]]*(?:Hindi|English|Bengali|Bangla|Arabic|Japanese|Korean|Tamil|Telugu|Punjabi)[^\]]*)\]/i);
  if(!match)return [];
  return match[1].split(/\s*(?:\+|\/|-|,|&)\s*/).map(part=>part.replace(/\b\d(?:\.\d)?\b|\b(?:AAC|DDP?|AC3|DTS|Atmos|Dual|Multi|Audio)\b/ig,'').trim()).filter(Boolean);
}

function sourceLooksMultiAudio(value){
  const decoded=(()=>{try{return decodeURIComponent(String(value||''));}catch{return String(value||'');}})();
  return /\[(?:dual|multi)[^\]]*audio\]|\b(?:dual|multi)[ ._-]*audio\b/i.test(decoded)
    || /\[(?=[^\]]*(?:hindi|hin))(?=[^\]]*(?:english|eng))[^\]]+\]/i.test(decoded);
}

function startupAudioTimeoutFor(sourceUrl){
  if(/^(?:https?|ftp):\/\//i.test(String(sourceUrl || '').trim()))return 45000;
  return sourceLooksMultiAudio(sourceUrl) ? SV_STARTUP_MULTI_AUDIO_TIMEOUT_MS : SV_STARTUP_AUDIO_TIMEOUT_MS;
}

function audioTrackWithFallback(track,index,hints=[]){
  const hint=hints[index]||'';
  const language=String(track?.language||'').toLowerCase();
  const genericTitle=!track?.title || /^Audio \d+$/i.test(track.title);
  return {
    ...track,
    language:(!language || language==='und') && hint ? hint : track?.language,
    title:genericTitle && hint ? hint : track?.title,
  };
}

function audioTrackText(track={}){
  return [track.language,track.lang,track.title,track.label,track.name,track.characteristics,track.codec].filter(Boolean).join(' ').toLowerCase();
}

function audioTrackIsAudible(track){
  if(track?.decodable === false || track?.audioPacketsDetected === false)return false;
  if(track?.decodable === true && Number(track?.decodedAudioFrames) <= 0)return false;
  const channels=Number(track?.channels);
  const text=audioTrackText(track);
  if(Number.isFinite(channels) && channels <= 0)return false;
  if(/\b(silent|commentary only|no audio|mute|muted)\b/.test(text))return false;
  const codec=String(track?.codec || track?.audioCodec || '').trim().toLowerCase();
  if(codec && !(/^(aac|mp3|mp4a|ac3|eac3|opus|vorbis|flac|dts)$/.test(codec) || codec.includes('aac') || codec.includes('mp4a')))return false;
  if(track && Object.prototype.hasOwnProperty.call(track,'duration')){
    const duration=Number(track.duration);
    if(!Number.isFinite(duration) || duration <= 0)return false;
  }
  return true;
}

function audioTrackStreamIndex(track){
  const idx=Number(track?.streamIndex ?? track?.sourceIndex);
  return Number.isFinite(idx) && idx >= 0 ? idx : null;
}

function audioTrackRelativeIndex(track,index=0){
  const idx=Number(track?.relativeIndex ?? track?.index ?? index);
  return Number.isFinite(idx) && idx >= 0 ? idx : index;
}

function audioCodecIsBrowserSafe(track){
  const codec=String(track?.codec || '').trim().toLowerCase();
  if(!codec)return false;
  return /^(aac|mp3|mp4a)$/.test(codec) || codec.includes('aac') || codec.includes('mp4a');
}

function audioLockedIndex(){
  const raw=vid?._svAudioLockedIndex;
  if(raw === null || raw === undefined || raw === '')return null;
  const idx=Number(raw);
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}

function clearAudioLock(){
  if(!vid)return;
  if(svMediaPlayerState.audioLocked)return;
  vid._svAudioLockedIndex = null;
  vid._svMappedAudioStartupRequired = false;
}

function lockAudioToCurrent(reason='', options={}){
  if(!vid)return;
  vid._svAudioLockedIndex = currentAudioIdx;
  vid._svMappedAudioStartupRequired = !!options.requiresMappedSource;
  if(reason)mediaFixLog('audio locked to startup selection', {
    reason,
    requiresMappedSource:!!options.requiresMappedSource,
    selected:audioDebugSummary(selectedAudioTrack(),currentAudioIdx)
  });
}

function recordManualAudioSelection(idx, reason='manual audio selection'){
  if(!Number.isInteger(idx) || idx < 0)return false;
  const selected=availableAudio[idx] || null;
  svAudioSession.setManual(idx,audioTrackStreamIndex(selected));
  const previousManual=svMediaPlayerState.manualAudioIndex;
  svMediaPlayerState.manualAudioIndex=idx;
  svAudioDebugAssignment('recordManualAudioSelection',previousManual,idx,reason,{
    assignment:'manualAudioIndex',
    target:audioDebugSummary(selected,idx),
  });
  const previousServer=svMediaPlayerState.serverAudioIndex;
  svMediaPlayerState.serverAudioIndex=idx;
  svAudioDebugAssignment('recordManualAudioSelection',previousServer,idx,reason,{
    assignment:'serverAudioIndex',
    target:audioDebugSummary(selected,idx),
  });
  svMediaPlayerState.audioLocked=true;
  svMediaPlayerState.audioSelectionReason=reason;
  if(vid)vid._svAudioLockedIndex=idx;
  mediaFixLog('manual audio authority recorded',{
    idx,
    reason,
    mediaSessionKey:svMediaPlayerState.sessionKey,
    selected:audioDebugSummary(selected,idx)
  });
  return true;
}

function mappedAudioStartupRequiresSource(){
  return !!vid?._svMappedAudioStartupRequired && audioLockedIndex() !== null;
}

function svPreferredAudioDecision(tracks=[], context='automatic audio selection', options={}){
  const serverRaw=svMediaPlayerState.serverAudioIndex;
  const trustedIndex=serverRaw === null || serverRaw === undefined ? null : Number(serverRaw);
  const decision=svAudioSession.select(tracks,{
    preferredLanguage:svMediaPlayerState.preferredAudioLanguage,
    trustedIndex:Number.isInteger(trustedIndex) ? trustedIndex : null,
    trustedReason:svMediaPlayerState.audioSelectionReason || 'server audio decision',
    ignoreManual:!!options.ignoreManual,
    isPlayable:audioTrackIsAudible,
  });
  const selectedIndex=Number.isInteger(Number(decision?.selectedIndex)) && Number(decision.selectedIndex) >= 0
    ? Number(decision.selectedIndex)
    : 0;
  const normalized={...decision,selectedIndex,selectedTrack:tracks[selectedIndex] || null};
  svMediaPlayerState.audioSelectionReason=normalized.reason || context;
  if(SV_DEBUG_LOGS){
    console.warn('[Audio Selection]',{
      title:svMediaPlayerState.title,
      mediaSessionKey:svMediaPlayerState.sessionKey,
      inferredPreferredLanguage:svMediaPlayerState.preferredAudioLanguage,
      preferredLanguageReason:svMediaPlayerState.preferredAudioReason,
      availableAudioTracks:tracks.map((track,index)=>audioDebugSummary(track,index)),
      chosenStream:audioDebugSummary(normalized.selectedTrack,selectedIndex),
      reason:normalized.reason || context,
      selectionMode:normalized.manual ? 'manual' : 'automatic',
    });
  }
  return normalized;
}

function preferredAudioTrackIndex(tracks=[]){
  return svPreferredAudioDecision(tracks).selectedIndex;
}

function normalizeDiscoveredAudioTracks(tracks=[],hints=[]){
  return tracks.map((track,i)=>{
    const withHint=audioTrackWithFallback(track,i,hints);
    return {
      ...withHint,
      index:i,
      sourceIndex:Number.isFinite(track.index)?track.index:track.streamIndex,
      streamIndex:Number.isFinite(track.streamIndex)?track.streamIndex:track.index,
      relativeIndex:Number.isFinite(track.relativeIndex)?track.relativeIndex:i,
      title:audioTrackTitle(withHint,i),
    };
  });
}

function hasDiscoveredAudioTracks(){
  return availableAudio.some(track=>Number.isFinite(track?.sourceIndex ?? track?.streamIndex));
}

function selectedAudioTrack(){
  return availableAudio[currentAudioIdx] || availableAudio[0] || null;
}

function selectedAudioServerStreamIndex(track=selectedAudioTrack(), index=currentAudioIdx){
  const discovered=audioTrackStreamIndex(track);
  if(discovered !== null)return discovered;
  if(track?.filenameHint){
    const relative=audioTrackRelativeIndex(track,index);
    return Number.isInteger(relative) && relative >= 0 ? relative + 1 : null;
  }
  return null;
}

function selectPreferredAudioTrack(context, options={}){
  const previous=currentAudioIdx;
  const decision=svPreferredAudioDecision(availableAudio,context);
  const preferred=decision.selectedIndex;
  svSetCurrentAudioIndex(Math.max(0,Math.min(availableAudio.length-1,preferred)),'selectPreferredAudioTrack',context);
  if(svMediaPlayerState.manualAudioIndex === null){
    const previousServer=svMediaPlayerState.serverAudioIndex;
    svMediaPlayerState.serverAudioIndex=currentAudioIdx;
    svAudioDebugAssignment('selectPreferredAudioTrack',previousServer,currentAudioIdx,decision.reason || context,{
      assignment:'serverAudioIndex',
      target:audioDebugSummary(selectedAudioTrack(),currentAudioIdx),
    });
  }
  if(previous!==currentAudioIdx || options.log){
    mediaFixLog('preferred audio selected', {
      context,
      from:previous,
      to:currentAudioIdx,
      applied:appliedAudioIndex(),
      mediaSessionKey:svMediaPlayerState.sessionKey,
      preferredLanguage:svMediaPlayerState.preferredAudioLanguage,
      selectionReason:decision.reason,
      selected:audioDebugSummary(selectedAudioTrack(),currentAudioIdx),
      sourcePreserved:!!options.sourcePreserved
    });
  }
  renderAudioTracks();
  return currentAudioIdx;
}

function appendSelectedAudioParams(params, caller='appendSelectedAudioParams'){
  if(availableAudio.length)svApplyActiveAudioAuthority(null,vid,caller,{
    reason:'server audio stream query',
    applyDiscovered:false,
  });
  const selected=selectedAudioTrack();
  const streamIndex=selectedAudioServerStreamIndex(selected,currentAudioIdx);
  const logicalIndex=Math.max(0,currentAudioIdx || 0);
  const previous={
    audio:params.get('audio'),
    audioStream:params.get('audioStream'),
  };
  params.set('audio', String(logicalIndex));
  if(streamIndex !== null){
    params.set('audioStream', String(streamIndex));
  }else{
    params.delete('audioStream');
  }
  svAudioDebugAssignment(caller,previous,{
    audio:logicalIndex,
    audioStream:streamIndex,
  },streamIndex !== null
    ? (selected?.filenameHint ? 'authoritative filename-mapped server audio query' : 'authoritative server audio stream query')
    : 'authoritative relative server audio query',{
    assignment:'server-audio-query-parameters',
    target:audioDebugSummary(selected,currentAudioIdx),
  });
}

function planOptionsNeedAudioMap(options={}){
  const mode=String(options.mode || '').toLowerCase();
  return !!(
    options.forceAudio ||
    options.forceRemux ||
    options.forceHls ||
    mode === 'audio' ||
    mode === 'audio-transcode' ||
    mode === 'audio-copy' ||
    mode === 'remux' ||
    mode === 'hls' ||
    mode === 'transcode'
  );
}

function audioDebugSummary(track, index=currentAudioIdx){
  return {
    index,
    relativeIndex:track?.relativeIndex ?? track?.index ?? index,
    streamIndex:track?.streamIndex ?? track?.sourceIndex ?? null,
    language:track?.language || track?.lang || '',
    title:track?.title || track?.label || '',
    codec:track?.codec || '',
    channels:track?.channels ?? null,
    filenameHint:!!track?.filenameHint
  };
}

function subtitleDebugSummary(track, index=currentSubIdx){
  return {
    index,
    relativeIndex:track?.relativeIndex ?? track?.index ?? index,
    streamIndex:track?.streamIndex ?? track?.sourceIndex ?? null,
    source:track?.src || '',
    embedded:!!track?.embedded,
    sidecar:!!track?.sidecar,
    language:track?.language || track?.lang || '',
    label:track?.label || track?.title || '',
    codec:track?.codec || ''
  };
}

function audioTracksFromFilenameHints(value){
  return filenameAudioHints(value).map((hint,index)=>({
    index,
    relativeIndex:index,
    language:hint,
    title:hint,
    filenameHint:true
  }));
}

function seedAudioTracksFromFilename(value, context='filename hint'){
  const hintedTracks=audioTracksFromFilenameHints(value);
  if(hintedTracks.length < 2)return false;
  availableAudio=hintedTracks;
  selectPreferredAudioTrack(context, {sourcePreserved:true, log:true});
  mediaFixLog('seeded audio tracks from filename', {
    context,
    selected:audioDebugSummary(selectedAudioTrack(),currentAudioIdx),
    tracks:availableAudio.map((track,index)=>audioDebugSummary(track,index))
  });
  return true;
}

function renderAudioTracks(){
  const list = document.getElementById('audioList');
  if(!list)return;
  const tool = document.querySelector('.audio-tool');
  const separator = document.querySelector('.tool-sep');
  const signature=JSON.stringify({
    currentAudioIdx,
    manualAudioIdx:svMediaPlayerState.manualAudioIndex,
    tracks:availableAudio.map((track,index)=>[
      index,
      track?.title || track?.label || '',
      track?.language || track?.lang || '',
      track?.streamIndex ?? track?.sourceIndex ?? '',
      !!track?.native,
      !!track?.hls
    ])
  });
  if(list.dataset.svAudioSignature === signature){
    updateAudioBtn();
    refreshPlayerControlVisibility();
    return;
  }
  list.dataset.svAudioSignature = signature;
  if(availableAudio.length < 2){
    list.innerHTML = `<div class="pd-item" style="color:#666;pointer-events:none">No switchable audio tracks</div>`;
    if(tool)tool.style.display='';
    if(separator)separator.style.display='';
    const label = document.getElementById('audioLabel');
    if(label)label.textContent='Audio';
    updateAudioBtn();
    refreshPlayerControlVisibility();
    return;
  }
  if(tool)tool.style.display='';
  if(separator)separator.style.display='';
  if(!availableAudio.length){
    availableAudio = [{index:0,title:'Default Audio'}];
  }
  list.innerHTML = availableAudio.map((t,i)=>`<div class="pd-item${i===currentAudioIdx?' active':''}" onclick="setAudio(${i})"><span>${esc(t.title||audioTrackTitle(t,i))}</span><span class="check">✓</span></div>`).join('');
  const label = document.getElementById('audioLabel');
  if(label)label.textContent = availableAudio[currentAudioIdx]?.title || 'Audio';
  updateAudioBtn();
  refreshPlayerControlVisibility();
}

async function loadAudioTracks(id, options={}){
  const previousIdx = currentAudioIdx;
  const hadTrackMetadata = hasDiscoveredAudioTracks();
  if((!hadTrackMetadata || options.preferStartup) && !svMediaPlayerState.audioLocked){
    availableAudio = [{index:0,title:'Default Audio'}];
    svSetCurrentAudioIndex(0,'loadAudioTracks','temporary metadata placeholder');
    renderAudioTracks();
  }
  try{
    const r = await fetch(`${API_BASE}/api/media-info/${id}`);
    if(!r.ok)return null;
    const data = await r.json();
    svCaptureServerAudioDecision(data);
    const tracks = Array.isArray(data.audioTracks) ? data.audioTracks : [];
    if(tracks.length){
      const hints=filenameAudioHints(typeof localFileForStreamId==='function'?localFileForStreamId(id):'');
      const discovered = normalizeDiscoveredAudioTracks(tracks,hints);
      availableAudio = discovered.length ? discovered : [{index:0,title:'Default Audio'}];
      if(options.preferStartup || !hadTrackMetadata || currentAudioIdx >= availableAudio.length){
        selectPreferredAudioTrack('local metadata', {sourcePreserved:true});
      }else{
        svSetCurrentAudioIndex(
          Math.max(0, Math.min(availableAudio.length - 1, previousIdx)),
          'loadAudioTracks',
          'preserve active metadata selection'
        );
        renderAudioTracks();
      }
    }
    playbackDebug('local audio tracks loaded',{
      id,
      selected:currentAudioIdx,
      streamIndex:selectedAudioTrack()?.streamIndex ?? selectedAudioTrack()?.sourceIndex ?? null,
      count:availableAudio.length
    });
    return data;
  }catch(e){
    console.warn('[Audio] Load error:', e.message);
    return null;
  }
}

function resetLocalTrackOptions(){
  _localTrackLoadPromise = null;
  clearAudioLock();
  availableAudio = [{index:0,title:'Default Audio'}];
  availableSubs = [];
  svSetCurrentAudioIndex(0,'resetLocalTrackOptions','new local playback session');
  setAppliedAudioIndex(0);
  currentSubIdx = -1;
  renderAudioTracks();
  const subList = document.getElementById('subList');
  if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Open to load subtitles</div>`;
  updateSubBtn?.();
}

function ensureLocalTrackOptionsLoaded(){
  if(window.playerSession && !isLiveMode) return;

  if(!currentStreamId || _ftpStreamUrl)return Promise.resolve();
  if(!isMobilePlaybackClient()){
    refreshDesktopNativeAudioTracks();
    if(_localTrackLoadPromise)return _localTrackLoadPromise;
    const subList = document.getElementById('subList');
    if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Loading subtitles...</div>`;
    _localTrackLoadPromise = Promise.all([loadAudioTracks(currentStreamId), loadSubtitleTracks(currentStreamId)]).catch(()=>{});
    return _localTrackLoadPromise;
  }
  if(_localTrackLoadPromise)return _localTrackLoadPromise;
  const subList = document.getElementById('subList');
  if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Loading subtitles...</div>`;
  _localTrackLoadPromise = Promise.all([loadAudioTracks(currentStreamId), loadSubtitleTracks(currentStreamId)])
    .catch(()=>{})
    .finally(()=>{});
  return _localTrackLoadPromise;
}

function bgrCustomWithScore(tid, rid, predFn, publisher){
  bgrCustom(tid, rid, predFn);
}
// ══════════════════ CLIENT-SIDE CARTOON FILTER & SCORING ══════════════════
function isCartoonClient(movie) {
  const name = (movie.name || '').toLowerCase();
  const genre = (movie.genre || '').toLowerCase();
  if (genre.includes('animation') || genre.includes('anime')) return true;
  const bad = [
    'bug\'s life', 'a bug\'s life', 'charlie brown', 'goofy movie', 'akira',
    'aladdin', 'alice in wonderland', 'american tail', 'anastasia', 'antz',
    'bambi', 'beauty and the beast', 'cinderella', 'dumbo', 'fantasia',
    'frozen', 'inside out', 'lion king', 'mulan', 'peter pan', 'pinocchio',
    'pocahontas', 'sleeping beauty', 'snow white', 'tangled', 'toy story',
    'wall-e', 'up', 'ratatouille', 'cars', 'finding nemo', 'shrek', 'kung fu panda'
  ];
  return bad.some(kw => name.includes(kw));
}

function movieScore(m) {
  let score = 0;
  if (m.rating) score += parseFloat(m.rating) * 10;
  if (m.year) {
    let y = parseInt(m.year);
    if (y > 2010) score += 50;
    else if (y > 2000) score += 30;
    else if (y > 1990) score += 10;
  }
  if (m.genre && !m.genre.toLowerCase().includes('animation')) score += 20;
  if (m.isFtp) score += 40;
  const title = (m.name || '').toLowerCase();
  if (title.includes('avengers') || title.includes('iron man') || title.includes('captain america') ||
      title.includes('thor') || title.includes('batman') || title.includes('superman') ||
      title.includes('justice league') || title.includes('man of steel') || title.includes('dark knight')) {
    score += 100;
  }
  return score;
}

// ─── STUDIO FRANCHISE BOOSTS ─────────────────────────────────────────────────
const STUDIO_FRANCHISES = {
  marvel: [
    { pattern: /avengers|infinity war|endgame|age of ultron/i, boost: 1000 },
    { pattern: /iron man/i, boost: 950 },
    { pattern: /captain america|civil war|winter soldier/i, boost: 900 },
    { pattern: /thor|ragnarok|dark world/i, boost: 850 },
    { pattern: /guardians of the galaxy/i, boost: 800 },
    { pattern: /spider-man|spider man|homecoming|far from home|no way home/i, boost: 780 },
    { pattern: /black panther/i, boost: 770 },
    { pattern: /doctor strange|multiverse of madness/i, boost: 750 },
    { pattern: /ant-man|ant man/i, boost: 700 },
    { pattern: /captain marvel/i, boost: 680 },
    { pattern: /deadpool|wolverine|x-men|fantastic four/i, boost: 500 },
  ],
  dc: [
    { pattern: /the dark knight|batman begins|batman v superman|the batman/i, boost: 1000 },
    { pattern: /man of steel|superman/i, boost: 950 },
    { pattern: /wonder woman/i, boost: 900 },
    { pattern: /justice league/i, boost: 850 },
    { pattern: /aquaman/i, boost: 800 },
    { pattern: /joker/i, boost: 780 },
    { pattern: /shazam/i, boost: 700 },
    { pattern: /suicide squad/i, boost: 680 },
    { pattern: /birds of prey/i, boost: 600 },
    { pattern: /black adam/i, boost: 550 },
    { pattern: /blue beetle/i, boost: 500 },
  ],
  universal: [
    { pattern: /jurassic|jurassic world|jurassic park/i, boost: 1000 },
    { pattern: /fast and furious|fast & furious|furious 7|fate of the furious|f9/i, boost: 950 },
    { pattern: /despicable me|minions/i, boost: 900 },
    { pattern: /jason bourne|bourne identity|bourne supremacy|bourne ultimatum/i, boost: 850 },
    { pattern: /king kong|skull island/i, boost: 800 },
    { pattern: /the mummy/i, boost: 750 },
    { pattern: /halloween/i, boost: 700 },
    { pattern: /the purge/i, boost: 650 },
    { pattern: /back to the future/i, boost: 600 },
    { pattern: /jaws/i, boost: 500 },
  ],
  dreamworks: [
    { pattern: /shrek/i, boost: 1000 },
    { pattern: /kung fu panda/i, boost: 950 },
    { pattern: /how to train your dragon/i, boost: 900 },
    { pattern: /madagascar/i, boost: 850 },
    { pattern: /puss in boots/i, boost: 800 },
    { pattern: /trolls/i, boost: 750 },
    { pattern: /the croods/i, boost: 700 },
    { pattern: /megamind/i, boost: 650 },
    { pattern: /boss baby/i, boost: 600 },
    { pattern: /spirit/i, boost: 500 },
  ],
  paramount: [
    { pattern: /mission impossible|mission: impossible/i, boost: 1000 },
    { pattern: /top gun/i, boost: 950 },
    { pattern: /transformers/i, boost: 900 },
    { pattern: /indiana jones/i, boost: 850 },
    { pattern: /star trek/i, boost: 800 },
    { pattern: /terminator/i, boost: 750 },
    { pattern: /titanic/i, boost: 700 },
    { pattern: /the godfather/i, boost: 680 },
    { pattern: /forrest gump/i, boost: 650 },
    { pattern: /interstellar/i, boost: 600 },
    { pattern: /a quiet place/i, boost: 550 },
    { pattern: /gladiator/i, boost: 500 },
  ],
  a24: [
    { pattern: /everything everywhere all at once/i, boost: 1000 },
    { pattern: /midsommar/i, boost: 950 },
    { pattern: /hereditary/i, boost: 900 },
    { pattern: /moonlight/i, boost: 850 },
    { pattern: /uncut gems/i, boost: 800 },
    { pattern: /lady bird/i, boost: 750 },
    { pattern: /ex machina/i, boost: 700 },
    { pattern: /the lighthouse/i, boost: 680 },
    { pattern: /green room/i, boost: 650 },
    { pattern: /minari/i, boost: 600 },
    { pattern: /past lives/i, boost: 550 },
    { pattern: /talk to me/i, boost: 500 },
  ],
  netflix: [
    { pattern: /stranger things/i, boost: 1000 },
    { pattern: /the witcher/i, boost: 950 },
    { pattern: /squid game/i, boost: 900 },
    { pattern: /extraction/i, boost: 850 },
    { pattern: /the old guard/i, boost: 800 },
    { pattern: /red notice/i, boost: 750 },
    { pattern: /6 underground/i, boost: 700 },
    { pattern: /bird box/i, boost: 680 },
    { pattern: /enola holmes/i, boost: 650 },
    { pattern: /don't look up/i, boost: 600 },
    { pattern: /tick, tick...boom!/i, boost: 550 },
    { pattern: /marriage story/i, boost: 500 },
  ],
  disney: [
    { pattern: /lion king/i, boost: 1000 },
    { pattern: /frozen/i, boost: 950 },
    { pattern: /beauty and the beast/i, boost: 900 },
    { pattern: /aladdin/i, boost: 850 },
    { pattern: /mulan/i, boost: 800 },
    { pattern: /moana/i, boost: 750 },
    { pattern: /encanto/i, boost: 700 },
    { pattern: /coco/i, boost: 680 },
    { pattern: /tangled/i, boost: 650 },
    { pattern: /pirates of the caribbean/i, boost: 600 },
    { pattern: /toy story/i, boost: 500 },
  ]
};

// Hardcoded order for major franchise titles (lower index = higher priority)
const STUDIO_PRIORITY_TITLES = {
  marvel: [
    'avengers: endgame', 'avengers: infinity war', 'the avengers', 'avengers: age of ultron',
    'iron man', 'iron man 2', 'iron man 3',
    'captain america: civil war', 'captain america: the winter soldier', 'captain america: the first avenger',
    'thor: ragnarok', 'thor', 'thor: the dark world',
    'guardians of the galaxy', 'guardians of the galaxy vol. 2',
    'spider-man: no way home', 'spider-man: far from home', 'spider-man: homecoming',
    'black panther', 'doctor strange', 'ant-man', 'captain marvel', 'deadpool'
  ],
  dc: [
    'the dark knight', 'the dark knight rises', 'batman begins', 'the batman',
    'man of steel', 'superman returns', 'batman v superman: dawn of justice',
    'wonder woman', 'wonder woman 1984',
    'justice league', 'aquaman', 'joker', 'shazam!', 'suicide squad', 'black adam'
  ]
};

function publisherScore(item, publisher) {
  let base = movieScore(item);
  const title = (item.name || '').toLowerCase();
  const boosts = STUDIO_FRANCHISES[publisher] || [];
  for (const { pattern, boost } of boosts) {
    if (pattern.test(title)) {
      base += boost;
      break;
    }
  }
  return base;
}

// Fuzzy matching for better keyword coverage
function fuzzyTitleMatch(item, keywords) {
  const name = (item.name || '').toLowerCase().replace(/[\.\-_]/g, ' ');
  return keywords.some(kw => name.includes(kw.toLowerCase()));
}

function renderSortedTrack(trackId, list, sp=false) {
  const sorted = [...list].sort((a,b) => movieScore(b) - movieScore(a));
  const rowId = document.getElementById(trackId)?.closest('.row')?.id || trackId.replace(/Track$/,'Row');
  if(typeof svRenderLazyTrack === 'function'){
    svRenderLazyTrack(trackId,rowId,sorted,m=>cardHTML(m,sp),{limit:120});
    return;
  }
  document.getElementById(trackId).innerHTML = sorted.slice(0,120).map(m=>cardHTML(m,sp)).join('');
}

// ══════════════════ INIT ══════════════════
function svStaticItemKey(item={}){
  return [
    item.type === 'tv' || item.type === 'series' || item.seasons ? 'series' : 'movie',
    item.id || item.tmdbId || '',
    String(item.name || item.title || '').toLowerCase(),
    item.year || ''
  ].join('|');
}

function svMergeCatalogItems(primary=[], fallback=[]){
  const seen=new Set();
  const output=[];
  [...primary,...fallback].forEach(item=>{
    if(!item || !(item.name || item.title))return;
    const normalized=item.name ? item : {...item,name:item.title};
    const key=svStaticItemKey(normalized);
    if(seen.has(key))return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

function svAdoptStaticFrontendData(homeFeed, staticChannels){
  const items=[
    ...(Array.isArray(homeFeed?.hero) ? homeFeed.hero : []),
    ...(Array.isArray(homeFeed?.rows)
      ? homeFeed.rows.flatMap(row=>Array.isArray(row?.items) ? row.items : [])
      : [])
  ];
  const staticMovies=items.filter(item=>item?.type !== 'tv' && item?.type !== 'series' && !item?.seasons);
  const staticSeries=items.filter(item=>item?.type === 'tv' || item?.type === 'series' || item?.seasons);
  movies=svMergeCatalogItems(movies,staticMovies);
  series=svMergeCatalogItems(series,staticSeries);
  if(!channels.length && Array.isArray(staticChannels))channels=staticChannels.filter(Boolean);
  if(!_totalMoviePages && movies.length)_totalMoviePages=1;
  buildRows();
  if(typeof buildLiveTV === 'function')buildLiveTV();
  if(typeof buildLiveHomeRow === 'function')buildLiveHomeRow();
}

async function init(){
  if(init._started)return;
  init._started=true;
  buildRows();
  buildSpeedList();
  const staticData=window.StreamVaultConfig?.staticData;
  if(staticData){
    Promise.all([
      staticData.homeSnapshot.catch(()=>null),
      staticData.channels.catch(()=>[])
    ]).then(([homeFeed,staticChannels])=>{
      if(homeFeed)svAdoptStaticFrontendData(homeFeed,staticChannels);
    }).catch(()=>{});
  }
  try{
    const[mR,sR]=await Promise.all([
      fetchWithTimeout(API_BASE + '/api/movies?page=0&limit=24', {}, 4500),
      fetchWithTimeout(API_BASE + '/api/series?summary=1&limit=24', {}, 4500)
    ]);
    if(!mR.ok || !sR.ok)throw new Error('catalog API unavailable');
    const mData = await mR.json();
    movies = svMergeCatalogItems(mData.movies.filter(m=>m&&m.name),movies);
    series = svMergeCatalogItems(await sR.json(),series);

    // Client-side cartoon filter
    movies = movies.filter(m => !isCartoonClient(m));
    series = series.filter(s => !isCartoonClient(s));

    _totalMoviePages = Math.ceil((mData.total || movies.length) / _movieBrowsePageSize);

    setTimeout(()=>{
      svIdleTask(()=>{
        fetch(API_BASE + '/api/trending').then(r=>r.json()).then(d=>{
          trendingMovies = (d.movies || []).filter(m => !isCartoonClient(m));
          trendingSeries = (d.series || []).filter(s => !isCartoonClient(s));
        }).catch(()=>{});
      },3000);
    },4500);

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
    const homeBgPages = 0;
    let _bgPagesLoaded = 0;
    for(let p=1; p<=homeBgPages; p++){
      setTimeout(()=>{
        fetch(`${API_BASE}/api/movies?page=${p}&limit=100`)
          .then(r=>r.json())
          .then(d=>{
            let newMovies = d.movies.filter(m=>m&&m.name);
            newMovies = newMovies.filter(m => !isCartoonClient(m));
            mergeMovieList(newMovies);
            _bgPagesLoaded++;
            if(_bgPagesLoaded === homeBgPages){
              window.requestIdleCallback ? window.requestIdleCallback(buildRows) : setTimeout(buildRows, 200);
            } else {
              renderSortedTrack('allTrack', movies);
            }
          });
      }, p * 600);
    }
    setTimeout(()=>{ _homeMoviesLoaded=true; }, homeBgPages * 600 + 200);
  }catch(error){
    const heroTitle = document.getElementById('heroTitle');
    if(heroTitle && !document.querySelector('.card,.live-ch-card'))heroTitle.textContent='Browse StreamVault';
    console.warn('[StreamVault] backend unavailable; using static homepage:', error?.message || error);
    buildLiveTV();
    buildLiveHomeRow();
    return;
  }
  buildHero();buildRows();buildSpeedList();
  // Online homepage refreshes are disabled for now so loaded home rows stay stable.

  try{
    const cR=await fetchWithTimeout(API_BASE + '/api/channels', {}, 3500);
    channels=await cR.json();
  }catch{}
  buildLiveTV();
  buildLiveHomeRow();
}

function loadAllMoviesForBrowse(){
  if(_allMoviesLoaded) return;
  _allMoviesLoaded=true;
  if(window.StreamVaultConfig?.backendStatus?.available === false)return;
  const startPage=0;
  let loaded=0;
  const total=Math.max(0,_totalMoviePages-startPage);
  for(let p=startPage; p<_totalMoviePages; p++){
    setTimeout(()=>{
      fetchWithTimeout(`${API_BASE}/api/movies?page=${p}&limit=${_movieBrowsePageSize}`, {}, 3500)
        .then(r=>r.json())
        .then(d=>{
          let newMovies = d.movies.filter(m=>m&&m.name);
          newMovies = newMovies.filter(m => !isCartoonClient(m));
          mergeMovieList(newMovies);
          loaded++;
          if(loaded%4===0||loaded===total){
            if(document.getElementById('moviesSection').style.display!=='none') filterMoviesPage();
          }
          })
          .catch(()=>{});
    }, (p-startPage)*260);
  }
}

async function loadAllSeriesForBrowse(){
  if(_allSeriesLoaded) return;
  _allSeriesLoaded = true;
  if(window.StreamVaultConfig?.backendStatus?.available === false)return;
  try{
    const r = await fetchWithTimeout(API_BASE + '/api/series', {}, 3500);
    const data = await r.json();
    if(Array.isArray(data)){
      series = data.filter(s=>s&&s.name&&!isCartoonClient(s));
    }
  }catch(e){
    console.warn('[Series] Full load error:', e.message);
  }
}

function bnTap(tab){
  if(tab==='home'||tab==='discover')goHome();
  else switchTab(tab);
}
function goHome(){
  closeSearchOverlay(true);switchTab('discover');
  document.getElementById('bnDiscover')?.classList.add('active');
  ['bnShows','bnMovies','bnLibrary','bnDownloads','bnSearch'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById('livetvNavBtn')?.classList.remove('active');
  document.getElementById('allMoviesNavBtn')?.classList.remove('active');
  document.getElementById('downloadNavBtn')?.classList.remove('active');
}

function switchTab(tab){
  if(tab==='home'||tab==='movies')tab='discover';
  const previousTab=currentTab;
  const sameTab=previousTab===tab;
  currentTab=tab;
  const isHome=tab==='discover';
  closeSearchOverlay(true);
  document.getElementById('mainSection').style.display=isHome?'block':'none';
  const hero=document.getElementById('hero');
  if(hero)hero.style.display=isHome?'block':'none';
  document.getElementById('discoverIntro').style.display=isHome?'flex':'none';
  document.getElementById('seriesSection').style.display=tab==='series'?'block':'none';
  document.getElementById('liveSection').style.display=tab==='live'?'block':'none';
  document.getElementById('moviesSection').style.display=tab==='movies-browse'?'block':'none';
  document.getElementById('mobileMp4Section').style.display=tab==='mobile-mp4'?'block':'none';
  document.getElementById('searchSection').style.display=tab==='search'?'block':'none';
  document.getElementById('librarySection').style.display=tab==='library'?'block':'none';
  const downloadsSection=document.getElementById('downloadsSection');
  if(downloadsSection)downloadsSection.style.display=tab==='downloads'?'block':'none';
  document.getElementById('livetvNavBtn')?.classList.toggle('active',tab==='live');
  document.getElementById('allMoviesNavBtn')?.classList.toggle('active',tab==='movies-browse');
  document.getElementById('downloadNavBtn')?.classList.toggle('active',tab==='downloads');
  ['bnDiscover','bnShows','bnMovies','bnLibrary','bnDownloads','bnSearch'].forEach(id=>{
    document.getElementById(id)?.classList.remove('active');
  });
  if(tab==='discover')document.getElementById('bnDiscover')?.classList.add('active');
  if(tab==='series'){
    document.getElementById('bnShows')?.classList.add('active');
    if(!sameTab)filterSeriesPage();
    if(!_allSeriesLoaded)loadAllSeriesForBrowse().then(()=>{if(currentTab==='series')filterSeriesPage();});
  }
  if(tab==='movies-browse'){
    document.getElementById('bnMovies')?.classList.add('active');
    if(!_allMoviesLoaded)loadAllMoviesForBrowse();
    if(!sameTab || !_mpRendered)renderMoviesPage();
  }
  if(tab==='live'){if(channels.length)renderLiveGrid();}
  if(tab==='mobile-mp4'){renderMobileMp4Page();}
  if(tab==='library'){document.getElementById('bnLibrary')?.classList.add('active');renderLibraryPage();}
  if(tab==='downloads'){document.getElementById('bnDownloads')?.classList.add('active');if(typeof loadDownloads==='function')loadDownloads();if(typeof renderDownloadsPage==='function')renderDownloadsPage();}
  if(tab==='search'){
    document.getElementById('bnSearch')?.classList.add('active');
    const query = typeof getGlobalSearchQuery === 'function' ? getGlobalSearchQuery() : '';
    renderSearchPage(query);
    setTimeout(()=>{ if(typeof focusGlobalSearchInput === 'function')focusGlobalSearchInput(); },60);
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderMobileMp4Page(){
  var mp4M=movies.filter(function(m){var u=(m.streamUrl||'').toLowerCase().split('?')[0];return u.endsWith('.mp4')||u.endsWith('.m4v');});
  var mp4S=series.filter(function(s){var allEps=[].concat.apply([],Object.values(s.seasons||{}));if(!allEps.length)return false;return allEps.every(function(e){var u=(e.streamUrl||'').toLowerCase().split('?')[0];return u.endsWith('.mp4')||u.endsWith('.m4v');});}).map(function(s){return Object.assign({},s,{_isSeries:true});});
  var all=mp4M.concat(mp4S).sort(function(a,b){return(parseInt(b.year)||0)-(parseInt(a.year)||0);});
  var grid=document.getElementById('mobileMp4Grid');
  var countEl=document.getElementById('mobileMp4Count');
  if(countEl)countEl.textContent=all.length+' titles';
  if(!all.length){grid.innerHTML='<div class="movies-empty"><h2>No MP4 titles found</h2></div>';return;}
  grid.innerHTML=all.map(function(item){return item._isSeries?sCardHTML(item):cardHTML(item);}).join('');
}

function svLegacyBuildLiveHomeRowUnused(){
  if(!channels||!channels.length){hide('liveHomeRow');return;}
  const track=document.getElementById('liveHomeTrack');
  track.innerHTML=channels.map(ch=>{
    const initial=ch.name.charAt(0).toUpperCase();
    const bg=ch.color||'#1a1a2e';
    const bg2=darken(bg);
    const imgEl=ch.logo
      ?`<img src="${esc(ch.logo)}" alt="${esc(ch.name)}" class="channel-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
      :'';
    const safeId=esc(ch.id);
    const safeName=esc(ch.name).replace(/'/g,"\\'");
    return `<div class="live-ch-card" onclick="openLiveChannel('${safeId}','${safeName}')">
      <div class="live-ch-inner" style="background:linear-gradient(135deg,${bg},${bg2})">
        ${imgEl}
        <div class="live-ch-initial" style="${ch.logo?'display:none':''}">${initial}</div>
      </div>
    </div>`;
  }).join('');
  show('liveHomeRow');
}

function svLegacyBuildLiveTVUnused(){
  const cats=['All',...new Set(channels.map(c=>c.category).filter(Boolean))];
  document.getElementById('liveCats').innerHTML=cats.map(c=>
    `<button class="live-cat${c===currentLiveCat?' active':''}" onclick="filterLiveCat('${c}')">${c}</button>`
  ).join('');
  renderLiveGrid();
}

function filterLiveCat(cat){
  currentLiveCat=cat;
  document.querySelectorAll('.live-cat').forEach(el=>el.classList.toggle('active',el.textContent===cat));
  renderLiveGrid();
}

function svLegacyRenderLiveGridUnused(){
  const grid=document.getElementById('liveGrid');
  const filtered=currentLiveCat==='All'?channels:channels.filter(c=>c.category===currentLiveCat);
  if(!filtered.length){
    grid.innerHTML=`<div class="live-setup-note"><h3>No channels in this category</h3><p>Add channels to <code>channels.json</code> in your server folder.</p></div>`;
    return;
  }
  const hasAnyUrl=filtered.some(c=>c.url);
  let html='';
  if(!hasAnyUrl){
    html+=`<div class="live-setup-note">
      <h3>⚙️ One-time setup needed</h3>
      <p>Open the ISP portal at <code>172.22.1.2:90</code>, play each channel, press <code>F12</code> → Network tab → filter by <code>m3u8</code> — copy the URL into <code>channels.json</code> next to each channel's <code>"url"</code> field. Then restart the server.</p>
    </div>`;
  }
  html+=filtered.map(ch=>{
    const initial=ch.name.charAt(0).toUpperCase();
    const hasUrl=!!ch.url;
    const bg=ch.color||'#1a1a2e';
    const imgEl=ch.logo
      ?`<img src="${esc(ch.logo)}" alt="${esc(ch.name)}" class="channel-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
      :'';
    return `<div class="channel-card" onclick="${hasUrl?`openLiveChannel('${ch.id}','${esc(ch.name).replace(/'/g,"\\'")}')`:''}" style="${!hasUrl?'opacity:.45;cursor:default':''}">
      <div class="channel-card-inner" style="background:linear-gradient(135deg,${bg},${darken(bg)})">
        ${imgEl}
        <div class="channel-initial" style="${ch.logo?'display:none':''}">${initial}</div>
      </div>
    </div>`;
  }).join('');
  grid.innerHTML=html;
}

function darken(hex){
  try{
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
  }catch{return '#000'}
}

function shouldUseNativeHlsForLive(){
  const ua=navigator.userAgent || "";
  const isAppleDevice=/iPhone|iPad|iPod/i.test(ua);
  const isSafari=/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg|OPR|Android/i.test(ua);
  return isAppleDevice || isSafari;
}

function openLiveChannel(channelId, channelName){
  const directLiveSourceUrl=`${API_BASE}/live/${encodeURIComponent(channelId)}/playlist.m3u8`;
  const relayLiveSourceUrl=`${API_BASE}/live-relay-v2/${encodeURIComponent(channelId)}/playlist.m3u8`;
  let liveSourceUrl=relayLiveSourceUrl;
  let liveDirectFallbackAttempted=false;
  if(svLiveAbrActive(channelId) && hlsInstance){
    document.getElementById('playerModal').classList.add('open');
    setCentralPlaybackLoading(false);
    showUI();
    try{hlsInstance.startLoad();}catch(_){}
    svPlayVideo('live channel resume', {force:true}).catch(()=>{});
    return;
  }
  if(typeof vid?._svLiveCleanup === 'function'){
    try{vid._svLiveCleanup();}catch(_){}
    vid._svLiveCleanup=null;
  }
  svBeginLivePlayback(channelId, channelName);
  isLiveMode=true;
  currentStreamId=null;
  vid._durationToken = (vid._durationToken || 0) + 1;
  vid._sourceOffset = 0;
  vid._sourceSeekRequired = false;
  vid._mediaSourceSeekRequired = false;
  vid._apiDuration = 0;
  _ftpStreamUrl='';
  _ftpDuration=0;
  _ftpNeedsTranscode=false;
  _ftpSeekPending=false;
  closeAllDropdowns();
  hidePlayerNotice();
  hideSeriesPlayerBar();
  if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}
  clearInterval(vid._pi);
  vid.pause();
  vid.removeAttribute('src');
  vid.querySelectorAll('track').forEach(t=>t.remove());
  clearSubtitleOverlay();
  availableSubs=[];
  availableAudio=[];
  svSetCurrentAudioIndex(0,'openLiveChannel','live playback reset');
  currentSpeed=1;
  vid.playbackRate=1;
  resetSeekPreview();
  renderAudioTracks();
  renderSubtitleTracks();
  updateSpeedBtn();
  document.getElementById('playerTitle').textContent=displayText(channelName);
  document.getElementById('playerSubTitle').textContent='';
  document.getElementById('playerLiveBadge').classList.add('show');
  document.getElementById('progressWrap').classList.add('live-mode');
  setLiveTimer();
  document.getElementById('playerModal').classList.add('open');
  setCentralPlaybackLoading(true);
  document.body.style.overflow='hidden';
  refreshPlayerControlVisibility();
  showUI();

  svNoteSelectedSource('live', liveSourceUrl, {mode:'hls'});
  svLiveConsoleLog("[LIVE PATH]", {
    channelId,
    mode: shouldUseNativeHlsForLive() ? "native" : "hls.js",
    source: liveSourceUrl,
    relay: /\/live-relay(?:-v2)?\//.test(liveSourceUrl)
  });

  const playNative=()=>{
    const onNativeLiveError=()=>{
      if(!liveDirectFallbackAttempted && isRelaySource()){
        liveDirectFallbackAttempted=true;
        liveSourceUrl=directLiveSourceUrl;
        svNoteSelectedSource('live', liveSourceUrl, {mode:'native', fallbackReason:'native relay error'});
        console.warn('[LIVE] Native relay failed; falling back to direct source once', {channelId, source:liveSourceUrl});
        playNative();
        return;
      }
      showLivePlaybackFailure('native video error');
    };
    vid.addEventListener('error',onNativeLiveError,{once:true});
    vid.src=liveSourceUrl;
    vid.play().catch(()=>{});
  };

  const isRelaySource=()=>/\/live-relay(?:-v2)?\//.test(liveSourceUrl);
  const liveErrorStatus=data=>Number(data?.response?.code ?? data?.response?.status ?? data?.networkDetails?.status ?? 0) || 0;
  const isLiveNetworkError=data=>data?.type===Hls.ErrorTypes.NETWORK_ERROR || data?.type==='networkError';
  const isLivePlaylistNetworkError=data=>{
    const details=String(data?.details || '');
    return /manifest|level|playlist/i.test(details);
  };
  const fallbackToDirectLiveSource=reason=>{
    if(liveDirectFallbackAttempted || !isRelaySource())return false;
    liveDirectFallbackAttempted=true;
    liveSourceUrl=directLiveSourceUrl;
    svNoteSelectedSource('live', liveSourceUrl, {mode:'hls', fallbackReason:reason || 'live relay fallback'});
    console.warn('[LIVE] Relay failed; falling back to direct source once', {channelId, reason, source:liveSourceUrl});
    if(hlsInstance){try{hlsInstance.destroy();}catch(_){} hlsInstance=null;}
    if(typeof vid?._svLiveCleanup === 'function'){
      try{vid._svLiveCleanup();}catch(_){}
      vid._svLiveCleanup=null;
    }
    setCentralPlaybackLoading(true);
    playWithHls();
    return true;
  };
  const showLivePlaybackFailure=reason=>{
    setCentralPlaybackLoading(false);
    const fallbackMessage='Live TV playback failed. Please try again in a moment.';
    if(window.StreamVaultConfig?.backendStatus?.available === false){
      window.StreamVaultConfig.showOfflineMessage('liveTv').then(message=>{
        if(!message)showPlayerNotice(fallbackMessage);
      });
    }else{
      showPlayerNotice(fallbackMessage);
    }
    console.warn('[LIVE] Playback failed', {channelId, reason});
  };

  const playWithHls=()=>{
    hlsInstance=new Hls({
      enableWorker:true,
      lowLatencyMode:true,
      capLevelToPlayerSize:true,
      startLevel:-1,
      maxBufferLength:20,
      backBufferLength:10,
      maxBufferHole:0.5,
      liveSyncDurationCount:2,
      maxMaxBufferLength:40,
      maxLoadingDelay:4,
      liveMaxLatencyDurationCount:18,
      maxLiveSyncPlaybackRate:1.25,
      manifestLoadingTimeOut:10000,
      manifestLoadingMaxRetry:6,
      fragLoadingTimeOut:10000,
      fragLoadingMaxRetry:6,
      fragLoadingRetryDelay:1000,
      levelLoadingTimeOut:10000
    });
    vid._svLiveCleanup=svAttachLiveAbr(channelId,hlsInstance);
    hlsInstance.on(Hls.Events.FRAG_LOADING,(e,d)=>{
      window.__fragStart=performance.now();
      svLiveConsoleLog("[LIVE] FRAG_LOADING:", d?.frag?.url);
    });
    hlsInstance.on(Hls.Events.FRAG_LOADED,(e,d)=>{
      const latency=performance.now() - window.__fragStart;
      window.__liveIssue?.fragLatency?.push(latency);
      if(latency > 2000){
        console.warn("[ROOT-CAUSE] HIGH FRAG LATENCY:", latency);
      }
      svLiveConsoleLog("[LIVE] FRAG_LOADED:", d?.frag?.url, "latency(ms):", latency);
    });
    hlsInstance.on(Hls.Events.MEDIA_ATTACHED,()=>hlsInstance.loadSource(liveSourceUrl));
    hlsInstance.on(Hls.Events.MANIFEST_PARSED,()=>{refreshPlayerControlVisibility();vid.play().catch(()=>{});});
    hlsInstance.on(Hls.Events.ERROR,(e,data)=>{
      if(svLiveIsBufferStalledError(data)){
        svLiveHandleStallRecovery(hlsInstance);
        return;
      }
      if(!data?.fatal)return;
      if(isLiveNetworkError(data)){
        const status=liveErrorStatus(data);
        if(isRelaySource() && (isLivePlaylistNetworkError(data) || status === 404 || status === 502)){
          if(fallbackToDirectLiveSource(data.details || `HTTP ${status || 'network error'}`))return;
        }
        if(liveDirectFallbackAttempted && isLivePlaylistNetworkError(data) && (status >= 400 || !status)){
          showLivePlaybackFailure(data.details || `HTTP ${status || 'network error'}`);
          return;
        }
        svLiveHandleNetworkRecovery(hlsInstance);
        return;
      }
      if(data.type===Hls.ErrorTypes.MEDIA_ERROR || data.type==='mediaError'){
        svLiveHandleMediaRecovery(hlsInstance);
        return;
      }
      svLiveHandleUnknownRecovery(hlsInstance);
    });
    hlsInstance.attachMedia(vid);
  };

  if(typeof Hls !== 'undefined' && Hls.isSupported()){
    playWithHls();
  }else if(shouldUseNativeHlsForLive() && vid.canPlayType('application/vnd.apple.mpegurl')){
    playNative();
  }else{
    loadHlsScript().then(ok=>{
      if(ok && typeof Hls !== 'undefined' && Hls.isSupported())playWithHls();
      else if(shouldUseNativeHlsForLive() && vid.canPlayType('application/vnd.apple.mpegurl')){
        playNative();
      }else{
        showToast('HLS not supported in this browser');
        closePlayer();
      }
    });
  }
}

function buildHero(){
  const movieItems = movies
    .filter(m => m && (m.poster || m.backdrop))
    .map(m => ({...m, _isSeries:false, _releaseOrder:Number(m.id)||0}));
  const seriesItems = series
    .filter(s => s && (s.poster || s.backdrop))
    .map((s,i) => ({...s, _isSeries:true, _releaseOrder:i}));
  heroMovies = [...movieItems, ...seriesItems]
    .sort((a,b) => {
      const ay = parseInt(a.year) || 0;
      const by = parseInt(b.year) || 0;
      if(by !== ay)return by - ay;
      return (b._releaseOrder || 0) - (a._releaseOrder || 0);
    })
    .slice(0, 10);
  if(!heroMovies.length) heroMovies = [...seriesItems, ...movieItems].slice(0, 12);
  const cardsEl=document.getElementById('heroCards');
  if(cardsEl){
    cardsEl.innerHTML=heroMovies.slice(0,6).map(item=>{
      const html = item._isSeries ? sCardHTML(item) : cardHTML(item);
      return html.replace('class="card"', 'class="card featured-card"');
    }).join('');
  }
  return;
  let candidates = movies.filter(m => m.poster || m.backdrop);
  candidates.sort((a,b) => movieScore(b) - movieScore(a));
  heroMovies = candidates.slice(0, 8);
  if(!heroMovies.length) heroMovies = movies.slice(0,6);
  const sEl=document.getElementById('heroSlides');
  const dEl=document.getElementById('heroDots');
  const tEl=document.getElementById('heroThumbs');
  sEl.innerHTML=dEl.innerHTML=tEl.innerHTML='';
  heroMovies.forEach((m,i)=>{
    const s=document.createElement('div');
    s.className='hero-slide'+(i===0?' active':'');
    s.style.backgroundImage=(m.backdrop||m.poster)?`url('${m.backdrop||m.poster}')`:'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)';
    sEl.appendChild(s);
    const d=document.createElement('div');d.className='dot'+(i===0?' active':'');d.onclick=()=>setHero(i);dEl.appendChild(d);
    const t=document.createElement('img');t.className='hero-thumb'+(i===0?' active':'');t.src=m.poster||m.backdrop||'';t.alt=m.name;t.onclick=()=>setHero(i);tEl.appendChild(t);
  });
  setHero(0);startHeroTimer();
  let tx=0;
  const hEl=document.getElementById('hero');
  hEl?.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;},{passive:true});
  hEl?.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50){dx<0?setHero((heroIdx+1)%heroMovies.length):setHero((heroIdx-1+heroMovies.length)%heroMovies.length);resetHeroTimer();}},{passive:true});
}
function setHero(idx){
  heroIdx=idx;const m=heroMovies[idx];if(!m)return;
  document.querySelectorAll('.hero-slide').forEach((s,i)=>s.classList.toggle('active',i===idx));
  document.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
  document.querySelectorAll('.hero-thumb').forEach((t,i)=>t.classList.toggle('active',i===idx));
  document.getElementById('heroTitle').textContent=m.name;
  document.getElementById('heroOverview').textContent=m.overview||'';
  document.getElementById('heroRating').textContent=m.rating?'★ '+m.rating:'';
  document.getElementById('heroYear').textContent=m.year||'   ';
  document.getElementById('heroRuntime').textContent=m.runtime||'';
  document.getElementById('heroGenre').textContent=m.genre?m.genre.split(',').slice(0,2).join(' · '):'';
  const te=document.getElementById('heroType');
  if(m.type==='tv'){te.textContent='SERIES';te.style.display='';}else te.style.display='none';
  if(m.streamUrl){
    document.getElementById('heroPlayBtn').onclick=()=>playFtpMedia(m.streamUrl,m.name,m.year);
  }else{
    document.getElementById('heroPlayBtn').onclick=()=>playMedia(m.id,m.name,m.year);
  }
}
function cycleHero(){setHero((heroIdx+1)%heroMovies.length);resetHeroTimer();}
function startHeroTimer(){heroTimer=setInterval(()=>setHero((heroIdx+1)%heroMovies.length),7000);}
function resetHeroTimer(){clearInterval(heroTimer);startHeroTimer();}

function recordWatchHistory(id, name, genre, type){
  watchHistory = watchHistory.filter(e => e.id !== id);
  watchHistory.unshift({id, name, genre: genre||'', type: type||'movie', watchedAt: Date.now()});
  if(watchHistory.length > 30) watchHistory = watchHistory.slice(0, 30);
  try{localStorage.setItem('sv_history', JSON.stringify(watchHistory));}catch{}
}

function buildRecommendationRow(){
  if(!watchHistory.length){hide('becauseRow');return;}
  const seed = watchHistory.find(e => e.genre && e.genre.trim()) || watchHistory[0];
  if(!seed){hide('becauseRow');return;}
  const seedGenres = seed.genre.split(/[,/|]/).map(g=>g.trim().toLowerCase()).filter(Boolean);
  if(!seedGenres.length){hide('becauseRow');return;}
  const scoreItem = (item, genres) => {
    if(!item.genre) return 0;
    const itemGenres = item.genre.split(/[,/|]/).map(g=>g.trim().toLowerCase());
    return itemGenres.filter(g => genres.some(sg => g.includes(sg) || sg.includes(g))).length;
  };
  const allItems = [
    ...movies.map(m=>({...m, _type:'movie'})),
    ...series.map(s=>({...s, _type:'series'}))
  ];
  const candidates = allItems
    .filter(item => String(item.id) !== String(seed.id) && item.name !== seed.name)
    .map(item => ({item, score: scoreItem(item, seedGenres)}))
    .filter(({score}) => score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 20)
    .map(({item}) => item);
  if(candidates.length < 2){hide('becauseRow');return;}
  document.getElementById('becauseTitle').textContent = seed.name;
  document.getElementById('becauseTrack').innerHTML = candidates.map(item =>
    item._type === 'series' ? sCardHTML(item) : cardHTML(item)
  ).join('');
  show('becauseRow');
}

function genreMatch(item, genres){
  if(!item.genre) return false;
  const itemGenres = item.genre.split(',').map(g=>g.trim().toLowerCase());
  return genres.some(g => itemGenres.includes(g.toLowerCase()));
}
function langMatch(item, langs){
  if(!item.language) return false;
  const itemLangs = item.language.split(',').map(l=>l.trim().toLowerCase());
  return langs.some(l => itemLangs.some(il => il.includes(l.toLowerCase())));
}
function titleMatch(item, keywords){
  const t = (item.name||'').toLowerCase();
  return keywords.some(k => t.includes(k.toLowerCase()));
}
function _dedupSort(list) {
  return list.sort((a, b) => movieScore(b) - movieScore(a)).filter(item => {
    const key = item.name.toLowerCase();
    const count = _rowSeen.get(key) || 0;
    if (count >= 2) return false;
    _rowSeen.set(key, count + 1);
    return true;
  });
}

function bgrPublisher(trackId, rowId, publisher) {
  const publisherMap = {
    Netflix: ['Netflix', 'Netflix Originals', 'Netflix Studios'],
    Marvel: ['Marvel Studios', 'Marvel Entertainment', 'Marvel'],
    DC: ['DC Comics', 'DC Entertainment', 'Warner Bros. Pictures', 'DC Films'],
    Disney: ['Walt Disney Pictures', 'Pixar', 'Disney', 'Walt Disney Animation Studios']
  };
  const keywords = publisherMap[publisher] || [];
  const mList = movies.filter(m => {
    if (m.productionCompanies && m.productionCompanies.some(c => keywords.some(k => c.includes(k)))) return true;
    const title = (m.name || '').toLowerCase();
    return keywords.some(k => title.includes(k.toLowerCase()));
  });
  const sList = series.filter(s => {
    if (s.productionCompanies && s.productionCompanies.some(c => keywords.some(k => c.includes(k)))) return true;
    const title = (s.name || '').toLowerCase();
    return keywords.some(k => title.includes(k.toLowerCase()));
  }).map(s => ({...s, _isSeries: true}));
  const list = _dedupSort([...sList, ...mList]);
  if (list.length >= 1) {
    document.getElementById(trackId).innerHTML = list.slice(0, 120).map(item => item._isSeries ? sCardHTML(item) : cardHTML(item)).join('');
    show(rowId);
  } else {
    hide(rowId);
  }
}

// Helper for publisher rows with boosted scoring (and fuzzy matching)
function bgrStudioWithPriority(trackId, rowId, predicate, publisher) {
  const mList = movies.filter(predicate);
  const sList = series.filter(predicate).map(s => ({...s, _isSeries: true}));
  let list = [...mList, ...sList];  // skip _rowSeen so Marvel/DC movies always show
  
  console.log(`[Studio] ${publisher}: ${list.length} items matched`);
  
  if (list.length === 0) {
    hide(rowId);
    return;
  }
  
  const priorityList = STUDIO_PRIORITY_TITLES[publisher] || [];
  
  // Sort: priority titles first (in defined order), then remaining by year desc
  list.sort((a, b) => {
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    
    const normalize = s => s.replace(/[\.\-_:]/g,' ').replace(/\s+/g,' ').trim();
const aPriorityIdx = priorityList.findIndex(p => normalize(aName).includes(normalize(p)));
const bPriorityIdx = priorityList.findIndex(p => normalize(bName).includes(normalize(p)));
    
    // Both are priority titles: sort by their position in the priority list
    if (aPriorityIdx !== -1 && bPriorityIdx !== -1) {
      return aPriorityIdx - bPriorityIdx;
    }
    // Only one is priority: priority comes first
    if (aPriorityIdx !== -1) return -1;
    if (bPriorityIdx !== -1) return 1;
    
    // Neither is priority: sort by year (newest first), then rating
    const aYear = parseInt(a.year) || 0;
    const bYear = parseInt(b.year) || 0;
    if (aYear !== bYear) return bYear - aYear;
    
    return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
  });
  
  document.getElementById(trackId).innerHTML = list.slice(0, 120).map(item =>
    item._isSeries ? sCardHTML(item) : cardHTML(item)
  ).join('');
  show(rowId);
}

async function buildStudioRow(trackId, rowId, publisher, keywords, priorityPatterns) {
  const localMatched = movies.filter(m => {
    const n = (m.name||'').toLowerCase().replace(/[\.\-_]/g,' ');
    return keywords.some(k => n.includes(k));
  });
  const seen = new Set(localMatched.map(m => (m.name||'').toLowerCase().split('(')[0].trim()));

  let ftpMatched = [];
  try {
    const r = await fetch(`${API_BASE}/api/movies/keywords?q=${encodeURIComponent(keywords.join(','))}`);
    const data = await r.json();
    ftpMatched = data.filter(m => {
      const key = (m.name||'').toLowerCase().split('(')[0].trim();
      return !seen.has(key);
    });

    const ftpSeen = new Map();
    ftpMatched = ftpMatched.filter(m => {
      const base = (m.name||'').toLowerCase().replace(/^\d+\s*[-–]\s*/,'').split('(')[0].trim();
      if (ftpSeen.has(base)) {
        const existing = ftpSeen.get(base);
        if (!existing.poster && m.poster) { ftpSeen.set(base, m); return true; }
        return false;
      }
      ftpSeen.set(base, m);
      return true;
    });
  } catch {}

  let list = [...localMatched, ...ftpMatched];
  const norm = s => s.replace(/[\.\-_:]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  list.sort((a, b) => {
    const an = norm(a.name||''), bn = norm(b.name||'');
    const ai = priorityPatterns.findIndex(p => an.includes(p));
    const bi = priorityPatterns.findIndex(p => bn.includes(p));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return (parseInt(b.year)||0) - (parseInt(a.year)||0);
  });

  if (!list.length) { hide(rowId); return; }
  document.getElementById(trackId).innerHTML = list.slice(0, 120).map(m => cardHTML(m)).join('');
  show(rowId);
}

function svLegacyBuildRowsUnused(){
  _rowSeen = new Map();
  renderSortedTrack('allTrack', movies);
  const cont = movies.filter(m=>!m.isTrending&&watchProgress[m.id]?.progress>0.02&&watchProgress[m.id]?.progress<0.95);
  if(cont.length){renderSortedTrack('continueTrack',cont,true);show('continueRow');}else hide('continueRow');
  buildRecommendationRow();
  const trendingAll = [
    ...trendingSeries.slice(0,10).map(s=>({...s,_isSeries:true})),
    ...trendingMovies.slice(0,20)
  ].filter(t => t.poster);
  if(trendingAll.length){
    document.getElementById('trendingTrack').innerHTML = trendingAll.map(item =>
      item._isSeries ? sCardHTML(item) : cardHTML(item)
    ).join('');
    show('trendingRow');
  } else hide('trendingRow');
  (function(){
    var isMob=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.innerWidth<768;
    if(!isMob){hide('mobilePlayableRow');return;}
    var mp4M=movies.filter(function(m){var u=(m.streamUrl||'').toLowerCase().split('?')[0];return u.endsWith('.mp4')||u.endsWith('.m4v');});
    var mp4S=series.filter(function(s){var allEps=[].concat.apply([],Object.values(s.seasons||{}));if(!allEps.length)return false;return allEps.every(function(e){var u=(e.streamUrl||'').toLowerCase().split('?')[0];return u.endsWith('.mp4')||u.endsWith('.m4v');});}).map(function(s){return Object.assign({},s,{_isSeries:true});});
    var combined=mp4M.concat(mp4S).filter(function(i){return!!i.poster;}).sort(function(a,b){return(parseInt(b.year)||0)-(parseInt(a.year)||0);}).slice(0,80);
    if(!combined.length){hide('mobilePlayableRow');return;}
    document.getElementById('mobilePlayableTrack').innerHTML=combined.map(function(item){return item._isSeries?sCardHTML(item):cardHTML(item);}).join('');
    show('mobilePlayableRow');
  })();
  const newMovies = movies.filter(m=>!m.isFtp&&!m.isTrending).slice(-10).reverse();
  const newSeries = series.filter(s=>!s.isFtp).slice(-5).reverse().map(s=>({...s,_isSeries:true}));
  const newMixed = [...newSeries,...newMovies];
  if(newMixed.length>2){
    document.getElementById('newTrack').innerHTML=newMixed.slice(0,25).map(item=>item._isSeries?sCardHTML(item):cardHTML(item)).join('');
    show('newRow');
  }else hide('newRow');
  bsr('seriesTrack','seriesRow');
  
  // Hardcoded priority list for Marvel and DC (lower index = higher priority)
  const STUDIO_PRIORITY_TITLES = {
    marvel: [
      'avengers: endgame', 'avengers: infinity war', 'the avengers', 'avengers: age of ultron',
      'iron man', 'iron man 2', 'iron man 3',
      'captain america: civil war', 'captain america: the winter soldier', 'captain america: the first avenger',
      'thor: ragnarok', 'thor', 'thor: the dark world',
      'guardians of the galaxy', 'guardians of the galaxy vol. 2',
      'spider-man: no way home', 'spider-man: far from home', 'spider-man: homecoming',
      'black panther', 'doctor strange', 'ant-man', 'captain marvel', 'deadpool'
    ],
    dc: [
      'the dark knight', 'the dark knight rises', 'batman begins', 'the batman',
      'man of steel', 'superman returns', 'batman v superman: dawn of justice',
      'wonder woman', 'wonder woman 1984',
      'justice league', 'aquaman', 'joker', 'shazam!', 'suicide squad', 'black adam'
    ]
  };

  // Special sorting for Marvel and DC rows – ensures major titles appear first
  function bgrStudioWithPriority(trackId, rowId, predicate, publisher) {
    const mList = movies.filter(predicate);
    const sList = series.filter(predicate).map(s => ({...s, _isSeries: true}));
    let list = [...mList, ...sList];
    
    console.log(`[Studio] ${publisher}: ${list.length} items matched`);
    
    if (list.length === 0) {
      hide(rowId);
      return;
    }
    
    const priorityList = STUDIO_PRIORITY_TITLES[publisher] || [];
    
    // Sort: priority titles first (in defined order), then remaining by year desc, then rating
    list.sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      
      const aPriorityIdx = priorityList.findIndex(pattern => aName.includes(pattern));
      const bPriorityIdx = priorityList.findIndex(pattern => bName.includes(pattern));
      
      if (aPriorityIdx !== -1 && bPriorityIdx !== -1) {
        return aPriorityIdx - bPriorityIdx;
      }
      if (aPriorityIdx !== -1) return -1;
      if (bPriorityIdx !== -1) return 1;
      
      const aYear = parseInt(a.year) || 0;
      const bYear = parseInt(b.year) || 0;
      if (aYear !== bYear) return bYear - aYear;
      
      return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
    });
    
    document.getElementById(trackId).innerHTML = list.slice(0, 120).map(item =>
      item._isSeries ? sCardHTML(item) : cardHTML(item)
    ).join('');
    show(rowId);
  }
  
  const deferredBuilds = [
    ()=>bgr('actionTrack',    'actionRow',    ['action']),
    ()=>bgr('dramaTrack',     'dramaRow',     ['drama']),
    ()=>bgr('comedyTrack',    'comedyRow',    ['comedy']),
    ()=>bgr('horrorTrack',    'horrorRow',    ['horror']),
    ()=>bgr('thrillerTrack',  'thrillerRow',  ['thriller']),
    ()=>bgr('scifiTrack',     'scifiRow',     ['sci-fi']),
    ()=>bgr('animationTrack', 'animationRow', ['animation']),
    ()=>bgr('romanticTrack',  'romanticRow',  ['romance']),
    ()=>bgr('adventureTrack', 'adventureRow', ['adventure']),
    ()=>bgr('fantasyTrack',   'fantasyRow',   ['fantasy']),
    ()=>bgr('familyTrack',    'familyRow',    ['family']),
    ()=>bgr('crimeTrack',     'crimeRow',     ['crime']),
    ()=>bgr('mysteryTrack',   'mysteryRow',   ['mystery']),
    ()=>bgr('documentaryTrack','documentaryRow',['documentary']),
    ()=>bgr('biographyTrack', 'biographyRow', ['biography']),
    ()=>bgr('historicalTrack','historicalRow',['history']),
    ()=>bgr('warTrack',       'warRow',       ['war']),
    ()=>bgr('westernTrack',   'westernRow',   ['western']),
    ()=>bgr('musicalTrack',   'musicalRow',   ['musical','music']),
    ()=>bgr('sportTrack',     'sportRow',     ['sport']),
    ()=>bgrLang('hindiTrack',   'hindiRow',   ['hindi']),
    ()=>bgrLang('bengaliTrack', 'bengaliRow', ['bengali']),
    ()=>bgrLang('koreanTrack',  'koreanRow',  ['korean']),
    ()=>bgrLang('japaneseTrack','japaneseRow',['japanese']),
    ()=>bgrLang('tamilTrack',   'tamilRow',   ['tamil']),
    ()=>bgrLang('teluguTrack',  'teluguRow',  ['telugu']),
    ()=>bgrLang('chineseTrack', 'chineseRow', ['chinese','mandarin','cantonese']),
    ()=>bgrLang('turkishTrack', 'turkishRow', ['turkish']),
    ()=>bgrLang('spanishTrack', 'spanishRow', ['spanish']),
    ()=>bgrCustom('highRatedTrack','highRatedRow',item=>item.rating&&parseFloat(item.rating)>=8.0),
    
()=>buildStudioRow('marvelTrack','marvelRow','marvel',
  ['avengers','iron man','captain america','thor','spider-man','spider man','black panther','doctor strange','ant-man','ant man','guardians of the galaxy','deadpool','wolverine','fantastic four','black widow','shang-chi','captain marvel','infinity war'],
  ['avengers endgame','avengers infinity war','the avengers','iron man','captain america civil war','guardians of the galaxy','spider man no way home','black panther','thor ragnarok']),
()=>buildStudioRow('dcTrack','dcRow','dc',
  ['batman','superman','wonder woman','aquaman','the flash 2023','joker 2019','joker folie','shazam','suicide squad','justice league','man of steel','dark knight','black adam','blue beetle','batman begins','the batman 2022','zack snyder'],
  ['the dark knight','man of steel','wonder woman','justice league','aquaman','joker','the batman','batman begins','batman v superman']),
    // Other studios keep original boosted scoring
    ()=>bgrCustomWithScore('disneyTrack','disneyRow', item=>fuzzyTitleMatch(item, ['disney','pixar','aladdin','mulan','moana','encanto','coco','frozen','tangled','brave','ratatouille','wall-e','inside out','soul','luca','lion king']), 'disney'),
    ()=>bgrCustomWithScore('netflixTrack','netflixRow', item=>fuzzyTitleMatch(item, ['bright','bird box','extraction','the old guard','6 underground','army of the dead','red notice','enola holmes','marriage story','tick tick boom','stranger things','witcher']), 'netflix'),
    ()=>bgrCustomWithScore('universalTrack','universalRow', item=>fuzzyTitleMatch(item, ['jurassic','fast and furious','fast & furious','minions','despicable me','the mummy','halloween','purge','jason bourne','king kong']), 'universal'),
    ()=>bgrCustomWithScore('dreamworksTrack','dreamworksRow', item=>fuzzyTitleMatch(item, ['shrek','kung fu panda','how to train your dragon','madagascar','puss in boots']), 'dreamworks'),
    ()=>bgrCustomWithScore('paramountTrack','paramountRow', item=>fuzzyTitleMatch(item, ['mission impossible','top gun','transformers','indiana jones','titanic','the godfather','forrest gump','interstellar','a quiet place']), 'paramount'),
    ()=>bgrCustomWithScore('a24Track','a24Row', item=>fuzzyTitleMatch(item, ['moonlight','everything everywhere','midsommar','hereditary','ex machina','uncut gems','lady bird']), 'a24'),
  ];
  const _isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.innerWidth<768;
  function runDeferred(i){
    if(i>=deferredBuilds.length)return;
    const fn=()=>{deferredBuilds[i]();setTimeout(()=>runDeferred(i+1),0);};
    // On desktop use requestIdleCallback; on mobile use setTimeout(0) chain — faster
    (!_isMobile && window.requestIdleCallback) ? window.requestIdleCallback(fn,{timeout:1000}) : setTimeout(fn,0);
  }
  runDeferred(0);
}

function bgr(tid, rid, genres){
  const mList = movies.filter(m => genreMatch(m, genres));
  const sList = series.filter(s => genreMatch(s, genres)).map(s=>({...s,_isSeries:true}));
  const list = _dedupSort([...sList, ...mList]);
  if(list.length >= 1){document.getElementById(tid).innerHTML=list.slice(0,120).map(item=>item._isSeries?sCardHTML(item):cardHTML(item)).join('');show(rid);}else hide(rid);
}
function bgrLang(tid, rid, langs){
  const mList = movies.filter(m => langMatch(m, langs));
  const sList = series.filter(s => langMatch(s, langs)).map(s=>({...s,_isSeries:true}));
  const list = _dedupSort([...sList, ...mList]);
  if(list.length >= 1){document.getElementById(tid).innerHTML=list.slice(0,120).map(item=>item._isSeries?sCardHTML(item):cardHTML(item)).join('');show(rid);}else hide(rid);
}
function bgrCustom(tid, rid, predFn){
  const mList = movies.filter(predFn);
  const sList = series.filter(predFn).map(s=>({...s,_isSeries:true}));
  const list = _dedupSort([...sList, ...mList]);
  if(list.length >= 1){document.getElementById(tid).innerHTML=list.slice(0,120).map(item=>item._isSeries?sCardHTML(item):cardHTML(item)).join('');show(rid);}else hide(rid);
}
function bsr(tid,rid){if(!series.length){hide(rid);return;}document.getElementById(tid).innerHTML=series.slice(0,120).map(sCardHTML).join('');show(rid);}
function buildSeriesGrid(){ filterSeriesPage(); }

function registerMovieForDetail(movie){
  const key = 'md-' + (++_movieDetailSeq);
  _movieDetailRegistry.set(key, movie);
  return key;
}

function registerSeriesForDetail(show){
  const key = 'sd-' + (++_seriesDetailSeq);
  _seriesDetailRegistry.set(key, show);
  return key;
}

function svLegacySCardHTMLUnused(s){
  const sc=Object.keys(s.seasons).length,ep=Object.values(s.seasons).reduce((a,b)=>a+b.length,0);
  const img=s.poster?`<img src="${esc(s.poster)}" alt="${esc(s.name)}" loading="lazy">`:`<div class="card-placeholder"><div class="icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="rgba(255,255,255,.2)"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></div><div class="pname">${esc(s.name)}</div></div>`;
  const sname=esc(s.name).replace(/'/g,"\\'");
  return `<div class="card" onclick="openSeriesModal('${sname}')">${img}<div class="series-badge">SERIES</div><div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(s.name)}</div><div class="card-meta">${s.rating?`<span class="card-rating">★ ${s.rating}</span>`:''}<span>${sc}S · ${ep}Ep</span></div></div></div>`;
}
function svLegacyCardHTMLUnused(m, sp=false){
  const sn=esc(m.name).replace(/'/g,"\\'");
  const img=m.poster?`<img src="${m.poster}" alt="${esc(m.name)}" loading="lazy">`:`<div class="card-placeholder"><div class="icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="rgba(255,255,255,.2)"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg></div><div class="pname">${esc(m.name)}</div></div>`;
  const prog=watchProgress[m.id];
  const bar=sp&&prog?`<div class="card-progress"><div class="card-progress-fill" style="width:${Math.round(prog.progress*100)}%"></div></div>`:'';
  const isUnplayable = m.isTrending && !m.streamUrl && !m.isFtp && typeof m.id === 'string' && m.id.startsWith('tmdb_');
  let onclick;
  if(isUnplayable){
    onclick=`showToast('This title is unavailable')`;
  } else if(m.streamUrl){
    const streamUrl=esc(m.streamUrl).replace(/'/g,"\\'");
    onclick=`playFtpMedia('${streamUrl}','${sn}','${esc(m.year||'')}')`;
  }else{
    onclick=`playMedia(${m.id},'${sn}','${esc(m.year||'')}')`;
  }
  const unavailableOverlay = '';
  return `<div class="card" onclick="${onclick}">${img}${unavailableOverlay}<div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(m.name)}</div><div class="card-meta">${m.rating?`<span class="card-rating">★ ${m.rating}</span>`:''} ${m.year?`<span>${m.year}</span>`:''}</div></div>${bar}</div>`;
}

function seriesEpisodes(show){
  return Object.values(show?.seasons || {}).reduce((all, eps)=>all.concat(Array.isArray(eps)?eps:[]), []);
}

function renderSeriesMediaInfo(show){
  const eps = seriesEpisodes(show);
  if(!eps.length){
    const grid = document.getElementById('smMediaGrid');
    if(grid)grid.innerHTML = noDataHTML();
    return;
  }
  const first = eps[0] || {};
  const allFtp = eps.every(ep=>ep.isFtp);
  const anyFtp = eps.some(ep=>ep.isFtp);
  renderMetadataGrid('smMediaGrid', [
    {label:'Seasons', value:String(Object.keys(show.seasons || {}).length || '')},
    {label:'Episodes', value:String(eps.length || '')},
    {label:'Quality', value:inferQuality({name:show.name,file:first.file,streamUrl:first.streamUrl})},
    {label:'Source', value:allFtp ? 'FTP source' : anyFtp ? 'Mixed sources' : 'Local server'},
    {label:'Format', value:first.streamUrl ? String(first.streamUrl).split('?')[0].split('.').pop()?.toUpperCase() : first.file ? String(first.file).split('.').pop()?.toUpperCase() : 'Auto'},
  ]);
}

function renderSeriesAbout(show, details){
  if(details?.about?.length){
    renderMetadataGrid('smAboutGrid', details.about);
    return;
  }
  const companies = Array.isArray(show.productionCompanies) ? show.productionCompanies.slice(0,3).join(', ') : '';
  renderMetadataGrid('smAboutGrid', [
    {label:'Year', value:show.year || 'Unknown'},
    {label:'Rating', value:show.rating ? `${show.rating}/10` : 'Unrated'},
    {label:'Genres', value:show.genre || 'Unknown'},
    {label:'Language', value:show.language || 'Unknown'},
    {label:'Production', value:companies || 'Unavailable'},
    {label:'Type', value:'Series'},
  ]);
}

async function loadSeriesOnlineDetails(show, token, scope){
  try{
    const details = await fetchTitleDetails(show, 'tv', {signal:scope?.signal});
    if(token !== _titleDetailsToken || currentShow !== show || !isCurrentDetailScope(scope))return;
    mergeTitleDetails(show, details);
    renderOnlineSections('sm', details || {}, 'tv', show);
    renderSeriesAbout(show, details);
    const overviewEl = document.getElementById('smOverview');
    if(details?.overview && !overviewEl.textContent){
      overviewEl.textContent = details.overview;
      setupSeriesOverview(details.overview);
    }
    if(details?.poster || details?.backdrop)svApplyModalArtwork({item:show,type:'tv',backdropId:'smBackdrop',posterId:'smPoster'});
  }catch(e){
    if(e?.name === 'AbortError')return;
    console.warn('[Series] Online details unavailable:', e.message);
    renderOnlineSections('sm', localTitleDetails(show, 'tv'), 'tv', show);
  }
}

function openSeriesDetail(key){
  const show = _seriesDetailRegistry.get(key);
  if(!show)return;
  if(window.innerWidth > 768){
    openMediaModal(show, 'tv');
    return;
  }
  if(!svSeriesHasEpisodes(show)){
    svHydrateSeriesEpisodes(show).then(hydrated=>{
      if(hydrated)openSeriesDetail(key);
      else showToast('Episode list is temporarily unavailable');
    });
    return;
  }
  showSeriesDetail(show);
}

function mediaModalTypeFor(item, requestedType=''){
  return requestedType === 'tv' || item?.type === 'tv' || item?.type === 'series' || item?.seasons ? 'tv' : 'movie';
}

function mediaModalDirectPreview(details={}, item={}){
  const candidates=[
    item.trailerPreview,
    item.trailerUrl,
    details.trailerPreview,
    ...((Array.isArray(details.trailers) ? details.trailers : []).map(t=>t?.url))
  ];
  return candidates.find(url=>/\.(?:mp4|webm|ogg)(?:$|[?#])/i.test(String(url || ''))) || '';
}

function mediaDownloadIconSvg(){
  return '<svg class="media-download-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3zM5 19h14v2H5v-2z"/></svg>';
}

function triggerMediaDownload(url){
  if(!url){showToast('Download unavailable');return false;}
  showToast('Starting download…');
  let target=document.getElementById('svMediaDownloadTarget');
  if(!target){
    target=document.createElement('iframe');
    target.id='svMediaDownloadTarget';
    target.name='svMediaDownloadTarget';
    target.title='Media download';
    target.style.display='none';
    document.body.appendChild(target);
  }
  const anchor=document.createElement('a');
  anchor.href=svBackendUrl(url);
  anchor.download='';
  anchor.target=target.name;
  anchor.style.display='none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

function movieDownloadUrl(movie){
  const id=movie?.id ?? movie?.streamId;
  if(id===null || id===undefined || id==='')return '';
  const params=new URLSearchParams();
  if(movie?.name || movie?.title)params.set('title',movie.name || movie.title);
  if(movie?.year)params.set('year',movie.year);
  const query=params.toString();
  return `/api/download/movie/${encodeURIComponent(id)}${query?'?'+query:''}`;
}

function downloadMovieFromDetail(event,movieOverride=null){
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return triggerMediaDownload(movieDownloadUrl(movieOverride || currentDetailMovie));
}

function downloadSeriesEpisode(event,season,index,showOverride=null){
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const show=showOverride || currentShow;
  const episodes=show?.seasons?.[season] || show?.seasons?.[String(season)] || [];
  const episode=episodes[Number(index)];
  const seriesId=show?.id;
  const episodeNumber=Number(episode?.episode ?? episode?.number ?? Number(index)+1);
  if(!seriesId || !Number.isInteger(episodeNumber))return triggerMediaDownload('');
  return triggerMediaDownload(`/api/download/series/${encodeURIComponent(seriesId)}/${encodeURIComponent(Number(season))}/${encodeURIComponent(episodeNumber)}`);
}

function renderMediaModalActions(item, type){
  const actions=document.getElementById('modalButtons');
  if(!actions)return;
  if(type === 'tv'){
    const seasons=Object.keys(item?.seasons || {}).map(Number).sort((a,b)=>a-b);
    const firstEpisode=seasons.length ? (item.seasons[seasons[0]] || [])[0] : null;
    const progress=firstEpisode ? watchProgress[firstEpisode.streamId] : null;
    actions.innerHTML=`
      <button class="media-modal-action primary" type="button" onclick="playMediaModalPrimary()"${firstEpisode?'':' disabled'}>${firstEpisode?'Play':'Unavailable'}</button>
      ${progress && Number(progress.progress) > .02 ? '<button class="media-modal-action secondary" type="button" onclick="playMediaModalPrimary()">Resume</button>' : ''}`;
    return;
  }
  const unavailable=isMovieUnavailable(item);
  const progress=watchProgress[item?.streamId ?? item?.id] || null;
  actions.innerHTML=`
    <button class="media-modal-action primary" type="button" onclick="playMediaModalPrimary()"${unavailable?' disabled':''}>${unavailable?'Unavailable':'Play'}</button>
    ${!unavailable?`<button class="media-modal-action secondary media-download-action" type="button" onclick="downloadMovieFromDetail(event)" title="Download original media file" aria-label="Download ${esc(item?.name || item?.title || 'movie')}">${mediaDownloadIconSvg()}<span>Download</span></button>`:''}
    ${!unavailable && progress && Number(progress.progress) > .02 ? '<button class="media-modal-action secondary" type="button" onclick="playMediaModalPrimary()">Resume</button>' : ''}
    <button class="media-modal-action secondary" type="button" onclick="toggleMediaModalWatchlist()">${isMovieWatchlisted(item)?'In Watchlist':'Watchlist'}</button>`;
  updateMediaModalWishlistButton();
}

function updateMediaModalWishlistButton(){
  const btn = document.getElementById('modalWishlistBtn');
  if(!btn)return;
  const type = currentMediaModalType;
  const item = type === 'tv' ? currentShow : currentDetailMovie;
  const active = type === 'tv' ? isSeriesWatchlisted(item) : isMovieWatchlisted(item);
  const label = active ? 'Remove from wishlist' : 'Add to wishlist';
  btn.classList.toggle('active', !!active);
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function renderMediaModalEpisodes(show, selectedSeason){
  const root=document.getElementById('modalEpisodes');
  if(!root)return;
  const seasons=Object.keys(show?.seasons || {}).map(Number).sort((a,b)=>a-b);
  if(!seasons.length){root.innerHTML='';root.style.display='none';return;}
  root.style.display='';
  const season=seasons.includes(Number(selectedSeason ?? currentSeason)) ? Number(selectedSeason ?? currentSeason) : seasons[0];
  currentSeason=season;
  const episodes=show.seasons[season] || [];
  const options=seasons.map(value=>`<option value="${value}"${value===season?' selected':''}>Season ${value}</option>`).join('');
  const cards=episodes.map((episode,index)=>{
    const thumb=episode.thumb || episode.thumbnail || episode.poster || show.backdrop || show.poster || imageFallbackData(show.name);
    const title=episode.epTitle || episode.title || `Episode ${episode.episode || index + 1}`;
    return `<div class="media-modal-episode${Number(svMediaModalSelectedEpisode)===index?' active':''}" data-episode-index="${index}">
      <button class="media-modal-episode-play" type="button" onclick="playMediaModalEpisode(${season},${index})" aria-label="Play Episode ${esc(episode.episode || index + 1)}">
      <img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(imageFallbackData(show.name))}'">
      <span class="media-modal-episode-copy">
        <span class="media-modal-episode-number">Episode ${esc(episode.episode || index + 1)}</span>
        <span class="media-modal-episode-title">${esc(title)}</span>
      </span>
      </button>
      <button class="media-modal-episode-download" type="button" onclick="downloadSeriesEpisode(event,${season},${index})" title="Download Episode ${esc(episode.episode || index + 1)}" aria-label="Download Episode ${esc(episode.episode || index + 1)}">${mediaDownloadIconSvg()}</button>
    </div>`;
  }).join('');
  root.className='media-modal-section';
  root.innerHTML=`<h2 class="media-modal-heading">Episodes</h2>
    <div class="media-modal-season-row"><select aria-label="Season" onchange="selectMediaModalSeason(this.value)">${options}</select></div>
    <div class="media-modal-episodes">${cards || noDataHTML()}</div>`;
}

function selectMediaModalSeason(value){
  svMediaModalSelectedEpisode=null;
  renderMediaModalEpisodes(currentShow,Number(value));
}

function renderMediaModalData(item, type, details={}){
  const local=localTitleDetails(item,type);
  const data=details?.ok ? {...local,...details} : local;
  const title=data.title || item.name || item.title || 'Untitled';
  document.getElementById('modalTitle').textContent=title;
  const meta=[data.rating ? `\u2605 ${data.rating}` : '', data.year || item.year || '', data.runtime || item.runtime || '', data.genres || item.genre || '', type === 'tv' ? 'Series' : 'Movie'].filter(Boolean);
  document.getElementById('modalMeta').textContent=meta.join('  \u2022  ');

  const preview=document.getElementById('modalPreview');
  const artworkItem=data.backdrop || data.poster ? {...item,...data} : item;
  preview.pause();
  preview.removeAttribute('src');
  svApplyMediaModalArtwork(preview,artworkItem,type,item);
  const previewUrl=mediaModalDirectPreview(data,item);
  if(previewUrl){preview.src=previewUrl;preview.load();preview.play().catch(()=>{});}
  else preview.load();

  renderMediaModalActions(item,type);
  const description=document.getElementById('modalDescription');
  document.getElementById('modalDescriptionHeading').textContent=`About ${title}`;
  description.textContent=data.overview || item.overview || 'No overview is available for this title yet.';

  const cast=Array.isArray(data.cast) ? data.cast.slice(0,12) : [];
  const castRoot=document.getElementById('modalCast');
  castRoot.className='media-modal-section';
  castRoot.style.display=cast.length ? '' : 'none';
  castRoot.innerHTML=`<h2 class="media-modal-heading">Cast</h2><div class="media-modal-cast-track">${cast.length ? cast.map(person=>`<div class="person-card"><div class="person-photo">${person.image?`<img src="${esc(person.image)}" alt="${esc(person.name || '')}" loading="lazy">`:personPlaceholder()}</div><div class="person-name">${esc(person.name || 'Unknown')}</div><div class="person-role">${esc(person.role || '')}</div></div>`).join('') : noDataHTML()}</div>`;

  const extra=document.getElementById('modalExtraInfo');
  extra.className='media-modal-section';
  extra.innerHTML=`<h2 class="media-modal-heading">Details</h2><div class="metadata-grid">${metadataGridFromItems([
    {label:'Year',value:data.year || item.year || 'Unknown'},
    {label:'Rating',value:data.rating ? `${data.rating}/10` : 'Unrated'},
    {label:'Runtime',value:data.runtime || item.runtime || (type === 'tv' ? `${Object.keys(item.seasons || {}).length} seasons` : 'Unknown')},
    {label:'Genres',value:data.genres || item.genre || 'Unknown'},
    {label:'Language',value:data.language || item.language || 'Unknown'},
    {label:'Type',value:type === 'tv' ? 'Series' : 'Movie'}
  ])}</div>`;

  if(type === 'tv')renderMediaModalEpisodes(item);
  else {const episodes=document.getElementById('modalEpisodes');episodes.innerHTML='';episodes.className='';episodes.style.display='none';}

  const related=[...(Array.isArray(data.similar)?data.similar:[]),...(Array.isArray(local.similar)?local.similar:[])];
  const seen=new Set();
  const playable=filterPlayableMediaItems(related).filter(candidate=>{
    const key=String(candidate.tmdbId || candidate.id || candidate.streamUrl || candidate.name || '').toLowerCase();
    if(!key || seen.has(key))return false;
    seen.add(key);
    return true;
  }).slice(0,16);
  const relatedRoot=document.getElementById('modalRelated');
  relatedRoot.className='media-modal-section';
  relatedRoot.style.display=playable.length ? '' : 'none';
  relatedRoot.innerHTML=`<h2 class="media-modal-heading">More Like This</h2><div class="media-modal-related-track">${playable.length ? playable.map(candidate=>(candidate.type === 'tv' || candidate.seasons) ? sCardHTML(candidate) : cardHTML(candidate)).join('') : noDataHTML()}</div>`;
}

async function populateModalFields(item){
  const type=currentMediaModalType;
  const token=++mediaModalRenderToken;
  renderMediaModalData(item,type,localTitleDetails(item,type));
  svPrewarmPlaybackMetadata(type === 'tv' ? seriesEpisodes(item)[0] : item);
  try{
    const details=await fetchTitleDetails(item,type);
    if(token !== mediaModalRenderToken || currentMediaModalItem !== item || document.getElementById('mediaModal')?.classList.contains('hidden'))return;
    mergeTitleDetails(item,details);
    renderMediaModalData(item,type,details || {});
  }catch(error){
    if(error?.name !== 'AbortError')console.warn('[Media Modal] Online details unavailable:',error.message);
  }
}

function populateModal(item){
  return populateModalFields(item);
}


/* SV_SERIES_DETAIL_HYDRATION_V2 */
const svSeriesHydrationCache=new Map();
const svSeriesHydrationPending=new Map();
let svSeriesFullCatalogCache=null;
let svSeriesFullCatalogPending=null;

function svSeriesEpisodeCount(item){
  return Object.values(item?.seasons || {}).reduce((n,eps)=>n+(Array.isArray(eps)?eps.length:0),0);
}

function svSeriesHasEpisodes(item){
  return svSeriesEpisodeCount(item)>0;
}

function svSeriesLookupTitle(value){
  return String(value || '')
    .replace(/\((?:tv\s*)?(?:series|mini\s*series)[^)]*\)/ig,' ')
    .replace(/\[(?:dual|multi)?\s*audio[^\]]*\]/ig,' ')
    .replace(/\[[^\]]*(?:480p|576p|720p|1080p|1440p|2160p|4k|uhd|hdr|web[- ]?dl|webrip|bluray|x264|x265|h264|h265|hevc)[^\]]*\]/ig,' ')
    .replace(/\b(?:tv\s*series|tv\s*mini\s*series|480p|576p|720p|1080p|1440p|2160p|4k|uhd|hdr|web[- ]?dl|webrip|bluray|brrip|x264|x265|h264|h265|hevc|avc|aac|ac3|eac3|ddp?|dts|10bit|8bit|dual\s*audio|multi\s*audio)\b/ig,' ')
    .replace(/[._]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function svSeriesMatchKey(value){
  let text=svSeriesLookupTitle(value);
  try{text=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}catch(_){}
  return text.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

function svSeriesHydrationScore(target,candidate){
  const a=svSeriesMatchKey(target?.name || target?.title);
  const b=svSeriesMatchKey(candidate?.name || candidate?.title);
  if(!a || !b || !svSeriesHasEpisodes(candidate))return -1;
  let score=a===b?5000:(a.includes(b)||b.includes(a)?2800:0);
  if(!score){
    const aa=new Set(a.split(' ').filter(Boolean)),bb=new Set(b.split(' ').filter(Boolean));
    let hit=0;
    aa.forEach(token=>{if(bb.has(token))hit++;});
    const ratio=hit/Math.max(aa.size,bb.size,1);
    if(ratio>=0.8)score=Math.round(ratio*1400);
  }
  if(!score)return -1;
  const ta=String(target?.tmdbId || '').trim();
  const tb=String(candidate?.tmdbId || '').trim();
  if(ta && tb)score += ta===tb ? 10000 : -1200;
  const ya=String(target?.year || target?.name || '').match(/\b(19|20)\d{2}\b/)?.[0] || '';
  const yb=String(candidate?.year || candidate?.name || '').match(/\b(19|20)\d{2}\b/)?.[0] || '';
  if(ya && yb)score += ya===yb ? 900 : -350;
  return score+Math.min(1200,svSeriesEpisodeCount(candidate));
}

function svBestSeriesHydrationCandidate(item,rows){
  let best=null,bestScore=-1;
  (rows || []).forEach(candidate=>{
    const score=svSeriesHydrationScore(item,candidate);
    if(score>bestScore){best=candidate;bestScore=score;}
  });
  return bestScore>=1000?best:null;
}

function svApplySeriesHydration(item,best){
  if(!item || !best || !svSeriesHasEpisodes(best))return null;
  const hydrated={
    seasons:best.seasons,
    seasonCount:Object.keys(best.seasons || {}).length,
    episodeCount:svSeriesEpisodeCount(best),
    isSummary:false,
    isFtp:!!best.isFtp,
    streamAvailable:true,
    hasStream:true
  };
  ['genre','language','runtime','overview','rating','year','tmdbId','imdbId','category'].forEach(field=>{
    if(!item[field] && best[field])hydrated[field]=best[field];
  });
  Object.assign(item,hydrated);
  return hydrated;
}

async function svLoadFullSeriesCatalog(){
  if(Array.isArray(svSeriesFullCatalogCache))return svSeriesFullCatalogCache;
  if(svSeriesFullCatalogPending)return svSeriesFullCatalogPending;

  svSeriesFullCatalogPending=(async()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(`${API_BASE}/api/series`,{
        cache:'no-store',
        signal:controller.signal,
        headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error(`series catalog ${response.status}`);
      const payload=await response.json();
      const rows=Array.isArray(payload)?payload:(Array.isArray(payload?.series)?payload.series:[]);
      const full=rows.filter(svSeriesHasEpisodes);
      if(!full.length)throw new Error('full series catalog returned no episodes');
      svSeriesFullCatalogCache=full;
      return full;
    }finally{
      clearTimeout(timer);
      svSeriesFullCatalogPending=null;
    }
  })();
  return svSeriesFullCatalogPending;
}

async function svHydrateSeriesEpisodes(item){
  if(!item || svSeriesHasEpisodes(item))return item;
  const query=svSeriesLookupTitle(item.name || item.title);
  if(!query)return null;
  const key=svSeriesMatchKey(query)+'|'+String(item.year || '')+'|'+String(item.tmdbId || '');

  if(svSeriesHydrationCache.has(key)){
    const cached=svSeriesHydrationCache.get(key);
    if(cached)Object.assign(item,cached);
    return cached?item:null;
  }
  if(svSeriesHydrationPending.has(key))return svSeriesHydrationPending.get(key);

  const task=(async()=>{
    const immediate=svBestSeriesHydrationCandidate(item,[...(series || []),...(svSeriesFullCatalogCache || [])]);
    if(immediate){
      const hydrated=svApplySeriesHydration(item,immediate);
      svSeriesHydrationCache.set(key,hydrated);
      return item;
    }

    const rows=await svLoadFullSeriesCatalog();
    const best=svBestSeriesHydrationCandidate(item,rows);
    if(!best){
      svSeriesHydrationCache.set(key,null);
      return null;
    }
    const hydrated=svApplySeriesHydration(item,best);
    svSeriesHydrationCache.set(key,hydrated);
    return item;
  })().catch(error=>{
    if(error?.name!=='AbortError')console.warn('[Series Detail] full-catalog hydration failed:',error?.message || error);
    return null;
  }).finally(()=>{
    svSeriesHydrationPending.delete(key);
  });

  svSeriesHydrationPending.set(key,task);
  return task;
}

function openMediaModal(item, requestedType=''){
  if(!item || window.innerWidth <= 768)return false;
  const modal=document.getElementById('mediaModal');
  if(!modal)return false;
  abortDetailRequestScope();
  const previousKey=currentMediaModalItem ? svStableMediaKey(currentMediaModalItem,currentMediaModalType) : '';
  const nextType=mediaModalTypeFor(item,requestedType);
  const nextKey=svStableMediaKey(item,nextType);
  currentMediaModalItem=item;
  currentMediaModalType=nextType;
  if(currentMediaModalType === 'tv'){
    currentShow=item;
    if(previousKey !== nextKey){
      currentSeason=Object.keys(item?.seasons || {}).map(Number).sort((a,b)=>a-b)[0] || 1;
      svMediaModalSelectedEpisode=null;
    }
    recordWatchHistory(item.id || item.name,item.name,item.genre || '','series');
  }else{
    currentDetailMovie=item;
    svMediaModalSelectedEpisode=null;
  }
  if(modal.classList.contains('hidden'))mediaModalBodyOverflow=document.body.style.overflow;
  modal.classList.remove('hidden');
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  modal.querySelector('.media-modal-content').scrollTop=0;
  document.body.style.overflow='hidden';
  populateModal(item);
  if(currentMediaModalType === 'tv' && !svSeriesHasEpisodes(item)){
    const episodesRoot=document.getElementById('modalEpisodes');
    if(episodesRoot){
      episodesRoot.className='media-modal-section';
      episodesRoot.style.display='';
      episodesRoot.innerHTML='<h2 class="media-modal-heading">Episodes</h2><div class="no-data">Loading full episode list…</div>';
    }
    svHydrateSeriesEpisodes(item).then(hydrated=>{
      if(currentMediaModalItem !== item || document.getElementById('mediaModal')?.classList.contains('hidden'))return;
      if(hydrated){
        currentShow=item;
        currentSeason=Object.keys(item.seasons || {}).map(Number).sort((a,b)=>a-b)[0] || 1;
      }
      populateModal(item);
    });
  }
  updateMediaModalWishlistButton();
  svPushDetailHistory('media');
  return true;
}

function closeMediaModal(){
  if(!svDetailHistoryLock && history.state?.view === 'detail'){
    history.back();
    return;
  }
  const modal=document.getElementById('mediaModal');
  if(!modal || modal.classList.contains('hidden'))return;
  modal.classList.remove('show');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
  const preview=document.getElementById('modalPreview');
  preview?.pause();
  preview?.removeAttribute('src');
  preview?.load();
  document.body.style.overflow=mediaModalBodyOverflow || '';
  mediaModalRenderToken++;
  svModalArtworkToken++;
  abortDetailRequestScope();
  currentMediaModalItem=null;
  if(currentMediaModalType === 'movie')currentDetailMovie=null;
}

function svDeepFreezeSnapshot(value){
  if(!value || typeof value !== 'object' || Object.isFrozen(value))return value;
  Object.values(value).forEach(svDeepFreezeSnapshot);
  return Object.freeze(value);
}

function svImmutableLaunchSnapshot(value){
  let snapshot;
  try{
    snapshot=typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }catch(_){
    snapshot={...(value || {})};
  }
  return svDeepFreezeSnapshot(snapshot);
}

function svCaptureModernModalLaunch(item, mediaType, extra={}){
  if(!item)return null;
  currentMediaModalItem=item;
  currentMediaModalType=mediaType === 'tv' ? 'tv' : 'movie';
  if(currentMediaModalType === 'tv')currentShow=item;
  else currentDetailMovie=item;
  const snapshot=svImmutableLaunchSnapshot(svCurrentDetailState('media',extra));
  svPlayerLaunchSnapshot=snapshot;
  svPlayerLaunchItem=item;
  svPlayerReturnState=snapshot;
  svPlayerReturnItem=item;
  return snapshot;
}

function svSuspendMediaModalForPlayback(){
  const modal=document.getElementById('mediaModal');
  if(!modal)return;
  svPauseMediaModalPreview();
  modal.classList.remove('show');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}

function svLaunchMediaModalEpisode(show, season, index){
  if(!show)return;
  currentShow=show;
  currentMediaModalItem=show;
  currentMediaModalType='tv';
  currentSeason=Number(season);
  svMediaModalSelectedEpisode=Number(index);
  svCaptureModernModalLaunch(show,'tv',{
    season:currentSeason,
    epIdx:svMediaModalSelectedEpisode,
  });
  svSuspendMediaModalForPlayback();
  return playSeriesEpisode(show.name,currentSeason,svMediaModalSelectedEpisode);
}

function svLaunchMediaModalMovie(movie){
  if(!movie)return;
  currentDetailMovie=movie;
  currentMediaModalItem=movie;
  currentMediaModalType='movie';
  svCaptureModernModalLaunch(movie,'movie');
  svSuspendMediaModalForPlayback();
  return playMovieFromDetail();
}

function playMediaModalPrimary(){
  if(currentMediaModalType === 'tv'){
    const show=currentShow;
    const seasons=Object.keys(show?.seasons || {}).map(Number).sort((a,b)=>a-b);
    if(!show || !seasons.length)return;
    const season=seasons.includes(Number(currentSeason)) ? Number(currentSeason) : seasons[0];
    const episodes=show.seasons[season] || [];
    const episodeIndex=Number.isInteger(Number(svMediaModalSelectedEpisode)) && episodes[Number(svMediaModalSelectedEpisode)]
      ? Number(svMediaModalSelectedEpisode)
      : 0;
    return svLaunchMediaModalEpisode(show,season,episodeIndex);
  }
  return svLaunchMediaModalMovie(currentDetailMovie || currentMediaModalItem);
}

function playMediaModalEpisode(season,index){
  const show=currentShow;
  if(!show)return;
  return svLaunchMediaModalEpisode(show,Number(season),Number(index));
}

function svPauseMediaModalPreview(){
  const preview=document.getElementById('modalPreview');
  try{preview?.pause?.();}catch(_){}
}

function toggleMediaModalWatchlist(){
  if(currentMediaModalType === 'tv'){
    toggleSeriesWatchlistFromDetail();
    renderMediaModalActions(currentShow,'tv');
    return;
  }
  if(!currentDetailMovie)return;
  toggleMovieWatchlistFromDetail();
  renderMediaModalActions(currentDetailMovie,'movie');
}

function svDesktopModalItemFromCard(card){
  if(!card)return null;
  const handler=String(card.getAttribute('onclick') || '');
  const movieKey=handler.match(/openMovieDetail\(['"]([^'"]+)['"]\)/)?.[1];
  if(movieKey && _movieDetailRegistry.has(movieKey))return _movieDetailRegistry.get(movieKey);
  const seriesKey=handler.match(/openSeriesDetail\(['"]([^'"]+)['"]\)/)?.[1];
  if(seriesKey && _seriesDetailRegistry.has(seriesKey))return _seriesDetailRegistry.get(seriesKey);
  const title=card.querySelector('.card-title')?.textContent?.trim();
  if(!title)return null;
  const seriesCard=!!card.querySelector('.series-badge') || /openSeriesModal/.test(handler);
  return seriesCard
    ? series.find(show=>String(show?.name || '').trim() === title) || null
    : movies.find(movie=>String(movie?.name || '').trim() === title) || null;
}

function svInstallDesktopMediaModalOverride(){
  if(document._svDesktopMediaModalOverrideInstalled)return;
  document._svDesktopMediaModalOverrideInstalled=true;
  const intercept=event=>{
    if(window.innerWidth <= 768)return;
    if(event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ')return;
    const card=event.target?.closest?.('.card');
    const item=svDesktopModalItemFromCard(card);
    if(!item)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(mediaModalTypeFor(item) === 'tv'){
      const key=registerSeriesForDetail(item);
      openSeriesDetail(key);
    }else openMediaModal(item,'movie');
  };
  const preload=event=>{
    const card=event.target?.closest?.('.card');
    const item=svDesktopModalItemFromCard(card);
    if(item)svQueueModalArtworkPreload(item,mediaModalTypeFor(item));
  };
  document.addEventListener('click',intercept,true);
  document.addEventListener('keydown',intercept,true);
  document.addEventListener('pointerover',preload,{passive:true});
  document.addEventListener('focusin',preload);
  document.addEventListener('touchstart',preload,{passive:true});
}

svInstallDesktopMediaModalOverride();

function setDetailPageScrollLock(locked){
  if(locked){
    if(!document.body.classList.contains('detail-page-open')){
      document.body.dataset.detailReturnScrollY = String(window.scrollY || 0);
    }
    document.body.classList.remove('modal-open');
    document.body.classList.add('detail-page-open');
    document.body.style.overflow = '';
    const root=document.documentElement;
    const previousBehavior=root.style.scrollBehavior;
    root.style.scrollBehavior='auto';
    window.scrollTo(0,0);
    root.style.scrollBehavior=previousBehavior;
    return;
  }
  const detailOpen = document.getElementById('movieDetailModal')?.classList.contains('open');
  const seriesOpen = document.getElementById('seriesModal')?.classList.contains('open');
  if(!detailOpen && !seriesOpen){
    const returnScrollY=Number(document.body.dataset.detailReturnScrollY) || 0;
    delete document.body.dataset.detailReturnScrollY;
    document.body.classList.remove('modal-open','detail-page-open');
    document.body.style.overflow = '';
    const root=document.documentElement;
    const previousBehavior=root.style.scrollBehavior;
    root.style.scrollBehavior='auto';
    window.scrollTo(0,returnScrollY);
    root.style.scrollBehavior=previousBehavior;
  }
}

function showSeriesDetail(show){
  if(show && window.innerWidth > 768){
    openMediaModal(show,'tv');
    return;
  }
  const scope=beginDetailRequestScope('series detail');
  currentShow=show;
  recordWatchHistory(show.id||show.name, show.name, show.genre||'', 'series');
  document.getElementById('smTitle').textContent=show.name || 'Untitled';
  document.getElementById('smRating').textContent=show.rating?'\u2605 '+show.rating:'';
  document.getElementById('smYear').textContent=show.year||'';
  document.getElementById('smGenre').textContent=show.genre?show.genre.split(',').slice(0,2).join(' / '):'';
  setupSeriesOverview(show.overview || '');
  document.getElementById('smDot1').style.display=show.rating?'':'none';
  document.getElementById('smDot2').style.display=(show.year&&show.genre)?'':'none';
  svApplyModalArtwork({item:show,type:'tv',backdropId:'smBackdrop',posterId:'smPoster'});
  const seasons=Object.keys(show.seasons || {}).map(Number).sort((a,b)=>a-b);
  const firstEp=seasons.length ? (show.seasons[seasons[0]]||[])[0] : null;
  const smPlayBtn=document.getElementById('smPlayBtn');
  if(firstEp){
    smPlayBtn.onclick=()=>playSeriesEpisode(show.name, seasons[0], 0);
    smPlayBtn.style.display='';
  } else {
    smPlayBtn.style.display='none';
  }
  const seasonTabsEl=document.getElementById('seasonTabs');
  seasonTabsEl.innerHTML=seasons.length>1?seasons.map(s=>`<button class="season-tab${s===seasons[0]?' active':''}" onclick="selectSeason(${s},this)">Season ${s}</button>`).join(''):'';
  seasonTabsEl.style.display=seasons.length>1?'flex':'none';
  currentSeason=seasons[0] || 1;
  if(seasons.length)renderEpisodes(show,currentSeason);
  else document.getElementById('epList').innerHTML = noDataHTML();
  renderOnlineSections('sm', localTitleDetails(show, 'tv'), 'tv', show);
  renderSeriesMediaInfo(show);
  renderSeriesAbout(show);
  if(firstEp)svPrewarmPlaybackMetadata(firstEp);
  const token = ++_titleDetailsToken;
  loadSeriesOnlineDetails(show, token, scope);
  updateSeriesWatchlistButton();
  svPushDetailHistory('series');
  document.getElementById('seriesModal').classList.add('open');
  document.getElementById('seriesModal').scrollTop=0;
  setDetailPageScrollLock(true);
}

function hydrateOpenSeriesDetail(show){
  if(!show || !document.getElementById('seriesModal')?.classList.contains('open'))return;
  currentShow=show;
  const seasons=Object.keys(show.seasons || {}).map(Number).sort((a,b)=>a-b);
  const firstSeason=seasons[0] || 1;
  const firstEp=(show.seasons?.[firstSeason] || [])[0] || null;
  const playBtn=document.getElementById('smPlayBtn');
  if(firstEp){
    playBtn.onclick=()=>playSeriesEpisode(show.name,firstSeason,0);
    playBtn.style.display='';
    svPrewarmPlaybackMetadata(firstEp);
  }else{
    playBtn.style.display='none';
  }
  const tabs=document.getElementById('seasonTabs');
  tabs.innerHTML=seasons.length>1
    ? seasons.map(season=>`<button class="season-tab${season===firstSeason?' active':''}" onclick="selectSeason(${season},this)">Season ${season}</button>`).join('')
    : '';
  tabs.style.display=seasons.length>1?'flex':'none';
  currentSeason=firstSeason;
  if(seasons.length)renderEpisodes(show,firstSeason);
  else document.getElementById('epList').innerHTML=noDataHTML();
  renderSeriesMediaInfo(show);
}

function openSeriesModal(showName){
  const show=series.find(s=>s.name===showName||esc(s.name)===showName);
  if(show){
    const key=registerSeriesForDetail(show);
    openSeriesDetail(key);
  }
  return;
  if(!show)return;
  currentShow=show;
  recordWatchHistory(show.id||show.name, show.name, show.genre||'', 'series');
  document.getElementById('smTitle').textContent=show.name;
  document.getElementById('smRating').textContent=show.rating?'★ '+show.rating:'';
  document.getElementById('smYear').textContent=show.year||'';
  document.getElementById('smGenre').textContent=show.genre?show.genre.split(',').slice(0,2).join(' · '):'';
  document.getElementById('smOverview').textContent=show.overview||'';
  document.getElementById('smDot1').style.display=show.rating?'':'none';
  document.getElementById('smDot2').style.display=(show.year&&show.genre)?'':'none';
  const bd=document.getElementById('smBackdrop');
  if(show.poster||show.backdrop){bd.src=svOptimizeImageUrl(show.backdrop||show.poster, true);bd.style.display='';}
  else bd.style.display='none';
  const sp=document.getElementById('smPoster');
  if(sp){sp.src=svOptimizeImageUrl(show.poster||show.backdrop||'', false);sp.style.display=sp.src?'':'none';}
  const seasons=Object.keys(show.seasons).map(Number).sort((a,b)=>a-b);
  const firstEp=(show.seasons[seasons[0]]||[])[0];
  const smPlayBtn=document.getElementById('smPlayBtn');
  if(firstEp){
    smPlayBtn.onclick=()=>playSeriesEpisode(show.name, seasons[0], 0);
    smPlayBtn.style.display='';
  } else {
    smPlayBtn.style.display='none';
  }
  const legacySeasonTabsEl=document.getElementById('seasonTabs');
  legacySeasonTabsEl.innerHTML=seasons.length>1?seasons.map(s=>`<button class="season-tab${s===seasons[0]?' active':''}" onclick="selectSeason(${s},this)">Season ${s}</button>`).join(''):'';
  legacySeasonTabsEl.style.display=seasons.length>1?'flex':'none';
  currentSeason=seasons[0];
  renderEpisodes(show,currentSeason);
  buildRelated(show);
  document.getElementById('seriesModal').classList.add('open');
  document.getElementById('seriesModal').scrollTop=0;
  setDetailPageScrollLock(true);
}

function buildRelated(show){
  return;
  const seedGenres = (show.genre||'').split(/[,/|]/).map(g=>g.trim().toLowerCase()).filter(Boolean);
  function scoreBy(item){
    if(!item.genre) return 0;
    const ig = item.genre.split(/[,/|]/).map(g=>g.trim().toLowerCase());
    return ig.filter(g => seedGenres.some(sg => g.includes(sg) || sg.includes(g))).length;
  }
  const relSeries = seedGenres.length
    ? series
        .filter(s => s.name !== show.name)
        .map(s => ({item:s, score:scoreBy(s)}))
        .filter(({score}) => score > 0)
        .sort((a,b) => b.score - a.score)
        .slice(0, 18)
        .map(({item}) => item)
    : [];
  if(relSeries.length){
    document.getElementById('smRelatedSeriesTrack').innerHTML = relSeries.map(s=>sCardHTML(s)).join('');
    document.getElementById('smRelatedSeries').style.display = '';
  } else {
    document.getElementById('smRelatedSeries').style.display = 'none';
  }
  const relMovies = seedGenres.length
    ? movies
        .map(m => ({item:m, score:scoreBy(m)}))
        .filter(({score}) => score > 0)
        .sort((a,b) => b.score - a.score)
        .slice(0, 18)
        .map(({item}) => item)
    : movies.slice().sort((a,b)=>(parseFloat(b.rating||0))-(parseFloat(a.rating||0))).slice(0,18);
  if(relMovies.length){
    document.getElementById('smRelatedMoviesTrack').innerHTML = relMovies.map(m=>cardHTML(m)).join('');
    document.getElementById('smRelatedMovies').style.display = '';
  } else {
    document.getElementById('smRelatedMovies').style.display = 'none';
  }
  const relSeriesNames = new Set(relSeries.map(s=>s.name));
  relSeriesNames.add(show.name);
  const moreSeries = series
    .filter(s => !relSeriesNames.has(s.name))
    .slice(0, 24);
  if(moreSeries.length){
    document.getElementById('smMoreSeriesTrack').innerHTML = moreSeries.map(s=>sCardHTML(s)).join('');
    document.getElementById('smMoreSeries').style.display = '';
  } else {
    document.getElementById('smMoreSeries').style.display = 'none';
  }
}

function selectSeason(n,el){
  currentSeason=n;
  document.querySelectorAll('.season-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderEpisodes(currentShow,n);
}

function renderEpisodes(show,season){
  const eps=show.seasons[season]||[];
  const fallbackRaw=show.backdrop||show.poster||imageFallbackData(show.name);
  const fallback=esc(fallbackRaw);
  const showName=esc(show.name).replace(/'/g,"\\'");
  document.getElementById('epList').innerHTML=eps.map((ep,epIdx)=>{
    const prog=watchProgress[ep.streamId],pct=prog?Math.round(prog.progress*100):0;
    const lbl=`${esc(show.name)} S${String(season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')}${ep.epTitle?' – '+esc(ep.epTitle):''}`;
    const thumb=ep.thumb||ep.thumbnail||ep.poster||(ep.streamId!=null?`${API_BASE}/api/thumbnail/${ep.streamId}`:fallbackRaw);
    const existingBrief=ep.overview||ep.description||ep.synopsis||'';
    let displayTitle = ep.epTitle||'';
    displayTitle = displayTitle.replace(new RegExp('^'+show.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*','i'),'').trim();
    displayTitle = displayTitle.replace(/^S\d{1,2}E\d{1,3}\b\s*/i,'').trim();
    displayTitle = displayTitle.replace(/\b\d{3,4}p\b.*/i,'').trim();
    displayTitle = displayTitle.replace(/\b(BluRay|WEBRip|x264|x265|HEVC|AAC|NF|AMZN|MSubs|ESub)\b.*/i,'').trim();
    if(!displayTitle) displayTitle = `Episode ${ep.episode}`;
    const onclick=`playSeriesEpisode('${showName}',${season},${epIdx})`;
    const epCardId = ep.streamId!=null ? ep.streamId : `s${season}e${ep.episode}`;
    return `<div class="ep-card" id="epcard-${epCardId}" onclick="${onclick}">
      <div class="ep-thumb">
        <img class="ep-thumb-img" src="${esc(thumb || fallbackRaw)}" alt="" loading="lazy" data-fallback="${fallback}" onerror="this.onerror=null;this.src=this.dataset.fallback">
        <div class="ep-thumb-play"><svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
        ${pct>2?`<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.12);border-radius:0 0 10px 10px"><div style="height:100%;width:${pct}%;background:var(--red);border-radius:0 0 10px 10px"></div></div>`:''}
      </div>
      <div class="ep-info">
        <div class="ep-num-label">Episode ${ep.episode}</div>
        <div class="ep-title">${esc(displayTitle)}</div>
        <div class="ep-overview" id="epbrief-${ep.streamId||'ftp-'+Math.random()}">${existingBrief?esc(existingBrief):'<span class="ep-brief-skeleton"></span>'}</div>
        ${ep.runtime?`<div class="ep-duration">${ep.runtime}</div>`:''}
      </div>
      <button class="ep-download-btn" type="button" onclick="downloadSeriesEpisode(event,${season},${epIdx})" title="Download Episode ${esc(ep.episode)}" aria-label="Download Episode ${esc(ep.episode)}">${mediaDownloadIconSvg()}</button>
    </div>`;
  }).join('');
  const genericCount = eps.filter(ep=>!ep.epTitle||/^Episode \d+$/.test(ep.epTitle)).length;
  if(genericCount > eps.length * 0.5){
    fetchOmdbEpisodeTitles(show.name, season, eps);
  }
}

async function fetchOmdbEpisodeTitles(showName, season, eps){
  try{
    const r = await fetchWithTimeout(`/api/episode-titles?show=${encodeURIComponent(showName)}&season=${season}`, {}, 3500);
    if(!r.ok) return;
    const titles = await r.json();
    if(!titles.length){ console.log('[TMDB] No episode data for', showName, 'S'+season); return; }
    console.log('[TMDB] Got', titles.length, 'episodes for', showName, 'S'+season);
    titles.forEach(({episode, title, overview, thumb})=>{
      const ep = eps.find(e=>e.episode===episode);
      if(ep){
        if(title)    ep.epTitle  = title;
        if(overview) ep.overview = overview;
        if(thumb)    ep.thumb    = thumb;
      }
      const cardId = ep?.streamId!=null ? ep.streamId : `s${season}e${episode}`;
      const card = document.getElementById(`epcard-${cardId}`);
      if(!card) return;
      if(title){
        const titleEl = card.querySelector('.ep-title');
        if(titleEl) titleEl.textContent = title;
      }
      if(overview){
        const briefEl = card.querySelector('.ep-overview');
        if(briefEl){ briefEl.style.opacity='0'; briefEl.textContent=overview; requestAnimationFrame(()=>{briefEl.style.transition='opacity .3s';briefEl.style.opacity='1';}); }
      }
      if(thumb){
        const imgEl = card.querySelector('.ep-thumb-img');
        if(imgEl && imgEl.getAttribute('src') !== thumb) imgEl.src = thumb;
      }
    });
  }catch(e){ console.warn('[TMDB] Episode fetch failed:', e.message); }
}

function playSeriesEpisode(showName, season, epIdx){
  console.log('[Playback] play button clicked');
  const show=(currentShow && (currentShow.name===showName||esc(currentShow.name)===showName))
    ? currentShow
    : series.find(s=>s.name===showName||esc(s.name)===showName);
  if(!show)return;
  const eps=show.seasons[season]||[];
  const ep=eps[epIdx];
  if(!ep)return;
  svRememberPlaybackReturnState('series', {season, epIdx});
  svPushPlayerHistory();
  const sNum=String(season).padStart(2,'0');
  const eNum=String(ep.episode).padStart(2,'0');
  const lbl=`${show.name} S${sNum}E${eNum}${ep.epTitle?' – '+ep.epTitle:''}`;
  const playbackContext=svPlaybackContextForEpisode(show,season,epIdx,ep);
  if(ep.streamUrl){
    playFtpMedia(ep.streamUrl,lbl,'',playbackContext);
  }else{
    playMedia(ep.streamId,lbl,'',playbackContext);
  }
  setTimeout(()=>showSeriesPlayerBar(show,season,epIdx),100);
}

function closeSeriesModal(){
  if(!svDetailHistoryLock && history.state?.view === 'detail'){
    history.back();
    return;
  }
  document.getElementById('seriesModal').classList.remove('open');
  abortDetailRequestScope();
  setDetailPageScrollLock(false);
}

function showSeriesPlayerBar(show, season, epIdx){
  _playerShow=show; _playerSeason=season; _playerEpIdx=epIdx;
  const bar=document.getElementById('seriesPlayerBar');
  bar.classList.add('show');
  const eps=show.seasons[season]||[];
  const ep=eps[epIdx];
  const epNum=String(epIdx+1).padStart(2,'0');
  document.getElementById('seriesEpLabel').textContent=displayText(`S${String(season).padStart(2,'0')}E${epNum}${ep&&ep.epTitle?' – '+ep.epTitle:''}`);
  document.getElementById('seriesShowLabel').textContent=displayText(show.name);
  const hasNext = epIdx+1 < eps.length || Object.keys(show.seasons).map(Number).sort((a,b)=>a-b).indexOf(season) < Object.keys(show.seasons).map(Number).sort((a,b)=>a-b).length-1;
  document.getElementById('nextEpBtn').style.display=hasNext?'':'none';
  buildEpisodeDropdown(show, season, epIdx);
  buildSeriesDropdown(show);
}

function hideSeriesPlayerBar(){
  _playerShow=null;_playerSeason=null;_playerEpIdx=null;
  document.getElementById('seriesPlayerBar').classList.remove('show');
}

function buildEpisodeDropdown(show, activeSeason, activeEpIdx){
  const seasons=Object.keys(show.seasons).map(Number).sort((a,b)=>a-b);
  let html='';
  seasons.forEach(s=>{
    const eps=show.seasons[s]||[];
    html+=`<div class="spd-series-season-header">Season ${s}</div>`;
    eps.forEach((ep,i)=>{
      const isActive=s===activeSeason&&i===activeEpIdx;
      const epNum=String(i+1).padStart(2,'0');
      const title=ep.epTitle||`Episode ${i+1}`;
      html+=`<div class="spd-series-item${isActive?' active':''}" onclick="switchToEpisode(${s},${i});closeAllSeriesDropdowns()">
        <span class="spd-series-ep-num">E${epNum}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</span>
        <span class="check">✓</span>
      </div>`;
    });
  });
  document.getElementById('seriesEpDD').innerHTML=html;
}

function buildSeriesDropdown(activeShow){
  let html='<div class="pd-header" style="padding:12px 16px 8px;font-size:.6rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#444;border-bottom:1px solid rgba(255,255,255,.06)">Switch Series</div>';
  series.forEach(s=>{
    const isActive=s.name===activeShow.name;
    html+=`<div class="spd-series-item${isActive?' active':''}" onclick="switchToSeries('${esc(s.name).replace(/'/g,"\\'")}');closeAllSeriesDropdowns()">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
      <span class="check">✓</span>
    </div>`;
  });
  document.getElementById('seriesShowDD').innerHTML=html;
}

function openSeriesDropdown(id, btn){
  closeAllSeriesDropdowns();
  const dd=document.getElementById(id);
  if(!dd)return;
  showUI();
  const rect=btn.getBoundingClientRect();
  const spaceBelow=window.innerHeight-rect.bottom;
  const ddH=Math.min(window.innerHeight*0.6,320);
  if(spaceBelow<ddH+8){
    dd.style.bottom=(window.innerHeight-rect.top+6)+'px';
    dd.style.top='auto';
  }else{
    dd.style.top=(rect.bottom+6)+'px';
    dd.style.bottom='auto';
  }
  dd.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-240))+'px';
  dd.classList.add('open');
  scheduleHideUI();
  setTimeout(()=>document.addEventListener('click',_seriesDDOutside,{once:true}),10);
}

function _seriesDDOutside(e){
  if(!e.target.closest('.spd-series')&&!e.target.closest('.series-ctrl-btn')){
    closeAllSeriesDropdowns();
  }
}

function closeAllSeriesDropdowns(){
  const hadOpen=!!document.querySelector('.spd-series.open');
  document.querySelectorAll('.spd-series.open').forEach(d=>d.classList.remove('open'));
  if(hadOpen)scheduleHideUI();
}

function playNextEpisode(){
  if(!_playerShow||_playerSeason===null||_playerEpIdx===null)return;
  const seasons=Object.keys(_playerShow.seasons).map(Number).sort((a,b)=>a-b);
  const eps=_playerShow.seasons[_playerSeason]||[];
  if(_playerEpIdx+1 < eps.length){
    switchToEpisode(_playerSeason, _playerEpIdx+1);
  }else{
    const sIdx=seasons.indexOf(_playerSeason);
    if(sIdx+1<seasons.length){
      const nextSeason=seasons[sIdx+1];
      switchToEpisode(nextSeason, 0);
    }
  }
}

function switchToEpisode(season, epIdx){
  console.log('[Playback] play button clicked');
  if(!_playerShow)return;
  const eps=_playerShow.seasons[season]||[];
  const ep=eps[epIdx];
  if(!ep)return;
  const show=_playerShow;
  const sNum=String(season).padStart(2,'0');
  const eNum=String(epIdx+1).padStart(2,'0');
  const lbl=`${show.name} S${sNum}E${eNum}${ep.epTitle?' – '+ep.epTitle:''}`;
  currentSeason=Number(season);
  svMediaModalSelectedEpisode=Number(epIdx);
  if(svPlayerReturnState?.source === 'media-modal'){
    svRememberPlaybackReturnState('media',{season:currentSeason,epIdx:svMediaModalSelectedEpisode});
    svPushPlayerHistory();
  }
  const playbackContext=svPlaybackContextForEpisode(show,season,epIdx,ep);
  if(ep.streamUrl){
    playFtpMedia(ep.streamUrl,lbl,'',playbackContext);
  }else{
    playMedia(ep.streamId,lbl,'',playbackContext);
  }
  setTimeout(()=>showSeriesPlayerBar(show,season,epIdx),100);
}

function switchToSeries(showName){
  console.log('[Playback] play button clicked');
  const show=series.find(s=>s.name===showName||esc(s.name)===showName);
  if(!show)return;
  const seasons=Object.keys(show.seasons).map(Number).sort((a,b)=>a-b);
  const firstSeason=seasons[0];
  const firstEp=(show.seasons[firstSeason]||[])[0];
  if(!firstEp)return;
  const sNum=String(firstSeason).padStart(2,'0');
  const lbl=`${show.name} S${sNum}E01${firstEp.epTitle?' – '+firstEp.epTitle:''}`;
  const playbackContext=svPlaybackContextForEpisode(show,firstSeason,0,firstEp);
  if(firstEp.streamUrl){
    playFtpMedia(firstEp.streamUrl,lbl,'',playbackContext);
  }else{
    playMedia(firstEp.streamId,lbl,'',playbackContext);
  }
  setTimeout(()=>showSeriesPlayerBar(show,firstSeason,0),100);
}

const vid=document.getElementById('videoPlayer');
const repairDisplayText=value=>window.StreamVaultPlayerUi?.repairDisplayText?.(value) ?? String(value == null ? '' : value);
const displayText=value=>repairDisplayText(value);
let playerPlaybackUiController=null;
function ensureCentralPlaybackController(){
  if(playerPlaybackUiController)return playerPlaybackUiController;
  playerPlaybackUiController=window.StreamVaultPlayerUi?.createCentralPlaybackController?.({
    video:vid,
    button:document.getElementById('ppCenterBtn'),
    transportIcon:document.getElementById('ppIcon'),
    showUi:()=>{if(typeof showUI === 'function')showUI();}
  }) || null;
  return playerPlaybackUiController;
}
function renderCentralPlaybackState(){
  if(window.playerSession?.active) { return window.StreamVaultPlayerView.render(window.playerSession.snapshot()); }
return ensureCentralPlaybackController()?.render?.();}
function setCentralPlaybackLoading(loading=true){
  if(window.playerSession?.active) { return; }

  const controller=ensureCentralPlaybackController();
  return loading ? controller?.beginLoading?.() : controller?.clearLoading?.();
}
function setCentralPlaybackError(error=true){
  if(window.playerSession?.active) { return; }

  const controller=ensureCentralPlaybackController();
  return error ? controller?.fail?.() : controller?.reset?.();
}
ensureCentralPlaybackController()?.bind?.();
svEnsureMediaAudioWatchdog();
// Metadata is enough to discover duration and keeps desktop starts lightweight.
// The browser will request only the byte ranges it needs instead of preloading a
// whole movie while the player is opening.
vid.preload = 'metadata';
const subtitleOverlay=document.getElementById('subtitleOverlay');

function plainCueText(cue){
  const raw = String(cue?.text || '').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return raw.replace(/\n{3,}/g, '\n\n');
}

function selectedTextTrack(){
  if(currentSubIdx < 0)return null;
  const selected = availableSubs[currentSubIdx];
  if(selected?.nativeTrack)return selected.nativeTrack;
  return Array.from(vid.querySelectorAll('track')).find(el=>parseInt(el.getAttribute('data-idx'),10)===currentSubIdx)?.track || null;
}

function updateSubtitleOverlay(){
  if(window.playerSession && !isLiveMode) return;

  if(!subtitleOverlay)return;
  const textTrack = selectedTextTrack();
  const cues = textTrack?.activeCues ? Array.from(textTrack.activeCues) : [];
  const text = cues.map(plainCueText).filter(Boolean).join('\n');
  subtitleOverlay.innerHTML = text ? `<span>${esc(text)}</span>` : '';
  subtitleOverlay.classList.toggle('show', !!text);
}

function scheduleSubtitleOverlayUpdate(){
  if(window.playerSession && !isLiveMode) return;

  if(subtitleOverlayRaf)return;
  subtitleOverlayRaf=requestAnimationFrame(()=>{
    subtitleOverlayRaf=0;
    updateSubtitleOverlay();
  });
}

function bindSubtitleTrack(trackEl){
  if(!trackEl || trackEl._svBound)return;
  trackEl._svBound = true;
  trackEl.addEventListener('load', scheduleSubtitleOverlayUpdate);
  trackEl.addEventListener('error', ()=>{
    const idx = parseInt(trackEl.getAttribute('data-idx'),10);
    setTrackMode(trackEl,false);
    if(currentSubIdx === idx){
      currentSubIdx = -1;
      updateSubtitleOverlay();
      renderSubtitleTracks();
      updateSubBtn();
    }
    showToast('Subtitle track could not be loaded for this file');
  }, {once:true});
  if(trackEl.track)trackEl.track.addEventListener('cuechange', scheduleSubtitleOverlayUpdate);
}

function setTrackMode(trackLike, selected){
  const textTrack = trackLike?.track || (trackLike && 'mode' in trackLike ? trackLike : null);
  if(!textTrack)return;
  textTrack.mode = selected ? 'hidden' : 'disabled';
}

function clearSubtitleOverlay(){
  currentSubIdx = -1;
  if(!isMobilePlaybackClient()){
    try{for(let i=0;i<vid.textTracks.length;i++)vid.textTracks[i].mode='disabled';}catch(_){}
  }
  if(subtitleOverlay){
    subtitleOverlay.innerHTML = '';
    subtitleOverlay.classList.remove('show');
  }
}

function trackListItems(list){
  const items=[];
  if(!list)return items;
  for(let i=0;i<list.length;i++)items.push(list[i]);
  return items;
}

function subtitleTrackLabel(track, index){
  const language = String(track?.language || track?.srclang || track?.lang || '').toLowerCase();
  const title = String(track?.label || track?.title || '').trim();
  const text = `${language} ${title}`.toLowerCase();
  if(/\b(m-?subs?|multi[ ._-]*subs?|multi[ ._-]*subtitles?)\b/.test(text))return 'Multi Subtitles';
  if(/\b(e-?sub)\b/.test(text))return 'English';
  if(language === 'en' || language.startsWith('en-')){
    return title && !/^(en|eng|english|subtitle \d+|track \d+)$/i.test(title) ? `English - ${title}` : 'English';
  }
  if(title)return title;
  const langName = mediaLanguageLabel(language);
  if(langName)return langName;
  return `Subtitle ${index + 1}`;
}

function subtitleOptionKey(track){
  if(track?.src)return `src:${String(track.src).toLowerCase()}`;
  if(Number.isFinite(track?.sourceIndex ?? track?.streamIndex))return `stream:${track.sourceIndex ?? track.streamIndex}`;
  if(track?.nativeTrack)return `native:${track.label || track.language || ''}`;
  if(track?.hls)return `hls:${track.hlsIndex}`;
  return `label:${subtitleTrackLabel(track, 0).toLowerCase()}`;
}

function dedupeSubtitleOptions(items){
  const seen = new Set();
  return (items || []).filter(item=>{
    const key = subtitleOptionKey(item);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function desktopNativeSubtitleTracks(){
  if(isMobilePlaybackClient())return [];
  const elementTracks = new Set(Array.from(vid.querySelectorAll('track')).map(el=>el.track).filter(Boolean));
  const native = trackListItems(vid.textTracks)
    .filter(track=>!elementTracks.has(track))
    .map((track,index)=>{
      if(!track._svCueBound){
        track._svCueBound=true;
        track.addEventListener?.('cuechange',updateSubtitleOverlay);
      }
      return {
        nativeTrack:track,
        native:true,
        language:track.language || '',
        lang:track.language || '',
        label:subtitleTrackLabel(track,index),
      };
    });
  if(native.length || !hlsInstance || !Array.isArray(hlsInstance.subtitleTracks))return native;
  return hlsInstance.subtitleTracks.map((track,index)=>({
    hlsIndex:index,
    hls:true,
    language:track.lang || '',
    lang:track.lang || '',
    label:subtitleTrackLabel({label:track.name,language:track.lang},index),
  }));
}

function renderSubtitleTracks(){
  const list=document.getElementById('subList');
  if(!list)return;
  if(!availableSubs.length){
    list.innerHTML=`<div class="pd-item" style="color:#444;pointer-events:none">No subtitles found</div>`;
    currentSubIdx=-1;
    updateSubBtn();
    refreshPlayerControlVisibility();
    return;
  }
  list.innerHTML=`<div class="pd-item${currentSubIdx===-1?' active':''}" onclick="setSub(-1)"><span>Off</span><span class="check">✓</span></div>`+
    availableSubs.map((track,index)=>`<div class="pd-item${currentSubIdx===index?' active':''}" onclick="setSub(${index})"><span>${esc(subtitleTrackLabel(track,index))}</span><span class="check">✓</span></div>`).join('');
  updateSubBtn();
  refreshPlayerControlVisibility();
}

function refreshDesktopNativeSubtitleTracks(preserveExternal=false){
  if(window.playerSession && !isLiveMode) return;

  if(isMobilePlaybackClient())return;
  const external = preserveExternal ? availableSubs.filter(track=>!track.native && !track.hls) : [];
  availableSubs=[...external,...desktopNativeSubtitleTracks()].map((track,index)=>({...track,index,label:subtitleTrackLabel(track,index)}));
  if(currentSubIdx >= availableSubs.length)currentSubIdx=-1;
  renderSubtitleTracks();
}

function desktopNativeAudioTracks(){
  if(isMobilePlaybackClient())return [];
  if(hlsInstance && Array.isArray(hlsInstance.audioTracks) && hlsInstance.audioTracks.length){
    return hlsInstance.audioTracks.map((track,index)=>({
      index,
      hlsIndex:index,
      hls:true,
      language:track.lang || '',
      title:audioTrackTitle({language:track.lang,title:track.name},index),
    }));
  }
  return trackListItems(vid.audioTracks).map((track,index)=>({
    index,
    nativeTrack:track,
    native:true,
    language:track.language || '',
    title:audioTrackTitle({language:track.language,title:track.label},index),
  }));
}

function refreshDesktopNativeAudioTracks(){
  if(window.playerSession && !isLiveMode) return;

  if(isMobilePlaybackClient())return;
  const nativeTracks=desktopNativeAudioTracks();
  if(nativeTracks.length > 1 || (nativeTracks.length && availableAudio.length <= 1)){
    const discovered=availableAudio.slice();
    availableAudio=nativeTracks.map((track,index)=>{
      const meta=discovered[index] || {};
      return {
        ...meta,
        ...track,
        index,
        language:meta.language || track.language,
        title:meta.title || track.title || audioTrackTitle(track,index)
      };
    });
  }
  renderAudioTracks();
  const nativeList=vid.audioTracks;
  if(nativeList?.addEventListener && vid._svAudioTrackList!==nativeList){
    vid._svAudioTrackList=nativeList;
    nativeList.addEventListener('addtrack',refreshDesktopNativeAudioTracks);
    nativeList.addEventListener('removetrack',refreshDesktopNativeAudioTracks);
    nativeList.addEventListener('change',refreshDesktopNativeAudioTracks);
  }
  if(nativeTracks.length && svActivePlaybackType === 'media'){
    queueMicrotask(()=>svApplyActiveAudioAuthority(hlsInstance,vid,'refreshDesktopNativeAudioTracks',{
      reason:'native/HLS audio tracks discovered or changed',
    }));
  }
}

function applyPreferredNativeAudioIfSafe(context='native audio'){
  if(isMobilePlaybackClient())return false;
  refreshDesktopNativeAudioTracks();
  return svApplyActiveAudioAuthority(hlsInstance,vid,'applyPreferredNativeAudioIfSafe',{reason:context});
}

function validDurationSeconds(value){
  return Number.isFinite(value) && value > 1;
}

function setPlayerDuration(seconds, source='browser'){
  if(window.playerSession?.active) { return window.playerSession.globalDuration; }

  const duration = Number(seconds);
  if(!validDurationSeconds(duration))return 0;
  if(source==='api')vid._apiDuration = duration;
  vid._stableDuration = duration;
  if(!isLiveMode)setDurationTimer(null,fmtTime(duration));
  return duration;
}

function mediaInfoNeedsSourceSeek(info){
  const codec = String(info?.videoCodec || '').toLowerCase();
  const container = String(info?.container || '').toLowerCase();
  const badCodecs = ['hevc','h265','vp9','vp8','av1','vc1'];
  const badContainers = ['matroska','webm','avi','flv','mpegts'];
  return badCodecs.some(c=>codec.includes(c)) || badContainers.some(c=>container.includes(c));
}

function mediaInfoHasUnsupportedVideo(info){
  const codec = String(info?.videoCodec || '').toLowerCase();
  return ['hevc','h265','vp9','vp8','av1','vc1'].some(c=>codec.includes(c));
}

function browserCanPlayVideoCodec(info){
  const codec=String(info?.videoCodec || '').toLowerCase();
  if(codec.includes('hevc') || codec.includes('h265')){
    return !!(vid.canPlayType('video/mp4; codecs="hvc1"') || vid.canPlayType('video/mp4; codecs="hev1"'));
  }
  if(codec.includes('vp9')){
    return !!(vid.canPlayType('video/webm; codecs="vp9"') || vid.canPlayType('video/mp4; codecs="vp09.00.10.08"'));
  }
  if(codec.includes('vp8'))return !!vid.canPlayType('video/webm; codecs="vp8"');
  if(codec.includes('av1'))return !!vid.canPlayType('video/mp4; codecs="av01.0.05M.08"');
  if(codec.includes('vc1'))return false;
  return true;
}

function mediaNeedsBrowserVideoTranscode(info, sourceUrl=''){
  let codec=String(info?.videoCodec || '').toLowerCase();
  if(!codec){
    const source=(()=>{try{return decodeURIComponent(String(sourceUrl || ''));}catch{return String(sourceUrl || '');}})().toLowerCase();
    if(/\b(?:x265|h265|hevc)\b/.test(source))codec='hevc';
    else if(/\bvp9\b/.test(source))codec='vp9';
    else if(/\bvp8\b/.test(source))codec='vp8';
    else if(/\bav1\b/.test(source))codec='av1';
    else if(/\bvc-?1\b/.test(source))codec='vc1';
  }
  const codecInfo=codec ? {...(info || {}), videoCodec:codec} : info;
  return mediaInfoHasUnsupportedVideo(codecInfo) && !browserCanPlayVideoCodec(codecInfo);
}

function mediaInfoHasRemuxContainer(info){
  const container = String(info?.container || '').toLowerCase();
  return ['matroska','webm','avi','flv','mpegts'].some(c=>container.includes(c));
}

function startupPlaybackOptions(info, sourceUrl=''){
  const selected=selectedAudioTrack();
  const explicitAudio=currentAudioIdx > 0 && Number.isFinite(selected?.streamIndex ?? selected?.sourceIndex);
  const multiAudio=availableAudio.length > 1;
  const source=String(sourceUrl || '').toLowerCase();
  const hintedUnsupported=/(x265|h265|hevc|10bit|10-bit|av1|vp9|vp8)/i.test(source);
  const hintedRemux=/\.(mkv|webm|avi|flv|ts|m2ts)(?:$|[?#])/i.test(source) || /(matroska|webm)/i.test(source);
  const hintedMultiAudio=/\[(?:dual|multi)[^\]]*audio\]|\b(?:dual|multi)[ ._-]*audio\b/i.test(source);
  if(mediaInfoHasUnsupportedVideo(info) || hintedUnsupported)return {forceHls:true};
  if(mediaInfoHasRemuxContainer(info) || hintedRemux || multiAudio || explicitAudio || hintedMultiAudio)return {forceAudio:true};
  return {};
}

function playerDuration(){
  if(window.playerSession?.active) { return window.playerSession.globalDuration; }

  if(_ftpStreamUrl&&_ftpNeedsTranscode)return validDurationSeconds(_ftpDuration) ? _ftpDuration : 0;
  if(validDurationSeconds(vid._apiDuration))return vid._apiDuration;
  if(validDurationSeconds(vid._stableDuration))return vid._stableDuration;
  if(vid._sourceSeekRequired)return 0;
  if(!vid._durationPending&&validDurationSeconds(vid.duration))return vid.duration;
  return 0;
}

function playbackTime(){
  if(window.playerSession?.active) { return window.playerSession.globalCurrentTime; }

  const base = Number(vid._sourceOffset || 0);
  const local = Number.isFinite(vid.currentTime) ? vid.currentTime : 0;
  return Math.max(0, base + local);
}

function activePointerPoint(e){
  const point = e.touches?.[0] || e.changedTouches?.[0] || e;
  return {x: point.clientX, y: point.clientY};
}

function playerLocalPoint(e, el){
  const point = activePointerPoint(e);
  const wrap = document.getElementById('playerWrap');
  if(!wrap || getComputedStyle(wrap).transform === 'none' || typeof DOMMatrixReadOnly === 'undefined' || typeof DOMPoint === 'undefined'){
    const r = el.getBoundingClientRect();
    return {x: point.x - r.left, y: point.y - r.top, width: r.width, height: r.height};
  }
  const rect = wrap.getBoundingClientRect();
  const matrix = new DOMMatrixReadOnly(getComputedStyle(wrap).transform);
  const origin = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  const local = new DOMPoint(point.x - origin.x, point.y - origin.y).matrixTransform(matrix.inverse());
  const wrapWidth = wrap.offsetWidth || rect.width;
  const wrapHeight = wrap.offsetHeight || rect.height;
  const elRect = el.getBoundingClientRect();
  const elCenter = {x: elRect.left + elRect.width / 2, y: elRect.top + elRect.height / 2};
  const elLocal = new DOMPoint(elCenter.x - origin.x, elCenter.y - origin.y).matrixTransform(matrix.inverse());
  return {
    x: local.x + wrapWidth / 2 - (elLocal.x + wrapWidth / 2 - el.offsetWidth / 2),
    y: local.y + wrapHeight / 2 - (elLocal.y + wrapHeight / 2 - el.offsetHeight / 2),
    width: el.offsetWidth || elRect.width,
    height: el.offsetHeight || elRect.height,
  };
}

function progressRatioFromEvent(e, el){
  return window.SeekGeometry.ratioFromEvent(el,e);
}

function playerMenusOpen(){
  return !!document.querySelector('.player-dropdown.open,.spd-series.open');
}

function playerControlsFocused(){
  const active=document.activeElement;
  if(!active || active===document.body)return false;
  return !!active.closest?.('#playerUI,.player-dropdown,.spd-series');
}

function playerEls(){
  if(playerDomCache?.wrap?.isConnected)return playerDomCache;
  playerDomCache={
    modal:document.getElementById('playerModal'),
    wrap:document.getElementById('playerWrap'),
    ui:document.getElementById('playerUI'),
    progressWrap:document.getElementById('progressWrap'),
    progressPlayed:document.getElementById('progressPlayed'),
    progressBuffered:document.getElementById('progressBuffered'),
    progressThumb:document.getElementById('progressThumb'),
    progressTooltip:document.getElementById('progressTooltip'),
    progressPreview:document.getElementById('progressPreview'),
    progressPreviewTime:document.getElementById('progressPreviewTime'),
    timeNow:document.getElementById('timeNow'),
    timeSep:document.getElementById('timeSep'),
    timeDur:document.getElementById('timeDur'),
    liveBadge:document.getElementById('playerLiveBadge')
  };
  return playerDomCache;
}

function setTextIfChanged(el,text){
  if(el && el.textContent !== text)el.textContent=text;
}

function setStyleIfChanged(el,prop,value){
  if(el && el.style[prop] !== value)el.style[prop]=value;
}

function savePlayerProgress(current,duration){
  if(!currentStreamId || _ftpStreamUrl || duration <= 0 || isNaN(current))return;
  if(vid._lstSv && Date.now()-vid._lstSv <= 5000)return;
  vid._lstSv=Date.now();
  const progress=current/duration;
  if(progress>0.02 && progress<0.95){
    watchProgress[currentStreamId]={progress,updatedAt:Date.now()};
    try{localStorage.setItem('sv_progress',JSON.stringify(watchProgress));}catch(_){}
  }
}

function renderPlayerProgress(current,duration,save=false){
  if(isLiveMode)return;
  const d=Number(duration);
  if(!validDurationSeconds(d))return;
  const now=Math.max(0,Number(current) || 0);
  const pct=Math.min(1,Math.max(0,now/d));
  const pctText=(pct*100).toFixed(3)+'%';
  const els=playerEls();
  setStyleIfChanged(els.progressPlayed,'width',pctText);
  setStyleIfChanged(els.progressThumb,'left',pctText);
  setTextIfChanged(els.timeNow,fmtTime(now));
  if(save)savePlayerProgress(now,d);
}

function flushPlayerProgress(){
  playerProgressRaf=0;
  const pending=playerProgressPending;
  playerProgressPending=null;
  if(!pending)return;
  renderPlayerProgress(pending.current,pending.duration,pending.save);
}

function schedulePlayerProgressRender(current=playbackTime(),duration=playerDuration(),options={}){
  if(window.playerSession && !isLiveMode) return;

  if(isLiveMode || (progressDragging && !options.force))return;
  const save=!!options.save || !!playerProgressPending?.save;
  playerProgressPending={current,duration,save};
  if(!playerProgressRaf)playerProgressRaf=requestAnimationFrame(flushPlayerProgress);
}

function flushPlayerBuffered(){
  playerBufferedRaf=0;
  const pending=playerBufferedPending;
  playerBufferedPending=null;
  if(!pending || isLiveMode)return;
  const d=Number(pending.duration);
  if(!validDurationSeconds(d))return;
  setStyleIfChanged(playerEls().progressBuffered,'width',(Math.min(((vid._sourceOffset||0)+pending.maxBuffered)/d,1)*100).toFixed(3)+'%');
}

function schedulePlayerBufferedRender(){
  if(window.playerSession && !isLiveMode) return;

  if(isLiveMode)return;
  const d=playerDuration();
  if(!validDurationSeconds(d))return;
  let maxBuffered=0;
  try{
    for(let i=0;i<vid.buffered.length;i++)maxBuffered=Math.max(maxBuffered,vid.buffered.end(i));
  }catch(_){return;}
  playerBufferedPending={duration:d,maxBuffered};
  if(!playerBufferedRaf)playerBufferedRaf=requestAnimationFrame(flushPlayerBuffered);
}

function startPlayerUiClock(){
  if(window.playerSession && !isLiveMode) return;

  if(playerUiClock || isLiveMode)return;
  playerUiClock=setInterval(()=>{
    if(vid.paused || progressDragging || isLiveMode)return;
    const now=Date.now();
    if(ftpHeavyStartupActive() && now-playerUiHeavyRenderAt < 450)return;
    playerUiHeavyRenderAt=now;
    schedulePlayerProgressRender(playbackTime(),playerDuration());
  },250);
}

function stopPlayerUiClock(){
  if(!playerUiClock)return;
  clearInterval(playerUiClock);
  playerUiClock=null;
  playerUiHeavyRenderAt=0;
}

function notePlayerPointerActivity(wrap=document.getElementById('playerWrap')){
  if(!wrap)return;
  playerHovering=true;
  if(playerPointerRaf)return;
  playerPointerRaf=requestAnimationFrame(()=>{
    playerPointerRaf=0;
    if(!wrap.isConnected)return;
    wrap.classList.add('show-cursor');
    showUI();
  });
}

function setTimeSeparatorVisible(visible){
  const sep=playerEls().timeSep;
  if(sep){
    sep.textContent=visible?' / ':'';
    sep.style.display=visible?'':'none';
  }
}

function setDurationTimer(currentText=null,durationText=null){
  const els=playerEls();
  const nowEl=els.timeNow;
  const durEl=els.timeDur;
  setTimeSeparatorVisible(true);
  if(currentText!==null)setTextIfChanged(nowEl,currentText);
  if(durationText!==null)setTextIfChanged(durEl,durationText);
}

function setLiveTimer(){
  const els=playerEls();
  setTextIfChanged(els.timeNow,'');
  setTextIfChanged(els.timeDur,'LIVE');
  setTimeSeparatorVisible(false);
}

function liveCaptionOptionsAvailable(){
  if(!isLiveMode)return false;
  if(availableSubs.length > 0)return true;
  try{
    return trackListItems(vid.textTracks).some(track=>track && track.kind !== 'metadata');
  }catch(_){
    return false;
  }
}

function svLiveAbrActive(channelId=''){
  return isLiveMode
    && svActivePlaybackType === 'live'
    && svLivePlayerState.playbackType === 'live'
    && (!channelId || svLivePlayerState.currentChannelId === String(channelId || ''));
}

function svLiveCurrentLevel(hls){
  const candidates=[hls?.currentLevel,hls?.nextLevel,hls?.loadLevel,hls?.nextAutoLevel];
  for(const value of candidates){
    const level=Number(value);
    if(Number.isFinite(level) && level >= 0)return Math.floor(level);
  }
  return Array.isArray(hls?.levels) && hls.levels.length ? hls.levels.length - 1 : 0;
}

function svLiveBufferedAhead(video=vid){
  try{
    const buffered=video.buffered;
    const current=Number(video.currentTime) || 0;
    for(let i=0;i<buffered.length;i++){
      if(buffered.start(i) <= current && buffered.end(i) >= current)return Math.max(0,buffered.end(i)-current);
    }
    return buffered.length ? Math.max(0,buffered.end(buffered.length-1)-current) : 0;
  }catch(_){
    return 0;
  }
}

function svLiveAbrTick(){
  const hls=hlsInstance;
  if(!hls || !svLiveAbrActive() || !Array.isArray(hls.levels) || hls.levels.length < 2)return;
  const now=Date.now();
  if(now < abrFreezeUntil)return;
  if(now - liveLastSwitchTime < ABR_SWITCH_INTERVAL)return;
  const current=svLiveCurrentLevel(hls);
  const buffered=svLiveBufferedAhead(vid);
  if(buffered < 2)return;
  if(liveCongestionScore >= 3){
    if(current <= MIN_LEVEL)return;
    if(lastSwitchDirection !== -1){
      hls.nextLevel=Math.max(MIN_LEVEL,current - 1);
      lastSwitchDirection=-1;
      liveLastSwitchTime=now;
      mediaFixLog('live ABR downgrade',{current,nextLevel:hls.nextLevel,buffered});
    }
    return;
  }
  if(liveCongestionScore === 0){
    if(current >= hls.levels.length - 1)return;
    if(lastSwitchDirection !== 1){
      hls.nextLevel=Math.min(hls.levels.length - 1,current + 1);
      lastSwitchDirection=1;
      liveLastSwitchTime=now;
      mediaFixLog('live ABR upgrade',{current,nextLevel:hls.nextLevel,buffered});
    }
  }
}

function svFreezeLiveAbrRecovery(reason='live recovery'){
  abrFreezeUntil=Date.now() + 5000;
  liveCongestionScore=0;
  lastSwitchDirection=0;
  liveLastSwitchTime=Date.now();
  mediaFixLog('live ABR recovery freeze',{reason,until:abrFreezeUntil});
}

function svLiveStartLoad(hls, reason='live recovery', delay=0){
  if(!hls)return;
  const run=()=>{
    if(hls !== hlsInstance || !svLiveAbrActive())return;
    try{
      hls.startLoad();
      mediaFixLog('live HLS startLoad',{reason,buffered:svLiveBufferedAhead(vid)});
    }catch(_){}
  };
  if(delay > 0)setTimeout(run,delay);
  else run();
}

function svLiveIsBufferStalledError(data){
  const detail=String(data?.details || '');
  const stalled=typeof Hls !== 'undefined' && Hls.ErrorDetails ? Hls.ErrorDetails.BUFFER_STALLED_ERROR : '';
  return detail === 'bufferStalledError' || (stalled && detail === stalled);
}

function svLiveHandleStallRecovery(hls){
  svFreezeLiveAbrRecovery('buffer stalled');
  svLiveStartLoad(hls,'buffer stalled');
}

function svLiveFastRecoveryTick(channelId,hls){
  if(!hls || hls !== hlsInstance || !svLiveAbrActive(channelId))return;
  if(svLiveBufferedAhead(vid) < 3){
    svLiveStartLoad(hls,'low buffer fast recovery');
  }
}

function svLiveOnStablePlayback(){
  liveCongestionScore=Math.max(0,liveCongestionScore - 1);
  if(liveCongestionScore === 0 && Date.now() - liveLastSwitchTime >= ABR_SWITCH_INTERVAL){
    lastSwitchDirection=0;
  }
}

function svLiveResetAbrState(){
  liveCongestionScore=0;
  liveLastSwitchTime=0;
  lastSwitchDirection=0;
  abrFreezeUntil=0;
}

function svLiveHandleNetworkRecovery(hls){
  svFreezeLiveAbrRecovery('network error');
  svLiveStartLoad(hls,'network error',1000);
}

function svLiveHandleMediaRecovery(hls){
  svFreezeLiveAbrRecovery('media error');
  try{hls.recoverMediaError();}catch(_){}
}

function svLiveHandleUnknownRecovery(hls){
  svFreezeLiveAbrRecovery('unknown error');
  try{hls.recoverMediaError();}catch(_){
    try{hls.startLoad();}catch(__){}
  }
}

function svAttachLiveAbr(channelId, hls){
  if(!hls)return ()=>{};
  window.__liveIssue={
    fragLatency:[],
    starvationCount:0,
    stalledCount:0,
    lastLevels:[]
  };
  svLiveResetAbrState();
  clearInterval(liveAbrTimer);
  liveAbrTimer=setInterval(svLiveAbrTick,3000);
  clearInterval(liveRecoveryTimer);
  liveRecoveryTimer=setInterval(()=>svLiveFastRecoveryTick(channelId,hls),3000);
  const addCongestion=value=>{
    if(!svLiveAbrActive(channelId))return;
    liveCongestionScore=Math.min(10,liveCongestionScore + value);
  };
  const onWaiting=()=>{
    addCongestion(2);
    if(!svLiveAbrActive(channelId))return;
    vid.style.backgroundColor='black';
    svPlayVideo('live waiting recovery', {force:true}).catch(()=>{});
  };
  const onStalled=()=>addCongestion(3);
  const onPlaying=()=>{
    if(!svLiveAbrActive(channelId))return;
    svLiveOnStablePlayback();
  };
  const liveBufferDiagnosticTimer=setInterval(()=>{
    if(!vid || !svLiveAbrActive(channelId))return;

    const buffered=vid.buffered.length
      ? vid.buffered.end(0) - vid.currentTime
      : 0;

    if(buffered <= 0.2){
      window.__liveIssue.starvationCount++;
      console.warn("[ROOT-CAUSE] BUFFER STARVATION EVENT");
      console.warn("[LIVE CRITICAL] Buffer starvation detected");
    }

    if(buffered <= 2){
      console.warn("[LIVE WARNING] Low buffer:", buffered);
    }
  },2000);
  const liveAbrDiagnosticTimer=setInterval(()=>{
    if(!hls || hls !== hlsInstance || !svLiveAbrActive(channelId))return;
    const buffer=vid.buffered.length
      ? vid.buffered.end(0) - vid.currentTime
      : 0;

    window.__liveIssue.lastLevels.push({
      level:hls.currentLevel,
      buffer
    });
    svLiveConsoleLog("[LIVE ABR]",
      "level:", hls.currentLevel,
      "buffer:", buffer
    );
  },5000);
  const liveRootCauseReportTimer=setInterval(()=>{
    if(!window.__liveIssue || !svLiveAbrActive(channelId))return;
    const avgLatency=
      window.__liveIssue.fragLatency.reduce((a,b)=>a + b,0) /
      (window.__liveIssue.fragLatency.length || 1);

    svLiveConsoleLog("========== LIVE ROOT CAUSE REPORT ==========");
    svLiveConsoleLog("Avg FRAG latency:", avgLatency);
    svLiveConsoleLog("Starvation events:", window.__liveIssue.starvationCount);
    svLiveConsoleLog("Stall events:", window.__liveIssue.stalledCount);
    svLiveConsoleLog("Last ABR state:", window.__liveIssue.lastLevels.slice(-5));
    svLiveConsoleLog("===========================================");
  },30000);
  const onDiagnosticWaiting=()=>{
    console.warn("[LIVE] VIDEO WAITING (stall start)");
  };
  const onDiagnosticStalled=()=>{
    window.__liveIssue.stalledCount++;
    console.warn("[ROOT-CAUSE] VIDEO STALLED");
    console.warn("[LIVE] VIDEO STALLED (network/segment issue)");
  };
  const onDiagnosticPlaying=()=>{
    svLiveConsoleLog("[LIVE] Playback resumed");
  };
  vid.addEventListener('waiting',onWaiting);
  vid.addEventListener('stalled',onStalled);
  vid.addEventListener('playing',onPlaying);
  vid.addEventListener("waiting",onDiagnosticWaiting);
  vid.addEventListener("stalled",onDiagnosticStalled);
  vid.addEventListener("playing",onDiagnosticPlaying);
  return ()=>{
    clearInterval(liveAbrTimer);
    liveAbrTimer=null;
    clearInterval(liveRecoveryTimer);
    liveRecoveryTimer=null;
    clearInterval(liveBufferDiagnosticTimer);
    clearInterval(liveAbrDiagnosticTimer);
    clearInterval(liveRootCauseReportTimer);
    svLiveResetAbrState();
    vid.removeEventListener('waiting',onWaiting);
    vid.removeEventListener('stalled',onStalled);
    vid.removeEventListener('playing',onPlaying);
    vid.removeEventListener("waiting",onDiagnosticWaiting);
    vid.removeEventListener("stalled",onDiagnosticStalled);
    vid.removeEventListener("playing",onDiagnosticPlaying);
  };
}

function updateAudioBtn(){
  const btn=document.getElementById('audioBtn');
  if(!btn)return;
  const active=!isLiveMode && availableAudio.length > 1 && currentAudioIdx > 0;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-pressed',active?'true':'false');
}

function updateSpeedBtn(){
  const btn=document.getElementById('speedBtn');
  if(!btn)return;
  const active=!isLiveMode && Math.abs((Number(currentSpeed)||1)-1) > 0.001;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-pressed',active?'true':'false');
}

function refreshPlayerControlVisibility(){
  const wrap=document.getElementById('playerWrap');
  if(!wrap)return;
  wrap.classList.add('premium-player');
  wrap.classList.toggle('live-player',!!isLiveMode);
  wrap.classList.toggle('movie-player',!isLiveMode);
  wrap.classList.toggle('has-live-captions',liveCaptionOptionsAvailable());
  updateAudioBtn();
  updateSpeedBtn();
  if(isLiveMode){
    ['audioDD','speedDD'].forEach(id=>document.getElementById(id)?.classList.remove('open'));
    if(!liveCaptionOptionsAvailable())document.getElementById('subDD')?.classList.remove('open');
  }
}

function resetSeekPreview(){
  hideSeekPreview();
  seekPreviewMetrics=null;
}

function seekPreviewDuration(){
  const duration=Number(playerDuration());
  return validDurationSeconds(duration) ? duration : 0;
}

function updateSeekPreviewFromPointer(e,pw){
  if(!pw || isLiveMode || (e.pointerType && e.pointerType!=='mouse'))return;
  const rect=pw.getBoundingClientRect();
  const ratio=window.SeekGeometry.ratioFromEvent(pw,e);
  const controlsWereHidden=playerEls().ui?.classList.contains('hidden');
  showUI();
  const anchor={clientX:e.clientX,top:rect.top};
  if(controlsWereHidden)requestAnimationFrame(()=>updateSeekPreview(ratio,anchor));
  else updateSeekPreview(ratio,anchor);
}

function scheduleSeekPreviewFromPointer(e,pw){
  if(!pw || isLiveMode || (e.pointerType && e.pointerType!=='mouse'))return;
  seekPreviewMovePending={
    pw,
    clientX:e.clientX,
    clientY:e.clientY,
    pointerType:e.pointerType || 'mouse'
  };
  if(seekPreviewMoveRaf)return;
  seekPreviewMoveRaf=requestAnimationFrame(()=>{
    seekPreviewMoveRaf=0;
    const pending=seekPreviewMovePending;
    seekPreviewMovePending=null;
    if(!pending?.pw?.isConnected)return;
    updateSeekPreviewFromPointer(pending,pending.pw);
  });
}

function hideSeekPreviewFromLeave(e,pw){
  const rect=pw.getBoundingClientRect();
  if(
    e.clientX>=rect.left &&
    e.clientX<=rect.right &&
    e.clientY>=rect.top &&
    e.clientY<=rect.bottom
  )return;
  hideSeekPreview();
}

function bindSeekPreview(pw){
  if(!pw)return;
  let preview=pw.querySelector(':scope > #progressPreview');
  if(!preview){
    preview=document.createElement('div');
    preview.className='progress-preview';
    preview.id='progressPreview';
    preview.setAttribute('aria-hidden','true');
    const time=document.createElement('div');
    time.className='progress-preview-time';
    time.id='progressPreviewTime';
    time.textContent='0:00';
    preview.appendChild(time);
    pw.appendChild(preview);
    playerDomCache=null;
  }
  if(pw.dataset.seekPreviewBound==='1')return;
  pw.dataset.seekPreviewBound='1';
  pw.addEventListener('pointermove',e=>scheduleSeekPreviewFromPointer(e,pw),{passive:true});
  pw.addEventListener('mousemove',e=>scheduleSeekPreviewFromPointer(e,pw),{passive:true});
  pw.addEventListener('mouseenter',()=>{seekPreviewMetrics=null;});
  pw.addEventListener('mouseleave',e=>hideSeekPreviewFromLeave(e,pw));
}

function measureSeekPreviewMetrics(){
  const els=playerEls();
  const preview=els.progressPreview;
  if(!preview)return {previewWidth:74};
  return {
    previewWidth:preview.offsetWidth || 74
  };
}

function flushSeekPreview(){
  seekPreviewRaf=0;
  const pending=seekPreviewPending;
  seekPreviewPending=null;
  if(!pending)return;
  const els=playerEls();
  const preview=els.progressPreview;
  const timeEl=els.progressPreviewTime;
  const pw=els.progressWrap;
  const d=pending.duration;
  if(!preview || !timeEl || !pw || isLiveMode || !validDurationSeconds(d)){
    hideSeekPreview();
    return;
  }
  if(seekPreviewHideTimer){
    clearTimeout(seekPreviewHideTimer);
    seekPreviewHideTimer=null;
  }
  const clamped=Math.max(0,Math.min(1,pending.p));
  const target=clamped*d;
  setTextIfChanged(timeEl,fmtTime(target));
  preview.classList.add('show');
  preview.setAttribute('aria-hidden','false');
  seekPreviewVisible=true;
  if(!seekPreviewMetrics)seekPreviewMetrics=measureSeekPreviewMetrics();
  const previewWidth=seekPreviewMetrics.previewWidth;
  const rect=pw.getBoundingClientRect();
  const anchorX=Number.isFinite(pending.clientX) ? pending.clientX : rect.left+(clamped*rect.width);
  const anchorTop=Number.isFinite(pending.top) ? pending.top : rect.top;
  const left=Math.max(previewWidth/2+8,Math.min(window.innerWidth-previewWidth/2-8,anchorX));
  const top=Math.max(8,anchorTop-preview.offsetHeight-10);
  setStyleIfChanged(preview,'left',left.toFixed(1)+'px');
  setStyleIfChanged(preview,'top',top.toFixed(1)+'px');
}

function updateSeekPreview(p,anchor={}){
  const duration=seekPreviewDuration();
  if(!duration){
    hideSeekPreview();
    return;
  }
  seekPreviewPending={p,duration,clientX:anchor.clientX,top:anchor.top};
  if(!seekPreviewRaf)seekPreviewRaf=requestAnimationFrame(flushSeekPreview);
}

function hideSeekPreview(delay=0){
  const preview=playerEls().progressPreview;
  if(!preview)return;
  if(seekPreviewRaf){
    cancelAnimationFrame(seekPreviewRaf);
    seekPreviewRaf=0;
  }
  seekPreviewPending=null;
  seekPreviewMetrics=null;
  if(seekPreviewHideTimer){
    clearTimeout(seekPreviewHideTimer);
    seekPreviewHideTimer=null;
  }
  const hide=()=>{
    preview.classList.remove('show');
    preview.setAttribute('aria-hidden','true');
    seekPreviewVisible=false;
  };
  if(delay)seekPreviewHideTimer=setTimeout(hide,delay);
  else hide();
}

function isMobilePlaybackClient(){
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

const DESKTOP_UNSUPPORTED_MESSAGE = 'Playback could not start in this browser.';
const DESKTOP_FTP_AUDIO_MESSAGE = 'Audio switching uses optimized browser streaming.';

function hidePlayerNotice(){
  const el = document.getElementById('playerNotice');
  if(!el)return;
  el.classList.remove('show');
  el.innerHTML = '';
}

function showPlayerNotice(message, actions=[]){
  const el = document.getElementById('playerNotice');
  if(!el)return;
  el.innerHTML = '';
  el.classList.remove('show');
  setCentralPlaybackLoading(false);
  showToast(message === DESKTOP_UNSUPPORTED_MESSAGE ? 'Playback could not start in this browser.' : message);
}

function copyTextFallback(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try{ok = document.execCommand('copy');}catch(_){}
  ta.remove();
  return ok;
}

async function copyStreamLink(url){
  try{
    if(navigator.clipboard && window.isSecureContext)await navigator.clipboard.writeText(url);
    else if(!copyTextFallback(url))throw new Error('copy failed');
    showToast('Stream link copied');
  }catch(_){
    showToast('Could not copy stream link');
  }
}

function vlcPlaylistSrc(url, title=''){
  const params = new URLSearchParams();
  params.set('url', url);
  if(title)params.set('title', title);
  return API_BASE + '/api/vlc-playlist?' + params.toString();
}

function openInVlc(url, title=''){
  window.location.href = vlcPlaylistSrc(url, title);
}

async function showVlcPlaybackNotice(url, title=''){
  const streamUrl = String(url || '').trim();
  hidePlayerNotice();
  if(!streamUrl){
    showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE);
    return;
  }
  if(!svAssertNoLiveSourceForMedia(streamUrl, {fallbackReason:'browser stream fallback'}))return;
  
  if(vid._browserStreamFallbackActive)return;
  vid._browserStreamFallbackActive = true;
  setCentralPlaybackLoading(true);
  try{
    const start = playbackTime();
    _ftpStreamUrl = streamUrl;
    _ftpNeedsTranscode = true;
    vid._sourceSeekRequired = true;
    vid._mediaSourceSeekRequired = true;
    vid._sourceOffset = start;
    vid._vlcFallbackUrl = streamUrl;
    vid._vlcFallbackTitle = title || '';
    const attached = await attachPlayerSource(ftpTranscodeSrc(streamUrl, start, 'browser stream fallback'), 'stream', {playbackType:'media', fallbackReason:'browser stream fallback'});
    if(!attached)throw new Error('Browser stream unavailable');
    await svPlayVideo('browser stream fallback', {force:true});
    showToast('Playing with optimized browser stream');
  }catch(e){
    console.warn('[Playback] browser stream fallback failed:', e.message);
    showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE);
  }finally{
    vid._browserStreamFallbackActive = false;
    setCentralPlaybackLoading(false);
  }
}

function streamUrlFor(id, start=0){
  const params = new URLSearchParams();
  params.set('playbackType', 'media');
  if(isMobilePlaybackClient())params.set('mobile', '1');
  if(currentQuality && currentQuality !== 'auto')params.set('quality', currentQuality);
  if(start > 0)params.set('start', Math.floor(start));
  const query = params.toString();
  return `${API_BASE}/stream/${id}${query ? '?' + query : ''}`;
}

async function fetchLocalPlaybackPlan(id, start=0, options={}){
  const params = new URLSearchParams();
  params.set('playbackType','media');
  if(options.fallbackReason)params.set('fallbackReason', options.fallbackReason);
  if(isMobilePlaybackClient())params.set('mobile','1');
  if(currentQuality && currentQuality !== 'auto')params.set('quality', currentQuality);
  if(planOptionsNeedAudioMap(options))appendSelectedAudioParams(params,'fetchLocalPlaybackPlan');
  if(start > 0)params.set('start', Math.floor(start));
  if(options.forceHls)params.set('forceHls','1');
  if(options.forceRemux)params.set('mode','remux');
  if(options.forceAudio)params.set('mode','audio');
  if(options.mode)params.set('mode', options.mode);
  const query = params.toString();
  const r = await fetch(`${API_BASE}/api/playback/local/${encodeURIComponent(id)}${query ? '?' + query : ''}`, {
    signal:options.signal
  });
  if(!r.ok){
    let message = `playback ${r.status}`;
    try{
      const err = await r.json();
      if(err?.error)message = err.error;
    }catch(_){}
    const error = new Error(message);
    error.status = r.status;
    throw error;
  }
  const data = svNormalizeBackendUrls(await r.json());
  if(isMobilePlaybackClient() && data?.url){
    const hls=/\.m3u8(?:$|[?#])/i.test(String(data.url));
    return {ok:true,mode:hls?'hls':'direct',transport:hls?'hls':'direct',src:data.url,playUrl:data.url,finalPlayUrl:data.url,duration:0};
  }
  if(!data?.ok || !data.src)throw new Error(data?.error || 'No playback source returned');
  svCaptureServerAudioDecision(data);
  return data;
}

async function fetchFtpPlaybackPlan(streamUrl, start=0, options={}){
  const params = new URLSearchParams();
  params.set('url', streamUrl);
  params.set('plan','1');
  params.set('playbackType','media');
  if(options.fallbackReason)params.set('fallbackReason', options.fallbackReason);
  if(isMobilePlaybackClient())params.set('mobile','1');
  if(planOptionsNeedAudioMap(options))appendSelectedAudioParams(params,'fetchFtpPlaybackPlan');
  if(start > 0)params.set('start', Math.floor(start));
  if(options.forceHls)params.set('forceHls','1');
  if(options.forceProxy || options.forceStream)params.set('mode','proxy');
  if(options.forceRemux)params.set('mode','remux');
  if(options.forceAudio)params.set('mode','audio');
  if(options.mode)params.set('mode', options.mode);
  mediaFixLog('fetch FTP playback plan',{
    url:streamUrl,
    start,
    options,
    selectedAudio:audioDebugSummary(selectedAudioTrack(),currentAudioIdx)
  });
  const r = await fetch(API_BASE + '/api/playback/ftp?' + params.toString(), {
    signal:options.signal
  });
  if(!r.ok){
    let message = `playback ${r.status}`;
    try{
      const err = await r.json();
      if(err?.error)message = err.error;
    }catch(_){}
    const error = new Error(message);
    error.status = r.status;
    throw error;
  }
  const data = svNormalizeBackendUrls(await r.json());
  if(isMobilePlaybackClient() && data?.url){
    const hls=/\.m3u8(?:$|[?#])/i.test(String(data.url));
    return {ok:true,mode:hls?'hls':'direct',transport:hls?'hls':'direct',src:data.url,playUrl:data.url,finalPlayUrl:data.url,duration:0};
  }
  if(!data?.ok || !data.src)throw new Error(data?.error || 'No playback source returned');
  svCaptureServerAudioDecision(data);
  return data;
}

function planNeedsSourceSeek(plan){
  return plan?.mode === 'remux' || plan?.mode === 'audio' || plan?.mode === 'audio-transcode' || plan?.mode === 'hls' || plan?.mode === 'stream';
}

function playbackDebug(step, data={}){
  if(!SV_DEBUG_LOGS)return;
  try{console.log('[Playback Debug]', step, data);}catch(_){}
}

function videoErrorInfo(){
  const err = vid?.error;
  return err ? {code:err.code,message:err.message||''} : {code:0,message:''};
}

function handleInitialPlayRejection(error, onMediaFailure){
  // Safari can end transient user activation while an async source is being
  // resolved. That is a paused player, not a broken stream, so never start a
  // heavier fallback for an autoplay-policy rejection.
  if(error?.name === 'NotAllowedError'){
    setCentralPlaybackLoading(false);
    updatePlayIcons(true);
    showUI();
    return;
  }
  onMediaFailure?.(error);
}

function urlHasUnsupportedVideoHint(url){
  return /(x265|h265|hevc|10bit|10-bit|av1|vp9|vp8)/i.test(String(url || ''));
}

function sourceNeedsBrowserRemux(url){
  const value=String(url || '');
  return /\.(mkv|webm|avi|flv|ts|m2ts)(?:$|[?#])/i.test(value)
    || /(matroska|webm|x265|h265|hevc)/i.test(value);
}

function playbackOptionsForStep(step, fallbackReason=''){
  const options={fallbackReason:fallbackReason || step || 'media fallback'};
  if(step === 'proxy')options.forceProxy=true;
  if(step === 'remux')options.forceRemux=true;
  if(step === 'audio')options.forceAudio=true;
  if(step === 'hls')options.forceHls=true;
  return options;
}

function validPlaybackSourceUrl(src){
  const value = String(src || '').trim();
  if(!value)return false;
  try{
    const url = new URL(value, window.location.href);
    if(url.origin !== window.location.origin)return /^https?:$/i.test(url.protocol);
    return url.pathname.startsWith('/stream/')
      || url.pathname.startsWith('/api/playback/local/')
      || url.pathname === '/api/playback/ftp'
      || url.pathname === '/api/ftp/proxy'
      || url.pathname === '/api/ftp/stream'
      || url.pathname.startsWith('/api/heavy-compat-hls/')
      || url.pathname.startsWith('/api/mobile-hls/');
  }catch(_){
    return false;
  }
}

function validateFallbackPlaybackSource(src, step){
  return validateMediaPlaybackSource(src, step);
}

function ftpDirectPlayable(url, options={}){
  const clean = String(url || '').split('?')[0].toLowerCase();
  const compatibleExt = clean.endsWith('.mp4') || clean.endsWith('.m4v');
  const unsupportedCodecHint = /(x265|h265|hevc|10bit|10-bit)/i.test(clean);
  return compatibleExt && !unsupportedCodecHint;
}

function ftpProxySrc(url){
  const params=new URLSearchParams();
  params.set('url', url);
  params.set('playbackType', 'media');
  return API_BASE + '/api/ftp/proxy?' + params.toString();
}

function ftpPlaybackRouteSrc(url, mode='redirect', fallbackReason=''){
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('playbackType', 'media');
  if(fallbackReason)params.set('fallbackReason', fallbackReason);
  if(mode)params.set('mode', mode);
  return API_BASE + '/api/playback/ftp?' + params.toString();
}

function localFtpPlaybackPlan(url, options={}){
  const proxy = options.forceProxy || options.forceStream;
  const reason = options.fallbackReason || (proxy ? 'proxy' : 'redirect');
  const src = ftpPlaybackRouteSrc(url, proxy ? 'proxy' : 'redirect', reason);
  const proxyUrl = ftpPlaybackRouteSrc(url, 'proxy', 'proxy');
  return {
    ok: true,
    decodedUrl: url,
    directPlayable: ftpDirectPlayable(url),
    mode: proxy ? 'proxy' : 'direct',
    transport: proxy ? 'proxy' : 'redirect',
    src,
    playUrl: src,
    finalPlayUrl: src,
    redirectUrl: ftpPlaybackRouteSrc(url, 'redirect', 'redirect'),
    proxyUrl,
    fallbackProxyUrl: proxyUrl,
    legacyProxyUrl: ftpProxySrc(url),
    duration: 0,
  };
}

function ftpRawSrc(url){
  const params=new URLSearchParams();
  params.set('url', url);
  params.set('playbackType', 'media');
  return API_BASE + '/api/ftp/raw?' + params.toString();
}

function desktopFtpPlaybackSrc(url){
  const value = String(url || '');
  if(/^ftp:\/\//i.test(value))return ftpRawSrc(value);
  if(/^https?:\/\//i.test(value))return ftpProxySrc(value);
  return '';
}

function ftpTranscodeSrc(url, start=0, fallbackReason='', options={}){
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('playbackType', 'media');
  if(fallbackReason)params.set('fallbackReason', fallbackReason);
  if(options.smooth)params.set('smooth','1');
  if(start > 0)params.set('start', Math.floor(start));
  appendSelectedAudioParams(params,'ftpTranscodeSrc');
  return API_BASE + '/api/ftp/stream?' + params.toString();
}

function ftpStreamPlaybackPlan(url, start=0, fallbackReason='stream', options={}){
  const src=ftpTranscodeSrc(url,start,fallbackReason,options);
  return {
    ok:true,
    decodedUrl:url,
    directPlayable:false,
    mode:'stream',
    transport:'stream',
    smoothProfile:!!options.smooth,
    src,
    playUrl:src,
    finalPlayUrl:src,
    transcodeUrl:src,
    audioTranscodeUrl:src,
    duration:0
  };
}

function ftpHeavyCompatHlsSrc(url, start=0, fallbackReason='heavy 4K compatibility cache'){
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('playbackType', 'media');
  params.set('heavyCompat', '1');
  if(fallbackReason)params.set('fallbackReason', fallbackReason);
  if(start > 0)params.set('start', Math.floor(start));
  appendSelectedAudioParams(params,'ftpHeavyCompatHlsSrc');
  return API_BASE + '/api/heavy-compat-hls/ftp/index.m3u8?' + params.toString();
}

function ftpHeavyCompatHlsPlaybackPlan(url, start=0, fallbackReason='heavy 4K compatibility cache'){
  const src=ftpHeavyCompatHlsSrc(url,start,fallbackReason);
  return {
    ok:true,
    decodedUrl:url,
    directPlayable:false,
    mode:'hls',
    transport:'hls',
    heavyCompatHls:true,
    src,
    playUrl:src,
    finalPlayUrl:src,
    hlsUrl:src,
    transcodeUrl:src,
    audioTranscodeUrl:src,
    duration:_ftpDuration || 0
  };
}

function localTranscodeSrc(id, start=0, fallbackReason=''){
  const params = new URLSearchParams();
  params.set('playbackType', 'media');
  if(fallbackReason)params.set('fallbackReason', fallbackReason);
  params.set('mobile', '1');
  if(currentQuality && currentQuality !== 'auto')params.set('quality', currentQuality);
  appendSelectedAudioParams(params,'localTranscodeSrc');
  if(start > 0)params.set('start', Math.floor(start));
  return `${API_BASE}/stream/${encodeURIComponent(id)}?${params.toString()}`;
}

function localDirectPlayable(file){
  const clean = String(file || '').split('?')[0].toLowerCase();
  const ext = clean.split('.').pop();
  const compatibleExt = ['mp4','m4v','webm','ogv','ogg'].includes(ext);
  const unsupportedCodecHint = /(x265|h265|hevc|10bit|10-bit)/i.test(clean);
  return compatibleExt && !unsupportedCodecHint;
}

function localFileForStreamId(id, movie={}){
  if(movie?.file)return movie.file;
  for(const show of series || []){
    const seasons = show?.seasons || {};
    for(const eps of Object.values(seasons)){
      const match = (eps || []).find(ep => String(ep.streamId) === String(id));
      if(match?.file)return match.file;
    }
  }
  return '';
}

function ftpPlaybackSrc(start=0){
  if(!_ftpStreamUrl)return '';
  if(!isMobilePlaybackClient()){
    const directSrc = desktopFtpPlaybackSrc(_ftpStreamUrl);
    _ftpNeedsTranscode = false;
    return directSrc;
  }
  const needsTranscode = !ftpDirectPlayable(_ftpStreamUrl) || currentAudioIdx > 0;
  _ftpNeedsTranscode = needsTranscode;
  return needsTranscode ? ftpTranscodeSrc(_ftpStreamUrl, start, 'FTP playback source') : ftpProxySrc(_ftpStreamUrl);
}

function subtitleTextTrackCodecs(){
  return new Set(['subrip','srt','webvtt','ass','ssa','mov_text','text']);
}

function subtitleCanRenderAsVtt(track){
  const codec = String(track?.codec || '').toLowerCase();
  return !codec || subtitleTextTrackCodecs().has(codec);
}

function ftpSubtitleSrc(idx){
  const params = new URLSearchParams();
  const sub = availableSubs[idx] || {};
  if(sub.sidecar && sub.src)params.set('sidecar', sub.src);
  const streamIndex = sub.sourceIndex ?? sub.streamIndex;
  params.set('url', _ftpStreamUrl);
  params.set('playbackType', 'media');
  if(Number.isFinite(streamIndex))params.set('stream', streamIndex);
  return `${API_BASE}/api/ftp/subtitle/${idx}.vtt?${params.toString()}`;
}

function resolveFtpPlayUrl(streamUrl){
  const sourceUrl = String(streamUrl || '').trim();
  if(!sourceUrl)throw new Error('Missing source URL');
  const directPlayable = ftpDirectPlayable(sourceUrl);
  const proxyUrl = ftpProxySrc(sourceUrl);
  const transcodeUrl = ftpTranscodeSrc(sourceUrl, 0, 'resolve FTP play URL');
  const playUrl = directPlayable ? proxyUrl : transcodeUrl;
  return {
    ok: true,
    decodedUrl: sourceUrl,
    directPlayable,
    playUrl,
    finalPlayUrl: playUrl,
    proxyUrl,
    transcodeUrl,
  };
}

async function loadFtpTrackOptions(streamUrl){
  const requestedUrl=String(streamUrl || '').trim();
  const preserveServerLock=svMediaPlayerState.audioLocked;
  if(!preserveServerLock)availableAudio = [{index:0,title:'Default Audio'}];
  availableSubs = [];
  if(!preserveServerLock)svSetCurrentAudioIndex(0,'loadFtpTrackOptions','FTP metadata placeholder');
  clearSubtitleOverlay();
  renderAudioTracks();
  const subList = document.getElementById('subList');
  if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Loading subtitles...</div>`;
  updateSubBtn();
  mediaFixLog('load FTP metadata start', {url:requestedUrl});
  if(!svAssertNoLiveSourceForMedia(requestedUrl, {fallbackReason:'FTP metadata'}))return null;

  const controller = new AbortController();
  const parentSignal = playbackRequestController?.signal;
  const onParentAbort = ()=>controller.abort();
  if(parentSignal?.aborted)controller.abort();
  else parentSignal?.addEventListener?.('abort', onParentAbort, {once:true});
  const timeout = setTimeout(()=>controller.abort(), 45000);
  try{
    const params=new URLSearchParams();
    params.set('url', requestedUrl);
    params.set('playbackType', 'media');
    const r = await fetch(`${API_BASE}/api/ftp/media-info?${params.toString()}`, {
      signal: controller.signal,
      cache:'no-store',
      headers:{'Cache-Control':'no-cache'}
    });
    if(!r.ok)throw new Error(`metadata ${r.status}`);
    const data = svNormalizeBackendUrls(await r.json());
    if(data?.ftpAudioValidated === true)svCaptureServerAudioDecision(data);
    const audioTracks = Array.isArray(data.audioTracks) ? data.audioTracks : [];
    const subtitleTracks = Array.isArray(data.subtitleTracks) ? data.subtitleTracks : [];
    if(_currentFtpPlaybackPlan){
      _currentFtpPlaybackPlan.unsupportedVideoHint = _currentFtpPlaybackPlan.unsupportedVideoHint || mediaInfoNeedsSourceSeek(data);
      _currentFtpPlaybackPlan.unsupportedVideoCodec = _currentFtpPlaybackPlan.unsupportedVideoCodec || mediaInfoHasUnsupportedVideo(data);
    }

    if(audioTracks.length){
      const hints=filenameAudioHints(requestedUrl);
      const discovered = normalizeDiscoveredAudioTracks(audioTracks,hints);
      availableAudio = discovered.length ? discovered : [{index:0,title:'Default Audio'}];
      const serverIndex=data?.ftpAudioValidated === true
        ? Number(data.audioIndex ?? data.defaultAudioIndex)
        : NaN;
      const decision=svPreferredAudioDecision(availableAudio,'FTP metadata');
      const selectedIndex=decision.selectedIndex;
      if(Number.isInteger(selectedIndex) && selectedIndex >= 0 && availableAudio[selectedIndex]){
        svApplyActiveAudioAuthority(hlsInstance,vid,'loadFtpTrackOptions',{
          logicalIndex:selectedIndex,
          reason:'FTP decoded/title-language audio',
        });
        lockAudioToCurrent('FTP decoded server audio', {
          requiresMappedSource:audioTrackRelativeIndex(availableAudio[selectedIndex],selectedIndex) !== 0
        });
      }else if(preserveServerLock){
        const lockedServerIndex=Number(svMediaPlayerState.serverAudioIndex);
        if(Number.isInteger(lockedServerIndex) && lockedServerIndex >= 0 && availableAudio[lockedServerIndex]){
          svApplyActiveAudioAuthority(hlsInstance,vid,'loadFtpTrackOptions',{
            logicalIndex:lockedServerIndex,
            reason:'FTP metadata reload',
          });
        }
      }else{
        selectPreferredAudioTrack('FTP metadata', {sourcePreserved:true});
      }
    }else{
      const hintedTracks=audioTracksFromFilenameHints(requestedUrl);
      if(hintedTracks.length > 1){
        availableAudio=hintedTracks;
        selectPreferredAudioTrack('FTP filename metadata fallback', {sourcePreserved:true});
      }
    }

    const embeddedSubs = subtitleTracks.map((track,i)=>({
      ...track,
      index: i,
      sourceIndex: track.index,
      streamIndex: track.streamIndex ?? track.index,
      label: track.title || mediaLanguageLabel(track.language) || `Embedded ${i + 1}`,
      embedded: true,
    }));
    const sidecarSubs = (Array.isArray(data.sidecarSubtitleTracks) ? data.sidecarSubtitleTracks : []).map((track,i)=>({
      ...track,
      index: embeddedSubs.length + i,
      label: track.label || mediaLanguageLabel(track.lang || track.language) || `Subtitle ${embeddedSubs.length + i + 1}`,
      sidecar: true,
    }));
    availableSubs = [...embeddedSubs, ...sidecarSubs].map((track,i)=>({...track,index:i,label:subtitleTrackLabel(track,i)}));
    if(subList){
      if(availableSubs.length){
        subList.innerHTML = `<div class="pd-item active" onclick="setSub(-1)"><span>Off</span><span class="check">✓</span></div>`+
          availableSubs.map((t,i)=>`<div class="pd-item" onclick="setSub(${i})"><span>${esc(t.label||'Subtitle '+(i+1))}</span><span class="check">✓</span></div>`).join('');
      }else{
        subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">No subtitles found</div>`;
      }
    }
    renderSubtitleTracks();
    mediaFixLog('loaded FTP audio tracks',{
      url:requestedUrl,
      selected:audioDebugSummary(selectedAudioTrack(),currentAudioIdx),
      tracks:availableAudio.map((track,index)=>audioDebugSummary(track,index))
    });
    mediaFixLog('loaded FTP subtitle tracks',{
      url:requestedUrl,
      count:availableSubs.length,
      tracks:availableSubs.map((track,index)=>subtitleDebugSummary(track,index))
    });
    playbackDebug('ftp tracks loaded',{
      selectedAudio:currentAudioIdx,
      audioStream:selectedAudioTrack()?.streamIndex ?? selectedAudioTrack()?.sourceIndex ?? null,
      audioCount:availableAudio.length,
      subtitleCount:availableSubs.length
    });
    updateSubBtn();
    return data;
  }catch(e){
    if(e?.name === 'AbortError')return null;
    console.warn('[FTP] Track metadata unavailable:', e.message);
    const hintedTracks=audioTracksFromFilenameHints(requestedUrl);
    if(hintedTracks.length > 1){
      availableAudio=hintedTracks;
      selectPreferredAudioTrack('FTP metadata error filename fallback', {sourcePreserved:true});
    }
    mediaFixLog('FTP metadata failed',{
      url:requestedUrl,
      message:e.message,
      fallbackAudio:availableAudio.map((track,index)=>audioDebugSummary(track,index))
    });
    if(subList && !availableSubs.length){
      subList.innerHTML = `<div class="pd-item" style="color:#444" onclick="ensureFtpTrackOptionsLoaded({force:true})">Could not load subtitles. Tap to retry.</div>`;
    }
    return null;
  }finally{
    clearTimeout(timeout);
    parentSignal?.removeEventListener?.('abort', onParentAbort);
  }
}

async function sourceSeekTo(seconds){
  // SV_PLAYER_SESSION_BOUNDARY: retired VOD pipeline.
  return window.playerSession?.seekTo(arguments[0]);
}

function seekToTime(seconds){
  // SV_PLAYER_SESSION_BOUNDARY: retired VOD pipeline.
  return window.playerSession?.seekTo(seconds);
}

function maybeResumeProgress(id, duration){
  if(window.playerSession && !isLiveMode) return;

  if(vid._resumeChecked)return;
  const saved = watchProgress[id];
  if(!saved || saved.progress <= 0.02 || saved.progress >= 0.95){
    vid._resumeChecked = true;
    vid._ftpProxyFallback = false;
    return;
  }
  if(vid.currentTime > 2){
    vid._resumeChecked = true;
    return;
  }
  const target = Math.max(0, Math.min(duration - 1, saved.progress * duration));
  if(validDurationSeconds(duration) && Number.isFinite(target)){
    try{seekToTime(target);}catch(_){try{vid.currentTime = target;}catch(_){}}
  }
  vid._resumeChecked = true;
}

async function loadPlayerDuration(id){
  if(window.playerSession && !isLiveMode) return;

  const token = (vid._durationToken || 0) + 1;
  vid._durationToken = token;
  vid._durationPending = true;
  try{
    const r = await fetch(`${API_BASE}/api/duration/${encodeURIComponent(id)}`, {
      signal:playbackRequestController?.signal
    });
    if(token !== vid._durationToken || !r.ok)return;
    const data = await r.json();
    const duration = setPlayerDuration(data.duration, 'api');
    if(duration)maybeResumeProgress(id, duration);
  }catch(e){
    if(e?.name === 'AbortError')return;
    console.warn('[Player] Duration lookup failed:', e.message);
  }finally{
    if(token === vid._durationToken){
      vid._durationPending = false;
      if(!vid._sourceSeekRequired && !_ftpStreamUrl && !validDurationSeconds(vid._apiDuration) && validDurationSeconds(vid.duration)){
        const duration = setPlayerDuration(vid.duration);
        maybeResumeProgress(id, duration);
      }
    }
  }
}

async function loadFtpDuration(streamUrl){
  if(window.playerSession && !isLiveMode) return;

  const token = (vid._durationToken || 0) + 1;
  vid._durationToken = token;
  vid._durationPending = true;
  try{
    if(!svAssertNoLiveSourceForMedia(streamUrl, {fallbackReason:'FTP duration lookup'}))return;
    const params=new URLSearchParams();
    params.set('url', streamUrl);
    params.set('playbackType', 'media');
    const r = await fetch(`${API_BASE}/api/ftp/duration?${params.toString()}`, {
      signal:playbackRequestController?.signal
    });
    if(token !== vid._durationToken || !r.ok)return;
    const data = await r.json();
    const duration = Number(data.duration) || 0;
    if(validDurationSeconds(duration)){
      _ftpDuration = duration;
      setPlayerDuration(duration, 'api');
    }
  }catch(e){
    if(e?.name === 'AbortError')return;
    console.warn('[FTP] Duration lookup failed:', e.message);
  }finally{
    if(token === vid._durationToken)vid._durationPending = false;
  }
}

function fallbackOrderForRemote(url, plan={}){
  const unsupported = plan?.unsupportedVideoCodec || urlHasUnsupportedVideoHint(url);
  const selected=selectedAudioTrack();
  const explicitAudio=availableAudio.length > 1 || currentAudioIdx > 0 || Number.isFinite(selected?.streamIndex ?? selected?.sourceIndex);
  if(unsupported)return ['transcode','audio','remux','proxy'];
  if((plan?.mode === 'audio' || plan?.transport === 'audio') && selected && !audioCodecIsBrowserSafe(selected))return ['audio','transcode','proxy'];
  if(mappedAudioStartupRequiresSource() || explicitAudio)return ['audio','remux','transcode','proxy'];
  if(!isMobilePlaybackClient())return ['proxy','remux','audio','transcode'];
  if(explicitAudio)return ['audio','remux','transcode','proxy'];
  return ['proxy','remux','audio','transcode'];
}

function fallbackOrderForLocal(plan={}){
  if(plan?.unsupportedVideoHint || plan?.unsupportedVideoCodec)return ['transcode','audio','remux','direct'];
  if(mappedAudioStartupRequiresSource())return ['audio','remux','transcode','direct'];
  return ['remux','audio','transcode','direct'];
}

function resetToOriginalAudioFallback(context='original source fallback'){
  if(svMediaPlayerState.audioLocked){
    svApplyServerAudioAuthority(hlsInstance,vid,`${context} ignored; server audio locked`);
    return;
  }
  clearAudioLock();
  svSetCurrentAudioIndex(0,'resetToOriginalAudioFallback',context);
  setAppliedAudioIndex(0, context);
  renderAudioTracks();
}

function applyStartupAudioInfo(info, sourceUrl='', context='startup audio', selection={}){
  const tracks=Array.isArray(info?.audioTracks) ? info.audioTracks : [];
  clearAudioLock();
  if(!tracks.length){
    availableAudio=[{index:0,title:'Default Audio'}];
    svSetCurrentAudioIndex(0,'applyStartupAudioInfo','startup audio unavailable');
    setAppliedAudioIndex(0);
    renderAudioTracks();
    mediaFixLog('startup audio unavailable', {context, sourceUrl});
    return {info, options:{}, selected:null, reason:'no audio metadata'};
  }
  const hints=filenameAudioHints(sourceUrl);
  availableAudio=normalizeDiscoveredAudioTracks(tracks,hints);
  const serverIndex=Number(selection.serverAudioIndex ?? info?.audioIndex ?? info?.defaultAudioIndex);
  const decision=svPreferredAudioDecision(availableAudio,context);
  svApplyActiveAudioAuthority(null,vid,'applyStartupAudioInfo',{
    logicalIndex:decision.selectedIndex,
    reason:decision.reason || context,
    applyDiscovered:false,
  });
  const selected=selectedAudioTrack();
  const streamIndex=audioTrackStreamIndex(selected);
  const relativeIndex=audioTrackRelativeIndex(selected,currentAudioIdx);
  const safeCodec=audioCodecIsBrowserSafe(selected);
  let options={};
  let reason=decision.reason || (Number.isInteger(serverIndex) && currentAudioIdx === serverIndex
    ? (info?.audioSelectionReason || 'server title-language audio decision')
    : 'safe audio fallback');

  if(streamIndex !== null && !safeCodec){
    options={forceAudio:true};
    reason='first valid audio stream requires AAC output';
  }else if(streamIndex !== null && relativeIndex !== 0){
    options={forceRemux:true};
    reason='first valid audio stream is not the first container stream';
  }else if(sourceNeedsBrowserRemux(sourceUrl)){
    options={forceRemux:true};
    reason='first valid audio stream needs browser MP4 remux';
  }

  renderAudioTracks();
  if(options.forceAudio || options.forceRemux){
    setAppliedAudioIndex(currentAudioIdx, `${context} mapped audio startup`);
    lockAudioToCurrent(reason, {requiresMappedSource:true});
  }else{
    setAppliedAudioIndex(currentAudioIdx, `${context} startup`);
    if(availableAudio.length > 1)lockAudioToCurrent(reason, {requiresMappedSource:false});
  }
  mediaFixLog('startup audio decision', {
    context,
    reason,
    options,
    selected:audioDebugSummary(selected,currentAudioIdx),
    safeCodec,
    relativeIndex,
    streamIndex,
    route:options.forceAudio ? 'audio-copy' : options.forceRemux ? 'remux-copy' : 'proxy/direct',
    tracks:availableAudio.map((track,index)=>audioDebugSummary(track,index))
  });
  return {info, options, selected, reason};
}

function resetUncertainStartupAudio(context, message){
  clearAudioLock();
  availableAudio=[{index:0,title:'Default Audio'}];
  svSetCurrentAudioIndex(0,'resetUncertainStartupAudio',context);
  setAppliedAudioIndex(0);
  renderAudioTracks();
  mediaFixLog('startup audio fallback to source default', {context, message});
}

async function prepareLocalStartupAudio(id, movie={}, scope=null){
  const sourceUrl=localFileForStreamId(id,movie);
  try{
    const info=await svFetchMediaInfoData(
      svLocalAudioInfoUrl(id),
      startupAudioTimeoutFor(sourceUrl)
    );
    if(scope && !isCurrentPlaybackScope(scope))throw new DOMException('Stale playback request', 'AbortError');
    svCaptureServerAudioDecision(info);
    return applyStartupAudioInfo(info, sourceUrl, 'local startup');
  }catch(e){
    if(e?.name === 'AbortError' && scope && !isCurrentPlaybackScope(scope))throw e;
    if(seedAudioTracksFromFilename(sourceUrl, 'local startup metadata fallback')){
      return {
        info:null,
        options:{forceAudio:true},
        selected:selectedAudioTrack(),
        reason:e.message || 'startup metadata timeout'
      };
    }
    resetUncertainStartupAudio('local startup', e.message);
    return {info:null, options:{}, selected:null, reason:e.message};
  }
}

async function prepareFtpStartupAudio(streamUrl, scope=null){
  try{
    if(!svAssertNoLiveSourceForMedia(streamUrl, {fallbackReason:'FTP startup audio'}))throw new Error('Blocked live TV source for media playback');
    const info=await svFetchMediaInfoData(
      svFtpAudioInfoUrl(streamUrl),
      startupAudioTimeoutFor(streamUrl)
    );
    if(scope && !isCurrentPlaybackScope(scope))throw new DOMException('Stale playback request', 'AbortError');
    svCaptureServerAudioDecision(info);
    const decodedIndex=info?.ftpAudioValidated === true
      ? Number(info.audioIndex ?? info.defaultAudioIndex)
      : null;
    return applyStartupAudioInfo(info, streamUrl, 'FTP startup', {serverAudioIndex:decodedIndex});
  }catch(e){
    if(e?.name === 'AbortError' && scope && !isCurrentPlaybackScope(scope))throw e;
    if(seedAudioTracksFromFilename(streamUrl, 'FTP startup metadata fallback')){
      return {
        info:null,
        options:{forceAudio:true},
        selected:selectedAudioTrack(),
        reason:e.message || 'startup metadata timeout'
      };
    }
    resetUncertainStartupAudio('FTP startup', e.message);
    return {info:null, options:{}, selected:null, reason:e.message};
  }
}

async function attachFtpFallbackStep(resolvedStreamUrl, name, step, failedAt){
  const fallbackReason=`FTP ${step} fallback`;
  playbackDebug('ftp fallback start', {playbackType:'media', step, fallbackReason, failedAt, error:videoErrorInfo()});
  const fallback = step === 'transcode'
    ? ftpStreamPlaybackPlan(resolvedStreamUrl, failedAt, fallbackReason)
    : await fetchFtpPlaybackPlan(resolvedStreamUrl, failedAt, {...playbackOptionsForStep(step, fallbackReason), signal:playbackRequestController?.signal});
  if(_ftpStreamUrl !== resolvedStreamUrl)return true;
  const fallbackMode = fallback.mode || step;
  validateMediaPlaybackSource(fallback.src, step, {ftpUrl:resolvedStreamUrl, mode:fallbackMode, fallbackReason});
  const shouldPlay = vid._svPlaybackShouldPlay !== false;
  _currentFtpPlaybackPlan = fallback;
  _ftpNeedsTranscode = planNeedsSourceSeek({mode:fallbackMode});
  vid._sourceSeekRequired = _ftpNeedsTranscode;
  vid._mediaSourceSeekRequired = _ftpNeedsTranscode;
  vid._sourceOffset = _ftpNeedsTranscode ? failedAt : 0;
  if(step === 'proxy')resetToOriginalAudioFallback('FTP original proxy fallback');
  if(validDurationSeconds(Number(fallback.duration))){
    _ftpDuration = Number(fallback.duration);
    setPlayerDuration(_ftpDuration, 'api');
  }
  vid.addEventListener('canplay', function onFtpFallbackCanPlay(){
    if(_ftpStreamUrl !== resolvedStreamUrl)return;
    playbackDebug('ftp fallback canplay', {step, src:fallback.src});
    setCentralPlaybackLoading(false);
  }, {once:true});
  vid.addEventListener('error', function onFtpFallbackError(){
    if(_ftpStreamUrl !== resolvedStreamUrl)return;
    clearMediaStartupWatchdog();
    playbackDebug('ftp fallback video error', {step, error:videoErrorInfo()});
    tryFtpAdaptiveFallback(resolvedStreamUrl, name, playbackTime()).catch(()=>showVlcPlaybackNotice(resolvedStreamUrl, name));
  }, {once:true});
  playbackDebug('ftp fallback attach', {playbackType:'media', step, fallbackReason, mode:fallbackMode, src:fallback.src});
  if(!await attachPlayerSource(fallback.src, fallbackMode, {playbackType:'media', fallbackReason}))throw new Error(`Could not attach ${step} source`);
  armMediaStartupWatchdog(
    fallback.src,
    fallbackReason,
    ()=>_ftpStreamUrl === resolvedStreamUrl,
    ()=>tryFtpAdaptiveFallback(resolvedStreamUrl, name, playbackTime()),
    step === 'transcode' ? SV_MEDIA_TRANSCODE_STARTUP_TIMEOUT_MS : SV_MEDIA_SOURCE_STARTUP_TIMEOUT_MS
  );
  if(shouldPlay)svPlayVideo('FTP fallback', {force:true, onError:e=>{
    if(e?.name === 'NotAllowedError'){
      updatePlayIcons(true);
      showUI();
      return false;
    }
    playbackDebug('ftp fallback play rejected', {step, message:e.message});
    return false;
  }}).catch(()=>{});
  return true;
}

async function tryFtpAdaptiveFallback(resolvedStreamUrl, name, failedAt=playbackTime()){
  if(!_ftpStreamUrl || _ftpStreamUrl !== resolvedStreamUrl)return false;
  const tried = vid._ftpFallbackStepsTried || (vid._ftpFallbackStepsTried = new Set());
  if(isMobilePlaybackClient()){
    if(tried.has('isolated-hls-retry'))return false;
    tried.add('isolated-hls-retry');
    setCentralPlaybackLoading(true);
    try{return await attachFtpFallbackStep(resolvedStreamUrl,name,'hls',failedAt);}
    catch(e){playbackDebug('mobile FTP isolated HLS retry failed',{message:e.message});return false;}
  }
  const order = fallbackOrderForRemote(resolvedStreamUrl, _currentFtpPlaybackPlan);
  setCentralPlaybackLoading(true);
  for(const step of order){
    if(tried.has(step))continue;
    tried.add(step);
    try{
      return await attachFtpFallbackStep(resolvedStreamUrl, name, step, failedAt);
    }catch(e){
      if(e?.name === 'AbortError')return false;
      playbackDebug('ftp fallback failed', {step, message:e.message});
    }
  }
  setCentralPlaybackLoading(false);
  playbackDebug('ftp fallback exhausted', {url:resolvedStreamUrl});
  showVlcPlaybackNotice(resolvedStreamUrl, name);
  return false;
}

async function attachLocalFallbackStep(id, step, failedAt){
  const fallbackReason=`local ${step} fallback`;
  playbackDebug('local fallback start', {playbackType:'media', id, step, fallbackReason, failedAt, error:videoErrorInfo()});
  const fallback = step === 'transcode'
    ? { ok:true, mode:'stream', src:localTranscodeSrc(id, failedAt, fallbackReason), duration:vid._apiDuration || 0 }
    : await fetchLocalPlaybackPlan(id, failedAt, {...playbackOptionsForStep(step, fallbackReason), signal:playbackRequestController?.signal});
  if(String(currentStreamId) !== String(id) || _ftpStreamUrl)return true;
  const fallbackMode = fallback.mode || step;
  validateMediaPlaybackSource(fallback.src, step, {localId:id, mode:fallbackMode, fallbackReason});
  const shouldPlay = vid._svPlaybackShouldPlay !== false;
  _currentPlaybackPlan = fallback;
  vid._sourceSeekRequired = planNeedsSourceSeek({mode:fallbackMode});
  vid._mediaSourceSeekRequired = vid._sourceSeekRequired;
  vid._sourceOffset = vid._sourceSeekRequired ? failedAt : 0;
  if(step === 'direct')resetToOriginalAudioFallback('local original source fallback');
  if(validDurationSeconds(Number(fallback.duration)))setPlayerDuration(Number(fallback.duration),'api');
  vid.addEventListener('canplay', function onLocalFallbackCanPlay(){
    if(String(currentStreamId) !== String(id) || _ftpStreamUrl)return;
    playbackDebug('local fallback canplay', {id, step, src:fallback.src});
    setCentralPlaybackLoading(false);
  }, {once:true});
  vid.addEventListener('error', function onLocalFallbackError(){
    if(String(currentStreamId) !== String(id) || _ftpStreamUrl)return;
    clearMediaStartupWatchdog();
    playbackDebug('local fallback video error', {id, step, error:videoErrorInfo()});
    tryLocalAdaptiveFallback(id, playbackTime()).catch(()=>showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE));
  }, {once:true});
  playbackDebug('local fallback attach', {playbackType:'media', id, step, fallbackReason, mode:fallbackMode, src:fallback.src});
  if(!await attachPlayerSource(fallback.src, fallbackMode, {playbackType:'media', fallbackReason}))throw new Error(`Could not attach ${step} source`);
  armMediaStartupWatchdog(
    fallback.src,
    fallbackReason,
    ()=>String(currentStreamId) === String(id) && !_ftpStreamUrl,
    ()=>tryLocalAdaptiveFallback(id, playbackTime()),
    step === 'transcode' ? SV_MEDIA_TRANSCODE_STARTUP_TIMEOUT_MS : SV_MEDIA_SOURCE_STARTUP_TIMEOUT_MS
  );
  if(shouldPlay)svPlayVideo('local fallback', {force:true, onError:e=>{
    if(e?.name === 'NotAllowedError'){
      updatePlayIcons(true);
      showUI();
      return false;
    }
    playbackDebug('local fallback play rejected', {id, step, message:e.message});
    return false;
  }}).catch(()=>{});
  return true;
}

async function tryLocalAdaptiveFallback(id, failedAt=playbackTime()){
  if(!currentStreamId || String(currentStreamId) !== String(id) || _ftpStreamUrl)return false;
  const tried = vid._localFallbackStepsTried || (vid._localFallbackStepsTried = new Set());
  if(isMobilePlaybackClient()){
    if(tried.has('isolated-hls-retry'))return false;
    tried.add('isolated-hls-retry');
    setCentralPlaybackLoading(true);
    try{return await attachLocalFallbackStep(id,'hls',failedAt);}
    catch(e){playbackDebug('mobile local isolated HLS retry failed',{message:e.message});return false;}
  }
  const order = fallbackOrderForLocal(_currentPlaybackPlan);
  setCentralPlaybackLoading(true);
  for(const step of order){
    if(tried.has(step))continue;
    tried.add(step);
    try{
      return await attachLocalFallbackStep(id, step, failedAt);
    }catch(e){
      if(e?.name === 'AbortError')return false;
      playbackDebug('local fallback failed', {id, step, message:e.message});
    }
  }
  setCentralPlaybackLoading(false);
  playbackDebug('local fallback exhausted', {id});
  showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE);
  return false;
}

async function playMedia(id, name, year, playbackContext=null){
  // SV_PLAYER_SESSION_BOUNDARY: retired VOD pipeline.
  return window.StreamVaultPlayerView.start({kind:'local',id,name,year});
}

function currentPlaybackSnapshot(){
  const ftp=!!_ftpStreamUrl;
  const plan=ftp ? _currentFtpPlaybackPlan : _currentPlaybackPlan;
  return {
    ftp,
    plan:plan ? {...plan} : null,
    src:plan?.src || plan?.finalPlayUrl || plan?.playUrl || vid.currentSrc || vid.getAttribute('src') || '',
    mode:plan?.mode || (ftp ? 'proxy' : 'direct'),
    time:playbackTime(),
    paused:vid.paused,
    audioIdx:currentAudioIdx,
    appliedIdx:appliedAudioIndex(),
    manualAudioIdx:svMediaPlayerState.manualAudioIndex,
    serverAudioIdx:svMediaPlayerState.serverAudioIndex,
    manifestAudioIdx:svMediaPlayerState.manifestAudioIndex,
    audioAuthorityLocked:svMediaPlayerState.audioLocked,
    audioSession:svAudioSession.snapshot(),
    lockedAudioIdx:audioLockedIndex(),
    sourceOffset:Number(vid._sourceOffset || 0),
    sourceSeekRequired:!!vid._sourceSeekRequired,
    mediaSourceSeekRequired:!!vid._mediaSourceSeekRequired,
    ftpNeedsTranscode:_ftpNeedsTranscode,
    ftpCurrentTime:_ftpCurrentTime
  };
}

async function restorePlaybackSnapshot(snapshot, reason='switch failed'){
  if(!snapshot?.src)throw new Error('No previous source to restore');
  svSetCurrentAudioIndex(snapshot.audioIdx,'restorePlaybackSnapshot',reason);
  setAppliedAudioIndex(snapshot.appliedIdx);
  svMediaPlayerState.manualAudioIndex=snapshot.manualAudioIdx ?? null;
  svMediaPlayerState.serverAudioIndex=snapshot.serverAudioIdx ?? null;
  svMediaPlayerState.manifestAudioIndex=snapshot.manifestAudioIdx ?? null;
  svMediaPlayerState.audioLocked=!!snapshot.audioAuthorityLocked;
  svAudioSession.restore(snapshot.audioSession || {});
  vid._svAudioLockedIndex=snapshot.lockedAudioIdx ?? null;
  if(snapshot.ftp){
    _currentFtpPlaybackPlan=snapshot.plan;
    _ftpNeedsTranscode=snapshot.ftpNeedsTranscode;
    _ftpCurrentTime=snapshot.ftpCurrentTime;
  }else{
    _currentPlaybackPlan=snapshot.plan;
  }
  vid._sourceOffset=snapshot.sourceOffset;
  vid._sourceSeekRequired=snapshot.sourceSeekRequired;
  vid._mediaSourceSeekRequired=snapshot.mediaSourceSeekRequired;
  const target=Math.max(0,Number(snapshot.time || 0));
  const sourceSeek=snapshot.sourceSeekRequired;
  const applyTime=()=>{if(!sourceSeek && target>0){try{vid.currentTime=target;}catch(_){}}};
  vid.addEventListener('loadedmetadata',applyTime,{once:true});
  vid.addEventListener('canplay',applyTime,{once:true});
  validateMediaPlaybackSource(snapshot.src, 'audio switch rollback', {
    ftpUrl:snapshot.ftp ? _ftpStreamUrl : '',
    localId:snapshot.ftp ? null : currentStreamId,
    mode:snapshot.mode,
    fallbackReason:reason
  });
  const attached=await attachPlayerSource(snapshot.src,snapshot.mode, {playbackType:'media', fallbackReason:reason || 'audio switch rollback'});
  if(!attached)throw new Error('Previous source could not be restored');
  setTimeout(applyTime,0);
  if(!snapshot.paused)svPlayVideo('audio switch rollback', {force:true}).catch(()=>{});
  renderAudioTracks();
  mediaFixLog('audio switch rollback restored source', {
    reason,
    mode:snapshot.mode,
    time:target,
    selected:audioDebugSummary(availableAudio[currentAudioIdx],currentAudioIdx)
  });
}

function waitForSwitchCanPlay(token, timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    let done=false;
    const cleanup=()=>{
      clearTimeout(timer);
      vid.removeEventListener('canplay',onCanPlay);
      vid.removeEventListener('error',onError);
    };
    const finish=(fn,value)=>{
      if(done)return;
      done=true;
      cleanup();
      fn(value);
    };
    const onCanPlay=()=>finish(resolve,true);
    const onError=()=>finish(reject,new Error(videoErrorInfo().message || 'Audio switch source failed'));
    const timer=setTimeout(()=>finish(reject,new Error('Audio switch timed out')),timeoutMs);
    vid.addEventListener('canplay',onCanPlay,{once:true});
    vid.addEventListener('error',onError,{once:true});
    if(token!==vid._audioSwitchToken)finish(reject,new Error('Audio switch superseded'));
  });
}

async function switchAudioWithServer(idx){
  if(vid._audioSwitchPending){
    vid._queuedAudioSwitchIdx=idx;
    mediaFixLog('queued audio switch',{idx,selected:audioDebugSummary(availableAudio[idx],idx)});
    closeAllDropdowns();
    return;
  }
  const selected=availableAudio[idx];
  if(!selected)return;
  const previous=currentPlaybackSnapshot();
  const target=previous.time;
  const localId=currentStreamId;
  const ftpUrl=_ftpStreamUrl;
  const token=(vid._audioSwitchToken||0)+1;
  vid._audioSwitchToken=token;
  vid._audioSwitchPending=true;
  recordManualAudioSelection(idx,'server audio switch');
  svSetCurrentAudioIndex(idx,'switchAudioWithServer','server audio switch');
  renderAudioTracks();
  closeAllDropdowns();
  setCentralPlaybackLoading(true);
  vid._sourceOffset=target;
  vid.pause();
  mediaFixLog('selected audio switch',{
    ftp:!!ftpUrl,
    url:ftpUrl || localId,
    target,
    from:previous.audioIdx,
    to:idx,
    selected:audioDebugSummary(selected,idx)
  });

  const finish=(runQueue=true)=>{
    if(token!==vid._audioSwitchToken)return;
    vid._audioSwitchPending=false;
    setCentralPlaybackLoading(false);
    const queuedIdx=Number.isInteger(vid._queuedAudioSwitchIdx) ? vid._queuedAudioSwitchIdx : null;
    vid._queuedAudioSwitchIdx=null;
    if(runQueue && queuedIdx !== null && queuedIdx !== currentAudioIdx){
      setTimeout(()=>switchAudioWithServer(queuedIdx),0);
    }
  };

  let canPlay=null;
  try{
    const currentMode = ftpUrl ? _currentFtpPlaybackPlan?.mode : _currentPlaybackPlan?.mode;
    if(!ftpUrl && !localId)throw new Error('No media source for audio switch');
    const switchOptions = {forceAudio:true, fallbackReason:'audio switch', signal:playbackRequestController?.signal};
    const plan = currentMode === 'stream'
      ? (ftpUrl
        ? { ok:true, mode:'stream', src:ftpTranscodeSrc(ftpUrl,target,'audio switch'), duration:_ftpDuration || 0 }
        : { ok:true, mode:'stream', src:localTranscodeSrc(localId,target,'audio switch'), duration:vid._apiDuration || 0 })
      : (ftpUrl
        ? await fetchFtpPlaybackPlan(ftpUrl,target,switchOptions)
        : await fetchLocalPlaybackPlan(localId,target,switchOptions));
    if(token!==vid._audioSwitchToken)return;
    validateMediaPlaybackSource(plan.src, 'audio switch', {
      ftpUrl:ftpUrl || '',
      localId:ftpUrl ? null : localId,
      mode:plan.mode || 'audio',
      fallbackReason:'audio switch'
    });
    if(ftpUrl){
      _currentFtpPlaybackPlan=plan;
      _ftpNeedsTranscode=true;
      _ftpCurrentTime=target;
    }else{
      _currentPlaybackPlan=plan;
    }
    vid._sourceSeekRequired=true;
    vid._mediaSourceSeekRequired=true;
    canPlay=waitForSwitchCanPlay(token);
    const attached=await attachPlayerSource(plan.src,plan.mode||'audio', {playbackType:'media', fallbackReason:'audio switch'});
    if(!attached)throw new Error('Audio stream could not be attached');
    await canPlay;
    if(token!==vid._audioSwitchToken)return;
    setAppliedAudioIndex(idx,'server audio switch');
    if(!previous.paused)svPlayVideo('server audio switch', {force:true}).catch(()=>{});
    showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
    mediaFixLog('audio switch attached',{
      ftp:!!ftpUrl,
      mode:plan.mode,
      src:plan.src,
      selected:audioDebugSummary(selected,idx),
      restoredTime:target
    });
    playbackDebug('server audio switch',{
      idx,
      target,
      mode:plan.mode,
      ftp:!!ftpUrl,
      streamIndex:selected.streamIndex ?? selected.sourceIndex ?? null
    });
    finish();
  }catch(e){
    if(e?.name === 'AbortError'){finish(false);return;}
    canPlay?.catch(()=>{});
    try{
      await restorePlaybackSnapshot(previous, e.message);
    }catch(restoreError){
      console.warn('[Audio] Restore after switch failure failed:',restoreError.message);
    }
    finish(false);
    showToast('Could not switch audio for this file');
    console.warn('[Audio] Switch failed:',e.message);
  }
}

function setAudio(idx){
  if(window.playerSession?.active) { window.playerSession.setAudio(Number(arguments[0])); closeAllDropdowns(); return; }

  if(!Number.isInteger(idx) || idx < 0 || !availableAudio[idx])return;
  if(vid._audioSwitchPending){
    vid._queuedAudioSwitchIdx=idx;
    closeAllDropdowns();
    showToast('Audio switch already in progress');
    return;
  }
  if(idx===currentAudioIdx && idx===appliedAudioIndex()){closeAllDropdowns();return;}
  const stableAudioMode=String((_ftpStreamUrl ? _currentFtpPlaybackPlan?.mode : _currentPlaybackPlan?.mode) || '').toLowerCase();
  const hasStableMediaSource=!!_ftpStreamUrl || (currentStreamId !== null && currentStreamId !== undefined);
  if(!isLiveMode && hasStableMediaSource && availableAudio.length > 1 && stableAudioMode !== 'hls'){
    switchAudioWithServer(idx).catch(error=>{
      console.warn('[Audio] Switch failed:',error?.message || error);
      showToast('Could not switch audio for this file');
    });
    return;
  }
  if(!isMobilePlaybackClient()){
    const sourceBefore=vid.currentSrc;
    refreshDesktopNativeAudioTracks();
    const selected=availableAudio[idx];
    if(!selected || availableAudio.length<2){
      closeAllDropdowns();
      showToast('No alternate audio track is available for this file.');
      return;
    }
    if(selected.hls && hlsInstance){
      recordManualAudioSelection(idx,'desktop HLS audio switch');
      svApplyActiveAudioAuthority(hlsInstance,vid,'setAudio',{
        logicalIndex:idx,
        reason:'desktop HLS audio switch',
      });
      closeAllDropdowns();
      showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
      playbackDebug('desktop HLS audio switch',{idx,sourceUnchanged:sourceBefore===vid.currentSrc});
      return;
    }
    if(selected.nativeTrack){
      recordManualAudioSelection(idx,'desktop native audio switch');
      svApplyActiveAudioAuthority(hlsInstance,vid,'setAudio',{
        logicalIndex:idx,
        reason:'desktop native audio switch',
      });
      closeAllDropdowns();
      showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
      playbackDebug('desktop native audio switch',{idx,sourceUnchanged:sourceBefore===vid.currentSrc});
      return;
    }
  }
  const selected=availableAudio[idx];
  const sourceBefore=vid.currentSrc;
  if(selected?.hls && hlsInstance){
    recordManualAudioSelection(idx,'source-preserving HLS audio switch');
    svApplyActiveAudioAuthority(hlsInstance,vid,'setAudio',{
      logicalIndex:idx,
      reason:'source-preserving HLS audio switch',
    });
    closeAllDropdowns();
    showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
    playbackDebug('source-preserving HLS audio switch',{idx,sourceUnchanged:sourceBefore===vid.currentSrc});
    return;
  }
  if(selected?.nativeTrack){
    recordManualAudioSelection(idx,'source-preserving native audio switch');
    svApplyActiveAudioAuthority(hlsInstance,vid,'setAudio',{
      logicalIndex:idx,
      reason:'source-preserving native audio switch',
    });
    closeAllDropdowns();
    showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
    playbackDebug('source-preserving native audio switch',{idx,sourceUnchanged:sourceBefore===vid.currentSrc});
    return;
  }
  switchAudioWithServer(idx).catch(error=>console.warn('[Audio] Switch failed:',error.message));
}

function updateProgress(){
  const duration = playerDuration();
  if(!duration)return;
  const current = playbackTime();
  schedulePlayerProgressRender(current,duration,{save:true});
  updateWatchProgress(currentStreamId,current,duration);
}
function updatePlayIcons(){
  if(window.playerSession?.active) { return window.StreamVaultPlayerView.render(window.playerSession.snapshot()); }
renderCentralPlaybackState();}
function hideUI(){
  if(vid.paused || playerMenusOpen() || progressDragging || playerControlsFocused())return;
  clearTimeout(uiHideTimer);
  const els=playerEls();
  els.ui?.classList.add('hidden');
  els.wrap?.classList.remove('show-cursor');
  els.wrap?.classList.add('subtitles-low');
  hideSeekPreview();
  uiVisible=false;
}
function showUI(){
  const els=playerEls();
  els.ui?.classList.remove('hidden');
  const wrap=els.wrap;
  if(!wrap)return;
  wrap.classList.remove('subtitles-low');
  wrap.classList.add('show-cursor');
  uiVisible=true;
  clearTimeout(uiHideTimer);
  scheduleHideUI();
}
function scheduleHideUI(){
  clearTimeout(uiHideTimer);
  if(vid.paused || playerMenusOpen() || progressDragging || playerControlsFocused())return;
  uiHideTimer=setTimeout(hideUI,3500);
}
function togglePlay(){
  if(window.playerSession?.active) { return window.playerSession.togglePlay(); }
if(ensureCentralPlaybackController()?.isLoading?.())return;if(vid.paused){vid._svPlaybackShouldPlay=true;svPlayVideo('manual toggle', {force:true}).catch(()=>{});popCenter('');}else{vid._svPlaybackShouldPlay=false;svAbortPendingPlayRequest('manual pause');vid.pause();popCenter('');clearTimeout(uiHideTimer);}}
function seekBy(s){
  if(isLiveMode)return;
  seekToTime(playbackTime()+s);
  flashSeek(s);showUI();
}
function flashSeek(s){const side=s<0?'Left':'Right';const el=document.getElementById('seekFlash'+side);el.classList.add('show');setTimeout(()=>el.classList.remove('show'),700);}
function popCenter(icon){const el=document.getElementById('centerFlash');el.textContent=icon;el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');setTimeout(()=>el.classList.remove('pop'),400);}
function toggleMute(){
  if(window.playerSession?.active) { return window.playerSession.setMuted(!window.playerSession.muted); }
vid.muted=!vid.muted;document.getElementById('volSlider').value=vid.muted?0:vid.volume;updateVolIcon();}
function setVolume(v){
  if(window.playerSession?.active) { return window.playerSession.setVolume(arguments[0]); }
vid.volume=parseFloat(v);vid.muted=v==0;updateVolIcon();}
function updateVolIcon(){
  const muted=vid.muted||vid.volume===0;
  document.getElementById('volIcon').innerHTML=muted
    ?'<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
    :'<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
}
function isMobileLandscapeMode(){
  return document.getElementById('playerModal')?.classList.contains('mobile-landscape');
}

function enterMobileLandscapeMode(requestNativeFullscreen=false){
  if(!isMobilePlaybackClient())return false;
  const modal=document.getElementById('playerModal');
  const wrap=document.getElementById('playerWrap');
  modal.classList.add('mobile-landscape');
  document.body.classList.add('player-mobile-landscape');
  if(requestNativeFullscreen){
    try{
      const req=wrap.requestFullscreen||wrap.webkitRequestFullscreen||wrap.mozRequestFullScreen;
      if(req){
        const p=req.call(wrap);
        if(p&&p.catch)p.catch(()=>{});
      }
    }catch{}
    try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{});}catch{}
  }
  updateFsIcon();
  showUI();
  return true;
}

function exitMobileLandscapeMode(){
  const modal=document.getElementById('playerModal');
  modal.classList.remove('mobile-landscape');
  document.body.classList.remove('player-mobile-landscape');
  try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock();}catch{}
  if(document.fullscreenElement||document.webkitFullscreenElement){
    const exit=document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen;
    if(exit){try{exit.call(document);}catch{}}
  }
  updateFsIcon();
}

function toggleFullscreen(){
  const wrap=document.getElementById('playerWrap');
  if(isMobilePlaybackClient()){
    if(isMobileLandscapeMode())exitMobileLandscapeMode();
    else enterMobileLandscapeMode(true);
    return;
  }
  const isFs=!!(document.fullscreenElement||document.webkitFullscreenElement||vid.webkitDisplayingFullscreen);
  if(!isFs){
    const req=wrap.requestFullscreen||wrap.webkitRequestFullscreen||wrap.mozRequestFullScreen;
    if(req){
      try{
        const p=req.call(wrap);
        if(p&&p.catch)p.catch(()=>{});
        try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{});}catch{}
      }catch{}
    }
  } else {
    const exit=document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen;
    if(exit){try{exit.call(document);}catch{}}
    try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock();}catch{}
  }
}
function updateFsIcon(){
  const isFs=isMobileLandscapeMode()||!!(document.fullscreenElement||document.webkitFullscreenElement||vid.webkitDisplayingFullscreen);
  document.getElementById('fsIcon').innerHTML=isFs
    ?'<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
    :'<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
}
let _ftpStreamUrl='';
let _ftpDuration=0;
let _ftpCurrentTime=0;
let _ftpSeekPending=false;
let _ftpNeedsTranscode=false;
let _ftpTrackLoadPromise=null;
let _ftpTrackLoadFailed=false;
let _ftpHeavyMedia=false;
let _ftpHeavyStartupUntil=0;
let _ftpHeavyPlaybackStarted=false;
let _ftpPostStartMetadataTimer=null;
let _ftpPostStartPlayingHandler=null;
let _ftpDurationLoadPromise=null;
let _ftpDurationLoadUrl='';
let _smoothPlaybackState={kind:'',eligible:false,switched:false,switching:false,waitingCount:0,startedAt:0,playingAt:0,lastWaitingAt:0,reason:''};

function decodedMediaLabel(sourceUrl=''){
  try{return decodeURIComponent(String(sourceUrl || '')).toLowerCase();}
  catch(_){return String(sourceUrl || '').toLowerCase();}
}

function finiteMediaMetric(...values){
  for(const value of values){
    const number=Number(value);
    if(Number.isFinite(number) && number > 0)return number;
  }
  return 0;
}

function classifyHeavyMedia(info={}, sourceUrl=''){
  const video=info?.video || info?.videoStream || {};
  const format=info?.format || {};
  const label=decodedMediaLabel(sourceUrl);
  const codec=[
    info?.videoCodec,
    info?.codec,
    video?.codec_name,
    video?.codec,
    label
  ].filter(Boolean).join(' ').toLowerCase();
  const profile=[
    info?.profile,
    info?.pixelFormat,
    info?.pix_fmt,
    info?.colorTransfer,
    video?.profile,
    video?.pix_fmt,
    video?.color_transfer,
    label
  ].filter(Boolean).join(' ').toLowerCase();
  const width=finiteMediaMetric(info?.width,info?.videoWidth,video?.width);
  const height=finiteMediaMetric(info?.height,info?.videoHeight,video?.height);
  const bitrate=finiteMediaMetric(
    info?.bitrate,
    info?.bitRate,
    info?.videoBitrate,
    info?.videoBitRate,
    video?.bit_rate,
    format?.bit_rate
  );
  const fileSize=finiteMediaMetric(
    info?.fileSize,
    info?.sizeBytes,
    info?.contentLength,
    info?.size,
    format?.size
  );
  const named4k=/(?:^|[^a-z0-9])(?:2160p|4k|uhd)(?:[^a-z0-9]|$)/i.test(label);
  const is4k=named4k || width >= 3000 || height >= 1600;
  const isHevc=/(?:hevc|h[.\s-]?265|x265)/i.test(codec);
  const isTenBitHdr=/(?:10[\s-]?bit|hdr10|hdr|dolby[\s._-]?vision|\bdv\b|main[\s._-]?10|p010)/i.test(profile);
  const highBitrate=bitrate >= 25 * 1000 * 1000;
  const veryLargeFile=fileSize >= 8 * 1024 * 1024 * 1024;
  const highResolutionHevc=isHevc && isTenBitHdr && (width >= 2560 || height >= 1400);
  return {
    heavy:is4k || highBitrate || veryLargeFile || highResolutionHevc,
    is4k,
    isHevc,
    isTenBitHdr,
    highBitrate,
    veryLargeFile
  };
}

function shouldUseHeavyCompatHlsCache(info={}, sourceUrl=''){
  const traits=classifyHeavyMedia(info,sourceUrl);
  return traits.is4k
    && traits.isHevc
    && (traits.isTenBitHdr || traits.veryLargeFile)
    && mediaNeedsBrowserVideoTranscode(info,sourceUrl);
}

function resetSmoothPlaybackState(reason='reset'){
  _smoothPlaybackState={kind:'',eligible:false,switched:false,switching:false,waitingCount:0,startedAt:0,playingAt:0,lastWaitingAt:0,reason};
}

function shouldUseSmoothPlaybackProfile(info={}, sourceUrl=''){
  const traits=classifyHeavyMedia(info,sourceUrl);
  return !!(
    traits.heavy
    || traits.is4k
    || traits.isHevc
    || traits.isTenBitHdr
    || traits.highBitrate
    || traits.veryLargeFile
    || mediaNeedsBrowserVideoTranscode(info,sourceUrl)
  );
}

function armSmoothPlaybackMonitor(kind, info={}, sourceUrl=''){
  const eligible=shouldUseSmoothPlaybackProfile(info,sourceUrl);
  _smoothPlaybackState={
    kind,
    eligible,
    switched:false,
    switching:false,
    waitingCount:0,
    startedAt:Date.now(),
    playingAt:0,
    lastWaitingAt:0,
    reason:'metadata'
  };
  mediaFixLog('smooth playback monitor armed',{kind,eligible,traits:classifyHeavyMedia(info,sourceUrl)});
}

function noteSmoothPlaybackStarted(){
  if(window.playerSession && !isLiveMode) return;

  if(!_smoothPlaybackState.startedAt)_smoothPlaybackState.startedAt=Date.now();
  if(!_smoothPlaybackState.playingAt)_smoothPlaybackState.playingAt=Date.now();
}

function localSmoothTranscodeSrc(id,start=0,fallbackReason='smooth buffering fallback'){
  const params = new URLSearchParams();
  params.set('playbackType','media');
  params.set('smooth','1');
  if(fallbackReason)params.set('fallbackReason',fallbackReason);
  if(start > 0)params.set('start',Math.floor(start));
  appendSelectedAudioParams(params,'localSmoothTranscodeSrc');
  return `${API_BASE}/stream/${encodeURIComponent(id)}?${params.toString()}`;
}

function ftpSmoothTranscodeSrc(url,start=0,fallbackReason='smooth buffering fallback'){
  return ftpTranscodeSrc(url,start,fallbackReason,{smooth:true});
}

async function switchToSmoothPlaybackProfile(reason='buffering'){
  if(window.playerSession && !isLiveMode) return;

  if(_smoothPlaybackState.switching || _smoothPlaybackState.switched || isLiveMode)return false;
  if(_currentFtpPlaybackPlan?.heavyCompatHls)return false;
  const isFtp=!!_ftpStreamUrl;
  const isLocal=!isFtp && currentStreamId !== null && currentStreamId !== undefined;
  if(!isFtp && !isLocal)return false;
  _smoothPlaybackState.switching=true;
  _smoothPlaybackState.switched=true;
  const target=Math.max(0,playbackTime());
  const wasPlaying=!vid.paused || vid._svPlaybackShouldPlay;
  const fallbackReason='smooth buffering fallback';
  setCentralPlaybackLoading(true);
  try{
    if(isFtp){
      const plan=ftpStreamPlaybackPlan(_ftpStreamUrl,target,fallbackReason,{smooth:true});
      plan.smoothProfile=true;
      _currentFtpPlaybackPlan=plan;
      _ftpNeedsTranscode=true;
      _ftpCurrentTime=target;
      vid._sourceOffset=target;
      vid._sourceSeekRequired=true;
      vid._mediaSourceSeekRequired=true;
      mediaFixLog('switching FTP playback to smooth profile',{reason,target,url:_ftpStreamUrl});
      const attached=await attachPlayerSource(plan.src,plan.mode,{playbackType:'media',fallbackReason});
      if(!attached)throw new Error('smooth FTP stream unavailable');
    }else{
      const plan={ok:true,id:String(currentStreamId),mode:'stream',transport:'stream',src:localSmoothTranscodeSrc(currentStreamId,target,fallbackReason),duration:vid._apiDuration || vid._stableDuration || 0,smoothProfile:true};
      _currentPlaybackPlan=plan;
      vid._sourceOffset=target;
      vid._sourceSeekRequired=true;
      vid._mediaSourceSeekRequired=true;
      mediaFixLog('switching local playback to smooth profile',{reason,target,id:currentStreamId});
      const attached=await attachPlayerSource(plan.src,plan.mode,{playbackType:'media',fallbackReason});
      if(!attached)throw new Error('smooth local stream unavailable');
    }
    if(wasPlaying)svPlayVideo('smooth playback switch', {force:true}).catch(()=>{});
    return true;
  }catch(e){
    mediaFixLog('smooth playback switch failed',{reason,message:e.message});
    return false;
  }finally{
    _smoothPlaybackState.switching=false;
    setCentralPlaybackLoading(false);
  }
}

function noteSmoothPlaybackBuffering(eventName='waiting'){
  if(window.playerSession && !isLiveMode) return;

  if(isLiveMode || _smoothPlaybackState.switching || _smoothPlaybackState.switched)return;
  if(_currentFtpPlaybackPlan?.heavyCompatHls)return;
  if(vid.seeking || _ftpSeekPending || vid._audioSwitchPending)return;
  if(!_smoothPlaybackState.playingAt)return;
  const now=Date.now();
  const base=_smoothPlaybackState.playingAt || _smoothPlaybackState.startedAt || now;
  if(now-base > 60000)return;
  if(now-(_smoothPlaybackState.lastWaitingAt || 0) < 1500)return;
  _smoothPlaybackState.lastWaitingAt=now;
  _smoothPlaybackState.waitingCount+=1;
  mediaFixLog('smooth playback buffering sample',{eventName,count:_smoothPlaybackState.waitingCount,trigger:SV_SMOOTH_BUFFER_TRIGGER_COUNT,kind:_smoothPlaybackState.kind});
  if(_smoothPlaybackState.waitingCount >= SV_SMOOTH_BUFFER_TRIGGER_COUNT){
    switchToSmoothPlaybackProfile(eventName).catch(()=>{});
  }
}

function ftpHeavyStartupActive(){
  return _ftpHeavyMedia && _ftpHeavyStartupUntil > Date.now();
}

function noteFtpHeavyPlaybackStarted(){
  if(!_ftpHeavyMedia || _ftpHeavyPlaybackStarted)return;
  _ftpHeavyPlaybackStarted=true;
  _ftpHeavyStartupUntil=Date.now() + 10000;
}

function clearFtpPostStartMetadataSchedule(){
  if(_ftpPostStartMetadataTimer){
    clearTimeout(_ftpPostStartMetadataTimer);
    _ftpPostStartMetadataTimer=null;
  }
  if(_ftpPostStartPlayingHandler){
    vid.removeEventListener('playing',_ftpPostStartPlayingHandler);
    _ftpPostStartPlayingHandler=null;
  }
}

function resetFtpHeavyPlaybackState(){
  clearFtpPostStartMetadataSchedule();
  _ftpHeavyMedia=false;
  _ftpHeavyStartupUntil=0;
  _ftpHeavyPlaybackStarted=false;
  _ftpDurationLoadPromise=null;
  _ftpDurationLoadUrl='';
}

function runFtpPostStartMetadata(resolvedStreamUrl){
  if(_ftpStreamUrl !== resolvedStreamUrl)return;
  ensureFtpTrackOptionsLoaded();
  ensureFtpDurationLoaded(resolvedStreamUrl);
}

function ensureFtpDurationLoaded(resolvedStreamUrl){
  if(!resolvedStreamUrl || _ftpStreamUrl !== resolvedStreamUrl)return Promise.resolve();
  if(validDurationSeconds(_ftpDuration))return Promise.resolve(_ftpDuration);
  if(_ftpDurationLoadPromise && _ftpDurationLoadUrl === resolvedStreamUrl)return _ftpDurationLoadPromise;
  _ftpDurationLoadUrl=resolvedStreamUrl;
  _ftpDurationLoadPromise=loadFtpDuration(resolvedStreamUrl)
    .catch(()=>{})
    .finally(()=>{
      if(_ftpDurationLoadUrl === resolvedStreamUrl){
        _ftpDurationLoadPromise=null;
        _ftpDurationLoadUrl='';
      }
    });
  return _ftpDurationLoadPromise;
}

function ftpBufferedSecondsAhead(){
  const current=Number(vid.currentTime) || 0;
  try{
    for(let i=0;i<vid.buffered.length;i++){
      if(vid.buffered.start(i) <= current && vid.buffered.end(i) >= current){
        return Math.max(0,vid.buffered.end(i)-current);
      }
    }
  }catch(_){}
  return 0;
}

function scheduleFtpPostStartMetadata(resolvedStreamUrl){
  clearFtpPostStartMetadataSchedule();
  const queue=()=>{
    if(_ftpPostStartPlayingHandler){
      vid.removeEventListener('playing',_ftpPostStartPlayingHandler);
      _ftpPostStartPlayingHandler=null;
    }
    if(_ftpStreamUrl !== resolvedStreamUrl)return;
    ensureFtpDurationLoaded(resolvedStreamUrl);
    const delay=_ftpHeavyMedia ? 10000 : 500;
    const runWhenBuffered=()=>{
      _ftpPostStartMetadataTimer=null;
      if(_ftpStreamUrl !== resolvedStreamUrl)return;
      if(_ftpHeavyMedia && !vid.paused && ftpBufferedSecondsAhead() < 15){
        _ftpPostStartMetadataTimer=setTimeout(runWhenBuffered,5000);
        return;
      }
      const run=()=>runFtpPostStartMetadata(resolvedStreamUrl);
      if(_ftpHeavyMedia && typeof window.requestIdleCallback === 'function'){
        window.requestIdleCallback(run,{timeout:2000});
      }else{
        run();
      }
    };
    _ftpPostStartMetadataTimer=setTimeout(runWhenBuffered,delay);
  };
  if(_ftpHeavyMedia && !_ftpHeavyPlaybackStarted){
    _ftpPostStartPlayingHandler=queue;
    vid.addEventListener('playing',_ftpPostStartPlayingHandler,{once:true});
    return;
  }
  queue();
}

function ensureFtpTrackOptionsLoaded(options={}){
  if(window.playerSession && !isLiveMode) return;

  if(!_ftpStreamUrl)return Promise.resolve();
  const force=!!options.force;
  const hasLoadedTracks=availableAudio.length > 1 || availableSubs.length > 0;
  if(_ftpTrackLoadPromise && !force && (!_ftpTrackLoadFailed || hasLoadedTracks))return _ftpTrackLoadPromise;
  const subList = document.getElementById('subList');
  if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Loading subtitles...</div>`;
  _ftpTrackLoadFailed=false;
  const loadingUrl=_ftpStreamUrl;
  _ftpTrackLoadPromise = loadFtpTrackOptions(loadingUrl)
    .then(data=>{
      _ftpTrackLoadFailed=!data;
      if(!data && _ftpStreamUrl === loadingUrl)_ftpTrackLoadPromise=null;
      return data;
    })
    .catch(err=>{
      _ftpTrackLoadFailed=true;
      if(_ftpStreamUrl === loadingUrl)_ftpTrackLoadPromise=null;
      mediaFixLog('FTP metadata promise failed',{url:loadingUrl,message:err?.message || String(err)});
      return null;
    });
  return _ftpTrackLoadPromise;
}

async function playFtpMedia(streamUrl, name, year, playbackContext=null){
  // SV_PLAYER_SESSION_BOUNDARY: retired VOD pipeline.
  return window.StreamVaultPlayerView.start({kind:'remote',url:streamUrl,name,year});
}

async function ftpSeekTo(seconds){
  // SV_PLAYER_SESSION_BOUNDARY: retired VOD pipeline.
  return window.playerSession?.seekTo(arguments[0]);
}



function closePlayer(options={}){
  if(window.playerSession?.active) window.playerSession.close();

  const fromHistory=!!options.fromHistory;
  if(!fromHistory && !svDetailHistoryLock && history.state?.view === 'player'){
    if(svPlayerClosePending)return;
    svPlayerClosePending=true;
    history.back();
    return;
  }
  svPlayerClosePending=false;
  const returnState=options.returnState || svPlayerLaunchSnapshot || svPlayerReturnState;
  const returnsToModernModal=returnState?.source === 'media-modal';
  abortPlaybackRequestScope('player close');
  clearMediaStartupWatchdog();
  svStopLivePlaybackForMedia('player close');
  svActivePlaybackType='idle';
  svMediaPlayerState.playbackType='idle';
  svMediaPlayerState.audioLocked=false;
  svMediaPlayerState.serverAudioIndex=null;
  svMediaPlayerState.manifestAudioIndex=null;
  svMediaPlayerState.manualAudioIndex=null;
  svMediaPlayerState.sessionKey='';
  svMediaPlayerState.mediaType='';
  svMediaPlayerState.mediaId='';
  svMediaPlayerState.season=null;
  svMediaPlayerState.episode=null;
  svMediaPlayerState.sourceIdentity='';
  svMediaPlayerState.preferredAudioLanguage=null;
  svMediaPlayerState.preferredAudioReason='';
  svMediaPlayerState.audioSelectionReason='';
  svAudioSession.clear();
  svMediaPlayerState.selectedSourceUrl='';
  svMediaPlayerState.recoverySourceUrl='';
  svMediaPlayerState.fallbackReason='';
  clearInterval(vid._pi);clearTimeout(uiHideTimer);
  stopPlayerUiClock();
  if(playerProgressRaf){
    cancelAnimationFrame(playerProgressRaf);
    playerProgressRaf=0;
  }
  playerProgressPending=null;
  if(playerBufferedRaf){
    cancelAnimationFrame(playerBufferedRaf);
    playerBufferedRaf=0;
  }
  playerBufferedPending=null;
  if(subtitleOverlayRaf){
    cancelAnimationFrame(subtitleOverlayRaf);
    subtitleOverlayRaf=0;
  }
  if(playerPointerRaf){
    cancelAnimationFrame(playerPointerRaf);
    playerPointerRaf=0;
  }
  if(seekPreviewMoveRaf){
    cancelAnimationFrame(seekPreviewMoveRaf);
    seekPreviewMoveRaf=0;
  }
  seekPreviewMovePending=null;
  resetSeekPreview();
  resetSmoothPlaybackState('player close');
  playerHovering=false;
  svAbortPendingPlayRequest('player close');
  vid.pause();
  vid._durationToken = (vid._durationToken || 0) + 1;
  clearTimeout(vid._ftpFallbackTimer);
  vid._ftpFallbackTimer = null;
  clearTimeout(vid._localFallbackTimer);
  vid._localFallbackTimer = null;
  vid._sourceOffset=0;
  vid._sourceSeekRequired=false;
  vid._mediaSourceSeekRequired=false;
  vid._svPlaybackShouldPlay=false;
  vid._svAudioResetContext=null;
  vid._audioSwitchPending=false;
  vid._queuedAudioSwitchIdx=null;
  vid._audioSwitchToken=(vid._audioSwitchToken || 0) + 1;
  clearAudioLock();
  resetFtpHeavyPlaybackState();
  _ftpStreamUrl='';
  _ftpDuration=0;
  _ftpNeedsTranscode=false;
  _ftpTrackLoadPromise=null;
  _ftpSeekPending=false;
  vid._ftpFallbackStepsTried = new Set();
  vid._localFallbackStepsTried = new Set();
  _currentPlaybackPlan=null;
  _currentFtpPlaybackPlan=null;
  playerAttachedSourceKey='';
  playerSourceAttachToken += 1;
  exitMobileLandscapeMode();
  if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}
  isLiveMode=false;
  vid.src='';
  vid.querySelectorAll('track').forEach(t=>t.remove());
  clearSubtitleOverlay();
  document.getElementById('playerModal').classList.remove('open');
  setCentralPlaybackLoading(false);
  hidePlayerNotice();
  document.getElementById('playerLiveBadge').classList.remove('show');
  document.getElementById('progressWrap').classList.remove('live-mode');
  document.body.style.overflow='';
  closeAllDropdowns();
  closeAllSeriesDropdowns();
  hideSeriesPlayerBar();
  if(!returnsToModernModal){
    buildRows();
    if(currentShow)renderEpisodes(currentShow,currentSeason);
  }
  if(document.fullscreenElement)document.exitFullscreen?.();
  if(document.webkitFullscreenElement)document.webkitExitFullscreen?.();
  if(options.restore !== false){
    if(returnState?.source === 'media-modal')svRestoreModernMediaModal(returnState);
    else if(returnState?.view === 'detail')svRestoreDetailState(returnState);
    else if(returnState)svRestoreBrowseState(returnState);
    svPlayerReturnState=null;
    svPlayerReturnItem=null;
    svPlayerLaunchSnapshot=null;
    svPlayerLaunchItem=null;
  }
}

async function loadQualityOptions(id){
  let data={available:['auto','1080p','720p','480p','360p'],native:'auto'};
  try{
    const r=await fetch(`${API_BASE}/api/qualities/${id}`);
    if(r.ok){
      data=await r.json();
    }
  }catch(e){
    console.warn('[Quality] Load error:',e.message);
  }
  if(!document.getElementById('qualList'))return;
  document.getElementById('qualList').innerHTML=data.available.map(q=>`<div class="pd-item${q===currentQuality?' active':''}" onclick="setQuality('${q}')"><span>${q==='auto'?'Auto':q}${q===data.native?' <span class="pd-badge">Native</span>':''}</span><span class="check">✓</span></div>`).join('');
  if(document.getElementById('qualLabel'))document.getElementById('qualLabel').textContent=currentQuality==='auto'?'Auto':currentQuality;
}
function setQuality(q){
  if(window.playerSession && !isLiveMode) return;

  if(q===currentQuality){closeAllDropdowns();return;}
  if(!isMobilePlaybackClient() && q !== 'auto'){
    closeAllDropdowns();
    showToast('Desktop performance mode streams original quality only.');
    return;
  }
  currentQuality=q;
  document.getElementById('qualLabel').textContent=q==='auto'?'Auto':q;
  const t=playbackTime(),paused=vid.paused;
  const sourceSeek = !!vid._sourceSeekRequired;
  vid._sourceOffset = sourceSeek ? t : 0;
  vid.addEventListener('loadedmetadata',()=>{if(!sourceSeek)vid.currentTime=t;if(!paused)svPlayVideo('quality change').catch(()=>{});},{once:true});
  if(sourceSeek)sourceSeekTo(t);
  else {
    const src=streamUrlFor(currentStreamId, 0);
    validateMediaPlaybackSource(src, 'quality change', {localId:currentStreamId, mode:'direct', fallbackReason:'quality change'});
    attachPlayerSource(src,'direct', {playbackType:'media', fallbackReason:'quality change'});
  }
  document.querySelectorAll('#qualList .pd-item').forEach(el=>{el.classList.toggle('active',el.textContent.trim().startsWith(q==='auto'?'Auto':q));});
  closeAllDropdowns();showToast(`Quality: ${q==='auto'?'Auto':q}`);
}

async function loadSubtitleTracks(id){
  availableSubs=[];clearSubtitleOverlay();
  vid.querySelectorAll('track').forEach(t=>t.remove());
  let externalSubs = [];
  let probedEmbeddedSubs = [];
  try{
    const r=await fetch(`${API_BASE}/api/subtitles/${id}`);
    if(r.ok){
      const data=svNormalizeBackendUrls(await r.json());
      externalSubs=Array.isArray(data)?data:[];
    }
  }catch(e){
    console.warn('[Subtitles] Load error:',e.message);
  }
  try{
    const r=await fetch(`${API_BASE}/api/media-info/${id}`);
    if(r.ok){
      const data=svNormalizeBackendUrls(await r.json());
      const subtitleTracks=Array.isArray(data.subtitleTracks)?data.subtitleTracks:[];
      const sidecarTracks=Array.isArray(data.sidecarSubtitleTracks)?data.sidecarSubtitleTracks:[];
      externalSubs=dedupeSubtitleOptions([...externalSubs,...sidecarTracks]);
      probedEmbeddedSubs=subtitleTracks.map((track,i)=>({
        ...track,
        embedded:true,
        sourceIndex:track.index,
        streamIndex:track.streamIndex ?? track.index,
        src:`${API_BASE}/subtitles/${id}/embedded/${track.index}.vtt`,
        label:track.title || mediaLanguageLabel(track.language) || `Embedded ${i + 1}`,
        lang:track.language || 'en',
      }));
    }
  }catch(e){
    console.warn('[Subtitles] Embedded load error:',e.message);
  }
  const nativeEmbeddedSubs=isMobilePlaybackClient()?[]:desktopNativeSubtitleTracks();
  const embeddedSubs=dedupeSubtitleOptions([...probedEmbeddedSubs,...nativeEmbeddedSubs]);
  availableSubs=dedupeSubtitleOptions([...externalSubs,...embeddedSubs]).map((track,i)=>({
    ...track,
    src:svBackendUrl(track.src),
    index:i,
    label:subtitleTrackLabel(track,i)
  }));
  const list=document.getElementById('subList');
  if(!availableSubs.length){
    renderSubtitleTracks();
    return;
  }
  availableSubs.forEach((t,i)=>{
    if(t.nativeTrack || t.hls || !t.src)return;
    const el=document.createElement('track');
    el.kind='subtitles';
    el.label=subtitleTrackLabel(t,i);
    el.srclang=t.lang||'en';
    el.src=new URL(t.src,window.location.href).href;
    el.default=false;
    el.setAttribute('data-idx',String(i));
    bindSubtitleTrack(el);
    vid.appendChild(el);
  });
  requestAnimationFrame(()=>{trackListItems(vid.textTracks).forEach(track=>setTrackMode(track,false));updateSubtitleOverlay();});
  renderSubtitleTracks();
}

function setFtpSubtitle(idx){
  if(vid._subtitleSwitchPending){
    closeAllDropdowns();
    showToast('Subtitle switch already in progress');
    return;
  }
  vid._subtitleSwitchPending=true;
  const token=(vid._subtitleSwitchToken||0)+1;
  vid._subtitleSwitchToken=token;
  const sourceBefore=vid.currentSrc;
  currentSubIdx=Number.isInteger(idx)&&idx>=0&&idx<availableSubs.length?idx:-1;
  vid.querySelectorAll('track').forEach(track=>track.remove());
  trackListItems(vid.textTracks).forEach(track=>setTrackMode(track,false));
  updateSubtitleOverlay();
  if(currentSubIdx>=0){
    const sub=availableSubs[currentSubIdx]||{};
    const track=document.createElement('track');
    track.kind='subtitles';
    track.label=subtitleTrackLabel(sub,currentSubIdx);
    track.srclang=sub.language||sub.lang||'en';
    track.src=ftpSubtitleSrc(currentSubIdx);
    track.default=false;
    track.setAttribute('data-idx',String(currentSubIdx));
    bindSubtitleTrack(track);
    vid.appendChild(track);
    setTrackMode(track,true);
    setTimeout(()=>{setTrackMode(track,true);updateSubtitleOverlay();},100);
  }
  mediaFixLog('selected FTP subtitle',{
    idx:currentSubIdx,
    selected:currentSubIdx>=0?subtitleDebugSummary(availableSubs[currentSubIdx],currentSubIdx):null,
    src:currentSubIdx>=0?ftpSubtitleSrc(currentSubIdx):'',
    sourceUnchanged:sourceBefore===vid.currentSrc
  });
  renderSubtitleTracks();
  closeAllDropdowns();
  showToast(currentSubIdx===-1?'Subtitles off':availableSubs[currentSubIdx]?.label||'Subtitles on');
  playbackDebug('FTP subtitle switch',{idx:currentSubIdx,sourceUnchanged:sourceBefore===vid.currentSrc});
  setTimeout(()=>{if(token===vid._subtitleSwitchToken)vid._subtitleSwitchPending=false;},200);
}

function setSub(idx){
  if(window.playerSession?.active) { window.playerSession.setSubtitle(Number(arguments[0])); closeAllDropdowns(); return; }

  if(_ftpStreamUrl){
    setFtpSubtitle(idx);
    return;
  }
  if(vid._subtitleSwitchPending){
    closeAllDropdowns();
    showToast('Subtitle switch already in progress');
    return;
  }
  vid._subtitleSwitchPending=true;
  const token=(vid._subtitleSwitchToken||0)+1;
  vid._subtitleSwitchToken=token;
  const done=()=>setTimeout(()=>{if(token===vid._subtitleSwitchToken)vid._subtitleSwitchPending=false;},200);
  if(!isMobilePlaybackClient()){
    const sourceBefore=vid.currentSrc;
    currentSubIdx=Number.isInteger(idx)&&idx>=0&&idx<availableSubs.length?idx:-1;
    trackListItems(vid.textTracks).forEach(track=>setTrackMode(track,false));
    if(hlsInstance){
      hlsInstance.subtitleDisplay=false;
      hlsInstance.subtitleTrack=-1;
    }
    const selected=currentSubIdx>=0?availableSubs[currentSubIdx]:null;
    if(selected?.hls && hlsInstance){
      hlsInstance.subtitleTrack=selected.hlsIndex;
      hlsInstance.subtitleDisplay=true;
    }else if(selected){
      const textTrack=selected.nativeTrack || Array.from(vid.querySelectorAll('track')).find(el=>parseInt(el.getAttribute('data-idx'),10)===currentSubIdx)?.track;
      setTrackMode(textTrack,true);
    }
    updateSubtitleOverlay();
    renderSubtitleTracks();
    closeAllDropdowns();
    showToast(currentSubIdx===-1?'Subtitles off':selected?.label||'Subtitles on');
    playbackDebug('desktop native subtitle switch',{idx:currentSubIdx,sourceUnchanged:sourceBefore===vid.currentSrc});
    done();
    return;
  }
  currentSubIdx=idx;
  const tracks=Array.from(vid.querySelectorAll('track'));
  tracks.forEach(el=>setTrackMode(el,idx!==-1&&parseInt(el.getAttribute('data-idx'),10)===idx));
  if(idx!==-1){setTimeout(()=>{tracks.forEach(el=>setTrackMode(el,parseInt(el.getAttribute('data-idx'),10)===idx));updateSubtitleOverlay();},150);}
  else updateSubtitleOverlay();
  document.querySelectorAll('#subList .pd-item').forEach((el,ei)=>el.classList.toggle('active',idx===-1?ei===0:ei===idx+1));
  updateSubBtn();closeAllDropdowns();showToast(idx===-1?'Subtitles off':availableSubs[idx]?.label||'Subtitles on');
  done();
}
function updateSubBtn(){
  const on=currentSubIdx!==-1;
  const label=document.getElementById('subLabel');
  const btn=document.getElementById('subBtn');
  if(label)label.textContent=on?(availableSubs[currentSubIdx]?.label||'On'):'CC';
  if(btn){
    btn.classList.toggle('active',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
  }
}

const SPEEDS=[0.25,0.5,0.75,1,1.25,1.5,1.75,2];
function buildSpeedList(){
  updateSpeedBtn();
  refreshPlayerControlVisibility();
  document.getElementById('speedList').innerHTML=SPEEDS.map(s=>`<div class="pd-item${s===1?' active':''}" onclick="setSpeed(${s})"><span>${s===1?'Normal':s+'×'}</span><span class="check">✓</span></div>`).join('');
}
function setSpeed(s){
  if(window.playerSession?.active) { window.playerSession.setSpeed(Number(arguments[0])); closeAllDropdowns(); return; }

  currentSpeed=s;vid.playbackRate=s;
  updateSpeedBtn();
  refreshPlayerControlVisibility();
  document.getElementById('speedLabel').textContent=s===1?'1×':s+'×';
  document.querySelectorAll('#speedList .pd-item').forEach(el=>{const v=parseFloat(el.textContent);el.classList.toggle('active',v===s||(s===1&&el.textContent.includes('Normal')));});
  closeAllDropdowns();showToast(`Speed: ${s===1?'Normal':s+'×'}`);
}

function openDropdown(id,btn){
  if((id === 'audioDD' || id === 'subDD') && _ftpStreamUrl)ensureFtpTrackOptionsLoaded();
  if((id === 'audioDD' || id === 'subDD') && !_ftpStreamUrl)ensureLocalTrackOptionsLoaded();
  const menu=document.getElementById(id);
  if(!menu)return;
  const wasOpen=menu.classList.contains('open');
  closeAllDropdowns();
  if(wasOpen)return;
  showUI();
  menu.style.visibility='hidden';menu.style.display='block';menu.style.maxHeight='';
  const mh=menu.offsetHeight,mw=menu.offsetWidth;
  const fixedParent=menu.offsetParent;
  menu.style.display='';menu.style.visibility='';
  const r=btn.getBoundingClientRect();
  const margin=12,gap=12;
  const preferUp=id==='subDD' || id==='audioDD' || id==='speedDD' || r.top > window.innerHeight * 0.55;
  const above=Math.max(0,r.top-gap-margin);
  const below=Math.max(0,window.innerHeight-r.bottom-gap-margin);
  let maxH=mh;
  let top;
  if(preferUp || above >= below){
    maxH=above>0?Math.min(mh,above):Math.min(mh,window.innerHeight-margin*2);
    top=Math.max(margin,r.top-maxH-gap);
  }else{
    maxH=Math.min(mh,below || window.innerHeight-margin*2);
    top=Math.min(window.innerHeight-maxH-margin,r.bottom+gap);
  }
  let left=r.left+r.width/2-mw/2;left=Math.max(margin,Math.min(left,window.innerWidth-mw-margin));
  if(fixedParent && fixedParent !== document.body && fixedParent !== document.documentElement){
    const parentRect=fixedParent.getBoundingClientRect();
    top-=parentRect.top;
    left-=parentRect.left;
  }
  menu.style.maxHeight=Math.max(80,Math.min(maxH,window.innerHeight-margin*2))+'px';
  menu.style.top=top+'px';menu.style.left=left+'px';
  menu.classList.add('open');
  scheduleHideUI();
}
function closeAllDropdowns(){
  const hadOpen=!!document.querySelector('.player-dropdown.open');
  document.querySelectorAll('.player-dropdown').forEach(m=>{m.classList.remove('open');m.style.top=m.style.left=m.style.maxHeight='';});
  if(hadOpen)scheduleHideUI();
}
document.addEventListener('click',e=>{if(!e.target.closest('[onclick*="openDropdown"]')&&!e.target.closest('.player-dropdown'))closeAllDropdowns();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const playerOpen=document.getElementById('playerModal').classList.contains('open');
    const menusOpen=playerMenusOpen();
    closeAllDropdowns();
    closeAllSeriesDropdowns();
    if(playerOpen && menusOpen){showUI();return;}
    if(document.getElementById('playerModal').classList.contains('open')){closePlayer();return;}
    if(document.getElementById('seriesModal').classList.contains('open')){closeSeriesModal();return;}
    if(document.getElementById('searchOverlay').classList.contains('open')){closeSearchOverlay();return;}
  }
  if(document.getElementById('playerModal').classList.contains('open')){
    if(e.key===' '||e.key==='k'||e.key==='K'){e.preventDefault();togglePlay();}
    if(!isLiveMode){if(e.key==='ArrowRight')seekBy(10);if(e.key==='ArrowLeft')seekBy(-10);}
    if(e.key==='ArrowUp'){vid.volume=Math.min(1,vid.volume+.1);document.getElementById('volSlider').value=vid.volume;updateVolIcon();}
    if(e.key==='ArrowDown'){vid.volume=Math.max(0,vid.volume-.1);document.getElementById('volSlider').value=vid.volume;updateVolIcon();}
    if(e.key==='f'||e.key==='F')toggleFullscreen();
    if(e.key==='m'||e.key==='M')toggleMute();
    showUI();
  }
});

window.addEventListener('popstate', event=>{
  svDetailHistoryLock = true;
  try{
    const state = event.state || {};
    const playerOpen = document.getElementById('playerModal')?.classList.contains('open');
    if(playerOpen){
      const returnState=svPlayerLaunchSnapshot?.source === 'media-modal'
        ? svPlayerLaunchSnapshot
        : (state.view === 'detail' ? state : (state.returnTo || svPlayerReturnState));
      closePlayer({fromHistory:true,restore:true,returnState});
      return;
    }
    if(state.view === 'detail'){
      svRestoreDetailState(state);
      return;
    }
    document.getElementById('movieDetailModal')?.classList.remove('open');
    document.getElementById('seriesModal')?.classList.remove('open');
    const mediaModal=document.getElementById('mediaModal');
    mediaModal?.classList.add('hidden');
    mediaModal?.classList.remove('show');
    mediaModal?.setAttribute('aria-hidden','true');
    svPauseMediaModalPreview();
    currentMediaModalItem=null;
    currentDetailMovie=null;
    svPlayerReturnState=null;
    svPlayerReturnItem=null;
    svPlayerLaunchSnapshot=null;
    svPlayerLaunchItem=null;
    abortDetailRequestScope();
    setDetailPageScrollLock(false);
    svRestoreBrowseState(state);
  }finally{
    svDetailHistoryLock = false;
  }
});

function openSearchOverlay(){
  document.getElementById('searchOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  document.getElementById('bnSearch')?.classList.add('active');
  if(typeof updateGlobalSearchControls === 'function')updateGlobalSearchControls();
  setTimeout(()=>document.getElementById('searchInputMobile').focus(),80);
}
function closeSearchOverlay(silent=false){
  document.getElementById('searchOverlay').classList.remove('open');
  document.getElementById('searchInputMobile').value='';
  document.getElementById('mobileSearchGrid').innerHTML='';
  document.getElementById('mobileSearchLabel').textContent='';
  document.body.style.overflow='';
  if(!silent)document.getElementById('bnSearch')?.classList.remove('active');
  if(!silent && typeof clearGlobalSearch === 'function')clearGlobalSearch({focus:false});
  else if(typeof updateGlobalSearchControls === 'function')updateGlobalSearchControls();
}
function svLegacyHandleSearchUnused(q){
  const mobile=document.getElementById('searchOverlay').classList.contains('open');
  const mHits=movies.filter(m=>m.name.toLowerCase().includes(q.toLowerCase()));
  const sHits=series.filter(s=>s.name.toLowerCase().includes(q.toLowerCase()));
  const total=mHits.length+sHits.length;
  const cards=sHits.map(sCardHTML).join('')+mHits.map(m=>cardHTML(m)).join('');
  const empty='<div class="empty" style="grid-column:1/-1"><h2></h2><p>Nothing found</p></div>';
  if(mobile){
    if(!q.trim()){document.getElementById('mobileSearchGrid').innerHTML='';document.getElementById('mobileSearchLabel').textContent='';return;}
    document.getElementById('mobileSearchLabel').textContent=total?`${total} result${total>1?'s':''}`:' No results';
    document.getElementById('mobileSearchGrid').innerHTML=total?cards:empty;
  }else{
    const main=document.getElementById('mainSection'),sec=document.getElementById('searchSection'),hero=document.getElementById('hero');
    if(!q.trim()){sec.style.display='none';main.style.display='';if(hero)hero.style.display='';return;}
    main.style.display='none';if(hero)hero.style.display='none';sec.style.display='block';
    document.getElementById('searchLabel').textContent=total?`Results for "${q}" — ${total} title${total>1?'s':''}`:`No results for "${q}"`;
    document.getElementById('searchGrid').innerHTML=total?cards:'<div class="empty"><h2>Nothing found</h2></div>';
  }
}

function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function show(id){const el=document.getElementById(id);if(el){el.style.display='';setTimeout(()=>svUpdateCarouselControls(el),50);}}
function hide(id){const el=document.getElementById(id);if(el)el.style.display='none';}
function fmtTime(s){if(!s||isNaN(s))return'0:00';s=Math.floor(s);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`;}
function scrollToRow(id){goHome();setTimeout(()=>{const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},60);}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400);}

let svNavScrollRaf=0;
const svNav=document.getElementById('nav');
window.addEventListener('scroll',()=>{
  if(svNavScrollRaf)return;
  svNavScrollRaf=requestAnimationFrame(()=>{
    svNavScrollRaf=0;
    svNav?.classList.toggle('solid',scrollY>60);
  });
},{passive:true});

vid.removeAttribute('controls');
vid.controls=false;
try{vid.disablePictureInPicture=true;}catch(_){}

function mobileForceLandscape(){
  enterMobileLandscapeMode();
}

let _mpFiltered = [];
let _mpPage = 0;
const _mpPerPage = 30;
let _mpRendered = false;

function renderMoviesPage(){
  if(!movies.length) return;
  filterMoviesPage();
  _mpRendered = true;
}

let _svMoviesFilterTimer=0,_svSeriesFilterTimer=0;
function debounceMoviesPage(){
  clearTimeout(_svMoviesFilterTimer);
  _svMoviesFilterTimer=setTimeout(filterMoviesPage,_svWeakDevice?180:80);
}
function debounceSeriesPage(){
  clearTimeout(_svSeriesFilterTimer);
  _svSeriesFilterTimer=setTimeout(filterSeriesPage,_svWeakDevice?180:80);
}

function toggleFilterPanel(id){
  const wrap=document.getElementById(id);
  if(!wrap)return;
  const open=!wrap.classList.contains('filters-open');
  document.querySelectorAll('.movies-filters.filters-open').forEach(el=>{
    if(el!==wrap){
      el.classList.remove('filters-open');
      el.querySelector('.filter-toggle-btn')?.setAttribute('aria-expanded','false');
    }
  });
  wrap.classList.toggle('filters-open',open);
  wrap.querySelector('.filter-toggle-btn')?.setAttribute('aria-expanded',open?'true':'false');
}

function filterMoviesPage(){
  const q        = (document.getElementById('moviesSearchInput')?.value||'').trim().toLowerCase();
  const genre    = document.getElementById('moviesGenreFilter')?.value||'';
  const lang     = document.getElementById('moviesLangFilter')?.value||'';
  const yearRange= document.getElementById('moviesYearFilter')?.value||'';
  const minRating= document.getElementById('moviesRatingFilter')?.value||'';
  const publisher= document.getElementById('moviesPublisherFilter')?.value||'';
  const sort     = document.getElementById('moviesSortFilter')?.value||'default';

  const _pubKeywords = {
    disney:['disney','pixar','cinderella','pinocchio','bambi','dumbo','fantasia','aladdin','mulan','hercules','tarzan','moana','encanto','coco','frozen','tangled','brave','ratatouille','wall-e','inside out','soul','luca','turning red','elemental','the lion king','snow white','sleeping beauty','beauty and the beast','the little mermaid','101 dalmatians','the jungle book','peter pan','alice in wonderland'],
    marvel:['marvel','avengers','iron man','captain america','thor','hulk','black panther','spider-man','spider man','ant-man','ant man','doctor strange','guardians of the galaxy','black widow','hawkeye','wandavision','loki','falcon','eternals','shang-chi','moon knight','ms. marvel','she-hulk','deadpool','wolverine','x-men','fantastic four','venom','morbius','daredevil'],
    dc:['batman','superman','wonder woman','aquaman','flash','joker','shazam','suicide squad','birds of prey','green lantern','justice league','man of steel','batman v superman','the batman','black adam','blue beetle','supergirl','arrow','gotham'],
    universal:['jurassic','fast and furious','fast & furious','minions','despicable me','the mummy','halloween','purge','jason bourne','king kong','nope','get out','scarface','jaws','e.t.','back to the future','schindler','gladiator','a beautiful mind','cinderella man'],
    dreamworks:['shrek','kung fu panda','how to train your dragon','madagascar','bee movie','antz','prince of egypt','spirit','shark tale','over the hedge','megamind','puss in boots','croods','trolls','boss baby','abominable','bad guys'],
    netflix:['bright','bird box','extraction','the old guard','6 underground','project power','thunder force','army of the dead','red notice','don\'t look up','enola holmes','the kissing booth','to all the boys','marriage story','tick tick boom'],
    a24:['moonlight','everything everywhere','midsommar','hereditary','the witch','ex machina','uncut gems','the lighthouse','green room','lady bird','eighth grade','minari','past lives','saltburn','civil war','talk to me','pearl','beau is afraid','priscilla'],
    paramount:['mission impossible','mission: impossible','top gun','transformers','indiana jones','star trek','terminator','titanic','the godfather','scarface','apocalypse now','chinatown','forrest gump','braveheart','saving private ryan','interstellar','arrival','annihilation','a quiet place','smile'],
  };

  let list = movies.slice();

  if(q) list = list.filter(m=>(m.name||'').toLowerCase().includes(q) || (m.overview||'').toLowerCase().includes(q));
  if(genre){
    list = list.filter(m=>{
      if(!m.genre) return false;
      return m.genre.split(',').map(g=>g.trim().toLowerCase()).includes(genre.toLowerCase());
    });
  }
  if(lang){
    list = list.filter(m=>{
      if(!m.language) return false;
      return m.language.split(',').map(l=>l.trim().toLowerCase()).some(l=>l.includes(lang.toLowerCase()));
    });
  }
  if(yearRange){
    const [yMin, yMax] = yearRange.split('-').map(Number);
    list = list.filter(m=>{
      const y = parseInt((m.year||'0').replace(/[^0-9]/g,''));
      if(!y) return false;
      return y >= yMin && y <= yMax;
    });
  }
  if(minRating){
    const min = parseFloat(minRating);
    list = list.filter(m => m.rating && parseFloat(m.rating) >= min);
  }
  if(publisher && _pubKeywords[publisher]){
    const kws = _pubKeywords[publisher];
    list = list.filter(m => {
      const t = (m.name||'').toLowerCase();
      return kws.some(k => t.includes(k.toLowerCase()));
    });
  }
  if(sort==='rating-desc') list.sort((a,b)=>(parseFloat(b.rating||0))-(parseFloat(a.rating||0)));
  else if(sort==='year-desc') list.sort((a,b)=>parseInt(b.year||0)-parseInt(a.year||0));
  else if(sort==='year-asc')  list.sort((a,b)=>parseInt(a.year||0)-parseInt(b.year||0));
  else if(sort==='az') list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  else if(sort==='za') list.sort((a,b)=>(b.name||'').localeCompare(a.name||''));

  _mpFiltered = list;
  _mpPage = 0;
  document.getElementById('moviesCount').textContent =
    list.length === movies.length
      ? `${movies.length.toLocaleString()} movies`
      : `${list.length.toLocaleString()} of ${movies.length.toLocaleString()} movies`;
  renderMoviesChips({q,genre,lang,yearRange,minRating,publisher,sort});
  const grid = document.getElementById('moviesGrid');
  if(!list.length){
    grid.innerHTML = '<div class="movies-empty"><h2>No movies found</h2><p>Try different filters</p></div>';
    document.getElementById('moviesLoadMoreWrap').style.display='none';
    return;
  }
  grid.innerHTML = list.slice(0, _mpPerPage).map(m=>cardHTML(m)).join('');
  _mpPage = 1;
  document.getElementById('moviesLoadMoreWrap').style.display =
    list.length > _mpPerPage ? 'flex' : 'none';
}

function moviesLoadMore(){
  const start = _mpPage * _mpPerPage;
  const chunk = _mpFiltered.slice(start, start + _mpPerPage);
  if(!chunk.length) return;
  document.getElementById('moviesGrid').insertAdjacentHTML('beforeend', chunk.map(m=>cardHTML(m)).join(''));
  _mpPage++;
  if(_mpPage * _mpPerPage >= _mpFiltered.length){
    document.getElementById('moviesLoadMoreWrap').style.display='none';
  }
}

const _yearLabels = {'2024-2025':'2024–2025','2020-2023':'2020–2023','2015-2019':'2015–2019','2010-2014':'2010–2014','2000-2009':'2000s','1990-1999':'1990s','0-1989':'Before 1990'};
const _ratingLabels = {'8':'8.0+','7':'7.0+','6':'6.0+','5':'5.0+'};
const _pubLabels = {disney:'🏰 Disney/Pixar',marvel:'⚡ Marvel',dc:'🦇 DC/WB',universal:'🌍 Universal',dreamworks:'🎣 DreamWorks',netflix:'🔴 Netflix',a24:'🎬 A24',paramount:'⛰️ Paramount'};

function renderMoviesChips({q,genre,lang,yearRange,minRating,publisher,sort}){
  const chips = [];
  if(q) chips.push({label:`"${q}"`, clear:()=>{document.getElementById('moviesSearchInput').value='';filterMoviesPage();}});
  if(genre) chips.push({label:genre, clear:()=>{document.getElementById('moviesGenreFilter').value='';filterMoviesPage();}});
  if(lang) chips.push({label:lang, clear:()=>{document.getElementById('moviesLangFilter').value='';filterMoviesPage();}});
  if(yearRange) chips.push({label:_yearLabels[yearRange]||yearRange, clear:()=>{document.getElementById('moviesYearFilter').value='';filterMoviesPage();}});
  if(minRating) chips.push({label:`★${_ratingLabels[minRating]||minRating}`, clear:()=>{document.getElementById('moviesRatingFilter').value='';filterMoviesPage();}});
  if(publisher) chips.push({label:_pubLabels[publisher]||publisher, clear:()=>{document.getElementById('moviesPublisherFilter').value='';filterMoviesPage();}});
  if(sort&&sort!=='default') chips.push({label:document.getElementById('moviesSortFilter')?.selectedOptions[0]?.text||sort, clear:()=>{document.getElementById('moviesSortFilter').value='default';filterMoviesPage();}});
  const wrap = document.getElementById('moviesActiveFilters');
  wrap.innerHTML = chips.map((c,i)=>`<div class="filter-chip" onclick="_clearChip(${i})"><span>${esc(c.label)}</span><span class="filter-chip-x">×</span></div>`).join('');
  wrap._chips = chips;
}
function _clearChip(i){
  const wrap=document.getElementById('moviesActiveFilters');
  if(wrap._chips&&wrap._chips[i])wrap._chips[i].clear();
}

let _spFiltered = [];
let _spPage = 0;
const _spPerPage = 60;

function filterSeriesPage(){
  if(!series.length) return;
  const q        = (document.getElementById('seriesSearchInput')?.value||'').trim().toLowerCase();
  const genre    = document.getElementById('seriesGenreFilter')?.value||'';
  const lang     = document.getElementById('seriesLangFilter')?.value||'';
  const yearRange= document.getElementById('seriesYearFilter')?.value||'';
  const minRating= document.getElementById('seriesRatingFilter')?.value||'';
  const sort     = document.getElementById('seriesSortFilter')?.value||'default';

  let list = series.slice();

  if(q) list = list.filter(s=>(s.name||'').toLowerCase().includes(q)||(s.overview||'').toLowerCase().includes(q));
  if(genre){
    list = list.filter(s=>{
      if(!s.genre) return false;
      return s.genre.split(',').map(g=>g.trim().toLowerCase()).includes(genre.toLowerCase());
    });
  }
  if(lang){
    list = list.filter(s=>{
      if(!s.language) return false;
      return s.language.split(',').map(l=>l.trim().toLowerCase()).some(l=>l.includes(lang.toLowerCase()));
    });
  }
  if(yearRange){
    const [yMin, yMax] = yearRange.split('-').map(Number);
    list = list.filter(s=>{
      const y = parseInt((s.year||'0').replace(/[^0-9]/g,''));
      if(!y) return false;
      return y >= yMin && y <= yMax;
    });
  }
  if(minRating){
    const min = parseFloat(minRating);
    list = list.filter(s => s.rating && parseFloat(s.rating) >= min);
  }
  if(sort==='rating-desc') list.sort((a,b)=>(parseFloat(b.rating||0))-(parseFloat(a.rating||0)));
  else if(sort==='year-desc') list.sort((a,b)=>parseInt(b.year||0)-parseInt(a.year||0));
  else if(sort==='year-asc')  list.sort((a,b)=>parseInt(a.year||0)-parseInt(b.year||0));
  else if(sort==='az') list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  else if(sort==='za') list.sort((a,b)=>(b.name||'').localeCompare(a.name||''));

  _spFiltered = list;
  _spPage = 0;
  document.getElementById('seriesCount').textContent =
    list.length === series.length
      ? `${series.length.toLocaleString()} shows`
      : `${list.length.toLocaleString()} of ${series.length.toLocaleString()} shows`;
  renderSeriesChips({q,genre,lang,yearRange,minRating,sort});
  const grid = document.getElementById('seriesGrid');
  if(!list.length){
    grid.innerHTML = '<div class="movies-empty"><h2>No series found</h2><p>Try different filters</p></div>';
    document.getElementById('seriesLoadMoreWrap').style.display='none';
    return;
  }
  grid.innerHTML = list.slice(0, _spPerPage).map(s=>sCardHTML(s)).join('');
  _spPage = 1;
  document.getElementById('seriesLoadMoreWrap').style.display =
    list.length > _spPerPage ? 'flex' : 'none';
}

function seriesLoadMore(){
  const start = _spPage * _spPerPage;
  const chunk = _spFiltered.slice(start, start + _spPerPage);
  if(!chunk.length) return;
  document.getElementById('seriesGrid').insertAdjacentHTML('beforeend', chunk.map(s=>sCardHTML(s)).join(''));
  _spPage++;
  if(_spPage * _spPerPage >= _spFiltered.length){
    document.getElementById('seriesLoadMoreWrap').style.display='none';
  }
}

function renderSeriesChips({q,genre,lang,yearRange,minRating,sort}){
  const chips = [];
  if(q)        chips.push({label:`"${q}"`,      clear:()=>{document.getElementById('seriesSearchInput').value=''; filterSeriesPage();}});
  if(genre)    chips.push({label:genre,          clear:()=>{document.getElementById('seriesGenreFilter').value=''; filterSeriesPage();}});
  if(lang)     chips.push({label:lang,           clear:()=>{document.getElementById('seriesLangFilter').value='';  filterSeriesPage();}});
  if(yearRange)chips.push({label:_yearLabels[yearRange]||yearRange, clear:()=>{document.getElementById('seriesYearFilter').value=''; filterSeriesPage();}});
  if(minRating)chips.push({label:`★${_ratingLabels[minRating]||minRating}`, clear:()=>{document.getElementById('seriesRatingFilter').value=''; filterSeriesPage();}});
  if(sort&&sort!=='default') chips.push({label:document.getElementById('seriesSortFilter')?.selectedOptions[0]?.text||sort, clear:()=>{document.getElementById('seriesSortFilter').value='default'; filterSeriesPage();}});
  const wrap = document.getElementById('seriesActiveFilters');
  wrap.innerHTML = chips.map((c,i)=>`<div class="filter-chip" onclick="_clearSeriesChip(${i})"><span>${esc(c.label)}</span><span class="filter-chip-x">×</span></div>`).join('');
  wrap._chips = chips;
}
function _clearSeriesChip(i){
  const wrap=document.getElementById('seriesActiveFilters');
  if(wrap._chips&&wrap._chips[i])wrap._chips[i].clear();
}

function jsEsc(s=''){
  return esc(s).replace(/'/g,"\\'");
}

function svIntermediateSCardHTMLUnused(s){
  const seasons = s.seasons || {};
  const sc=s.seasonCount ?? Object.keys(seasons).length;
  const ep=s.episodeCount ?? Object.values(seasons).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0);
  const img=s.poster?`<img src="${esc(s.poster)}" alt="${esc(s.name)}" loading="lazy">`:`<div class="card-placeholder"><div class="icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="rgba(255,255,255,.2)"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></div><div class="pname">${esc(s.name)}</div></div>`;
  const detailKey = registerSeriesForDetail(s);
  return `<div class="card" role="button" tabindex="0" onclick="openSeriesDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSeriesDetail('${detailKey}')}">${img}<div class="series-badge">SERIES</div><div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(s.name)}</div><div class="card-meta">${s.rating?`<span class="card-rating">&#9733; ${esc(s.rating)}</span>`:''}<span>${sc}S &middot; ${ep}Ep</span></div></div></div>`;
}

function svIntermediateCardHTMLUnused(m, sp=false){
  const img=m.poster?`<img src="${esc(m.poster)}" alt="${esc(m.name)}" loading="lazy">`:`<div class="card-placeholder"><div class="icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="rgba(255,255,255,.2)"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg></div><div class="pname">${esc(m.name)}</div></div>`;
  const prog=watchProgress[m.id];
  const bar=sp&&prog?`<div class="card-progress"><div class="card-progress-fill" style="width:${Math.round(prog.progress*100)}%"></div></div>`:'';
  const isUnplayable = isMovieUnavailable(m);
  const detailKey = registerMovieForDetail(m);
  const unavailableOverlay = '';
  return `<div class="card" role="button" tabindex="0" onclick="openMovieDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMovieDetail('${detailKey}')}">${img}${unavailableOverlay}<div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(m.name)}</div><div class="card-meta">${m.rating?`<span class="card-rating">&#9733; ${esc(m.rating)}</span>`:''} ${m.year?`<span>${esc(m.year)}</span>`:''}</div></div>${bar}</div>`;
}

function mediaItemHasPlayableEpisode(item){
  return Object.values(item?.seasons || {}).some(eps=>
    Array.isArray(eps) && eps.some(ep=>!!ep && (ep.streamUrl || ep.streamId !== null && ep.streamId !== undefined))
  );
}

function isPlayableMediaItem(item){
  if(!item || item.streamAvailable === false || item.hasStream === false)return false;
  const id=String(item.id ?? '');
  const isSeries=!!(item._isSeries || item.type === 'series' || item.type === 'tv' || item.seasons);
  if(/^tmdb(?:_tv)?_/i.test(id) && !item.streamUrl && !item.hasStream && !mediaItemHasPlayableEpisode(item))return false;
  if(isSeries){
    return mediaItemHasPlayableEpisode(item)
      || item.hasStream === true
      || item.streamAvailable === true
      || (!!item.isFtp && !!(item.id ?? item.name));
  }
  return !!item.streamUrl
    || item.hasStream === true
    || item.streamAvailable === true
    || (!!item.isFtp && !!(item.id ?? item.name))
    || (item.id !== null && item.id !== undefined && !item.isTrending && !/^tmdb_/i.test(id));
}

function filterPlayableMediaItems(items=[]){
  return (Array.isArray(items) ? items : []).filter(isPlayableMediaItem);
}

function isMovieUnavailable(movie){
  return !isPlayableMediaItem(movie);
}

function movieIdentity(movie){
  return svStableMediaKey(movie, 'movie');
}

function saveMovieWatchlist(){
  try{localStorage.setItem('sv_movie_watchlist', JSON.stringify(movieWatchlist));}catch{}
}

function isMovieWatchlisted(movie){
  const id = movieIdentity(movie);
  return !!id && movieWatchlist.includes(id);
}

function toggleMovieWatchlistFromDetail(){
  if(!currentDetailMovie)return;
  const id = movieIdentity(currentDetailMovie);
  if(!id)return;
  if(movieWatchlist.includes(id)){
    movieWatchlist = movieWatchlist.filter(x=>x!==id);
    showToast('Removed from watchlist');
  }else{
    movieWatchlist.unshift(id);
    showToast('Added to watchlist');
  }
  saveMovieWatchlist();
  updateMovieWatchlistButtons();
  if(currentTab==='library')renderLibraryPage();
}

function updateMovieWatchlistButtons(){
  const active = isMovieWatchlisted(currentDetailMovie);
  const btn = document.getElementById('mdWatchlistBtn');
  const top = document.getElementById('mdWatchlistTopBtn');
  const label = active ? 'Remove from wishlist' : 'Add to wishlist';
  if(btn){
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v16z"/></svg>${active?'In Wishlist':'Wishlist'}`;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.classList.toggle('active', active);
  }
  if(top){
    top.classList.toggle('active', active);
    top.setAttribute('aria-label', label);
    top.setAttribute('title', label);
    top.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  updateMediaModalWishlistButton();
}

function seriesIdentity(show){
  return svStableMediaKey(show, 'tv');
}

function saveSeriesWatchlist(){
  try{localStorage.setItem('sv_series_watchlist', JSON.stringify(seriesWatchlist));}catch{}
}

function isSeriesWatchlisted(show){
  const id = seriesIdentity(show);
  return !!id && seriesWatchlist.includes(id);
}

function toggleSeriesWatchlistFromDetail(event){
  event?.stopPropagation?.();
  if(!currentShow)return;
  const id = seriesIdentity(currentShow);
  if(!id)return;
  if(seriesWatchlist.includes(id)){
    seriesWatchlist = seriesWatchlist.filter(x=>x!==id);
    showToast('Removed from watchlist');
  }else{
    seriesWatchlist.unshift(id);
    seriesWatchlist = [...new Set(seriesWatchlist)];
    showToast('Added to watchlist');
  }
  saveSeriesWatchlist();
  updateSeriesWatchlistButton();
  if(currentTab==='library')renderLibraryPage();
}

function updateSeriesWatchlistButton(){
  const active = isSeriesWatchlisted(currentShow);
  const btn = document.getElementById('smWatchlistTopBtn');
  const label = active ? 'Remove from wishlist' : 'Add to wishlist';
  if(btn){
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  updateMediaModalWishlistButton();
}

function inferQuality(movie, qualityData){
  if(qualityData?.native && qualityData.native !== 'unknown')return qualityData.native;
  const text = `${movie?.name||''} ${movie?.file||''} ${movie?.streamUrl||''}`;
  const match = text.match(/\b(2160p|4k|1080p|720p|480p|360p)\b/i);
  return match ? match[1].toUpperCase().replace('4K','4K') : 'Auto';
}

function cleanContainer(value){
  const v = String(value||'').split(',')[0].trim();
  if(!v || v === 'unknown')return 'Unknown';
  if(v === 'matroska')return 'MKV';
  if(v === 'mov')return 'MOV';
  if(v === 'mp4')return 'MP4';
  return v.toUpperCase();
}

function trackSummary(tracks, fallback){
  if(!Array.isArray(tracks)||!tracks.length)return fallback;
  const labels = tracks.slice(0,3).map(t=>{
    const lang = t.language && t.language !== 'und' ? t.language.toUpperCase() : '';
    const codec = t.codec ? t.codec.toUpperCase() : '';
    return [lang, codec].filter(Boolean).join(' ') || t.title || 'Track';
  });
  return labels.join(', ') + (tracks.length>3 ? ` +${tracks.length-3}` : '');
}

function metadataItem(label, value){
  if(value===undefined || value===null || value==='')return '';
  return `<div class="metadata-item"><div class="metadata-label">${esc(label)}</div><div class="metadata-value">${esc(value)}</div></div>`;
}

function noDataHTML(){
  return '<div class="detail-empty">No Data Available</div>';
}

function loadingHTML(){
  return '<div class="detail-empty">Loading...</div>';
}

function metadataGridFromItems(items){
  const html = (items || []).map(item => metadataItem(item.label, item.value)).join('');
  return html || noDataHTML();
}

function renderMetadataGrid(id, items){
  const el = document.getElementById(id);
  if(el)el.innerHTML = metadataGridFromItems(items);
}

function parseTmdbIdFromItem(item, type){
  if(item?.tmdbId)return String(item.tmdbId);
  const id = String(item?.id || '');
  if(type === 'tv'){
    const m = id.match(/^tmdb_tv_(\d+)$/);
    return m ? m[1] : '';
  }
  const m = id.match(/^tmdb_(\d+)$/);
  return m ? m[1] : '';
}

function cleanDisplayTitle(value){
  let raw = String(value || '').split(/[?#]/)[0].split(/[\\/]/).pop() || '';
  raw = raw
    .replace(/\.[a-z0-9]{2,5}$/i, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parenYear = raw.match(/[\(\[\{]\s*((?:19|20)\d{2})\s*(?:-\s*)?[\)\]\}]?/);
  if(parenYear)raw = raw.replace(parenYear[0], ' ');

  return raw
    .replace(/\bS\d{1,2}E\d{1,3}\b/ig, ' ')
    .replace(/\[[^\]]*\]|\([^\)]*(?:Hindi|English|Dual Audio|Audio|ESub|MSubs|WEBRip|BluRay|x264|x265|HEVC|AAC|NF|AMZN|HMAX|DSNP|WEB-DL|HDRip|BRRip)[^\)]*\)/ig, ' ')
    .replace(/\b(2160p|1080p|720p|540p|480p|4k|uhd|hdr|webrip|web-rip|webdl|web-dl|bluray|brrip|hdrip|hdtv|dvdrip|x264|x265|hevc|aac|dts|ddp?5\.1|5\.1|7\.1|nf|amzn|hmax|dsnp|itunes|mkv|mp4|mkvc|mkvcinemas|msmod|pahe|rarbg|yts|galaxyrg|esub|msubs|dual audio|multi audio|hindi|english|bengali|bangla)\b.*$/ig, ' ')
    .replace(/\b((?:19|20)\d{2})\b/g, ' ')
    .replace(/[^\p{L}\p{N}:'&!?, -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detailCacheKey(item, type){
  const rawTitle = item?.name || item?.title || item?.file || '';
  return [type, parseTmdbIdFromItem(item,type) || cleanDisplayTitle(rawTitle) || '', item?.year || ''].join('|');
}

async function fetchTitleDetails(item, type, options={}){
  const key = detailCacheKey(item, type);
  if(_titleDetailsCache.has(key))return _titleDetailsCache.get(key);

  const params = new URLSearchParams();
  const rawTitle = item?.name || item?.title || item?.file || '';
  const cleanTitle = cleanDisplayTitle(rawTitle);
  if(cleanTitle)params.set('title', cleanTitle);
  if(item?.year)params.set('year', item.year);

  const tmdbId = parseTmdbIdFromItem(item, type);
  if(tmdbId)params.set('tmdbId', tmdbId);

  const routeType = type === 'tv' || item?.type === 'tv' || item?.type === 'series' ? 'series' : 'movie';
  const routeId = encodeURIComponent(item?.tmdbId || item?.id || cleanTitle);
  const query = params.toString().replace(/\+/g, '%20');
  const url = `/api/details/${routeType}/${routeId}?${query}`;
  const r = await fetchWithTimeout(url, {signal:options.signal}, 8000);
  const data = r.ok ? svNormalizeBackendUrls(await r.json()) : null;

  const safe = data || { ok:false };
  if(safe.ok) _titleDetailsCache.set(key, safe);
  return safe;
}

function fetchWithTimeout(url, options={}, timeout=4500){
  const controller = new AbortController();
  const parentSignal = options.signal;
  const onParentAbort = ()=>controller.abort();
  if(parentSignal?.aborted)controller.abort();
  else parentSignal?.addEventListener?.('abort', onParentAbort, {once:true});
  const timer = setTimeout(()=>controller.abort(), timeout);
  return fetch(url, {...options, signal:controller.signal}).finally(()=>{
    clearTimeout(timer);
    parentSignal?.removeEventListener?.('abort', onParentAbort);
  });
}

function svMediaInfoCacheKey(url){
  return String(url || '');
}

function svTrimMediaInfoCaches(){
  while(svMediaInfoDataCache.size > 80)svMediaInfoDataCache.delete(svMediaInfoDataCache.keys().next().value);
  while(svMediaInfoPromiseCache.size > 40)svMediaInfoPromiseCache.delete(svMediaInfoPromiseCache.keys().next().value);
}

function svFetchMediaInfoData(url, timeout=9000){
  const key=svMediaInfoCacheKey(url);
  if(!key)return Promise.resolve(null);
  if(svMediaInfoDataCache.has(key))return Promise.resolve(svMediaInfoDataCache.get(key));
  if(svMediaInfoPromiseCache.has(key))return svMediaInfoPromiseCache.get(key);
  const promise=fetchWithTimeout(key, {
    cache:'no-store',
    headers:{'Cache-Control':'no-cache'}
  }, timeout)
    .then(async response=>{
      if(!response.ok)throw new Error(`metadata ${response.status}`);
      const data=await response.json();
      svMediaInfoDataCache.set(key,data);
      svTrimMediaInfoCaches();
      return data;
    })
    .finally(()=>svMediaInfoPromiseCache.delete(key));
  svMediaInfoPromiseCache.set(key,promise);
  svTrimMediaInfoCaches();
  return promise;
}

function svLocalAudioInfoUrl(id){
  return `${API_BASE}/api/media-info/${encodeURIComponent(id)}?playbackType=media`;
}

function svFtpAudioInfoUrl(streamUrl){
  const params=new URLSearchParams({
    url:String(streamUrl || ''),
    playbackType:'media'
  });
  return `${API_BASE}/api/ftp/media-info?${params.toString()}`;
}

function svPrewarmPlaybackMetadata(item){
  if(!item)return;
  const url=item.streamUrl
    ? svFtpAudioInfoUrl(item.streamUrl)
    : (item.streamId !== null && item.streamId !== undefined
      ? svLocalAudioInfoUrl(item.streamId)
      : (!item.isFtp && item.id !== null && item.id !== undefined ? svLocalAudioInfoUrl(item.id) : ''));
  if(!url)return;
  svFetchMediaInfoData(url, startupAudioTimeoutFor(item.streamUrl || item.file || item.name || '')).catch(()=>{});
}

function imageFallbackData(title='StreamVault'){
  const safeTitle = esc(String(title || 'StreamVault')).slice(0, 80);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#16181d"/><rect x="118" y="48" width="84" height="84" rx="42" fill="#2b3038"/><path d="M145 70v40l34-20z" fill="#f7f7f4"/><text x="160" y="154" text-anchor="middle" fill="#8b949e" font-family="Arial,sans-serif" font-size="16" font-weight="700">${safeTitle}</text></svg>`)}`;
}

function svStableMediaKey(item, type='movie'){
  const kind = type === 'tv' || item?.type === 'tv' || item?.type === 'series' || item?.seasons ? 'series' : 'movie';
  const id = item?.tmdbId || item?.id || item?.streamId || item?.streamUrl || item?.name || item?.title || '';
  const year = item?.year || '';
  return `${kind}:${String(id).trim()}:${String(year).trim()}`;
}

function svTrimMap(map, limit){
  while(map.size > limit)map.delete(map.keys().next().value);
}

function svModalArtworkMediaKey(item, type='movie'){
  const mediaType=type === 'tv' || item?.type === 'tv' || item?.type === 'series' || item?.seasons ? 'series' : 'movie';
  const identities=[
    ['id',item?.id],
    ['tmdb',item?.tmdbId],
    ['stream',item?.streamId],
    ['url',item?.streamUrl],
    ['file',item?.file || item?.filename]
  ];
  const match=identities.find(([,value])=>value !== undefined && value !== null && String(value).trim());
  if(match)return `${mediaType}:${match[0]}:${String(match[1]).trim()}`;
  const title=cleanDisplayTitle(item?.name || item?.title || 'untitled') || 'untitled';
  const year=String(item?.year || 'unknown').trim();
  const source=String(item?.category || item?.genre || mediaType).trim();
  return `${mediaType}:composite:${title}:${year}:${source}`;
}

function svModalArtworkCacheKey(item, type='movie', kind='backdrop'){
  return `${svModalArtworkMediaKey(item,type)}:${kind}`;
}

function svModalArtworkCacheGet(cache,key){
  if(!cache.has(key))return null;
  const value=cache.get(key);
  cache.delete(key);
  cache.set(key,value);
  return value;
}

function svModalArtworkCacheSet(cache,key,value){
  cache.delete(key);
  cache.set(key,value);
  svTrimMap(cache,SV_MODAL_ARTWORK_CACHE_LIMIT);
  return value;
}

function svModalArtworkEntries(item, type='movie', kind='backdrop'){
  const fallback=imageFallbackData(item?.name || item?.title || 'StreamVault');
  const landscape=[
    {src:item?.backdrop || '',sourceKind:'backdrop',priority:0},
    {src:item?.backdropUrl || item?.backdrop_url || '',sourceKind:'backdrop',priority:1},
    {src:item?.still || item?.stillUrl || '',sourceKind:'backdrop',priority:2}
  ];
  const portraits=[
    {src:item?.poster || '',sourceKind:'poster',priority:10},
    {src:item?.posterUrl || item?.poster_url || '',sourceKind:'poster',priority:11}
  ];
  const entries=kind === 'poster'
    ? [...portraits,...landscape,{src:fallback,sourceKind:'fallback',priority:99}]
    : [...landscape,...portraits,{src:fallback,sourceKind:'fallback',priority:99}];
  const seen=new Set();
  return entries.filter(entry=>{
    const src=String(entry.src || '').trim();
    if(!src || seen.has(src))return false;
    seen.add(src);
    entry.src=src;
    return true;
  });
}

function svModalTmdbUrl(src=''){
  const raw=String(src || '').trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.hostname.toLowerCase() !== 'image.tmdb.org')return null;
    if(!/^\/t\/p\/(?:original|w\d+)\//i.test(url.pathname))return null;
    return url;
  }catch(_){
    return null;
  }
}

function svModalHdArtworkUrl(src='', kind='backdrop', sourceKind=kind){
  const tmdb=svModalTmdbUrl(src);
  if(!tmdb)return String(src || '');
  const size=sourceKind === 'poster' ? 'w780' : 'w1280';
  tmdb.pathname=tmdb.pathname.replace(/\/t\/p\/(?:original|w\d+)\//i,`/t/p/${size}/`);
  tmdb.searchParams.set('sv-modal-hd','v2');
  return tmdb.toString();
}

function svModalArtworkUrlIdentity(src=''){
  const tmdb=svModalTmdbUrl(src);
  if(tmdb){
    return `${tmdb.hostname}${tmdb.pathname.replace(/\/t\/p\/(?:original|w\d+)\//i,'/t/p/size/')}`;
  }
  return String(src || '').split('#')[0].split('?')[0];
}

function svModalArtworkCandidates(item, type='movie', kind='backdrop'){
  return svModalArtworkEntries(item,type,kind)
    .map(entry=>({...entry,url:svModalHdArtworkUrl(entry.src,kind,entry.sourceKind)}));
}

function svResolveModalArtwork(item, type='movie', kind='backdrop'){
  const key=svModalArtworkCacheKey(item,type,kind);
  const verified=svModalArtworkCacheGet(svModalArtworkHdCache,key);
  if(verified)return verified.url;
  return svModalArtworkCandidates(item,type,kind)[0]?.url || '';
}

function svForgetDecodedArtwork(url){
  svModalArtworkDecodeCache.delete(url);
  svModalArtworkDimensionsCache.delete(url);
}

function svDecodeImage(url){
  if(!url)return Promise.resolve('');
  if(svModalArtworkDecodeCache.has(url))return svModalArtworkDecodeCache.get(url);
  const promise=new Promise(resolve=>{
    const img=new Image();
    img.decoding='async';
    img.onload=async ()=>{
      try{await img.decode?.();}catch(_){
        // A loaded image remains renderable even when decode() rejects.
      }
      const dimensions={
        width:Number(img.naturalWidth || img.width || 0),
        height:Number(img.naturalHeight || img.height || 0)
      };
      if(!dimensions.width || !dimensions.height){
        svForgetDecodedArtwork(url);
        resolve('');
        return;
      }
      svModalArtworkCacheSet(svModalArtworkDimensionsCache,url,dimensions);
      resolve(url);
    };
    img.onerror=()=>{
      svForgetDecodedArtwork(url);
      resolve('');
    };
    img.src=url;
  });
  svModalArtworkCacheSet(svModalArtworkDecodeCache,url,promise);
  return promise;
}

function svModalArtworkValidation(url, kind='backdrop', sourceKind=kind){
  const dimensions=svModalArtworkDimensionsCache.get(url);
  if(!dimensions || sourceKind === 'fallback')return {valid:false};
  const width=Number(dimensions.width || 0);
  const height=Number(dimensions.height || 0);
  const ratio=height ? width/height : 0;
  if(sourceKind === 'poster'){
    return {
      valid:width >= 650 && height > width,
      width,height,ratio,
      state:'portrait-fallback'
    };
  }
  return {
    valid:width >= 1000 && height >= 500 && width > height,
    width,height,ratio,
    state:'decoded-hd'
  };
}

function svModalArtworkIsHd(url, kind='backdrop', sourceKind=kind){
  return !!svModalArtworkValidation(url,kind,sourceKind).valid;
}

function svModalArtworkFailureKey(cacheKey,url){
  return `${cacheKey}:${url}`;
}

function svModalArtworkCanRetry(cacheKey,url,now=Date.now()){
  const failure=svModalArtworkFailureCache.get(svModalArtworkFailureKey(cacheKey,url));
  return !failure || now >= failure.retryAt;
}

function svModalArtworkRecordFailure(cacheKey,url,now=Date.now()){
  return svModalArtworkCacheSet(svModalArtworkFailureCache,svModalArtworkFailureKey(cacheKey,url),{
    failedAt:now,
    retryAt:now+SV_MODAL_ARTWORK_RETRY_COOLDOWN_MS
  });
}

function svModalArtworkClearFailure(cacheKey,url){
  svModalArtworkFailureCache.delete(svModalArtworkFailureKey(cacheKey,url));
}

async function svResolveVerifiedModalArtwork(item,type='movie',kind='backdrop'){
  const cacheKey=svModalArtworkCacheKey(item,type,kind);
  const candidates=svModalArtworkCandidates(item,type,kind);
  const cached=svModalArtworkCacheGet(svModalArtworkHdCache,cacheKey);
  const hasLandscape=candidates.some(candidate=>candidate.sourceKind === 'backdrop');
  if(cached && !(cached.sourceKind === 'poster' && hasLandscape))return cached;

  for(const candidate of candidates){
    if(candidate.sourceKind === 'fallback' || !svModalArtworkCanRetry(cacheKey,candidate.url))continue;
    const decoded=await svDecodeImage(candidate.url);
    if(!decoded){
      svModalArtworkRecordFailure(cacheKey,candidate.url);
      continue;
    }
    const validation=svModalArtworkValidation(decoded,kind,candidate.sourceKind);
    if(!validation.valid){
      svForgetDecodedArtwork(candidate.url);
      svModalArtworkRecordFailure(cacheKey,candidate.url);
      continue;
    }
    svModalArtworkClearFailure(cacheKey,candidate.url);
    return svModalArtworkCacheSet(svModalArtworkHdCache,cacheKey,{
      url:decoded,
      width:validation.width,
      height:validation.height,
      ratio:validation.ratio,
      sourceKind:candidate.sourceKind,
      state:kind === 'backdrop' && candidate.sourceKind === 'poster' ? 'portrait-fallback' : 'decoded-hd',
      verifiedAt:Date.now()
    });
  }
  return null;
}

function svModalArtworkPreviewEntry(item,type='movie',kind='backdrop'){
  const cacheKey=svModalArtworkCacheKey(item,type,kind);
  const candidates=svModalArtworkEntries(item,type,kind);
  if(kind === 'backdrop'){
    const pending=window.__svPendingModalArtworkPreview;
    const age=Date.now()-Number(pending?.capturedAt || 0);
    const identities=new Set(candidates.map(entry=>svModalArtworkUrlIdentity(entry.src)));
    if(pending?.url && age >= 0 && age < 1500 && identities.has(svModalArtworkUrlIdentity(pending.url))){
      return svModalArtworkCacheSet(svModalArtworkPreviewCache,cacheKey,{
        src:pending.url,
        sourceKind:'poster'
      });
    }
  }
  const cached=svModalArtworkCacheGet(svModalArtworkPreviewCache,cacheKey);
  if(cached)return cached;
  const immediate=candidates[0] || null;
  return immediate
    ? svModalArtworkCacheSet(svModalArtworkPreviewCache,cacheKey,{
        src:immediate.src,
        sourceKind:immediate.sourceKind
      })
    : null;
}

window.svCaptureModalArtworkPreview=function(src){
  const url=String(src || '').trim();
  if(!url)return;
  window.__svPendingModalArtworkPreview={url,capturedAt:Date.now()};
};

function svSetArtworkState(element,state,sourceKind=''){
  if(!element)return;
  element.dataset.artworkState=state;
  element.dataset.artworkSource=sourceKind;
}

function svSetModalImagePreview(img,entry,token){
  if(!img)return;
  const url=entry?.src || '';
  img.dataset.svArtworkToken=String(token);
  svSetArtworkState(img,'preview',entry?.sourceKind || '');
  img.classList.remove('is-hd');
  if(url){
    img.src=url;
    img.style.display='';
  }else{
    img.removeAttribute('src');
    img.style.display='none';
  }
}

function svSetModalImageFinal(img,verified,token){
  if(!img || !verified)return;
  img.dataset.svArtworkToken=String(token);
  svSetArtworkState(img,verified.state,verified.sourceKind);
  if(img.getAttribute('src') !== verified.url)img.src=verified.url;
  img.style.display='';
  requestAnimationFrame(()=>{
    if(token === svModalArtworkToken && img.dataset.svArtworkToken === String(token))img.classList.add('is-hd');
  });
}

async function svUpgradeModalImage(img,item,type='movie',kind='backdrop',token=0){
  if(!img)return;
  svSetArtworkState(img,'resolving',img.dataset.artworkSource || '');
  const verified=await svResolveVerifiedModalArtwork(item,type,kind);
  if(token !== svModalArtworkToken || img.dataset.svArtworkToken !== String(token) || !img.isConnected)return;
  if(!verified){
    svSetArtworkState(img,'failed-hd',img.dataset.artworkSource || '');
    return;
  }
  svSetModalImageFinal(img,verified,token);
}

function svApplyModalArtwork({item,type='movie',backdropId,posterId}){
  const token=++svModalArtworkToken;
  const backdrop=document.getElementById(backdropId);
  const poster=posterId ? document.getElementById(posterId) : null;
  const backdropKey=svModalArtworkCacheKey(item,type,'backdrop');
  const posterKey=svModalArtworkCacheKey(item,type,'poster');
  const backdropCached=svModalArtworkCacheGet(svModalArtworkHdCache,backdropKey);
  const posterCached=svModalArtworkCacheGet(svModalArtworkHdCache,posterKey);

  if(backdropCached)svSetModalImageFinal(backdrop,backdropCached,token);
  else svSetModalImagePreview(backdrop,svModalArtworkPreviewEntry(item,type,'backdrop'),token);
  if(posterCached)svSetModalImageFinal(poster,posterCached,token);
  else svSetModalImagePreview(poster,svModalArtworkPreviewEntry(item,type,'poster'),token);

  const hasNewLandscape=svModalArtworkEntries(item,type,'backdrop').some(entry=>entry.sourceKind === 'backdrop');
  if(!backdropCached || (backdropCached.sourceKind === 'poster' && hasNewLandscape)){
    svUpgradeModalImage(backdrop,item,type,'backdrop',token);
  }
  if(poster && !posterCached)svUpgradeModalImage(poster,item,type,'poster',token);
}

function svSetMediaModalArtwork(preview,artwork,token){
  if(!preview || !artwork)return;
  const url=artwork.url || artwork.src || '';
  const sourceKind=artwork.sourceKind || '';
  const state=artwork.state || 'preview';
  const hero=preview.closest?.('.hero-section');
  preview.dataset.svArtworkToken=String(token);
  svSetArtworkState(preview,state,sourceKind);
  preview.poster=url;
  preview.style.backgroundImage=url ? `url("${String(url).replace(/"/g,'%22')}")` : '';
  preview.classList.toggle('is-hd',state === 'decoded-hd' || state === 'portrait-fallback');
  hero?.classList.toggle('is-portrait-artwork',sourceKind === 'poster');
  if(hero){
    hero.style.setProperty('--sv-modal-artwork',url ? `url("${String(url).replace(/"/g,'%22')}")` : 'none');
  }
}

async function svUpgradeMediaModalArtwork(preview,item,type,modalItem,token){
  svSetArtworkState(preview,'resolving',preview.dataset.artworkSource || '');
  const verified=await svResolveVerifiedModalArtwork(item,type,'backdrop');
  const modal=document.getElementById('mediaModal');
  if(token !== svModalArtworkToken
    || preview?.dataset.svArtworkToken !== String(token)
    || currentMediaModalItem !== modalItem
    || modal?.classList.contains('hidden'))return;
  if(!verified){
    svSetArtworkState(preview,'failed-hd',preview.dataset.artworkSource || '');
    return;
  }
  svSetMediaModalArtwork(preview,verified,token);
}

function svApplyMediaModalArtwork(preview,item,type='movie',modalItem=item){
  const token=++svModalArtworkToken;
  const cacheKey=svModalArtworkCacheKey(item,type,'backdrop');
  const cached=svModalArtworkCacheGet(svModalArtworkHdCache,cacheKey);
  const hasNewLandscape=svModalArtworkEntries(item,type,'backdrop').some(entry=>entry.sourceKind === 'backdrop');
  if(cached)svSetMediaModalArtwork(preview,cached,token);
  else svSetMediaModalArtwork(preview,svModalArtworkPreviewEntry(item,type,'backdrop'),token);
  if(!cached || (cached.sourceKind === 'poster' && hasNewLandscape)){
    svUpgradeMediaModalArtwork(preview,item,type,modalItem,token);
  }
}

function svQueueModalArtworkPreload(item,type='movie'){
  if(!item)return;
  ['backdrop','poster'].forEach(kind=>{
    const key=svModalArtworkCacheKey(item,type,kind);
    if(svModalArtworkHdCache.has(key) || svModalPreloadQueue.some(task=>task.key === key))return;
    svModalPreloadQueue.push({item,type,kind,key});
  });
  svDrainModalArtworkPreloadQueue();
}

function svDrainModalArtworkPreloadQueue(){
  while(svModalPreloadActive < SV_MODAL_PRELOAD_LIMIT && svModalPreloadQueue.length){
    const task=svModalPreloadQueue.shift();
    svModalPreloadActive++;
    svResolveVerifiedModalArtwork(task.item,task.type,task.kind).finally(()=>{
      svModalPreloadActive--;
      svDrainModalArtworkPreloadQueue();
    });
  }
}

function svCurrentBrowseState(){
  const filterIds=[
    'moviesGenreFilter','moviesLangFilter','moviesYearFilter','moviesRatingFilter','moviesPublisherFilter','moviesSortFilter',
    'seriesGenreFilter','seriesLangFilter','seriesYearFilter','seriesRatingFilter','seriesSortFilter'
  ];
  return {
    tab:currentTab,
    scrollY:window.scrollY || 0,
    hash:location.hash || '',
    searchQuery:document.getElementById('searchInputDesktop')?.value
      || document.getElementById('searchInputMobile')?.value
      || '',
    searchOverlayOpen:!!document.getElementById('searchOverlay')?.classList.contains('open'),
    filters:Object.fromEntries(filterIds.map(id=>[id,document.getElementById(id)?.value ?? ''])),
  };
}

function svMediaModalVisible(){
  const modal=document.getElementById('mediaModal');
  return !!(modal && !modal.classList.contains('hidden') && modal.classList.contains('show') && currentMediaModalItem);
}

function svCurrentDetailState(type, extra={}){
  const modal = type === 'series' ? document.getElementById('seriesModal') : type === 'media' ? document.querySelector('#mediaModal .media-modal-content') : document.getElementById('movieDetailModal');
  if(type === 'media'){
    const browse=svCurrentBrowseState();
    const item=currentMediaModalItem;
    const mediaKey=svStableMediaKey(item,currentMediaModalType);
    const snapshot=svPlaybackSessionApi?.createModalNavigationSnapshot?.({
      mediaType:currentMediaModalType,
      mediaId:svPlaybackMediaId(item,mediaKey),
      mediaKey,
      selectedSeason:extra.season ?? currentSeason,
      selectedEpisode:extra.epIdx ?? svMediaModalSelectedEpisode,
      modalScrollTop:modal?.scrollTop || 0,
      browsingView:browse,
      browsingScrollTop:browse.scrollY,
      theme:document.documentElement.getAttribute('data-theme') || preferredTheme(),
      historyVersion:2,
    }) || {
      view:'detail',
      type:'media',
      source:'media-modal',
      mediaType:currentMediaModalType,
      mediaId:svPlaybackMediaId(item,mediaKey),
      mediaKey,
      key:mediaKey,
      selectedSeason:extra.season ?? currentSeason,
      selectedEpisode:extra.epIdx ?? svMediaModalSelectedEpisode,
      modalScrollTop:modal?.scrollTop || 0,
      browsingView:browse,
      browsingScrollTop:browse.scrollY,
      theme:document.documentElement.getAttribute('data-theme') || preferredTheme(),
      historyVersion:2,
    };
    return {
      ...snapshot,
      browse,
      season:snapshot.selectedSeason,
      epIdx:snapshot.selectedEpisode,
      scrollTop:snapshot.modalScrollTop,
    };
  }
  return {
    view:'detail',
    type,
    browse:svCurrentBrowseState(),
    key:type === 'series' ? seriesIdentity(currentShow) : type === 'media' ? svStableMediaKey(currentMediaModalItem,currentMediaModalType) : movieIdentity(currentDetailMovie),
    mediaType:type === 'media' ? currentMediaModalType : type,
    season:currentSeason,
    scrollTop:modal?.scrollTop || 0,
  };
}

function svPushDetailHistory(type){
  if(svDetailHistoryLock || !history?.pushState)return;
  const current = history.state || {};
  const next = svCurrentDetailState(type);
  if(current.view === 'detail' && current.key === next.key && current.type === next.type)return;
  history.pushState(next, '', location.href);
}

function svRememberPlaybackReturnState(type, extra={}){
  if(svPlayerLaunchSnapshot?.source === 'media-modal'){
    svPlayerReturnState=svPlayerLaunchSnapshot;
    svPlayerReturnItem=svPlayerLaunchItem;
    return;
  }
  if(svMediaModalVisible()){
    svCaptureModernModalLaunch(currentMediaModalItem,currentMediaModalType,extra);
  }else if(type === 'movie'){
    svPlayerLaunchSnapshot=null;
    svPlayerLaunchItem=null;
    svPlayerReturnState = svCurrentDetailState('movie');
    svPlayerReturnItem=currentDetailMovie;
  }
  else if(type === 'series'){
    svPlayerLaunchSnapshot=null;
    svPlayerLaunchItem=null;
    svPlayerReturnState = {...svCurrentDetailState('series'), ...extra};
  }
  else if(type === 'media'){
    svCaptureModernModalLaunch(currentMediaModalItem,currentMediaModalType,extra);
  }else{
    svPlayerLaunchSnapshot=null;
    svPlayerLaunchItem=null;
    svPlayerReturnState = {view:'browse', browse:svCurrentBrowseState()};
    svPlayerReturnItem=null;
  }
}

function svPushPlayerHistory(){
  if(svDetailHistoryLock || !history?.pushState)return;
  if(history.state?.view === 'player'){
    if(svPlayerReturnState && history.replaceState){
      history.replaceState({...history.state,returnTo:svPlayerReturnState},'',location.href);
    }
    return;
  }
  if(history.state?.view === 'detail' && svPlayerReturnState?.view === 'detail' && history.replaceState){
    history.replaceState(svPlayerReturnState,'',location.href);
  }
  history.pushState({view:'player', returnTo:svPlayerReturnState || {view:'browse', browse:svCurrentBrowseState()}}, '', location.href);
}

function svResolveMediaModalItem(state){
  const type=state?.mediaType === 'tv' ? 'tv' : 'movie';
  const key=String(state?.mediaKey || state?.key || '');
  if(svPlayerLaunchItem && svStableMediaKey(svPlayerLaunchItem,type) === key)return svPlayerLaunchItem;
  if(svPlayerReturnItem && svStableMediaKey(svPlayerReturnItem,type) === key)return svPlayerReturnItem;
  if(currentMediaModalItem && svStableMediaKey(currentMediaModalItem,type) === key)return currentMediaModalItem;
  const source=type === 'tv' ? series : movies;
  return source.find(item=>svStableMediaKey(item,type) === key)
    || source.find(item=>String(svPlaybackMediaId(item,'')) === String(state?.mediaId || ''))
    || null;
}

function svRestoreModernMediaModal(state){
  if(!state || state.source !== 'media-modal')return false;
  const item=svResolveMediaModalItem(state);
  if(!item){
    svRestoreBrowseState(state);
    return false;
  }
  const mediaType=state.mediaType === 'tv' ? 'tv' : 'movie';
  currentMediaModalItem=item;
  currentMediaModalType=mediaType;
  svPlayerReturnItem=item;
  document.getElementById('movieDetailModal')?.classList.remove('open');
  document.getElementById('seriesModal')?.classList.remove('open');
  document.body.classList.remove('detail-page-open','modal-open');
  if(mediaType === 'tv'){
    currentShow=item;
    currentSeason=Number(state.selectedSeason ?? state.season) || currentSeason || 1;
    svMediaModalSelectedEpisode=Number.isFinite(Number(state.selectedEpisode ?? state.epIdx))
      ? Number(state.selectedEpisode ?? state.epIdx)
      : null;
  }else{
    currentDetailMovie=item;
    svMediaModalSelectedEpisode=null;
  }
  const mediaModal=document.getElementById('mediaModal');
  mediaModal?.classList.remove('hidden');
  mediaModal?.classList.add('show');
  mediaModal?.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  if(state.theme)applyTheme(state.theme,false);
  populateModal(item);
  updateMediaModalWishlistButton();
  updateMovieWatchlistButtons();
  updateSeriesWatchlistButton();
  requestAnimationFrame(()=>{
    const content=document.querySelector('#mediaModal .media-modal-content');
    if(content)content.scrollTop=Number(state.modalScrollTop ?? state.scrollTop) || 0;
  });
  return true;
}

function svRestoreBrowseState(state={}){
  const browse=state.browsingView || state.browse || {};
  if(browse.tab && browse.tab !== currentTab)switchTab(browse.tab);
  for(const [id,value] of Object.entries(browse.filters || {})){
    const control=document.getElementById(id);
    if(control)control.value=value;
  }
  if(browse.tab === 'movies-browse')filterMoviesPage();
  if(browse.tab === 'series')filterSeriesPage();
  const searchInput=document.getElementById('searchInputDesktop') || document.getElementById('searchInputMobile');
  if(searchInput && typeof browse.searchQuery === 'string')searchInput.value=browse.searchQuery;
  requestAnimationFrame(()=>window.scrollTo(0,Number(state.browsingScrollTop ?? browse.scrollY)||0));
}

function svRestoreDetailState(state){
  if(!state || state.view !== 'detail')return false;
  const restoreScroll = ()=>{
    const modal = state.type === 'series' ? document.getElementById('seriesModal') : state.type === 'media' ? document.querySelector('#mediaModal .media-modal-content') : document.getElementById('movieDetailModal');
    if(modal)modal.scrollTop = Number(state.modalScrollTop ?? state.scrollTop) || 0;
  };
  if(state.source === 'media-modal' || state.type === 'media'){
    return svRestoreModernMediaModal(state);
  }
  if(state.type === 'movie' && currentDetailMovie){
    document.getElementById('movieDetailModal')?.classList.add('open');
    setDetailPageScrollLock(true);
    requestAnimationFrame(restoreScroll);
    return true;
  }
  if(state.type === 'series' && currentShow){
    document.getElementById('seriesModal')?.classList.add('open');
    if(state.season && currentSeason !== state.season){
      currentSeason = state.season;
      renderEpisodes(currentShow,currentSeason);
    }
    setDetailPageScrollLock(true);
    requestAnimationFrame(restoreScroll);
    return true;
  }
  svRestoreBrowseState(state);
  return false;
}

function splitDetailGenres(value){
  return String(value || '').split(/[,/|]/).map(g=>g.trim().toLowerCase()).filter(Boolean);
}

function localSimilarItems(item, type){
  const genres = splitDetailGenres(item?.genre);
  const source = filterPlayableMediaItems(type === 'tv' ? series : movies);
  const currentId = String(type === 'tv' ? (item?.id || item?.name || '') : movieIdentity(item || {}));
  const year = Number(String(item?.year || '').match(/(?:19|20)\d{2}/)?.[0] || 0);
  const category = String(item?.category || '').trim().toLowerCase();
  const language = String(item?.language || '').trim().toLowerCase();
  const scored = source
    .filter(other=>{
      const otherId = String(type === 'tv' ? (other.id || other.name || '') : movieIdentity(other));
      return otherId !== currentId;
    })
    .map(other=>{
      const otherGenres = splitDetailGenres(other.genre);
      const otherYear = Number(String(other.year || '').match(/(?:19|20)\d{2}/)?.[0] || 0);
      let score = genres.length ? otherGenres.filter(g=>genres.some(seed=>g.includes(seed)||seed.includes(g))).length * 4 : 0;
      if(category && String(other.category || '').trim().toLowerCase() === category)score += 3;
      if(language && String(other.language || '').trim().toLowerCase() === language)score += 2;
      if(year && otherYear && Math.abs(year - otherYear) <= 5)score += 2;
      if(other.poster)score += 0.5;
      return {other, score};
    })
    .filter(x=>x.score >= 4)
    .sort((a,b)=>b.score-a.score || (parseFloat(b.other.rating||0)-parseFloat(a.other.rating||0)))
    .slice(0,16)
    .map(x=>x.other);
  return scored;
}

function localDirectorItems(item, type){
  const director = String(item?.director || '').trim().toLowerCase();
  if(!director)return [];
  return filterPlayableMediaItems(movies)
    .filter(m=>m !== item && String(m.director || '').trim().toLowerCase() === director)
    .slice(0,18);
}

function localTitleDetails(item, type){
  const rating = item?.rating ? [{
    source:'Catalog',
    value:`${item.rating}/10`,
    subvalue:'Local cache',
    available:true,
  }] : [];
  const companies = Array.isArray(item?.productionCompanies)
    ? item.productionCompanies.map((name,i)=>typeof name === 'string' ? {id:i,name,logo:null} : name).filter(c=>c?.name)
    : [];
  return {
    ok:true,
    localOnly:true,
    type,
    title:item?.name || '',
    overview:item?.overview || '',
    poster:item?.poster || '',
    backdrop:item?.backdrop || item?.poster || '',
    year:item?.year || '',
    rating:item?.rating || '',
    runtime:item?.runtime || '',
    genres:item?.genre || '',
    language:item?.language || '',
    ratings:rating,
    trailers:Array.isArray(item?.trailers) ? item.trailers : [],
    cast:Array.isArray(item?.cast) ? item.cast : [],
    crew:Array.isArray(item?.crew) ? item.crew : [],
    productionCompanies:companies,
    similar:localSimilarItems(item, type),
    moreByDirector:localDirectorItems(item, type),
    about:[],
  };
}

function setOnlinePlaceholders(prefix){
  ['SimilarTrack'].forEach(suffix=>{
    const el = document.getElementById(prefix + suffix);
    if(el)el.innerHTML = loadingHTML();
  });
}

function renderRatings(id, ratings){
  const el = document.getElementById(id);
  if(!el)return;
  const availableRatings = (Array.isArray(ratings) ? ratings : []).filter(r=>r && r.available && r.value && r.value !== 'No Data Available');
  if(!availableRatings.length){
    el.innerHTML = noDataHTML();
    return;
  }
  el.innerHTML = availableRatings.map(r=>{
    const unavailable = !r.available || !r.value || r.value === 'No Data Available';
    const inner = `
      <div class="rating-source">${esc(r.source || 'Rating')}</div>
      <div class="rating-value">${esc(r.value || 'No Data Available')}</div>
      <div class="rating-subvalue">${esc(r.subvalue || '')}</div>
    `;
    const card = `<div class="rating-card${unavailable?' unavailable':''}">${inner}</div>`;
    return r.url ? `<a class="rating-card${unavailable?' unavailable':''}" href="${esc(r.url)}" target="_blank" rel="noopener">${inner}</a>` : card;
  }).join('');
}

function formatPublishedDate(value){
  if(!value)return '';
  const d = new Date(value);
  if(Number.isNaN(d.getTime()))return String(value).slice(0,10);
  return d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
}

function renderTrailers(id, trailers){
  const el = document.getElementById(id);
  if(!el)return;
  if(!Array.isArray(trailers) || !trailers.length){
    el.innerHTML = noDataHTML();
    return;
  }
  el.innerHTML = trailers.map(t=>{
    const date = formatPublishedDate(t.publishedAt);
    const meta = `${t.type || 'Video'} via YouTube${date ? ' - ' + date : ''}`;
    const key = t.key || String(t.url || '').match(/[?&]v=([^&]+)/)?.[1] || '';
    const thumb = key ? `https://img.youtube.com/vi/${key}/hqdefault.jpg` : (t.thumbnail || '');
    const fallbackThumb = key ? `https://img.youtube.com/vi/${key}/mqdefault.jpg` : '';
    const href = t.url || (key ? `https://www.youtube.com/watch?v=${key}` : '#');
    return `
    <div class="trailer-card">
      <a class="trailer-thumb${thumb ? '' : ' no-image'}" href="${esc(href)}" target="_blank" rel="noopener">
        ${thumb ? `<img src="${esc(thumb)}" alt="${esc(t.name || 'Trailer')}" loading="lazy" data-fallback="${esc(fallbackThumb)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.parentElement.classList.add('no-image');this.remove();}">` : ''}
        <div class="trailer-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      </a>
      <div class="trailer-title">${esc(t.name || 'Trailer')}</div>
      <div class="trailer-meta">${esc(meta)}</div>
    </div>
  `;
  }).join('');
}

function personPlaceholder(){
  return '<svg viewBox="0 0 24 24"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.67-10 5v3h20v-3c0-3.33-6.69-5-10-5z"/></svg>';
}

function renderPeople(id, people){
  const el = document.getElementById(id);
  if(!el)return;
  if(!Array.isArray(people) || !people.length){
    el.innerHTML = noDataHTML();
    return;
  }
  el.innerHTML = people.map(p=>`
    <div class="person-card">
      <div class="person-photo">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name || '')}" loading="lazy">`:personPlaceholder()}</div>
      <div class="person-name">${esc(p.name || 'Unknown')}</div>
      <div class="person-role">${esc(p.role || '')}</div>
    </div>
  `).join('');
}

function renderCompanies(id, companies){
  const el = document.getElementById(id);
  if(!el)return;
  if(!Array.isArray(companies) || !companies.length){
    el.innerHTML = noDataHTML();
    return;
  }
  el.innerHTML = companies.map(c=>{
    const initials = String(c.name || '?').split(/\s+/).map(w=>w[0]).join('').slice(0,3).toUpperCase();
    return `
      <div class="company-card">
        <div class="company-logo">${c.logo?`<img src="${esc(c.logo)}" alt="${esc(c.name || '')}" loading="lazy">`:`<div class="company-logo-placeholder">${esc(initials)}</div>`}</div>
        <div class="company-name">${esc(c.name || 'Unknown')}</div>
      </div>
    `;
  }).join('');
}

function renderMediaCards(id, items){
  const el = document.getElementById(id);
  if(!el)return;
  const limit = window.innerWidth < 760 ? 8 : 16;
  const visibleItems = filterPlayableMediaItems(items).slice(0, limit);
  const section=el.closest('.detail-section,.sm-related');
  if(!visibleItems.length){
    el.innerHTML = '';
    if(section)section.style.display='none';
    return;
  }
  if(section)section.style.display='';
  el.innerHTML = visibleItems.map(item => (item.type === 'tv' || item.seasons) ? sCardHTML(item) : cardHTML(item)).join('');
}

function arrayOrEmpty(value){
  return Array.isArray(value) ? value : [];
}

function firstNonEmptyArray(...arrays){
  return arrays.find(arr=>Array.isArray(arr) && arr.length) || [];
}

function renderOnlineSections(prefix, details, type, item){
  const sourceItem = item || (prefix === 'sm' ? currentShow : currentDetailMovie);
  const local = sourceItem ? localTitleDetails(sourceItem, type) : {};
  const finalDetails = details && details.ok ? details : local;

  const related=[
    ...arrayOrEmpty(finalDetails.similar),
    ...arrayOrEmpty(local.similar)
  ];
  const seen=new Set();
  const playable=filterPlayableMediaItems(related).filter(candidate=>{
    const key=String(candidate.tmdbId || candidate.id || candidate.streamUrl || candidate.name || '').toLowerCase();
    if(!key || seen.has(key))return false;
    seen.add(key);
    return true;
  });
  renderMediaCards(prefix + 'SimilarTrack', playable);
}

function mergeTitleDetails(item, details){
  if(!item || !details || !details.ok)return;
  item.tmdbId = details.tmdbId || item.tmdbId;
  item.poster = details.poster || item.poster || '';
  item.backdrop = details.backdrop || item.backdrop || '';
  item.overview = item.overview || details.overview || '';
  item.year = item.year || details.year || '';
  item.rating = item.rating || details.rating || '';
  item.runtime = item.runtime || details.runtime || '';
  item.genre = item.genre || details.genres || '';
  item.language = item.language || details.language || '';
  item.streamUrl = item.streamUrl || details.streamUrl || '';
  item.isFtp = item.isFtp || !!details.isFtp;
  if(details.streamAvailable !== undefined)item.streamAvailable = details.streamAvailable;
}

function renderMovieAbout(movie, details){
  if(details?.about?.length){
    renderMetadataGrid('mdAboutGrid', details.about);
    return;
  }
  const companies = Array.isArray(movie.productionCompanies) ? movie.productionCompanies.slice(0,3).join(', ') : '';
  renderMetadataGrid('mdAboutGrid', [
    {label:'Year', value: movie.year || 'Unknown'},
    {label:'Runtime', value: movie.runtime || 'Unknown'},
    {label:'Rating', value: movie.rating ? `${movie.rating}/10` : 'Unrated'},
    {label:'Genres', value: movie.genre || 'Unknown'},
    {label:'Language', value: movie.language || 'Unknown'},
    {label:'Production', value: companies || 'Unavailable'},
  ]);
}

async function renderMovieMediaInfo(movie){
  const grid = document.getElementById('mdMediaGrid');
  if(!grid)return;
  if(isMovieUnavailable(movie)){
    grid.innerHTML = noDataHTML();
    return;
  }
  const source = movie.isFtp ? 'FTP source' : 'Local server';
  const initial = [
    metadataItem('Quality', inferQuality(movie)),
    metadataItem('Runtime', movie.runtime || 'Probing'),
    metadataItem('Source', source),
    metadataItem('Format', movie.streamUrl ? movie.streamUrl.split('?')[0].split('.').pop()?.toUpperCase() : 'Auto'),
  ].join('');
  grid.innerHTML = initial;
  try{
    let info = null;
    if(movie.isFtp && movie.streamUrl){
      info = await svFetchMediaInfoData(svFtpAudioInfoUrl(movie.streamUrl), startupAudioTimeoutFor(movie.streamUrl));
    }else if(movie.id !== undefined && movie.id !== null && !String(movie.id).startsWith('tmdb_')){
      info = await svFetchMediaInfoData(svLocalAudioInfoUrl(movie.id), startupAudioTimeoutFor(movie.file || movie.name));
    }
    if(!info || currentDetailMovie !== movie)return;
    grid.innerHTML = [
      metadataItem('Quality', inferQuality(movie)),
      metadataItem('Runtime', info?.duration ? fmtTime(info.duration) : (movie.runtime || 'Unknown')),
      metadataItem('Format', movie.streamUrl ? movie.streamUrl.split('?')[0].split('.').pop()?.toUpperCase() : cleanContainer(info?.container)),
      metadataItem('Video', info?.videoCodec ? info.videoCodec.toUpperCase() : 'Auto'),
      metadataItem('Audio', trackSummary(info?.audioTracks, 'Default')),
      metadataItem('Source', source),
    ].join('');
  }catch(e){
    console.warn('[Detail] Media info unavailable:', e.message);
  }
}

async function loadMovieOnlineDetails(movie, token, scope){
  try{
    const details = await fetchTitleDetails(movie, movie.type === 'tv' ? 'tv' : 'movie', {signal:scope?.signal});
    if(token !== _titleDetailsToken || currentDetailMovie !== movie || !isCurrentDetailScope(scope))return;
    mergeTitleDetails(movie, details);
    renderOnlineSections('md', details || {}, movie.type === 'tv' ? 'tv' : 'movie', movie);
    renderMovieAbout(movie, details);
    const overviewEl = document.getElementById('mdOverview');
    if(details?.overview && (!overviewEl.textContent.trim() || overviewEl.textContent.includes('No overview is available'))){
      overviewEl.textContent = details.overview;
      overviewEl.classList.add('is-collapsed');
      const showMoreBtn = document.getElementById('mdShowMoreBtn');
      showMoreBtn.textContent = 'Show More';
      showMoreBtn.style.display = details.overview.length > 220 ? '' : 'none';
    }
    if(details?.poster || details?.backdrop)svApplyModalArtwork({item:movie,type:'movie',backdropId:'mdBackdrop',posterId:'mdPoster'});
  }catch(e){
    if(e?.name === 'AbortError')return;
    console.warn('[Detail] Online details unavailable:', e.message);
    renderOnlineSections('md', localTitleDetails(movie, movie.type === 'tv' ? 'tv' : 'movie'), movie.type === 'tv' ? 'tv' : 'movie', movie);
  }
}

function openMovieDetail(key){
  const movie = _movieDetailRegistry.get(key);
  if(!movie)return;
  if(window.innerWidth > 768){
    openMediaModal(movie, movie.type === 'tv' ? 'tv' : 'movie');
    return;
  }
  const scope=beginDetailRequestScope('movie detail');
  currentDetailMovie = movie;
  const modal = document.getElementById('movieDetailModal');
  svApplyModalArtwork({item:movie,type:'movie',backdropId:'mdBackdrop',posterId:'mdPoster'});
  document.getElementById('mdTitle').textContent = movie.name || 'Untitled';
  document.getElementById('mdKicker').textContent = movie.type === 'tv' ? 'Series' : 'Movie';
  const meta = [];
  if(movie.rating)meta.push(`<span class="detail-rating">&#9733; ${esc(movie.rating)}</span>`);
  if(movie.year)meta.push(esc(movie.year));
  if(movie.runtime)meta.push(esc(movie.runtime));
  if(movie.genre)meta.push(esc(movie.genre.split(',').slice(0,2).join(' / ')));
  document.getElementById('mdMeta').innerHTML = meta.join(' <span class="sm-dot"></span> ');
  const overview = document.getElementById('mdOverview');
  overview.textContent = movie.overview || 'No overview is available for this title yet.';
  overview.classList.add('is-collapsed');
  document.getElementById('mdShowMoreBtn').textContent = 'Show More';
  document.getElementById('mdShowMoreBtn').style.display = (movie.overview || '').length > 220 ? '' : 'none';
  const watchBtn = document.getElementById('mdWatchBtn');
  const unavailable = isMovieUnavailable(movie);
  watchBtn.disabled = unavailable;
  watchBtn.innerHTML = unavailable
    ? '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v6h-2V7h2zm0 8v2h-2v-2h2z"/></svg>Unavailable'
    : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Watch';
  watchBtn.onclick = unavailable ? ()=>showToast('This title is unavailable') : ()=>playMovieFromDetail();
  const downloadBtn = document.getElementById('mdDownloadBtn');
  if(downloadBtn){
    downloadBtn.disabled = unavailable;
    downloadBtn.style.display = unavailable ? 'none' : '';
    downloadBtn.onclick = unavailable ? ()=>showToast('Download unavailable') : event=>downloadMovieFromDetail(event);
  }
  document.getElementById('mdSimilarTitle').textContent = movie.type === 'tv' ? 'Similar Shows' : 'Similar Movies';
  const token = ++_titleDetailsToken;
  renderOnlineSections('md', localTitleDetails(movie, movie.type === 'tv' ? 'tv' : 'movie'), movie.type === 'tv' ? 'tv' : 'movie', movie);
  renderMovieAbout(movie);
  renderMovieMediaInfo(movie);
  svPrewarmPlaybackMetadata(movie);
  loadMovieOnlineDetails(movie, token, scope);
  updateMovieWatchlistButtons();
  svPushDetailHistory('movie');
  modal.classList.add('open');
  modal.scrollTop = 0;
  setDetailPageScrollLock(true);
}

function closeMovieDetail(){
  if(!svDetailHistoryLock && history.state?.view === 'detail'){
    history.back();
    return;
  }
  document.getElementById('movieDetailModal')?.classList.remove('open');
  closeMediaModal();
  currentDetailMovie = null;
  abortDetailRequestScope();
  setDetailPageScrollLock(false);
}

async function hydrateMoviePlayback(movie){
  if(!movie || movie.streamUrl)return movie;
  try{
    const params = new URLSearchParams();
    if(movie.name)params.set('title', movie.name);
    if(movie.year)params.set('year', movie.year);
    const r = await fetchWithTimeout(`${API_BASE}/api/playback/movie/${encodeURIComponent(movie.id || movie.name || '')}?${params.toString()}`, {}, 15000);
    if(r && r.ok){
      const data = svNormalizeBackendUrls(await r.json());
      if(data && data.ok){
        movie.streamUrl = movie.streamUrl || data.streamUrl || '';
        movie.isFtp = movie.isFtp || !!data.isFtp;
        movie.streamAvailable = data.streamAvailable;
      }
    }
  }catch(e){
    console.warn('[Playback] Stream hydrate failed:', e.message);
  }
  return movie;
}

async function playMovieFromDetail(){
  const movie = currentDetailMovie;
  if(!movie)return;
  console.log('[Playback] play button clicked');
  await hydrateMoviePlayback(movie);
  if(isMovieUnavailable(movie) || (movie.isFtp && !movie.streamUrl)){
    showToast('This title is not ready to play yet');
    return;
  }
  recordWatchHistory(movieIdentity(movie), movie.name, movie.genre||'', 'movie');
  svRememberPlaybackReturnState('movie');
  svPushPlayerHistory();
  const playbackContext=svPlaybackContextForMovie(movie);
  if(movie.streamUrl){
    playFtpMedia(movie.streamUrl, movie.name, movie.year || '',playbackContext);
  }else{
    playMedia(movie.id, movie.name, movie.year || '',playbackContext);
  }
}

function toggleDetailOverview(){
  const overview = document.getElementById('mdOverview');
  const btn = document.getElementById('mdShowMoreBtn');
  const collapsed = overview.classList.toggle('is-collapsed');
  btn.textContent = collapsed ? 'Show More' : 'Show Less';
}

function setupSeriesOverview(text){
  const overview = document.getElementById('smOverview');
  const btn = document.getElementById('smShowMoreBtn');
  if(!overview || !btn)return;
  const value = text || '';
  overview.textContent = value;
  overview.style.display = value ? '' : 'none';
  overview.classList.add('is-collapsed');
  btn.textContent = 'Show More';
  btn.style.display = value.length > 220 ? '' : 'none';
}

function toggleSeriesOverview(){
  const overview = document.getElementById('smOverview');
  const btn = document.getElementById('smShowMoreBtn');
  if(!overview || !btn)return;
  const collapsed = overview.classList.toggle('is-collapsed');
  btn.textContent = collapsed ? 'Show More' : 'Show Less';
}

function findHistoryItem(entry){
  if(entry.type==='series')return series.find(s=>String(s.id||s.name)===String(entry.id)||s.name===entry.name);
  return movies.find(m=>String(movieIdentity(m))===String(entry.id)||m.name===entry.name);
}

function libraryCollection(kind){
  if(kind==='movieWatchlist')return movieWatchlist.map(id=>movies.find(m=>movieIdentity(m)===id)).filter(Boolean);
  if(kind==='movieWatched')return movies.filter(m=>watchProgress[m.id]?.progress>=0.95);
  if(kind==='showWatchlist')return seriesWatchlist.map(id=>series.find(s=>String(s.id||s.name)===id)).filter(Boolean);
  if(kind==='subscribed'){
    let ids = [];
    try{ids = JSON.parse(localStorage.getItem('sv_subscribed_series')||'[]');}catch{}
    return ids.map(id=>series.find(s=>String(s.id||s.name)===String(id)||s.name===id)).filter(Boolean);
  }
  if(kind==='recent')return watchHistory.map(findHistoryItem).filter(Boolean);
  return [];
}

function libraryCard(title, count, icon, kind){
  return `<div class="library-card" onclick="showLibraryCollection('${kind}')">${icon}<div><div class="library-card-title">${esc(title)}</div><div class="library-card-count">${count} title${count===1?'':'s'}</div></div></div>`;
}

function renderLibraryPage(){
  const groups = document.getElementById('libraryGroups');
  const movieW = libraryCollection('movieWatchlist');
  const movieWatched = libraryCollection('movieWatched');
  const showW = libraryCollection('showWatchlist');
  let subscribed = [];
  try{subscribed = JSON.parse(localStorage.getItem('sv_subscribed_series')||'[]');}catch{}
  const recent = libraryCollection('recent').slice(0,18);
  const movieIcon = '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>';
  const showIcon = '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>';
  groups.innerHTML = `
    <section>
      <div class="library-section-title">Movies</div>
      <div class="library-section-subtitle">${movieW.length} in watchlist, ${movieWatched.length} watched</div>
      <div class="library-card-grid">
        ${libraryCard('Watchlist', movieW.length, movieIcon, 'movieWatchlist')}
        ${libraryCard('Watched', movieWatched.length, movieIcon, 'movieWatched')}
      </div>
    </section>
    <section>
      <div class="library-section-title">Shows</div>
      <div class="library-section-subtitle">${showW.length} in watchlist, ${subscribed.length} subscribed</div>
      <div class="library-card-grid">
        ${libraryCard('Watchlist', showW.length, showIcon, 'showWatchlist')}
        ${libraryCard('Subscribed', subscribed.length, showIcon, 'subscribed')}
      </div>
    </section>
    <section>
      <div class="library-section-title">Recently Opened</div>
      <div class="library-section-subtitle">${recent.length ? 'Continue from your latest activity' : 'Titles you open will appear here'}</div>
      ${recent.length ? `<div class="library-row">${recent.map(item=>item.seasons?sCardHTML(item):cardHTML(item)).join('')}</div>` : '<div class="movies-empty"><h2>No recent activity</h2><p>Start watching to fill your library.</p></div>'}
    </section>`;
}

function showLibraryCollection(kind){
  const groups = document.getElementById('libraryGroups');
  const items = libraryCollection(kind);
  const titles = {
    movieWatchlist:'Movie Watchlist',
    movieWatched:'Watched Movies',
    showWatchlist:'Show Watchlist',
    subscribed:'Subscribed Shows',
    recent:'Recently Opened'
  };
  groups.innerHTML = `<section>
    <button class="show-more-btn" onclick="renderLibraryPage()">Back to Library</button>
    <div class="library-section-title">${titles[kind]||'Library'}</div>
    <div class="library-section-subtitle">${items.length} title${items.length===1?'':'s'}</div>
    ${items.length ? `<div class="movies-grid">${items.map(item=>item.seasons?sCardHTML(item):cardHTML(item)).join('')}</div>` : '<div class="movies-empty"><h2>Nothing here yet</h2><p>Add titles to see them in this collection.</p></div>'}
  </section>`;
}

function svLegacyRenderSearchPageUnused(q=''){
  const input = document.getElementById('searchInputDesktop');
  if(input && input.value !== q && document.activeElement !== input)input.value = q;
  const query = String(q||'').trim().toLowerCase();
  const label = document.getElementById('searchLabel');
  const grid = document.getElementById('searchGrid');
  if(!query){
    const recent = libraryCollection('recent').slice(0,12);
    label.textContent = recent.length ? 'Recently opened' : 'Start typing to search your vault';
    grid.innerHTML = recent.length
      ? recent.map(item=>item.seasons?sCardHTML(item):cardHTML(item)).join('')
      : '<div class="empty"><h2>Search your library</h2><p>Movies and shows will appear here.</p></div>';
    return;
  }
  const mHits=movies.filter(m=>`${m.name||''} ${m.overview||''} ${m.genre||''} ${m.language||''}`.toLowerCase().includes(query));
  const sHits=series.filter(s=>`${s.name||''} ${s.overview||''} ${s.genre||''} ${s.language||''}`.toLowerCase().includes(query));
  const total=mHits.length+sHits.length;
  label.textContent = total ? `${total} result${total>1?'s':''} for "${q}"` : `No results for "${q}"`;
  grid.innerHTML = total
    ? sHits.map(sCardHTML).join('') + mHits.map(m=>cardHTML(m)).join('')
    : '<div class="empty"><h2>Nothing found</h2><p>Try a different title, genre, or language.</p></div>';
}

let _svSearchTimer=0;
let _svSearchIndex=null;
let _svSearchSig='';
const _svSearchCache=new Map();
function svSearchIndex(){
  const sig=`${movies.length}:${series.length}`;
  if(sig!==_svSearchSig){_svSearchIndex=null;_svSearchSig=sig;_svSearchCache.clear();}
  if(_svSearchIndex)return _svSearchIndex;
  _svSearchIndex=[
    ...(series||[]).map(s=>({item:s,isSeries:true,text:`${s.name||''} ${s.overview||''} ${s.genre||''} ${s.language||''}`.toLowerCase()})),
    ...(movies||[]).map(m=>({item:m,isSeries:false,text:`${m.name||''} ${m.overview||''} ${m.genre||''} ${m.language||''}`.toLowerCase()}))
  ];
  return _svSearchIndex;
}
function svRunSearch(query){
  const q=String(query||'').trim().toLowerCase();
  if(!q)return {mHits:[],sHits:[],total:0};
  if(_svSearchCache.has(q))return _svSearchCache.get(q);
  const terms=q.split(/\s+/).filter(Boolean);
  const mHits=[],sHits=[];
  for(const entry of svSearchIndex()){
    if(terms.every(term=>entry.text.includes(term))){
      (entry.isSeries?sHits:mHits).push(entry.item);
      if(mHits.length+sHits.length>=120)break;
    }
  }
  const result={mHits,sHits,total:mHits.length+sHits.length};
  _svSearchCache.set(q,result);
  if(_svSearchCache.size>40)_svSearchCache.delete(_svSearchCache.keys().next().value);
  return result;
}
function svLegacyHandleSearchPageUnused(q){
  clearTimeout(_svSearchTimer);
  _svSearchTimer=setTimeout(()=>svHandleSearchNow(q), _svWeakDevice ? 180 : 90);
}
function svHandleSearchNow(q){
  const mobile=document.getElementById('searchOverlay').classList.contains('open');
  const query = String(q||'');
  const {mHits,sHits,total}=svRunSearch(query);
  const cards=sHits.map(sCardHTML).join('')+mHits.map(m=>cardHTML(m)).join('');
  const empty='<div class="empty" style="grid-column:1/-1"><h2>Nothing found</h2><p>Try a different search</p></div>';
  if(mobile){
    if(!query.trim()){document.getElementById('mobileSearchGrid').innerHTML='';document.getElementById('mobileSearchLabel').textContent='';return;}
    document.getElementById('mobileSearchLabel').textContent=total?`${total} result${total>1?'s':''}`:'No results';
    document.getElementById('mobileSearchGrid').innerHTML=total?cards:empty;
    return;
  }
  if(query.trim()){
    try{if(location.hash==='#downloads')history.replaceState(null,'',location.pathname+location.search);}catch{}
    currentTab='search';
    document.getElementById('mainSection').style.display='none';
    const hero=document.getElementById('hero');
    if(hero)hero.style.display='none';
    document.getElementById('discoverIntro').style.display='none';
    document.getElementById('seriesSection').style.display='none';
    document.getElementById('moviesSection').style.display='none';
    document.getElementById('librarySection').style.display='none';
    document.getElementById('downloadsSection') && (document.getElementById('downloadsSection').style.display='none');
    document.getElementById('searchSection').style.display='block';
    ['bnDiscover','bnShows','bnMovies','bnLibrary','bnDownloads','bnSearch'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
    document.getElementById('bnSearch')?.classList.add('active');
    renderSearchPage(query);
  }else if(currentTab==='search'){
    renderSearchPage('');
  }else{
    document.getElementById('searchSection').style.display='none';
    document.getElementById('mainSection').style.display='';
    const hero=document.getElementById('hero');
    if(hero)hero.style.display='';
    document.getElementById('discoverIntro').style.display='flex';
  }
}

function rowSubtitle(title){
  const text = title.replace(/\s+/g,' ').trim().toLowerCase();
  if(text.includes('continue'))return 'Pick up where you left off';
  if(text.includes('series'))return 'Binge-ready shows from your vault';
  if(text.includes('new'))return 'Recently added and newly discovered';
  if(text.includes('trending'))return 'Popular titles gaining attention';
  if(text.includes('mobile'))return 'Files that can play smoothly on phones';
  if(text.includes('action'))return 'Big movement, chases, and set pieces';
  if(text.includes('comedy'))return 'Lighter picks for an easy watch';
  if(text.includes('drama'))return 'Character-led stories and emotional arcs';
  if(text.includes('horror'))return 'Darker suspense and late-night picks';
  if(text.includes('sci-fi'))return 'Future worlds, tech, and space stories';
  if(text.includes('all movies'))return 'Browse the full collection';
  return '';
}

function decorateRowHeaders(){
  document.querySelectorAll('.row-header').forEach(header=>{
    if(header.querySelector('.row-subtitle'))return;
    const title = header.querySelector('.row-title');
    if(!title)return;
    const subtitle = rowSubtitle(title.textContent || '');
    if(!subtitle)return;
    const sub = document.createElement('div');
    sub.className = 'row-subtitle';
    sub.textContent = subtitle;
    title.insertAdjacentElement('afterend', sub);
  });
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !document.getElementById('mediaModal')?.classList.contains('hidden')){
    closeMediaModal();
    return;
  }
  if(e.key==='Escape' && document.getElementById('movieDetailModal')?.classList.contains('open')){
    closeMovieDetail();
  }
});
decorateRowHeaders();

function setupPlayerEvents() {
  ensureCentralPlaybackController()?.bind?.();
  if(setupPlayerEvents._bound)return;
  setupPlayerEvents._bound=true;
  // Video element handlers (named so removeEventListener works correctly)
  vid.removeEventListener('timeupdate',     vid._tuH);
  vid.removeEventListener('progress',       vid._prH);
  vid.removeEventListener('loadedmetadata', vid._mdH);
  vid.removeEventListener('ended',          vid._enH);
  vid.removeEventListener('waiting',        vid._waH);
  vid.removeEventListener('stalled',        vid._stH);
  vid.removeEventListener('seeking',        vid._sgH);
  vid.removeEventListener('playing',        vid._plH);
  vid.removeEventListener('canplay',        vid._cpH);
  vid.removeEventListener('play',           vid._paH);
  vid.removeEventListener('pause',          vid._puH);
  vid.removeEventListener('seeked',         vid._skH);

// Replace the dur() function with:
function dur() {
  return playerDuration();
}

  vid._tuH=()=>{
    if(!svThrottlePlayerEvent('timeupdate', SV_PLAYER_TIMEUPDATE_MIN_MS))return;
    scheduleSubtitleOverlayUpdate();
    if(isLiveMode||progressDragging)return;
    const ct=playbackTime();
    const d=dur(); if(!d)return;
    schedulePlayerProgressRender(ct,d,{save:true});
  };
  vid._prH=()=>{
    if(!svThrottlePlayerEvent('progress', SV_PLAYER_PROGRESS_MIN_MS))return;
    schedulePlayerBufferedRender();
  };
  // Replace vid._mdH with:
vid._mdH = () => {
  if (isLiveMode) return;
  svApplyServerAudioAuthority(hlsInstance,vid,'video metadata loaded');
  if(!isMobilePlaybackClient()){
    refreshDesktopNativeAudioTracks();
    if(_ftpStreamUrl)refreshDesktopNativeSubtitleTracks(true);
  }
  const newDur = vid.duration;
  if (newDur && isFinite(newDur) && newDur > 0) {
    setCentralPlaybackLoading(false);
    if ((!_ftpStreamUrl || !_ftpNeedsTranscode) && !vid._durationPending && !validDurationSeconds(vid._apiDuration)) {
      const duration = setPlayerDuration(newDur);
      if(duration && currentStreamId)maybeResumeProgress(currentStreamId, duration);
    }
  }
  };
  vid._enH=()=>{
    stopPlayerUiClock();
    updatePlayIcons(true);
    if(currentStreamId&&!_ftpStreamUrl){watchProgress[currentStreamId]={progress:0.99,updatedAt:Date.now()};try{localStorage.setItem('sv_progress',JSON.stringify(watchProgress));}catch(_){}}
  };
  vid._waH=()=>{
    if(!svThrottlePlayerEvent('waiting', SV_PLAYER_WAITING_MIN_MS))return;
    noteSmoothPlaybackBuffering('waiting');
    setCentralPlaybackLoading(true);
    showUI();
  };
  vid._stH=()=>{
    if(!svThrottlePlayerEvent('stalled', SV_PLAYER_WAITING_MIN_MS))return;
    noteSmoothPlaybackBuffering('stalled');
  };
  vid._sgH=()=>{
    if(!svThrottlePlayerEvent('seeking', SV_PLAYER_SEEKING_MIN_MS))return;
    scheduleSubtitleOverlayUpdate();
    schedulePlayerProgressRender(playbackTime(),dur(),{force:true});
  };
  vid._plH=()=>{setCentralPlaybackLoading(false);noteFtpHeavyPlaybackStarted();noteSmoothPlaybackStarted();startPlayerUiClock();schedulePlayerProgressRender(playbackTime(),dur());scheduleHideUI();};
  vid._cpH=()=>{setCentralPlaybackLoading(false);};
  vid._paH=()=>{updatePlayIcons(false);startPlayerUiClock();scheduleHideUI();};
  vid._puH=()=>{stopPlayerUiClock();updatePlayIcons(true);schedulePlayerProgressRender(playbackTime(),dur(),{force:true});showUI();};
  vid._skH=()=>{
    setTimeout(scheduleSubtitleOverlayUpdate,60);
    requestAnimationFrame(()=>svApplyServerAudioAuthority(hlsInstance,vid,'video seek completed'));
  };
  // Legacy media event handlers are exclusively for Live TV.
  for(const name of ['_tuH','_prH','_mdH','_enH','_waH','_stH','_sgH','_plH','_cpH','_paH','_puH','_skH']) {
    const handler = vid[name];
    vid[name] = (...args) => { if(!window.playerSession || isLiveMode) return handler(...args); };
  }
  vid.addEventListener('timeupdate',    vid._tuH);
  vid.addEventListener('progress',      vid._prH);
  vid.addEventListener('loadedmetadata',vid._mdH);
  vid.addEventListener('ended',         vid._enH);
  vid.addEventListener('waiting',       vid._waH);
  vid.addEventListener('stalled',       vid._stH);
  vid.addEventListener('seeking',       vid._sgH);
  vid.addEventListener('playing',       vid._plH);
  vid.addEventListener('canplay',       vid._cpH);
  vid.addEventListener('play',          vid._paH);
  vid.addEventListener('pause',         vid._puH);
  vid.addEventListener('seeked',        vid._skH);

  // Preview is bound independently so another progress binding cannot suppress it.
  const pw=document.getElementById('progressWrap');
  bindSeekPreview(pw);

  // Progress bar — bind ONCE using a flag
  if(!pw._bound){
    pw._bound=true;
    let dragT=0;
    let dragVisualRaf=0;
    let dragVisualPending=null;
    let suppressProgressClickUntil=0;
    function getP(e){
      return progressRatioFromEvent(e, pw);
    }
    function visual(p,d){
      dragT=p*d;
      const pctText=window.SeekGeometry.percent(p,1);
      const els=playerEls();
      setStyleIfChanged(els.progressPlayed,'width',pctText);
      setStyleIfChanged(els.progressThumb,'left',pctText);
      setTextIfChanged(els.timeNow,fmtTime(dragT));
      updateSeekPreview(p);
      showUI();
    }
    function queueVisual(p,d){
      dragT=p*d;
      dragVisualPending={p,d};
      if(dragVisualRaf)return;
      dragVisualRaf=requestAnimationFrame(()=>{
        dragVisualRaf=0;
        const pending=dragVisualPending;
        dragVisualPending=null;
        if(pending)visual(pending.p,pending.d);
      });
    }
    function flushQueuedVisual(){
      if(dragVisualRaf){
        cancelAnimationFrame(dragVisualRaf);
        dragVisualRaf=0;
      }
      const pending=dragVisualPending;
      dragVisualPending=null;
      if(pending)visual(pending.p,pending.d);
    }
    function commit(){
      flushQueuedVisual();
      suppressProgressClickUntil=Date.now()+450; progressDragging=false; pw.classList.remove('dragging');
      const d=dur(); if(!d){hideSeekPreview();return;}
      const t=Math.max(0,Math.min(d,dragT));
      seekToTime(t);
      hideSeekPreview(160);
    }
    pw.addEventListener('mousedown',e=>{
      if(isLiveMode)return; const d=dur(); if(!d)return;
      e.preventDefault(); seekPreviewMetrics=null; progressDragging=true; pw.classList.add('dragging'); visual(getP(e),d);
    });
    pw.addEventListener('mousemove',e=>{
      if(!progressDragging)return;
      const d=dur(); if(!d)return;
      const p=getP(e);
      queueVisual(p,d);
    });
    document.addEventListener('mouseup',()=>{if(progressDragging)commit();});
    pw.addEventListener('touchstart',e=>{
      if(isLiveMode)return; const d=dur(); if(!d)return;
      e.preventDefault(); seekPreviewMetrics=null; progressDragging=true; pw.classList.add('dragging'); visual(getP(e),d);
    },{passive:false});
    pw.addEventListener('touchmove',e=>{
      if(!progressDragging)return; e.preventDefault();
      const d=dur(); if(!d)return; queueVisual(getP(e),d);
    },{passive:false});
    pw.addEventListener('touchend',()=>{
      if(progressDragging){
        suppressProgressClickUntil=Date.now()+450;
        commit();
        hideSeekPreview();
      }
    });
    pw.addEventListener('touchcancel',()=>{progressDragging=false;pw.classList.remove('dragging');dragVisualPending=null;if(dragVisualRaf){cancelAnimationFrame(dragVisualRaf);dragVisualRaf=0;}hideSeekPreview();});
    pw.addEventListener('click',e=>{
      if(Date.now()<suppressProgressClickUntil)return;
      if(isLiveMode||progressDragging)return;
      const d=dur(); if(!d)return;
      const t=getP(e)*d;
      seekToTime(t);
      hideSeekPreview(120);
    });
  }

  // Wrap and tap zone — bind ONCE
  const wrap=document.getElementById('playerWrap');
  if(!wrap._bound){
    wrap._bound=true;
    wrap.addEventListener('mouseenter',()=>notePlayerPointerActivity(wrap));
    wrap.addEventListener('mousemove',()=>notePlayerPointerActivity(wrap),{passive:true});
    wrap.addEventListener('mouseleave',()=>{playerHovering=false;hideSeekPreview();scheduleHideUI();});
    wrap.addEventListener('focusin',showUI);
    wrap.addEventListener('focusout',()=>setTimeout(scheduleHideUI,0));
  }
  const tapZone=document.getElementById('tapZone');
  if(!tapZone._bound){
    tapZone._bound=true;
    let tx=0,ty=0,tm=false;
    tapZone.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;tm=false;},{passive:true});
    tapZone.addEventListener('touchmove',e=>{if(Math.abs(e.touches[0].clientX-tx)>12||Math.abs(e.touches[0].clientY-ty)>12)tm=true;},{passive:true});
    tapZone.addEventListener('touchend',e=>{
      if(tm)return; e.preventDefault();
      const local=playerLocalPoint({changedTouches:[{clientX:tx,clientY:ty}]}, tapZone);
      const now=Date.now(),x=local.x,w=Math.max(local.width,1);
      if(now-lastTapTime<300){
        if(!isLiveMode){if(lastTapX<w*0.35)seekBy(-10);else if(lastTapX>w*0.65)seekBy(10);else togglePlay();}
        else togglePlay();
        showUI();
      }else{if(uiVisible)hideUI();else showUI();}
      lastTapTime=now;lastTapX=x;
    },{passive:false});
    tapZone.addEventListener('click',e=>{
      if('ontouchstart' in window)return;
      const local=playerLocalPoint(e, tapZone);
      const now=Date.now(),x=local.x,w=Math.max(local.width,1);
      if(now-lastTapTime<300){
        if(!isLiveMode){if(lastTapX<w*0.35)seekBy(-10);else if(lastTapX>w*0.65)seekBy(10);else togglePlay();}
        else togglePlay();
      }else{if(uiVisible)scheduleHideUI();else showUI();}
      lastTapTime=now;lastTapX=x;
    });
    document.addEventListener('fullscreenchange',updateFsIcon);
    document.addEventListener('webkitfullscreenchange',updateFsIcon);
    vid.addEventListener('webkitbeginfullscreen',updateFsIcon);
    vid.addEventListener('webkitendfullscreen',updateFsIcon);
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
   StreamVault runtime patch: faster first-paint images, channel card colors,
   Marvel/DC poster-card rendering. Kept separate so existing playback/API logic
   remains intact.
───────────────────────────────────────────────────────────────────────────── */
const _svWeakDevice = ((navigator.deviceMemory || 4) <= 2) || ((navigator.hardwareConcurrency || 4) <= 2) || (innerWidth < 760 && ((navigator.deviceMemory || 4) <= 3));
window._svWeakDevice = _svWeakDevice;
document.documentElement.classList.toggle('sv-weak-device', _svWeakDevice);
let _svEagerImageBudget = 500;
window._svEagerImageBudget = 500;
function svConsumeImageAttrs(priority=false, immediate=false){
  const eager = priority || immediate || window._svEagerImageBudget-- > 0;
  const fetchPriority = priority ? 'high' : (eager ? 'auto' : 'low');
  return `loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${fetchPriority}" decoding="async" onload="this.dataset.svLoaded='1';this.classList.add('poster-loaded','is-loaded')"`;
}
function svOptimizeImageUrl(src='', wide=false){
  const url = String(src || '');
  if(!url.includes('image.tmdb.org/t/p/'))return url;
  const width = wide ? 1280 : (_svWeakDevice || innerWidth < 760 ? 342 : 500);
  const size = `w${width}`;
  return url.replace(/\/t\/p\/(?:original|w\d+)\//, `/t/p/${size}/`);
}
function svMediaArt(item, wide=false){
  if(!item)return '';
  return svOptimizeImageUrl(wide ? (item.backdrop || item.poster || '') : (item.poster || item.backdrop || ''), wide);
}
window.svPrefetchedPosterUrls = window.svPrefetchedPosterUrls || new Set();
window.svPrefetchPosterUrls = function(urls=[]){
  const idle = window.requestIdleCallback || (fn=>setTimeout(fn,80));
  idle(()=>{
    urls.filter(Boolean).slice(0, 60).forEach(src=>{
      const local = svOptimizeImageUrl(src);
      if(!local || window.svPrefetchedPosterUrls.has(local))return;
      window.svPrefetchedPosterUrls.add(local);
      const img = new Image();
      img.decoding = 'async';
      img.src = local;
    });
  }, { timeout: 1200 });
};
window.svPrefetchHomeFeedPosters = function(data){
  const urls = [];
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const preferred = ['netflixRow','marvelRow','dcRow'];
  preferred.forEach(rowId=>{
    const row = rows.find(r=>r.rowId === rowId);
    (row?.items || []).slice(0, 4).forEach(item=>urls.push(item.poster || item.backdrop));
  });
  window.svPrefetchPosterUrls(urls);
};

window.svPosterLoadedCache = window.svPosterLoadedCache || new Map();
window.svPosterLoadingQueue = window.svPosterLoadingQueue || [];
window.svPosterActiveLoads = window.svPosterActiveLoads || 0;
window.svPosterLoadingSources = window.svPosterLoadingSources || new Map();
window.svPosterObservedImages = window.svPosterObservedImages || new WeakSet();
function svPosterConcurrency(){
  if(_svWeakDevice)return 3;
  return innerWidth < 760 ? 5 : 8;
}
function svPosterRootMargin(){
  if(_svWeakDevice)return 700;
  return innerWidth < 760 ? 900 : 1400;
}
function svMarkPosterLoaded(img, src, applySrc=true){
  if(!img || !src || img.dataset.svSrc !== src)return;
  if(applySrc && img.getAttribute('src') !== src)img.src = src;
  img.dataset.svLoaded = '1';
  img.dataset.svLoading = '';
  img.classList.add('poster-loaded','is-loaded');
}
function svFinishPosterLoad(src, ok){
  window.svPosterActiveLoads = Math.max(0, (window.svPosterActiveLoads || 0) - 1);
  if(ok){
    window.svPosterLoadedCache.set(src, true);
  }
  const waiters = window.svPosterLoadingSources.get(src);
  if(waiters){
    waiters.forEach(img=>{
      if(!img || !img.isConnected || img.dataset.svSrc !== src)return;
      if(ok)svMarkPosterLoaded(img, src, true);
      else img.dataset.svLoading = '';
    });
    window.svPosterLoadingSources.delete(src);
  }
  svPumpPosterQueue();
}
function svPumpPosterQueue(){
  const max = svPosterConcurrency();
  while(window.svPosterActiveLoads < max && window.svPosterLoadingQueue.length){
    const job = window.svPosterLoadingQueue.shift();
    const src = job && job.src;
    if(!src)continue;
    const waiters = window.svPosterLoadingSources.get(src);
    if(window.svPosterLoadedCache.has(src)){
      if(waiters)waiters.forEach(img=>svMarkPosterLoaded(img, src, true));
      if(waiters)window.svPosterLoadingSources.delete(src);
      continue;
    }
    if(!waiters || !Array.from(waiters).some(img=>img && img.isConnected && img.dataset.svSrc === src)){
      window.svPosterLoadingSources.delete(src);
      continue;
    }
    window.svPosterActiveLoads++;
    const loader = new Image();
    loader.decoding = 'async';
    loader.onload = ()=>svFinishPosterLoad(src, true);
    loader.onerror = ()=>svFinishPosterLoad(src, false);
    loader.src = src;
  }
}
function svQueueVisiblePosterImage(img){
  if(!img || !img.isConnected)return;
  const src = img.dataset.svSrc;
  if(!src || img.dataset.svLoaded === '1')return;
  if(window.svPosterLoadedCache.has(src)){
    svMarkPosterLoaded(img, src, true);
    return;
  }
  if(img.getAttribute('src') === src){
    if(img.complete && img.currentSrc){
      window.svPosterLoadedCache.set(src, true);
      svMarkPosterLoaded(img, src, false);
      return;
    }
    if(img.dataset.svLoading === '1')return;
    img.dataset.svLoading = '1';
    img.addEventListener('load', ()=>{
      window.svPosterLoadedCache.set(src, true);
      svMarkPosterLoaded(img, src, false);
    }, { once:true });
    img.addEventListener('error', ()=>{ img.dataset.svLoading = ''; }, { once:true });
    return;
  }
  let waiters = window.svPosterLoadingSources.get(src);
  if(waiters){
    waiters.add(img);
    img.dataset.svLoading = '1';
    return;
  }
  waiters = new Set([img]);
  window.svPosterLoadingSources.set(src, waiters);
  img.dataset.svLoading = '1';
  const job = { src };
  if(img.dataset.svPriority === 'high')window.svPosterLoadingQueue.unshift(job);
  else window.svPosterLoadingQueue.push(job);
  svPumpPosterQueue();
}
function svPosterIntersectionObserver(){
  if(!('IntersectionObserver' in window))return null;
  const margin = svPosterRootMargin();
  if(window._svPosterImageObserver)return window._svPosterImageObserver;
  window._svPosterImageObserverMargin = margin;
  window._svPosterImageObserver = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting && entry.intersectionRatio <= 0)return;
      const img = entry.target;
      window._svPosterImageObserver.unobserve(img);
      svQueueVisiblePosterImage(img);
    });
  }, { root:null, rootMargin:`${margin}px 0px ${margin}px 0px`, threshold:0.01 });
  return window._svPosterImageObserver;
}
function svRegisterPosterImages(root=document){
  const scope = root && root.querySelectorAll ? root : document;
  const images = [];
  if(scope.matches?.('img[data-sv-src]'))images.push(scope);
  scope.querySelectorAll('img[data-sv-src]').forEach(img=>images.push(img));
  const io = svPosterIntersectionObserver();
  images.forEach(img=>{
    const src = img.dataset.svSrc;
    if(!src || img.dataset.svLoaded === '1')return;
    if(window.svPosterLoadedCache.has(src)){
      svMarkPosterLoaded(img, src, true);
      return;
    }
    if(img.getAttribute('src') === src && img.complete && img.currentSrc){
      window.svPosterLoadedCache.set(src, true);
      svMarkPosterLoaded(img, src, false);
      return;
    }
    if(window.svPosterObservedImages.has(img))return;
    window.svPosterObservedImages.add(img);
    if(io)io.observe(img);
    else svQueueVisiblePosterImage(img);
  });
}
window.svRegisterPosterImages = svRegisterPosterImages;
window.svQueuePosterImages = function(root=document){
  svRegisterPosterImages(root);
};
function svStartPosterObserver(){
  if(window._svPosterObserverStarted || !document.body)return;
  window._svPosterObserverStarted = true;
  const idle = window.requestIdleCallback || (fn=>setTimeout(fn,80));
  const observer = new MutationObserver(records=>{
    const roots = [];
    for(const rec of records){
      for(const node of rec.addedNodes || []){
        if(node.nodeType === 1 && (node.matches?.('img[data-sv-src]') || node.querySelector?.('img[data-sv-src]'))){
          roots.push(node);
        }
      }
    }
    if(roots.length){
      idle(()=>roots.forEach(root=>svRegisterPosterImages(root)), { timeout: 600 });
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });
  svRegisterPosterImages(document);
}
if(document.readyState === 'loading')document.addEventListener('DOMContentLoaded', svStartPosterObserver, { once:true });
else svStartPosterObserver();
function svRegisterServiceWorker(){
  window.StreamVaultConfig?.registerServiceWorker?.().catch(()=>{});
}
window.addEventListener('load', svRegisterServiceWorker, { once:true });
function svChannelColor(ch={}){
  const direct = ch.color || ch.brandColor || ch.primaryColor;
  if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(direct||'')))return direct;
  const name = String(ch.name || ch.id || '').toLowerCase();
  const pairs = [
    ['t sports','#e21b2d'],['tsports','#e21b2d'],['star sports','#2d5fbd'],['sony sports','#3146b7'],
    ['sony','#f0a000'],['jamuna','#d20b16'],['somoy','#df242d'],['channel 24','#e46b22'],
    ['independent','#e00012'],['cnn','#cc0000'],['aljazeera','#d6a421'],['al jazeera','#d6a421'],
    ['cartoon network','#111111'],['cartoon','#111111'],['movies now','#405bd8'],['movie now','#405bd8'],
    ['star jalsha','#ff6a00'],['jalsha','#ff6a00'],['gazi','#f04b23'],['zee','#6b2cbf'],
    ['atn','#d71920'],['ekattor','#e31d1a'],['btv','#2d9b55'],['ntv','#2e8b57'],
    ['news','#d71920'],['sports','#1c5fd1'],['entertainment','#f59e0b']
  ];
  const hit = pairs.find(([key])=>name.includes(key));
  return hit ? hit[1] : '#8f8f99';
}
function svChannelLogoHTML(ch, priority=false){
  if(!ch.logo)return '';
  return `<img src="${esc(ch.logo)}" alt="${esc(ch.name || 'Channel')}" class="channel-logo" ${svConsumeImageAttrs(priority)} onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`;
}
function svPlaceholderIcon(kind='movie'){
  if(kind==='series'){
    return `<svg viewBox="0 0 24 24" width="32" height="32" fill="rgba(255,255,255,.2)"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-1.1-2-2-2zm0 14H3V5h18v12z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="32" height="32" fill="rgba(255,255,255,.2)"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>`;
}

function svOptimizedCardFallbackSeriesHTML(s){
  if(!isPlayableMediaItem(s))return '';
  const seasons = s.seasons || {};
  const sc=Object.keys(seasons).length;
  const ep=Object.values(seasons).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0);
  const src=svMediaArt(s,false);
  const img=src
    ? `<img src="${esc(src)}" alt="${esc(s.name || '')}" ${svConsumeImageAttrs(!!s._priorityImage, !!s._immediateImage)} width="342" height="513">`
    : `<div class="card-placeholder"><div class="icon">${svPlaceholderIcon('series')}</div><div class="pname">${esc(s.name || '')}</div></div>`;
  const detailKey = registerSeriesForDetail(s);
  return `<div class="card" role="button" tabindex="0" onclick="openSeriesDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSeriesDetail('${detailKey}')}">${img}<div class="series-badge">SERIES</div><div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(s.name || '')}</div><div class="card-meta">${s.rating?`<span class="card-rating">&#9733; ${esc(s.rating)}</span>`:''}<span>${sc}S &middot; ${ep}Ep</span></div></div></div>`;
}

function svOptimizedCardFallbackMovieHTML(m, sp=false){
  if(!isPlayableMediaItem(m))return '';
  const src=svMediaArt(m, false);
  const img=src
    ? `<img src="${esc(src)}" alt="${esc(m.name || '')}" ${svConsumeImageAttrs(!!m._priorityImage, !!m._immediateImage)} width="342" height="513">`
    : `<div class="card-placeholder"><div class="icon">${svPlaceholderIcon('movie')}</div><div class="pname">${esc(m.name || '')}</div></div>`;
  const prog=watchProgress[m.id];
  const bar=sp&&prog?`<div class="card-progress"><div class="card-progress-fill" style="width:${Math.round(prog.progress*100)}%"></div></div>`:'';
  const detailKey = registerMovieForDetail(m);
  return `<div class="card" role="button" tabindex="0" onclick="openMovieDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMovieDetail('${detailKey}')}">${img}<div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(m.name || '')}</div><div class="card-meta">${m.rating?`<span class="card-rating">&#9733; ${esc(m.rating)}</span>`:''} ${m.year?`<span>${esc(m.year)}</span>`:''}</div></div>${bar}</div>`;
}

function svInitialCardCount(rowId){
  const mobile = window.innerWidth < 760;
  if(_svWeakDevice)return mobile ? 4 : 6;
  if(rowId === 'newRow')return mobile ? 8 : 12;
  if(rowId === 'seriesRow')return mobile ? 8 : 12;
  return mobile ? 7 : 10;
}
function svFallbackItemKey(item){
  return [
    item?.type || (item?.seasons ? 'series' : 'movie'),
    item?.tmdbId,
    item?.id,
    item?.streamUrl,
    item?.name || item?.title || item?.file,
    item?.poster,
    item?.backdrop
  ].filter(Boolean).join('|').toLowerCase();
}
function svFallbackItemKeys(items){
  return (items || []).map(svFallbackItemKey);
}
function svFallbackSameKeys(a=[], b=[]){
  return a.length === b.length && a.every((key, i)=>key === b[i]);
}
function svRenderSlice(track, from, to){
  const items = track?._svItems || [];
  const render = track?._svRenderItem;
  if(!track || !render || from >= to)return;
  const rowId = track._svRowId || track.closest('.row')?.id || '';
  const priorityRow = ['netflixRow','marvelRow','dcRow'].includes(rowId);
  const priorityCount = priorityRow ? (window.innerWidth < 760 || _svWeakDevice ? 5 : 8) : 0;
  const html = items.slice(from, to).map((item, offset)=>{
    const index = from + offset;
    const immediateImage = index < priorityCount;
    const highPriorityImage = (rowId === 'newRow' && index < 6) || (rowId === 'recentlyAddedRow' && index < 6);
    const next = (immediateImage || highPriorityImage) ? {...item, _immediateImage:immediateImage, _priorityImage:highPriorityImage} : item;
    return render(next, index);
  }).join('');
  if(from === 0)track.querySelectorAll('.sv-skeleton-card').forEach(el=>el.remove());
  track.insertAdjacentHTML('beforeend', html);
  track._svRendered = Math.max(track._svRendered || 0, to);
  track._svRenderedKeys = (track._svItemKeys || svFallbackItemKeys(items)).slice(0, track._svRendered);
  if(typeof svQueuePosterImages === 'function')svQueuePosterImages(track);
}
function svAppendLazyTrack(track, count){
  if(!track || !track._svItems)return;
  const from = track._svRendered || 0;
  const to = Math.min(track._svItems.length, from + (count || track._svBatch || 8));
  svRenderSlice(track, from, to);
  const row = track.closest('.row');
  if(row)setTimeout(()=>svUpdateCarouselControls(row),40);
}
function svRenderLazyTrack(trackId, rowId, items, renderItem, opts={}){
  const track=document.getElementById(trackId);
  if(!track){hide(rowId);return;}
  const limit=opts.limit || 50;
  const list=filterPlayableMediaItems(items).slice(0, limit);
  if(!list.length){
    if(track.querySelector('.card,.live-ch-card')){
      show(rowId);
      return;
    }
    hide(rowId);
    return;
  }
  const nextKeys = svFallbackItemKeys(list);
  if(track.querySelector('.card,.live-ch-card') && svFallbackSameKeys(track._svItemKeys || [], nextKeys)){
    show(rowId);
    return;
  }
  const existingCards = track.querySelectorAll('.card,.live-ch-card').length;
  if(existingCards){
    const rendered = Math.max(track._svRendered || 0, existingCards);
    const prevItems = track._svItems || [];
    const prevKeys = track._svItemKeys || svFallbackItemKeys(prevItems);
    const renderedKeys = (track._svRenderedKeys || []).length >= rendered ? track._svRenderedKeys.slice(0, rendered) : (prevKeys.length ? prevKeys.slice(0, rendered) : nextKeys.slice(0, rendered));
    track._svItems = list;
    track._svItemKeys = nextKeys;
    track._svRenderItem = renderItem;
    track._svBatch = opts.batch || (window.innerWidth < 760 ? 6 : 8);
    track._svRowId = rowId;
    track._svRendered = rendered;
    if(svFallbackSameKeys(prevKeys, nextKeys) || svFallbackSameKeys(renderedKeys, nextKeys.slice(0, renderedKeys.length))){
      track._svRenderedKeys = renderedKeys;
      show(rowId);
      return;
    }
    const seen = new Set(renderedKeys.filter(Boolean));
    const appendItems = [];
    const appendKeys = [];
    list.forEach((item, i)=>{
      const key = nextKeys[i];
      if(key && seen.has(key))return;
      appendItems.push(item);
      appendKeys.push(key);
      if(key)seen.add(key);
    });
    if(!appendItems.length){
      track._svRenderedKeys = renderedKeys;
      show(rowId);
      return;
    }
    const existingItems = prevItems.length >= rendered ? prevItems.slice(0, rendered) : list.slice(0, rendered);
    track._svItems = existingItems.concat(appendItems);
    track._svItemKeys = renderedKeys.concat(appendKeys);
    track._svRenderedKeys = renderedKeys;
    svRenderSlice(track, rendered, Math.min(track._svItems.length, rendered + (opts.initial || svInitialCardCount(rowId))));
    show(rowId);
    return;
  }
  track._svItems=list;
  track._svItemKeys=nextKeys;
  track._svRenderItem=renderItem;
  track._svBatch=opts.batch || (window.innerWidth < 760 ? 6 : 8);
  track._svRowId=rowId;
  track._svRendered=0;
  svRenderSlice(track,0,Math.min(list.length,opts.initial || svInitialCardCount(rowId)));
  if(!track.dataset.lazyAppendBound){
    track.dataset.lazyAppendBound='1';
    track.addEventListener('scroll',()=>{
      if(!track._svItems || track._svRendered >= track._svItems.length)return;
      if(track.scrollLeft + track.clientWidth >= track.scrollWidth - Math.max(260, track.clientWidth * .35)){
        svAppendLazyTrack(track);
      }
    },{passive:true});
  }
  show(rowId);
}

function svIdleTask(fn, timeout=1200){
  if(window.requestIdleCallback)return window.requestIdleCallback(fn,{timeout});
  return setTimeout(fn,80);
}
function svRunRowQueue(tasks, i=0){
  if(i>=tasks.length)return;
  svIdleTask(()=>{tasks[i]();svRunRowQueue(tasks,i+1);}, i < 2 ? 700 : 1800);
}

async function buildStudioRow(trackId, rowId, publisher, keywords, priorityPatterns) {
  const localMatched = movies.filter(m => {
    const n = (m.name||'').toLowerCase().replace(/[\.\-_]/g,' ');
    return keywords.some(k => n.includes(k));
  });
  const seen = new Set(localMatched.map(m => (m.name||'').toLowerCase().split('(')[0].trim()));

  let ftpMatched = [];
  try {
    const r = await fetch(`${API_BASE}/api/movies/keywords?q=${encodeURIComponent(keywords.join(','))}`);
    const data = await r.json();
    ftpMatched = data.filter(m => {
      const key = (m.name||'').toLowerCase().split('(')[0].trim();
      return !seen.has(key);
    });

    const ftpSeen = new Map();
    ftpMatched = ftpMatched.filter(m => {
      const base = (m.name||'').toLowerCase().replace(/^\d+\s*[-–]\s*/,'').split('(')[0].trim();
      if (ftpSeen.has(base)) {
        const existing = ftpSeen.get(base);
        if (!existing.poster && m.poster) { ftpSeen.set(base, m); return true; }
        return false;
      }
      ftpSeen.set(base, m);
      return true;
    });
  } catch {}

  let list = [...localMatched, ...ftpMatched];
  const norm = s => s.replace(/[\.\-_:]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  list.sort((a, b) => {
    const an = norm(a.name||''), bn = norm(b.name||'');
    const ai = priorityPatterns.findIndex(p => an.includes(p));
    const bi = priorityPatterns.findIndex(p => bn.includes(p));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return (parseInt(b.year)||0) - (parseInt(a.year)||0) || (parseFloat(b.rating)||0) - (parseFloat(a.rating)||0);
  });

  if (!list.length) { hide(rowId); return; }
  svRenderLazyTrack(trackId,rowId,list,(m,i)=>cardHTML({...m,_priorityImage:i<2}),{limit:120,initial:svInitialCardCount(rowId),batch:8});
}

function bgrStudioWithPriority(trackId, rowId, predicate, publisher) {
  const mList = movies.filter(predicate);
  const sList = series.filter(predicate).map(s => ({...s, _isSeries: true}));
  let list = [...mList, ...sList];
  if (!list.length) { hide(rowId); return; }
  const STUDIO_PRIORITY_TITLES = {
    marvel: ['avengers: endgame','avengers: infinity war','the avengers','avengers: age of ultron','iron man','captain america','thor','guardians of the galaxy','spider-man','black panther','doctor strange','ant-man','captain marvel','deadpool'],
    dc: ['the dark knight','the dark knight rises','batman begins','the batman','man of steel','superman returns','batman v superman','wonder woman','justice league','aquaman','joker','shazam','suicide squad','black adam']
  };
  const priorityList = STUDIO_PRIORITY_TITLES[publisher] || [];
  list.sort((a,b)=>{
    const an=(a.name||'').toLowerCase(), bn=(b.name||'').toLowerCase();
    const ai=priorityList.findIndex(p=>an.includes(p));
    const bi=priorityList.findIndex(p=>bn.includes(p));
    if(ai!==-1&&bi!==-1)return ai-bi;
    if(ai!==-1)return -1;
    if(bi!==-1)return 1;
    return (parseInt(b.year)||0)-(parseInt(a.year)||0) || (parseFloat(b.rating)||0)-(parseFloat(a.rating)||0);
  });
  svRenderLazyTrack(
    trackId,
    rowId,
    list,
    (item,i)=>item._isSeries?sCardHTML({...item,_priorityImage:i<2}):cardHTML({...item,_priorityImage:i<2}),
    {limit:120,initial:svInitialCardCount(rowId),batch:8}
  );
}

function svOptimizedBuildLiveHomeRowFallback(){
  if(!channels||!channels.length){hide('liveHomeRow');return;}
  const track=document.getElementById('liveHomeTrack');
  track.innerHTML=channels.map((ch,i)=>{
    const initial=esc((ch.name||'?').charAt(0).toUpperCase());
    const color=svChannelColor(ch);
    const imgEl=svChannelLogoHTML(ch,i<8);
    const safeId=esc(ch.id || '');
    const safeName=esc(ch.name || '').replace(/'/g,"\\'");
    return `<div class="live-ch-card" style="--ch-color:${color}" onclick="openLiveChannel('${safeId}','${safeName}')" aria-label="${esc(ch.name||'Channel')}">
      <div class="live-ch-inner">
        ${imgEl}
        <div class="live-ch-initial" style="${ch.logo?'display:none':''}">${initial}</div>
      </div>
    </div>`;
  }).join('');
  show('liveHomeRow');
}

function svOptimizedRenderLiveGridFallback(){
  const grid=document.getElementById('liveGrid');
  const filtered=currentLiveCat==='All'?channels:channels.filter(c=>c.category===currentLiveCat);
  if(!filtered.length){
    grid.innerHTML=`<div class="live-setup-note"><h3>No channels in this category</h3><p>Add channels to <code>channels.json</code> in your server folder.</p></div>`;
    return;
  }
  const hasAnyUrl=filtered.some(c=>c.url);
  let html='';
  if(!hasAnyUrl){
    html+=`<div class="live-setup-note">
      <h3>⚙️ One-time setup needed</h3>
      <p>Open the ISP portal at <code>172.22.1.2:90</code>, play each channel, press <code>F12</code> → Network tab → filter by <code>m3u8</code> — copy the URL into <code>channels.json</code> next to each channel's <code>"url"</code> field. Then restart the server.</p>
    </div>`;
  }
  html+=filtered.map((ch,i)=>{
    const initial=esc((ch.name||'?').charAt(0).toUpperCase());
    const hasUrl=!!ch.url;
    const color=svChannelColor(ch);
    const imgEl=svChannelLogoHTML(ch,i<12);
    const safeId=esc(ch.id || '');
    const safeName=esc(ch.name || '').replace(/'/g,"\\'");
    return `<div class="channel-card" style="--ch-color:${color};${!hasUrl?'opacity:.45;cursor:default':''}" onclick="${hasUrl?`openLiveChannel('${safeId}','${safeName}')`:''}" aria-label="${esc(ch.name||'Channel')}">
      <div class="channel-card-inner">
        ${imgEl}
        <div class="channel-initial" style="${ch.logo?'display:none':''}">${initial}</div>
      </div>
    </div>`;
  }).join('');
  grid.innerHTML=html;
}



/* ─────────────────────────────────────────────────────────────────────────────
   StreamVault final section-order patch
───────────────────────────────────────────────────────────────────────────── */
const SV_HOME_ORDER = [
  'liveHomeRow','netflixRow','marvelRow','dcRow',
  'universalRow','disneyRow','warnerRow','hboRow','appleTvRow','indianRow',
  'dramaRow','spanishRow','highRatedRow','allRow',
  'trendingRow','seriesRow','newRow'
];
const SV_HOME_ROW_META = {
  netflixRow:   ['Netflix Originals','netflixTrack'],
  marvelRow:    ['Marvel Studios','marvelTrack'],
  dcRow:        ['DC','dcTrack'],
  trendingRow:  ['🔥 Trending Now','trendingTrack'],
  seriesRow:    ['Series','seriesTrack'],
  newRow:       ['New to StreamVault','newTrack'],
  universalRow: ['Universal Pictures','universalTrack'],
  disneyRow:    ['Disney','disneyTrack'],
  warnerRow:    ['Warner Bros','warnerTrack'],
  hboRow:       ['HBO','hboTrack'],
  appleTvRow:   ['Apple TV+','appleTvTrack'],
  indianRow:    ['Indian Movies & Drama','indianTrack'],
  dramaRow:     ['Drama & Emotion','dramaTrack'],
  spanishRow:   ['Spanish & Latino','spanishTrack'],
  highRatedRow: ['⭐ Top Rated (8+)','highRatedTrack'],
  allRow:       ['All Movies','allTrack']
};
function svEnsureHomeRow(rowId){
  const main=document.getElementById('mainSection');
  const meta=SV_HOME_ROW_META[rowId];
  if(!main||!meta)return null;
  let row=document.getElementById(rowId);
  if(!row){
    row=document.createElement('div');
    row.className='row';
    row.id=rowId;
    row.style.display='none';
    row.innerHTML=`<div class="row-header"><div class="row-title">${meta[0]}</div></div><div class="cards-track" id="${meta[1]}"></div>`;
    main.appendChild(row);
  }else{
    const title=row.querySelector('.row-title');
    if(title) title.textContent=meta[0];
    if(!document.getElementById(meta[1])){
      const track=document.createElement('div');
      track.className='cards-track';
      track.id=meta[1];
      row.appendChild(track);
    }
  }
  return row;
}
function svApplyHomeOrder(){
  const main=document.getElementById('mainSection');
  if(!main)return;
  SV_HOME_ORDER.forEach(id=>{
    const row=svEnsureHomeRow(id);
    if(row)main.appendChild(row);
  });
  Array.from(main.children).forEach(el=>{
    if(el.classList&&el.classList.contains('row')&&!SV_HOME_ORDER.includes(el.id)){
      el.style.display='none';
    }
  });
  svEnhanceCarouselControls();
  svBindStudioWheelScroll();
}
function svTrackForRow(row){
  return row?.querySelector?.('.cards-track,.live-home-track');
}
function svCarouselIcon(direction){
  const path = direction < 0
    ? 'M15.4 5.4 14 4 6 12l8 8 1.4-1.4L8.8 12z'
    : 'M8.6 18.6 10 20l8-8-8-8-1.4 1.4 6.6 6.6z';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}
function svScrollCarousel(rowId, direction){
  const row=document.getElementById(rowId);
  const track=svTrackForRow(row);
  if(!track)return;
  if(direction > 0 && track._svItems && track._svRendered < track._svItems.length){
    svAppendLazyTrack(track);
  }
  const amount=Math.max(260, Math.floor(track.clientWidth*.82));
  track.scrollBy({left:direction*amount,behavior:'smooth'});
  setTimeout(()=>svUpdateCarouselControls(row),360);
}
function svBindStudioWheelScroll(){
  ['marvelRow','dcRow'].forEach(rowId=>{
    const row=document.getElementById(rowId);
    const track=svTrackForRow(row);
    if(!track || track.dataset.studioWheelBound)return;
    track.dataset.studioWheelBound='1';
    track.addEventListener('wheel', e=>{
      const horizontal=Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if(!horizontal && !e.shiftKey)return;
      e.preventDefault();
      if((horizontal ? e.deltaX : e.deltaY) > 0 && track._svItems && track._svRendered < track._svItems.length){
        svAppendLazyTrack(track);
      }
      track.scrollLeft += horizontal ? e.deltaX : e.deltaY;
      svUpdateCarouselControls(row);
    }, {passive:false});
  });
}
function svUpdateCarouselControls(row){
  const track=svTrackForRow(row);
  const controls=row?.querySelector?.('.row-controls');
  if(!track||!controls)return;
  const hasMoreLazy = !!track._svItems && track._svRendered < track._svItems.length;
  const canScroll=track.scrollWidth>track.clientWidth+8 || hasMoreLazy;
  controls.style.display=canScroll?'flex':'none';
  if(!canScroll)return;
  const prev=controls.querySelector('[data-dir="-1"]');
  const next=controls.querySelector('[data-dir="1"]');
  if(prev)prev.disabled=track.scrollLeft<=4;
  if(next)next.disabled=!hasMoreLazy && track.scrollLeft+track.clientWidth>=track.scrollWidth-6;
}
function svEnhanceCarouselControls(){
  document.querySelectorAll('.row').forEach(row=>{
    const track=svTrackForRow(row);
    const header=row.querySelector('.row-header');
    if(!track||!header)return;
    if(row.querySelector('.row-controls')){
      svUpdateCarouselControls(row);
      return;
    }
    const controls=document.createElement('div');
    controls.className='row-controls';
    controls.innerHTML=`
      <button class="row-control-btn" type="button" data-dir="-1" aria-label="Scroll left">${svCarouselIcon(-1)}</button>
      <button class="row-control-btn" type="button" data-dir="1" aria-label="Scroll right">${svCarouselIcon(1)}</button>
    `;
    controls.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click',()=>svScrollCarousel(row.id, Number(btn.dataset.dir)||1));
    });
    header.appendChild(controls);
    if(!track.dataset.carouselControlsBound){
      track.dataset.carouselControlsBound='1';
      track.addEventListener('scroll',()=>svUpdateCarouselControls(row),{passive:true});
      if(!window._svCarouselResizeBound){
        window._svCarouselResizeBound='1';
        window.addEventListener('resize',()=>document.querySelectorAll('.row').forEach(svUpdateCarouselControls),{passive:true});
      }
    }
    setTimeout(()=>svUpdateCarouselControls(row),60);
  });
}
function svTextOf(item){
  return [item?.name,item?.title,item?.genre,item?.category,item?.server,item?.language,item?.director,item?.runtime]
    .concat(Array.isArray(item?.productionCompanies)?item.productionCompanies:[])
    .filter(Boolean).join(' ').toLowerCase().replace(/[._-]+/g,' ');
}
function svAnyKeyword(item,keywords){
  const t=svTextOf(item);
  return keywords.some(k=>t.includes(String(k).toLowerCase()));
}
function svDedupItems(list){
  const seen=new Set();
  return list.filter(item=>{
    const base=String(item?.name||item?.title||'').toLowerCase().replace(/^\d+\s*[-–]\s*/,'').replace(/\s*\((?:19|20)\d{2}\).*$/,'').trim();
    if(!base||seen.has(base))return false;
    seen.add(base);return true;
  });
}
function svSortItems(list){
  return svDedupItems(list).sort((a,b)=>{
    const ar=parseFloat(a.rating)||0, br=parseFloat(b.rating)||0;
    const ay=parseInt(String(a.year||'').match(/(?:19|20)\d{2}/)?.[0]||0,10);
    const by=parseInt(String(b.year||'').match(/(?:19|20)\d{2}/)?.[0]||0,10);
    if(by!==ay)return by-ay;
    return br-ar;
  });
}
function svAllMixedHomeItems(){
  return [
    ...(series||[]).map(s=>({...s,_isSeries:true})),
    ...(movies||[])
  ].filter(item=>item && (item.poster||item.backdrop||item.name));
}
function svFallbackHomeItems(rowId){
  const all=svSortItems(svAllMixedHomeItems()).filter(item=>item.poster||item.backdrop||item.name);
  const offsets={
    universalRow:8,disneyRow:16,warnerRow:24,hboRow:32,appleTvRow:40,
    indianRow:48,dramaRow:56,spanishRow:64,highRatedRow:0
  };
  if(rowId==='seriesRow')return (series||[]).slice(0,120).map(s=>({...s,_isSeries:true}));
  if(rowId==='allRow')return svSortItems(movies||[]).slice(0,120);
  if(rowId==='highRatedRow'){
    const rated=all.filter(i=>parseFloat(i.rating)||0).sort((a,b)=>(parseFloat(b.rating)||0)-(parseFloat(a.rating)||0));
    if(rated.length)return rated.slice(0,120);
  }
  const off=offsets[rowId]||0;
  return all.slice(off,off+120);
}
function svRenderMixedTrack(trackId,rowId,list,limit=120){
  const track=document.getElementById(trackId);
  if(!track){hide(rowId);return;}
  let items=svSortItems(list).slice(0,limit);
  if(!items.length)items=svFallbackHomeItems(rowId).slice(0,limit);
  if(!items.length){hide(rowId);return;}
  svRenderLazyTrack(trackId,rowId,items,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit});
}
function svBuildKeywordRow(trackId,rowId,keywords,{includeSeries=true,limit=120}={}){
  const mList=(movies||[]).filter(m=>svAnyKeyword(m,keywords));
  const sList=includeSeries?(series||[]).filter(s=>svAnyKeyword(s,keywords)).map(s=>({...s,_isSeries:true})):[];
  svRenderMixedTrack(trackId,rowId,[...sList,...mList],limit);
}
function svBuildPredicateRow(trackId,rowId,pred,{includeSeries=true,limit=120}={}){
  const mList=(movies||[]).filter(pred);
  const sList=includeSeries?(series||[]).filter(pred).map(s=>({...s,_isSeries:true})):[];
  svRenderMixedTrack(trackId,rowId,[...sList,...mList],limit);
}
function svBuildIndianRow(){
  const keys=['hindi','bengali','bangla','tamil','telugu','malayalam','kannada','bollywood','india','indian','kollywood','tollywood','dhallywood'];
  svBuildPredicateRow('indianTrack','indianRow',item=>svAnyKeyword(item,keys),{includeSeries:true,limit:120});
}
function svFallbackTrending(){
  const direct=[...(trendingSeries||[]).map(s=>({...s,_isSeries:true})),...(trendingMovies||[])].filter(i=>i&&i.poster);
  if(direct.length)return direct;
  return svSortItems([...(series||[]).map(s=>({...s,_isSeries:true})),...(movies||[])]).filter(i=>i.poster).slice(0,120);
}
function svNewItems(){
  const s=[...(series||[])].slice(-60).reverse().map(x=>({...x,_isSeries:true}));
  const m=[...(movies||[])].slice(-120).reverse();
  const mixed=[...s,...m].filter(i=>i.poster||i.backdrop);
  return mixed.length?mixed:svSortItems([...(series||[]).map(x=>({...x,_isSeries:true})),...(movies||[])]).slice(0,120);
}
function svTrackIdForRow(rowId){
  const meta=SV_HOME_ROW_META[rowId];
  return meta&&meta[1];
}
function svNormalizeOnlineItem(item){
  if(!item)return null;
  const isSeries=item.type==='tv'||item.type==='series'||item.seasons;
  const normalized={
    ...item,
    _isSeries:isSeries,
    isTrending:true,
    isOnlineRelease:true,
    streamUrl:item.streamUrl||null,
    isFtp:!!item.isFtp
  };
  if(isSeries&&!normalized.seasons)normalized.seasons={};
  return normalized;
}
let svOnlineRowsCache=null;
function svRenderOnlineSections(rows){
  if(!rows||typeof rows!=='object')return;
  svOnlineRowsCache={...(svOnlineRowsCache||{}),...rows};
  const renderEntry=([rowId,list])=>{
    const trackId=svTrackIdForRow(rowId);
    const track=trackId&&document.getElementById(trackId);
    if(!track||!Array.isArray(list)||!list.length)return;
    const items=svDedupItems(list.map(svNormalizeOnlineItem).filter(Boolean)).slice(0,120);
    if(!items.length)return;
    if(track.querySelector('.card,.live-ch-card')){
      svRenderLazyTrack(trackId,rowId,items,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit:120});
      return;
    }
    svRenderLazyTrack(trackId,rowId,items,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit:120});
  };
  Object.entries(rows).forEach(renderEntry);
  svApplyHomeOrder();
}
function svFinalBuildLiveHomeRowFallback(){
  if(!channels||!channels.length){hide('liveHomeRow');return;}
  const track=document.getElementById('liveHomeTrack');
  if(!track){hide('liveHomeRow');return;}
  track.innerHTML=channels.map((ch,i)=>{
    const initial=esc((ch.name||'?').charAt(0).toUpperCase());
    const color=typeof svChannelColor==='function'?svChannelColor(ch):(ch.color||'#777');
    const imgEl=typeof svChannelLogoHTML==='function'
      ? svChannelLogoHTML(ch,i<8)
      : (ch.logo?`<img src="${esc(ch.logo)}" alt="${esc(ch.name||'Channel')}" class="channel-logo" loading="${i<8?'eager':'lazy'}" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`:'');
    const safeId=esc(ch.id || '');
    const safeName=esc(ch.name || '').replace(/'/g,"\'");
    return `<div class="live-ch-card" style="--ch-color:${color}" onclick="openLiveChannel('${safeId}','${safeName}')" aria-label="${esc(ch.name||'Channel')}">
      <div class="live-ch-inner">
        ${imgEl}
        <div class="live-ch-initial" style="${ch.logo?'display:none':''}">${initial}</div>
      </div>
    </div>`;
  }).join('');
  show('liveHomeRow');
}
function buildRows(){
  _rowSeen = new Map();
  svApplyHomeOrder();
  if(typeof _svEagerImageBudget!=='undefined')_svEagerImageBudget=14;

  svRenderMixedTrack('newTrack','newRow',svNewItems(),120);
  buildLiveHomeRow();
  svBuildKeywordRow('netflixTrack','netflixRow',[
    'netflix','stranger things','witcher','bridgerton','squid game','money heist','dark','narcos','extraction','red notice','bird box','the old guard','enola holmes','wednesday','lucifer'
  ],{includeSeries:true,limit:120});

  svRunRowQueue([
    ()=>buildStudioRow('marvelTrack','marvelRow','marvel',
      ['avengers','iron man','captain america','thor','spider-man','spider man','black panther','doctor strange','ant-man','ant man','guardians of the galaxy','deadpool','wolverine','fantastic four','black widow','shang-chi','captain marvel','infinity war','endgame'],
      ['avengers endgame','avengers infinity war','the avengers','iron man','captain america civil war','guardians of the galaxy','spider man no way home','black panther','thor ragnarok']
    ),
    ()=>buildStudioRow('dcTrack','dcRow','dc',
      ['batman','superman','wonder woman','aquaman','the flash 2023','joker 2019','joker folie','shazam','suicide squad','justice league','man of steel','dark knight','black adam','blue beetle','batman begins','the batman 2022','zack snyder'],
      ['the dark knight','man of steel','wonder woman','justice league','aquaman','joker','the batman','batman begins','batman v superman']
    ),
    ()=>svRenderMixedTrack('trendingTrack','trendingRow',svFallbackTrending(),120),
    ()=>series&&series.length?svRenderLazyTrack('seriesTrack','seriesRow',series,sCardHTML,{limit:120}):hide('seriesRow'),
    ()=>svBuildKeywordRow('universalTrack','universalRow',['universal','jurassic','fast and furious','fast & furious','minions','despicable me','the mummy','halloween','purge','jason bourne','bourne','king kong','jaws','back to the future','scarface','get out','nope','m3gan'],{includeSeries:false}),
    ()=>svBuildKeywordRow('disneyTrack','disneyRow',['disney','pixar','aladdin','mulan','moana','encanto','coco','frozen','tangled','brave','ratatouille','wall-e','inside out','soul','luca','lion king'],{includeSeries:true}),
    ()=>svBuildKeywordRow('warnerTrack','warnerRow',['warner','warner bros','harry potter','lord of the rings','hobbit','matrix','conjuring','dune','mad max','godzilla','king kong','ocean','sherlock holmes','lethal weapon','creed','superman','batman','wonder woman'],{includeSeries:true}),
    ()=>svBuildKeywordRow('hboTrack','hboRow',['hbo','max original','game of thrones','house of the dragon','the sopranos','euphoria','westworld','succession','the last of us','true detective','chernobyl','band of brothers','the wire','peacemaker'],{includeSeries:true}),
    ()=>svBuildKeywordRow('appleTvTrack','appleTvRow',['apple tv','apple tv+','ted lasso','severance','silo','foundation','for all mankind','the morning show','slow horses','invasion','servant','shrinking','masters of the air','greyhound','coda','tetris','finch','ghosted','napoleon','killer of the flower moon'],{includeSeries:true}),
    ()=>svBuildIndianRow(),
    ()=>svBuildPredicateRow('dramaTrack','dramaRow',item=>svAnyKeyword(item,['drama','emotion','romance','family']),{includeSeries:true}),
    ()=>svBuildPredicateRow('spanishTrack','spanishRow',item=>svAnyKeyword(item,['spanish','latino','latin','mexico','mexican','argentina','colombia','spain','casa de papel','money heist','narcos']),{includeSeries:true}),
    ()=>svBuildPredicateRow('highRatedTrack','highRatedRow',item=>item.rating&&parseFloat(item.rating)>=8.0,{includeSeries:true}),
    ()=>movies&&movies.length?svRenderMixedTrack('allTrack','allRow',movies,120):hide('allRow'),
    ()=>svOnlineRowsCache&&svRenderOnlineSections(svOnlineRowsCache),
  ]);

  svApplyHomeOrder();
}









console.log('HOSTINGER ROOT APP.JS LOADED - 20260708');
