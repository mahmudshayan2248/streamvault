/* StreamVault native media download launcher v2. */
(function mediaDownloadLaunchV2(){
  'use strict';
  if(window.__SV_MEDIA_DOWNLOAD_LAUNCH_V2)return;
  window.__SV_MEDIA_DOWNLOAD_LAUNCH_V2=true;

  function notify(message){
    if(typeof window.showToast==='function')window.showToast(message);
  }

  function backendUrl(path){
    return typeof window.svBackendUrl==='function' ? window.svBackendUrl(path) : path;
  }

  function stableEpisodeId(episode){
    return [episode?.mediaId,episode?.id,episode?.streamId]
      .map(value=>String(value??'').trim())
      .find(value=>/^episode_[a-f0-9]{12,}$/i.test(value))||'';
  }

  function episodeAt(show,season,index){
    const episodes=show?.seasons?.[season]||show?.seasons?.[String(season)]||[];
    return episodes[Number(index)]||null;
  }

  async function canonicalEpisode(show,season,index){
    const current=episodeAt(show,season,index);
    if(stableEpisodeId(current))return current;
    const title=String(show?.name||show?.title||'').trim();
    if(!title)return current;
    const params=new URLSearchParams({name:title});
    if(show?.year)params.set('year',show.year);
    try{
      const response=await fetch(backendUrl('/api/series/detail?'+params.toString()),{cache:'no-store'});
      if(!response.ok)return current;
      return episodeAt(await response.json(),season,index)||current;
    }catch(_){
      return current;
    }
  }

  window.triggerMediaDownload=function triggerMediaDownload(url){
    if(!url){notify('Download unavailable');return false;}
    notify('Starting download…');
    const anchor=document.createElement('a');
    anchor.href=backendUrl(url);
    anchor.style.display='none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  };

  window.downloadSeriesEpisode=async function downloadSeriesEpisode(event,season,index,showOverride=null){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const show=showOverride||window.currentShow;
    const episode=await canonicalEpisode(show,Number(season),Number(index));
    const mediaId=stableEpisodeId(episode);
    if(!mediaId)return window.triggerMediaDownload('');
    return window.triggerMediaDownload('/api/download/episode/'+encodeURIComponent(mediaId));
  };
})();
