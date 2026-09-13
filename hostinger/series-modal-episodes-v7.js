/* SV_MEDIA_EPISODES_V17 — synchronous canonical render + eager visible artwork */
(function(){
  'use strict';
  if(window.__svMediaEpisodesV17)return;
  window.__svMediaEpisodesV17=true;
  window.__svMediaEpisodesV16=true;
  window.__svMediaEpisodesV15=true;
  window.__svMediaEpisodesV14=true;
  window.__SV_SERIES_EPISODES_VERSION='20260823-series-episodes-v17-instant-canonical-artwork';

  const memoryCache=new Map();
  const pending=new Map();
  const STORE_KEY='sv_episode_cache_v16';
  const STORE_TTL=24*60*60*1000;
  const STORE_LIMIT=12;
  let lastPayload=null;
  let lastPayloadKey='';
  let observerTimer=0;

  function modal(){return document.getElementById('mediaModal');}
  function modalVisible(){
    const el=modal();
    if(!el||el.classList.contains('hidden'))return false;
    try{
      const style=getComputedStyle(el);
      if(style.display==='none'||style.visibility==='hidden')return false;
    }catch(_){}
    return true;
  }

  function decodeDeep(value){
    let text=String(value||'').trim();
    for(let i=0;i<4;i++){
      if(!/%[0-9a-f]{2}/i.test(text))break;
      try{
        const next=decodeURIComponent(text);
        if(next===text)break;
        text=next;
      }catch(_){break;}
    }
    return text.replace(/\+/g,' ');
  }

  function cleanTitle(value){
    return decodeDeep(value)
      .replace(/^\s*about\s+/i,'')
      .replace(/\[[^\]]*]/g,' ')
      .replace(/\([^)]*(?:tv|web|series|mini)[^)]*\)/gi,' ')
      .replace(/\b(?:tv\s+mini\s+series|tv\s+series|web\s+series|mini\s+series|series)\b/gi,' ')
      .replace(/\b(?:2160p|1080p|720p|480p|4k|uhd|hdr|dual\s+audio|multi\s+audio|multi-audio)\b/gi,' ')
      .replace(/\b(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2})?\b/g,' ')
      .replace(/\b(?:19|20)\d{2}\b/g,' ')
      .replace(/[._]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function norm(value){return cleanTitle(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function yearFrom(value){return String(value||'').match(/(?:19|20)\d{2}/)?.[0]||'';}

  function runtimeItem(){
    try{if(typeof currentMediaModalItem!=='undefined'&&currentMediaModalItem)return currentMediaModalItem;}catch(_){}
    try{if(typeof currentShow!=='undefined'&&currentShow)return currentShow;}catch(_){}
    return null;
  }

  function domTitle(){
    const el=modal();if(!el)return '';
    const nodes=[...el.querySelectorAll('h1,h2,h3,.media-modal-title,.modal-title,[class*="title"]')];
    const texts=nodes.map(node=>String(node.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean);
    const about=texts.find(text=>/^About\s+/i.test(text));
    if(about)return about.replace(/^About\s+/i,'').trim();
    const series=texts.find(text=>/\b(?:TV\s+(?:Mini\s+)?Series|Web\s+Series|Series)\b/i.test(text)&&!/^Episodes$/i.test(text));
    if(series)return series;
    return texts.find(text=>text.length>1&&!/^(?:Details|Episodes|About|More Like This)$/i.test(text))||'';
  }

  function infoFromItem(item){
    let raw=String(item?.name||item?.title||'').trim();
    if(!raw)raw=domTitle();
    const clean=cleanTitle(raw)||raw;
    const year=yearFrom(item?.year)||yearFrom(raw)||yearFrom(domTitle());
    return {item,raw,clean,year,key:`${norm(clean)}|${year}`};
  }
  function titleInfo(){return infoFromItem(runtimeItem());}

  function looksLikeSeries(info){
    try{
      const type=String(info?.item?.type||info?.item?.mediaType||'').toLowerCase();
      if(['tv','series','show'].includes(type))return true;
      if(info?.item?.seasons)return true;
      if(typeof currentMediaModalType!=='undefined'&&['tv','series','show'].includes(String(currentMediaModalType).toLowerCase()))return true;
    }catch(_){}
    const text=`${info?.raw||''} ${modal()?.textContent||''}`;
    return /\b(?:TV\s+(?:Mini\s+)?Series|Web\s+Series|Type\s*Series)\b/i.test(text);
  }

  function seasonsObject(show){
    const source=show?.seasons||{};
    const out={};
    if(Array.isArray(source)){
      source.forEach((season,index)=>{
        const n=Number(season?.season??season?.seasonNumber??season?.number??index+1)||index+1;
        const eps=Array.isArray(season?.episodes)?season.episodes:(Array.isArray(season)?season:[]);
        if(eps.length)out[n]=eps;
      });
      return out;
    }
    Object.entries(source).forEach(([key,value])=>{
      const eps=Array.isArray(value)?value:(Array.isArray(value?.episodes)?value.episodes:[]);
      if(eps.length)out[Number(key)||key]=eps;
    });
    return out;
  }
  function episodeCount(show){return Object.values(seasonsObject(show)).reduce((sum,eps)=>sum+(Array.isArray(eps)?eps.length:0),0);}
  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

  function genericEpisodeTitle(value,number){
    const text=String(value||'').trim();
    if(!text)return true;
    return /^(?:episode|ep)\s*0*\d+$/i.test(text)
      || /^s\d{1,2}e\d{1,3}$/i.test(text)
      || /^e\d{1,3}$/i.test(text)
      || text===String(number);
  }

  function basenameSource(value){
    let text=decodeDeep(value);
    if(!text)return '';
    text=text.split(/[?#]/)[0];
    try{
      const url=new URL(text,location.href);
      text=url.pathname.split('/').filter(Boolean).pop()||text;
    }catch(_){
      text=text.replace(/\\/g,'/').split('/').filter(Boolean).pop()||text;
    }
    return decodeDeep(text);
  }

  function cleanEpisodeCandidate(value,number,showTitle){
    let text=decodeDeep(value);
    if(!text)return '';
    if(/(?:https?:\/\/|ftp:\/\/|\/|\\|%2f)/i.test(text))text=basenameSource(text);
    text=decodeDeep(text)
      .replace(/\.(?:mkv|mp4|m4v|avi|mov|webm|ts|m2ts)$/i,'')
      .replace(/[._]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    const marker=text.match(/(?:^|\s)(?:s\d{1,2}\s*e\d{1,3}|\d{1,2}\s*x\s*\d{1,3}|episode\s*\d{1,3}|ep\s*\d{1,3})(?:\s|$)/i);
    if(marker)text=text.slice((marker.index||0)+marker[0].length).trim();
    else if(showTitle){
      const show=cleanTitle(showTitle).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(show)text=text.replace(new RegExp('^'+show+'(?:\\s*[-–—:]?\\s*)','i'),'').trim();
    }

    text=text
      .replace(/^\s*(?:episode|ep|e)\s*0*\d+\s*[-–—:]?\s*/i,'')
      .replace(/^[-–—: ]+/,'')
      .replace(/\[[^\]]*]/g,' ')
      .replace(/\([^)]*(?:2160|1080|720|480|web|bluray|x26|hevc|aac|ddp|h\.?26)[^)]*\)/gi,' ')
      .replace(/\b(?:2160p|1080p|720p|480p|4k|uhd|hdr10?|dv|dolby\s*vision|web[- ]?dl|webrip|web|bluray|brrip|bdrip|hdrip|hdtv|remux|x264|x265|h\.?264|h\.?265|hevc|avc|aac(?:2\.0)?|ac3|eac3|ddp(?:5\.1)?|dts(?:-hd)?|10bit|8bit|multi[- ]?audio|dual[- ]?audio|nf|netflix|amzn|amazon|dsnp|proper|repack|extended|uncut|rarbg|yify|yts|psa|pahe|galaxytv)\b.*$/i,' ')
      .replace(/[()[\]{}]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    if(!text||genericEpisodeTitle(text,number)||/%[0-9a-f]{2}/i.test(text)||/^https?:/i.test(text))return '';
    if(text.length>120)text=text.slice(0,120).trim();
    return text;
  }

  function episodeDisplayTitle(ep,index,showTitle){
    const number=Number(ep?.episode||ep?.number||index+1)||index+1;
    for(const field of [ep?.epTitle,ep?.title,ep?.name,ep?.displayTitle]){
      const cleaned=cleanEpisodeCandidate(field,number,showTitle);
      if(cleaned)return cleaned;
    }
    for(const source of [ep?.fileName,ep?.filename,ep?.file,ep?.path,ep?.streamUrl,ep?.url,ep?.src,ep?.link]){
      const cleaned=cleanEpisodeCandidate(source,number,showTitle);
      if(cleaned)return cleaned;
    }
    return `Episode ${number}`;
  }

  function normalizeShow(show){
    const seasons=seasonsObject(show);
    const showTitle=show?.name||show?.title||'';
    Object.entries(seasons).forEach(([season,episodes])=>{
      episodes.forEach((ep,index)=>{
        const number=Number(ep?.episode||ep?.number||index+1)||index+1;
        const title=episodeDisplayTitle(ep,index,showTitle);
        ep.episode=number;
        ep.season=Number(ep?.season||season)||Number(season)||1;
        ep.displayTitle=title;
        ep.epTitle=title;
        ep.title=title;
        ep.name=title;
      });
    });
    return {...show,seasons,isSummary:false,streamAvailable:true,hasStream:true};
  }

  function readStore(){
    try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch(_){return {};}
  }
  function cachedPersistent(key){
    const store=readStore();
    const entry=store[key];
    if(!entry||Date.now()-Number(entry.at||0)>STORE_TTL)return null;
    if(!entry.data||episodeCount(entry.data)<1)return null;
    return entry.data;
  }
  function savePersistent(key,data){
    try{
      const store=readStore();
      store[key]={at:Date.now(),data};
      const keys=Object.keys(store).sort((a,b)=>Number(store[b]?.at||0)-Number(store[a]?.at||0));
      keys.slice(STORE_LIMIT).forEach(k=>delete store[k]);
      localStorage.setItem(STORE_KEY,JSON.stringify(store));
    }catch(_){}
  }

  async function responseShow(response){
    if(!response?.ok)throw new Error(`HTTP ${response?.status||0}`);
    const show=await response.json();
    if(!show||episodeCount(show)<1)throw new Error('No episodes');
    return show;
  }

  async function fetchOneTitle(title,year){
    const params=new URLSearchParams({title});
    if(year)params.set('year',year);
    const query=params.toString();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),7000);
    const jobs=[];

    jobs.push(
      fetch('/series-episodes-direct.php?'+query,{
        cache:'default',signal:controller.signal,headers:{Accept:'application/json'}
      }).then(responseShow)
    );

    jobs.push((async()=>{
      const path='/api/series/episodes-direct?'+query;
      const fn=window.StreamVaultConfig?.fetchWithTimeout;
      const response=fn
        ? await fn(path,{cache:'default',signal:controller.signal,headers:{Accept:'application/json'}},6500)
        : await fetch(path,{cache:'default',signal:controller.signal,headers:{Accept:'application/json'}});
      return responseShow(response);
    })());

    try{
      const result=await Promise.any(jobs);
      controller.abort();
      return result;
    }finally{clearTimeout(timeout);}
  }

  async function fetchDirect(info){
    if(typeof window.prefetchSeriesDetail==='function'){
      try{
        const canonical=await window.prefetchSeriesDetail(info.item,{priority:true});
        if(canonical && episodeCount(canonical)>0)return canonical;
      }catch(error){
        console.warn('[Series episodes] Canonical detail unavailable, using direct fallback:',error?.message || error);
      }
    }
    try{
      const item=info?.item||{};
      const params=new URLSearchParams();
      if(item.id)params.set('id',item.id);
      if(item.tmdbId)params.set('tmdbId',item.tmdbId);
      const name=info?.clean||info?.raw||item.name||item.title||'';
      if(name)params.set('name',name);
      if(info?.year)params.set('year',info.year);
      if(params.has('name')||params.has('id')||params.has('tmdbId')){
        const path='/api/series/detail?'+params.toString();
        const fn=window.StreamVaultConfig?.fetchWithTimeout;
        const response=fn
          ? await fn(path,{cache:'no-store',headers:{Accept:'application/json'}},6500)
          : await fetch(path,{cache:'no-store',headers:{Accept:'application/json'}});
        const canonical=await responseShow(response);
        if(canonical&&episodeCount(canonical)>0)return canonical;
      }
    }catch(error){
      console.warn('[Series episodes] Canonical series detail unavailable, using direct fallback:',error?.message||error);
    }
    const titles=[...new Set([info.clean,info.raw].filter(Boolean))];
    let lastError=null;
    for(const title of titles){
      try{return await fetchOneTitle(title,info.year);}catch(error){lastError=error;}
    }
    throw lastError||new Error('Episode source unavailable');
  }

  function writeRuntime(show){
    try{currentShow=show;}catch(_){}
    try{
      if(typeof currentMediaModalItem!=='undefined'&&currentMediaModalItem&&typeof currentMediaModalItem==='object')Object.assign(currentMediaModalItem,show);
    }catch(_){}
    try{currentMediaModalType='tv';}catch(_){}
    try{
      if(typeof currentSeason!=='undefined'){
        const available=Object.keys(show.seasons||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
        if(available.length&&!available.includes(Number(currentSeason)))currentSeason=available[0];
      }
    }catch(_){}
  }

  function repairDetails(show){
    const count=Object.keys(show?.seasons||{}).length;
    if(!count)return;
    const el=modal();if(!el)return;
    for(const node of [...el.querySelectorAll('*')]){
      if(String(node.textContent||'').trim().toUpperCase()!=='RUNTIME')continue;
      const card=node.closest('[class*="detail"], [class*="meta"], div');
      if(!card)continue;
      const value=[...card.querySelectorAll('*')].find(x=>x!==node&&/^(?:0|\d+)\s+seasons?$/i.test(String(x.textContent||'').trim()));
      if(value)value.textContent=`${count} season${count===1?'':'s'}`;
      break;
    }
  }

  function renderDirect(show,selectedSeason){
    const root=document.getElementById('modalEpisodes');if(!root)return false;
    const seasons=Object.keys(show.seasons||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!seasons.length)return false;
    const season=seasons.includes(Number(selectedSeason))?Number(selectedSeason):seasons[0];
    const episodes=show.seasons[season]||show.seasons[String(season)]||[];
    const options=seasons.map(n=>`<option value="${n}"${n===season?' selected':''}>Season ${n}</option>`).join('');
    const fallback=String(show.backdrop||show.poster||'');
    const cards=episodes.map((episode,index)=>{
      const number=episode?.episode||episode?.number||index+1;
      const title=episodeDisplayTitle(episode,index,show?.name||show?.title||'');
      const image=episode?.thumb||episode?.thumbnail||episode?.poster||fallback;
      const eager=index<10;
      const imageMarkup=image
        ? `<img src="${esc(image)}" alt="" loading="${eager?'eager':'lazy'}" decoding="async"${index<6?' fetchpriority="high"':''}>`
        : '';
      return `<div class="media-modal-episode" data-episode-index="${index}"><button class="media-modal-episode-play" type="button" onclick="window.__svEpisodesV16Play(${season},${index})" aria-label="Play Episode ${esc(number)}">${imageMarkup}<span class="media-modal-episode-copy"><span class="media-modal-episode-number">Episode ${esc(number)}</span><span class="media-modal-episode-title">${esc(title)}</span></span></button><button class="media-modal-episode-download" type="button" onclick="window.__svEpisodesV16Download(event,${season},${index})" title="Download Episode ${esc(number)}" aria-label="Download Episode ${esc(number)}">${typeof mediaDownloadIconSvg==='function'?mediaDownloadIconSvg():''}</button></div>`;
    }).join('');
    root.className='media-modal-section';
    root.style.display='';
    root.dataset.svEpisodeAuthority='v17';
    root.innerHTML=`<h2 class="media-modal-heading">Episodes</h2><div class="media-modal-season-row"><select aria-label="Season" onchange="window.__svEpisodesV16Season(this.value)">${options}</select></div><div class="media-modal-episodes">${cards}</div>`;
    try{window.svPromoteRenderedEpisodeImages?.(root);}catch(_){}
    return true;
  }

  function apply(rawShow,key){
    const identity=runtimeItem();
    const canonicalId=/^series_[a-f0-9]+$/i.test(String(identity?.id || ''))
      ? identity.id
      : rawShow?.id || identity?.id || '';
    const show=normalizeShow({...rawShow,id:canonicalId});
    if(!episodeCount(show))return false;
    lastPayload=show;
    lastPayloadKey=key||lastPayloadKey;
    writeRuntime(show);
    let selected=1;
    try{selected=Number(currentSeason)||1;}catch(_){}
    try{window.svWarmEpisodeImages?.(show,{priority:true,limit:12});}catch(_){}
    renderDirect(show,selected);
    repairDetails(show);
    return true;
  }

  window.__svEpisodesV16Season=function(value){
    if(!lastPayload)return;
    const season=Number(value)||1;
    try{currentSeason=season;}catch(_){}
    renderDirect(lastPayload,season);
  };
  window.__svEpisodesV15Season=window.__svEpisodesV16Season;

  window.__svEpisodesV16Play=function(season,index){
    if(!lastPayload)return;
    writeRuntime(lastPayload);
    try{currentSeason=Number(season);}catch(_){}
    try{
      if(typeof playMediaModalEpisode==='function')return playMediaModalEpisode(Number(season),Number(index));
    }catch(_){}
    const episode=lastPayload?.seasons?.[Number(season)]?.[Number(index)]||lastPayload?.seasons?.[String(season)]?.[Number(index)];
    const url=episode?.streamUrl||episode?.url||'';
    if(url)window.open(url,'_blank','noopener');
  };

  window.__svEpisodesV16Download=function(event,season,index){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if(typeof downloadSeriesEpisode==='function')return downloadSeriesEpisode(event,Number(season),Number(index),lastPayload);
    if(typeof showToast==='function')showToast('Download unavailable');
    return false;
  };
  window.__svEpisodesV15Play=window.__svEpisodesV16Play;

  function showLoading(){
    const root=document.getElementById('modalEpisodes');if(!root)return;
    root.className='media-modal-section';root.style.display='';root.dataset.svEpisodeAuthority='v17-loading';
    root.innerHTML='<h2 class="media-modal-heading">Episodes</h2><div class="no-data">Loading episodes…</div>';
  }
  function showFailure(){
    const root=document.getElementById('modalEpisodes');if(!root)return;
    root.className='media-modal-section';root.style.display='';root.dataset.svEpisodeAuthority='v17-failed';
    root.innerHTML='<h2 class="media-modal-heading">Episodes</h2><div class="no-data">Episodes temporarily unavailable</div>';
  }

  async function hydrate(info){
    if(!info?.clean||!looksLikeSeries(info)||!modalVisible())return;
    const key=info.key;

    /* The canonical prefetcher may already have attached complete seasons to the
       clicked card. Render that data synchronously instead of flashing a loading
       state and awaiting an already-resolved Promise. */
    if(info.item&&episodeCount(info.item)>0){
      const embedded=normalizeShow(info.item);
      memoryCache.set(key,embedded);
      savePersistent(key,embedded);
      apply(embedded,key);
      return embedded;
    }

    const mem=memoryCache.get(key);
    if(mem){apply(mem,key);return mem;}

    const persisted=cachedPersistent(key);
    if(persisted){
      const normalized=normalizeShow(persisted);
      memoryCache.set(key,normalized);
      apply(normalized,key);
      return normalized;
    }

    if(pending.has(key))return pending.get(key);
    showLoading();
    const task=(async()=>{
      try{
        const show=normalizeShow(await fetchDirect(info));
        memoryCache.set(key,show);
        savePersistent(key,show);
        if(modalVisible()&&titleInfo().key===key)apply(show,key);
        return show;
      }catch(error){
        if(modalVisible()&&titleInfo().key===key)showFailure();
        throw error;
      }finally{pending.delete(key);}
    })();
    pending.set(key,task);
    task.catch(()=>{});
    return task;
  }

  async function tick(){
    if(!modalVisible())return;
    const info=titleInfo();
    if(!info.clean||!looksLikeSeries(info))return;
    const root=document.getElementById('modalEpisodes');
    if(lastPayload&&lastPayloadKey===info.key){
      if(!root||root.style.display==='none'||!root.querySelector('.media-modal-episode'))apply(lastPayload,info.key);
      return;
    }
    try{await hydrate(info);}catch(_){
      // hydrate() already renders the unavailable state; consume the failure at this polling boundary.
    }
  }

  function scheduleTick(){
    clearTimeout(observerTimer);
    observerTimer=setTimeout(()=>{void tick();},0);
  }

  if(typeof openMediaModal==='function'){
    const previousOpenMediaModal=openMediaModal;
    openMediaModal=function(item){
      const result=previousOpenMediaModal.apply(this,arguments);
      const info=infoFromItem(item||runtimeItem());
      if(modalVisible()&&looksLikeSeries(info))void hydrate(info).catch(()=>{});
      return result;
    };
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleTick,{once:true});
  else scheduleTick();
  setInterval(()=>{if(modalVisible())void tick();},900);
  try{
    const root=modal()||document.documentElement;
    new MutationObserver(scheduleTick).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-hidden']});
  }catch(_){}
  window.addEventListener('streamvault:backend-online',scheduleTick);
})();
