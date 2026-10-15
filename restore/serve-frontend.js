#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),net=require('net'),crypto=require('crypto');
const args=process.argv.slice(2);const value=k=>{let i=args.indexOf(k);return i<0?null:args[i+1];};
if(args.includes('--apply')&&args.includes('--dry-run'))throw Error('Choose --apply or --dry-run');
const target=path.resolve(value('--target')||'');const port=Number(value('--port')||18080);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use an unprivileged isolated port');
const marker=JSON.parse(fs.readFileSync(path.join(target,'.streamvault-restore.json'),'utf8'));
if(marker.component!=='frontend')throw Error('A verified frontend restore is required');
const captured=JSON.parse(fs.readFileSync(path.join(target,'CAPTURE-MEMBERS.json'),'utf8'));
const server=path.resolve(target,captured.active_root.replace(/^\//,'')+'/nodejs/hostinger/frontend-server.js');
if(!server.startsWith(target+path.sep))throw Error('Unsafe capture path');
const file=marker.files.find(x=>path.resolve(target,x.path)===server);
if(!file||crypto.createHash('sha256').update(fs.readFileSync(server)).digest('hex')!==file.sha256)throw Error('Frontend server hash differs');
console.log(JSON.stringify({mode:args.includes('--apply')?'APPLY':'DRY-RUN',server,bind:'127.0.0.1',port,production_changes:false},null,2));
if(args.includes('--apply')){
 process.env.PORT=String(port);
 const original=net.Server.prototype.listen;
 net.Server.prototype.listen=function(...a){
  if(typeof a[0]==='object')a[0]={...a[0],host:'127.0.0.1'};
  else if(typeof a[0]==='number'||/^\d+$/.test(String(a[0]))){
   if(typeof a[1]==='string')a[1]='127.0.0.1';else a.splice(1,0,'127.0.0.1');
  }else throw Error('Isolated launcher refuses non-TCP listeners');
  return original.apply(this,a);
 };
 require(server);
}
