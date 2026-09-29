const SV_THEME_KEY = 'sv_theme';
const SV_DEBUG_LOGS = (()=>{ try{return new URLSearchParams(location.search).has('debug') || localStorage.getItem('sv_debug') === '1';}catch{return false;} })();
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
let currentDetailMovie = null;
let currentStreamId=null,currentQuality='auto',currentSpeed=1,currentSubIdx=-1;
let availableSubs=[];
let _localTrackLoadPromise=null;
let currentShow=null,currentSeason=1;
let _playerShow=null,_playerSeason=null,_playerEpIdx=null;
let uiHideTimer=null,uiVisible=true;
let isDragging=false,lastTapTime=0,lastTapX=0;
let progressDragging=false,progressDragTime=0;
let currentLiveCat='All';
let isLiveMode=false;
let hlsInstance=null;
let _hlsLoader=null;
let _currentPlaybackPlan=null;
let _currentFtpPlaybackPlan=null;
function loadHlsScript(){
  if(typeof Hls !== 'undefined')return Promise.resolve(true);
  if(_hlsLoader)return _hlsLoader;
  _hlsLoader = new Promise(resolve=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/hls.js@latest';
    script.async=true;
    script.onload=()=>resolve(typeof Hls !== 'undefined');
    script.onerror=()=>resolve(false);
    document.head.appendChild(script);
  });
  return _hlsLoader;
}

async function attachPlayerSource(src, mode='direct'){
  if(!src)return false;
  const isHls = mode === 'hls' || /\.m3u8(?:$|\?)/i.test(String(src));
  if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}
  if(!isHls){
    vid.src = src;
    return true;
  }

  if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.src = src;
    return true;
  }

  const ok = await loadHlsScript();
  if(!ok || typeof Hls === 'undefined' || !Hls.isSupported())return false;

  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      resolve(value);
    };
    hlsInstance=new Hls({
      enableWorker:true,
      lowLatencyMode:false,
      startFragPrefetch:true,
      capLevelToPlayerSize:true,
      maxBufferLength:isMobilePlaybackClient()?20:45,
      maxMaxBufferLength:isMobilePlaybackClient()?40:90,
      maxBufferSize:isMobilePlaybackClient()?20*1000*1000:60*1000*1000,
      backBufferLength:30,
      fragLoadingTimeOut:20000,
      manifestLoadingTimeOut:15000,
    });
    hlsInstance.on(Hls.Events.MEDIA_ATTACHED,()=>hlsInstance.loadSource(src));
    hlsInstance.on(Hls.Events.MANIFEST_PARSED,()=>finish(true));
    hlsInstance.on(Hls.Events.ERROR,(e,data)=>{
      if(!data?.fatal)return;
      console.warn('[HLS] fatal error:', data.type, data.details);
      try{hlsInstance?.destroy();}catch(_){}
      hlsInstance=null;
      finish(false);
    });
    hlsInstance.attachMedia(vid);
    setTimeout(()=>finish(true), 5000);
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
  return match[1].split(/\s*\+\s*|\s*\/\s*/).map(part=>part.replace(/\b\d(?:\.\d)?\b|\b(?:AAC|DDP?|AC3|DTS|Atmos)\b/ig,'').trim()).filter(Boolean);
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

function renderAudioTracks(){
  const list = document.getElementById('audioList');
  if(!list)return;
  const tool = document.querySelector('.audio-tool');
  const separator = document.querySelector('.tool-sep');
  if(availableAudio.length < 2){
    list.innerHTML = `<div class="pd-item" style="color:#666;pointer-events:none">No switchable audio tracks</div>`;
    if(tool)tool.style.display='';
    if(separator)separator.style.display='';
    const label = document.getElementById('audioLabel');
    if(label)label.textContent='Audio';
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
}

async function loadAudioTracks(id){
  availableAudio = [{index:0,title:'Default Audio'}];
  currentAudioIdx = 0;
  renderAudioTracks();
  try{
    const r = await fetch(`/api/media-info/${id}`);
    if(!r.ok)return;
    const data = await r.json();
    const tracks = Array.isArray(data.audioTracks) ? data.audioTracks : [];
    if(tracks.length){
      const hints=filenameAudioHints(typeof localFileForStreamId==='function'?localFileForStreamId(id):'');
      const discovered = tracks.map((track,i)=>({
        ...audioTrackWithFallback(track,i,hints),
        index: i,
        sourceIndex: track.index,
        streamIndex: track.index,
        title: audioTrackTitle(audioTrackWithFallback(track,i,hints),i),
      }));
      const nativeTracks = !isMobilePlaybackClient() ? desktopNativeAudioTracks() : [];
      availableAudio = nativeTracks.length > 1 && nativeTracks.length >= discovered.length ? nativeTracks : discovered;
      renderAudioTracks();
    }
  }catch(e){
    console.warn('[Audio] Load error:', e.message);
  }
}

function resetLocalTrackOptions(){
  _localTrackLoadPromise = null;
  availableAudio = [{index:0,title:'Default Audio'}];
  availableSubs = [];
  currentAudioIdx = 0;
  currentSubIdx = -1;
  renderAudioTracks();
  const subList = document.getElementById('subList');
  if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Open to load subtitles</div>`;
  updateSubBtn?.();
}

function ensureLocalTrackOptionsLoaded(){
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
    svRenderLazyTrack(trackId,rowId,sorted,m=>cardHTML(m,sp),{limit:50});
    return;
  }
  document.getElementById(trackId).innerHTML = sorted.slice(0,18).map(m=>cardHTML(m,sp)).join('');
}

// ══════════════════ INIT ══════════════════
async function init(){
  try{
    const[mR,sR]=await Promise.all([
      fetch('/api/movies?page=0&limit=24'),
      fetch('/api/series?summary=1&limit=24')
    ]);
    const mData = await mR.json();
    movies = mData.movies.filter(m=>m&&m.name);
    series = await sR.json();

    // Client-side cartoon filter
    movies = movies.filter(m => !isCartoonClient(m));
    series = series.filter(s => !isCartoonClient(s));

    _totalMoviePages = Math.ceil((mData.total || movies.length) / _movieBrowsePageSize);

    setTimeout(()=>{
      svIdleTask(()=>{
        fetch('/api/trending').then(r=>r.json()).then(d=>{
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
        fetch(`/api/movies?page=${p}&limit=100`)
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
  }catch{
    const heroTitle = document.getElementById('heroTitle');
    if(heroTitle)heroTitle.textContent='Could not connect to server';
    return;
  }
  buildHero();buildRows();buildSpeedList();
  // Online homepage refreshes are disabled for now so loaded home rows stay stable.

  try{
    const cR=await fetch('/api/channels');
    channels=await cR.json();
  }catch{
    channels=[];
  }
  buildLiveTV();
  buildLiveHomeRow();
}

function loadAllMoviesForBrowse(){
  if(_allMoviesLoaded) return;
  _allMoviesLoaded=true;
  const startPage=0;
  let loaded=0;
  const total=Math.max(0,_totalMoviePages-startPage);
  for(let p=startPage; p<_totalMoviePages; p++){
    setTimeout(()=>{
      fetch(`/api/movies?page=${p}&limit=${_movieBrowsePageSize}`)
        .then(r=>r.json())
        .then(d=>{
          let newMovies = d.movies.filter(m=>m&&m.name);
          newMovies = newMovies.filter(m => !isCartoonClient(m));
          mergeMovieList(newMovies);
          loaded++;
          if(loaded%4===0||loaded===total){
            if(document.getElementById('moviesSection').style.display!=='none') filterMoviesPage();
          }
        });
    }, (p-startPage)*260);
  }
}

async function loadAllSeriesForBrowse(){
  if(_allSeriesLoaded) return;
  _allSeriesLoaded = true;
  try{
    const r = await fetch('/api/series');
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
  currentTab=tab;
  const isHome=tab==='discover';
  closeSearchOverlay(true);
  document.getElementById('mainSection').style.display=isHome?'block':'none';
  document.getElementById('hero').style.display=isHome?'block':'none';
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
    filterSeriesPage();
    loadAllSeriesForBrowse().then(()=>filterSeriesPage());
  }
  if(tab==='movies-browse'){
    document.getElementById('bnMovies')?.classList.add('active');
    loadAllMoviesForBrowse();
    renderMoviesPage();
  }
  if(tab==='live'){if(channels.length)renderLiveGrid();}
  if(tab==='mobile-mp4'){renderMobileMp4Page();}
  if(tab==='library'){document.getElementById('bnLibrary')?.classList.add('active');renderLibraryPage();}
  if(tab==='downloads'){document.getElementById('bnDownloads')?.classList.add('active');if(typeof loadDownloads==='function')loadDownloads();if(typeof renderDownloadsPage==='function')renderDownloadsPage();}
  if(tab==='search'){
    document.getElementById('bnSearch')?.classList.add('active');
    renderSearchPage(document.getElementById('searchPageInput')?.value || '');
    setTimeout(()=>document.getElementById('searchPageInput')?.focus(),60);
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

function openLiveChannel(channelId, channelName){
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
  try{vid.load();}catch{}
  vid.querySelectorAll('track').forEach(t=>t.remove());
  clearSubtitleOverlay();
  document.getElementById('playerTitle').textContent=channelName;
  document.getElementById('playerSubTitle').textContent='';
  document.getElementById('playerLiveBadge').classList.add('show');
  document.getElementById('progressWrap').classList.add('live-mode');
  document.getElementById('timeDur').textContent='LIVE';
  document.getElementById('timeNow').textContent='';
  document.getElementById('playerModal').classList.add('open');
  document.getElementById('playerSpinner').classList.add('on');
  document.body.style.overflow='hidden';
  showUI();

  const src=`/live/${encodeURIComponent(channelId)}/playlist.m3u8`;

  const playNative=()=>{
    vid.src=src;
    vid.play().catch(()=>{});
  };

  const playWithHls=()=>{
    if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}
    hlsInstance=new Hls({
      enableWorker:true,
      lowLatencyMode:false,
      liveSyncDurationCount:3,
      liveMaxLatencyDurationCount:10,
      maxLiveSyncPlaybackRate:1.25,
      manifestLoadingTimeOut:15000,
      fragLoadingTimeOut:20000,
      levelLoadingTimeOut:15000
    });
    hlsInstance.on(Hls.Events.MEDIA_ATTACHED,()=>hlsInstance.loadSource(src));
    hlsInstance.on(Hls.Events.MANIFEST_PARSED,()=>vid.play().catch(()=>{}));
    hlsInstance.on(Hls.Events.ERROR,(e,data)=>{
      if(!data?.fatal)return;
      if(data.type===Hls.ErrorTypes.NETWORK_ERROR){
        try{hlsInstance.startLoad();}catch{}
        return;
      }
      if(data.type===Hls.ErrorTypes.MEDIA_ERROR){
        try{hlsInstance.recoverMediaError();}catch{}
        return;
      }
      showToast('Stream error — check channel URL in channels.json');
      document.getElementById('playerSpinner').classList.remove('on');
      try{hlsInstance.destroy();}catch{}
      hlsInstance=null;
    });
    hlsInstance.attachMedia(vid);
  };

  if(typeof Hls !== 'undefined' && Hls.isSupported()){
    playWithHls();
  }else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    playNative();
  }else{
    loadHlsScript().then(ok=>{
      if(ok && typeof Hls !== 'undefined' && Hls.isSupported())playWithHls();
      else{
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
  hEl.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;},{passive:true});
  hEl.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50){dx<0?setHero((heroIdx+1)%heroMovies.length):setHero((heroIdx-1+heroMovies.length)%heroMovies.length);resetHeroTimer();}},{passive:true});
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
    document.getElementById(trackId).innerHTML = list.slice(0, 50).map(item => item._isSeries ? sCardHTML(item) : cardHTML(item)).join('');
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
  
  document.getElementById(trackId).innerHTML = list.slice(0, 50).map(item =>
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
    const r = await fetch(`/api/movies/keywords?q=${encodeURIComponent(keywords.join(','))}`);
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
  document.getElementById(trackId).innerHTML = list.slice(0, 50).map(m => cardHTML(m)).join('');
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
    
    document.getElementById(trackId).innerHTML = list.slice(0, 50).map(item =>
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
  if(list.length >= 1){document.getElementById(tid).innerHTML=list.slice(0,50).map(item=>item._isSeries?sCardHTML(item):cardHTML(item)).join('');show(rid);}else hide(rid);
}
function bgrLang(tid, rid, langs){
  const mList = movies.filter(m => langMatch(m, langs));
  const sList = series.filter(s => langMatch(s, langs)).map(s=>({...s,_isSeries:true}));
  const list = _dedupSort([...sList, ...mList]);
  if(list.length >= 1){document.getElementById(tid).innerHTML=list.slice(0,50).map(item=>item._isSeries?sCardHTML(item):cardHTML(item)).join('');show(rid);}else hide(rid);
}
function bgrCustom(tid, rid, predFn){
  const mList = movies.filter(predFn);
  const sList = series.filter(predFn).map(s=>({...s,_isSeries:true}));
  const list = _dedupSort([...sList, ...mList]);
  if(list.length >= 1){document.getElementById(tid).innerHTML=list.slice(0,50).map(item=>item._isSeries?sCardHTML(item):cardHTML(item)).join('');show(rid);}else hide(rid);
}
function bsr(tid,rid){if(!series.length){hide(rid);return;}document.getElementById(tid).innerHTML=series.slice(0,50).map(sCardHTML).join('');show(rid);}
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
    onclick=`showToast('📺 "${sn}" — Not in your library')`;
  } else if(m.streamUrl){
    const streamUrl=esc(m.streamUrl).replace(/'/g,"\\'");
    onclick=`playFtpMedia('${streamUrl}','${sn}','${esc(m.year||'')}')`;
  }else{
    onclick=`playMedia(${m.id},'${sn}','${esc(m.year||'')}')`;
  }
  const unavailableOverlay = isUnplayable ? `<div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:3px 7px;font-size:.5rem;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.45)">NOT IN LIBRARY</div>` : '';
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

async function loadSeriesOnlineDetails(show, token){
  try{
    const details = await fetchTitleDetails(show, 'tv');
    if(token !== _titleDetailsToken || currentShow !== show)return;
    mergeTitleDetails(show, details);
    renderOnlineSections('sm', details || {}, 'tv', show);
    renderSeriesAbout(show, details);
    const overviewEl = document.getElementById('smOverview');
    if(details?.overview && !overviewEl.textContent){
      overviewEl.textContent = details.overview;
      setupSeriesOverview(details.overview);
    }
    const poster = document.getElementById('smPoster');
    const backdrop = document.getElementById('smBackdrop');
    if(details?.poster && !poster.getAttribute('src')){poster.src = svOptimizeImageUrl(details.poster, false);poster.style.display='';}
    if(details?.backdrop && !backdrop.getAttribute('src')){backdrop.src = svOptimizeImageUrl(details.backdrop, true);backdrop.style.display='';}
  }catch(e){
    console.warn('[Series] Online details unavailable:', e.message);
    renderOnlineSections('sm', localTitleDetails(show, 'tv'), 'tv', show);
  }
}

function openSeriesDetail(key){
  const show = _seriesDetailRegistry.get(key);
  if(show)showSeriesDetail(show);
}

function showSeriesDetail(show){
  currentShow=show;
  recordWatchHistory(show.id||show.name, show.name, show.genre||'', 'series');
  document.getElementById('smTitle').textContent=show.name || 'Untitled';
  document.getElementById('smRating').textContent=show.rating?'\u2605 '+show.rating:'';
  document.getElementById('smYear').textContent=show.year||'';
  document.getElementById('smGenre').textContent=show.genre?show.genre.split(',').slice(0,2).join(' / '):'';
  setupSeriesOverview(show.overview || '');
  document.getElementById('smDot1').style.display=show.rating?'':'none';
  document.getElementById('smDot2').style.display=(show.year&&show.genre)?'':'none';
  const bd=document.getElementById('smBackdrop');
  if(show.poster||show.backdrop){bd.src=svOptimizeImageUrl(show.backdrop||show.poster, true);bd.style.display='';}
  else {bd.removeAttribute('src');bd.style.display='none';}
  const sp=document.getElementById('smPoster');
  if(sp){
    if(show.poster||show.backdrop){sp.src=svOptimizeImageUrl(show.poster||show.backdrop, false);sp.style.display='';}
    else {sp.removeAttribute('src');sp.style.display='none';}
  }
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
  setOnlinePlaceholders('sm');
  renderSeriesMediaInfo(show);
  renderSeriesAbout(show);
  const token = ++_titleDetailsToken;
  loadSeriesOnlineDetails(show, token);
  document.getElementById('seriesModal').classList.add('open');
  document.getElementById('seriesModal').scrollTop=0;
  document.body.style.overflow='hidden';
}

function openSeriesModal(showName){
  const show=series.find(s=>s.name===showName||esc(s.name)===showName);
  if(show)showSeriesDetail(show);
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
  document.body.style.overflow='hidden';
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
    const thumb=ep.thumb||ep.thumbnail||ep.poster||(ep.streamId!=null?`/api/thumbnail/${ep.streamId}`:fallbackRaw);
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
  const show=series.find(s=>s.name===showName||esc(s.name)===showName);
  if(!show)return;
  const eps=show.seasons[season]||[];
  const ep=eps[epIdx];
  if(!ep)return;
  const sNum=String(season).padStart(2,'0');
  const eNum=String(ep.episode).padStart(2,'0');
  const lbl=`${show.name} S${sNum}E${eNum}${ep.epTitle?' – '+ep.epTitle:''}`;
  if(ep.streamUrl){
    playFtpMedia(ep.streamUrl,lbl,'');
  }else{
    playMedia(ep.streamId,lbl,'');
  }
  setTimeout(()=>showSeriesPlayerBar(show,season,epIdx),100);
}

function closeSeriesModal(){document.getElementById('seriesModal').classList.remove('open');document.body.style.overflow='';}

function showSeriesPlayerBar(show, season, epIdx){
  _playerShow=show; _playerSeason=season; _playerEpIdx=epIdx;
  const bar=document.getElementById('seriesPlayerBar');
  bar.classList.add('show');
  const eps=show.seasons[season]||[];
  const ep=eps[epIdx];
  const epNum=String(epIdx+1).padStart(2,'0');
  document.getElementById('seriesEpLabel').textContent=`S${String(season).padStart(2,'0')}E${epNum}${ep&&ep.epTitle?' – '+ep.epTitle:''}`;
  document.getElementById('seriesShowLabel').textContent=show.name;
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
  setTimeout(()=>document.addEventListener('click',_seriesDDOutside,{once:true}),10);
}

function _seriesDDOutside(e){
  if(!e.target.closest('.spd-series')&&!e.target.closest('.series-ctrl-btn')){
    closeAllSeriesDropdowns();
  }
}

function closeAllSeriesDropdowns(){
  document.querySelectorAll('.spd-series.open').forEach(d=>d.classList.remove('open'));
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
  if(ep.streamUrl){
    playFtpMedia(ep.streamUrl,lbl,'');
  }else{
    playMedia(ep.streamId,lbl,'');
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
  if(firstEp.streamUrl){
    playFtpMedia(firstEp.streamUrl,lbl,'');
  }else{
    playMedia(firstEp.streamId,lbl,'');
  }
  setTimeout(()=>showSeriesPlayerBar(show,firstSeason,0),100);
}

const vid=document.getElementById('videoPlayer');
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
  if(!subtitleOverlay)return;
  const textTrack = selectedTextTrack();
  const cues = textTrack?.activeCues ? Array.from(textTrack.activeCues) : [];
  const text = cues.map(plainCueText).filter(Boolean).join('\n');
  subtitleOverlay.innerHTML = text ? `<span>${esc(text)}</span>` : '';
  subtitleOverlay.classList.toggle('show', !!text);
}

function bindSubtitleTrack(trackEl){
  if(!trackEl || trackEl._svBound)return;
  trackEl._svBound = true;
  trackEl.addEventListener('load', updateSubtitleOverlay);
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
  if(trackEl.track)trackEl.track.addEventListener('cuechange', updateSubtitleOverlay);
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
    return;
  }
  list.innerHTML=`<div class="pd-item${currentSubIdx===-1?' active':''}" onclick="setSub(-1)"><span>Off</span><span class="check">✓</span></div>`+
    availableSubs.map((track,index)=>`<div class="pd-item${currentSubIdx===index?' active':''}" onclick="setSub(${index})"><span>${esc(subtitleTrackLabel(track,index))}</span><span class="check">✓</span></div>`).join('');
  updateSubBtn();
}

