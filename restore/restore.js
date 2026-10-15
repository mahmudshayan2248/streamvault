#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),cp=require('child_process');
const a={};for(let i=2;i<process.argv.length;i++){let k=process.argv[i];if(!k.startsWith('--'))throw Error('Use named options');a[k.slice(2)]=process.argv[i+1]&&!process.argv[i+1].startsWith('--')?process.argv[++i]:true;}
const root=path.resolve(a.snapshot||path.join(__dirname,'..'));
function hash(p){const h=crypto.createHash('sha256'),fd=fs.openSync(p,'r'),b=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}}
function inside(base,rel){const p=path.resolve(base,rel);if(!p.startsWith(base+path.sep))throw Error('Unsafe manifest path');return p;}
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{stdio:'inherit',...opts});if(r.error)throw r.error;if(r.status!==0)throw Error(cmd+' failed with status '+r.status);}
function executable(cmd,args=['--version']){const r=cp.spawnSync(cmd,args,{encoding:'utf8'});return !r.error&&r.status===0;}
function main(){
 if(a.help){console.log('node restore/restore.js --snapshot PATH [--component frontend] [--target NEW_DIRECTORY] [--private-key KEY.pem] [--dry-run|--apply] [--import-db --db-name sv_restore_NAME --db-host 127.0.0.1 --db-user USER]');return;}
 if(a.apply&&a['dry-run'])throw Error('Choose --apply or --dry-run, not both');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 or newer required');
 const m=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json'),'utf8'));
 for(const f of m.artifacts){const p=inside(root,f.path);if(!fs.existsSync(p)||fs.statSync(p).size!==f.bytes||hash(p)!==f.sha256)throw Error('Integrity failure: '+f.path);}
 console.log('Verified '+m.artifacts.length+' artifacts. Snapshot status: '+m.status);
 if(a.verify&&!a.apply&&!a.target)return;
 const component=a.component||'frontend';const selected=m.artifacts.filter(f=>f.component===component&&f.restore===true);
 if(!selected.length)throw Error('No captured, restorable artifact for component '+component+'. Source references are not deployed backend backups.');
 const target=path.resolve(a.target||path.join(os.homedir(),'streamvault-stage2-isolated-restore'));
 if(target===root||target===path.parse(target).root||target===os.homedir())throw Error('Unsafe target');
 const marker=path.join(target,'.streamvault-restore.json');
 if(fs.existsSync(target)){
  if(fs.existsSync(marker)&&JSON.parse(fs.readFileSync(marker)).snapshot_id===m.snapshot_id){
   const old=JSON.parse(fs.readFileSync(marker));
   if(old.artifact_sha256!==selected[0].sha256)throw Error('Existing restore differs');
   for(const entry of old.files||[]){const p=inside(target,entry.path);if(!fs.existsSync(p)||hash(p)!==entry.sha256)throw Error('Existing restored file differs: '+entry.path);}
   console.log('Matching isolated restore already exists. No overwrite performed.');return;
  }
  throw Error('Target already exists; choose a new isolated directory');
 }
 const python=executable('python3')?'python3':executable('python')?'python':null;
 const vendorAge=path.join(root,'tools','age',process.platform+'-'+({x64:'amd64',arm64:'arm64'}[process.arch]||process.arch),'age'+(process.platform==='win32'?'.exe':''));
 const age=a['age-binary']||(fs.existsSync(vendorAge)?vendorAge:'age');
 console.log(JSON.stringify({mode:a.apply?'APPLY':'DRY-RUN',component,target,platform:process.platform,python,age,artifacts:selected.map(f=>f.path),actions:['authenticate and decrypt age archive','validate member paths and symlink targets','extract into a new private directory','verify restored file hashes','write restore marker'],production_changes:false},null,2));
 if(!a.apply){if(!python)console.log('MISSING prerequisite: Python 3.12+ for safe extraction');return;}
 if(!python)throw Error('Python 3.12+ required');
 if(!a['private-key']||!fs.existsSync(a['private-key']))throw Error('Separate recovery private key required');
 const staging=fs.mkdtempSync(path.join(path.dirname(target),'.sv-restore-'));fs.chmodSync(staging,0o700);
 try{
  for(const f of selected){
   const tar=path.join(staging,'payload.tar.gz');
   run(age,['--decrypt','--identity',path.resolve(a['private-key']),'--output',tar,inside(root,f.path)]);
   if(hash(tar)!==f.plaintext_sha256)throw Error('Decrypted archive checksum mismatch');
   const out=path.join(staging,'tree');
   run(python,[path.join(__dirname,'safe-extract.py'),tar,out]);
   const embedded=path.join(out,'CAPTURE-MEMBERS.json');
   const checks=f.members||(fs.existsSync(embedded)?JSON.parse(fs.readFileSync(embedded,'utf8')).files:[]);for(const entry of checks){const p=inside(out,entry.path);if(!fs.existsSync(p)||hash(p)!==entry.sha256)throw Error('Restored file differs: '+entry.path);}
   if(a['import-db']){
    if(component!=='database')throw Error('--import-db requires --component database');
    const name=a['db-name'];if(!/^sv_restore_[A-Za-z0-9_]+$/.test(name||''))throw Error('Use a new sv_restore_ database name');
    const host=a['db-host']||'127.0.0.1';if(!['127.0.0.1','localhost','::1'].includes(host))throw Error('Automated import is restricted to a disposable local DB');
    const client=executable('mariadb')?'mariadb':executable('mysql')?'mysql':null;if(!client)throw Error('MariaDB/MySQL client missing');
    const sql=path.join(out,'database.sql');const text=fs.readFileSync(sql,'utf8');
    if(/\b(USE|CREATE\s+DATABASE|DROP\s+DATABASE)\b/i.test(text))throw Error('Dump must be database-neutral; refusing cross-schema SQL');
    const flags=['--host',host,'--user',a['db-user']||'root'];
    run(client,[...flags,'--execute','CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4']);
    run(client,[...flags,'--database',name],{stdio:[fs.openSync(sql,'r'),'inherit','inherit']});
   }
   fs.writeFileSync(path.join(out,'.streamvault-restore.json'),JSON.stringify({snapshot_id:m.snapshot_id,artifact_sha256:f.sha256,component,restored_utc:new Date().toISOString(),files_verified:checks.length,files:checks},null,2),{mode:0o600});
   fs.renameSync(out,target);fs.unlinkSync(tar);
  }
  console.log('Isolated restore complete: '+target);
 }finally{fs.rmSync(staging,{recursive:true,force:true});}
}
try{main();}catch(e){console.error('RESTORE FAILED: '+e.message);process.exitCode=1;}
