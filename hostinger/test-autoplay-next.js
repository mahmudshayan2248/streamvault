'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'autoplay-next-v1.js'),'utf8');
new vm.Script(source,{filename:'autoplay-next-v1.js'});
const listeners={};
const video={addEventListener:(event,fn)=>listeners['video:'+event]=fn};
const classes={contains:(name)=>name==='open'};
const nodes={videoPlayer:video,playerModal:{classList:classes},playerWrap:{}};
const doc={getElementById:id=>nodes[id]||null,addEventListener:(event,fn)=>listeners['document:'+event]=fn};
const session={active:true,source:{kind:'local',id:2},snapshot:()=>({sessionGeneration:2,sourceIdentity:'m2'})};
const show={id:'show',name:'Test Show',seasons:{1:[{episode:1,streamId:1},{episode:2,streamId:2}],2:[{episode:1,streamId:3}]}};
const film={id:4,name:'Mystery Film',year:'2023',genre:'Drama',streamAvailable:true};
const film2={id:5,name:'Next Film',year:'2022',genre:'Drama',streamAvailable:true};
const win={playerSession:session,addEventListener:(event,fn)=>listeners['window:'+event]=fn};
const context={window:win,document:doc,console,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,
 isLiveMode:false,series:[show],movies:[film,film2],_playerShow:show,_playerSeason:1,_playerEpIdx:1,
 svPlayerLaunchItem:film,currentDetailMovie:film,currentMediaModalItem:film,
 isPlayableMediaItem:i=>i?.streamAvailable!==false && (i?.streamAvailable===true || !!i?.seasons),
 localSimilarItems:()=>[film2],playSeriesEpisode:()=>{},playMovieFromDetail:()=>{},
 hideSeriesPlayerBar:()=>{},showUI:()=>{}};
vm.runInNewContext(source,context,{filename:'autoplay-next-v1.js'});
assert(win.StreamVaultAutoNext,'autoplay controller installed');
const api=win.StreamVaultAutoNext._test;
assert.strictEqual(api.nextEpisode(show,1,0).episode.episode,2,'same-season episode');
assert.strictEqual(api.nextEpisode(show,1,1).season,2,'cross-season episode');
assert.strictEqual(api.nextEpisode(show,2,0),null,'final episode');
assert.strictEqual(api.matchedEpisode().show.name,'Test Show','current player matched to correct episode');
assert.strictEqual(api.plan().title,'Test Show · S02E01','next episode displayed');
win.StreamVaultAutoNext.rememberSimilar(film,'movie',[film2]);
assert.strictEqual(api.relatedTitle(film,'movie').name,'Next Film','detail carousel drives movie recommendation');
session.source={kind:'local',id:4};
assert.strictEqual(api.matchedEpisode(),null,'old episode context never overrides movie');
assert.strictEqual(api.plan().title,'Next Film','movie moves to relevant title');
console.log('autoplay-next tests passed (7 assertions)');