function refreshDesktopNativeSubtitleTracks(preserveExternal=false){
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
  if(isMobilePlaybackClient())return;
  const nativeTracks=desktopNativeAudioTracks();
  const hasDiscovered = availableAudio.some(track=>Number.isFinite(track?.sourceIndex ?? track?.streamIndex));
  if(nativeTracks.length > 1 || (nativeTracks.length && !hasDiscovered && availableAudio.length <= 1))availableAudio=nativeTracks;
  if(hlsInstance && nativeTracks.length){
    currentAudioIdx=Math.max(0,Math.min(availableAudio.length-1,Number(hlsInstance.audioTrack)||0));
  }else if(nativeTracks.length){
    const enabled=availableAudio.findIndex(track=>track.nativeTrack?.enabled);
    currentAudioIdx=enabled>=0?enabled:0;
  }
  renderAudioTracks();
  const nativeList=vid.audioTracks;
  if(nativeList?.addEventListener && vid._svAudioTrackList!==nativeList){
    vid._svAudioTrackList=nativeList;
    nativeList.addEventListener('addtrack',refreshDesktopNativeAudioTracks);
    nativeList.addEventListener('removetrack',refreshDesktopNativeAudioTracks);
    nativeList.addEventListener('change',refreshDesktopNativeAudioTracks);
  }
}

function validDurationSeconds(value){
  return Number.isFinite(value) && value > 1;
}

function setPlayerDuration(seconds, source='browser'){
  const duration = Number(seconds);
  if(!validDurationSeconds(duration))return 0;
  if(source==='api')vid._apiDuration = duration;
  vid._stableDuration = duration;
  const durEl=document.getElementById('timeDur');
  if(durEl)durEl.textContent = fmtTime(duration);
  return duration;
}

function mediaInfoNeedsSourceSeek(info){
  const codec = String(info?.videoCodec || '').toLowerCase();
  const container = String(info?.container || '').toLowerCase();
  const badCodecs = ['hevc','h265','vp9','vp8','av1','vc1'];
  const badContainers = ['matroska','webm','avi','flv','mpegts'];
  return badCodecs.some(c=>codec.includes(c)) || badContainers.some(c=>container.includes(c));
}

function playerDuration(){
  if(_ftpStreamUrl&&_ftpNeedsTranscode)return validDurationSeconds(_ftpDuration) ? _ftpDuration : 0;
  if(validDurationSeconds(vid._apiDuration))return vid._apiDuration;
  if(validDurationSeconds(vid._stableDuration))return vid._stableDuration;
  if(vid._sourceSeekRequired)return 0;
  if(!vid._durationPending&&validDurationSeconds(vid.duration))return vid.duration;
  return 0;
}

function playbackTime(){
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
  const local = playerLocalPoint(e, el);
  const width = Math.max(local.width || 0, 1);
  return Math.max(0, Math.min(1, local.x / width));
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
  document.getElementById('playerSpinner')?.classList.remove('on');
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
  return '/api/vlc-playlist?' + params.toString();
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
  if(!isMobilePlaybackClient()){
    vid._desktopOriginalOnlyFailed = true;
    document.getElementById('playerSpinner')?.classList.remove('on');
    showPlayerNotice('Playback fallback could not start in this browser.');
    return;
  }
  if(vid._browserStreamFallbackActive)return;
  vid._browserStreamFallbackActive = true;
  document.getElementById('playerSpinner')?.classList.add('on');
  try{
    const start = playbackTime();
    _ftpStreamUrl = streamUrl;
    _ftpNeedsTranscode = true;
    vid._sourceSeekRequired = true;
    vid._mediaSourceSeekRequired = true;
    vid._sourceOffset = start;
    vid._vlcFallbackUrl = streamUrl;
    vid._vlcFallbackTitle = title || '';
    const attached = await attachPlayerSource(ftpTranscodeSrc(streamUrl, start), 'stream');
    if(!attached)throw new Error('Browser stream unavailable');
    await vid.play();
    showToast('Playing with optimized browser stream');
  }catch(e){
    console.warn('[Playback] browser stream fallback failed:', e.message);
    showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE);
  }finally{
    vid._browserStreamFallbackActive = false;
    document.getElementById('playerSpinner')?.classList.remove('on');
  }
}

function streamUrlFor(id, start=0){
  const params = new URLSearchParams();
  if(isMobilePlaybackClient())params.set('mobile', '1');
  if(currentQuality && currentQuality !== 'auto')params.set('quality', currentQuality);
  if(currentAudioIdx > 0)params.set('audio', currentAudioIdx);
  if(start > 0)params.set('start', Math.floor(start));
  const query = params.toString();
  return `/stream/${id}${query ? '?' + query : ''}`;
}

