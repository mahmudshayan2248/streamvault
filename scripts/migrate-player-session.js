'use strict';

// Apply the same ownership boundary to both frontend builds, including the
// production snapshot. Parse function boundaries rather than editing titles or
// blindly replacing the deployed application's unrelated catalog/UI changes.
const fs = require('node:fs');
const acorn = require('acorn');

function migrateApp(source) {
  if(source.includes('SV_PLAYER_SESSION_BOUNDARY')) return source;
  const ast = acorn.parse(source, {ecmaVersion:'latest', sourceType:'script'});
  const edits = [];
  const delegate = {
    playMedia:"return window.StreamVaultPlayerView.start({kind:'local',id,name,year});",
    playFtpMedia:"return window.StreamVaultPlayerView.start({kind:'remote',url:streamUrl,name,year});",
    seekToTime:"return window.playerSession?.seekTo(seconds);",
    sourceSeekTo:"return window.playerSession?.seekTo(arguments[0]);",
    ftpSeekTo:"return window.playerSession?.seekTo(arguments[0]);",
  };
  const guards = {
    setPlayerDuration:'return window.playerSession.globalDuration;',
    playerDuration:'return window.playerSession.globalDuration;',
    playbackTime:'return window.playerSession.globalCurrentTime;',
    togglePlay:'return window.playerSession.togglePlay();',
    svPlayVideo:'return window.playerSession.play();',
    setAudio:'window.playerSession.setAudio(Number(arguments[0])); closeAllDropdowns(); return;',
    setSub:'window.playerSession.setSubtitle(Number(arguments[0])); closeAllDropdowns(); return;',
    setSpeed:'window.playerSession.setSpeed(Number(arguments[0])); closeAllDropdowns(); return;',
    setVolume:'return window.playerSession.setVolume(arguments[0]);',
    toggleMute:'return window.playerSession.setMuted(!window.playerSession.muted);',
    updatePlayIcons:'return window.StreamVaultPlayerView.render(window.playerSession.snapshot());',
    renderCentralPlaybackState:'return window.StreamVaultPlayerView.render(window.playerSession.snapshot());',
    setCentralPlaybackLoading:'return;',
    setCentralPlaybackError:'return;',
  };
  const retired = new Set([
    'loadPlayerDuration','loadFtpDuration','maybeResumeProgress','switchToSmoothPlaybackProfile',
    'noteSmoothPlaybackBuffering','noteSmoothPlaybackStarted','startPlayerUiClock',
    'refreshDesktopNativeAudioTracks','refreshDesktopNativeSubtitleTracks',
    'ensureFtpTrackOptionsLoaded','ensureLocalTrackOptionsLoaded','setQuality',
    'svRunMediaAudioWatchdog','svApplyServerAudioAuthority','svApplyActiveAudioAuthority',
    'svForceMediaAudioOutput','svResetMediaAudioOnSourceSwitch','svArmNativeAudioResetOnLoad',
    'setAppliedAudioIndex','applyPreferredAudioNatively','scheduleSubtitleOverlayUpdate',
    'updateSubtitleOverlay','schedulePlayerProgressRender','schedulePlayerBufferedRender',
  ]);
  const seen = new Set();
  for(const node of ast.body) {
    if(node.type !== 'FunctionDeclaration') continue;
    const name = node.id.name;
    if(delegate[name]) {
      edits.push([node.body.start,node.body.end,`{\n  // SV_PLAYER_SESSION_BOUNDARY: retired VOD pipeline.\n  ${delegate[name]}\n}`]);
      seen.add(name);
    } else if(guards[name]) {
      edits.push([node.body.start+1,node.body.start+1,`\n  if(window.playerSession?.active) { ${guards[name]} }\n`]);
    } else if(retired.has(name)) {
      edits.push([node.body.start+1,node.body.start+1,'\n  if(window.playerSession && !isLiveMode) return;\n']);
    } else if(name === 'closePlayer') {
      edits.push([node.body.start+1,node.body.start+1,'\n  if(window.playerSession?.active) window.playerSession.close();\n']);
    } else if(name === 'setupPlayerEvents') {
      const body = source.slice(node.body.start,node.body.end);
      const marker = body.indexOf("vid.addEventListener('timeupdate'");
      if(marker < 0) throw new Error('Legacy player listener boundary not found');
      const guard = `// Legacy media event handlers are exclusively for Live TV.\n  for(const name of ['_tuH','_prH','_mdH','_enH','_waH','_stH','_sgH','_plH','_cpH','_paH','_puH','_skH']) {\n    const handler = vid[name];\n    vid[name] = (...args) => { if(!window.playerSession || isLiveMode) return handler(...args); };\n  }\n  `;
      edits.push([node.body.start+marker,node.body.start+marker,guard]);
    }
  }
  for(const name of ['playMedia','playFtpMedia','seekToTime']) if(!seen.has(name)) throw new Error(`Missing required entry point ${name}`);
  edits.sort((a,b)=>b[0]-a[0]).forEach(([start,end,text])=>{source=source.slice(0,start)+text+source.slice(end);});
  // Prevent a drag release from issuing a second click seek to the same point.
  source = source.replace("progressDragging=false; pw.classList.remove('dragging');", "suppressProgressClickUntil=Date.now()+450; progressDragging=false; pw.classList.remove('dragging');");
  acorn.parse(source, {ecmaVersion:'latest'});
  return source;
}

function migrateIndex(source) {
  const retired = ['instant-remux-v23','vod-buffer-engine-v1','playback-stability-hotfix-v2'];
  for(const name of retired) source = source.replace(new RegExp(`<script[^>]+src=["']/?${name}\\.js[^>]*></script>\\s*`,'g'),'');
  source = source.replace(/(app-v3\.js\?v=)[^"']+/g,'$120260911-player-session-v1');
  source = source.replace(/(player-vlc-v1\.(?:js|css)\?v=)[^"']+/g,'$120260911-player-session-v1');
  if(!source.includes('/player-session.js')) source=source.replace(/(<script[^>]+src=["']\/player-vlc-v1\.js[^>]*><\/script>)/, '<script defer src="/player-session.js?v=20260911-player-session-v1"></script>\n$1');
  return source;
}

if(require.main === module) {
  for(const file of process.argv.slice(2)) {
    const source = fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,file.endsWith('.html')?migrateIndex(source):migrateApp(source));
    console.log(`Migrated ${file}`);
  }
}
module.exports = {migrateApp,migrateIndex};
