(function(){
  'use strict';

  const VERSION='20260817-search-readiness-bypass-v3';
  const previousHandle=window.handleSearch;
  const previousRenderSearchPage=window.renderSearchPage;
  let timer=0;
  let controller=null;
  let seq=0;

  try{
    const layoutStyle=document.createElement('style');
    layoutStyle.id='sv-home-nav-spacing-fix';
    layoutStyle.textContent='#mainSection{padding-top:calc(var(--nav-h) + 28px) !important;}';
    document.head.appendChild(layoutStyle);
  }catch(_){ }

  function isSeries(item){
    return !!(item && (item._isSeries || item.type==='series' || item.type==='tv' || item.seasons));
  }

  function syncInputs(value){
    for(const id of ['searchInputDesktop','searchInputMobile']){
      const el=document.getElementById(id);
      if(el && el.value!==value)el.value=value;
    }
  }

  function showDesktopSearch(){
    try{currentTab='search';}catch(_){ }
    for(const id of ['mainSection','hero','discoverIntro','seriesSection','moviesSection','librarySection','downloadsSection','liveSection','mobileMp4Section']){
      const el=document.getElementById(id);
      if(el)el.style.display='none';
    }
    const section=document.getElementById('searchSection');
    if(section)section.style.display='block';
  }

  function targetNodes(){
    const mobile=!!document.getElementById('searchOverlay')?.classList.contains('open');
    return {
      mobile,
      grid:document.getElementById(mobile?'mobileSearchGrid':'searchGrid'),
      label:document.getElementById(mobile?'mobileSearchLabel':'searchLabel')
    };
  }

  function displayable(item){
    if(!item)return false;
    if(item.streamUrl || item.hasStream===true || item.streamAvailable===true || item.isMassiveCatalog || item.isFtp)return true;
    try{return typeof isPlayableMediaItem!=='function' || isPlayableMediaItem(item);}catch(_){return true;}
  }

  function norm(value){
    return String(value||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function rank(item,q){
    const query=norm(q);
    const title=norm(item?.name||item?.title||item?.file||'');
    const file=norm(item?.file||'');
    const year=norm(item?.year||'');
    const full=norm(`${title} ${file} ${year}`);
    if(norm(`${title} ${year}`)===query)return 100000;
    if(title===query)return 95000;
    if(title.startsWith(query))return 90000;
    if(file.includes(query))return 85000;
    const terms=query.split(' ').filter(Boolean);
    return terms.length&&terms.every(t=>full.includes(t))?80000+terms.length*100:0;
  }

  function render(items,query){
    const {grid,label}=targetNodes();
    if(!grid)return;
    const visible=(Array.isArray(items)?items:[])
      .filter(displayable)
      .sort((a,b)=>rank(b,query)-rank(a,query));

    if(!visible.length){
      grid.innerHTML='<div class="empty"><h2>Nothing found</h2><p>Try another spelling or fewer words.</p></div>';
      if(label)label.textContent=`No results for "${query}"`;
      return;
    }

    const html=visible.map(item=>{
      try{return isSeries(item)?sCardHTML(item):cardHTML(item);}catch(err){console.warn('[Search V3] card render failed',err);return '';}
    }).join('');

    if(!html){
      grid.innerHTML='<div class="empty"><h2>Result found but card rendering failed</h2></div>';
      if(label)label.textContent=`${visible.length} raw result${visible.length===1?'':'s'} for "${query}"`;
      return;
    }

    grid.innerHTML=html;
    if(label)label.textContent=`${visible.length.toLocaleString()} result${visible.length===1?'':'s'} for "${query}"`;
    try{if(typeof svQueuePosterImages==='function')svQueuePosterImages(grid);}catch(_){ }
  }

  async function request(query){
    const my=++seq;
    try{controller?.abort();}catch(_){ }
    controller=new AbortController();
    const {label}=targetNodes();
    if(label)label.textContent=`Searching for "${query}"`;

    const params=new URLSearchParams({
      q:query,
      kind:'mixed',
      page:'1',
      limit:'100',
      massive:'1',
      background:'1',
      v:VERSION,
      _:String(Date.now())
    });

    try{
      const response=await fetch(`/api/search?${params.toString()}`,{
        method:'GET',
        cache:'default',
        headers:{Accept:'application/json'},
        signal:controller.signal
      });
      if(my!==seq)return;
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(my!==seq)return;
      render(Array.isArray(data?.items)?data.items:[],query);
    }catch(error){
      if(error?.name==='AbortError' || my!==seq)return;
      console.error('[Search V3] request failed',error);
      render([],query);
    }
  }

  function run(value){
    const query=String(value||'');
    syncInputs(query);
    clearTimeout(timer);
    try{controller?.abort();}catch(_){ }
    seq++;

    if(!query.trim()){
      try{previousHandle?.('');}catch(_){ }
      return;
    }

    if(!document.getElementById('searchOverlay')?.classList.contains('open'))showDesktopSearch();
    timer=setTimeout(()=>request(query.trim()),80);
  }

  document.addEventListener('input',event=>{
    const id=event.target?.id;
    if(id!=='searchInputDesktop' && id!=='searchInputMobile')return;
    event.stopImmediatePropagation();
    event.stopPropagation();
    run(event.target.value);
  },true);

  window.handleSearch=run;
  window.renderSearchPage=function(q=''){
    const value=String(q||'');
    if(!value.trim()){
      try{return previousRenderSearchPage?.('');}catch(_){return;}
    }
    syncInputs(value);
    showDesktopSearch();
    request(value.trim());
  };

  window.__SV_SEARCH_READINESS_BYPASS_V3=true;
  window.__SV_FULL_CATALOG_SEARCH_VERSION=VERSION;
})();

/* SV_EMERGENCY_PLAYBACK_RECOVERY_20260818 */
(function(){
  'use strict';
  if(window.__SV_EMERGENCY_PLAYBACK_RECOVERY_20260818)return;
  window.__SV_EMERGENCY_PLAYBACK_RECOVERY_20260818=true;

  const previousHydrate=window.hydrateMoviePlayback;

  window.hydrateMoviePlayback=async function emergencyHydrateMoviePlayback(movie){
    if(!movie || movie.streamUrl)return movie;

    const title=String(movie.name||movie.title||movie.file||'').trim();
    const year=String(movie.year||'').match(/(?:19|20)\d{2}/)?.[0]||'';
    const identity=String(movie.id??title).trim();

    if(identity){
      try{
        const params=new URLSearchParams();
        if(title)params.set('title',title);
        if(year)params.set('year',year);
        params.set('_',String(Date.now()));

        const backendOrigin=String(window.STREAMVAULT_CONFIG?.backendOrigin||window.API_BASE||'').replace(/\/$/,'');
        const playbackUrl=`${backendOrigin}/api/playback/movie/${encodeURIComponent(identity)}?${params.toString()}`;
        const response=await fetch(playbackUrl,{
          method:'GET',
          cache:'no-store',
          headers:{Accept:'application/json'}
        });

        if(response.ok){
          const raw=await response.json();
          const data=window.StreamVaultConfig?.normalizeBackendUrls?.(raw)??raw;
          if(data?.ok && data?.streamUrl){
            movie.streamUrl=data.streamUrl;
            movie.isFtp=data.isFtp!==false;
            movie.streamAvailable=true;
            movie.hasStream=true;
            if(data.id!=null && !movie.id)movie.id=data.id;
            return movie;
          }
        }
      }catch(error){
        console.warn('[Emergency Playback Recovery] resolver failed',error?.message||error);
      }
    }

    if(typeof previousHydrate==='function'){
      try{return await previousHydrate(movie);}catch(_){ }
    }
    return movie;
  };
})();
