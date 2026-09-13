(function(){
  window.API_BASE = window.STREAMVAULT_CONFIG?.backendOrigin || window.API_BASE || '';

  const FALLBACK_POSTER = '/fallback.webp';
  const BACKEND_ORIGIN = 'https://backend.streamvault.fit';
  const searchPosterCache = new Map();
  const searchPosterPending = new Map();

  function fixUrl(u){
    if(!u) return u;
    try{
      const parsed = new URL(u, location.href);
      if(parsed.pathname.startsWith('/posters/')){
        if(parsed.origin === location.origin || parsed.origin === 'https://streamvault.fit' || parsed.origin === 'https://www.streamvault.fit'){
          return BACKEND_ORIGIN + parsed.pathname + parsed.search + parsed.hash;
        }
        return parsed.href;
      }
      if(parsed.pathname === '/poster-cache' || parsed.pathname === '/image-proxy'){
        const source = parsed.searchParams.get('url');
        if(source && /^https:\/\/image\.tmdb\.org\/t\/p\//i.test(source))return source;
        return FALLBACK_POSTER;
      }
    }catch(_error){
      return FALLBACK_POSTER;
    }
    return u;
  }

  function fixImgs(root){
    const scope = root || document;
    const images = [];
    if(scope.matches?.('img'))images.push(scope);
    scope.querySelectorAll?.('img').forEach(img=>images.push(img));
    images.forEach(img=>{
      ["src","data-src","data-sv-src"].forEach(a=>{
        const v=img.getAttribute(a);
        if(v) img.setAttribute(a, fixUrl(v));
      });
      const sv=img.getAttribute("data-sv-src");
      if(sv && (!img.getAttribute("src") || img.getAttribute("src").startsWith("data:"))){
        img.setAttribute("src", fixUrl(sv));
      }
      if(!img.getAttribute('decoding'))img.decoding='async';
    });
  }

  function searchCardIdentity(card){
    const title=String(card?.querySelector?.('.card-title')?.textContent || '').trim();
    if(!title)return null;
    const meta=String(card?.querySelector?.('.card-meta')?.textContent || '');
    const year=meta.match(/\b((?:19|20)\d{2})\b/)?.[1] || '';
    return {title,year,key:`${title.toLowerCase()}|${year}`};
  }

  function cardNeedsPoster(card){
    const img=card?.querySelector?.('img');
    if(!img)return true;
    const src=String(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-sv-src') || '');
    return !src || src.startsWith('data:') || /(?:^|\/)fallback\.webp(?:$|[?#])/i.test(src);
  }

  function setSearchCardPoster(card, poster){
    const url=fixUrl(poster);
    if(!card || !url || url===FALLBACK_POSTER)return;
    let img=card.querySelector('img');
    if(!img){
      img=document.createElement('img');
      img.alt=String(card.querySelector('.card-title')?.textContent || 'Poster');
      const placeholder=card.querySelector('.card-placeholder');
      if(placeholder)placeholder.replaceWith(img);
      else card.prepend(img);
    }
    img.decoding='async';
    img.loading='lazy';
    img.setAttribute('data-sv-src',url);
    img.src=url;
  }

  async function fetchSearchPoster(identity){
    if(searchPosterCache.has(identity.key))return searchPosterCache.get(identity.key);
    if(searchPosterPending.has(identity.key))return searchPosterPending.get(identity.key);
    const params=new URLSearchParams({title:identity.title,type:'movie'});
    if(identity.year)params.set('year',identity.year);
    const request=(window.StreamVaultConfig?.fetchWithTimeout
      ? window.StreamVaultConfig.fetchWithTimeout(`/api/title-details?${params.toString()}`,{cache:'no-store'},6500)
      : fetch(`/api/title-details?${params.toString()}`,{cache:'no-store'}))
      .then(async response=>{
        if(!response?.ok)return '';
        const data=await response.json();
        const poster=String(data?.poster || data?.backdrop || '');
        searchPosterCache.set(identity.key,poster);
        return poster;
      })
      .catch(()=>{
        searchPosterCache.set(identity.key,'');
        return '';
      })
      .finally(()=>searchPosterPending.delete(identity.key));
    searchPosterPending.set(identity.key,request);
    return request;
  }

  function hydrateSearchCard(card){
    if(!card || card.dataset.svPosterHydrating==='1' || !cardNeedsPoster(card))return;
    const identity=searchCardIdentity(card);
    if(!identity)return;
    card.dataset.svPosterHydrating='1';
    fetchSearchPoster(identity).then(poster=>{
      if(poster)setSearchCardPoster(card,poster);
    }).finally(()=>{card.dataset.svPosterHydrating='0';});
  }

  function hydrateSearchPosters(root){
    const scope=root || document;
    const cards=[];
    if(scope.matches?.('#searchGrid .card,#mobileSearchGrid .card'))cards.push(scope);
    scope.querySelectorAll?.('#searchGrid .card,#mobileSearchGrid .card').forEach(card=>cards.push(card));
    cards.forEach(card=>hydrateSearchCard(card));
  }

  function process(root){fixImgs(root);hydrateSearchPosters(root);}
  if(document.readyState === 'loading')document.addEventListener('DOMContentLoaded', ()=>process(document), { once:true });
  else process(document);
  new MutationObserver(ms=>{ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)process(n);}));}).observe(document.documentElement,{childList:true,subtree:true});
})();

