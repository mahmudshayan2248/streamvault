(function(){
  var SV_PERF_HOME_LEGACY_MAIN = [
    { rowId:'netflixRow', trackId:'netflixTrack', sectionKey:'netflix', title:'Netflix Originals' },
    { rowId:'marvelRow', trackId:'marvelTrack', sectionKey:'marvel', title:'Marvel Studios' },
    { rowId:'dcRow', trackId:'dcTrack', sectionKey:'dc', title:'DC' },
    { rowId:'universalRow', trackId:'universalTrack', sectionKey:'universal', title:'Universal Pictures' },
    { rowId:'disneyRow', trackId:'disneyTrack', sectionKey:'disney', title:'Disney' },
    { rowId:'warnerRow', trackId:'warnerTrack', sectionKey:'warner', title:'Warner Bros' },
    { rowId:'hboRow', trackId:'hboTrack', sectionKey:'hbo', title:'HBO' },
    { rowId:'appleTvRow', trackId:'appleTvTrack', sectionKey:'apple', title:'Apple TV+' },
    { rowId:'indianRow', trackId:'indianTrack', sectionKey:'indian', title:'Indian Movies & Drama' },
    { rowId:'dramaRow', trackId:'dramaTrack', sectionKey:'drama', title:'Drama & Emotion' },
    { rowId:'spanishRow', trackId:'spanishTrack', sectionKey:'spanish', title:'Spanish & Latino' },
    { rowId:'highRatedRow', trackId:'highRatedTrack', sectionKey:'topRated', title:'⭐ Top Rated (8+)' },
    { rowId:'allRow', trackId:'allTrack', sectionKey:'allMovies', title:'All Movies' },
    { rowId:'trendingRow', trackId:'trendingTrack', sectionKey:'trending', title:'🔥 Trending Now' },
    { rowId:'seriesRow', trackId:'seriesTrack', sectionKey:'series', title:'Series' },
    { rowId:'newRow', trackId:'newTrack', sectionKey:'new', title:'New to StreamVault' }
  ];
  var SV_PERF_HOME_MAIN = [
    { rowId:'netflixRow', trackId:'netflixTrack', sectionKey:'netflix', title:'Netflix Originals' },
    { rowId:'marvelRow', trackId:'marvelTrack', sectionKey:'marvel', title:'Marvel Studios' },
    { rowId:'dcRow', trackId:'dcTrack', sectionKey:'dc', title:'DC' },
    { rowId:'universalRow', trackId:'universalTrack', sectionKey:'universal', title:'Universal Pictures' },
    { rowId:'disneyRow', trackId:'disneyTrack', sectionKey:'disney', title:'Disney' },
    { rowId:'warnerRow', trackId:'warnerTrack', sectionKey:'warner', title:'Warner Bros' },
    { rowId:'hboRow', trackId:'hboTrack', sectionKey:'hbo', title:'HBO' },
    { rowId:'appleTvRow', trackId:'appleTvTrack', sectionKey:'apple', title:'Apple TV+' },
    { rowId:'indianRow', trackId:'indianTrack', sectionKey:'indian', title:'Indian Movies & Drama' },
    { rowId:'animeRow', trackId:'animeTrack', sectionKey:'anime', title:'Anime' },
    { rowId:'koreanRow', trackId:'koreanTrack', sectionKey:'koreanDrama', title:'Korean Drama' },
    { rowId:'horrorRow', trackId:'horrorTrack', sectionKey:'horrorNights', title:'Horror Nights' },
    { rowId:'scifiRow', trackId:'scifiTrack', sectionKey:'cyberpunkScifi', title:'Cyberpunk & Sci-Fi' },
    { rowId:'mindfuckRow', trackId:'mindfuckTrack', sectionKey:'mindfuck', title:'Mindfuck Movies' },
    { rowId:'cultClassicsRow', trackId:'cultClassicsTrack', sectionKey:'cultClassics', title:'Cult Classics' },
    { rowId:'a24Row', trackId:'a24Track', sectionKey:'a24', title:'A24 Collection' },
    { rowId:'nostalgia90sRow', trackId:'nostalgia90sTrack', sectionKey:'nostalgia90s', title:'90s Nostalgia' },
    { rowId:'midnightCinemaRow', trackId:'midnightCinemaTrack', sectionKey:'midnightCinema', title:'Midnight Cinema' },
    { rowId:'trueCrimeRow', trackId:'trueCrimeTrack', sectionKey:'trueCrime', title:'True Crime' },
    { rowId:'thrillerRow', trackId:'thrillerTrack', sectionKey:'psychThriller', title:'Psychological Thriller' },
    { rowId:'adultAnimationRow', trackId:'adultAnimationTrack', sectionKey:'adultAnimation', title:'Adult Animation' },
    { rowId:'postApocalypticRow', trackId:'postApocalypticTrack', sectionKey:'postApocalyptic', title:'Post-Apocalyptic' },
    { rowId:'feelGoodRow', trackId:'feelGoodTrack', sectionKey:'feelGood', title:'Feel Good Movies' },
    { rowId:'darkComedyRow', trackId:'darkComedyTrack', sectionKey:'darkComedy', title:'Dark Comedy' },
    { rowId:'timeTravelRow', trackId:'timeTravelTrack', sectionKey:'timeTravel', title:'Time Travel' },
    { rowId:'spaceAiRow', trackId:'spaceAiTrack', sectionKey:'spaceAi', title:'Space & AI' },
    { rowId:'crimeRow', trackId:'crimeTrack', sectionKey:'crimeSyndicates', title:'Crime Syndicates' },
    { rowId:'zombieRow', trackId:'zombieTrack', sectionKey:'zombie', title:'Zombie Universe' },
    { rowId:'indieGemsRow', trackId:'indieGemsTrack', sectionKey:'indieGems', title:'Indie Gems' },
    { rowId:'hiddenMasterpiecesRow', trackId:'hiddenMasterpiecesTrack', sectionKey:'hiddenMasterpieces', title:'Hidden Masterpieces' },
    { rowId:'liveConcertsRow', trackId:'liveConcertsTrack', sectionKey:'liveConcerts', title:'Live Concerts' },
    { rowId:'documentaryRow', trackId:'documentaryTrack', sectionKey:'documentaryVault', title:'Documentary Vault' },
    { rowId:'ghibliRow', trackId:'ghibliTrack', sectionKey:'ghibli', title:'Studio Ghibli' },
    { rowId:'romanticRow', trackId:'romanticTrack', sectionKey:'romanceMidnight', title:'Romance After Midnight' },
    { rowId:'comingSoonRow', trackId:'comingSoonTrack', sectionKey:'comingSoon', title:'Coming Soon' },
    { rowId:'dramaRow', trackId:'dramaTrack', sectionKey:'drama', title:'Drama & Emotion' },
    { rowId:'spanishRow', trackId:'spanishTrack', sectionKey:'spanish', title:'Spanish & Latino' },
    { rowId:'highRatedRow', trackId:'highRatedTrack', sectionKey:'topRated', title:'⭐ Top Rated (8+)' },
    { rowId:'allRow', trackId:'allTrack', sectionKey:'allMovies', title:'All Movies' },
    { rowId:'recentlyAddedRow', trackId:'recentlyAddedTrack', sectionKey:'recentlyAdded', title:'Recently Added' },
    { rowId:'mostWatchedTodayRow', trackId:'mostWatchedTodayTrack', sectionKey:'mostWatchedToday', title:'Most Watched Today' },
    { rowId:'trendingRow', trackId:'trendingTrack', sectionKey:'trending', title:'🔥 Trending Now' },
    { rowId:'seriesRow', trackId:'seriesTrack', sectionKey:'series', title:'Series' },
    { rowId:'newRow', trackId:'newTrack', sectionKey:'new', title:'New to StreamVault' }
  ];
  var SV_PERF_HOME_BY_ID = Object.fromEntries(SV_PERF_HOME_MAIN.map(row=>[row.rowId,row]));
  var svHomePayload = null;
  var svHomePayloadPromise = null;
  var svHomeObserver = null;
  var svSectionState = { key:'', page:0, pages:0, items:[] };
  var svLegacyBuildRows = buildRows;
  var svHomeHeroClaims = new Set();
  var svHomeRowClaims = new Map();
  var svWeakDevice = ((navigator.deviceMemory || 4) <= 2) || ((navigator.hardwareConcurrency || 4) <= 2) || (innerWidth < 760 && ((navigator.deviceMemory || 4) <= 3));
  var SV_HOME_MIN_ROW_ITEMS = svWeakDevice ? 6 : 8;
  var SV_DYNAMIC_BRAND_ROWS = new Set(['warnerRow','hboRow']);

  function svInstallNormalStudioPosterSizing(){
    if(document.getElementById('svNormalStudioPosterSizing'))return;
    const style = document.createElement('style');
    style.id = 'svNormalStudioPosterSizing';
    style.textContent = `
      #marvelTrack,#dcTrack{height:calc(var(--card-h) + 24px)!important;gap:16px!important}
      #marvelTrack .card,#dcTrack .card{flex:0 0 var(--card-w)!important;width:var(--card-w)!important;min-width:var(--card-w)!important;max-width:var(--card-w)!important;height:var(--card-h)!important;min-height:var(--card-h)!important;max-height:var(--card-h)!important;border-radius:var(--card-radius)!important}
      #marvelTrack .card img,#dcTrack .card img,#marvelTrack .card-placeholder,#dcTrack .card-placeholder{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:var(--card-radius)!important}
      #marvelTrack .card-overlay,#dcTrack .card-overlay{padding:12px 10px 10px!important;border-radius:var(--card-radius)!important}
    `;
    document.head.appendChild(style);
  }
  svInstallNormalStudioPosterSizing();

  function svHomeRenderer(item, index){
    const isSeries = item?.type === 'tv' || item?.type === 'series' || item?.isSummary || item?.seasons;
    return isSeries ? sCardHTML(item) : cardHTML(item);
  }

  function svCleanHomeTitle(value){
    return String(value || '')
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,5}$/i,' ')
      .replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|webrip|web[-\s]?dl|bluray|x264|x265|hevc|aac|dual audio|multi audio|hindi|english|bengali|bangla)\b.*$/ig,' ')
      .replace(/\b(tv series|web series|season \d+|s\d{1,2}e\d{1,3})\b/ig,' ')
      .replace(/\b(19|20)\d{2}\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function svPosterKey(url){
    const raw = String(url || '').trim();
    if(!raw)return '';
    try{
      const parsed = new URL(raw, location.origin);
      return parsed.pathname.toLowerCase().replace(/\/(w\d+|original)\//g,'/').replace(/\.[a-z0-9]{2,5}$/,'');
    }catch(_){
      return raw.toLowerCase().split('?')[0].replace(/\.[a-z0-9]{2,5}$/,'');
    }
  }

  function svHomeItemKeys(item){
    const keys = [];
    const poster = svPosterKey(item?.poster);
    const backdrop = svPosterKey(item?.backdrop);
    if(poster)keys.push(`poster:${poster}`);
    if(backdrop)keys.push(`poster:${backdrop}`);
    if(item?.tmdbId)keys.push(`tmdb:${item.tmdbId}`);
    return keys;
  }

  function svHomeTitleKey(item){
    const kind = item?.type === 'tv' || item?.type === 'series' || item?.isSummary || item?.seasons ? 'series' : 'movie';
    const title = svCleanHomeTitle(item?.name || item?.title || item?.file || '');
    return title ? `${kind}:${title}` : '';
  }

  function svResetHomeClaims(){
    svHomeHeroClaims = new Set();
    svHomeRowClaims = new Map();
    (heroMovies || []).forEach(item=>svHomeItemKeys(item).forEach(key=>svHomeHeroClaims.add(key)));
  }

  function svClaimHomeItems(rowId, items, limit){
    const activeClaims = new Set(svHomeHeroClaims);
    svHomeRowClaims.forEach((claims, owner)=>{
      if(owner !== rowId)claims.forEach(key=>activeClaims.add(key));
    });
    const owned = new Set();
    const ownedTitles = new Set();
    const out = [];
    const take = (item, allowPreviousClaims)=>{
      const keys = svHomeItemKeys(item);
      const title = svHomeTitleKey(item);
      if(!keys.length && !title)return false;
      if(title && ownedTitles.has(title))return false;
      if(keys.some(key=>owned.has(key)))return false;
      if(!allowPreviousClaims && keys.some(key=>activeClaims.has(key)))return false;
      keys.forEach(key=>owned.add(key));
      if(title)ownedTitles.add(title);
      out.push(item);
      return true;
    };
    for(const item of items || []){
      take(item, false);
      if(out.length >= limit)break;
    }
    const minFill = Math.min(limit, svWeakDevice ? 6 : 10, (items || []).length);
    if(out.length < minFill){
      for(const item of items || []){
        take(item, true);
        if(out.length >= limit || out.length >= minFill)break;
      }
    }
    svHomeRowClaims.set(rowId, owned);
    return out;
  }

  function svSkeletonTrack(track){
    if(!track)return;
    if(track.querySelector('.card,.live-ch-card'))return;
    if(track.children.length)return;
    const count = svWeakDevice ? (window.innerWidth < 760 ? 3 : 5) : (window.innerWidth < 760 ? 5 : 8);
    track.innerHTML = Array.from({length:count},()=>'<div class="sv-skeleton-card"></div>').join('');
  }

  svEnsureHomeRow = function(rowId){
    const main = document.getElementById('mainSection');
    const meta = SV_PERF_HOME_BY_ID[rowId];
    if(!main || !meta)return null;
    let row = document.getElementById(rowId);
    if(!row){
      row = document.createElement('div');
      row.className = 'row';
      row.id = rowId;
      row.style.display = 'none';
      row.innerHTML = `<div class="row-header"><div class="row-title"></div></div><div class="cards-track"></div>`;
    }
    row.dataset.sectionKey = meta.sectionKey;
    const header = row.querySelector('.row-header') || row.insertBefore(document.createElement('div'), row.firstChild);
    header.classList.add('row-header');
    let title = header.querySelector('.row-title');
    if(!title){
      title = document.createElement('div');
      title.className = 'row-title';
      header.prepend(title);
    }
    title.textContent = meta.title;
    title.setAttribute('role','button');
    title.tabIndex = 0;
    title.onclick = ()=>openHomeSection(rowId);
    title.onkeydown = e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openHomeSection(rowId); } };
    let explore = header.querySelector('.row-explore[data-perf-section]');
    if(!explore){
      explore = document.createElement('div');
      explore.className = 'row-explore';
      explore.dataset.perfSection = '1';
      explore.textContent = 'View All →';
      explore.onclick = ()=>openHomeSection(rowId);
      header.appendChild(explore);
    }
    let track = document.getElementById(meta.trackId) || row.querySelector('.cards-track');
    if(!track){
      track = document.createElement('div');
      row.appendChild(track);
    }
    track.className = 'cards-track';
    track.id = meta.trackId;
    return row;
  };

  svApplyHomeOrder = function(){
    const main = document.getElementById('mainSection');
    if(!main)return;
    const bottomIds = new Set(['trendingRow','seriesRow','newRow']);
    const liveRow = document.getElementById('liveHomeRow');
    if(liveRow)main.appendChild(liveRow);
    SV_PERF_HOME_MAIN.slice(0,3).forEach(meta=>{
      const row = svEnsureHomeRow(meta.rowId);
      if(row)main.appendChild(row);
    });
    SV_PERF_HOME_MAIN.slice(3).filter(meta=>!bottomIds.has(meta.rowId)).forEach(meta=>{
      const row = svEnsureHomeRow(meta.rowId);
      if(row)main.appendChild(row);
    });
    const continueRow = document.getElementById('continueRow');
    if(continueRow)main.appendChild(continueRow);
    ['becauseRow'].forEach(id=>{
      const row = document.getElementById(id);
      if(row)main.appendChild(row);
    });
    SV_PERF_HOME_MAIN.filter(meta=>bottomIds.has(meta.rowId)).forEach(meta=>{
      const row = svEnsureHomeRow(meta.rowId);
      if(row)main.appendChild(row);
    });
    Array.from(main.children).forEach(el=>{
      if(el.classList?.contains('row') && !SV_PERF_HOME_BY_ID[el.id] && !['continueRow','liveHomeRow','becauseRow'].includes(el.id)){
        el.style.display = 'none';
      }
    });
    hide('becauseRow');
    svEnhanceCarouselControls();
  };

  function svFetchHomeFeed(limit){
    const requestedLimit = limit || (svWeakDevice ? 12 : 24);
    if(svHomePayload && (svHomePayload._limit || 0) >= requestedLimit)return Promise.resolve(svHomePayload);
    if(svHomePayloadPromise)return svHomePayloadPromise;
    const readJson = r=>r.ok ? r.json() : Promise.reject(new Error('home feed failed'));
    svHomePayloadPromise = fetch('/home-feed.json?v=20260620-player-tracks-sections-final1', { cache:'force-cache' })
      .then(readJson)
      .catch(()=>fetch(`/api/home-feed?limit=${requestedLimit}`).then(readJson))
      .then(data=>{
        data._limit = requestedLimit;
        svHomePayload = data;
        return data;
      })
      .finally(()=>{ svHomePayloadPromise = null; });
    return svHomePayloadPromise;
  }
  const svHomeFeedPrime = svFetchHomeFeed(svWeakDevice ? 12 : 24).catch(()=>null);

  function svFetchHomeSection(meta, options={}){
    const limit = options.limit || (svWeakDevice ? 12 : 24);
    const summary = options.summary === false ? '0' : '1';
    return fetch(`/api/section/${encodeURIComponent(meta.sectionKey)}?page=0&limit=${limit}&summary=${summary}&v=20260620-player-tracks-sections-final1`)
      .then(r=>r.ok ? r.json() : Promise.reject(new Error(`section ${meta.sectionKey} failed`)))
      .then(data=>({ rowId:meta.rowId, items:Array.isArray(data?.items) ? data.items : [], _svFresh:options.summary === false }))
      .catch(err=>{
        console.warn('[Homepage] section unavailable:', meta.sectionKey, err.message);
        return { rowId:meta.rowId, items:[] };
      });
  }

  function svShouldRefillHomeRow(rowId, items, rowData){
    if(rowData?._svFresh)return false;
    if(!SV_PERF_HOME_BY_ID[rowId])return false;
    if(['trendingRow','seriesRow','newRow'].includes(rowId))return false;
    const count = Array.isArray(items) ? items.length : 0;
    return count > 0 && (count < SV_HOME_MIN_ROW_ITEMS || SV_DYNAMIC_BRAND_ROWS.has(rowId));
  }

  function svLoadHomeSections(){
    const immediateCount = 3;
    const immediate = SV_PERF_HOME_MAIN.slice(0, immediateCount);
    const delayed = SV_PERF_HOME_MAIN.slice(immediateCount);
    const prepareDelayedRows = rowMap=>{
      let index = 0;
      const prepareBatch = ()=>{
        const end = Math.min(delayed.length, index + (svWeakDevice ? 3 : 5));
        for(; index < end; index++){
          const meta = delayed[index];
          svPrepareHomeRow(meta.rowId, rowMap[meta.rowId] || null, false);
        }
        if(index < delayed.length)requestAnimationFrame(prepareBatch);
      };
      requestAnimationFrame(prepareBatch);
    };
    const renderRows = data=>{
      const feedRows = Array.isArray(data?.rows) ? data.rows : [];
      const rowMap = Object.fromEntries(feedRows.map(row=>[row.rowId,row]));
      svRenderHeroFromFeed(data);
      svApplyHomeOrder();
      immediate.forEach(meta=>svPrepareHomeRow(meta.rowId, rowMap[meta.rowId] || null, true));
      svRenderPersonalRows();
      if(typeof svPrefetchHomeFeedPosters === 'function')svPrefetchHomeFeedPosters(data);
      prepareDelayedRows(rowMap);
    };
    const renderSectionFallback = ()=>{
      svApplyHomeOrder();
      immediate.forEach(meta=>{
        svFetchHomeSection(meta).then(row=>svPrepareHomeRow(meta.rowId, row, true));
      });
      svRenderPersonalRows();
      prepareDelayedRows({});
    };
    return svFetchHomeFeed(svWeakDevice ? 8 : 12)
      .then(renderRows)
      .catch(err=>{
        console.warn('[Homepage] home-feed unavailable, using section APIs:', err.message);
        renderSectionFallback();
      });
  }

  function svObserveRow(row){
    if(!row || row._svObserved || row._svLoaded)return;
    if(!svHomeObserver){
      svHomeObserver = new IntersectionObserver(entries=>{
        entries.forEach(entry=>{
          if(entry.isIntersecting || entry.intersectionRatio > 0){
            svHomeObserver.unobserve(entry.target);
            entry.target._svObserved = false;
            const meta = SV_PERF_HOME_BY_ID[entry.target.id];
            if(entry.target._svNeedsFetch && meta){
              entry.target._svNeedsFetch = false;
              svFetchHomeSection(meta).then(row=>svPrepareHomeRow(row.rowId, row, true));
            }else{
              svMountHomeRow(entry.target.id);
            }
          }
        });
      }, { root:null, rootMargin:svWeakDevice ? '420px 0px 560px 0px' : '850px 0px 850px 0px', threshold:.01 });
    }
    row._svObserved = true;
    svHomeObserver.observe(row);
  }

  function svPrepareHomeRow(rowId, rowData, immediate){
    const meta = SV_PERF_HOME_BY_ID[rowId];
    const row = svEnsureHomeRow(rowId);
    if(!row || !meta)return;
    const items = Array.isArray(rowData?.items) ? rowData.items : [];
    const track = document.getElementById(meta.trackId);
    if(rowData && svShouldRefillHomeRow(rowId, items, rowData) && !row._svRefillStarted){
      row._svRefillStarted = true;
      svFetchHomeSection(meta, { summary:false, limit:svWeakDevice ? 24 : 50 }).then(fresh=>{
        if(!fresh?.items?.length || fresh.items.length <= items.length)return;
        row._svLoaded = false;
        track && (track.innerHTML = '');
        svPrepareHomeRow(rowId, fresh, true);
      }).catch(()=>{});
    }
    if(!rowData){
      row._svItems = [];
      row._svLoaded = false;
      row._svNeedsFetch = true;
      row.classList.add('sv-row-pending');
      row.classList.remove('sv-row-loaded');
      svSkeletonTrack(track);
      show(rowId);
      svObserveRow(row);
      return;
    }
    row._svNeedsFetch = false;
    if(!items.length){
      if(track?.querySelector('.card,.live-ch-card')){
        show(rowId);
        return;
      }
      hide(rowId);
      return;
    }
    if(track?.querySelector('.card,.live-ch-card')){
      row._svItems = items;
      row._svLoaded = true;
      row.classList.remove('sv-row-pending');
      row.classList.add('sv-row-loaded');
      svRenderLazyTrack(meta.trackId, rowId, items, svHomeRenderer, {
        limit:svWeakDevice ? 36 : 50,
        initial:svInitialCardCount(rowId),
        buffer:svWeakDevice ? (window.innerWidth < 760 ? 1 : 2) : (window.innerWidth < 760 ? 3 : 4),
        virtual:true
      });
      show(rowId);
      return;
    }
    row._svItems = items;
    row._svLoaded = false;
    row._svObserved = false;
    row.classList.add('sv-row-pending');
    row.classList.remove('sv-row-loaded');
    svSkeletonTrack(document.getElementById(meta.trackId));
    show(rowId);
    if(immediate) svMountHomeRow(rowId);
    else svObserveRow(row);
  }

  function svRenderPersonalRows(){
    const cont = (movies || []).filter(m=>!m.isTrending && watchProgress[m.id]?.progress > 0.02 && watchProgress[m.id]?.progress < 0.95);
    if(cont.length){
      svRenderLazyTrack('continueTrack','continueRow',cont,m=>cardHTML(m,true),{limit:30,initial:svInitialCardCount('continueRow'),buffer:3});
    }else{
      hide('continueRow');
    }
    hide('becauseRow');
  }

  window.svMountHomeRow = function(rowId){
    const meta = SV_PERF_HOME_BY_ID[rowId];
    const row = document.getElementById(rowId);
    if(!meta || !row || row._svLoaded)return;
    const items = row._svItems || [];
    if(!items.length){ hide(rowId); return; }
    svRenderLazyTrack(meta.trackId, rowId, items, svHomeRenderer, {
      limit:svWeakDevice ? 36 : 50,
      initial:svInitialCardCount(rowId),
      buffer:svWeakDevice ? (window.innerWidth < 760 ? 1 : 2) : (window.innerWidth < 760 ? 3 : 4),
      virtual:true
    });
    row._svLoaded = true;
    row.classList.remove('sv-row-pending');
    row.classList.add('sv-row-loaded');
  };

  function svCardPitch(track, rowId){
    const cs = getComputedStyle(track);
    const gap = parseFloat(cs.columnGap || cs.gap || '16') || 16;
    const first = track.querySelector('.card,.live-ch-card');
    let width = first ? first.getBoundingClientRect().width : 0;
    if(!width){
      if(track.classList.contains('live-home-track')) width = window.innerWidth < 760 ? 72 : 92;
      else width = Math.min(Math.max(window.innerWidth * .30, 118), 162);
    }
    return Math.max(64, width + gap);
  }

  function svRowItemKey(item){
    const type = item?.type || (item?.seasons ? 'series' : 'movie');
    return [
      type,
      item?.tmdbId,
      item?.id,
      item?.streamUrl,
      item?.name || item?.title || item?.file,
      item?.poster,
      item?.backdrop
    ].filter(Boolean).join('|').toLowerCase();
  }

  function svRowItemKeys(items){
    return (items || []).map(svRowItemKey);
  }

  function svSameKeys(a=[], b=[]){
    if(a.length !== b.length)return false;
    return a.every((key, i)=>key === b[i]);
  }

  function svTrackCards(track){
    return Array.from(track?.querySelectorAll?.('.card,.live-ch-card') || []);
  }

  function svTrackRenderedKeys(track, rendered){
    const saved = track._svRenderedKeys || [];
    if(saved.length >= rendered)return saved.slice(0, rendered);
    const itemKeys = track._svItemKeys || svRowItemKeys(track._svItems || []);
    return itemKeys.slice(0, rendered);
  }

  function svClearTrackSkeletons(track){
    track.querySelectorAll('.sv-skeleton-card').forEach(el=>el.remove());
  }

  function svAppendOnlyUpdate(track, force=false){
    if(!track || !track._svItems || !track._svRenderItem)return;
    const total = track._svItems.length;
    if(!total)return;
    const rendered = Math.max(track._svRendered || 0, svTrackCards(track).length);
    if(rendered >= total)return;
    const nearEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - Math.max(320, track.clientWidth * .55);
    if(!force && !nearEnd)return;
    const batch = track._svBatch || (svWeakDevice ? 4 : 6);
    const target = Math.min(total, rendered + (force ? (track._svInitial || batch) : batch));
    if(target <= rendered)return;
    const rowId = track._svRowId || track.closest('.row')?.id || '';
    const priorityRow = ['netflixRow','marvelRow','dcRow'].includes(rowId);
    const priorityCount = priorityRow ? (window.innerWidth < 760 || svWeakDevice ? 5 : 8) : 0;
    const html = track._svItems.slice(rendered, target).map((item,i)=>{
      const index = rendered + i;
      const immediateImage = index < priorityCount;
      const highPriorityImage = (rowId === 'newRow' && index < 6) || (rowId === 'recentlyAddedRow' && index < 6);
      const priorityItem = (immediateImage || highPriorityImage) ? {...item, _immediateImage:immediateImage, _priorityImage:highPriorityImage} : item;
      return track._svRenderItem(priorityItem, index);
    }).join('');
    if(rendered === 0)svClearTrackSkeletons(track);
    track.insertAdjacentHTML('beforeend', html);
    track._svRendered = target;
    const keys = track._svItemKeys || svRowItemKeys(track._svItems);
    const cards = svTrackCards(track);
    for(let i=rendered;i<target && i<cards.length;i++){
      cards[i].dataset.svKey = keys[i] || '';
    }
    track._svRenderedKeys = keys.slice(0, target);
    if(typeof svQueuePosterImages === 'function')svQueuePosterImages(track);
    const row = track.closest('.row');
    if(row)setTimeout(()=>svUpdateCarouselControls(row),20);
  }

  window.svRenderVirtualTrackElement = function(track, items, renderItem, opts={}){
    if(!track)return;
    const list = (items || []).slice(0, opts.limit || items.length || 0);
    const rowId = opts.rowId || track.closest('.row')?.id || '';
    const nextKeys = svRowItemKeys(list);
    const existingCards = svTrackCards(track);
    const prevItems = track._svItems || [];
    const prevKeys = track._svItemKeys || svRowItemKeys(prevItems);
    track._svItems = list;
    track._svRenderItem = renderItem;
    track._svInitial = opts.initial || (window.innerWidth < 760 ? 7 : 10);
    track._svBuffer = opts.buffer ?? (svWeakDevice ? 1 : (window.innerWidth < 760 ? 3 : 4));
    track._svBatch = opts.batch || (svWeakDevice ? 4 : (window.innerWidth < 760 ? 5 : 6));
    track._svRowId = rowId;
    track._svItemKeys = nextKeys;
    track.dataset.lazyAppend = '1';
    if(!track.dataset.lazyAppendBound){
      track.dataset.lazyAppendBound = '1';
      track.addEventListener('scroll', ()=>{
        if(track._svRaf)return;
        track._svRaf = requestAnimationFrame(()=>{
          track._svRaf = 0;
          svAppendOnlyUpdate(track);
        });
      }, { passive:true });
      if(!window._svAppendOnlyResizeBound){
        window._svAppendOnlyResizeBound = true;
        window.addEventListener('resize', ()=>{
          document.querySelectorAll('[data-lazy-append="1"]').forEach(t=>svAppendOnlyUpdate(t));
        }, { passive:true });
      }
    }
    if(existingCards.length){
      const rendered = Math.max(track._svRendered || 0, existingCards.length);
      const savedRenderedKeys = track._svRenderedKeys || [];
      const renderedKeys = savedRenderedKeys.length >= rendered ? savedRenderedKeys.slice(0, rendered) : (prevKeys.length ? prevKeys.slice(0, rendered) : nextKeys.slice(0, rendered));
      const currentKeys = prevKeys;
      if(svSameKeys(currentKeys, nextKeys) || svSameKeys(renderedKeys, nextKeys.slice(0, renderedKeys.length))){
        track._svRendered = rendered;
        track._svRenderedKeys = renderedKeys;
        return;
      }
      const renderedSet = new Set(renderedKeys.filter(Boolean));
      const existingItems = prevItems.length >= rendered ? prevItems.slice(0, rendered) : list.slice(0, rendered);
      const appendItems = [];
      const appendKeys = [];
      list.forEach((item, i)=>{
        const key = nextKeys[i];
        if(key && renderedSet.has(key))return;
        appendItems.push(item);
        appendKeys.push(key);
        if(key)renderedSet.add(key);
      });
      if(!appendItems.length){
        track._svRendered = rendered;
        track._svRenderedKeys = renderedKeys;
        return;
      }
      track._svItems = existingItems.concat(appendItems);
      track._svItemKeys = renderedKeys.concat(appendKeys);
      track._svRendered = rendered;
      track._svRenderedKeys = renderedKeys;
      svAppendOnlyUpdate(track, true);
      return;
    }
    track._svRendered = 0;
    track._svRenderedKeys = [];
    svAppendOnlyUpdate(track, true);
  };

  window.svAppendLazyTrack = function(track, count){
    if(!track || !track._svItems)return;
    const oldBatch = track._svBatch;
    if(count)track._svBatch = count;
    svAppendOnlyUpdate(track, true);
    track._svBatch = oldBatch;
  };

  svRenderLazyTrack = function(trackId, rowId, items, renderItem, opts={}){
    const track = document.getElementById(trackId);
    if(!track){ hide(rowId); return; }
    const limit = opts.limit || 50;
    const shouldClaim = !!(rowId && (SV_PERF_HOME_BY_ID[rowId] || ['continueRow','becauseRow'].includes(rowId)));
    const list = shouldClaim ? svClaimHomeItems(rowId, items || [], limit) : (items || []).slice(0, limit);
    if(!list.length){
      if(track.querySelector('.card,.live-ch-card')){
        show(rowId);
        return;
      }
      hide(rowId);
      return;
    }
    const nextKeys = svRowItemKeys(list);
    if(track.querySelector('.card,.live-ch-card') && svSameKeys(track._svItemKeys || [], nextKeys)){
      show(rowId);
      return;
    }
    svRenderVirtualTrackElement(track, list, renderItem, {
      ...opts,
      rowId,
      initial:opts.initial || svInitialCardCount(rowId)
    });
    show(rowId);
  };

  const SV_EXCLUSIVE_HERO_LIMIT = 72;
  const SV_EXCLUSIVE_HERO_ROWS = [
    'trendingRow',
    'netflixRow',
    'marvelRow',
    'dcRow',
    'disneyRow',
    'warnerRow',
    'universalRow',
    'hboRow',
    'appleTvRow',
    'highRatedRow'
  ];
  const SV_EXCLUSIVE_HERO_TITLE_SEEDS = [
    'dune','dune part two','oppenheimer','barbie','avatar','avatar the way of water','interstellar','inception','tenet','the batman','joker','the dark knight','man of steel','justice league','superman','wonder woman','aquaman','peacemaker','avengers','endgame','infinity war','iron man','captain america','thor','black panther','doctor strange','guardians of the galaxy','spider man','spider-man','deadpool','wolverine','logan','x men','fantastic four','stranger things','wednesday','squid game','money heist','dark','the witcher','extraction','the crown','bridgerton','narcos','lucifer','enola holmes','red notice','the last of us','house of the dragon','game of thrones','succession','true detective','chernobyl','the sopranos','the wire','band of brothers','euphoria','westworld','severance','silo','foundation','ted lasso','for all mankind','slow horses','the morning show','greyhound','coda','tetris','napoleon','killer of the flower moon','jurassic','jurassic world','fast and furious','fast & furious','oppenheimer','minions','despicable me','m3gan','get out','nope','harry potter','lord of the rings','the hobbit','the matrix','matrix','conjuring','godzilla','king kong','mad max','inside out','frozen','moana','zootopia','coco','toy story','the incredibles','pirates of the caribbean','star wars','the mandalorian','andor'
  ];

  function svExclusiveHeroClean(value){
    return String(value || '')
      .toLowerCase()
      .replace(/&/g,' and ')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\b(the|a|an)\b/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function svExclusiveHeroSourceBoost(rowId){
    const idx = SV_EXCLUSIVE_HERO_ROWS.indexOf(rowId);
    return idx < 0 ? 0 : (SV_EXCLUSIVE_HERO_ROWS.length - idx) * 1200;
  }

  function svExclusiveHeroScore(item){
    const title = svExclusiveHeroClean(item?.name || item?.title || item?.file || '');
    const text = svExclusiveHeroClean([
      item?.name,
      item?.title,
      item?.overview,
      item?.genre,
      item?.language,
      item?.category,
      item?.productionCompanies,
      item?._heroSourceRow
    ].flat().filter(Boolean).join(' '));
    let score = svExclusiveHeroSourceBoost(item?._heroSourceRow) - (item?._heroSourceIndex || 0);
    SV_EXCLUSIVE_HERO_TITLE_SEEDS.forEach((seed, idx)=>{
      const cleanSeed = svExclusiveHeroClean(seed);
      if(!cleanSeed)return;
      if(title === cleanSeed)score += 90000 - idx * 50;
      else if(title.includes(cleanSeed) || text.includes(cleanSeed))score += 48000 - idx * 25;
    });
    const rating = parseFloat(item?.rating || item?.vote_average || 0) || 0;
    if(rating >= 8)score += 2600;
    else if(rating >= 7)score += 1200;
    const year = parseInt(String(item?.year || '').match(/(?:19|20)\d{2}/)?.[0] || '0', 10) || 0;
    if(year >= 2024)score += 1800;
    else if(year >= 2020)score += 900;
    if(item?.poster)score += 450;
    if(item?.backdrop)score += 250;
    return score;
  }

  function svExclusiveHeroTitle(item){
    return svExclusiveHeroClean(item?.name || item?.title || item?.file || '');
  }

  function svExclusiveHeroTitleNoYear(item){
    return svExclusiveHeroTitle(item).replace(/\b(19|20)\d{2}\b/g,' ').replace(/\s+/g,' ').trim();
  }

  function svExclusiveHeroBlocked(item){
    const rawTitle = String(item?.name || item?.title || item?.file || '').trim();
    const cleanTitle = svExclusiveHeroTitle(item);
    return /^mary\s*\(?2024\)?$/i.test(rawTitle) || cleanTitle === 'mary 2024';
  }

  function svExclusiveHeroGroupKeys(item){
    const keys = [];
    const poster = svPosterKey(item?.poster);
    const backdrop = svPosterKey(item?.backdrop);
    const title = svExclusiveHeroTitleNoYear(item);
    if(poster)keys.push(`art:${poster}`);
    if(backdrop)keys.push(`art:${backdrop}`);
    if(item?.tmdbId)keys.push(`tmdb:${item?.type || (item?.seasons ? 'series' : 'movie')}:${item.tmdbId}`);
    if(title)keys.push(`title:${title}`);
    return keys;
  }

  function svExclusiveHeroDedup(items){
    const seen = new Set();
    return (items || [])
      .filter(item=>item && !svExclusiveHeroBlocked(item) && (item.poster || item.backdrop) && (item.name || item.title))
      .sort((a,b)=>svExclusiveHeroScore(b) - svExclusiveHeroScore(a))
      .filter(item=>{
        const keys = svExclusiveHeroGroupKeys(item);
        if(!keys.length)return false;
        if(keys.some(key=>seen.has(key)))return false;
        keys.forEach(key=>seen.add(key));
        return true;
      });
  }

  function svExclusiveHeroItemsFromFeed(data){
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const byRow = Object.fromEntries(rows.map(row=>[row.rowId,row]));
    const candidates = [];
    SV_EXCLUSIVE_HERO_ROWS.forEach(rowId=>{
      const rowItems = byRow[rowId]?.items || [];
      rowItems.forEach((item, index)=>{
        candidates.push({ ...item, _heroSourceRow:rowId, _heroSourceIndex:index });
      });
    });
    return svExclusiveHeroDedup(candidates).slice(0, SV_EXCLUSIVE_HERO_LIMIT);
  }

  function svHeroItemsFromFeed(data){
    const exclusive = svExclusiveHeroItemsFromFeed(data);
    if(exclusive.length >= 50)return exclusive;
    const fallbackRows = Array.isArray(data?.rows) ? data.rows : [];
    const fallback = fallbackRows.flatMap(row=>(row.items || []).map((item,index)=>({ ...item, _heroSourceRow:row.rowId, _heroSourceIndex:index })));
    return svExclusiveHeroDedup([...exclusive, ...fallback]).slice(0, SV_EXCLUSIVE_HERO_LIMIT);
  }

  function svFallbackHeroItems(){
    const movieItems = (movies || [])
      .filter(m => m && (m.poster || m.backdrop))
      .map(m => ({...m, _isSeries:false, _heroSourceRow:'fallback'}));
    const seriesItems = (series || [])
      .filter(s => s && (s.poster || s.backdrop))
      .map((s,i) => ({...s, _isSeries:true, _heroSourceRow:'fallback', _heroSourceIndex:i}));
    return svExclusiveHeroDedup([...movieItems, ...seriesItems]).slice(0, SV_EXCLUSIVE_HERO_LIMIT);
  }

  var svFifaLiveState = {
    started:false,
    loading:false,
    timer:null,
    countdownTimer:null,
    countdownMatch:null,
    countdownMatchKey:'',
    controller:null,
    payload:null,
    matchesByKey:new Map(),
    detailController:null,
    detailMatch:null,
    detailPayload:null,
    detailTab:'overview',
    detailBound:false,
    featuredDetailController:null,
    featuredDetailKey:'',
    featuredDetailPayload:null,
    newsLoading:false,
    newsController:null,
    newsPayload:null,
    newsFetchedAt:0,
    newsTimer:null,
    detailScrollY:0,
    renderSignature:'',
    postRenderTimer:null,
    earlyPromiseUsed:false
  };

  const SV_FIFA_LOCAL_CACHE_KEY = 'streamvault:fifa-live:last-real:v1';
  const SV_FIFA_NEWS_CLIENT_TTL = 5 * 60 * 1000;
  const SV_FIFA_PAST_MATCH_LIMIT = 6;
  const SV_FIFA_FORWARD_MATCH_LIMIT = 12;
  const SV_LIVE_MATCH_CHANNEL_ID = 'tsports';
  let svLiveMatchChannelsPromise = null;

  function svFifaEsc(value){
    if(typeof esc === 'function')return esc(value);
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function svFifaClientFallbackPayload(message){
    const now = Date.now();
    return {
      ok:false,
      generatedAt:new Date(now).toISOString(),
      source:'none',
      stale:false,
      competition:'FIFA / Football Live',
      message:message || 'Real live football data is unavailable right now',
      liveMatches:[],
      upcomingMatches:[],
      recentResults:[],
      standings:[],
      headlines:[],
      capabilities:{
        liveScores:false,
        matchStats:false,
        lineups:false,
        formations:false,
        events:false,
        standings:false,
        headlines:false,
        teamFlags:false
      },
      provider:{
        active:'none',
        apiFootballConfigured:false,
        limited:false,
        fallback:false
      }
    };
  }

  function svFifaPayloadHasRealData(payload){
    return !!payload && [
      payload.liveMatches,
      payload.upcomingMatches,
      payload.recentResults,
      payload.standings,
      payload.headlines
    ].some(items=>Array.isArray(items) && items.length);
  }

  function svSetMobileLiveMatchState(live){
    const isLive = !!live;
    document.documentElement.classList.toggle('sv-fifa-match-live', isLive);
    const btn = document.getElementById('bnLiveMatch');
    if(btn){
      btn.classList.toggle('is-live', isLive);
      btn.dataset.fifaLive = isLive ? '1' : '0';
    }
  }

  function svFifaUniqueMatches(list, limit, seen){
    const out = [];
    const used = seen || new Set();
    (Array.isArray(list) ? list : []).some(match=>{
      const key = svFifaMatchKey(match) || [
        match?.homeTeam || match?.home?.name || '',
        match?.awayTeam || match?.away?.name || '',
        match?.startTime || match?.kickoff || ''
      ].join(':');
      if(!key || used.has(key))return false;
      used.add(key);
      out.push(match);
      return limit && out.length >= limit;
    });
    return out;
  }

  function svFifaCarouselMatches(payload){
    const seen = new Set();
    const liveMatches = Array.isArray(payload?.liveMatches) ? payload.liveMatches : [];
    const upcomingMatches = Array.isArray(payload?.upcomingMatches) ? payload.upcomingMatches : [];
    const recentResults = Array.isArray(payload?.recentResults) ? payload.recentResults : [];
    const forward = svFifaUniqueMatches([...liveMatches, ...upcomingMatches], SV_FIFA_FORWARD_MATCH_LIMIT, seen);
    const past = svFifaUniqueMatches(recentResults, SV_FIFA_PAST_MATCH_LIMIT, seen).reverse();
    if(forward.length){
      return { matches:[...past, ...forward], startIndex:past.length, pastCount:past.length, forwardCount:forward.length };
    }
    const fallback = svFifaUniqueMatches(recentResults, SV_FIFA_PAST_MATCH_LIMIT, new Set());
    return { matches:fallback, startIndex:0, pastCount:fallback.length, forwardCount:0 };
  }

  function svFifaPayloadSignature(payload){
    if(!payload)return '';
    const carousel = svFifaCarouselMatches(payload);
    const matches = carousel.matches.map(match=>[
      match?.id || '',
      match?.homeScore ?? '',
      match?.awayScore ?? '',
      match?.status || '',
      match?.startTime || match?.kickoff || ''
    ].join(':'));
    return [
      payload.generatedAt || '',
      payload.source || '',
      !!payload.stale,
      matches.join('|')
    ].join('::');
  }

  function svFifaReadEarlyPayload(){
    try{
      const payload = window.__svFifaEarlyPayload || window.__svFifaFastPayload || window.__svFifaCachedPayload || null;
      if(!svFifaPayloadHasRealData(payload))return null;
      if(payload === window.__svFifaCachedPayload && !payload.stale){
        return {
          ...payload,
          stale:true,
          message:payload.message || 'Showing cached real football data while the live feed refreshes'
        };
      }
      return payload;
    }catch(_err){
      return null;
    }
  }

  function svFifaTakeEarlyPromise(){
    const early = window.__svFifaLiveEarlyPromise;
    if(!early || svFifaLiveState.earlyPromiseUsed)return null;
    svFifaLiveState.earlyPromiseUsed = true;
    return Promise.resolve(early).then(payload=>{
      if(!svFifaPayloadHasRealData(payload))throw new Error('Early FIFA payload was empty');
      return payload;
    });
  }

  function svFifaReadCachedPayload(){
    try{
      const raw = localStorage.getItem(SV_FIFA_LOCAL_CACHE_KEY);
      if(!raw)return null;
      const payload = JSON.parse(raw);
      if(!svFifaPayloadHasRealData(payload))return null;
      return {
        ...payload,
        stale:true,
        message:payload.message || 'Showing cached real football data while the live feed refreshes'
      };
    }catch(_err){
      return null;
    }
  }

  function svFifaWriteCachedPayload(payload){
    try{
      if(!payload || !svFifaPayloadHasRealData(payload))return;
      localStorage.setItem(SV_FIFA_LOCAL_CACHE_KEY, JSON.stringify(payload));
    }catch(_err){}
  }

  function svFifaCleanText(value){
    const text = String(value ?? '').trim();
    return text && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined' ? text : '';
  }

  function svFifaTeamName(team){
    if(typeof team === 'string')return svFifaCleanText(team);
    return svFifaCleanText(team?.team || team?.name || team?.displayName || team?.homeTeam || team?.awayTeam);
  }

  const SV_FIFA_COUNTRY_CODES = {
    algeria:'DZ',
    argentina:'AR',
    australia:'AU',
    austria:'AT',
    belgium:'BE',
    'bosnia herzegovina':'BA',
    bosnia:'BA',
    brazil:'BR',
    canada:'CA',
    colombia:'CO',
    croatia:'HR',
    curacao:'CW',
    'curaçao':'CW',
    czechia:'CZ',
    'czech republic':'CZ',
    denmark:'DK',
    ecuador:'EC',
    egypt:'EG',
    england:'GB-ENG',
    france:'FR',
    germany:'DE',
    ghana:'GH',
    haiti:'HT',
    iraq:'IQ',
    iran:'IR',
    italy:'IT',
    'ivory coast':'CI',
    'cote d ivoire':'CI',
    japan:'JP',
    jordan:'JO',
    mexico:'MX',
    morocco:'MA',
    netherlands:'NL',
    'new zealand':'NZ',
    norway:'NO',
    panama:'PA',
    paraguay:'PY',
    portugal:'PT',
    qatar:'QA',
    'saudi arabia':'SA',
    scotland:'GB-SCT',
    senegal:'SN',
    'south africa':'ZA',
    'south korea':'KR',
    spain:'ES',
    sweden:'SE',
    switzerland:'CH',
    tunisia:'TN',
    turkiye:'TR',
    turkey:'TR',
    'united states':'US',
    usa:'US',
    uruguay:'UY',
    'cape verde':'CV',
    wales:'GB-WLS',
    uzbekistan:'UZ'
  };

  const SV_FIFA_THREE_LETTER_CODES = {
    ARG:'AR',
    AUS:'AU',
    BEL:'BE',
    BRA:'BR',
    CAN:'CA',
    COL:'CO',
    CIV:'CI',
    CUW:'CW',
    CZE:'CZ',
    DEN:'DK',
    ECU:'EC',
    ENG:'GB-ENG',
    FRA:'FR',
    GER:'DE',
    GHA:'GH',
    ITA:'IT',
    JPN:'JP',
    KOR:'KR',
    MAR:'MA',
    MEX:'MX',
    NED:'NL',
    NOR:'NO',
    POR:'PT',
    QAT:'QA',
    RSA:'ZA',
    SCO:'GB-SCT',
    SEN:'SN',
    ESP:'ES',
    SWE:'SE',
    SUI:'CH',
    TUR:'TR',
    USA:'US',
    UZB:'UZ',
    WAL:'GB-WLS'
  };

  const SV_FIFA_SUBDIVISION_FLAGS = {
    'GB-ENG':String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0065,0xe006e,0xe0067,0xe007f),
    'GB-SCT':String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0073,0xe0063,0xe0074,0xe007f),
    'GB-WLS':String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0077,0xe006c,0xe0073,0xe007f)
  };

  function svFifaTeamKey(value){
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/&/g,' and ')
      .replace(/\b(?:u|under)[-\s]?\d+\b/g,'')
      .replace(/\b(?:women|men|olympic|national team|football team|soccer team)\b/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function svFifaCountryCodeFromName(name){
    const key = svFifaTeamKey(name);
    return SV_FIFA_COUNTRY_CODES[key] || SV_FIFA_COUNTRY_CODES[key.replace(/\s+/g,'')] || '';
  }

  function svFifaFlagEmojiFromCode(code){
    const clean = String(code || '').trim().toUpperCase();
    const two = SV_FIFA_THREE_LETTER_CODES[clean] || clean;
    if(!two)return '';
    if(SV_FIFA_SUBDIVISION_FLAGS[two])return SV_FIFA_SUBDIVISION_FLAGS[two];
    if(!/^[A-Z]{2}$/.test(two))return '';
    return two.split('').map(ch=>String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join('');
  }

  function svFifaHttpUrl(value){
    const text = svFifaCleanText(value);
    return /^https?:\/\//i.test(text) ? text : '';
  }

  function svFifaLooksLikeFlagEmoji(value){
    const text = svFifaCleanText(value);
    if(!text)return false;
    if(text.includes(String.fromCodePoint(0x1f3f4)))return true;
    const points = Array.from(text);
    return points.length >= 2 && points.slice(0,2).every(ch=>{
      const code = ch.codePointAt(0);
      return code >= 0x1f1e6 && code <= 0x1f1ff;
    });
  }

  function svFifaFlagEmojiFromText(rawFlag, countryCode, mappedCode){
    const raw = svFifaCleanText(rawFlag);
    if(raw && !svFifaHttpUrl(raw)){
      const codeFlag = svFifaFlagEmojiFromCode(raw);
      if(codeFlag)return codeFlag;
      if(svFifaLooksLikeFlagEmoji(raw))return raw;
    }
    return svFifaFlagEmojiFromCode(countryCode) || svFifaFlagEmojiFromCode(mappedCode);
  }

  function svFifaTeamIdentity(source, side){
    const prefix = side ? `${side}` : '';
    const name = side
      ? svFifaCleanText(source?.[`${prefix}Team`] || source?.team || source?.name)
      : svFifaTeamName(source);
    const rawCode = svFifaCleanText(source?.countryCode || source?.teamCountryCode || source?.code || source?.abbreviation || (side ? source?.[`${prefix}CountryCode`] : ''));
    const mappedCode = svFifaCountryCodeFromName(name);
    const countryCode = rawCode || mappedCode;
    const rawLogo = svFifaCleanText((side ? source?.[`${prefix}Logo`] : '') || source?.logo || source?.teamLogo);
    const rawFlag = svFifaCleanText(source?.flag || source?.teamFlag || (side ? source?.[`${prefix}Flag`] : ''));
    const flagUrl = svFifaHttpUrl(rawFlag);
    const flag = flagUrl ? '' : svFifaFlagEmojiFromText(rawFlag, countryCode, mappedCode);
    const logo = flagUrl || flag ? '' : svFifaHttpUrl(rawLogo);
    return {
      name,
      logo,
      flagUrl,
      flag,
      countryCode
    };
  }

  function svFifaFlagHtml(source, side, eager){
    const info = svFifaTeamIdentity(source, side);
    const logo = svFifaHttpUrl(info.logo);
    const flagUrl = logo ? '' : svFifaHttpUrl(info.flagUrl);
    const imageUrl = logo || flagUrl;
    const attrs = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    if(imageUrl){
      const kind = logo ? 'logo' : 'flag';
      return `<img class="fifa-team-flag" data-fifa-flag="1" data-fifa-identity="${kind}" src="${svFifaEsc(imageUrl)}" alt="" width="22" height="22" decoding="async" ${attrs} onerror="this.onerror=null;this.classList.add('fifa-team-flag-blank');this.removeAttribute('src')">`;
    }
    if(info.flag){
      return `<span class="fifa-team-flag emoji" data-fifa-flag="1" aria-hidden="true">${svFifaEsc(info.flag)}</span>`;
    }
    return '<span class="fifa-team-flag fifa-team-flag-blank" data-fifa-flag="0" aria-hidden="true"></span>';
  }

  function svFifaTeamHtml(source, side, fallback, eager){
    const info = svFifaTeamIdentity(source, side);
    const name = info.name || fallback || 'Team';
    return `<span class="fifa-team-name">${svFifaFlagHtml(source, side, eager)}<span>${svFifaEsc(name)}</span></span>`;
  }

  function svFifaDetailValue(value){
    const text = svFifaCleanText(value);
    return text ? svFifaEsc(text) : '';
  }

  function svFifaRealDetailMessage(payload, fallback){
    if(payload?.provider?.limited || (payload?.source === 'espn' && payload?.capabilities?.apiFootballConfigured === false)){
      return 'Lineups and formations are not available from the current provider for this match.';
    }
    return fallback || 'This detail is unavailable from the current provider for this fixture.';
  }

  function svFifaProviderLimitMessage(payload){
    const limitations = Array.isArray(payload?.providerLimitations) ? payload.providerLimitations.filter(Boolean) : [];
    return limitations[0] || svFifaRealDetailMessage(payload, '');
  }

  function svFifaValueSource(payload, item){
    const raw = svFifaCleanText(item?.source);
    if(raw === 'cache' || payload?.stale || payload?.source === 'cache')return 'cache';
    if(raw === 'missing')return 'missing';
    return 'provider';
  }

  function svFifaProviderStatLabel(label){
    const labels = {
      shots:'Shots',
      totalshots:'Shots',
      shotsongoal:'Shots on target',
      shotsontarget:'Shots on target',
      sog:'Shots on target',
      possession:'Possession',
      ballpossession:'Possession',
      possessionpct:'Possession',
      passes:'Passes',
      totalpasses:'Passes',
      passaccuracy:'Pass Accuracy',
      passcompletion:'Pass Accuracy',
      accuratepasses:'Pass Accuracy',
      fouls:'Fouls',
      foulscommitted:'Fouls',
      yellowcards:'Yellow Cards',
      redcards:'Red Cards',
      offsides:'Offsides',
      corners:'Corners',
      cornerkicks:'Corners',
      woncorners:'Corners',
      saves:'Saves',
      goalkeepersaves:'Saves',
      expectedgoals:'Expected Goals',
      xg:'Expected Goals'
    };
    return labels[svFifaStatKey(label)] || '';
  }

  function svFifaProviderStatRows(rows, payload){
    return svFifaOrderedStats(rows).map(row=>{
      const label = svFifaProviderStatLabel(row?.label);
      if(!label)return null;
      return { ...row, label, source:svFifaValueSource(payload, row) };
    }).filter(row=>row && (svFifaCleanText(row.home) || svFifaCleanText(row.away)));
  }

  function svFifaHasStatRows(payload){
    return svFifaProviderStatRows(payload?.statistics, payload).length > 0;
  }

  function svFifaHasPlayerRows(lineup){
    return !!(
      (Array.isArray(lineup?.players) && lineup.players.some(player=>svFifaCleanText(player?.name))) ||
      (Array.isArray(lineup?.substitutes) && lineup.substitutes.some(player=>svFifaCleanText(player?.name)))
    );
  }

  function svFifaHasLineupRows(payload){
    const lineups = payload?.lineups || {};
    return svFifaHasPlayerRows(lineups.home) || svFifaHasPlayerRows(lineups.away);
  }

  function svFifaHasFormationRows(payload){
    const lineups = payload?.lineups || {};
    return !!(svFifaCleanText(lineups.home?.formation) || svFifaCleanText(lineups.away?.formation));
  }

  function svFifaHasEventRows(payload){
    return Array.isArray(payload?.events) && payload.events.some(event=>svFifaCleanText(event?.type) || svFifaCleanText(event?.player) || svFifaCleanText(event?.team) || svFifaCleanText(event?.detail));
  }

  function svFifaStandingHasValues(row){
    return ['played','wins','draws','losses','goalDifference','points'].some(key=>svFifaCleanText(row?.[key]) !== '');
  }

  function svFifaHasStandingRows(payload){
    return Array.isArray(payload?.standings) && payload.standings.some(row=>svFifaCleanText(row?.team) && svFifaStandingHasValues(row));
  }

  function svFifaDetailCapabilities(payload){
    const caps = payload?.capabilities || {};
    return {
      matchStats:!!caps.matchStats && svFifaHasStatRows(payload),
      lineups:!!caps.lineups && svFifaHasLineupRows(payload),
      formations:!!caps.formations && svFifaHasFormationRows(payload),
      events:!!caps.events && svFifaHasEventRows(payload),
      standings:!!caps.standings && svFifaHasStandingRows(payload)
    };
  }

  function svFifaMatchProvider(match){
    const provider = String(match?.provider || svFifaLiveState.payload?.source || '').toLowerCase();
    if(provider === 'api-football' || provider === 'espn')return provider;
    if(provider.includes('api'))return 'api-football';
    return 'espn';
  }

  function svFifaMatchKey(match){
    if(!match?.id)return '';
    return [svFifaMatchProvider(match), match.id, match.leagueSlug || ''].filter(Boolean).join(':');
  }

  function svFifaBuildDetailUrl(match){
    const provider = encodeURIComponent(svFifaMatchProvider(match));
    const id = encodeURIComponent(String(match?.id || ''));
    const params = new URLSearchParams();
    if(match?.leagueSlug)params.set('league', match.leagueSlug);
    return `/api/fifa-live/match/${provider}/${id}${params.toString() ? `?${params}` : ''}`;
  }

  function svLockFifaPageScroll(){
    if(document.body.dataset.svFifaDetailModal === '1')return;
    const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    svFifaLiveState.detailScrollY = y;
    document.documentElement.classList.add('modal-open','fifa-detail-lock','fifa-modal-open');
    document.body.classList.add('modal-open','fifa-detail-lock','fifa-modal-open');
    document.body.dataset.svFifaDetailModal = '1';
    document.body.style.setProperty('--sv-fifa-scroll-y', `${y}px`);
    document.body.style.top = `-${y}px`;
  }

  function svUnlockFifaPageScroll(){
    if(document.body.dataset.svFifaDetailModal !== '1')return;
    const y = svFifaLiveState.detailScrollY || 0;
    delete document.body.dataset.svFifaDetailModal;
    document.documentElement.classList.remove('modal-open','fifa-detail-lock','fifa-modal-open');
    document.body.classList.remove('modal-open','fifa-detail-lock','fifa-modal-open');
    document.body.style.removeProperty('--sv-fifa-scroll-y');
    document.body.style.top = '';
    svFifaLiveState.detailScrollY = 0;
    requestAnimationFrame(()=>window.scrollTo({ top:y, left:0, behavior:'auto' }));
  }

  function svEnsureFifaDetailModal(){
    let modal = document.getElementById('fifaDetailModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'fifaDetailModal';
      modal.className = 'fifa-detail-modal';
      modal.setAttribute('aria-hidden','true');
      modal.innerHTML = `
        <div class="fifa-detail-backdrop" data-fifa-detail-close></div>
        <section class="fifa-detail-panel" role="dialog" aria-modal="true" aria-labelledby="fifaDetailTitle">
          <div class="fifa-detail-content" id="fifaDetailContent"></div>
        </section>
      `;
      document.body.appendChild(modal);
    }
    if(!svFifaLiveState.detailBound){
      modal.addEventListener('click', svHandleFifaDetailClick);
      svFifaLiveState.detailBound = true;
    }
    return modal;
  }

  function svHandleFifaDetailClick(event){
    if(event.target.closest('[data-fifa-detail-close]')){
      svCloseFifaDetailModal();
      return;
    }
    const tab = event.target.closest('[data-fifa-detail-tab]');
    if(tab){
      svFifaLiveState.detailTab = tab.dataset.fifaDetailTab || 'overview';
      svRenderFifaDetailContent();
    }
  }

  function svHandleFifaDetailKeydown(event){
    if(event.key === 'Escape')svCloseFifaDetailModal();
  }

  function svCloseFifaDetailModal(){
    const modal = document.getElementById('fifaDetailModal');
    if(svFifaLiveState.detailController){
      svFifaLiveState.detailController.abort();
      svFifaLiveState.detailController = null;
    }
    document.removeEventListener('keydown', svHandleFifaDetailKeydown);
    if(modal){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
    }
    svUnlockFifaPageScroll();
    const opener = svFifaLiveState.detailOpener;
    svFifaLiveState.detailOpener = null;
    if(opener && typeof opener.focus === 'function'){
      requestAnimationFrame(()=>opener.focus({ preventScroll:true }));
    }
  }

  function svOpenFifaMatchDetail(match, opener){
    if(!match?.id)return;
    const modal = svEnsureFifaDetailModal();
    const prefetched = svFifaFeaturedDetailFor(match);
    svFifaLiveState.detailMatch = match;
    svFifaLiveState.detailPayload = prefetched || null;
    svFifaLiveState.detailTab = prefetched ? svFifaDefaultDetailTab(prefetched) : 'overview';
    svFifaLiveState.detailOpener = opener || null;
    svRenderFifaDetailContent(!prefetched);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    svLockFifaPageScroll();
    document.addEventListener('keydown', svHandleFifaDetailKeydown);
    requestAnimationFrame(()=>{
      modal.querySelector('.fifa-detail-content')?.scrollTo({ top:0, behavior:'auto' });
      modal.querySelector('[data-fifa-detail-close]')?.focus?.({ preventScroll:true });
    });
    svFetchFifaMatchDetail(match);
  }

  function svFetchFifaMatchDetail(match){
    if(svFifaLiveState.detailController)svFifaLiveState.detailController.abort();
    svFifaLiveState.detailController = new AbortController();
    fetch(svFifaBuildDetailUrl(match), {
      cache:'no-store',
      headers:{ Accept:'application/json' },
      signal:svFifaLiveState.detailController.signal
    })
      .then(response=>response.ok ? response.json() : Promise.reject(new Error('Match details failed')))
      .then(data=>{
        svFifaLiveState.detailPayload = data;
        if(svFifaLiveState.detailTab === 'overview')svFifaLiveState.detailTab = svFifaDefaultDetailTab(data);
        svRenderFifaDetailContent(false);
      })
      .catch(err=>{
        if(err?.name === 'AbortError')return;
        svFifaLiveState.detailPayload = {
          ok:false,
          message:'Detailed match data is unavailable for this fixture right now.',
          match:svFifaLiveState.detailMatch,
          overview:{},
          statistics:[],
          lineups:{ home:{}, away:{} },
          events:[],
          standings:[],
          capabilities:{
            liveScores:false,
            matchStats:false,
            lineups:false,
            formations:false,
            events:false,
            standings:false,
            teamFlags:false
          },
          provider:{
            active:'none',
            apiFootballConfigured:false,
            limited:false,
            fallback:false
          }
        };
        svRenderFifaDetailContent(false);
      });
  }

  function svFifaDetailTabList(payload, loading){
    if(loading || !payload)return [['overview','Overview']];
    const tabs = [['overview','Overview']];
    const caps = svFifaDetailCapabilities(payload);
    if(caps.matchStats)tabs.push(['stats','Stats']);
    if(caps.events)tabs.push(['events','Timeline']);
    if(caps.lineups)tabs.push(['lineups','Lineups']);
    if(caps.standings)tabs.push(['table','Table']);
    return tabs;
  }

  function svFifaDefaultDetailTab(payload){
    const tabs = svFifaDetailTabList(payload, false);
    return tabs[0]?.[0] || 'overview';
  }

  function svFifaDetailMetaChips(match, payload){
    const overview = payload?.overview || {};
    const chips = [
      match.competition,
      match.stage || match.group || overview.round,
      match.venue,
      match.startTime ? svFifaFormatTime(match.startTime) : ''
    ].map(svFifaCleanText).filter(Boolean);
    if(!chips.length)return '';
    return `<div class="fifa-detail-context">${chips.map(chip=>`<span>${svFifaEsc(chip)}</span>`).join('')}</div>`;
  }

  function svRenderFifaDetailScoreNotes(payload){
    const events = Array.isArray(payload?.events)
      ? payload.events.filter(event=>svFifaCleanText(event?.type) || svFifaCleanText(event?.player) || svFifaCleanText(event?.team) || svFifaCleanText(event?.detail))
      : [];
    if(!events.length)return '';
    const goals = events.filter(event=>/goal/i.test(`${event.type || ''} ${event.detail || ''}`));
    const picked = (goals.length ? goals : events).slice(0,4);
    return `<div class="fifa-detail-scorers" aria-label="Match events under score">${picked.map(event=>{
      const text = [event.minute, event.player || event.team, event.type || event.detail].filter(Boolean).join(' - ');
      return `<span>${svFifaFlagHtml(event, '', false)}${svFifaEsc(text || event.detail || 'Match event')}</span>`;
    }).join('')}</div>`;
  }

  function svFifaOrderedStats(rows){
    const list = Array.isArray(rows) ? rows.filter(row=>svFifaCleanText(row?.label) && (svFifaCleanText(row?.home) || svFifaCleanText(row?.away))) : [];
    const order = [
      /^(total)?shots$/i,
      /shots on target|shotsongoal/i,
      /possession/i,
      /^passes$|total passes/i,
      /pass accuracy|pass completion|accurate passes/i,
      /^fouls$|fouls committed/i,
      /yellow cards/i,
      /red cards/i,
      /offsides/i,
      /corners|corner kicks/i
    ];
    const picked = [];
    order.forEach(rx=>{
      const row = list.find(item=>rx.test(svFifaCleanText(item?.label)) && !picked.includes(item));
      if(row)picked.push(row);
    });
    list.forEach(row=>{
      if(!picked.includes(row))picked.push(row);
    });
    return picked;
  }

  function svFifaScoresAreReal(match){
    return (match?.homeScore === 0 || match?.homeScore) && (match?.awayScore === 0 || match?.awayScore);
  }

  function svFifaScoreTotal(match){
    if(!svFifaScoresAreReal(match))return '';
    return Number(match.homeScore) + Number(match.awayScore);
  }

  function svFifaGoalDifference(match){
    if(!svFifaScoresAreReal(match))return '';
    const diff = Math.abs(Number(match.homeScore) - Number(match.awayScore));
    return diff === 0 ? 'Level' : String(diff);
  }

  function svFifaStatusInfo(match){
    if(!match)return '';
    const state = svFifaMatchStatus(match);
    const time = svFifaMatchTime(match);
    return [state.label, time && time !== state.label ? time : ''].filter(Boolean).join(' / ');
  }

  function svFifaInfoItemLimit(items){
    return Math.min(5, items.length);
  }

  function svFifaDetailTabs(payload, loading){
    const tabs = svFifaDetailTabList(payload, loading);
    return tabs.map(([key,label])=>`<button class="fifa-detail-tab${svFifaLiveState.detailTab === key ? ' active' : ''}" type="button" data-fifa-detail-tab="${key}">${label}</button>`).join('');
  }

  function svFifaMergeDetailMatch(fallback, detailMatch){
    const detail = detailMatch || {};
    const base = fallback || {};
    return {
      ...base,
      ...detail,
      homeTeam:detail.homeTeam || base.homeTeam,
      awayTeam:detail.awayTeam || base.awayTeam,
      homeScore:detail.homeScore === 0 || detail.homeScore ? detail.homeScore : base.homeScore,
      awayScore:detail.awayScore === 0 || detail.awayScore ? detail.awayScore : base.awayScore,
      competition:detail.competition || base.competition,
      stage:detail.stage || base.stage,
      group:detail.group || base.group,
      venue:detail.venue || base.venue,
      startTime:detail.startTime || base.startTime,
      kickoff:detail.kickoff || base.kickoff,
      provider:base.provider || detail.provider,
      leagueSlug:base.leagueSlug || detail.leagueSlug,
      homeFlag:detail.homeFlag || base.homeFlag,
      homeLogo:detail.homeLogo || base.homeLogo,
      homeCountryCode:detail.homeCountryCode || base.homeCountryCode,
      awayFlag:detail.awayFlag || base.awayFlag,
      awayLogo:detail.awayLogo || base.awayLogo,
      awayCountryCode:detail.awayCountryCode || base.awayCountryCode
    };
  }

  function svFifaDetailMatch(){
    return svFifaMergeDetailMatch(svFifaLiveState.detailMatch || {}, svFifaLiveState.detailPayload?.match || {});
  }

  function svRenderFifaDetailContent(loading){
    const modal = svEnsureFifaDetailModal();
    const content = modal.querySelector('#fifaDetailContent');
    if(!content)return;
    const payload = svFifaLiveState.detailPayload;
    const match = svFifaDetailMatch();
    const tabs = svFifaDetailTabList(payload, loading);
    if(!tabs.some(([key])=>key === svFifaLiveState.detailTab))svFifaLiveState.detailTab = tabs[0]?.[0] || 'overview';
    const status = svFifaMatchStatus(match);
    const sourceName = payload?.provider?.active || payload?.source || '';
    const source = sourceName ? `Source: ${sourceName}${payload?.stale ? ' (stale)' : ''}` : 'Loading real details';
    const providerLimited = !loading && payload?.provider?.limited && (!payload?.capabilities?.lineups || !payload?.capabilities?.formations);
    const messageText = !loading && !providerLimited ? (payload?.message || '') : '';
    const message = messageText ? `<div class="fifa-detail-notice">${svFifaEsc(messageText)}</div>` : '';
    const tabsHtml = tabs.length > 1
      ? `<nav class="fifa-detail-tabs" aria-label="Match detail sections">${svFifaDetailTabs(payload, loading)}</nav>`
      : '';
    content.innerHTML = `
      <header class="fifa-detail-header">
        <div class="fifa-detail-meta-row">
          <div class="fifa-card-label ${status.className}">${status.className === 'is-live' ? '<span class="fifa-live-dot"></span>' : ''}${svFifaEsc(status.label)}<span>${svFifaEsc(svFifaMatchTime(match))}</span></div>
          <div class="fifa-detail-source">${svFifaEsc(source)}</div>
          <button class="fifa-detail-close" type="button" data-fifa-detail-close aria-label="Close match details"><span aria-hidden="true">&times;</span></button>
        </div>
        <div class="fifa-detail-scoreboard" id="fifaDetailTitle">
          <div class="fifa-detail-team fifa-detail-team-home">
            ${svFifaTeamHtml(match, 'home', 'Home', true)}
          </div>
          <div class="fifa-detail-score" aria-label="Score">
            <span>${svFifaEsc(svFifaScore(match.homeScore))}</span>
            <b>-</b>
            <span>${svFifaEsc(svFifaScore(match.awayScore))}</span>
          </div>
          <div class="fifa-detail-team fifa-detail-team-away">
            ${svFifaTeamHtml(match, 'away', 'Away', true)}
          </div>
        </div>
        ${svRenderFifaDetailScoreNotes(payload)}
        ${svFifaDetailMetaChips(match, payload)}
      </header>
      ${tabsHtml}
      ${message}
      <div class="fifa-detail-body">
        ${loading ? '<div class="fifa-detail-loading">Loading real match details...</div>' : svRenderFifaDetailTab(payload)}
      </div>
    `;
  }

  function svRenderFifaUnavailable(text){
    return `<div class="fifa-detail-empty">${svFifaEsc(text || 'Unavailable from the current provider.')}</div>`;
  }

  function svRenderFifaDetailTab(payload){
    const tab = svFifaLiveState.detailTab || 'overview';
    if(tab === 'stats')return svRenderFifaDetailStats(payload);
    if(tab === 'lineups')return svRenderFifaDetailLineups(payload);
    if(tab === 'events')return svRenderFifaDetailEvents(payload);
    if(tab === 'table')return svRenderFifaDetailTable(payload);
    return svRenderFifaDetailOverview(payload);
  }

  function svRenderFifaDetailOverview(payload){
    const match = svFifaDetailMatch();
    const overview = payload?.overview || {};
    const sourceName = payload?.provider?.active || payload?.source || '';
    const coreRows = [
      ['Status', svFifaStatusInfo(match)],
      ['Source', sourceName],
      ['Competition', match.competition],
      ['Stage', match.stage || match.group || overview.round],
      ['Venue', match.venue],
      ['Kickoff', match.startTime ? svFifaFormatTime(match.startTime) : ''],
      ['Round', overview.round]
    ].map(([label,value])=>[label, svFifaCleanText(value) || 'N/A']);
    const optionalRows = [
      ['Referee', overview.referee],
      ['Attendance', overview.attendance],
      ['Weather', overview.weather],
      ['Leg', overview.leg]
    ].map(([label,value])=>[label, svFifaCleanText(value)]).filter(([,value])=>value);
    const rows = [...coreRows, ...optionalRows];
    if(!rows.length)return svRenderFifaUnavailable(payload?.message || 'Only the live score is available for this fixture right now.');
    return `<div class="fifa-detail-grid">${rows.map(([label,value])=>`
      <div class="fifa-detail-info">
        <span>${svFifaEsc(label)}</span>
        <strong>${svFifaEsc(value)}</strong>
      </div>
    `).join('')}</div>`;
  }

  function svFifaStatNumber(value){
    const text = svFifaCleanText(value).replace(/,/g,'');
    if(!text)return null;
    const n = Number(text.replace(/%$/,''));
    return Number.isFinite(n) ? n : null;
  }

  function svFifaDisplayStatValue(label, value){
    const text = svFifaCleanText(value);
    if(!text)return '';
    const key = svFifaStatKey(label);
    const percentLike = /possession|percent|percentage|accuracy|completion/.test(key) || text.endsWith('%');
    const n = Number(text.replace(/,/g,'').replace(/%$/,''));
    if(percentLike && Number.isFinite(n) && !text.endsWith('%')){
      const percentValue = n <= 1 ? n * 100 : n;
      return `${percentValue.toFixed(percentValue % 1 ? 1 : 0)}%`;
    }
    return text;
  }

  function svRenderFifaDetailStats(payload){
    const stats = svFifaProviderStatRows(payload?.statistics, payload);
    if(!stats.length)return svRenderFifaUnavailable('Match stats are not available from the current provider for this fixture.');
    const match = svFifaDetailMatch();
    return `<div class="fifa-stats-board">
      <div class="fifa-stats-teams">
        ${svFifaTeamHtml(match, 'home', 'Home', true)}
        <span>Stats</span>
        ${svFifaTeamHtml(match, 'away', 'Away', true)}
      </div>
      ${stats.map(row=>`
        ${svRenderFifaStatRow(row)}
      `).join('')}
    </div>`;
  }

  function svRenderFifaStatRow(row){
    const homeText = svFifaDisplayStatValue(row.label, row.home) || '-';
    const awayText = svFifaDisplayStatValue(row.label, row.away) || '-';
    const homeNum = svFifaStatNumber(row.home);
    const awayNum = svFifaStatNumber(row.away);
    const total = (homeNum || 0) + (awayNum || 0);
    const canBar = homeNum !== null && awayNum !== null && total > 0;
    const homePct = canBar ? Math.max(0, Math.min(100, (homeNum / total) * 100)) : 50;
    const awayPct = canBar ? Math.max(0, Math.min(100, (awayNum / total) * 100)) : 50;
    return `<div class="fifa-stat-row" data-fifa-stat-source="${svFifaEsc(row.source || 'provider')}">
      <div class="fifa-stat-values">
        <strong>${svFifaEsc(homeText)}</strong>
        <span>${svFifaEsc(svFifaCleanText(row.label) || 'Stat')}</span>
        <strong>${svFifaEsc(awayText)}</strong>
      </div>
      ${canBar ? `<div class="fifa-stat-bars" aria-hidden="true">
        <i style="width:${homePct.toFixed(1)}%"></i>
        <b style="width:${awayPct.toFixed(1)}%"></b>
      </div>` : ''}
    </div>`;
  }

  function svRenderFifaPlayerRows(players){
    const rows = Array.isArray(players) ? players.filter(player=>svFifaCleanText(player?.name)) : [];
    return rows.map(player=>`
      <div class="fifa-player-row">
        <b>${svFifaEsc(player.number || '')}</b>
        <span>${svFifaEsc(player.name || '')}</span>
        <em>${svFifaEsc(player.position || '')}</em>
      </div>
    `).join('');
  }

  function svRenderFifaTeamLineup(lineup, fallbackTeam){
    const starters = Array.isArray(lineup?.players) ? lineup.players.filter(player=>svFifaCleanText(player?.name)) : [];
    const subs = Array.isArray(lineup?.substitutes) ? lineup.substitutes.filter(player=>svFifaCleanText(player?.name)) : [];
    const formation = svFifaCleanText(lineup?.formation);
    const coach = svFifaCleanText(lineup?.coach);
    return `<div class="fifa-lineup-team">
      <div class="fifa-lineup-team-head">
        <strong>${svFifaTeamHtml(lineup, '', fallbackTeam || 'Team')}</strong>
        ${formation ? `<span class="fifa-lineup-formation">${svFifaEsc(formation)}</span>` : ''}
      </div>
      ${coach ? `<div class="fifa-lineup-coach">Coach: ${svFifaEsc(coach)}</div>` : ''}
      ${starters.length ? `<div class="fifa-lineup-label">Starters</div>${svRenderFifaPlayerRows(starters)}` : ''}
      ${subs.length ? `<div class="fifa-lineup-label">Substitutes</div>${svRenderFifaPlayerRows(subs)}` : ''}
    </div>`;
  }

  function svRenderFifaDetailLineups(payload){
    const match = svFifaDetailMatch();
    const lineups = payload?.lineups || {};
    const home = lineups.home || {};
    const away = lineups.away || {};
    const hasLineups = svFifaHasLineupRows(payload);
    if(!hasLineups)return svRenderFifaUnavailable('Lineups are not available from the current provider for this fixture.');
    return `<div class="fifa-lineups-grid">
      ${svRenderFifaTeamLineup(home, match.homeTeam)}
      ${svRenderFifaTeamLineup(away, match.awayTeam)}
    </div>`;
  }

  function svRenderFifaDetailEvents(payload){
    const events = Array.isArray(payload?.events)
      ? payload.events.filter(event=>svFifaCleanText(event?.type) || svFifaCleanText(event?.player) || svFifaCleanText(event?.team) || svFifaCleanText(event?.detail))
      : [];
    if(!events.length)return svRenderFifaUnavailable('Match events are not available from the current provider for this fixture.');
    return `<div class="fifa-event-list">${events.map(event=>{
      const text = `${event.type || ''} ${event.detail || ''}`;
      const isGoal = /goal/i.test(text);
      const isCard = /card/i.test(text);
      const icon = isGoal ? 'G' : (isCard ? '!' : '•');
      return `
        <div class="fifa-event-row ${isGoal ? 'is-goal' : ''}">
          <time>${svFifaEsc(event.minute || '')}</time>
          <div class="fifa-event-main">
            <div class="fifa-event-title">
              <i aria-hidden="true">${svFifaEsc(icon)}</i>
              <strong>${svFifaEsc(event.type || 'Event')}</strong>
            </div>
            ${event.team ? `<span class="fifa-event-team">${svFifaFlagHtml(event, '', false)}${svFifaEsc(event.team)}</span>` : ''}
            ${event.player ? `<span class="fifa-event-player">${svFifaEsc(event.player)}</span>` : ''}
            ${event.detail ? `<p>${svFifaEsc(event.detail)}</p>` : ''}
          </div>
        </div>
      `;
    }).join('')}</div>`;
  }

  function svRenderFifaDetailTable(payload){
    const rows = Array.isArray(payload?.standings)
      ? payload.standings.filter(row=>svFifaCleanText(row?.team) && svFifaStandingHasValues(row))
      : [];
    if(!rows.length)return svRenderFifaUnavailable('Standings are not available from the current provider for this fixture.');
    return `<div class="fifa-detail-standings">
      <div class="fifa-detail-standings-head"><span>Team</span><span>MP</span><span>GD</span><span>PTS</span></div>
      ${rows.map(row=>`
        <div class="fifa-detail-standings-row">
          <span><b>${svFifaEsc(row.rank || '')}</b>${svFifaTeamHtml(row, '', row.team || 'Team')}</span>
          <span>${svFifaEsc(row.played ?? '-')}</span>
          <span>${svFifaEsc(row.goalDifference ?? '-')}</span>
          <strong>${svFifaEsc(row.points ?? '-')}</strong>
        </div>
      `).join('')}
    </div>`;
  }

  function svHandleFifaMatchClick(event){
    const nav = event.target.closest('[data-fifa-strip-nav]');
    if(nav){
      svScrollFifaMatchStrip(Number(nav.dataset.fifaStripNav || 0));
      return;
    }
    const card = event.target.closest('[data-fifa-match-key]');
    if(!card)return;
    const match = svFifaLiveState.matchesByKey.get(card.dataset.fifaMatchKey);
    if(match)svOpenFifaMatchDetail(match, card);
  }

  function svHandleFifaMatchKeydown(event){
    if(event.key !== 'Enter' && event.key !== ' ')return;
    const card = event.target.closest('[data-fifa-match-key]');
    if(!card)return;
    event.preventDefault();
    const match = svFifaLiveState.matchesByKey.get(card.dataset.fifaMatchKey);
    if(match)svOpenFifaMatchDetail(match, card);
  }

  function svScrollFifaMatchStrip(direction){
    const strip = document.getElementById('fifaMatchStrip');
    if(!strip || !direction)return;
    strip.dataset.svFifaUserMoved = '1';
    if(window.matchMedia && window.matchMedia('(max-width: 759px)').matches){
      const cards = Array.from(strip.querySelectorAll('.fifa-match-card[data-fifa-match-key]'));
      if(cards.length){
        const current = cards.reduce((best, card, index)=>{
          const left = Math.max(0, card.offsetLeft - strip.offsetLeft);
          const delta = Math.abs(left - strip.scrollLeft);
          return delta < best.delta ? { index, delta } : best;
        }, { index:0, delta:Infinity }).index;
        const next = Math.max(0, Math.min(cards.length - 1, current + (direction > 0 ? 1 : -1)));
        const target = Math.max(0, cards[next].offsetLeft - strip.offsetLeft);
        strip.scrollTo({ left:target, behavior:'smooth' });
        return;
      }
    }
    const amount = Math.max(260, Math.round(strip.clientWidth * 0.72));
    strip.scrollBy({ left: amount * direction, behavior:'smooth' });
  }

  function svFifaPositionMatchStrip(strip, startIndex){
    if(!strip)return;
    strip.dataset.svFifaCarouselStartIndex = String(startIndex || 0);
    if(!startIndex || strip.dataset.svFifaUserMoved === '1')return;
    requestAnimationFrame(()=>{
      if(strip.dataset.svFifaUserMoved === '1')return;
      const target = strip.querySelector('[data-fifa-carousel-start="1"]');
      if(!target)return;
      strip.scrollLeft = Math.max(0, target.offsetLeft - strip.offsetLeft - 8);
    });
  }

  function svSetFifaPageTitle(){
    const intro = document.getElementById('discoverIntro');
    if(intro){
      intro.classList.add('sv-fifa-intro-hidden');
      intro.setAttribute('aria-hidden','true');
    }
  }

  function svEnsureFifaLiveSection(){
    const hero = document.getElementById('hero');
    if(!hero)return null;
    svSetFifaPageTitle();
    hero.classList.add('sv-fifa-hero');
    hero.setAttribute('aria-label','FIFA and football live updates');
    if(hero.dataset.svFifaLive === '1'){
      const existingRoot = document.getElementById('fifaLiveRoot');
      if(existingRoot && existingRoot.dataset.svFifaBound !== '1'){
        existingRoot.dataset.svFifaBound = '1';
        existingRoot.addEventListener('click', svHandleFifaMatchClick);
        existingRoot.addEventListener('keydown', svHandleFifaMatchKeydown);
      }
      return existingRoot;
    }

    hero.dataset.svFifaLive = '1';
    hero.innerHTML = `
      <section class="fifa-live-section is-loading" id="fifaLiveRoot" aria-live="polite">
        <div class="fifa-live-top">
          <div class="fifa-live-heading">
            <h2>FIFA LIVE UPDATE</h2>
          </div>
          <div class="fifa-live-timer-slot" aria-live="polite">
            <span class="fifa-feature-timer fifa-live-header-timer" data-fifa-feature-timer hidden></span>
          </div>
        </div>
        <div class="fifa-live-layout">
          <div class="fifa-featured-card" id="fifaFeaturedMatch"></div>
          <aside class="fifa-table-card" id="fifaStandingsCard"></aside>
        </div>
        <div class="fifa-match-strip-wrap" id="fifaMatchStripWrap">
          <button class="fifa-match-nav fifa-match-nav-prev" type="button" data-fifa-strip-nav="-1" aria-label="Previous football matches"><span aria-hidden="true">&lsaquo;</span></button>
          <div class="fifa-match-strip" id="fifaMatchStrip"></div>
          <button class="fifa-match-nav fifa-match-nav-next" type="button" data-fifa-strip-nav="1" aria-label="Next football matches"><span aria-hidden="true">&rsaquo;</span></button>
        </div>
        <div class="fifa-headline-strip" id="fifaHeadlineStrip"></div>
      </section>
    `;
    const root = document.getElementById('fifaLiveRoot');
    if(root && root.dataset.svFifaBound !== '1'){
      root.dataset.svFifaBound = '1';
      root.addEventListener('click', svHandleFifaMatchClick);
      root.addEventListener('keydown', svHandleFifaMatchKeydown);
    }
    svRenderFifaLoading();
    return root;
  }

  function svRenderFifaLoading(){
    const root = document.getElementById('fifaLiveRoot');
    if(!root || svFifaLiveState.payload)return;
    root.classList.add('is-loading');
    const featured = document.getElementById('fifaFeaturedMatch');
    const standings = document.getElementById('fifaStandingsCard');
    const strip = document.getElementById('fifaMatchStrip');
    const stripWrap = document.getElementById('fifaMatchStripWrap');
    const headlines = document.getElementById('fifaHeadlineStrip');
    if(featured)featured.innerHTML = `
      <div class="fifa-skeleton-line w40"></div>
      <div class="fifa-skeleton-score"></div>
      <div class="fifa-skeleton-line w70"></div>
      <div class="fifa-skeleton-line w55"></div>
    `;
    if(standings)standings.innerHTML = `
      <div class="fifa-skeleton-line w55"></div>
      <div class="fifa-skeleton-row"></div>
      <div class="fifa-skeleton-row"></div>
      <div class="fifa-skeleton-row"></div>
    `;
    if(strip)strip.innerHTML = Array.from({length:4},()=>'<div class="fifa-match-card fifa-match-skeleton"><div></div><div></div><div></div></div>').join('');
    if(stripWrap)stripWrap.hidden = false;
    if(headlines){
      headlines.innerHTML = '';
      headlines.hidden = true;
    }
  }

  function svFifaScore(score){
    return score === 0 || score ? String(score) : '-';
  }

  function svFifaFormatTime(value){
    if(!value)return 'TBD';
    const date = new Date(value);
    if(Number.isNaN(date.getTime()))return String(value);
    return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(date);
  }

  function svFifaFormatClock(value){
    const date = new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat(undefined, { hour:'numeric', minute:'2-digit' }).format(date);
  }

  function svFifaSameLocalDay(a, b){
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function svFifaDecimalHours(ms){
    return (Math.max(0, Number(ms) || 0) / 3600000).toFixed(2);
  }

  function svFifaLiveMinuteValue(match){
    const raw = svFifaCleanText(match?.minute || match?.clock || match?.displayClock || match?.time);
    if(!raw)return null;
    const added = raw.match(/(\d+)\s*\+\s*(\d+)/);
    if(added)return Number(added[1]) + Number(added[2]);
    const colon = raw.match(/(\d{1,3})\s*:\s*(\d{1,2})/);
    if(colon)return Number(colon[1]);
    const number = raw.match(/\d{1,3}/);
    return number ? Number(number[0]) : null;
  }

  function svFifaFeaturedTimerText(match){
    const status = String(match?.status || '').toUpperCase();
    if(status === 'LIVE' || status === 'HT' || status === 'IN' || status === 'IN_PROGRESS'){
      const startValue = match?.startTime || match?.kickoff;
      const start = new Date(startValue || '');
      if(!Number.isNaN(start.getTime()))return `${svFifaDecimalHours(Date.now() - start.getTime())} Live`;
      const minutes = svFifaLiveMinuteValue(match);
      if(Number.isFinite(minutes))return `${Math.max(0, minutes / 60).toFixed(2)} Live`;
      return '--.-- Live';
    }
    if(status === 'FT' || status === 'FINAL' || status === 'STATUS_FINAL')return 'Final';
    if(status === 'POSTPONED')return 'Postponed';
    const startValue = match?.startTime || match?.kickoff;
    const start = new Date(startValue || '');
    if(Number.isNaN(start.getTime()))return '--.-- hours left';
    return `${svFifaDecimalHours(start.getTime() - Date.now())} hours left`;
  }

  function svClearFifaCountdown(){
    clearInterval(svFifaLiveState.countdownTimer);
    svFifaLiveState.countdownTimer = null;
    svFifaLiveState.countdownMatch = null;
    svFifaLiveState.countdownMatchKey = '';
    const el = document.querySelector('[data-fifa-feature-timer]');
    if(el){
      el.textContent = '';
      el.hidden = true;
    }
  }

  function svUpdateFifaCountdown(){
    const el = document.querySelector('[data-fifa-feature-timer]');
    if(!el || !svFifaLiveState.countdownMatch)return;
    el.textContent = svFifaFeaturedTimerText(svFifaLiveState.countdownMatch);
    el.hidden = false;
  }

  function svStartFifaCountdown(match, key){
    svClearFifaCountdown();
    if(!match || !key || document.hidden)return;
    svFifaLiveState.countdownMatch = match;
    svFifaLiveState.countdownMatchKey = key;
    svUpdateFifaCountdown();
    const status = String(match?.status || '').toUpperCase();
    if(status === 'FT' || status === 'FINAL' || status === 'STATUS_FINAL' || status === 'POSTPONED')return;
    svFifaLiveState.countdownTimer = setInterval(svUpdateFifaCountdown, 30000);
  }

  function svFifaRelativeTime(value){
    const date = new Date(value || Date.now());
    const diff = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(diff / 60000);
    if(minutes < 1)return 'Updated just now';
    if(minutes < 60)return `Updated ${minutes}m ago`;
    return `Updated ${Math.floor(minutes / 60)}h ago`;
  }

  function svFifaMatchTime(match){
    const status = String(match?.status || '').toUpperCase();
    if(status === 'LIVE' || status === 'IN' || status === 'IN_PROGRESS')return match?.minute || match?.clock || match?.displayClock || 'Live';
    if(status === 'HT')return 'HT';
    if(status === 'FT' || status === 'FINAL' || status === 'STATUS_FINAL')return svFifaFormatTime(match?.startTime || match?.kickoff) || 'FT';
    if(status === 'POSTPONED')return 'Postponed';
    return svFifaFormatTime(match?.startTime || match?.kickoff);
  }

  function svFifaMatchMeta(match){
    return [match?.competition, match?.stage || match?.group, match?.venue].filter(Boolean).join(' / ') || 'Football update';
  }

  function svFifaMatchStatus(match){
    const status = String(match?.status || (match?.live ? 'LIVE' : 'UPCOMING')).toUpperCase();
    if(status === 'LIVE' || status === 'HT' || status === 'IN' || status === 'IN_PROGRESS')return { label:'LIVE', className:'is-live' };
    if(status === 'FT' || status === 'FINAL' || status === 'STATUS_FINAL')return { label:'FINAL', className:'is-result', extraClass:'is-final' };
    if(status === 'POSTPONED')return { label:'POSTPONED', className:'is-upcoming' };
    return { label:'UPCOMING', className:'is-upcoming' };
  }

  function svFifaIsLiveMatch(match){
    const status = String(match?.status || '').toUpperCase();
    return status === 'LIVE' || status === 'HT' || status === 'IN' || status === 'IN_PROGRESS';
  }

  function svFifaFeaturedDetailFor(match){
    const key = svFifaMatchKey(match);
    return key && key === svFifaLiveState.featuredDetailKey ? svFifaLiveState.featuredDetailPayload : null;
  }

  function svFifaFeaturedEvent(detail){
    const events = Array.isArray(detail?.events) ? detail.events : [];
    return events.find(event=>/goal/i.test(`${event.type || ''} ${event.detail || ''}`)) || events[0] || null;
  }

  function svFifaStatKey(label){
    return svFifaCleanText(label).toLowerCase().replace(/[^a-z0-9]+/g,'');
  }

  function svFifaFeaturedStatValue(row){
    const home = svFifaDisplayStatValue(row?.label, row?.home);
    const away = svFifaDisplayStatValue(row?.label, row?.away);
    return home || away ? `${home || '-'} / ${away || '-'}` : '';
  }

  function svFifaCompactStats(detail, limit){
    const stats = svFifaProviderStatRows(detail?.statistics, detail);
    const wanted = [
      /^(total)?shots$/i,
      /shots on target|shotsongoal/i,
      /possession/i,
      /^passes$|total passes/i,
      /accurate passes|pass completion|pass accuracy/i,
      /fouls/i,
      /yellow cards/i,
      /red cards/i,
      /offsides/i,
      /corners|corner kicks/i
    ];
    const picked = [];
    wanted.forEach(rx=>{
      const row = stats.find(item=>rx.test(svFifaCleanText(item?.label)) && svFifaFeaturedStatValue(item) && !picked.includes(item));
      if(row)picked.push(row);
    });
    stats.forEach(row=>{
      if(picked.length >= (limit || 8))return;
      if(svFifaFeaturedStatValue(row) && !picked.includes(row))picked.push(row);
    });
    return picked.slice(0, limit || 8);
  }

  function svFifaFeaturedInfoItems(match){
    const detail = svFifaFeaturedDetailFor(match);
    const items = [];
    const add = (label, value, className, html, source)=>{
      const cleanLabel = svFifaCleanText(label);
      const cleanValue = html ? '' : svFifaCleanText(value);
      if(!cleanLabel || (!cleanValue && !html))return;
      if(items.some(item=>svFifaStatKey(item.label) === svFifaStatKey(cleanLabel)))return;
      items.push({ label:cleanLabel, value:cleanValue, className:className || '', html:html || '', source:source || 'provider' });
    };
    const summarySource = svFifaValueSource(svFifaLiveState.payload);
    const detailSource = detail ? svFifaValueSource(detail) : summarySource;
    const overview = detail?.overview || {};
    add('Status', svFifaStatusInfo(match), '', '', summarySource);
    add('Kickoff', match?.startTime ? svFifaFormatTime(match.startTime) : '', '', '', summarySource);
    add('Venue', match?.venue, '', '', summarySource);
    add('Stage', match?.stage || match?.group || overview.round, '', '', summarySource);
    add('Competition', match?.competition, '', '', '', summarySource);
    add('Round', overview.round, '', '', detailSource);
    if(detail){
      svFifaCompactStats(detail, 5).forEach(row=>add(row.label, svFifaFeaturedStatValue(row), 'is-stat', '', row.source || detailSource));
      const event = svFifaFeaturedEvent(detail);
      if(event){
        const eventText = [event.minute, event.player || event.team, event.type || event.detail].filter(Boolean).join(' - ');
        const eventHtml = `${event.team ? svFifaFlagHtml(event, '', false) : ''}<span>${svFifaEsc(eventText || event.detail || 'Match event')}</span>`;
        add(/goal/i.test(`${event.type || ''} ${event.detail || ''}`) ? 'Last goal' : 'Key event', '', 'is-event', eventHtml, svFifaValueSource(detail, event));
      }
    }
    return items.slice(0, svFifaInfoItemLimit(items));
  }

  function svRenderFifaFeaturedExtras(match){
    const items = svFifaFeaturedInfoItems(match);
    if(!items.length)return '';
    return `<div class="fifa-feature-grid">${items.map(item=>`
      <div class="fifa-feature-info ${svFifaEsc(item.className)}" data-fifa-card-source="${svFifaEsc(item.source || 'provider')}">
        <b>${svFifaEsc(item.label)}</b>
        ${item.html ? `<strong>${item.html}</strong>` : `<strong>${svFifaEsc(item.value)}</strong>`}
      </div>
    `).join('')}</div>`;
  }

  function svFetchFifaFeaturedDetail(match){
    const key = svFifaMatchKey(match);
    if(!match || !key){
      if(svFifaLiveState.featuredDetailController){
        svFifaLiveState.featuredDetailController.abort();
        svFifaLiveState.featuredDetailController = null;
      }
      svFifaLiveState.featuredDetailKey = '';
      svFifaLiveState.featuredDetailPayload = null;
      return;
    }
    if(svFifaLiveState.featuredDetailKey === key && svFifaLiveState.featuredDetailPayload)return;
    if(svFifaLiveState.featuredDetailKey === key && svFifaLiveState.featuredDetailController)return;
    if(svFifaLiveState.featuredDetailController)svFifaLiveState.featuredDetailController.abort();
    svFifaLiveState.featuredDetailKey = key;
    svFifaLiveState.featuredDetailPayload = null;
    svFifaLiveState.featuredDetailController = new AbortController();
    fetch(svFifaBuildDetailUrl(match), {
      cache:'no-store',
      headers:{ Accept:'application/json' },
      signal:svFifaLiveState.featuredDetailController.signal
    })
      .then(response=>response.ok ? response.json() : Promise.reject(new Error('Featured match details failed')))
      .then(data=>{
        svFifaLiveState.featuredDetailPayload = data;
        const featuredEl = document.getElementById('fifaFeaturedMatch');
        if(featuredEl && svFifaLiveState.payload){
          const merged = svFifaMergeDetailMatch(match, data?.match || {});
          const isLiveFeatured = svFifaIsLiveMatch(merged);
          featuredEl.classList.toggle('is-live-featured', isLiveFeatured);
          featuredEl.classList.toggle('is-live', isLiveFeatured);
          featuredEl.innerHTML = svFifaRenderMatch(merged, true, key);
          svStartFifaCountdown(merged, key);
        }
      })
      .catch(err=>{
        if(err?.name !== 'AbortError')svFifaLiveState.featuredDetailPayload = null;
      })
      .finally(()=>{
        svFifaLiveState.featuredDetailController = null;
      });
  }

  function svFifaRenderEmpty(title, detail, featured){
    return `<div class="${featured ? 'fifa-featured-empty' : 'fifa-match-card fifa-match-empty'}">
      <div class="fifa-card-label">Real data</div>
      <div class="fifa-empty-title">${svFifaEsc(title || 'No live matches right now')}</div>
      <div class="fifa-match-meta">${svFifaEsc(detail || 'Waiting for the next real fixture update')}</div>
    </div>`;
  }

  function svFifaRenderMatch(match, featured, key, options){
    if(!match){
      return svFifaRenderEmpty('No live matches right now', 'Waiting for the next real fixture update', featured);
    }
    const state = svFifaMatchStatus(match);
    const stateClasses = `${state.className} ${state.extraClass || ''}`.trim();
    const className = featured ? `fifa-featured-card-inner ${stateClasses}` : `fifa-match-card ${stateClasses}`;
    const kind = options?.kind || (state.className === 'is-result' ? 'past' : 'forward');
    const startAttr = options?.start ? ' data-fifa-carousel-start="1"' : '';
    const cardAttrs = featured ? '' : ` data-fifa-card-kind="${svFifaEsc(kind)}"${startAttr}`;
    const attrs = key ? ` role="button" tabindex="0" data-fifa-match-key="${svFifaEsc(key)}"${cardAttrs} aria-label="View details for ${svFifaEsc(match.homeTeam || 'home')} versus ${svFifaEsc(match.awayTeam || 'away')}"` : cardAttrs;
    if(featured){
      return `
        <article class="${className} is-clickable"${attrs}>
          <div class="fifa-feature-scoreboard">
            <div class="fifa-feature-team fifa-feature-team-home">${svFifaTeamHtml(match, 'home', 'Home', true)}</div>
            <div class="fifa-feature-score" aria-label="Featured match score">
              <span>${svFifaEsc(svFifaScore(match.homeScore))}</span>
              <b>-</b>
              <span>${svFifaEsc(svFifaScore(match.awayScore))}</span>
            </div>
            <div class="fifa-feature-team fifa-feature-team-away">${svFifaTeamHtml(match, 'away', 'Away', true)}</div>
          </div>
          <div class="fifa-match-meta fifa-feature-meta">${svFifaEsc(svFifaMatchMeta(match))}</div>
          ${svRenderFifaFeaturedExtras(match)}
        </article>
      `;
    }
    return `
      <article class="${className} is-clickable"${attrs}>
        <div class="fifa-card-label ${state.className}">
          ${state.className === 'is-live' ? '<span class="fifa-live-dot"></span>' : ''}${svFifaEsc(state.label)}
          <span>${svFifaEsc(svFifaMatchTime(match))}</span>
        </div>
        <div class="fifa-scoreboard">
          <div class="fifa-team-line">
            <span>${svFifaTeamHtml(match, 'home', 'Home', featured)}</span>
            <strong>${svFifaEsc(svFifaScore(match.homeScore))}</strong>
          </div>
          <div class="fifa-team-line">
            <span>${svFifaTeamHtml(match, 'away', 'Away', featured)}</span>
            <strong>${svFifaEsc(svFifaScore(match.awayScore))}</strong>
          </div>
        </div>
        <div class="fifa-match-meta">${svFifaEsc(svFifaMatchMeta(match))}</div>
        ${featured ? svRenderFifaFeaturedExtras(match) : ''}
        <div class="fifa-detail-cta">View details</div>
      </article>
    `;
  }

  function svFifaRenderStandings(rows){
    const groupRows = (rows || []).slice(0, 6);
    if(!groupRows.length)return '';
    const groupName = groupRows[0]?.group || 'Group';
    return `
      <div class="fifa-table-title">${svFifaEsc(groupName)}</div>
      <div class="fifa-table-head"><span>Team</span><span>MP</span><span>GD</span><span>PTS</span></div>
      ${groupRows.map(row=>`
        <div class="fifa-table-row">
          <span><b>${svFifaEsc(row.rank || '')}</b>${svFifaTeamHtml(row, '', row.team || 'Team')}</span>
          <span>${svFifaEsc(row.played ?? 0)}</span>
          <span>${svFifaEsc(row.goalDifference ?? 0)}</span>
          <strong>${svFifaEsc(row.points ?? 0)}</strong>
        </div>
      `).join('')}
    `;
  }

  function svFifaRenderHeadlines(headlines){
    const items = (headlines || []).filter(item=>svFifaCleanText(typeof item === 'string' ? item : item?.title)).slice(0, 8);
    if(!items.length)return '';
    return items.map(item=>{
      const title = typeof item === 'string' ? item : item?.title;
      const url = typeof item === 'string' ? '' : svFifaHttpUrl(item?.url);
      const source = typeof item === 'string' ? '' : svFifaCleanText(item?.source);
      const publishedAt = typeof item === 'string' ? '' : svFifaCleanText(item?.publishedAt || item?.time);
      const meta = [source, publishedAt ? svFifaFormatTime(publishedAt) : ''].filter(Boolean).join(' / ');
      const body = `<b>UPDATE</b><span>${svFifaEsc(title)}</span>${meta ? `<em>${svFifaEsc(meta)}</em>` : ''}`;
      return url
        ? `<a class="fifa-headline-item" href="${svFifaEsc(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
        : `<span class="fifa-headline-item">${body}</span>`;
    }).filter(Boolean).join('');
  }

  function svRenderFifaNews(payload){
    const headlinesEl = document.getElementById('fifaHeadlineStrip');
    if(!headlinesEl)return;
    const headlines = Array.isArray(payload?.headlines) ? payload.headlines : [];
    const html = svFifaRenderHeadlines(headlines);
    headlinesEl.innerHTML = html;
    headlinesEl.hidden = !html;
    const root = document.getElementById('fifaLiveRoot');
    if(root)root.classList.toggle('has-news', !!html);
  }

  function svFetchFifaNews(background){
    const now = Date.now();
    if(svFifaLiveState.newsLoading)return;
    if(background && svFifaLiveState.newsFetchedAt && now - svFifaLiveState.newsFetchedAt < SV_FIFA_NEWS_CLIENT_TTL){
      svScheduleFifaNewsRefresh(SV_FIFA_NEWS_CLIENT_TTL - (now - svFifaLiveState.newsFetchedAt));
      return;
    }
    if(!svFifaDiscoverVisible())return;
    svFifaLiveState.newsLoading = true;
    if(svFifaLiveState.newsController)svFifaLiveState.newsController.abort();
    svFifaLiveState.newsController = new AbortController();
    fetch('/api/fifa-live/news', {
      cache:'no-store',
      headers:{ Accept:'application/json' },
      signal:svFifaLiveState.newsController.signal
    })
      .then(r=>r.ok ? r.json() : Promise.reject(new Error('FIFA news feed failed')))
      .then(data=>{
        const hasHeadlines = Array.isArray(data?.headlines) && data.headlines.length > 0;
        const hasCachedHeadlines = Array.isArray(svFifaLiveState.newsPayload?.headlines) && svFifaLiveState.newsPayload.headlines.length > 0;
        if(hasHeadlines)svFifaLiveState.newsPayload = data;
        svFifaLiveState.newsFetchedAt = Date.now();
        svRenderFifaNews(hasHeadlines || !hasCachedHeadlines ? data : svFifaLiveState.newsPayload);
      })
      .catch(err=>{
        if(err?.name === 'AbortError')return;
        svFifaLiveState.newsFetchedAt = Date.now();
        svRenderFifaNews(svFifaLiveState.newsPayload);
      })
      .finally(()=>{
        svFifaLiveState.newsLoading = false;
        svFifaLiveState.newsController = null;
        svScheduleFifaNewsRefresh();
      });
  }

  function svScheduleFifaNewsRefresh(delay){
    clearTimeout(svFifaLiveState.newsTimer);
    svFifaLiveState.newsTimer = null;
    if(!svFifaDiscoverVisible())return;
    svFifaLiveState.newsTimer = setTimeout(()=>svFetchFifaNews(true), Math.max(30000, delay || SV_FIFA_NEWS_CLIENT_TTL));
  }

  function svScheduleFifaPostRenderWork(featuredMatch, headlines){
    clearTimeout(svFifaLiveState.postRenderTimer);
    svFifaLiveState.postRenderTimer = null;
    if(!svFifaDiscoverVisible())return;
    svFifaLiveState.postRenderTimer = setTimeout(()=>{
      svFifaLiveState.postRenderTimer = null;
      if(!svFifaDiscoverVisible())return;
      svFetchFifaFeaturedDetail(featuredMatch);
      const headlinesEl = document.getElementById('fifaHeadlineStrip');
      if(headlinesEl){
        if(Array.isArray(headlines) && headlines.length)svRenderFifaNews(svFifaLiveState.newsPayload || { headlines });
        svFetchFifaNews(true);
      }
    }, 900);
  }

  function svRenderFifaLive(payload, errorMessage){
    const root = svEnsureFifaLiveSection();
    if(!root)return;
    const liveMatches = Array.isArray(payload?.liveMatches) ? payload.liveMatches : [];
    const upcomingMatches = Array.isArray(payload?.upcomingMatches) ? payload.upcomingMatches : [];
    const recentResults = Array.isArray(payload?.recentResults) ? payload.recentResults : [];
    const standings = Array.isArray(payload?.standings) ? payload.standings : [];
    const headlines = Array.isArray(payload?.headlines) ? payload.headlines : [];
    const carousel = svFifaCarouselMatches(payload);
    const matchList = carousel.matches;
    const featuredMatch = liveMatches[0] || upcomingMatches[0] || recentResults[0] || null;
    svSetMobileLiveMatchState(liveMatches.some(match=>svFifaIsLiveMatch(match)));
    svFifaLiveState.matchesByKey.clear();
    matchList.forEach(match=>{
      const key = svFifaMatchKey(match);
      if(key)svFifaLiveState.matchesByKey.set(key, match);
    });
    if(featuredMatch){
      const key = svFifaMatchKey(featuredMatch);
      if(key)svFifaLiveState.matchesByKey.set(key, featuredMatch);
    }
    const hasRealData = !!(matchList.length || standings.length || headlines.length);
    const statusEl = document.getElementById('fifaLiveStatus');
    const updatedEl = document.getElementById('fifaLiveUpdated');
    const featuredEl = document.getElementById('fifaFeaturedMatch');
    const standingsEl = document.getElementById('fifaStandingsCard');
    const stripEl = document.getElementById('fifaMatchStrip');
    const stripWrapEl = document.getElementById('fifaMatchStripWrap');
    const headlinesEl = document.getElementById('fifaHeadlineStrip');
    const signature = svFifaPayloadSignature(payload);

    root.classList.remove('is-loading');
    root.classList.toggle('is-stale', !!payload?.stale || !!errorMessage);
    root.classList.toggle('is-error', (!payload?.ok && !hasRealData) || (!!errorMessage && !hasRealData));
    root.classList.toggle('is-empty', !hasRealData);
    root.classList.toggle('has-standings', standings.length > 0);
    root.dataset.svFifaPastCount = String(carousel.pastCount || 0);
    root.dataset.svFifaForwardCount = String(carousel.forwardCount || 0);
    if(statusEl){
      statusEl.textContent = '';
      statusEl.hidden = true;
      statusEl.setAttribute('aria-hidden','true');
    }
    if(updatedEl)updatedEl.textContent = payload?.generatedAt ? svFifaRelativeTime(payload.generatedAt) : 'Waiting for real data';
    if(!errorMessage && (root.dataset.svFifaFastSignature === signature || svFifaLiveState.renderSignature === signature)){
      svFifaLiveState.renderSignature = signature;
      root.dataset.svFifaRenderedSignature = signature;
      if(featuredMatch)svStartFifaCountdown(featuredMatch, svFifaMatchKey(featuredMatch));
      else svClearFifaCountdown();
      if(stripEl)svFifaPositionMatchStrip(stripEl, carousel.startIndex);
      svScheduleFifaPostRenderWork(featuredMatch, headlines);
      return;
    }
    if(featuredEl){
      const emptyTitle = (!payload?.ok && !hasRealData) ? 'Live data unavailable' : 'No live matches right now';
      const emptyDetail = payload?.message || 'Waiting for the next real fixture update';
      const isLiveFeatured = !!featuredMatch && svFifaIsLiveMatch(featuredMatch);
      featuredEl.classList.toggle('is-live-featured', isLiveFeatured);
      featuredEl.classList.toggle('is-live', isLiveFeatured);
      featuredEl.innerHTML = featuredMatch ? svFifaRenderMatch(featuredMatch, true, svFifaMatchKey(featuredMatch)) : svFifaRenderEmpty(emptyTitle, emptyDetail, true);
    }
    if(featuredMatch)svStartFifaCountdown(featuredMatch, svFifaMatchKey(featuredMatch));
    else svClearFifaCountdown();
    if(standingsEl){
      standingsEl.innerHTML = svFifaRenderStandings(standings);
      standingsEl.hidden = !standings.length;
    }
    if(stripEl){
      stripEl.innerHTML = matchList.map((match, index)=>svFifaRenderMatch(match, false, svFifaMatchKey(match), {
        kind:index < carousel.startIndex ? 'past' : 'forward',
        start:index === carousel.startIndex
      })).join('');
      stripEl.hidden = !matchList.length;
      svFifaPositionMatchStrip(stripEl, carousel.startIndex);
    }
    if(stripWrapEl)stripWrapEl.hidden = !matchList.length;
    if(headlinesEl){
      if(!headlinesEl.innerHTML)headlinesEl.hidden = true;
    }
    svFifaLiveState.renderSignature = signature;
    root.dataset.svFifaRenderedSignature = signature;
    svScheduleFifaPostRenderWork(featuredMatch, headlines);
  }

  function svFifaDiscoverVisible(){
    if(document.hidden)return false;
    const root = document.getElementById('fifaLiveRoot');
    const hero = document.getElementById('hero');
    if(!root || !hero)return true;
    try{
      if(typeof currentTab !== 'undefined' && currentTab !== 'discover')return false;
    }catch(_err){}
    return hero.offsetParent !== null || root.offsetParent !== null;
  }

  function svScheduleFifaLiveRefresh(){
    clearTimeout(svFifaLiveState.timer);
    if(!svFifaDiscoverVisible())return;
    const hasLive = Array.isArray(svFifaLiveState.payload?.liveMatches) && svFifaLiveState.payload.liveMatches.length > 0;
    svFifaLiveState.timer = setTimeout(()=>svFetchFifaLive(true), hasLive ? 30000 : 180000);
  }

  function svFetchFifaLive(background){
    const root = svEnsureFifaLiveSection();
    if(!root || !svFifaDiscoverVisible())return;
    if(svFifaLiveState.loading)return;
    if(!background && !svFifaLiveState.payload)svRenderFifaLoading();
    svFifaLiveState.loading = true;
    const earlyRequest = svFifaTakeEarlyPromise();
    let request;
    if(earlyRequest){
      request = earlyRequest;
    }else{
      if(svFifaLiveState.controller)svFifaLiveState.controller.abort();
      svFifaLiveState.controller = new AbortController();
      request = fetch('/api/fifa-live', {
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal:svFifaLiveState.controller.signal
      }).then(r=>r.ok ? r.json() : Promise.reject(new Error('FIFA live feed failed')));
    }
    request
      .then(data=>{
        svFifaLiveState.payload = data;
        svFifaWriteCachedPayload(data);
        svRenderFifaLive(data);
      })
      .catch(err=>{
        if(err?.name === 'AbortError')return;
        const fallback = svFifaLiveState.payload
          ? { ...svFifaLiveState.payload, stale:true, message:svFifaLiveState.payload.message || 'Showing the last real football update' }
          : svFifaClientFallbackPayload(err.message);
        svFifaLiveState.payload = fallback;
        svRenderFifaLive(fallback, err.message);
      })
      .finally(()=>{
        svFifaLiveState.loading = false;
        svFifaLiveState.controller = null;
        svScheduleFifaLiveRefresh();
      });
  }

  function svHandleFifaVisibility(){
    if(document.hidden){
      clearTimeout(svFifaLiveState.timer);
      clearTimeout(svFifaLiveState.newsTimer);
      svFifaLiveState.newsTimer = null;
      svClearFifaCountdown();
      if(svFifaLiveState.controller)svFifaLiveState.controller.abort();
      if(svFifaLiveState.newsController)svFifaLiveState.newsController.abort();
      return;
    }
    if(svFifaDiscoverVisible()){
      if(svFifaLiveState.payload)svRenderFifaLive(svFifaLiveState.payload);
      svFetchFifaLive(true);
      svFetchFifaNews(true);
    }
  }

  function svStartFifaLiveSection(){
    heroMovies = [];
    svEnsureFifaLiveSection();
    if(!svFifaLiveState.started){
      svFifaLiveState.started = true;
      document.addEventListener('visibilitychange', svHandleFifaVisibility);
    }
    if(!svFifaLiveState.payload){
      const cached = svFifaReadEarlyPayload() || svFifaReadCachedPayload();
      if(cached)svFifaLiveState.payload = cached;
    }
    if(svFifaLiveState.payload){
      svRenderFifaLive(svFifaLiveState.payload);
      svFetchFifaLive(true);
    }else{
      svFetchFifaLive(false);
    }
    return true;
  }

  window.svStartFifaLiveSection = svStartFifaLiveSection;

  function svRenderHeroCards(items){
    const cardsEl = document.getElementById('heroCards');
    if(!cardsEl)return false;
    heroMovies = svExclusiveHeroDedup(items).slice(0, SV_EXCLUSIVE_HERO_LIMIT);
    if(heroMovies.length < 50){
      heroMovies = svExclusiveHeroDedup([...heroMovies, ...svFallbackHeroItems()]).slice(0, SV_EXCLUSIVE_HERO_LIMIT);
    }
    if(!heroMovies.length)return false;
    cardsEl.innerHTML = '';
    cardsEl.classList.add('sv-exclusive-hero-track');
    const renderFeatured = (item,i)=>{
      const next = {...item, _priorityImage:i < 10, _immediateImage:i < 12};
      const isSeries = next._isSeries || next.type === 'tv' || next.type === 'series' || next.isSummary || next.seasons;
      const html = isSeries ? sCardHTML(next) : cardHTML(next);
      return html.replace('class="card"', 'class="card featured-card"');
    };
    if(typeof svRenderVirtualTrackElement === 'function'){
      svRenderVirtualTrackElement(cardsEl, heroMovies, renderFeatured, {
        rowId:'hero',
        limit:SV_EXCLUSIVE_HERO_LIMIT,
        initial:window.innerWidth < 760 ? 8 : 12,
        batch:window.innerWidth < 760 ? 6 : 8,
        buffer:window.innerWidth < 760 ? 3 : 5
      });
    }else{
      cardsEl.insertAdjacentHTML('beforeend', heroMovies.map(renderFeatured).join(''));
    }
    if(typeof svQueuePosterImages === 'function')svQueuePosterImages(cardsEl);
    if(typeof svPrefetchPosterUrls === 'function')svPrefetchPosterUrls(heroMovies.slice(0,12).map(item=>item.poster || item.backdrop));
    return true;
  }

  function svRenderHeroFromFeed(data){
    return svStartFifaLiveSection();
  }

  buildHero = function(){
    svStartFifaLiveSection();
  };

  buildRows = function(){
    svApplyHomeOrder();
    const hasRenderedRows = SV_PERF_HOME_MAIN.some(meta=>document.getElementById(meta.trackId)?.querySelector('.card,.live-ch-card'));
    svResetHomeClaims();
    if(hasRenderedRows){
      svRenderPersonalRows();
      svLoadHomeSections().catch(err=>{
        console.warn('[Homepage] section API unavailable, keeping rendered rows:', err.message);
      });
      return;
    }
    _rowSeen = new Map();
    SV_PERF_HOME_MAIN.forEach(meta=>hide(meta.rowId));
    SV_PERF_HOME_MAIN.slice(0, svWeakDevice ? 2 : 4).forEach((meta, idx)=>{
      const row = svEnsureHomeRow(meta.rowId);
      if(row){
        svSkeletonTrack(document.getElementById(meta.trackId));
        row.classList.add('sv-row-pending');
        show(meta.rowId);
      }
    });
    svLoadHomeSections().catch(err=>{
      console.warn('[Homepage] section API unavailable, using legacy rows:', err.message);
      svLegacyBuildRows?.();
    });
  };

  svRenderOnlineSections = function(rows){
    if(!rows || typeof rows !== 'object')return;
    svOnlineRowsCache = {...(svOnlineRowsCache || {}), ...rows};
    Object.entries(rows).forEach(([rowId, list])=>{
      const meta = SV_PERF_HOME_BY_ID[rowId];
      const row = document.getElementById(rowId);
      if(!meta || !row || !Array.isArray(list) || !list.length)return;
      const normalized = svDedupItems(list.map(svNormalizeOnlineItem).filter(Boolean)).slice(0,50);
      if(!normalized.length)return;
      const track = document.getElementById(meta.trackId);
      if(row._svLoaded && track?.querySelector('.card,.live-ch-card')){
        svRenderLazyTrack(meta.trackId,rowId,normalized,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit:50});
        row._svItems = track._svItems || row._svItems || normalized;
        row.classList.remove('sv-row-pending');
        row.classList.add('sv-row-loaded');
        return;
      }
      row._svItems = normalized;
      svRenderLazyTrack(meta.trackId,rowId,normalized,item=>item._isSeries?sCardHTML(item):cardHTML(item),{limit:50});
      row._svLoaded = !!track?.querySelector('.card,.live-ch-card');
      row.classList.remove('sv-row-pending');
      row.classList.add('sv-row-loaded');
    });
  };

  function svEnsureSectionPage(){
    let page = document.getElementById('sectionSection');
    if(page)return page;
    page = document.createElement('div');
    page.id = 'sectionSection';
    page.className = 'section-page';
    page.innerHTML = `
      <div class="section-page-header">
        <button class="perf-back-btn" type="button" onclick="goHome()">Back</button>
        <div class="section-page-title" id="sectionTitle"></div>
      </div>
      <div class="section-grid" id="sectionGrid"></div>
      <div class="section-load-more" id="sectionLoadWrap" style="display:none">
        <button class="perf-load-btn" type="button" onclick="svLoadMoreSection()">Load More</button>
      </div>
    `;
    document.body.insertBefore(page, document.getElementById('movieDetailModal'));
    return page;
  }

  window.svRenderGridProgressive = function(grid, items, renderer, pageSize=48){
    if(!grid)return;
    grid._svItems = items || [];
    grid._svRenderer = renderer;
    grid._svPageSize = pageSize;
    grid._svRendered = 0;
    grid.innerHTML = '';
    svAppendGridItems(grid);
  };

  window.svAppendGridItems = function(grid){
    if(!grid || !grid._svItems)return;
    const from = grid._svRendered || 0;
    const to = Math.min(grid._svItems.length, from + (grid._svPageSize || 48));
    if(from === 0)grid.innerHTML = '';
    grid.insertAdjacentHTML('beforeend', grid._svItems.slice(from,to).map(grid._svRenderer).join(''));
    grid._svRendered = to;
    if(typeof svQueuePosterImages === 'function')svQueuePosterImages(grid);
  };

  window.openHomeSection = function(rowId){
    const meta = SV_PERF_HOME_BY_ID[rowId];
    if(!meta)return;
    closeSearchOverlay(true);
    const page = svEnsureSectionPage();
    ['mainSection','hero','discoverIntro','moviesSection','seriesSection','liveSection','searchSection','librarySection','downloadsSection','mobileMp4Section'].forEach(id=>{
      const el = document.getElementById(id);
      if(el)el.style.display = 'none';
    });
    page.classList.add('open');
    document.getElementById('sectionTitle').textContent = meta.title;
    const grid = document.getElementById('sectionGrid');
    grid.innerHTML = '<div class="sv-skeleton-card"></div><div class="sv-skeleton-card"></div><div class="sv-skeleton-card"></div>';
    svSectionState = { key:meta.sectionKey, page:0, pages:1, items:[], rowId };
    fetch(`/api/section/${encodeURIComponent(meta.sectionKey)}?page=0&limit=60&summary=1`)
      .then(r=>r.json())
      .then(data=>{
        svSectionState.page = data.page || 0;
        svSectionState.pages = data.pages || 1;
        svSectionState.items = data.items || [];
        svRenderGridProgressive(grid, svSectionState.items, svHomeRenderer, 60);
        document.getElementById('sectionLoadWrap').style.display = svSectionState.page + 1 < svSectionState.pages ? 'flex' : 'none';
      })
      .catch(()=>{ grid.innerHTML = '<div class="empty"><h2>Could not load this section</h2></div>'; });
    window.scrollTo({top:0,behavior:'smooth'});
  };

  window.svLoadMoreSection = function(){
    const nextPage = (svSectionState.page || 0) + 1;
    if(nextPage >= svSectionState.pages)return;
    fetch(`/api/section/${encodeURIComponent(svSectionState.key)}?page=${nextPage}&limit=60&summary=1`)
      .then(r=>r.json())
      .then(data=>{
        svSectionState.page = data.page || nextPage;
        const grid = document.getElementById('sectionGrid');
        const items = data.items || [];
        grid.insertAdjacentHTML('beforeend', items.map(svHomeRenderer).join(''));
        if(typeof svQueuePosterImages === 'function')svQueuePosterImages(grid);
        document.getElementById('sectionLoadWrap').style.display = svSectionState.page + 1 < (data.pages || svSectionState.pages) ? 'flex' : 'none';
      });
  };

  function svFindLiveSportsCategory(){
    let list = [];
    try{
      if(typeof channels !== 'undefined' && Array.isArray(channels))list = channels;
    }catch(_){}
    const categories = Array.from(new Set(list.map(ch=>svFifaCleanText(ch?.category)).filter(Boolean)));
    return categories.find(cat=>/^sports?$/i.test(cat)) || categories.find(cat=>/sports?/i.test(cat)) || '';
  }

  function svHighlightLiveSportsChannel(){
    let sportsIndex = -1;
    try{
      if(typeof channels !== 'undefined' && Array.isArray(channels)){
        sportsIndex = channels.findIndex(ch=>/sports?|t\s*sports|star sports|sony sports/i.test(`${ch?.category || ''} ${ch?.name || ''}`));
      }
    }catch(_){}
    const cards = Array.from(document.querySelectorAll('#liveGrid .channel-card'));
    const target = sportsIndex >= 0 ? cards[sportsIndex] : cards.find(card=>/sports?|t\s*sports|star sports|sony sports/i.test(card.getAttribute('aria-label') || card.textContent || ''));
    if(!target)return false;
    target.classList.add('sv-live-match-target');
    target.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' });
    setTimeout(()=>target.classList.remove('sv-live-match-target'), 1800);
    return true;
  }

  function svEnsureLiveMatchChannels(){
    try{
      if(Array.isArray(channels) && channels.length)return Promise.resolve(channels);
    }catch(_){}
    if(svLiveMatchChannelsPromise)return svLiveMatchChannelsPromise;
    svLiveMatchChannelsPromise = fetch('/api/channels', { cache:'no-store' })
      .then(response=>response.ok ? response.json() : Promise.reject(new Error('channels unavailable')))
      .then(list=>{
        try{ channels = Array.isArray(list) ? list : []; }catch(_){}
        if(typeof buildLiveTV === 'function')buildLiveTV();
        if(typeof buildLiveHomeRow === 'function')buildLiveHomeRow();
        return Array.isArray(list) ? list : [];
      })
      .finally(()=>{ svLiveMatchChannelsPromise = null; });
    return svLiveMatchChannelsPromise;
  }

  function svFindLiveMatchChannel(list){
    const items = Array.isArray(list) ? list : [];
    return items.find(ch=>String(ch?.id || '').toLowerCase() === SV_LIVE_MATCH_CHANNEL_ID)
      || items.find(ch=>/t\s*sports/i.test(String(ch?.name || '')));
  }

  function openLiveMatchChannel(event){
    if(event)event.preventDefault();
    svEnsureLiveMatchChannels()
      .then(list=>{
        const channel = svFindLiveMatchChannel(list);
        if(!channel)throw new Error('T Sports channel unavailable');
        if(typeof openLiveChannel !== 'function')throw new Error('Live player is still loading');
        openLiveChannel(channel.id || SV_LIVE_MATCH_CHANNEL_ID, channel.name || 'T Sports');
      })
      .catch(err=>{
        if(typeof showToast === 'function')showToast(err?.message || 'Could not start live match');
      });
  }

  function svInstallLiveMatchNav(){
    const nav = document.querySelector('.nav-links');
    const navRight = document.querySelector('.nav-right');
    const liveTvBtn = document.getElementById('livetvNavBtn');
    if(!nav || !navRight || !liveTvBtn)return;
    const link = document.getElementById('liveMatchNavBtn') || Array.from(nav.querySelectorAll('a')).find(el=>/continue watching/i.test(el.textContent || '') || /continueRow/.test(el.getAttribute('onclick') || ''));
    if(!link)return;
    link.id = 'liveMatchNavBtn';
    link.classList.add('live-match-nav-pill');
    link.textContent = 'LIVE MATCH';
    link.setAttribute('href', '#');
    link.setAttribute('role', 'button');
    link.setAttribute('aria-label','Play T Sports live match in StreamVault');
    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.removeAttribute('onclick');
    link.removeEventListener('click', openLiveMatchChannel);
    link.dataset.svLiveMatchNav = 'internal';
    link.addEventListener('click', openLiveMatchChannel);
    if(link.parentElement !== navRight || liveTvBtn.nextElementSibling !== link){
      navRight.insertBefore(link, liveTvBtn.nextElementSibling);
    }
  }

  window.openLiveMatchChannel = openLiveMatchChannel;
  window.svOpenLiveMatchNav = openLiveMatchChannel;
  svInstallLiveMatchNav();
  document.addEventListener('DOMContentLoaded', svInstallLiveMatchNav, { once:true });

  if(!window._svSwitchWrapped){
    window._svSwitchWrapped = true;
    const svOriginalSwitchTab = switchTab;
    switchTab = function(tab){
      const section = document.getElementById('sectionSection');
      if(section)section.classList.remove('open');
      svOriginalSwitchTab(tab);
      svTrimInactivePages(tab);
    };
  }

  function svTrimInactivePages(tab){
    const idle = window.requestIdleCallback || (fn=>setTimeout(fn,160));
    idle(()=>{
      if(tab !== 'search'){
        const s = document.getElementById('searchGrid');
        const ms = document.getElementById('mobileSearchGrid');
        if(s)s.innerHTML = '';
        if(ms && !document.getElementById('searchOverlay')?.classList.contains('open'))ms.innerHTML = '';
      }
      if(tab !== 'live')document.getElementById('liveGrid')?.replaceChildren();
      if(tab !== 'movies-browse')document.getElementById('moviesGrid')?.replaceChildren();
      if(tab !== 'series')document.getElementById('seriesGrid')?.replaceChildren();
      if(tab !== 'library')document.getElementById('libraryGroups')?.replaceChildren();
      if(tab !== 'downloads')document.getElementById('downloadsGrid')?.replaceChildren();
      if(tab !== 'mobile-mp4')document.getElementById('mobileMp4Grid')?.replaceChildren();
    });
  }
})();
