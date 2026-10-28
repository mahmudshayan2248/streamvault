/* StreamVault Search Authority v3
 * Single browser search controller with backend authority + endpoint fallback.
 */
(function(){
  'use strict';
  if(window.__SV_SEARCH_AUTHORITY_V3)return;
  window.__SV_SEARCH_AUTHORITY_V3=true;

  const VERSION='20261028-search-timeout-v4';
  const DESKTOP_LIMIT=72;
  const MOBILE_LIMIT=36;
  const DEBOUNCE_MS=100;
  const CACHE_MS=90000;
  const SEARCH_IDS=new Set(['searchInputDesktop','searchInputMobile']);
  const cache=new Map();

  let timer=0;
  let controller=null;
  let sequence=0;
  let activeQuery='';
  let activePage=0;
  let activePages=0;
  let activeMobile=false;
  let loading=false;

  function isSeries(item){return !!(item&&(item._isSeries||item.type==='series'||item.type==='tv'||item.type==='show'||item.seasons));}
  function normalizeItem(item){
    if(!item||typeof item!=='object')return item;
    try{return window.StreamVaultConfig?.normalizeBackendUrls?.(item)??item;}catch(_){return item;}
  }
  function inputs(){return [...SEARCH_IDS].map(id=>document.getElementById(id)).filter(Boolean);}
  function syncInputs(value,source=null){
    for(const input of inputs())if(input!==source&&input.value!==value)input.value=value;
    for(const input of inputs()){
      const wrap=input.closest('.search-box,.search-overlay-box');
      const has=!!String(input.value||'').trim();
      wrap?.classList.toggle('has-query',has);
      const clear=wrap?.querySelector('.search-clear-btn');
      if(clear){clear.setAttribute('aria-hidden',has?'false':'true');clear.tabIndex=has?0:-1;}
    }
  }
  function mobileTarget(source=null){return source?.id==='searchInputMobile'||!!document.getElementById('searchOverlay')?.classList.contains('open');}
  function target(mobile=activeMobile){return {grid:document.getElementById(mobile?'mobileSearchGrid':'searchGrid'),label:document.getElementById(mobile?'mobileSearchLabel':'searchLabel')};}
  function showSearchView(){
    try{currentTab='search';}catch(_){}
    for(const id of ['mainSection','hero','discoverIntro','seriesSection','moviesSection','librarySection','downloadsSection','liveSection','mobileMp4Section']){
      const el=document.getElementById(id);if(el)el.style.display='none';
    }
    document.getElementById('sectionSection')?.classList.remove('open');
    const search=document.getElementById('searchSection');if(search)search.style.display='block';
    for(const id of ['bnDiscover','bnShows','bnMovies','bnLibrary','bnDownloads','bnSearch'])document.getElementById(id)?.classList.remove('active');
    document.getElementById('bnSearch')?.classList.add('active');
    document.getElementById('downloadNavBtn')?.classList.remove('active');
  }
  function cardHtml(item){
    try{return isSeries(item)?sCardHTML(item):cardHTML(item);}catch(error){console.warn('[Search Authority v3] card render failed',error);return '';}
  }
  function dedupe(items){
    const out=[];const seen=new Set();
    for(const raw of Array.isArray(items)?items:[]){
      const item=normalizeItem(raw);if(!item)continue;
      const kind=isSeries(item)?'s':'m';
      const title=String(item.name||item.title||'').toLowerCase().replace(/\s+/g,' ').trim();
      const year=String(item.year||'');
      const identity=String(item.streamUrl||item.id||'').toLowerCase();
      const key=`${kind}|${identity}|${title}|${year}`;
      if(seen.has(key))continue;seen.add(key);out.push(item);
    }
    return out;
  }
  function renderItems(items,query,append=false,mobile=activeMobile,total=null){
    const {grid,label}=target(mobile);if(!grid)return;
    const list=dedupe(items);
    const html=list.map(cardHtml).join('');
    if(!append)grid.innerHTML=html;else grid.insertAdjacentHTML('beforeend',html);
    const shownTotal=Number.isFinite(Number(total))?Number(total):Number(window.__SV_SEARCH_LAST_TOTAL||list.length);
    if(label)label.textContent=`${shownTotal.toLocaleString()} result${shownTotal===1?'':'s'} for “${query}”`;
    try{if(typeof svQueuePosterImages==='function')svQueuePosterImages(grid);}catch(_){}
  }
  function renderEmpty(query,mobile=activeMobile){
    const {grid,label}=target(mobile);if(!grid)return;
    grid.innerHTML='<div class="empty"><h2>Nothing found</h2><p>Try another spelling or fewer words.</p></div>';
    if(label)label.textContent=`No results for “${query}”`;
  }
  function renderError(query,mobile=activeMobile){
    const {grid,label}=target(mobile);if(!grid)return;
    grid.innerHTML='<div class="empty"><h2>Search temporarily unavailable</h2><p>StreamVault will retry automatically.</p></div>';
    if(label)label.textContent=`Could not complete search for “${query}”`;
  }
  function cacheKey(query,page,limit){return `${query.toLowerCase()}|${page}|${limit}`;}

  async function fetchJson(path,signal,timeout=9000){
    const request=new AbortController();
    let timedOut=false;
    const cancel=()=>request.abort(signal?.reason);
    if(signal?.aborted)cancel();
    else signal?.addEventListener?.('abort',cancel,{once:true});
    const timer=setTimeout(()=>{timedOut=true;request.abort();},timeout);
    try{
      const response=await fetch(path,{cache:'no-store',signal:request.signal,headers:{Accept:'application/json'}});
      if(!response?.ok)throw new Error(`HTTP ${response?.status||0}`);
      return normalizeItem(await response.json());
    }catch(error){
      if(timedOut)throw new Error(`Search request timed out after ${timeout} ms`);
      throw error;
    }finally{
      clearTimeout(timer);
      signal?.removeEventListener?.('abort',cancel);
    }
  }
  async function savedCatalogPage(query,limit,signal){
    const data=await fetchJson('/boot-search-index.json',signal,5000);
    const terms=String(query).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
    const matches=(Array.isArray(data?.items)?data.items:[]).filter(item=>{
      const title=String(item?.name||item?.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ');
      return terms.every(term=>title.includes(term));
    });
    return {items:matches.slice(0,limit),total:matches.length};
  }
  function listFrom(payload,keys){
    if(Array.isArray(payload))return payload;
    for(const key of keys)if(Array.isArray(payload?.[key]))return payload[key];
    return [];
  }

  async function fetchPage(query,page,mobile,signal){
    const limit=mobile?MOBILE_LIMIT:DESKTOP_LIMIT;
    const key=cacheKey(query,page,limit);
    const hit=cache.get(key);
    if(hit&&Date.now()-hit.at<CACHE_MS)return hit.data;

    const searchParams=new URLSearchParams({q:query,kind:'mixed',page:String(page),limit:String(limit),massive:'1',authority:'3'});
    try{
      const data=await fetchJson(`/api/search?${searchParams.toString()}`,signal,10000);
      const items=listFrom(data,['items','results']);
      const normalized={items,total:Number(data?.total)||items.length,page:Number.isFinite(Number(data?.page))?Number(data.page):page,pages:Number(data?.pages)||((items.length===limit)?page+2:page+1)};
      cache.set(key,{at:Date.now(),data:normalized});
      return normalized;
    }catch(primaryError){
      if(primaryError?.name==='AbortError')throw primaryError;
      const common={q:query,page:String(page),limit:String(limit),massive:'1'};
      const movieParams=new URLSearchParams(common);
      const seriesParams=new URLSearchParams(common);
      const [moviesResult,seriesResult]=await Promise.allSettled([
        fetchJson(`/api/movies?${movieParams.toString()}`,signal,10000),
        fetchJson(`/api/series?${seriesParams.toString()}`,signal,10000)
      ]);
      if(moviesResult.status==='rejected'&&seriesResult.status==='rejected')throw primaryError;
      const movies=moviesResult.status==='fulfilled'?listFrom(moviesResult.value,['movies','items','results']):[];
      const shows=seriesResult.status==='fulfilled'?listFrom(seriesResult.value,['series','items','results']):[];
      const items=dedupe([...movies,...shows]);
      const total=(moviesResult.status==='fulfilled'?Number(moviesResult.value?.total)||movies.length:0)+(seriesResult.status==='fulfilled'?Number(seriesResult.value?.total)||shows.length:0);
      const pages=Math.max(Number(moviesResult.value?.pages)||0,Number(seriesResult.value?.pages)||0,page+1);
      const normalized={items,total,page,pages};
      cache.set(key,{at:Date.now(),data:normalized});
      return normalized;
    }finally{
      if(cache.size>100)cache.delete(cache.keys().next().value);
    }
  }

  async function execute(query,page=0,mobile=activeMobile,append=false){
    const my=++sequence;
    try{controller?.abort();}catch(_){}
    controller=new AbortController();
    loading=true;
    const {label}=target(mobile);if(label&&!append)label.textContent=`Searching everywhere for “${query}”…`;
    let liveDone=false;
    let previewShown=false;
    const preview=page===0?savedCatalogPage(query,mobile?MOBILE_LIMIT:DESKTOP_LIMIT,controller.signal)
      .then(data=>{
        if(liveDone||my!==sequence||query!==activeQuery||!data.items.length)return;
        previewShown=true;
        renderItems(data.items,query,false,mobile,data.total);
        const {label}=target(mobile);
        if(label)label.textContent=`Saved catalog results for “${query}” · checking live search…`;
      }).catch(()=>{}):Promise.resolve();
    try{
      const data=await fetchPage(query,page,mobile,controller.signal);
      liveDone=true;
      if(my!==sequence||query!==activeQuery)return;
      const items=Array.isArray(data?.items)?data.items:[];
      activePage=Number.isFinite(Number(data?.page))?Number(data.page):page;
      activePages=Number(data?.pages)||0;
      window.__SV_SEARCH_LAST_TOTAL=Number(data?.total)||items.length;
      window.__SV_SEARCH_LAST_RESPONSE=data;
      if(!items.length&&page===0)renderEmpty(query,mobile);else renderItems(items,query,append,mobile,data?.total);
    }catch(error){
      liveDone=true;
      if(error?.name==='AbortError'||my!==sequence)return;
      console.error('[Search Authority v3] request failed',error);
      await preview;
      if(page===0){
        if(previewShown){
          const {label}=target(mobile);
          if(label)label.textContent=`Live search unavailable · showing saved catalog results for “${query}”`;
        }else renderError(query,mobile);
      }
    }finally{if(my===sequence)loading=false;}
  }

  function run(value,source=null){
    const query=String(value||'');
    const mobile=mobileTarget(source);
    syncInputs(query,source);
    clearTimeout(timer);try{controller?.abort();}catch(_){}sequence++;
    activeQuery=query.trim();activePage=0;activePages=0;activeMobile=mobile;
    if(!activeQuery){
      const {grid,label}=target(mobile);
      if(grid)grid.innerHTML='<div class="empty"><h2>Search your vault</h2><p>Movies and shows will appear here.</p></div>';
      if(label)label.textContent='Start typing to search your vault';
      return;
    }
    if(!mobile)showSearchView();
    timer=setTimeout(()=>execute(activeQuery,0,mobile,false),DEBOUNCE_MS);
  }
  async function loadMore(){
    if(loading||!activeQuery||activePages<=0||activePage+1>=activePages)return;
    await execute(activeQuery,activePage+1,activeMobile,true);
  }
  function clear(){
    clearTimeout(timer);try{controller?.abort();}catch(_){}sequence++;activeQuery='';activePage=0;activePages=0;window.__SV_SEARCH_LAST_TOTAL=0;
    syncInputs('');const {grid,label}=target(activeMobile);
    if(grid)grid.innerHTML='<div class="empty"><h2>Search your vault</h2><p>Movies and shows will appear here.</p></div>';
    if(label)label.textContent='Start typing to search your vault';inputs()[0]?.focus?.();
  }

  window.addEventListener('input',event=>{
    if(!SEARCH_IDS.has(event.target?.id))return;
    event.stopImmediatePropagation();event.stopPropagation();run(event.target.value,event.target);
  },true);
  window.addEventListener('scroll',()=>{
    if(!activeMobile&&activeQuery&&!loading&&activePages>0&&activePage+1<activePages&&innerHeight+scrollY>=document.documentElement.scrollHeight-900)loadMore();
  },{passive:true});
  function bindMobileScroll(){
    document.querySelector('.search-overlay-results')?.addEventListener('scroll',event=>{
      const el=event.currentTarget;
      if(activeMobile&&activeQuery&&!loading&&activePages>0&&activePage+1<activePages&&el.scrollTop+el.clientHeight>=el.scrollHeight-500)loadMore();
    },{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindMobileScroll,{once:true});else bindMobileScroll();

  window.handleSearch=value=>run(value,document.activeElement);
  window.renderSearchPage=(value='')=>{showSearchView();run(value,document.getElementById('searchInputDesktop'));};
  window.clearGlobalSearch=clear;
  window.loadMoreSearchResults=loadMore;
  window.__SV_SEARCH_AUTHORITY_VERSION=VERSION;
  window.__SV_SEARCH_AUTHORITY_ACTIVE=true;
})();