async function fetchLocalPlaybackPlan(id, start=0, options={}){
  const params = new URLSearchParams();
  if(isMobilePlaybackClient())params.set('mobile','1');
  if(currentQuality && currentQuality !== 'auto')params.set('quality', currentQuality);
  if(currentAudioIdx > 0)params.set('audio', currentAudioIdx);
  const audioStreamIndex=availableAudio[currentAudioIdx]?.sourceIndex;
  if(Number.isFinite(audioStreamIndex))params.set('audioStream',audioStreamIndex);
  if(start > 0)params.set('start', Math.floor(start));
  if(options.forceHls)params.set('forceHls','1');
  if(options.forceRemux)params.set('mode','remux');
  if(options.forceAudio)params.set('mode','audio');
  if(options.mode)params.set('mode', options.mode);
  const query = params.toString();
  const r = await fetch(`/api/playback/local/${encodeURIComponent(id)}${query ? '?' + query : ''}`);
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
  const data = await r.json();
  if(!data?.ok || !data.src)throw new Error(data?.error || 'No playback source returned');
  return data;
}

async function fetchFtpPlaybackPlan(streamUrl, start=0, options={}){
  const params = new URLSearchParams();
  params.set('url', streamUrl);
  params.set('plan','1');
  if(isMobilePlaybackClient())params.set('mobile','1');
  if(currentAudioIdx > 0)params.set('audio', currentAudioIdx);
  const audioStreamIndex = availableAudio[currentAudioIdx]?.streamIndex ?? availableAudio[currentAudioIdx]?.sourceIndex;
  if(Number.isFinite(audioStreamIndex))params.set('audioStream', audioStreamIndex);
  if(start > 0)params.set('start', Math.floor(start));
  if(options.forceHls)params.set('forceHls','1');
  if(options.forceProxy || options.forceStream)params.set('mode','proxy');
  if(options.forceRemux)params.set('mode','remux');
  if(options.forceAudio)params.set('mode','audio');
  if(options.mode)params.set('mode', options.mode);
  const r = await fetch('/api/playback/ftp?' + params.toString());
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
  const data = await r.json();
  if(!data?.ok || !data.src)throw new Error(data?.error || 'No playback source returned');
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
    document.getElementById('playerSpinner')?.classList.remove('on');
    updatePlayIcons(true);
    showUI();
    return;
  }
  onMediaFailure?.(error);
}

function urlHasUnsupportedVideoHint(url){
  return /(x265|h265|hevc|10bit|10-bit|av1|vp9|vp8)/i.test(String(url || ''));
}

function playbackOptionsForStep(step){
  if(step === 'proxy')return {forceProxy:true};
  if(step === 'remux')return {forceRemux:true};
  if(step === 'audio')return {forceAudio:true};
  if(step === 'hls')return {forceHls:true};
  return {};
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
      || url.pathname.startsWith('/api/mobile-hls/');
  }catch(_){
    return false;
  }
}

function validateFallbackPlaybackSource(src, step){
  if(!validPlaybackSourceUrl(src))throw new Error(`Invalid ${step || 'fallback'} playback source`);
  return src;
}

function ftpDirectPlayable(url, options={}){
  const clean = String(url || '').split('?')[0].toLowerCase();
  const compatibleExt = clean.endsWith('.mp4') || clean.endsWith('.m4v');
  const unsupportedCodecHint = /(x265|h265|hevc|10bit|10-bit)/i.test(clean);
  return compatibleExt && !unsupportedCodecHint;
}

function ftpProxySrc(url){
  return '/api/ftp/proxy?url=' + encodeURIComponent(url);
}

function ftpPlaybackRouteSrc(url, mode='redirect'){
  const params = new URLSearchParams();
  params.set('url', url);
  if(mode)params.set('mode', mode);
  return '/api/playback/ftp?' + params.toString();
}

function localFtpPlaybackPlan(url, options={}){
  const proxy = options.forceProxy || options.forceStream;
  const src = ftpPlaybackRouteSrc(url, proxy ? 'proxy' : 'redirect');
  const proxyUrl = ftpPlaybackRouteSrc(url, 'proxy');
  return {
    ok: true,
    decodedUrl: url,
    directPlayable: ftpDirectPlayable(url),
    mode: proxy ? 'proxy' : 'direct',
    transport: proxy ? 'proxy' : 'redirect',
    src,
    playUrl: src,
    finalPlayUrl: src,
    redirectUrl: ftpPlaybackRouteSrc(url, 'redirect'),
    proxyUrl,
    fallbackProxyUrl: proxyUrl,
    legacyProxyUrl: ftpProxySrc(url),
    duration: 0,
  };
}

function ftpRawSrc(url){
  return '/api/ftp/raw?url=' + encodeURIComponent(url);
}

function desktopFtpPlaybackSrc(url){
  const value = String(url || '');
  if(/^ftp:\/\//i.test(value))return ftpRawSrc(value);
  if(/^https?:\/\//i.test(value))return ftpProxySrc(value);
  return '';
}

function ftpTranscodeSrc(url, start=0){
  const params = new URLSearchParams();
  params.set('url', url);
  if(start > 0)params.set('start', Math.floor(start));
  if(currentAudioIdx > 0)params.set('audio', currentAudioIdx);
  const audioStreamIndex = availableAudio[currentAudioIdx]?.streamIndex ?? availableAudio[currentAudioIdx]?.sourceIndex;
  if(Number.isFinite(audioStreamIndex))params.set('audioStream', audioStreamIndex);
  return '/api/ftp/stream?' + params.toString();
}

function localTranscodeSrc(id, start=0){
  const params = new URLSearchParams();
  params.set('mobile', '1');
  if(currentQuality && currentQuality !== 'auto')params.set('quality', currentQuality);
  if(currentAudioIdx > 0)params.set('audio', currentAudioIdx);
  const audioStreamIndex=availableAudio[currentAudioIdx]?.sourceIndex ?? availableAudio[currentAudioIdx]?.streamIndex;
  if(Number.isFinite(audioStreamIndex))params.set('audioStream', audioStreamIndex);
  if(start > 0)params.set('start', Math.floor(start));
  return `/stream/${encodeURIComponent(id)}?${params.toString()}`;
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
  return needsTranscode ? ftpTranscodeSrc(_ftpStreamUrl, start) : ftpProxySrc(_ftpStreamUrl);
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
  if(Number.isFinite(streamIndex))params.set('stream', streamIndex);
  return `/api/ftp/subtitle/${idx}.vtt?${params.toString()}`;
}

function resolveFtpPlayUrl(streamUrl){
  const sourceUrl = String(streamUrl || '').trim();
  if(!sourceUrl)throw new Error('Missing source URL');
  const directPlayable = ftpDirectPlayable(sourceUrl);
  const proxyUrl = ftpProxySrc(sourceUrl);
  const transcodeUrl = ftpTranscodeSrc(sourceUrl);
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
  availableAudio = [{index:0,title:'Default Audio'}];
  availableSubs = [];
  currentAudioIdx = 0;
  clearSubtitleOverlay();
  renderAudioTracks();
  const subList = document.getElementById('subList');
  if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Loading subtitles...</div>`;
  updateSubBtn();

  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 15000);
  try{
    const r = await fetch(`/api/ftp/media-info?url=${encodeURIComponent(streamUrl)}`, {signal: controller.signal});
    if(!r.ok)throw new Error(`metadata ${r.status}`);
    const data = await r.json();
    const audioTracks = Array.isArray(data.audioTracks) ? data.audioTracks : [];
    const subtitleTracks = Array.isArray(data.subtitleTracks) ? data.subtitleTracks : [];
    if(_currentFtpPlaybackPlan)_currentFtpPlaybackPlan.unsupportedVideoHint = _currentFtpPlaybackPlan.unsupportedVideoHint || mediaInfoNeedsSourceSeek(data);

    if(audioTracks.length){
      const hints=filenameAudioHints(streamUrl);
      availableAudio = audioTracks.map((track,i)=>({
        ...audioTrackWithFallback(track,i,hints),
        index: i,
        sourceIndex: track.index,
        streamIndex: track.index,
        title: audioTrackTitle(audioTrackWithFallback(track,i,hints),i),
      }));
      renderAudioTracks();
    }

    const embeddedSubs = subtitleTracks.filter(subtitleCanRenderAsVtt).map((track,i)=>({
      ...track,
      index: i,
      sourceIndex: track.index,
      streamIndex: track.index,
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
        subList.innerHTML = `<div class="pd-item active" onclick="setSub(-1)"><span>Off</span><span class="check">âœ“</span></div>`+
          availableSubs.map((t,i)=>`<div class="pd-item" onclick="setSub(${i})"><span>${esc(t.label||'Subtitle '+(i+1))}</span><span class="check">âœ“</span></div>`).join('');
      }else{
        subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">No subtitles found</div>`;
      }
    }
    updateSubBtn();
  }catch(e){
    console.warn('[FTP] Track metadata unavailable:', e.message);
    if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">No subtitles found</div>`;
  }finally{
    clearTimeout(timeout);
  }
}

async function sourceSeekTo(seconds){
  if(!currentStreamId)return;
  const currentMode = _currentPlaybackPlan?.mode || 'direct';
  if(!isMobilePlaybackClient() && !planNeedsSourceSeek({mode:currentMode})){
    document.getElementById('playerSpinner').classList.remove('on');
    showToast('Desktop performance mode seeks on the original stream without FFmpeg.');
    try{vid.currentTime = Math.max(0, seconds);}catch(_){}
    return;
  }
  const target = Math.max(0, seconds);
  const wasPlaying = !vid.paused;
  const token = (vid._seekToken || 0) + 1;
  vid._seekToken = token;
  vid._sourceOffset = target;
  vid.pause();
  document.getElementById('playerSpinner').classList.add('on');
  const seekTimer = setTimeout(()=>{
    if(token !== vid._seekToken)return;
    document.getElementById('playerSpinner').classList.remove('on');
    if(wasPlaying)vid.play().catch(()=>{});
  }, 12000);
  try{
    const plan = currentMode === 'stream'
      ? { ok:true, mode:'stream', src:localTranscodeSrc(currentStreamId, target), duration:vid._apiDuration || 0 }
      : await fetchLocalPlaybackPlan(currentStreamId, target, playbackOptionsForStep(currentMode));
    if(token !== vid._seekToken)return;
    _currentPlaybackPlan = plan;
    vid._sourceSeekRequired = planNeedsSourceSeek(plan);
    vid._mediaSourceSeekRequired = vid._sourceSeekRequired;
    if(validDurationSeconds(Number(plan.duration)))setPlayerDuration(Number(plan.duration),'api');
    vid.addEventListener('loadedmetadata', function onSourceSeekMeta(){
      if(token !== vid._seekToken)return;
      vid.removeEventListener('loadedmetadata', onSourceSeekMeta);
      clearTimeout(seekTimer);
      document.getElementById('playerSpinner').classList.remove('on');
      if(wasPlaying)vid.play().catch(()=>{});
    }, {once:true});
    const attached = await attachPlayerSource(plan.src, plan.mode);
    if(!attached)throw new Error('HLS not supported');
    if(wasPlaying)vid.play().catch(()=>{});
  }catch(e){
    if(token !== vid._seekToken)return;
    clearTimeout(seekTimer);
    document.getElementById('playerSpinner').classList.remove('on');
    showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE);
  }
}

function seekToTime(seconds){
  const duration = playerDuration();
  const target = duration ? Math.max(0, Math.min(duration, seconds)) : Math.max(0, seconds);
  if(_ftpStreamUrl&&_ftpNeedsTranscode){
    ftpSeekTo(target);
  }else if(currentStreamId&&vid._sourceSeekRequired){
    sourceSeekTo(target);
  }else{
    try{
      vid.currentTime = target;
    }catch(e){
      if(currentStreamId)sourceSeekTo(target);
    }
  }
}

