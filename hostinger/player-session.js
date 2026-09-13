(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const STATES = Object.freeze({IDLE:'IDLE', RESOLVING:'RESOLVING', PREPARING:'PREPARING', READY:'READY', PLAYING:'PLAYING', BUFFERING:'BUFFERING', PAUSED:'PAUSED', ENDED:'ENDED', ERROR:'ERROR'});
  const owners = new WeakMap();
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const aborted = () => new DOMException('Playback operation superseded', 'AbortError');
  const boundedPush = (list, value) => { list.push(value); if(list.length > 1000) list.shift(); };

  const SeekGeometry = Object.freeze({
    ratio(value, duration) {
      const d = number(duration);
      return d > 0 ? Math.max(0, Math.min(1, number(value) / d)) : 0;
    },
    ratioFromClientX(track, clientX) {
      const rect = track.getBoundingClientRect();
      const width = Math.max(number(rect.width), 1);
      return Math.max(0, Math.min(1, (number(clientX) - number(rect.left)) / width));
    },
    ratioFromEvent(track, event) {
      const point = event?.touches?.[0] || event?.changedTouches?.[0] || event;
      return this.ratioFromClientX(track, point?.clientX);
    },
    time(ratio, duration) { return Math.max(0, Math.min(number(duration), number(ratio) * number(duration))); },
    percent(value, duration) { return `${(100 * this.ratio(value, duration)).toFixed(3)}%`; },
  });

  class MasterClock {
    constructor() { this.reset(); }
    reset(duration = 0, current = 0, windowStart = 0) {
      this.canonicalDuration = Math.max(0, number(duration));
      this.globalCurrentTime = this.clamp(current);
      this.windowStart = Math.max(0, number(windowStart));
      this.presentationClock = this.globalCurrentTime;
      this.frozen = false;
      this.epoch = (this.epoch || 0) + 1;
    }
    clamp(value) { return Math.max(0, Math.min(number(value), Math.max(0, this.canonicalDuration - 0.05))); }
    globalToLocal(value) { return Math.max(0, this.clamp(value) - this.windowStart); }
    localToGlobal(value) { return Math.min(this.canonicalDuration, Math.max(0, this.windowStart + number(value))); }
    freezeAt(value) { this.globalCurrentTime = this.clamp(value); this.presentationClock = this.globalCurrentTime; this.frozen = true; return ++this.epoch; }
    commitWindow(windowStart, localTime) {
      this.windowStart = Math.max(0, number(windowStart));
      this.globalCurrentTime = this.localToGlobal(localTime);
      this.presentationClock = this.globalCurrentTime;
      this.frozen = false;
    }
    update(localTime) {
      if(!this.frozen) this.globalCurrentTime = this.localToGlobal(localTime);
      this.presentationClock = this.globalCurrentTime;
      return this.globalCurrentTime;
    }
  }

  class AVSynchronizer {
    constructor(clock) { this.clock = clock; this.reset(); }
    reset() { this.epoch = (this.epoch || 0) + 1; this.videoOrigin = null; this.audioOrigin = null; this.videoBufferedPTS = null; this.audioBufferedPTS = null; this.avOffsetMs = null; }
    observe(kind, localPTS) {
      if(!Number.isFinite(Number(localPTS))) return;
      const globalPTS = this.clock.localToGlobal(localPTS);
      if(kind === 'video') { this.videoBufferedPTS=globalPTS; this.videoOrigin=this.videoOrigin===null?globalPTS:Math.min(this.videoOrigin,globalPTS); }
      if(kind === 'audio') { this.audioBufferedPTS=globalPTS; this.audioOrigin=this.audioOrigin===null?globalPTS:Math.min(this.audioOrigin,globalPTS); }
      if(this.videoOrigin !== null && this.audioOrigin !== null) this.avOffsetMs = Math.round((this.audioOrigin-this.videoOrigin)*1000);
    }
    observeFragment(frag) {
      const streams = frag?.elementaryStreams || {};
      this.observe('video', streams.video?.startPTS ?? (frag?.type === 'main' ? frag?.start : NaN));
      this.observe('audio', streams.audio?.startPTS ?? (frag?.type === 'audio' ? frag?.start : NaN));
    }
    inferNative() {
      const value = this.clock.globalCurrentTime;
      this.videoOrigin = value; this.audioOrigin = value; this.avOffsetMs = 0;
    }
    snapshot() {
      // Fragment arrival/frontier timestamps are not simultaneous audio/video
      // presentation measurements. Never label their difference as lip sync.
      return {videoPTS:null,audioPTS:null,expectedPTS:this.clock.presentationClock,avOffsetMs:null,
        fragmentOriginOffsetMs:this.avOffsetMs,avMeasurement:'unavailable',
        videoBufferedPTS:this.videoBufferedPTS,audioBufferedPTS:this.audioBufferedPTS,syncEpoch:this.epoch};
    }
  }

  class BufferManager {
    constructor(clock) { this.clock = clock; this.reset(); }
    reset() { Object.assign(this,{bufferedStart:0,bufferedEnd:0,secondsAhead:0,secondsBehind:0,targetBuffer:90,minimumSafeBuffer:6,networkThroughput:null,sourceThroughput:null,generationSpeed:null}); }
    sample(video, mode) {
      const local = number(video.currentTime);
      let start = local, end = local;
      for(let i=0;i<video.buffered.length;i++) if(video.buffered.start(i) <= local+.05 && video.buffered.end(i) >= local-.05) { start=video.buffered.start(i); end=video.buffered.end(i); break; }
      this.bufferedStart=this.clock.localToGlobal(start); this.bufferedEnd=this.clock.localToGlobal(end);
      this.secondsAhead=Math.max(0,end-local); this.secondsBehind=Math.max(0,local-start);
      this.targetBuffer=mode === 'DIRECT' ? 120 : 90;
      this.minimumSafeBuffer=mode === 'DIRECT' ? 2 : 6;
      return this.snapshot();
    }
    startupThreshold(mode) {
      if(mode === 'DIRECT') return .25;
      if(this.generationSpeed && this.generationSpeed < 1.5) return 8;
      return 3;
    }
    seekResumeThreshold(mode) {
      return mode === 'DIRECT' ? .25 : .75;
    }
    snapshot() { return {bufferedStart:this.bufferedStart,bufferedEnd:this.bufferedEnd,secondsAhead:this.secondsAhead,secondsBehind:this.secondsBehind,targetBuffer:this.targetBuffer,minimumSafeBuffer:this.minimumSafeBuffer,networkThroughput:this.networkThroughput,sourceThroughput:this.sourceThroughput,generationSpeed:this.generationSpeed}; }
  }

  class RecoveryController {
    constructor(session) { this.session=session; this.reset(); }
    reset() { this.networkAttempts=0; this.mediaAttempts=0; }
    recoverHls(data, hls) {
      if(!data?.fatal) return true;
      const type=String(data.type||'').toLowerCase();
      if(type.includes('network') && this.networkAttempts++ < 2) { hls.startLoad?.(this.session.masterClock.globalToLocal(this.session.getCurrentTime())); return true; }
      if(type.includes('media') && this.mediaAttempts++ < 2) { hls.recoverMediaError?.(); return true; }
      return false;
    }
    recoverStall(hls) {
      if(!hls || this.networkAttempts++ >= 2) return false;
      hls.startLoad?.(this.session.masterClock.globalToLocal(this.session.getCurrentTime()));
      return true;
    }
  }

  class SeekController {
    constructor(session) { this.session=session; }
    begin(globalSeconds) {
      const target=this.session.masterClock.clamp(globalSeconds);
      const operation=this.session.operation();
      this.session.masterClock.freezeAt(target);
      this.session.avSynchronizer.reset();
      this.session.recoveryController.reset();
      return {operation,target};
    }
  }

  // WebVTT is cached in full-media time. Only the browser track representation
  // is shifted when an adapter uses a local timeline; media is never reloaded.
  function windowVtt(text, offset) {
    if (!offset) return text;
    const seconds = stamp => stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    const stamp = value => {
      const ms = Math.round(Math.max(0, value) * 1000);
      return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
    };
    return text.replace(/\r/g, '').split('\n\n').map(block => {
      const match = block.match(/((?:\d+:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d+:)?\d{2}:\d{2}\.\d{3})/);
      if (!match) return block;
      const end = seconds(match[2]) - offset;
      if (end <= 0) return '';
      return block.replace(match[0], `${stamp(seconds(match[1])-offset)} --> ${stamp(end)}`);
    }).filter(Boolean).join('\n\n');
  }

  class DirectTransport {
    constructor(session) { this.session = session; this.mode = 'DIRECT'; }
    async attach(capability, localTime, operation) {
      const s = this.session;
      const ready = s.waitForMedia('loadedmetadata', operation, () => s.video.readyState >= 1);
      s.video.src = capability.directUrl;
      s.video.load();
      await ready;
      s.assertCurrent(operation);
      s.video.currentTime = localTime;
    }
    contains() { return true; }
    seek(localTime) { this.session.video.currentTime = localTime; }
    destroy() {}
  }

  class CompatibilityTransport {
    constructor(session) { this.session = session; this.mode = 'COMPATIBILITY'; this.hls = null; }
    contains(localTime) {
      const ranges = this.session.video.seekable;
      for(let i=0; i<ranges.length; i++) {
        if(localTime >= ranges.start(i) && localTime < ranges.end(i)-0.1) return true;
      }
      return false;
    }
    seek(localTime) { this.session.video.currentTime = localTime; }
    async attach(capability, localTime, operation) {
      const s = this.session;
      const Hls = await s.loadHls();
      s.assertCurrent(operation);
      if (!Hls?.isSupported()) {
        if (!s.video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('Compatibility playback is unavailable in this browser');
        const ready = s.waitForMedia('loadedmetadata', operation, () => s.video.readyState >= 1);
        s.video.src = capability.hlsUrl;
        s.video.load();
        await ready;
        s.assertCurrent(operation);
        s.video.currentTime = localTime;
        return;
      }
      const hls = this.hls = s.hls = new Hls({
        enableWorker:true, lowLatencyMode:false, startPosition:localTime,
        startFragPrefetch:true, backBufferLength:60,
        maxBufferLength:90, maxMaxBufferLength:180, maxBufferSize:128*1024*1024,
        // Growing EVENT manifests describe VOD preparation, never a live edge.
        liveSyncDuration:1e9, liveMaxLatencyDuration:Infinity, maxLiveSyncPlaybackRate:1,
        manifestLoadingTimeOut:30000, levelLoadingTimeOut:30000, fragLoadingTimeOut:30000,
        manifestLoadingMaxRetry:6, levelLoadingMaxRetry:6, fragLoadingMaxRetry:8,
        manifestLoadingRetryDelay:1000, levelLoadingRetryDelay:1000, fragLoadingRetryDelay:1000,
        manifestLoadingMaxRetryTimeout:15000, levelLoadingMaxRetryTimeout:15000, fragLoadingMaxRetryTimeout:15000,
      });
      const valid = () => s.active && s.adapter === this && this.hls === hls;
      hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
        if(!valid()) return;
        s.recoveryController.networkAttempts = 0;
        const stats = data.stats || data.frag?.stats;
        const ms = Math.max(0, number(stats?.loading?.end)-number(stats?.loading?.start));
        s.health.fragmentLoadMs = ms;
        s.bufferManager.networkThroughput = ms ? number(stats?.loaded)*8000/ms : null;
        s.health.networkBitsPerSecond = s.bufferManager.networkThroughput;
        s.sampleHealth();
      });
      if(Hls.Events.FRAG_PARSED) hls.on(Hls.Events.FRAG_PARSED, (_event, data) => { if(valid()) s.avSynchronizer.observeFragment(data.frag); });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if(valid() && hls.audioTracks[s.audioIndex]) hls.audioTrack = s.audioIndex;
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        if(!valid()) return;
        s.appliedAudioIndex = data.id;
        s.emit();
      });
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
          if(settled) return;
          settled = true;
          clearTimeout(timer);
          operation.signal.removeEventListener('abort', onAbort);
          error ? reject(error) : resolve();
        };
        const onAbort = () => finish(aborted());
        const timer = setTimeout(() => finish(new Error('Compatibility preparation timed out')), 45000);
        operation.signal.addEventListener('abort', onAbort, {once:true});
        hls.on(Hls.Events.MEDIA_ATTACHED, () => { if(valid()) hls.loadSource(capability.hlsUrl); });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if(!valid()) return finish(aborted());
          if(hls.audioTracks[s.audioIndex]) hls.audioTrack = s.audioIndex;
        });
        hls.on(Hls.Events.FRAG_BUFFERED, () => { if(valid()) finish(); });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if(!valid()) return;
          boundedPush(s.metrics.errors, {at:Date.now(), type:data.type, details:data.details, fatal:!!data.fatal,
            sn:data.frag?.sn, url:data.frag?.url, response:data.response?.code});
          if(!data.fatal) return;
          if(s.recoveryController.recoverHls(data,hls)) return;
          const error = new Error(`Compatibility playback failed: ${data.details}`);
          if(!settled) finish(error); else s.fail(error);
        });
        hls.attachMedia(s.video);
      });
      s.assertCurrent(operation);
      s.video.currentTime = localTime;
      // HLS starts at the explicitly requested local position, including zero.
      // No live-edge seek or independent audio timestamp correction is allowed.
    }
    destroy() {
      const hls = this.hls;
      this.hls = null;
      if(this.session.hls === hls) this.session.hls = null;
      hls?.destroy();
    }
  }

  class PlayerSession {
    constructor({video, resolve, release = async()=>{}, loadHls, status, fetchText, onChange = ()=>{}}) {
      if(owners.has(video)) throw new Error('This video already has a PlayerSession');
      owners.set(video, this);
      Object.assign(this, {video, resolve, release, loadHls, status, fetchText, onChange});
      this.sequence = 0;
      this.seekSequence = 0;
      this.subtitleSequence = 0;
      this.state = STATES.IDLE;
      this.active = false;
      this.masterClock = new MasterClock();
      Object.defineProperties(this, {
        globalDuration:{get:()=>this.masterClock.canonicalDuration,set:value=>{this.masterClock.canonicalDuration=Math.max(0,number(value));}},
        globalCurrentTime:{get:()=>this.masterClock.globalCurrentTime,set:value=>{this.masterClock.globalCurrentTime=this.masterClock.clamp(value);this.masterClock.presentationClock=this.masterClock.globalCurrentTime;}},
        windowStart:{get:()=>this.masterClock.windowStart,set:value=>{this.masterClock.windowStart=Math.max(0,number(value));}},
      });
      this.avSynchronizer = new AVSynchronizer(this.masterClock);
      this.bufferManager = new BufferManager(this.masterClock);
      this.recoveryController = new RecoveryController(this);
      this.seekController = new SeekController(this);
      this.speed = 1;
      this.volume = video.volume;
      this.muted = video.muted;
      this.audioTracks = [];
      this.subtitleTracks = [];
      this.audioIndex = 0;
      this.subtitleIndex = -1;
      this.abortControllers = new Set();
      this.listeners = [];
      this.subtitleCache = new Map();
      this.releases = new Map();
      this.health = {};
      this.metrics = {errors:[], stalls:[], seeks:[], samples:[]};
    }
    emit() { this.onChange(this.snapshot()); }
    snapshot() {
      return {state:this.state, active:this.active, canonicalMediaId:this.canonicalMediaId,
        sourceIdentity:this.sourceIdentity, mode:this.mode, globalDuration:this.globalDuration,
        globalCurrentTime:this.globalCurrentTime, windowStart:this.windowStart,
        audioTracks:this.audioTracks, subtitleTracks:this.subtitleTracks,
        audioIndex:this.audioIndex, subtitleIndex:this.subtitleIndex,
        speed:this.speed, volume:this.volume, muted:this.muted, wantsPlay:this.wantsPlay,
        seeking:this.seeking, buffering:this.buffering, presentationClock:this.masterClock.presentationClock,
        sessionGeneration:this.sequence, seekGeneration:this.seekSequence,
        health:{...this.health,...this.bufferManager.snapshot(),...this.avSynchronizer.snapshot()}, error:this.error};
    }
    getCurrentTime() { return this.masterClock.globalCurrentTime; }
    getDuration() { return this.masterClock.canonicalDuration; }
    transition(state) { this.state = state; this.buffering = state === STATES.BUFFERING; this.emit(); }
    controller() { const c = new AbortController(); this.abortControllers.add(c); return c; }
    operation() {
      this.operationController?.abort();
      this.abortControllers.delete(this.operationController);
      const controller = this.operationController = this.controller();
      return {sequence:this.sequence, seek:++this.seekSequence, signal:controller.signal};
    }
    current(op) { return this.active && op.sequence === this.sequence && op.seek === this.seekSequence && !op.signal.aborted; }
    assertCurrent(op) { if(!this.current(op)) throw aborted(); }
    listen(event, handler) {
      const sequence = this.sequence;
      const guarded = (...args) => { if(this.active && sequence === this.sequence) handler(...args); };
      this.video.addEventListener(event, guarded);
      this.listeners.push(() => this.video.removeEventListener(event, guarded));
    }
    waitForMedia(event, op, ready) {
      return new Promise((resolve, reject) => {
        let timer;
        const finish = error => {
          clearTimeout(timer);
          this.video.removeEventListener(event, done);
          this.video.removeEventListener('error', failed);
          op.signal.removeEventListener('abort', cancel);
          error ? reject(error) : resolve();
        };
        const done = () => finish(this.current(op) ? null : aborted());
        const failed = () => finish(new Error('Browser could not load media'));
        const cancel = () => finish(aborted());
        this.video.addEventListener(event, done);
        this.video.addEventListener('error', failed);
        op.signal.addEventListener('abort', cancel, {once:true});
        timer = setTimeout(() => finish(new Error('Media preparation timed out')), 45000);
        // Check in a microtask so the caller can first replace video.src.
        Promise.resolve().then(() => { if(op.signal.aborted) cancel(); else if(ready?.()) done(); });
      });
    }
    waitForPresentation(localTime, op, timeoutMs = 15000, thresholdSeconds = null) {
      return new Promise((resolve, reject) => {
        const started=Date.now();
        const check=()=>{
          if(!this.current(op)) return reject(aborted());
          const buffer=this.bufferManager.sample(this.video,this.mode);
          const remaining=Math.max(0,this.globalDuration-this.masterClock.localToGlobal(localTime));
          const desiredThreshold=Number.isFinite(Number(thresholdSeconds)) ? Number(thresholdSeconds) : this.bufferManager.startupThreshold(this.mode);
          const threshold=Math.min(desiredThreshold,remaining);
          const atTarget=Math.abs(number(this.video.currentTime)-localTime)<.35;
          if(atTarget && (buffer.secondsAhead>=threshold || remaining<.5)) return resolve();
          if(Date.now()-started>=timeoutMs) return reject(new Error('Seek target did not become ready'));
          setTimeout(check,75);
        };
        check();
      });
    }
    releaseCapability(capability) {
      if(!capability?.cacheKey) return Promise.resolve();
      const key = capability.cacheKey;
      if(this.releases.has(key)) return this.releases.get(key);
      const task = Promise.resolve().then(() => this.release(capability)).catch(()=>{}).finally(() => {
        if(this.releases.get(key) === task) this.releases.delete(key);
      });
      this.releases.set(key, task);
      return task;
    }
    close() {
      // Invalidate synchronously, before waiting for any backend cleanup.
      this.sequence++;
      this.seekSequence++;
      this.subtitleSequence++;
      this.active = false;
      for(const controller of this.abortControllers) controller.abort();
      this.abortControllers.clear();
      this.listeners.splice(0).forEach(remove => remove());
      clearInterval(this.healthTimer);
      clearTimeout(this.stallRecoveryTimer);
      this.adapter?.destroy();
      this.adapter = null;
      this.hls = null;
      this.clearSubtitle();
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.releaseCapability(this.capability);
      this.capability = null;
      this.source = null;
      this.canonicalMediaId = null;
      this.sourceIdentity = null;
      this.mode = null;
      this.globalDuration = this.globalCurrentTime = this.windowStart = 0;
      this.masterClock.reset();
      this.bufferManager.reset();
      this.avSynchronizer.reset();
      this.recoveryController.reset();
      this.audioTracks = this.subtitleTracks = [];
      this.audioIndex = 0;
      this.subtitleIndex = -1;
      this.seeking = this.buffering = this.wantsPlay = false;
      this.error = null;
      this.transition(STATES.IDLE);
    }
    async start(source, {resume = 0, autoplay = true} = {}) {
      this.close();
      this.active = true;
      this.source = {...source};
      this.wantsPlay = autoplay;
      this.metrics = {startedAt:Date.now(), firstFrameAt:null, errors:[], stalls:[], seeks:[], samples:[]};
      this.health = {fragmentLoadMs:null, networkBitsPerSecond:null, ffmpegSpeed:null};
      const op = this.operation();
      this.transition(STATES.RESOLVING);
      try {
        const capability = await this.resolve(this.source, {signal:op.signal});
        this.assertCurrent(op);
        if(number(capability.duration) <= 0) throw new Error('Full media duration is unavailable');
        this.masterClock.reset(number(capability.duration),0,0);
        this.canonicalMediaId = capability.source?.canonicalId || capability.id;
        this.sourceIdentity = capability.source?.fingerprint || this.canonicalMediaId;
        this.audioTracks = capability.audioTracks || [];
        this.subtitleTracks = capability.subtitleTracks || [];
        this.audioIndex = Math.max(0, this.audioTracks.findIndex(track => track.default));
        this.bindEvents();
        this.healthTimer = setInterval(() => { this.sampleHealth(); this.pollStatus(); }, 5000);
        this.capability = capability;
        const target = this.clamp(typeof resume === 'function' ? resume(this) : resume);
        if(target > 0) return await this.seekTo(target);
        await this.attach(capability, 0, op);
        this.assertCurrent(op);
        this.hydrateSubtitles();
        return true;
      } catch(error) {
        if(this.current(op) && error.name !== 'AbortError') this.fail(error);
        return false;
      }
    }
    clamp(time) { return Math.max(0, Math.min(number(time), Math.max(0, this.globalDuration - 0.05))); }
    async attach(capability, target, op) {
      this.assertCurrent(op);
      this.seeking = true;
      this.globalCurrentTime = target;
      this.transition(STATES.PREPARING);
      this.adapter?.destroy();
      this.adapter = null;
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.clearSubtitle();
      this.capability = capability;
      this.windowStart = capability.mode === 'direct' ? 0 : number(capability.windowStart);
      this.avSynchronizer.reset();
      this.mode = capability.mode === 'direct' ? 'DIRECT' : 'COMPATIBILITY';
      if(!['direct','hls'].includes(capability.mode)) throw new Error('Unknown playback transport');
      await this.releases.get(capability.cacheKey);
      this.assertCurrent(op);
      const adapter = this.adapter = capability.mode === 'direct' ? new DirectTransport(this) : new CompatibilityTransport(this);
      await adapter.attach(capability, Math.max(0,target-this.windowStart), op);
      this.assertCurrent(op);
      const localTarget=Math.max(0,target-this.windowStart);
      await this.waitForPresentation(localTarget,op);
      this.assertCurrent(op);
      this.masterClock.commitWindow(this.windowStart, localTarget);
      this.seeking = false;
      this.applyPreferences();
      this.metrics.readyAt=Date.now();
      this.transition(STATES.READY);
      if(this.subtitleIndex >= 0) this.setSubtitle(this.subtitleIndex);
      if(this.wantsPlay) await this.play();
    }
    async seekTo(globalSeconds) {
      if(!this.active || !this.capability || !this.globalDuration) return false;
      // Even an in-buffer seek cancels the previous deep-seek fetch/attachment.
      const {operation:op,target} = this.seekController.begin(globalSeconds);
      const startedAt = Date.now();
      const local = target-this.windowStart;
      this.seeking = true;
      this.globalCurrentTime = target;
      this.emit();
      try {
        if(this.adapter && this.state !== STATES.PREPARING && this.adapter.contains(local)) {
          this.video.pause();
          if(this.wantsPlay) this.transition(STATES.BUFFERING);
          else this.emit();
          this.adapter.seek(local);
          await this.waitForPresentation(local,op,15000,this.bufferManager.seekResumeThreshold(this.mode));
          this.assertCurrent(op);
          this.masterClock.commitWindow(this.windowStart, local);
          this.seeking = false;
          this.emit();
          if(this.wantsPlay) await this.play();
        } else {
          this.video.pause();
          if(this.wantsPlay) this.transition(STATES.BUFFERING);
          else this.emit();
          let capability = this.capability;
          if(capability.mode === 'hls') {
            capability = await this.resolve(this.source, {signal:op.signal, start:target});
            this.assertCurrent(op);
            if(capability.mode !== 'hls' || (capability.source?.fingerprint && capability.source.fingerprint !== this.sourceIdentity)) throw new Error('Media identity changed while seeking');
            this.subtitleTracks=capability.subtitleTracks || this.subtitleTracks;
          }
          const previous = this.capability;
          this.adapter?.destroy();
          this.adapter = null;
          if(previous.cacheKey !== capability.cacheKey) await this.releaseCapability(previous);
          this.assertCurrent(op);
          await this.attach(capability, target, op);
          this.assertCurrent(op);
        }
        boundedPush(this.metrics.seeks, {target, elapsedMs:Date.now()-startedAt, ok:true});
        return true;
      } catch(error) {
        if(this.current(op) && error.name !== 'AbortError') {
          boundedPush(this.metrics.seeks, {target, elapsedMs:Date.now()-startedAt, ok:false});
          this.seeking = false;
          this.fail(error);
        }
        return false;
      }
    }
    bindEvents() {
      this.listen('timeupdate', () => { this.updateTime(); this.sampleHealth(); });
      this.listen('durationchange', () => this.emit()); // Never read video.duration.
      this.listen('progress', () => this.sampleHealth());
      this.listen('playing', () => {
        if(this.state === STATES.PREPARING || !this.wantsPlay) return;
        clearTimeout(this.stallRecoveryTimer);
        if(!this.metrics.firstFrameAt) this.metrics.firstFrameAt = Date.now();
        const stall = this.metrics.stalls.at(-1);
        if(stall && !stall.endedAt) stall.endedAt = Date.now();
        this.transition(STATES.PLAYING);
      });
      this.listen('waiting', () => {
        if(!this.wantsPlay || this.seeking || this.state === STATES.PREPARING) return;
        if(this.metrics.firstFrameAt && !this.buffering) boundedPush(this.metrics.stalls, {startedAt:Date.now(), globalTime:this.globalCurrentTime});
        this.transition(STATES.BUFFERING);
        this.sampleHealth();
        clearTimeout(this.stallRecoveryTimer);
        const sequence=this.sequence,seek=this.seekSequence;
        this.stallRecoveryTimer=setTimeout(()=>{
          if(this.active && sequence===this.sequence && seek===this.seekSequence && this.state===STATES.BUFFERING) this.recoveryController.recoverStall(this.hls);
        },3000);
      });
      this.listen('stalled', () => this.sampleHealth());
      this.listen('seeked', () => { if(this.state !== STATES.PREPARING) { this.seeking = false; this.updateTime(); } });
      this.listen('ended', () => {
        if(this.seeking || this.state === STATES.PREPARING) return;
        this.updateTime();
        if(this.globalCurrentTime < this.globalDuration-2) return this.fail(new Error('Media source ended before the full title finished'));
        this.globalCurrentTime = this.globalDuration;
        this.wantsPlay = false;
        this.transition(STATES.ENDED);
      });
      this.listen('error', () => {
        if(this.adapter && !this.hls && this.state !== STATES.PREPARING) this.fail(new Error('Browser could not decode this source'));
      });
    }
    updateTime() {
      if(!this.seeking && this.adapter) this.masterClock.update(this.video.currentTime);
      this.emit();
    }
    applyPreferences() { this.video.playbackRate = this.speed; this.video.volume = this.volume; this.video.muted = this.muted; }
    async play() {
      if(!this.active) return;
      this.wantsPlay = true;
      if(!this.adapter || this.state === STATES.PREPARING) { this.emit(); return; }
      const sequence = this.sequence, seek = this.seekSequence, adapter = this.adapter;
      try {
        await this.video.play();
        if(this.active && sequence === this.sequence && seek === this.seekSequence && adapter === this.adapter && this.wantsPlay) this.transition(STATES.PLAYING);
      } catch(error) {
        if(sequence !== this.sequence || seek !== this.seekSequence || adapter !== this.adapter) return;
        if(error.name === 'NotAllowedError') { this.wantsPlay = false; this.transition(STATES.READY); }
        else if(error.name !== 'AbortError') this.fail(error);
      }
    }
    pause() { this.wantsPlay = false; this.video.pause(); if(this.active && this.state !== STATES.PREPARING && this.state !== STATES.RESOLVING) this.transition(STATES.PAUSED); else this.emit(); }
    togglePlay() { return this.wantsPlay ? this.pause() : this.play(); }
    setSpeed(value) { this.speed = Math.min(4,Math.max(0.25,number(value)||1)); this.applyPreferences(); this.emit(); }
    setVolume(value) { this.volume = Math.min(1,Math.max(0,number(value))); this.muted = this.volume === 0; this.applyPreferences(); this.emit(); }
    setMuted(value) { this.muted = !!value; this.applyPreferences(); this.emit(); }
    setAudio(index) {
      if(!Number.isInteger(index) || !this.audioTracks[index]) return false;
      this.audioIndex = index;
      if(this.hls?.audioTracks[index]) this.hls.audioTrack = index;
      else if(this.video.audioTracks?.length) {
        for(let i=0;i<this.video.audioTracks.length;i++) this.video.audioTracks[i].enabled = i === index;
      } else if(this.state !== STATES.PREPARING && this.mode === 'DIRECT' && this.audioTracks.length > 1) return false;
      // Rendition switching owns timestamp/buffer continuity. No delayed seeks.
      this.emit();
      return true;
    }
    clearSubtitle() {
      this.subtitleSequence++;
      this.subtitleController?.abort();
      this.abortControllers.delete(this.subtitleController);
      this.subtitleElement?.remove();
      this.subtitleElement = null;
      if(this.subtitleBlob) URL.revokeObjectURL(this.subtitleBlob);
      this.subtitleBlob = null;
    }
    async setSubtitle(index) {
      this.clearSubtitle();
      this.subtitleIndex = index;
      this.emit();
      if(index < 0 || !this.active) return true;
      const track = this.subtitleTracks[index];
      if(!track?.supported || !track.url) { this.subtitleIndex = -1; this.emit(); return false; }
      const token = this.subtitleSequence, sequence = this.sequence, offset = this.windowStart;
      const controller = this.subtitleController = this.controller();
      try {
        let text = this.subtitleCache.get(track.url);
        if(!text) {
          text = await this.fetchText(track.url, controller.signal);
          if(!/^\uFEFF?WEBVTT/.test(text)) throw new Error('Invalid subtitle response');
          this.subtitleCache.set(track.url, text);
          if(this.subtitleCache.size > 12) this.subtitleCache.delete(this.subtitleCache.keys().next().value);
        }
        if(controller.signal.aborted || !this.active || sequence !== this.sequence || token !== this.subtitleSequence) return false;
        const element = this.video.ownerDocument.createElement('track');
        element.kind = 'subtitles';
        element.label = track.title || track.language || 'Subtitles';
        element.srclang = track.language || 'und';
        this.subtitleBlob = URL.createObjectURL(new Blob([windowVtt(text, track.timeline === 'local' ? 0 : offset)], {type:'text/vtt'}));
        element.src = this.subtitleBlob;
        element.default = true;
        this.subtitleElement = element;
        element.addEventListener('load', () => { if(this.subtitleElement === element && sequence === this.sequence) element.track.mode = 'showing'; }, {once:true});
        this.video.appendChild(element);
        element.track.mode = 'showing';
        return true;
      } catch(error) {
        if(error.name !== 'AbortError' && token === this.subtitleSequence && sequence === this.sequence) {
          this.subtitleIndex = -1;
          boundedPush(this.metrics.errors, {at:Date.now(), subtitle:true, message:error.message});
          this.emit();
        }
        return false;
      } finally { this.abortControllers.delete(controller); }
    }
    async hydrateSubtitles() {
      if(this.source?.kind !== 'remote') return;
      const sequence = this.sequence, controller = this.controller();
      try {
        const result = await this.resolve(this.source, {signal:controller.signal, sidecars:true});
        if(this.active && sequence === this.sequence && !controller.signal.aborted) { this.subtitleTracks = result.subtitleTracks || this.subtitleTracks; this.emit(); }
      } catch(_) {} finally { this.abortControllers.delete(controller); }
    }
    sampleHealth() {
      if(!this.active) return;
      const local = number(this.video.currentTime);
      const buffer = this.bufferManager.sample(this.video,this.mode);
      if(this.mode === 'DIRECT') this.avSynchronizer.inferNative();
      Object.assign(this.health, {globalCurrentTime:this.globalCurrentTime,localCurrentTime:local,...buffer,...this.avSynchronizer.snapshot()});
      if(!this.lastSampleAt || Date.now()-this.lastSampleAt >= 1000) {
        this.lastSampleAt = Date.now();
        boundedPush(this.metrics.samples, {at:Date.now(), ...this.health});
      }
      this.emit();
    }
    async pollStatus() {
      if(!this.status || !this.capability?.cacheKey || this.statusPending) return;
      const sequence = this.sequence, key = this.capability.cacheKey, controller = this.controller();
      this.statusPending = controller;
      try {
        const status = await this.status(key, controller.signal);
        if(this.active && sequence === this.sequence && key === this.capability?.cacheKey) {
          this.health.ffmpegSpeed = status?.speed ?? null;
          this.bufferManager.generationSpeed = this.health.ffmpegSpeed;
          this.health.generatedEnd = status ? number(status.windowStart)+number(status.outTimeSeconds) : null;
          this.emit();
        }
      } catch(_) {} finally {
        if(this.statusPending === controller) this.statusPending = null;
        this.abortControllers.delete(controller);
      }
    }
    fail(error) { if(!this.active) return; this.error = error.message; this.wantsPlay = false; this.video.pause(); this.transition(STATES.ERROR); }
  }
  return {PlayerSession, PlayerSessionStates:STATES, DirectTransport, CompatibilityTransport, MasterClock, SeekController, BufferManager, AVSynchronizer, RecoveryController, SeekGeometry, windowVtt};
});
