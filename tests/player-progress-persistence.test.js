'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('hostinger/app-v3.js','utf8');
const body=app.slice(app.indexOf('function updateWatchProgress('),app.indexOf('\nlet availableAudio',app.indexOf('function updateWatchProgress(')));
test('confirmed progress persists without deleting other history',()=>{
  let saved;const context=vm.createContext({watchProgress:{other:{progress:.7},episode:{note:'keep'}},localStorage:{setItem:(key,value)=>{assert.equal(key,'sv_progress');saved=JSON.parse(value);}}});
  vm.runInContext(body,context);context.updateWatchProgress('episode',35,70);
  assert.equal(saved.episode.progress,.5);assert.equal(saved.episode.note,'keep');assert.equal(saved.other.progress,.7);
  context.updateWatchProgress('episode',0,70);assert.equal(saved.episode.progress,0);
  context.updateWatchProgress('episode',NaN,70);assert.equal(saved.episode.progress,0);
  context.updateWatchProgress('__proto__',10,70);assert.equal(Object.hasOwn(saved,'__proto__'),false);
});
test('storage denial keeps in-memory resume usable',()=>{
  const context=vm.createContext({watchProgress:{},localStorage:{setItem:()=>{throw new Error('denied')}}});
  vm.runInContext(body,context);context.updateWatchProgress('episode',35,70);
  assert.equal(context.watchProgress.episode.progress,.5);
});
test('subtitle retry bypasses cached HTTP failures and accepts fresh VTT',async()=>{
  const view=fs.readFileSync('hostinger/player-vlc-v1.js','utf8');
  const source=view.slice(view.indexOf('    fetchText:async'),view.indexOf('    onChange:render'));
  const modes=[];let attempts=0;
  const context=vm.createContext({fetch:async(_url,options)=>{
    modes.push(options.cache);attempts++;
    return {ok:attempts>1 && options.cache==='no-store',text:async()=> 'WEBVTT\n'};
  }});
  const fetchText=vm.runInContext('({'+source+'}).fetchText',context);
  await assert.rejects(fetchText('/subtitle.vtt'),/unavailable/);
  assert.equal(await fetchText('/subtitle.vtt'),'WEBVTT\n');
  assert.deepEqual(modes,['no-store','no-store']);
});
