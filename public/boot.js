(function(){
  try{
    if(typeof svFinalBuildLiveHomeRowFallback === 'function')window.buildLiveHomeRow = svFinalBuildLiveHomeRowFallback;
    if(typeof svOptimizedRenderLiveGridFallback === 'function')window.renderLiveGrid = svOptimizedRenderLiveGridFallback;
    if(typeof window.svStartFifaLiveSection === 'function')window.svStartFifaLiveSection();
    setupPlayerEvents();
    init();
  }catch(e){
    console.error('[StreamVault] boot failed:', e);
    const heroTitle = document.getElementById('heroTitle');
    if(heroTitle)heroTitle.textContent = 'Could not start StreamVault';
  }
})();
