(function(){
  function svStableKey(prefix, item){
    const raw = [
      item && (item.tmdbId || item.id || item.streamUrl || item.name || item.title || item.file),
      item && (item.type || (item.seasons ? 'series' : 'movie'))
    ].filter(Boolean).join('|');
    let hash = 2166136261;
    for(let i=0;i<raw.length;i++){
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(36)}`;
  }

  registerMovieForDetail = function(movie){
    const key = svStableKey('md', movie || {});
    _movieDetailRegistry.set(key, movie);
    return key;
  };

  registerSeriesForDetail = function(show){
    const key = svStableKey('sd', show || {});
    _seriesDetailRegistry.set(key, show);
    return key;
  };

  window._svEagerImageBudget = Number.isFinite(window._svEagerImageBudget)
    ? window._svEagerImageBudget
    : ((window._svWeakDevice || innerWidth < 760) ? 5 : 8);

  svConsumeImageAttrs = function(priority=false, immediate=false){
    const eager = priority || immediate || window._svEagerImageBudget-- > 0;
    const fetchPriority = priority ? 'high' : (eager ? 'auto' : 'low');
    return eager
      ? `loading="eager" fetchpriority="${fetchPriority}" decoding="async" onload="this.dataset.svLoaded='1';this.classList.add('poster-loaded','is-loaded')"`
      : 'loading="lazy" fetchpriority="low" decoding="async"';
  };

  svOptimizeImageUrl = function(src='', wide=false){
    const url = String(src || '');
    if(!url.includes('image.tmdb.org/t/p/'))return url;
    const width = wide ? 780 : ((window._svWeakDevice || innerWidth < 760) ? 185 : 342);
    const size = `w${width}`;
    const normalized = url.replace(/\/t\/p\/(?:original|w\d+)\//, `/t/p/${size}/`);
    return `/poster-cache?url=${encodeURIComponent(normalized)}&w=${width}`;
  };

  svMediaArt = function(item, wide=false){
    if(!item)return '';
    return svOptimizeImageUrl(wide ? (item.backdrop || item.poster || '') : (item.poster || item.backdrop || ''), wide);
  };

  function svImg(src, alt, attrs, extraClass='', width=342, height=513){
    const loaded = !!window.svPosterLoadedCache?.has(src);
    const eager = /loading="eager"/.test(attrs || '') || /fetchpriority="high"/.test(attrs || '');
    const cls = [extraClass, loaded ? 'poster-loaded is-loaded' : ''].filter(Boolean).join(' ');
    const srcAttr = loaded || eager ? `src="${esc(src)}"` : '';
    const loadedAttr = loaded ? 'data-sv-loaded="1"' : '';
    const priority = /fetchpriority="high"/.test(attrs || '') ? 'high' : (eager ? 'auto' : 'low');
    return `<img class="${cls}" ${srcAttr} data-sv-src="${esc(src)}" data-sv-priority="${priority}" ${loadedAttr} alt="${esc(alt || '')}" ${attrs} width="${width}" height="${height}">`;
  }

  sCardHTML = function(s){
    const seasons = s?.seasons || {};
    const sc = s?.seasonCount ?? Object.keys(seasons).length;
    const ep = s?.episodeCount ?? Object.values(seasons).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0);
    const src = svMediaArt(s,false);
    const img = src
      ? svImg(src, s?.name || '', svConsumeImageAttrs(!!s?._priorityImage, !!s?._immediateImage))
      : `<div class="card-placeholder"><div class="icon">${svPlaceholderIcon('series')}</div><div class="pname">${esc(s?.name || '')}</div></div>`;
    const detailKey = registerSeriesForDetail(s);
    return `<div class="card" role="button" tabindex="0" onclick="openSeriesDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSeriesDetail('${detailKey}')}">${img}<div class="series-badge">SERIES</div><div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(s?.name || '')}</div><div class="card-meta">${s?.rating?`<span class="card-rating">&#9733; ${esc(s.rating)}</span>`:''}<span>${sc}S &middot; ${ep}Ep</span></div></div></div>`;
  };

  cardHTML = function(m, sp=false){
    const wide = !!m?._wideStudio;
    const src = svMediaArt(m, wide);
    const img = src
      ? svImg(src, m?.name || '', svConsumeImageAttrs(!!m?._priorityImage, !!m?._immediateImage || wide), wide ? 'studio-wide-img' : '', wide ? 640 : 342, wide ? 360 : 513)
      : `<div class="card-placeholder"><div class="icon">${svPlaceholderIcon('movie')}</div><div class="pname">${esc(m?.name || '')}</div></div>`;
    const prog = watchProgress[m?.id];
    const bar = sp && prog ? `<div class="card-progress"><div class="card-progress-fill" style="width:${Math.round(prog.progress*100)}%"></div></div>` : '';
    const isUnplayable = isMovieUnavailable(m);
    const detailKey = registerMovieForDetail(m);
    const unavailableOverlay = isUnplayable ? `<div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 8px;font-size:.52rem;font-weight:800;color:rgba(255,255,255,.72);z-index:8">LIBRARY ONLY</div>` : '';
    return `<div class="card${wide?' studio-wide-card':''}" role="button" tabindex="0" onclick="openMovieDetail('${detailKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMovieDetail('${detailKey}')}">${img}${unavailableOverlay}<div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div><div class="card-overlay"><div class="card-title">${esc(m?.name || '')}</div><div class="card-meta">${m?.rating?`<span class="card-rating">&#9733; ${esc(m.rating)}</span>`:''} ${m?.year?`<span>${esc(m.year)}</span>`:''}</div></div>${bar}</div>`;
  };

  const svOriginalOpenSeriesDetail = openSeriesDetail;
  openSeriesDetail = async function(key){
    const show = _seriesDetailRegistry.get(key);
    if(!show)return svOriginalOpenSeriesDetail?.(key);
    const hasEpisodes = Object.values(show.seasons || {}).some(eps=>Array.isArray(eps) && eps.length);
    if(!show.isSummary && hasEpisodes){
      showSeriesDetail(show);
      return;
    }
    try{
      showToast('Loading episodes...');
      const params = new URLSearchParams();
      params.set('name', show.name || '');
      if(show.id != null)params.set('id', show.id);
      if(show.year)params.set('year', show.year);
      const r = await fetch(`/api/series/detail?${params.toString()}`);
      if(r.ok){
        const full = await r.json();
        if(full && full.name){
          _seriesDetailRegistry.set(key, full);
          const idx = series.findIndex(s=>String(s.name||'') === String(full.name||''));
          if(idx >= 0)series[idx] = full;
          else series.push(full);
          showSeriesDetail(full);
          return;
        }
      }
    }catch(e){
      console.warn('[Series] detail load failed:', e.message);
    }
    showSeriesDetail(show);
  };

  const svOriginalCloseMovieDetail = closeMovieDetail;
  closeMovieDetail = function(){
    svOriginalCloseMovieDetail();
    ['mdBackdrop','mdPoster'].forEach(id=>document.getElementById(id)?.removeAttribute('src'));
    ['mdSimilarTrack'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.innerHTML='';
    });
  };

  const svOriginalCloseSeriesModal = closeSeriesModal;
  closeSeriesModal = function(){
    svOriginalCloseSeriesModal();
    ['smBackdrop','smPoster'].forEach(id=>document.getElementById(id)?.removeAttribute('src'));
    ['epList','smSimilarTrack'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.innerHTML='';
    });
  };

  renderMediaCards = function(id, items){
    const el = document.getElementById(id);
    if(!el)return;
    const limit = window.innerWidth < 760 ? 8 : 16;
    const visibleItems = Array.isArray(items) ? items.slice(0, limit) : [];
    if(!visibleItems.length){
      el.innerHTML = noDataHTML();
      return;
    }
    const render = item => (item.type === 'tv' || item.seasons) ? sCardHTML(item) : cardHTML(item);
    el.innerHTML = visibleItems.map(render).join('');
  };
})();