function maybeResumeProgress(id, duration){
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
  const token = (vid._durationToken || 0) + 1;
  vid._durationToken = token;
  vid._durationPending = true;
  try{
    const r = await fetch(`/api/media-info/${id}`);
    if(token !== vid._durationToken || !r.ok)return;
    const data = await r.json();
    vid._mediaSourceSeekRequired = mediaInfoNeedsSourceSeek(data);
    vid._sourceSeekRequired = vid._mediaSourceSeekRequired;
    if(_currentPlaybackPlan)_currentPlaybackPlan.unsupportedVideoHint = vid._mediaSourceSeekRequired;
    const duration = setPlayerDuration(data.duration, 'api');
    if(duration)maybeResumeProgress(id, duration);
  }catch(e){
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
  const token = (vid._durationToken || 0) + 1;
  vid._durationToken = token;
  vid._durationPending = true;
  try{
    const r = await fetch(`/api/ftp/duration?url=${encodeURIComponent(streamUrl)}`);
    if(token !== vid._durationToken || !r.ok)return;
    const data = await r.json();
    const duration = Number(data.duration) || 0;
    if(validDurationSeconds(duration)){
      _ftpDuration = duration;
      setPlayerDuration(duration, 'api');
    }
  }catch(e){
    console.warn('[FTP] Duration lookup failed:', e.message);
  }finally{
    if(token === vid._durationToken)vid._durationPending = false;
  }
}

function fallbackOrderForRemote(url, plan={}){
  const unsupported = plan?.unsupportedVideoHint || urlHasUnsupportedVideoHint(url);
  const order = ['proxy'];
  if(!unsupported)order.push('remux','audio');
  order.push('transcode','hls');
  return order;
}

function fallbackOrderForLocal(plan={}){
  if(plan?.unsupportedVideoHint)return ['transcode','hls'];
  return ['remux','audio','transcode','hls'];
}

async function attachFtpFallbackStep(resolvedStreamUrl, name, step, failedAt){
  playbackDebug('ftp fallback start', {step, failedAt, error:videoErrorInfo()});
  const fallback = step === 'transcode'
    ? { ok:true, mode:'stream', src:ftpTranscodeSrc(resolvedStreamUrl, failedAt), duration:_ftpDuration || 0 }
    : await fetchFtpPlaybackPlan(resolvedStreamUrl, failedAt, playbackOptionsForStep(step));
  if(_ftpStreamUrl !== resolvedStreamUrl)return true;
  const fallbackMode = fallback.mode || step;
  validateFallbackPlaybackSource(fallback.src, step);
  const shouldPlay = vid._svPlaybackShouldPlay !== false;
  _currentFtpPlaybackPlan = fallback;
  _ftpNeedsTranscode = planNeedsSourceSeek({mode:fallbackMode});
  vid._sourceSeekRequired = _ftpNeedsTranscode;
  vid._mediaSourceSeekRequired = _ftpNeedsTranscode;
  vid._sourceOffset = _ftpNeedsTranscode ? failedAt : 0;
  if(validDurationSeconds(Number(fallback.duration))){
    _ftpDuration = Number(fallback.duration);
    setPlayerDuration(_ftpDuration, 'api');
  }
  vid.addEventListener('canplay', function onFtpFallbackCanPlay(){
    if(_ftpStreamUrl !== resolvedStreamUrl)return;
    playbackDebug('ftp fallback canplay', {step, src:fallback.src});
    document.getElementById('playerSpinner').classList.remove('on');
  }, {once:true});
  vid.addEventListener('error', function onFtpFallbackError(){
    if(_ftpStreamUrl !== resolvedStreamUrl)return;
    playbackDebug('ftp fallback video error', {step, error:videoErrorInfo()});
    tryFtpAdaptiveFallback(resolvedStreamUrl, name, playbackTime()).catch(()=>showVlcPlaybackNotice(resolvedStreamUrl, name));
  }, {once:true});
  playbackDebug('ftp fallback attach', {step, mode:fallbackMode, src:fallback.src});
  if(!await attachPlayerSource(fallback.src, fallbackMode))throw new Error(`Could not attach ${step} source`);
  if(shouldPlay)vid.play().catch(e=>{
    if(e?.name === 'NotAllowedError'){
      updatePlayIcons(true);
      showUI();
      return;
    }
    playbackDebug('ftp fallback play rejected', {step, message:e.message});
  });
  return true;
}

async function tryFtpAdaptiveFallback(resolvedStreamUrl, name, failedAt=playbackTime()){
  if(!_ftpStreamUrl || _ftpStreamUrl !== resolvedStreamUrl)return false;
  const tried = vid._ftpFallbackStepsTried || (vid._ftpFallbackStepsTried = new Set());
  const order = fallbackOrderForRemote(resolvedStreamUrl, _currentFtpPlaybackPlan);
  document.getElementById('playerSpinner').classList.add('on');
  for(const step of order){
    if(tried.has(step))continue;
    tried.add(step);
    try{
      return await attachFtpFallbackStep(resolvedStreamUrl, name, step, failedAt);
    }catch(e){
      playbackDebug('ftp fallback failed', {step, message:e.message});
    }
  }
  document.getElementById('playerSpinner').classList.remove('on');
  playbackDebug('ftp fallback exhausted', {url:resolvedStreamUrl});
  showVlcPlaybackNotice(resolvedStreamUrl, name);
  return false;
}

async function attachLocalFallbackStep(id, step, failedAt){
  playbackDebug('local fallback start', {id, step, failedAt, error:videoErrorInfo()});
  const fallback = step === 'transcode'
    ? { ok:true, mode:'stream', src:localTranscodeSrc(id, failedAt), duration:vid._apiDuration || 0 }
    : await fetchLocalPlaybackPlan(id, failedAt, playbackOptionsForStep(step));
  if(String(currentStreamId) !== String(id) || _ftpStreamUrl)return true;
  const fallbackMode = fallback.mode || step;
  validateFallbackPlaybackSource(fallback.src, step);
  const shouldPlay = vid._svPlaybackShouldPlay !== false;
  _currentPlaybackPlan = fallback;
  vid._sourceSeekRequired = planNeedsSourceSeek({mode:fallbackMode});
  vid._mediaSourceSeekRequired = vid._sourceSeekRequired;
  vid._sourceOffset = vid._sourceSeekRequired ? failedAt : 0;
  if(validDurationSeconds(Number(fallback.duration)))setPlayerDuration(Number(fallback.duration),'api');
  vid.addEventListener('canplay', function onLocalFallbackCanPlay(){
    if(String(currentStreamId) !== String(id) || _ftpStreamUrl)return;
    playbackDebug('local fallback canplay', {id, step, src:fallback.src});
    document.getElementById('playerSpinner').classList.remove('on');
  }, {once:true});
  vid.addEventListener('error', function onLocalFallbackError(){
    if(String(currentStreamId) !== String(id) || _ftpStreamUrl)return;
    playbackDebug('local fallback video error', {id, step, error:videoErrorInfo()});
    tryLocalAdaptiveFallback(id, playbackTime()).catch(()=>showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE));
  }, {once:true});
  playbackDebug('local fallback attach', {id, step, mode:fallbackMode, src:fallback.src});
  if(!await attachPlayerSource(fallback.src, fallbackMode))throw new Error(`Could not attach ${step} source`);
  if(shouldPlay)vid.play().catch(e=>{
    if(e?.name === 'NotAllowedError'){
      updatePlayIcons(true);
      showUI();
      return;
    }
    playbackDebug('local fallback play rejected', {id, step, message:e.message});
  });
  return true;
}

async function tryLocalAdaptiveFallback(id, failedAt=playbackTime()){
  if(!currentStreamId || String(currentStreamId) !== String(id) || _ftpStreamUrl)return false;
  const tried = vid._localFallbackStepsTried || (vid._localFallbackStepsTried = new Set());
  const order = fallbackOrderForLocal(_currentPlaybackPlan);
  document.getElementById('playerSpinner').classList.add('on');
  for(const step of order){
    if(tried.has(step))continue;
    tried.add(step);
    try{
      return await attachLocalFallbackStep(id, step, failedAt);
    }catch(e){
      playbackDebug('local fallback failed', {id, step, message:e.message});
    }
  }
  document.getElementById('playerSpinner').classList.remove('on');
  playbackDebug('local fallback exhausted', {id});
  showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE);
  return false;
}

async function playMedia(id, name, year){
  console.log('[Playback] play button clicked');
  console.log('[Playback] Local playback plan');
  const movie = movies.find(m => m.id === id) || {};
  recordWatchHistory(id, movie.name || name, movie.genre || '', 'movie');
  if (!checkParentalLock(movie.rating || 'PG')) {
    showToast('Content locked by parental controls');
    return;
  }
  trackView(id);
  isLiveMode = false;
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  closeAllDropdowns();
  hidePlayerNotice();
  currentStreamId = id;
  currentQuality = 'auto';
  clearSubtitleOverlay();
  currentAudioIdx = 0;
  availableSubs = [];
  availableAudio = [];
  clearInterval(vid._pi);
  vid.pause();
  vid.querySelectorAll('track').forEach(t => t.remove());
  clearSubtitleOverlay();

  // Reset transient state
  _ftpDuration = 0;
  vid._apiDuration = 0;
  _ftpStreamUrl = '';
  _ftpNeedsTranscode = false;
  vid._resumeChecked = false;
  vid._durationPending = false;
  vid._sourceOffset = 0;
  vid._localFallbackTried = false;
  vid._localFallbackStepsTried = new Set();
  _currentPlaybackPlan = null;
  clearTimeout(vid._localFallbackTimer);
  vid._localFallbackTimer = null;
  const mobilePlayback = isMobilePlaybackClient();
  vid._sourceSeekRequired = false;
  vid._mediaSourceSeekRequired = false;
  vid._vlcFallbackUrl = streamUrlFor(id);
  vid._vlcFallbackTitle = name || '';
  vid._hlsNoticeOnFatal = true;
  vid._svPlaybackShouldPlay = true;
  vid._stableDuration = 0;        // ← new: ensure duration locking for this video

  // ── Attach the metadata handler BEFORE setting src ──
  resetLocalTrackOptions();

  vid.addEventListener('loadedmetadata', function onMeta() {
    vid.removeEventListener('loadedmetadata', onMeta);
    document.getElementById('playerSpinner').classList.remove('on');
    if (!vid._sourceSeekRequired && !vid._durationPending && validDurationSeconds(vid.duration)) {
      const duration = setPlayerDuration(vid.duration);
      maybeResumeProgress(id, duration);
    }
    vid.play().catch(() => {});
  }, { once: true });

  // Now assign the source → the handler will fire reliably
  // Source is selected through /api/playback/local after the player shell is visible.

  // UI updates
  document.getElementById('playerTitle').textContent = name;
  document.getElementById('playerSubTitle').textContent = year ? `${year}` : '';
  document.getElementById('playerLiveBadge').classList.remove('show');
  document.getElementById('progressWrap').classList.remove('live-mode');
  document.getElementById('timeDur').textContent = '0:00';
  document.getElementById('timeNow').textContent = '0:00';
  document.getElementById('playerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  if(mobilePlayback)enterMobileLandscapeMode();
  showUI();
  document.getElementById('playerSpinner').classList.add('on');
  setTimeout(()=>{
    if(String(currentStreamId) === String(id) && !_ftpStreamUrl)ensureLocalTrackOptionsLoaded();
  }, 0);
  loadPlayerDuration(id);

  try{
    // Desktop's direct route is deterministic. Attach it immediately so the
    // play() call remains inside the card/episode click's user activation.
    const plan = mobilePlayback
      ? await fetchLocalPlaybackPlan(id)
      : {ok:true, id:String(id), mode:'direct', transport:'direct', src:streamUrlFor(id), duration:0};
    if(String(currentStreamId) !== String(id) || _ftpStreamUrl)return;
    _currentPlaybackPlan = plan;
    vid._sourceSeekRequired = planNeedsSourceSeek(plan);
    vid._mediaSourceSeekRequired = vid._sourceSeekRequired;
    if(validDurationSeconds(Number(plan.duration))){
      setPlayerDuration(Number(plan.duration),'api');
    }
    vid.addEventListener('error', async function onLocalPlaybackError(){
      if(String(currentStreamId) !== String(id) || _ftpStreamUrl || vid._localFallbackTried)return;
      vid._localFallbackTried = true;
      playbackDebug('local direct video error', {id, error:videoErrorInfo()});
      tryLocalAdaptiveFallback(id, playbackTime()).catch(()=>showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE));
    }, {once:true});
    const attachPromise = attachPlayerSource(plan.src, plan.mode);
    const initialPlay = !mobilePlayback
      ? vid.play().catch(e=>handleInitialPlayRejection(e, ()=>{
          if(vid._localFallbackTried)return;
          vid._localFallbackTried = true;
          tryLocalAdaptiveFallback(id, playbackTime()).catch(()=>{});
        }))
      : null;
    const attached = await attachPromise;
    if(!attached){
      await tryLocalAdaptiveFallback(id, playbackTime());
      return;
    }
    if(validDurationSeconds(playerDuration()))maybeResumeProgress(id, playerDuration());
    if(mobilePlayback){
      vid.play().catch(e=>{
        playbackDebug('local direct play rejected', {id, message:e.message});
        tryLocalAdaptiveFallback(id, playbackTime()).catch(()=>{});
      });
    }else{
      await initialPlay;
    }
    setTimeout(()=>{
      if(String(currentStreamId)===String(id) && !_ftpStreamUrl)ensureLocalTrackOptionsLoaded();
    },500);
  }catch(e){
    document.getElementById('playerSpinner').classList.remove('on');
    showPlayerNotice(DESKTOP_UNSUPPORTED_MESSAGE);
  }
}

