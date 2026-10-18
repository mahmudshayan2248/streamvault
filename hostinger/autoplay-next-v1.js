/* StreamVault autoplay-next V1. Independent of the PlayerSession seeking engine. */
(function(){
  'use strict';
  const DELAY = 3000;
  const relatedByTitle = new Map();
  let timer = null, ticker = null, queued = null, generation = 0, handledEnd = '';
  const video = document.getElementById('videoPlayer');
  const modal = document.getElementById('playerModal');
  const wrap = document.getElementById('playerWrap');
  if(!video || !modal || !wrap)return;

  const key = (item,kind) => kind + ':' + String(item?.id ?? item?.name ?? item?.title ?? '').trim().toLowerCase();
  const title = item => String(item?.name || item?.title || '').replace(/\s+/g,' ').trim().toLowerCase();
  const year = item => String(item?.year || '').match(/(?:19|20)\d{2}/)?.[0] || '';
  const playable = item => typeof isPlayableMediaItem === 'function' && isPlayableMediaItem(item);
  const episodePlayable = ep => !!ep && (ep.streamUrl || ep.streamId !== null && ep.streamId !== undefined);
  const sameTitle = (a,b) => (key(a,'x') === key(b,'x') || (title(a) && title(a) === title(b) && (!year(a) || !year(b) || year(a) === year(b))));
  const session = () => window.playerSession;
  const sessionKey = state => String(state.sessionGeneration) + ':' + String(state.sourceIdentity || state.canonicalMediaId || '');
  const isShowingPlayer = () => modal.classList.contains('open') && !isLiveMode && !!session()?.active;
  const currentSource = () => session()?.source || {};

  function rememberSimilar(item,kind,items){
    if(item && Array.isArray(items))relatedByTitle.set(key(item,kind==='tv'?'tv':'movie'),items.slice(0,16));
  }
  function resolveRelated(raw,kind){
    if(!raw)return null;
    const catalog = kind === 'tv' ? series : movies;
    const rawId = String(raw.tmdbId || raw.id || '');
    const exact = catalog.find(item => playable(item) && (
      (rawId && (String(item.tmdbId || item.id || '') === rawId)) ||
      (title(raw) && title(item) === title(raw) && (!year(raw) || !year(item) || year(raw) === year(item)))
    ));
    return exact || (playable(raw) ? raw : null);
  }
  function relatedTitle(item,kind){
    if(!item)return null;
    const suggestions=relatedByTitle.get(key(item,kind)) ||
      (typeof localSimilarItems === 'function' ? localSimilarItems(item,kind) : []);
    const seen=new Set();
    for(const raw of suggestions){
      const candidate=resolveRelated(raw,kind);
      if(!candidate || sameTitle(candidate,item))continue;
      const identity=key(candidate,kind);
      if(seen.has(identity))continue;
      seen.add(identity);
      return candidate;
    }
    return null;
  }
  function nextEpisode(show,season,index){
    const seasons=Object.keys(show?.seasons||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    const at=seasons.indexOf(Number(season));
    if(at<0)return null;
    for(let si=at;si<seasons.length;si++){
      const s=seasons[si], eps=show.seasons[s] || [];
      for(let i=(si===at?Number(index)+1:0);i<eps.length;i++){
        if(episodePlayable(eps[i]))return {season:s,index:i,episode:eps[i]};
      }
    }
    return null;
  }
  function matchedEpisode(){
    if(!_playerShow || _playerSeason==null || _playerEpIdx==null)return null;
    const ep=_playerShow.seasons?.[_playerSeason]?.[_playerEpIdx];
    if(!ep)return null;
    const src=currentSource();
    if(src.kind==='remote' && ep.streamUrl && String(ep.streamUrl).trim()===String(src.url||'').trim())
      return {show:_playerShow,season:_playerSeason,index:_playerEpIdx};
    if(src.kind==='local' && ep.streamId!=null && String(ep.streamId)===String(src.id))
      return {show:_playerShow,season:_playerSeason,index:_playerEpIdx};
    return null;
  }
  function currentMovie(){
    const src=currentSource();
    const matches=item=>{
      if(!item)return false;
      if(src.kind==='remote')return !!item.streamUrl && String(item.streamUrl).trim()===String(src.url||'').trim();
      if(src.kind==='local')return item.id!=null && String(item.id)===String(src.id);
      return false;
    };
    return [svPlayerLaunchItem,currentDetailMovie,currentMediaModalItem,...movies].find(matches) || null;
  }
  function firstSeriesEpisode(show){
    const seasons=Object.keys(show?.seasons||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    for(const season of seasons){
      const eps=show.seasons[season]||[];
      const index=eps.findIndex(episodePlayable);
      if(index>=0)return {season,index,episode:eps[index]};
    }
    return null;
  }
  async function startSeries(show,season,index){
    // A recommendation may carry only a catalog stub; hydrate it before playing.
    if(!firstSeriesEpisode(show) && typeof svHydrateSeriesEpisodes==='function')
      await svHydrateSeriesEpisodes(show);
    const ep=season==null ? firstSeriesEpisode(show) : (show.seasons?.[season]?.[index] && episodePlayable(show.seasons[season][index]) ? {season,index} : firstSeriesEpisode(show));
    if(!ep || !isShowingPlayer())return;
    currentShow=show;
    playSeriesEpisode(show.name,ep.season,ep.index);
  }
  function plan(){
    const seriesContext=matchedEpisode();
    if(seriesContext){
      const {show,season,index}=seriesContext;
      const following=nextEpisode(show,season,index);
      if(following){
        return {title:show.name+' · S'+String(following.season).padStart(2,'0')+'E'+String(following.episode.episode??following.index+1).padStart(2,'0'),
          image:show.poster || show.backdrop, play:()=>startSeries(show,following.season,following.index)};
      }
      const nextShow=relatedTitle(show,'tv');
      if(nextShow)return {title:nextShow.name || nextShow.title,image:nextShow.poster||nextShow.backdrop,play:()=>startSeries(nextShow)};
      return null;
    }
    const movie=currentMovie();
    const next=relatedTitle(movie,'movie');
    if(!next)return null;
    return {title:next.name || next.title,image:next.poster || next.backdrop,
      play:()=>{
        if(!isShowingPlayer())return;
        hideSeriesPlayerBar();
        currentDetailMovie=next;
        return playMovieFromDetail();
      }};
  }
  function element(){
    let el=document.getElementById('svAutoNext');
    if(el)return el;
    el=document.createElement('div');
    el.id='svAutoNext';
    el.className='sv-auto-next';
    el.hidden=true;
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.innerHTML='<img id="svAutoNextPoster" alt="" hidden><div class="sv-auto-next-copy"><div class="sv-auto-next-label">UP NEXT IN <span id="svAutoNextSeconds">3</span>S</div><div id="svAutoNextTitle" class="sv-auto-next-title"></div></div><div class="sv-auto-next-actions"><button type="button" id="svAutoNextPlay">Play now</button><button type="button" id="svAutoNextCancel">Cancel</button></div>';
    wrap.appendChild(el);
    el.querySelector('#svAutoNextPlay').addEventListener('click',()=>playNow());
    el.querySelector('#svAutoNextCancel').addEventListener('click',()=>cancel());
    return el;
  }
  function cancel(){
    generation++;clearTimeout(timer);clearInterval(ticker);
    timer=null;ticker=null;queued=null;
    const overlay=document.getElementById('svAutoNext');
    if(overlay)overlay.hidden=true;
  }
  function playNow(){
    const task=queued;
    if(!task)return;
    cancel();
    if(!isShowingPlayer() || sessionKey(session().snapshot())!==task.signature)return;
    Promise.resolve().then(()=>task.next.play()).catch(error=>{
      console.warn('[Autoplay] Next title could not start:',error);
    });
  }
  function ended(state){
    if(state.state!=='ENDED' || !state.active || !isShowingPlayer())return;
    if(!(state.globalDuration>0) || state.globalCurrentTime < state.globalDuration-2)return;
    const signature=sessionKey(state);
    if(handledEnd===signature)return;
    handledEnd=signature;
    const next=plan();
    if(!next)return;
    const el=element();
    queued={next,signature};
    const poster=el.querySelector('#svAutoNextPoster');
    if(/^https?:\/\//i.test(String(next.image||''))){poster.src=next.image;poster.hidden=false;}
    else {poster.hidden=true;poster.removeAttribute('src');}
    el.querySelector('#svAutoNextTitle').textContent=next.title;
    el.hidden=false;
    if(typeof showUI==='function')showUI();
    const token=++generation,deadline=Date.now()+DELAY;
    const update=()=>{
      if(token!==generation)return;
      if(!isShowingPlayer() || sessionKey(session().snapshot())!==signature){cancel();return;}
      el.querySelector('#svAutoNextSeconds').textContent=String(Math.max(1,Math.ceil((deadline-Date.now())/1000)));
    };
    update();ticker=setInterval(update,200);
    timer=setTimeout(()=>{if(token===generation)playNow();},DELAY);
  }
  window.addEventListener('streamvault:playback-state',event=>{
    const state=event.detail;
    if(state?.state==='ENDED')ended(state);
    else if(queued)cancel();
    if(state && state.state!=='ENDED' && state.active && handledEnd && sessionKey(state)!==handledEnd)
      handledEnd='';
  });
  video.addEventListener('seeking',()=>{if(queued)cancel();});
  document.addEventListener('click',event=>{
    if(!queued)return;
    if(event.target.closest?.('.player-back') || event.target.closest?.('.series-player-bar'))cancel();
  },true);
  window.addEventListener('popstate',()=>{if(queued)cancel();});
  window.StreamVaultAutoNext={rememberSimilar, cancel, _test:{nextEpisode,matchedEpisode,relatedTitle,plan}};
})();
