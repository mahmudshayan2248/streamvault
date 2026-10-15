#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const argv=process.argv.slice(2);const at=argv.indexOf('--snapshot');const root=path.resolve(at>=0?argv[at+1]:path.join(__dirname,'..'));
const apply=argv.includes('--apply');if(apply&&argv.includes('--dry-run'))throw Error('Choose --apply or --dry-run');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'TRANSFER-MANIFEST.json'),'utf8'));
function safe(rel){const p=path.resolve(root,rel);if(!p.startsWith(root+path.sep))throw Error('Unsafe transfer path');return p;}
function sha(p){const h=crypto.createHash('sha256'),fd=fs.openSync(p,'r'),b=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}}
function locate(rel){for(const p of [safe(rel),safe(path.basename(rel))])if(fs.existsSync(p))return p;throw Error('Missing transfer part: '+rel);}
try{
 for(const item of manifest.transfers){
  const dest=safe(item.path);
  if(fs.existsSync(dest)){if(sha(dest)!==item.sha256)throw Error('Existing archive differs: '+item.path);console.log('VERIFIED '+item.path);continue;}
  const parts=item.parts.map(p=>{const file=locate(p.path);if(fs.statSync(file).size!==p.bytes||sha(file)!==p.sha256)throw Error('Part checksum mismatch: '+p.path);return file;});
  console.log((apply?'ASSEMBLE ':'DRY-RUN assemble ')+item.path+' from '+parts.length+' verified parts');
  if(!apply)continue;
  fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});const tmp=dest+'.part';const out=fs.openSync(tmp,'wx',0o600),buffer=Buffer.alloc(1024*1024);
  try{for(const p of parts){const input=fs.openSync(p,'r');try{let n;while((n=fs.readSync(input,buffer,0,buffer.length,null)))fs.writeSync(out,buffer,0,n);}finally{fs.closeSync(input);}}}finally{fs.closeSync(out);}
  if(fs.statSync(tmp).size!==item.bytes||sha(tmp)!==item.sha256){fs.unlinkSync(tmp);throw Error('Assembled archive checksum mismatch');}
  fs.renameSync(tmp,dest);
 }
}catch(e){console.error('ASSEMBLY FAILED: '+e.message);process.exitCode=1;}