async function switchAudioWithServer(idx){
  if(vid._audioSwitchPending)return;
  const selected=availableAudio[idx];
  if(!selected)return;
  const previousIdx=currentAudioIdx;
  const target=playbackTime();
  const wasPlaying=!vid.paused;
  const localId=currentStreamId;
  const ftpUrl=_ftpStreamUrl;
  const token=(vid._audioSwitchToken||0)+1;
  vid._audioSwitchToken=token;
  vid._audioSwitchPending=true;
  currentAudioIdx=idx;
  renderAudioTracks();
  closeAllDropdowns();
  document.getElementById('playerSpinner')?.classList.add('on');
  vid._sourceOffset=target;

  const finish=()=>{
    if(token!==vid._audioSwitchToken)return;
    vid._audioSwitchPending=false;
    document.getElementById('playerSpinner')?.classList.remove('on');
  };
  const timeout=setTimeout(finish,12000);
  vid.addEventListener('canplay',function onAudioCanPlay(){
    vid.removeEventListener('canplay',onAudioCanPlay);
    clearTimeout(timeout);
    finish();
    if(wasPlaying)vid.play().catch(()=>{});
  },{once:true});

  try{
    const currentMode = ftpUrl ? _currentFtpPlaybackPlan?.mode : _currentPlaybackPlan?.mode;
    const plan = currentMode === 'stream'
      ? (ftpUrl
        ? { ok:true, mode:'stream', src:ftpTranscodeSrc(ftpUrl,target), duration:_ftpDuration || 0 }
        : { ok:true, mode:'stream', src:localTranscodeSrc(localId,target), duration:vid._apiDuration || 0 })
      : (ftpUrl
        ? await fetchFtpPlaybackPlan(ftpUrl,target,{forceAudio:true})
        : await fetchLocalPlaybackPlan(localId,target,{forceAudio:true}));
    if(token!==vid._audioSwitchToken)return;
    if(ftpUrl){
      _currentFtpPlaybackPlan=plan;
      _ftpNeedsTranscode=true;
      _ftpCurrentTime=target;
    }else{
      _currentPlaybackPlan=plan;
    }
    vid._sourceSeekRequired=true;
    vid._mediaSourceSeekRequired=true;
    const attached=await attachPlayerSource(plan.src,plan.mode||'audio');
    if(!attached)throw new Error('Audio stream could not be attached');
    if(wasPlaying)vid.play().catch(()=>{});
    showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
    playbackDebug('server audio switch',{idx,target,mode:plan.mode,ftp:!!ftpUrl});
  }catch(e){
    clearTimeout(timeout);
    currentAudioIdx=previousIdx;
    renderAudioTracks();
    finish();
    showToast('Could not switch audio for this file');
    console.warn('[Audio] Switch failed:',e.message);
  }
}

function setAudio(idx){
  if(idx===currentAudioIdx){closeAllDropdowns();return;}
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
      hlsInstance.audioTrack=selected.hlsIndex;
      currentAudioIdx=idx;
      renderAudioTracks();
      closeAllDropdowns();
      showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
      playbackDebug('desktop HLS audio switch',{idx,sourceUnchanged:sourceBefore===vid.currentSrc});
      return;
    }
    if(selected.nativeTrack){
      availableAudio.forEach((track,index)=>{if(track.nativeTrack)track.nativeTrack.enabled=index===idx;});
      currentAudioIdx=idx;
      renderAudioTracks();
      closeAllDropdowns();
      showToast(`Audio: ${selected.title||audioTrackTitle(selected,idx)}`);
      playbackDebug('desktop native audio switch',{idx,sourceUnchanged:sourceBefore===vid.currentSrc});
      return;
    }
  }
  switchAudioWithServer(idx);
}