/* SV_SOFTWARE_ARTWORK_PROXY_V2 */
(function(){
  if(window.__SV_SOFTWARE_ARTWORK_PROXY_V2)return;
  window.__SV_SOFTWARE_ARTWORK_PROXY_V2=true;
  try{
    const raw=JSON.parse(localStorage.getItem('sv_sw_art_v1')||'{}');
    const clean={};
    for(const [key,value] of Object.entries(raw||{}))if(value&&value.id)clean[key]=value;
    localStorage.setItem('sv_sw_art_v1',JSON.stringify(clean));
  }catch(_error){try{localStorage.removeItem('sv_sw_art_v1');}catch(_ignore){}}

  const previousFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    try{
      const rawUrl=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'');
      const url=new URL(rawUrl,location.href);
      if(url.hostname==='store.steampowered.com'&&url.pathname==='/api/storesearch/'){
        const title=String(url.searchParams.get('term')||'').trim();
        const localUrl=`/software-artwork.php?title=${encodeURIComponent(title)}`;
        const nextInit={...(init||{})};delete nextInit.mode;delete nextInit.credentials;
        return previousFetch(localUrl,nextInit);
      }
    }catch(_error){}
    return previousFetch(input,init);
  };
})();

/* SV_GLOBAL_SERIES_EPISODE_AUTHORITY_V16 */
(function(){
  if(window.__SV_GLOBAL_SERIES_EPISODE_AUTHORITY_V16)return;
  window.__SV_GLOBAL_SERIES_EPISODE_AUTHORITY_V16=true;
  window.__svMediaEpisodesV10=true;
  window.__svMediaEpisodesV11=true;
  window.__svMediaEpisodesV12=true;
  window.__svMediaEpisodesV13=true;
  window.__svMediaEpisodesV14=true;
  window.__svMediaEpisodesV15=true;
  const declaredScript=document.querySelector('script[src*="/series-modal-episodes-v7.js"]');
  if(declaredScript)return;
  const script=document.createElement('script');
  script.src='/series-modal-episodes-v7.js?v=20260820-series-episodes-v16-fast-stable-titles';
  script.async=false;
  script.onerror=()=>{window.__SV_GLOBAL_SERIES_EPISODE_AUTHORITY_V16_LOAD_ERROR=true;};
  document.head.appendChild(script);
})();

/* SV_SERIES_EPISODE_METADATA_LOADER_V17 */
(function(){
  if(window.__SV_SERIES_EPISODE_METADATA_LOADER_V17)return;
  window.__SV_SERIES_EPISODE_METADATA_LOADER_V17=true;
  const script=document.createElement('script');
  script.src='/series-episode-metadata-v17.js?v=20260820-series-episode-metadata-v17';
  script.defer=true;
  script.onerror=()=>{window.__SV_SERIES_EPISODE_METADATA_V17_LOAD_ERROR=true;};
  document.head.appendChild(script);
})();

/* SV_MOBILE_DIRECT_HOME_LOADER_V5 */
(function(){
  if(window.__SV_MOBILE_DIRECT_HOME_LOADER_V5)return;
  window.__SV_MOBILE_DIRECT_HOME_LOADER_V5=true;
  const script=document.createElement('script');
  script.src='/mobile-direct-home-v1.js?v=20260913-no-home-row-v1';
  script.defer=true;
  script.onerror=()=>{window.__SV_MOBILE_DIRECT_HOME_LOAD_ERROR=true;};
  document.head.appendChild(script);
})();

/* SV_SEARCH_AUTHORITY_LOADER_V3 */
(function(){
  if(window.__SV_SEARCH_AUTHORITY_LOADER_V3)return;
  window.__SV_SEARCH_AUTHORITY_LOADER_V3=true;
  const script=document.createElement('script');
  script.src='/search-authority-v2.js?v=20260819-search-authority-v3';
  script.defer=true;
  script.onerror=()=>{window.__SV_SEARCH_AUTHORITY_V3_LOAD_ERROR=true;};
  document.head.appendChild(script);
})();

/* SV_MODAL_SCROLL_PRESERVE_LOADER_V1 */
(function(){
  if(window.__SV_MODAL_SCROLL_PRESERVE_LOADER_V1)return;
  window.__SV_MODAL_SCROLL_PRESERVE_LOADER_V1=true;
  const script=document.createElement('script');
  script.src='/modal-scroll-preserve-v1.js?v=20260820-modal-scroll-preserve-v1';
  script.defer=true;
  script.onerror=()=>{window.__SV_MODAL_SCROLL_PRESERVE_V1_LOAD_ERROR=true;};
  document.head.appendChild(script);
})();
