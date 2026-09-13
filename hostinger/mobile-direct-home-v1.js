/* StreamVault mobile direct-play support — catalog registration only, no homepage row */
(function(){
  'use strict';
  if(window.__SV_MOBILE_DIRECT_HOME_V5)return;
  window.__SV_MOBILE_DIRECT_HOME_V5=true;
  window.__SV_MOBILE_DIRECT_HOME_VERSION='20260913-no-home-row-v1';

  const certified=new Map();
  const probe=document.createElement('video');
  let items=[];
  let installedPlayback=false;
  let loading=false;

  function mobile(){
    try{if(typeof isMobilePlaybackClient==='function')return !!isMobilePlaybackClient();}catch(_){}
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'')||matchMedia('(max-width:900px)').matches;
  }
  function base(){return String(window.API_BASE||window.STREAMVAULT_CONFIG?.backendOrigin||'').replace(/\/$/,'');}
  function proxy(url){return `${base()}/api/mobile-direct/proxy?url=${encodeURIComponent(String(url||''))}`;}

  function supportsProfile(id){
    if(id==='universal-h264')return !!(probe.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')||probe.canPlayType('video/mp4'));
    if(id==='apple-hevc')return !!(probe.canPlayType('video/mp4; codecs="hvc1"')||probe.canPlayType('video/mp4; codecs="hev1"'));
    if(id==='webm-modern')return !!(probe.canPlayType('video/webm; codecs="vp9, opus"')||probe.canPlayType('video/webm'));
    return false;
  }
  function profiles(item){return Array.isArray(item?.mobileDirectProfiles)&&item.mobileDirectProfiles.length?item.mobileDirectProfiles:[item?.mobileDirectProfile].filter(Boolean);}
  function supported(item){const p=profiles(item);return item?.mobileDirect===true&&p.length>0&&p.every(supportsProfile);}
  function register(item){
    if(!supported(item))return;
    if(item.streamUrl)certified.set(String(item.streamUrl),item.mobileDirectProfile||profiles(item)[0]);
    for(const eps of Object.values(item.seasons||{}))for(const ep of (Array.isArray(eps)?eps:[]))if(ep?.streamUrl)certified.set(String(ep.streamUrl),ep.mobileDirectProfile||profiles(item)[0]);
  }
  function certifiedSource(url){const p=certified.get(String(url||''));return p&&supportsProfile(p);}
  function directPlan(url){const src=proxy(url);return {ok:true,mode:'proxy',src,proxyUrl:src,directUrl:src,mobileDirect:true,transcoding:false,duration:0};}

  function installPlaybackHooks(){
    if(installedPlayback)return;installedPlayback=true;
    const prevFetch=window.fetchFtpPlaybackPlan;
    if(typeof prevFetch==='function')window.fetchFtpPlaybackPlan=async function(url,start=0,options={}){
      const mapped=!!(options?.forceAudio||options?.forceRemux||options?.mode==='audio'||options?.mode==='remux');
      if(mobile()&&certifiedSource(url)&&!mapped)return directPlan(url);
      return prevFetch.apply(this,arguments);
    };
    const prevLocal=window.localFtpPlaybackPlan;
    if(typeof prevLocal==='function')window.localFtpPlaybackPlan=function(url,options={}){
      const mapped=!!(options?.forceAudio||options?.forceRemux||options?.mode==='audio'||options?.mode==='remux');
      if(mobile()&&certifiedSource(url)&&!mapped)return directPlan(url);
      return prevLocal.apply(this,arguments);
    };
    const prevSeek=window.seekToTime;
    if(typeof prevSeek==='function')window.seekToTime=function(seconds){
      let source='';try{if(typeof _ftpStreamUrl!=='undefined')source=String(_ftpStreamUrl||'');}catch(_){}
      if(mobile()&&certifiedSource(source)){
        const video=document.getElementById('videoPlayer');
        if(video){try{video.currentTime=Math.max(0,Number(seconds)||0);if(video.paused&&video._svPlaybackShouldPlay!==false)video.play().catch(()=>{});return;}catch(_){}}
      }
      return prevSeek.apply(this,arguments);
    };
  }

  function itemKey(item){return String(item?.id||item?.streamUrl||item?.name||item?.title||item?.file||'');}
  function dedupe(list){
    const seen=new Set();
    return list.filter(item=>{
      const key=itemKey(item);
      if(!key||seen.has(key))return false;
      seen.add(key);return true;
    });
  }

  async function fetchCatalogPage(page,device){
    const response=await fetch(`/api/mobile-direct/catalog?page=${page}&limit=500&device=${device}`,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function load(){
    if(loading)return;loading=true;
    try{
      const device=/iPhone|iPad|iPod/i.test(navigator.userAgent||'')?'ios':/Android/i.test(navigator.userAgent||'')?'android':'generic';
      const first=await fetchCatalogPage(1,device);
      let pool=(Array.isArray(first?.items)?first.items:[]).filter(supported);
      const pageCount=Math.min(6,Math.max(1,Number(first?.pages)||1));
      if(pageCount>1){
        const rest=await Promise.all(Array.from({length:pageCount-1},(_,i)=>fetchCatalogPage(i+2,device).catch(()=>null)));
        for(const page of rest)if(Array.isArray(page?.items))pool.push(...page.items.filter(supported));
      }
      items=dedupe(pool);
      certified.clear();items.forEach(register);
      window.__SV_MOBILE_DIRECT_CATALOG=first;
      window.__SV_MOBILE_DIRECT_ITEMS=items;
      window.__SV_MOBILE_DIRECT_RANKED_COUNT=items.length;
      installPlaybackHooks();
    }catch(error){window.__SV_MOBILE_DIRECT_ERROR=String(error?.message||error);}
    finally{loading=false;}
  }

  function boot(){
    installPlaybackHooks();
    load();
    setInterval(load,5*60*1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