function updateProgress(){
  const duration = playerDuration();
  if(!duration)return;
  const current = playbackTime();
  const pct=Math.min(1,Math.max(0,current/duration));
  document.getElementById('progressPlayed').style.width=(pct*100)+'%';
  document.getElementById('progressThumb').style.left=(pct*100)+'%';
  document.getElementById('timeNow').textContent=fmtTime(current);
  updateWatchProgress(currentStreamId,current,duration);
}
function updatePlayIcons(paused){
  const play='M8 5v14l11-7z',pause='M6 19h4V5H6v14zm8-14v14h4V5h-4z';
  document.getElementById('ppIcon').innerHTML=`<path d="${paused?play:pause}"/>`;
  document.getElementById('ppCenterIcon').innerHTML=`<path d="${paused?play:pause}"/>`;
}
function hideUI(){clearTimeout(uiHideTimer);document.getElementById('playerUI').classList.add('hidden');document.getElementById('playerWrap').classList.remove('show-cursor');document.getElementById('playerWrap').classList.add('subtitles-low');uiVisible=false;}
function showUI(){document.getElementById('playerUI').classList.remove('hidden');document.getElementById('playerWrap').classList.remove('subtitles-low');uiVisible=true;clearTimeout(uiHideTimer);scheduleHideUI();}
function scheduleHideUI(){clearTimeout(uiHideTimer);if(vid.paused)return;uiHideTimer=setTimeout(hideUI,3500);}
function togglePlay(){if(vid.paused){vid._svPlaybackShouldPlay=true;vid.play();popCenter('');}else{vid._svPlaybackShouldPlay=false;vid.pause();popCenter('');clearTimeout(uiHideTimer);}}
function seekBy(s){
  if(isLiveMode)return;
  seekToTime(playbackTime()+s);
  flashSeek(s);showUI();
}
function flashSeek(s){const side=s<0?'Left':'Right';const el=document.getElementById('seekFlash'+side);el.classList.add('show');setTimeout(()=>el.classList.remove('show'),700);}
function popCenter(icon){const el=document.getElementById('centerFlash');el.textContent=icon;el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');setTimeout(()=>el.classList.remove('pop'),400);}
function toggleMute(){vid.muted=!vid.muted;document.getElementById('volSlider').value=vid.muted?0:vid.volume;updateVolIcon();}
function setVolume(v){vid.volume=parseFloat(v);vid.muted=v==0;updateVolIcon();}
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
function initPiP(){
  const btn=document.getElementById('pipBtn');
  if(document.pictureInPictureEnabled && !vid.disablePictureInPicture){
    btn.style.display='';
  }
  vid.addEventListener('enterpictureinpicture',()=>{
    updatePipBtn(true);
    showToast('Picture-in-Picture on');
  });
  vid.addEventListener('leavepictureinpicture',()=>{
    updatePipBtn(false);
    showToast('Picture-in-Picture off');
  });
}
function updatePipBtn(active){
  document.getElementById('pipIcon').innerHTML=active
    ?'<path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7h6v4h-6v-4z"/>'
    :'<path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.99 2 1.99h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/>';
  document.getElementById('pipBtn').classList.toggle('active',active);
}
async function togglePiP(){
  if(!document.pictureInPictureEnabled){showToast('PiP not supported');return;}
  try{
    if(document.pictureInPictureElement){
      await document.exitPictureInPicture();
    }else{
      await vid.requestPictureInPicture();
    }
  }catch(e){
    showToast('PiP unavailable in this browser');
  }
}

let _ftpStreamUrl='';
let _ftpDuration=0;
let _ftpCurrentTime=0;
let _ftpSeekPending=false;
let _ftpNeedsTranscode=false;
let _ftpTrackLoadPromise=null;

function ensureFtpTrackOptionsLoaded(){
  if(!_ftpStreamUrl)return Promise.resolve();
  if(_ftpTrackLoadPromise)return _ftpTrackLoadPromise;
  const subList = document.getElementById('subList');
  if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Loading subtitles...</div>`;
  _ftpTrackLoadPromise = loadFtpTrackOptions(_ftpStreamUrl).catch(()=>{});
  return _ftpTrackLoadPromise;
}

async function playFtpMedia(streamUrl, name, year){
  try {
    console.log('[Playback] play button clicked');
    const requestedStreamUrl = String(streamUrl || '').trim();
    if(!requestedStreamUrl){
      showToast('Playback error: missing source URL');
      return;
    }
    const mobilePlayback = isMobilePlaybackClient();
    console.log('[Playback] FTP proxy URL', ftpProxySrc(requestedStreamUrl));

    isLiveMode = false;
    closeAllDropdowns(); closeAllSeriesDropdowns(); hideSeriesPlayerBar();
    hidePlayerNotice();
    clearInterval(vid._pi);
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    vid.pause();
    vid.removeAttribute('src');
    vid.querySelectorAll('track').forEach(t=>t.remove());
    clearSubtitleOverlay();
    vid.load();
    const playToken = (vid._durationToken || 0) + 1;
    vid._durationToken = playToken;
    _ftpStreamUrl = requestedStreamUrl;
    _ftpDuration = 0;
    _ftpNeedsTranscode = false;
    _ftpTrackLoadPromise = null;
    _currentFtpPlaybackPlan = null;
    _ftpCurrentTime = 0;
    _ftpSeekPending = false;
    vid._apiDuration = 0;
    vid._sourceOffset = 0;
    vid._sourceSeekRequired = false;
    vid._mediaSourceSeekRequired = false;
    vid._ftpProxyFallback = false;
    vid._ftpPlaybackFallbackTried = false;
    vid._ftpFallbackStepsTried = new Set();
    vid._svPlaybackShouldPlay = true;
    clearTimeout(vid._ftpFallbackTimer);
    vid._ftpFallbackTimer = null;
    vid._durationPending = false;
    vid._resumeChecked = true;
    vid._stableDuration = 0;               // ← reset duration lock

    // UI
    document.getElementById('playerModal').classList.add('open');
    document.getElementById('playerSpinner').classList.add('on');
    document.getElementById('playerTitle').textContent = name;
    document.getElementById('playerSubTitle').textContent = year || '';
    document.getElementById('playerLiveBadge').classList.remove('show');
    document.getElementById('progressWrap').classList.remove('live-mode');
    document.getElementById('progressPlayed').style.width = '0%';
    document.getElementById('progressThumb').style.left = '0%';
    document.getElementById('progressBuffered').style.width = '0%';
    document.getElementById('timeDur').textContent = '--:--';
    document.getElementById('timeNow').textContent = '0:00';
    document.body.style.overflow = 'hidden';
    if(mobilePlayback)enterMobileLandscapeMode();
    showUI();
    currentStreamId = null;
    currentQuality = 'auto';
    currentAudioIdx = 0;
    clearSubtitleOverlay();
    availableAudio = [{index:0,title:'Default Audio'}];
    availableSubs = [];
    renderAudioTracks();
    const subList = document.getElementById('subList');
    if(subList)subList.innerHTML = `<div class="pd-item" style="color:#444;pointer-events:none">Loading subtitles...</div>`;
    updateSubBtn();
    setTimeout(()=>{
      if(_ftpStreamUrl === requestedStreamUrl)ensureFtpTrackOptionsLoaded();
    }, 0);

    let playInfo;
    if(!mobilePlayback){
      // Never redirect an HTTPS desktop page to the private/HTTP media origin.
      // The same-origin proxy preserves Range/206 responses and encoded names.
      playInfo = localFtpPlaybackPlan(requestedStreamUrl, {forceProxy:true});
    }else{
      try{
        playInfo = await fetchFtpPlaybackPlan(requestedStreamUrl);
      }catch(e){
        if(playToken !== vid._durationToken)return;
        console.warn('[Playback] FTP plan failed, trying direct route:', e.message);
        playInfo = localFtpPlaybackPlan(requestedStreamUrl);
      }
    }
    if(playToken !== vid._durationToken)return;

    const resolvedStreamUrl = playInfo.decodedUrl || requestedStreamUrl;
    const playbackMode = playInfo.mode || (playInfo.directPlayable ? 'direct' : 'remux');
    const directPlayable = playbackMode === 'direct';
    const finalPlayUrl = playInfo.src || playInfo.finalPlayUrl || playInfo.playUrl || (directPlayable ? ftpProxySrc(resolvedStreamUrl) : ftpTranscodeSrc(resolvedStreamUrl));
    const transcodeUrl = '';
    if(!finalPlayUrl){
      document.getElementById('playerSpinner').classList.remove('on');
      showToast('Playback error: no source URL returned');
      return;
    }

    _ftpStreamUrl = resolvedStreamUrl;
    _currentFtpPlaybackPlan = playInfo;
    _ftpNeedsTranscode = planNeedsSourceSeek({mode: playbackMode});
    if(playbackMode === 'proxy')vid._ftpFallbackStepsTried.add('proxy');
    vid._sourceSeekRequired = _ftpNeedsTranscode;
    vid._mediaSourceSeekRequired = _ftpNeedsTranscode;
    vid._vlcFallbackUrl = resolvedStreamUrl;
    vid._vlcFallbackTitle = name || '';
    vid._hlsNoticeOnFatal = true;
    if(validDurationSeconds(Number(playInfo.duration))){
      _ftpDuration = Number(playInfo.duration);
      setPlayerDuration(_ftpDuration, 'api');
    }

    // ── Attach spinner‑hiding & play listener BEFORE setting src ──
    vid.addEventListener('canplay', function onFtpCanPlay() {
      vid.removeEventListener('canplay', onFtpCanPlay);
      clearTimeout(vid._ftpFallbackTimer);
      vid._ftpFallbackTimer = null;
      document.getElementById('playerSpinner').classList.remove('on');
    }, { once: true });

    vid.addEventListener('error', function onFtpPlaybackError() {
      if (_ftpStreamUrl !== resolvedStreamUrl) return;
      if (vid._ftpPlaybackFallbackTried) return;
      vid._ftpPlaybackFallbackTried = true;
      playbackDebug('ftp initial video error', {mode:playbackMode, error:videoErrorInfo()});
      tryFtpAdaptiveFallback(resolvedStreamUrl, name, playbackTime()).catch(()=>showVlcPlaybackNotice(resolvedStreamUrl, name));
    }, {once:true});

    console.log(`[Playback] FTP ${playbackMode}`);
    const attachPromise = attachPlayerSource(finalPlayUrl, playbackMode);
    const initialPlay = !mobilePlayback
      ? vid.play().catch(e=>handleInitialPlayRejection(e, ()=>{
          playbackDebug('ftp initial play rejected', {message:e.message});
          tryFtpAdaptiveFallback(resolvedStreamUrl, name, playbackTime()).catch(()=>showVlcPlaybackNotice(resolvedStreamUrl, name));
        }))
      : null;
    const attached = await attachPromise;
    if(!attached){
      await tryFtpAdaptiveFallback(resolvedStreamUrl, name, playbackTime());
      return;
    }

    setTimeout(()=>{
      if(_ftpStreamUrl !== resolvedStreamUrl)return;
      ensureFtpTrackOptionsLoaded();
      loadFtpDuration(resolvedStreamUrl);
    }, 500);

    if(mobilePlayback){
      vid.play().catch(e => {
        playbackDebug('ftp initial play rejected', {message:e.message});
        tryFtpAdaptiveFallback(resolvedStreamUrl, name, playbackTime()).catch(()=>showVlcPlaybackNotice(resolvedStreamUrl, name));
      });
    }else{
      await initialPlay;
    }
  } catch (e) {
    document.getElementById('playerSpinner').classList.remove('on');
    showToast('Error: ' + e.message);
  }
}

async function ftpSeekTo(seconds){
  if(!_ftpStreamUrl || _ftpSeekPending) return;
  _ftpSeekPending = true;
  const wasPlaying = !vid.paused;
  const token = (vid._seekToken || 0) + 1;
  vid._seekToken = token;
  vid.pause();
  document.getElementById('playerSpinner').classList.add('on');
  const target = Math.max(0, seconds);
  _ftpCurrentTime = target;
  vid._sourceOffset = target;
  const seekTimer = setTimeout(()=>{
    if(token !== vid._seekToken)return;
    _ftpSeekPending = false;
    document.getElementById('playerSpinner').classList.remove('on');
    if(wasPlaying)vid.play().catch(()=>{});
  }, 12000);
  vid.addEventListener('canplay', function onCp(){
    if(token !== vid._seekToken)return;
    vid.removeEventListener('canplay', onCp);
    clearTimeout(seekTimer);
    _ftpSeekPending = false;
    document.getElementById('playerSpinner').classList.remove('on');
    if(wasPlaying) vid.play().catch(()=>{});
  }, {once: true});
  try{
    const currentMode = _currentFtpPlaybackPlan?.mode || 'direct';
    const plan = currentMode === 'stream'
      ? { ok:true, mode:'stream', src:ftpTranscodeSrc(_ftpStreamUrl, target), duration:_ftpDuration || 0 }
      : await fetchFtpPlaybackPlan(_ftpStreamUrl, target, playbackOptionsForStep(currentMode));
    if(token !== vid._seekToken)return;
    _currentFtpPlaybackPlan = plan;
    _ftpNeedsTranscode = planNeedsSourceSeek(plan);
    vid._sourceSeekRequired = _ftpNeedsTranscode;
    vid._mediaSourceSeekRequired = _ftpNeedsTranscode;
    if(validDurationSeconds(Number(plan.duration))){
      _ftpDuration = Number(plan.duration);
      setPlayerDuration(_ftpDuration,'api');
    }
    const attached = await attachPlayerSource(plan.src, plan.mode);
    if(!attached)throw new Error('HLS not supported');
    if(wasPlaying)vid.play().catch(()=>{});
  }catch(e){
    _ftpSeekPending = false;
    clearTimeout(seekTimer);
    document.getElementById('playerSpinner').classList.remove('on');
    showVlcPlaybackNotice(_ftpStreamUrl, vid._vlcFallbackTitle || '');
  }
}



function closePlayer(){
  clearInterval(vid._pi);clearTimeout(uiHideTimer);
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
  _ftpStreamUrl='';
  _ftpDuration=0;
  _ftpNeedsTranscode=false;
  _ftpTrackLoadPromise=null;
  _ftpSeekPending=false;
  vid._ftpFallbackStepsTried = new Set();
  vid._localFallbackStepsTried = new Set();
  _currentPlaybackPlan=null;
  _currentFtpPlaybackPlan=null;
  exitMobileLandscapeMode();
  if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}
  isLiveMode=false;
  vid.src='';
  vid.querySelectorAll('track').forEach(t=>t.remove());
  clearSubtitleOverlay();
  document.getElementById('playerModal').classList.remove('open');
  document.getElementById('playerSpinner').classList.remove('on');
  hidePlayerNotice();
  document.getElementById('playerLiveBadge').classList.remove('show');
  document.getElementById('progressWrap').classList.remove('live-mode');
  document.body.style.overflow='';
  closeAllDropdowns();
  closeAllSeriesDropdowns();
  hideSeriesPlayerBar();
  buildRows();
  if(currentShow)renderEpisodes(currentShow,currentSeason);
  if(document.fullscreenElement)document.exitFullscreen?.();
  if(document.webkitFullscreenElement)document.webkitExitFullscreen?.();
}

async function loadQualityOptions(id){
  let data={available:['auto','1080p','720p','480p','360p'],native:'auto'};
  try{
    const r=await fetch(`/api/qualities/${id}`);
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
  vid.addEventListener('loadedmetadata',()=>{if(!sourceSeek)vid.currentTime=t;if(!paused)vid.play().catch(()=>{});},{once:true});
  if(sourceSeek)sourceSeekTo(t);
  else attachPlayerSource(streamUrlFor(currentStreamId, 0),'direct');
  document.querySelectorAll('#qualList .pd-item').forEach(el=>{el.classList.toggle('active',el.textContent.trim().startsWith(q==='auto'?'Auto':q));});
  closeAllDropdowns();showToast(`Quality: ${q==='auto'?'Auto':q}`);
}

async function loadSubtitleTracks(id){
  availableSubs=[];clearSubtitleOverlay();
  vid.querySelectorAll('track').forEach(t=>t.remove());
  let externalSubs = [];
  let probedEmbeddedSubs = [];
  try{
    const r=await fetch(`/api/subtitles/${id}`);
    if(r.ok){
      const data=await r.json();
      externalSubs=Array.isArray(data)?data:[];
    }
  }catch(e){
    console.warn('[Subtitles] Load error:',e.message);
  }
  try{
    const r=await fetch(`/api/media-info/${id}`);
    if(r.ok){
      const data=await r.json();
      const subtitleTracks=Array.isArray(data.subtitleTracks)?data.subtitleTracks:[];
      probedEmbeddedSubs=subtitleTracks.filter(subtitleCanRenderAsVtt).map((track,i)=>({
        ...track,
        embedded:true,
        sourceIndex:track.index,
        streamIndex:track.index,
        src:`/subtitles/${id}/embedded/${track.index}.vtt`,
        label:track.title || mediaLanguageLabel(track.language) || `Embedded ${i + 1}`,
        lang:track.language || 'en',
      }));
    }
  }catch(e){
    console.warn('[Subtitles] Embedded load error:',e.message);
  }
  const nativeEmbeddedSubs=isMobilePlaybackClient()?[]:desktopNativeSubtitleTracks();
  const embeddedSubs=dedupeSubtitleOptions([...probedEmbeddedSubs,...nativeEmbeddedSubs]);
  availableSubs=dedupeSubtitleOptions([...externalSubs,...embeddedSubs]).map((track,i)=>({...track,index:i,label:subtitleTrackLabel(track,i)}));
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
  renderSubtitleTracks();
  closeAllDropdowns();
  showToast(currentSubIdx===-1?'Subtitles off':availableSubs[currentSubIdx]?.label||'Subtitles on');
  playbackDebug('FTP subtitle switch',{idx:currentSubIdx,sourceUnchanged:sourceBefore===vid.currentSrc});
}

function setSub(idx){
  if(_ftpStreamUrl){
    setFtpSubtitle(idx);
    return;
  }
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
    return;
  }
  currentSubIdx=idx;
  const tracks=Array.from(vid.querySelectorAll('track'));
  tracks.forEach(el=>setTrackMode(el,idx!==-1&&parseInt(el.getAttribute('data-idx'),10)===idx));
  if(idx!==-1){setTimeout(()=>{tracks.forEach(el=>setTrackMode(el,parseInt(el.getAttribute('data-idx'),10)===idx));updateSubtitleOverlay();},150);}
  else updateSubtitleOverlay();
  document.querySelectorAll('#subList .pd-item').forEach((el,ei)=>el.classList.toggle('active',idx===-1?ei===0:ei===idx+1));
  updateSubBtn();closeAllDropdowns();showToast(idx===-1?'Subtitles off':availableSubs[idx]?.label||'Subtitles on');
}
function updateSubBtn(){const on=currentSubIdx!==-1;document.getElementById('subLabel').textContent=on?(availableSubs[currentSubIdx]?.label||'On'):'CC';document.getElementById('subBtn').classList.toggle('active',on);}

const SPEEDS=[0.25,0.5,0.75,1,1.25,1.5,1.75,2];
function buildSpeedList(){
  document.getElementById('speedList').innerHTML=SPEEDS.map(s=>`<div class="pd-item${s===1?' active':''}" onclick="setSpeed(${s})"><span>${s===1?'Normal':s+'×'}</span><span class="check">✓</span></div>`).join('');
}
function setSpeed(s){
  currentSpeed=s;vid.playbackRate=s;
  document.getElementById('speedLabel').textContent=s===1?'1×':s+'×';
  document.querySelectorAll('#speedList .pd-item').forEach(el=>{const v=parseFloat(el.textContent);el.classList.toggle('active',v===s||(s===1&&el.textContent.includes('Normal')));});
  closeAllDropdowns();showToast(`Speed: ${s===1?'Normal':s+'×'}`);
}

function openDropdown(id,btn){
  if((id === 'audioDD' || id === 'subDD') && _ftpStreamUrl)ensureFtpTrackOptionsLoaded();
  if((id === 'audioDD' || id === 'subDD') && !_ftpStreamUrl)ensureLocalTrackOptionsLoaded();
  const menu=document.getElementById(id);
  const wasOpen=menu.classList.contains('open');
  closeAllDropdowns();
  if(wasOpen)return;
  menu.style.visibility='hidden';menu.style.display='block';
  const mh=menu.offsetHeight,mw=menu.offsetWidth;
  menu.style.display='';menu.style.visibility='';
  const r=btn.getBoundingClientRect();
  let top=r.top-mh-10;if(top<8)top=r.bottom+8;
  let left=r.left+r.width/2-mw/2;left=Math.max(8,Math.min(left,window.innerWidth-mw-8));
  menu.style.top=top+'px';menu.style.left=left+'px';
  menu.classList.add('open');
}
function closeAllDropdowns(){document.querySelectorAll('.player-dropdown').forEach(m=>{m.classList.remove('open');m.style.top=m.style.left='';});}
document.addEventListener('click',e=>{if(!e.target.closest('[onclick*="openDropdown"]')&&!e.target.closest('.player-dropdown'))closeAllDropdowns();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeAllDropdowns();
    if(document.getElementById('playerModal').classList.contains('open')){closePlayer();return;}
    if(document.getElementById('seriesModal').classList.contains('open')){closeSeriesModal();return;}
    if(document.getElementById('searchOverlay').classList.contains('open')){closeSearchOverlay();return;}
  }
  if(document.getElementById('playerModal').classList.contains('open')){
    if(e.key===' '){e.preventDefault();togglePlay();}
    if(!isLiveMode){if(e.key==='ArrowRight')seekBy(10);if(e.key==='ArrowLeft')seekBy(-10);}
    if(e.key==='ArrowUp'){vid.volume=Math.min(1,vid.volume+.1);document.getElementById('volSlider').value=vid.volume;updateVolIcon();}
    if(e.key==='ArrowDown'){vid.volume=Math.max(0,vid.volume-.1);document.getElementById('volSlider').value=vid.volume;updateVolIcon();}
    if(e.key==='f'||e.key==='F')toggleFullscreen();
    if(e.key==='m'||e.key==='M')toggleMute();
    showUI();
  }
});

function openSearchOverlay(){
  document.getElementById('searchOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  document.getElementById('bnSearch')?.classList.add('active');
  setTimeout(()=>document.getElementById('searchInputMobile').focus(),80);
}
function closeSearchOverlay(silent=false){
  document.getElementById('searchOverlay').classList.remove('open');
  document.getElementById('searchInputMobile').value='';
  document.getElementById('mobileSearchGrid').innerHTML='';
  document.getElementById('mobileSearchLabel').textContent='';
  document.body.style.overflow='';
  if(!silent)document.getElementById('bnSearch')?.classList.remove('active');
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
    if(!q.trim()){sec.style.display='none';main.style.display='';hero.style.display='';return;}
    main.style.display='none';hero.style.display='none';sec.style.display='block';
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

window.addEventListener('scroll',()=>{document.getElementById('nav').classList.toggle('solid',scrollY>60);},{passive:true});

vid.removeAttribute('controls');
vid.controls=false;

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
  const unavailableOverlay = isUnplayable ? `<div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 8px;font-size:.52rem;font-weight:800;color:rgba(255,255,255,.72)">LIBRARY ONLY</div>` : '';
  return `<div class="card" role="button" tabindex="0" onclick="openMovieDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMovieDetail('${detailKey}')}">${img}${unavailableOverlay}<div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(m.name)}</div><div class="card-meta">${m.rating?`<span class="card-rating">&#9733; ${esc(m.rating)}</span>`:''} ${m.year?`<span>${esc(m.year)}</span>`:''}</div></div>${bar}</div>`;
}

function isMovieUnavailable(movie){
  return movie?.streamAvailable === false || (movie?.isTrending && !movie.streamUrl && !movie.isFtp && typeof movie.id === 'string' && movie.id.startsWith('tmdb_'));
}

function movieIdentity(movie){
  return String(movie?.id ?? movie?.streamUrl ?? movie?.name ?? '');
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
  if(btn)btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v16z"/></svg>${active?'In Watchlist':'Watchlist'}`;
  if(top)top.classList.toggle('active', active);
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

async function fetchTitleDetails(item, type){
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
  console.log('[FRONT DETAIL REQUEST ITEM]', item);
  console.log('[FRONT DETAIL REQUEST URL]', url);
  const r = await fetchWithTimeout(url, {}, 17000);
  const data = r.ok ? await r.json() : null;

  console.log('[FRONT DETAIL RESPONSE]', data);

  const safe = data || { ok:false };
  if(safe.ok) _titleDetailsCache.set(key, safe);
  return safe;
}

function fetchWithTimeout(url, options={}, timeout=4500){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeout);
  return fetch(url, {...options, signal:controller.signal}).finally(()=>clearTimeout(timer));
}

function imageFallbackData(title='StreamVault'){
  const safeTitle = esc(String(title || 'StreamVault')).slice(0, 80);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#16181d"/><rect x="118" y="48" width="84" height="84" rx="42" fill="#2b3038"/><path d="M145 70v40l34-20z" fill="#f7f7f4"/><text x="160" y="154" text-anchor="middle" fill="#8b949e" font-family="Arial,sans-serif" font-size="16" font-weight="700">${safeTitle}</text></svg>`)}`;
}

function splitDetailGenres(value){
  return String(value || '').split(/[,/|]/).map(g=>g.trim().toLowerCase()).filter(Boolean);
}

function localSimilarItems(item, type){
  const genres = splitDetailGenres(item?.genre);
  const source = type === 'tv' ? series : movies;
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
  return movies
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
  const visibleItems = Array.isArray(items) ? items.slice(0, limit) : [];
  if(!visibleItems.length){
    el.innerHTML = noDataHTML();
    return;
  }
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

  renderMediaCards(prefix + 'SimilarTrack', firstNonEmptyArray(finalDetails.similar, local.similar));
}

function mergeTitleDetails(item, details){
  if(!item || !details || !details.ok)return;
  item.tmdbId = details.tmdbId || item.tmdbId;
  item.poster = item.poster || details.poster || '';
  item.backdrop = item.backdrop || details.backdrop || '';
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
    let quality = null;
    if(movie.isFtp && movie.streamUrl){
      const r = await fetchWithTimeout(`/api/ftp/media-info?url=${encodeURIComponent(movie.streamUrl)}`, {}, 3500);
      if(r.ok)info = await r.json();
    }else if(movie.id !== undefined && movie.id !== null && !String(movie.id).startsWith('tmdb_')){
      const [iR,qR] = await Promise.all([
        fetchWithTimeout(`/api/media-info/${movie.id}`, {}, 3500).catch(()=>null),
        fetchWithTimeout(`/api/qualities/${movie.id}`, {}, 3500).catch(()=>null)
      ]);
      if(iR&&iR.ok)info = await iR.json();
      if(qR&&qR.ok)quality = await qR.json();
    }
    if(!info && !quality)return;
    grid.innerHTML = [
      metadataItem('Quality', inferQuality(movie, quality)),
      metadataItem('Runtime', info?.duration ? fmtTime(info.duration) : (movie.runtime || 'Unknown')),
      metadataItem('Format', cleanContainer(info?.container) || 'Unknown'),
      metadataItem('Video', info?.videoCodec ? info.videoCodec.toUpperCase() : 'Auto'),
      metadataItem('Audio', trackSummary(info?.audioTracks, 'Default')),
      metadataItem('Subtitles', trackSummary(info?.subtitleTracks, 'None found')),
      metadataItem('Source', source),
      quality?.sizeMB ? metadataItem('Size', `${quality.sizeMB} MB`) : '',
    ].join('');
  }catch(e){
    console.warn('[Detail] Media info unavailable:', e.message);
  }
}

async function loadMovieOnlineDetails(movie, token){
  try{
    const details = await fetchTitleDetails(movie, movie.type === 'tv' ? 'tv' : 'movie');
    if(token !== _titleDetailsToken || currentDetailMovie !== movie)return;
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
    if(details?.poster && !document.getElementById('mdPoster').getAttribute('src')){
      document.getElementById('mdPoster').src = svOptimizeImageUrl(details.poster, false);
      document.getElementById('mdPoster').style.display = '';
    }
    if(details?.backdrop && !document.getElementById('mdBackdrop').getAttribute('src')){
      document.getElementById('mdBackdrop').src = svOptimizeImageUrl(details.backdrop, true);
      document.getElementById('mdBackdrop').style.display = '';
    }
  }catch(e){
    console.warn('[Detail] Online details unavailable:', e.message);
    renderOnlineSections('md', localTitleDetails(movie, movie.type === 'tv' ? 'tv' : 'movie'), movie.type === 'tv' ? 'tv' : 'movie', movie);
  }
}

function openMovieDetail(key){
  const movie = _movieDetailRegistry.get(key);
  if(!movie)return;
  currentDetailMovie = movie;
  const modal = document.getElementById('movieDetailModal');
  const poster = document.getElementById('mdPoster');
  const backdrop = document.getElementById('mdBackdrop');
  const art = movie.backdrop || movie.poster || '';
  poster.src = svOptimizeImageUrl(movie.poster || art || '', false);
  poster.style.display = poster.src ? '' : 'none';
  backdrop.src = svOptimizeImageUrl(art || movie.poster || '', true);
  backdrop.style.display = backdrop.src ? '' : 'none';
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
    ? '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v6h-2V7h2zm0 8v2h-2v-2h2z"/></svg>Not in Library'
    : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Watch';
  watchBtn.onclick = unavailable ? ()=>showToast('This title is not in your library') : ()=>playMovieFromDetail();
  document.getElementById('mdSimilarTitle').textContent = movie.type === 'tv' ? 'Similar Shows' : 'Similar Movies';
  const token = ++_titleDetailsToken;
  setOnlinePlaceholders('md');
  renderMovieAbout(movie);
  renderMovieMediaInfo(movie);
  loadMovieOnlineDetails(movie, token);
  updateMovieWatchlistButtons();
  modal.classList.add('open');
  modal.scrollTop = 0;
  document.body.classList.add('modal-open');
}

function closeMovieDetail(){
  document.getElementById('movieDetailModal')?.classList.remove('open');
  currentDetailMovie = null;
  document.body.classList.remove('modal-open');
}

async function hydrateMoviePlayback(movie){
  if(!movie || movie.streamUrl || (!movie.isFtp && !movie.hasStream && movie.streamAvailable !== true))return movie;
  try{
    const params = new URLSearchParams();
    if(movie.name)params.set('title', movie.name);
    if(movie.year)params.set('year', movie.year);
    const r = await fetchWithTimeout(`/api/playback/movie/${encodeURIComponent(movie.id || movie.name || '')}?${params.toString()}`, {}, 2500);
    if(r && r.ok){
      const data = await r.json();
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
  closeMovieDetail();
  if(movie.streamUrl){
    playFtpMedia(movie.streamUrl, movie.name, movie.year || '');
  }else{
    playMedia(movie.id, movie.name, movie.year || '');
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
  const input = document.getElementById('searchPageInput');
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
    document.getElementById('hero').style.display='none';
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
    document.getElementById('hero').style.display='';
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
  if(e.key==='Escape' && document.getElementById('movieDetailModal')?.classList.contains('open')){
    closeMovieDetail();
  }
});
decorateRowHeaders();

function setupPlayerEvents() {
  // Video element handlers (named so removeEventListener works correctly)
  vid.removeEventListener('timeupdate',     vid._tuH);
  vid.removeEventListener('progress',       vid._prH);
  vid.removeEventListener('loadedmetadata', vid._mdH);
  vid.removeEventListener('ended',          vid._enH);
  vid.removeEventListener('waiting',        vid._waH);
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
    updateSubtitleOverlay();
    if(isLiveMode||progressDragging)return;
    const ct=playbackTime();
    document.getElementById('timeNow').textContent=fmtTime(ct);
    const d=dur(); if(!d)return;
    const p=Math.min(ct/d,1);
    document.getElementById('progressPlayed').style.width=(p*100)+'%';
    document.getElementById('progressThumb').style.left=(p*100)+'%';
    if(currentStreamId&&!_ftpStreamUrl&&d>0&&!isNaN(ct)){
      if(!vid._lstSv||Date.now()-vid._lstSv>5000){
        vid._lstSv=Date.now();
        const pv=ct/d;
        if(pv>0.02&&pv<0.95){watchProgress[currentStreamId]={progress:pv,updatedAt:Date.now()};try{localStorage.setItem('sv_progress',JSON.stringify(watchProgress));}catch(_){}}
      }
    }
  };
  vid._prH=()=>{
    const d=dur(); if(!d)return;
    let mb=0;for(let i=0;i<vid.buffered.length;i++)mb=Math.max(mb,vid.buffered.end(i));
    document.getElementById('progressBuffered').style.width=(Math.min(((vid._sourceOffset||0)+mb)/d,1)*100)+'%';
  };
  // Replace vid._mdH with:
vid._mdH = () => {
  if (isLiveMode) return;
  if(!isMobilePlaybackClient()){
    refreshDesktopNativeAudioTracks();
    if(_ftpStreamUrl)refreshDesktopNativeSubtitleTracks(false);
  }
  const newDur = vid.duration;
  if (newDur && isFinite(newDur) && newDur > 0) {
    document.getElementById('playerSpinner').classList.remove('on');
    if ((!_ftpStreamUrl || !_ftpNeedsTranscode) && !vid._durationPending && !validDurationSeconds(vid._apiDuration)) {
      const duration = setPlayerDuration(newDur);
      if(duration && currentStreamId)maybeResumeProgress(currentStreamId, duration);
    }
  }
};
  vid._enH=()=>{
    updatePlayIcons(true);
    if(currentStreamId&&!_ftpStreamUrl){watchProgress[currentStreamId]={progress:0.99,updatedAt:Date.now()};try{localStorage.setItem('sv_progress',JSON.stringify(watchProgress));}catch(_){}}
  };
  vid._waH=()=>document.getElementById('playerSpinner').classList.add('on');
  vid._plH=()=>document.getElementById('playerSpinner').classList.remove('on');
  vid._cpH=()=>document.getElementById('playerSpinner').classList.remove('on');
  vid._paH=()=>updatePlayIcons(false);
  vid._puH=()=>updatePlayIcons(true);
  vid._skH=()=>setTimeout(updateSubtitleOverlay,60);
  vid.addEventListener('timeupdate',    vid._tuH);
  vid.addEventListener('progress',      vid._prH);
  vid.addEventListener('loadedmetadata',vid._mdH);
  vid.addEventListener('ended',         vid._enH);
  vid.addEventListener('waiting',       vid._waH);
  vid.addEventListener('playing',       vid._plH);
  vid.addEventListener('canplay',       vid._cpH);
  vid.addEventListener('play',          vid._paH);
  vid.addEventListener('pause',         vid._puH);
  vid.addEventListener('seeked',        vid._skH);

  // Progress bar — bind ONCE using a flag
  const pw=document.getElementById('progressWrap');
  if(!pw._bound){
    pw._bound=true;
    let dragT=0;
    let suppressProgressClickUntil=0;
    function getP(e){
      return progressRatioFromEvent(e, pw);
    }
    function visual(p,d){
      dragT=p*d;
      document.getElementById('progressPlayed').style.width=(p*100)+'%';
      document.getElementById('progressThumb').style.left=(p*100)+'%';
      document.getElementById('progressTooltip').style.left=(p*100)+'%';
      document.getElementById('progressTooltip').textContent=fmtTime(dragT);
      document.getElementById('timeNow').textContent=fmtTime(dragT);
    }
    function commit(){
      progressDragging=false; pw.classList.remove('dragging');
      const d=dur(); if(!d)return;
      const t=Math.max(0,Math.min(d,dragT));
      seekToTime(t);
    }
    pw.addEventListener('mousedown',e=>{
      if(isLiveMode)return; const d=dur(); if(!d)return;
      e.preventDefault(); progressDragging=true; pw.classList.add('dragging'); visual(getP(e),d);
    });
    pw.addEventListener('mousemove',e=>{
      const d=dur(); if(!d)return;
      const p=getP(e);
      document.getElementById('progressTooltip').style.left=(p*100)+'%';
      document.getElementById('progressTooltip').textContent=fmtTime(p*d);
      if(progressDragging)visual(p,d);
    });
    document.addEventListener('mouseup',()=>{if(progressDragging)commit();});
    pw.addEventListener('touchstart',e=>{
      if(isLiveMode)return; const d=dur(); if(!d)return;
      e.preventDefault(); progressDragging=true; pw.classList.add('dragging'); visual(getP(e),d);
    },{passive:false});
    pw.addEventListener('touchmove',e=>{
      if(!progressDragging)return; e.preventDefault();
      const d=dur(); if(!d)return; visual(getP(e),d);
    },{passive:false});
    pw.addEventListener('touchend',()=>{if(progressDragging){suppressProgressClickUntil=Date.now()+450;commit();}});
    pw.addEventListener('click',e=>{
      if(Date.now()<suppressProgressClickUntil)return;
      if(isLiveMode||progressDragging)return;
      const d=dur(); if(!d)return;
      const t=getP(e)*d;
      seekToTime(t);
    });
  }

  // Wrap and tap zone — bind ONCE
  const wrap=document.getElementById('playerWrap');
  if(!wrap._bound){
    wrap._bound=true;
    wrap.addEventListener('mousemove',()=>{wrap.classList.add('show-cursor');showUI();});
    wrap.addEventListener('mouseleave',()=>scheduleHideUI());
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
    initPiP();
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
   StreamVault runtime patch: faster first-paint images, channel card colors,
   Marvel/DC wide-card rendering. Kept separate so existing playback/API logic
   remains intact.
───────────────────────────────────────────────────────────────────────────── */
const _svWeakDevice = ((navigator.deviceMemory || 4) <= 2) || ((navigator.hardwareConcurrency || 4) <= 2) || (innerWidth < 760 && ((navigator.deviceMemory || 4) <= 3));
window._svWeakDevice = _svWeakDevice;
document.documentElement.classList.toggle('sv-weak-device', _svWeakDevice);
let _svEagerImageBudget = _svWeakDevice || innerWidth < 760 ? 5 : 8;
window._svEagerImageBudget = _svEagerImageBudget;
function svConsumeImageAttrs(priority=false, immediate=false){
  const eager = priority || immediate || window._svEagerImageBudget-- > 0;
  const fetchPriority = priority ? 'high' : (eager ? 'auto' : 'low');
  return `loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${fetchPriority}" decoding="async" onload="this.dataset.svLoaded='1';this.classList.add('poster-loaded','is-loaded')"`;
}
function svOptimizeImageUrl(src='', wide=false){
  const url = String(src || '');
  if(!url.includes('image.tmdb.org/t/p/'))return url;
  const width = wide ? 780 : (_svWeakDevice || innerWidth < 760 ? 185 : 342);
  const size = `w${width}`;
  const normalized = url.replace(/\/t\/p\/(?:original|w\d+)\//, `/t/p/${size}/`);
  return `/poster-cache?url=${encodeURIComponent(normalized)}&w=${width}`;
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
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js?v=20260620-player-tracks-sections-final1').catch(()=>{});
  }, { once:true });
}
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
  const src=svMediaArt(m, false);
  const img=src
    ? `<img src="${esc(src)}" alt="${esc(m.name || '')}" ${svConsumeImageAttrs(!!m._priorityImage, !!m._immediateImage)} width="342" height="513">`
    : `<div class="card-placeholder"><div class="icon">${svPlaceholderIcon('movie')}</div><div class="pname">${esc(m.name || '')}</div></div>`;
  const prog=watchProgress[m.id];
  const bar=sp&&prog?`<div class="card-progress"><div class="card-progress-fill" style="width:${Math.round(prog.progress*100)}%"></div></div>`:'';
  const isUnplayable = isMovieUnavailable(m);
  const detailKey = registerMovieForDetail(m);
  const unavailableOverlay = isUnplayable ? `<div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 8px;font-size:.52rem;font-weight:800;color:rgba(255,255,255,.72);z-index:8">LIBRARY ONLY</div>` : '';
  return `<div class="card" role="button" tabindex="0" onclick="openMovieDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMovieDetail('${detailKey}')}">${img}${unavailableOverlay}<div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(m.name || '')}</div><div class="card-meta">${m.rating?`<span class="card-rating">&#9733; ${esc(m.rating)}</span>`:''} ${m.year?`<span>${esc(m.year)}</span>`:''}</div></div>${bar}</div>`;
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
  const list=(items||[]).slice(0, limit);
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
    const r = await fetch(`/api/movies/keywords?q=${encodeURIComponent(keywords.join(','))}`);
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
  svRenderLazyTrack(trackId,rowId,list,(m,i)=>cardHTML({...m,_priorityImage:i<2}),{limit:50,initial:svInitialCardCount(rowId),batch:4});
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
    {limit:50,initial:svInitialCardCount(rowId),batch:4}
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
  if(rowId==='seriesRow')return (series||[]).slice(0,50).map(s=>({...s,_isSeries:true}));
  if(rowId==='allRow')return svSortItems(movies||[]).slice(0,50);
  if(rowId==='highRatedRow'){
    const rated=all.filter(i=>parseFloat(i.rating)||0).sort((a,b)=>(parseFloat(b.rating)||0)-(parseFloat(a.rating)||0));
    if(rated.length)return rated.slice(0,50);
  }
  const off=offsets[rowId]||0;
  return all.slice(off,off+50);
}
function svRenderMixedTrack(trackId,rowId,list,limit=50){
  const track=document.getElementById(trackId);
  if(!track){hide(rowId);return;}
  let items=svSortItems(list).slice(0,limit);
  if(!items.length)items=svFallbackHomeItems(rowId).slice(0,limit);
  if(!items.length){hide(rowId);return;}
  svRenderLazyTrack(trackId,rowId,items,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit});
}
function svBuildKeywordRow(trackId,rowId,keywords,{includeSeries=true,limit=50}={}){
  const mList=(movies||[]).filter(m=>svAnyKeyword(m,keywords));
  const sList=includeSeries?(series||[]).filter(s=>svAnyKeyword(s,keywords)).map(s=>({...s,_isSeries:true})):[];
  svRenderMixedTrack(trackId,rowId,[...sList,...mList],limit);
}
function svBuildPredicateRow(trackId,rowId,pred,{includeSeries=true,limit=50}={}){
  const mList=(movies||[]).filter(pred);
  const sList=includeSeries?(series||[]).filter(pred).map(s=>({...s,_isSeries:true})):[];
  svRenderMixedTrack(trackId,rowId,[...sList,...mList],limit);
}
function svBuildIndianRow(){
  const keys=['hindi','bengali','bangla','tamil','telugu','malayalam','kannada','bollywood','india','indian','kollywood','tollywood','dhallywood'];
  svBuildPredicateRow('indianTrack','indianRow',item=>svAnyKeyword(item,keys),{includeSeries:true,limit:50});
}
function svFallbackTrending(){
  const direct=[...(trendingSeries||[]).map(s=>({...s,_isSeries:true})),...(trendingMovies||[])].filter(i=>i&&i.poster);
  if(direct.length)return direct;
  return svSortItems([...(series||[]).map(s=>({...s,_isSeries:true})),...(movies||[])]).filter(i=>i.poster).slice(0,50);
}
function svNewItems(){
  const s=[...(series||[])].slice(-18).reverse().map(x=>({...x,_isSeries:true}));
  const m=[...(movies||[])].slice(-40).reverse();
  const mixed=[...s,...m].filter(i=>i.poster||i.backdrop);
  return mixed.length?mixed:svSortItems([...(series||[]).map(x=>({...x,_isSeries:true})),...(movies||[])]).slice(0,30);
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
    const items=svDedupItems(list.map(svNormalizeOnlineItem).filter(Boolean)).slice(0,50);
    if(!items.length)return;
    if(track.querySelector('.card,.live-ch-card')){
      svRenderLazyTrack(trackId,rowId,items,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit:50});
      return;
    }
    svRenderLazyTrack(trackId,rowId,items,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit:50});
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

  svRenderMixedTrack('newTrack','newRow',svNewItems(),50);
  buildLiveHomeRow();
  svBuildKeywordRow('netflixTrack','netflixRow',[
    'netflix','stranger things','witcher','bridgerton','squid game','money heist','dark','narcos','extraction','red notice','bird box','the old guard','enola holmes','wednesday','lucifer'
  ],{includeSeries:true,limit:36});

  svRunRowQueue([
    ()=>buildStudioRow('marvelTrack','marvelRow','marvel',
      ['avengers','iron man','captain america','thor','spider-man','spider man','black panther','doctor strange','ant-man','ant man','guardians of the galaxy','deadpool','wolverine','fantastic four','black widow','shang-chi','captain marvel','infinity war','endgame'],
      ['avengers endgame','avengers infinity war','the avengers','iron man','captain america civil war','guardians of the galaxy','spider man no way home','black panther','thor ragnarok']
    ),
    ()=>buildStudioRow('dcTrack','dcRow','dc',
      ['batman','superman','wonder woman','aquaman','the flash 2023','joker 2019','joker folie','shazam','suicide squad','justice league','man of steel','dark knight','black adam','blue beetle','batman begins','the batman 2022','zack snyder'],
      ['the dark knight','man of steel','wonder woman','justice league','aquaman','joker','the batman','batman begins','batman v superman']
    ),
    ()=>svRenderMixedTrack('trendingTrack','trendingRow',svFallbackTrending(),50),
    ()=>series&&series.length?svRenderLazyTrack('seriesTrack','seriesRow',series,sCardHTML,{limit:50}):hide('seriesRow'),
    ()=>svBuildKeywordRow('universalTrack','universalRow',['universal','jurassic','fast and furious','fast & furious','minions','despicable me','the mummy','halloween','purge','jason bourne','bourne','king kong','jaws','back to the future','scarface','get out','nope','m3gan'],{includeSeries:false}),
    ()=>svBuildKeywordRow('disneyTrack','disneyRow',['disney','pixar','aladdin','mulan','moana','encanto','coco','frozen','tangled','brave','ratatouille','wall-e','inside out','soul','luca','lion king'],{includeSeries:true}),
    ()=>svBuildKeywordRow('warnerTrack','warnerRow',['warner','warner bros','harry potter','lord of the rings','hobbit','matrix','conjuring','dune','mad max','godzilla','king kong','ocean','sherlock holmes','lethal weapon','creed','superman','batman','wonder woman'],{includeSeries:true}),
    ()=>svBuildKeywordRow('hboTrack','hboRow',['hbo','max original','game of thrones','house of the dragon','the sopranos','euphoria','westworld','succession','the last of us','true detective','chernobyl','band of brothers','the wire','peacemaker'],{includeSeries:true}),
    ()=>svBuildKeywordRow('appleTvTrack','appleTvRow',['apple tv','apple tv+','ted lasso','severance','silo','foundation','for all mankind','the morning show','slow horses','invasion','servant','shrinking','masters of the air','greyhound','coda','tetris','finch','ghosted','napoleon','killer of the flower moon'],{includeSeries:true}),
    ()=>svBuildIndianRow(),
    ()=>svBuildPredicateRow('dramaTrack','dramaRow',item=>svAnyKeyword(item,['drama','emotion','romance','family']),{includeSeries:true}),
    ()=>svBuildPredicateRow('spanishTrack','spanishRow',item=>svAnyKeyword(item,['spanish','latino','latin','mexico','mexican','argentina','colombia','spain','casa de papel','money heist','narcos']),{includeSeries:true}),
    ()=>svBuildPredicateRow('highRatedTrack','highRatedRow',item=>item.rating&&parseFloat(item.rating)>=8.0,{includeSeries:true}),
    ()=>movies&&movies.length?renderSortedTrack('allTrack',movies):hide('allRow'),
    ()=>svOnlineRowsCache&&svRenderOnlineSections(svOnlineRowsCache),
  ]);

  svApplyHomeOrder();
}
