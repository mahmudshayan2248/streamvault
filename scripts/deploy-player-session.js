'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ftp = require('basic-ftp');
const dotenv = require('dotenv');
const acorn = require('acorn');
const {migrateApp,migrateIndex} = require('./migrate-player-session');

dotenv.config({path:path.join(__dirname,'..','.env.hostinger'),quiet:true});

const RELEASE = '20260912-media-engine-v2';
const ORIGIN = String(process.env.STREAMVAULT_PRODUCTION_ORIGIN || 'https://streamvault.fit').replace(/\/$/,'');
const deploy = process.argv.includes('--deploy');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0,16);
}

async function download(name) {
  const response = await fetch(`${ORIGIN}/${name}?deploy_source=${Date.now()}`, {cache:'no-store'});
  if(!response.ok) throw new Error(`Could not download production ${name} (${response.status})`);
  return response.text();
}

function releaseIndex(source) {
  const prefix = `/releases/${RELEASE}`;
  return source
    .replace(/\/app-v3\.js\?v=[^"']+/g, `${prefix}/app-v3.js?v=${RELEASE}`)
    .replace(/\/player-session\.js\?v=[^"']+/g, `${prefix}/player-session.js?v=${RELEASE}`)
    .replace(/\/player-vlc-v1\.js\?v=[^"']+/g, `${prefix}/player-vlc-v1.js?v=${RELEASE}`)
    .replace(/\/player-vlc-v1\.css\?v=[^"']+/g, `${prefix}/player-vlc-v1.css?v=${RELEASE}`);
}

function validate(app,index) {
  acorn.parse(app,{ecmaVersion:'latest',sourceType:'script'});
  if(!app.includes('SV_PLAYER_SESSION_BOUNDARY')) throw new Error('Migrated application does not contain the PlayerSession boundary');
  if(!app.includes('hls.js@1.7.3/dist/hls.min.js') || app.includes('hls.js@latest')) throw new Error('HLS runtime is not pinned');
  for(const retired of ['instant-remux-v23','vod-buffer-engine-v1','playback-stability-hotfix-v2']) {
    if(index.includes(retired)) throw new Error(`Production index still loads ${retired}`);
  }
  for(const asset of ['app-v3.js','player-session.js','player-vlc-v1.js','player-vlc-v1.css']) {
    if(!index.includes(`/releases/${RELEASE}/${asset}`)) throw new Error(`Production index does not reference release ${asset}`);
  }
}

async function stage() {
  const [liveIndex,liveApp] = await Promise.all([download('index.html'),download('app-v3.js')]);
  const app = migrateApp(liveApp);
  const index = releaseIndex(migrateIndex(liveIndex));
  validate(app,index);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),`streamvault-${RELEASE}-`));
  const files = {
    'app-v3.js':app,
    'player-session.js':fs.readFileSync(path.join(__dirname,'..','hostinger','player-session.js'),'utf8'),
    'player-vlc-v1.js':fs.readFileSync(path.join(__dirname,'..','hostinger','player-vlc-v1.js'),'utf8'),
    'player-vlc-v1.css':fs.readFileSync(path.join(__dirname,'..','hostinger','player-vlc-v1.css'),'utf8'),
    'index.html':index,
    'backup-index.html':liveIndex,
    'backup-app-v3.js':liveApp,
  };
  for(const [name,content] of Object.entries(files)) fs.writeFileSync(path.join(directory,name),content);
  return {directory,files};
}

async function upload(directory) {
  const required = ['HOSTINGER_FTP_HOST','HOSTINGER_FTP_USER','HOSTINGER_FTP_PASS','HOSTINGER_FTP_ROOT'];
  const missing = required.filter(name=>!process.env[name]);
  if(missing.length) throw new Error(`Missing deployment settings: ${missing.join(', ')}`);
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host:process.env.HOSTINGER_FTP_HOST,
      user:process.env.HOSTINGER_FTP_USER,
      password:process.env.HOSTINGER_FTP_PASS,
      secure:String(process.env.HOSTINGER_FTP_SECURE||'').toLowerCase()==='true',
    });
    const root = process.env.HOSTINGER_FTP_ROOT.replace(/\/$/,'');
    const releaseRoot = `${root}/releases/${RELEASE}`;
    await client.ensureDir(releaseRoot);
    for(const name of ['app-v3.js','player-session.js','player-vlc-v1.js','player-vlc-v1.css']) {
      await client.uploadFrom(path.join(directory,name),`${releaseRoot}/${name}`);
    }
    // Index is last: until this succeeds, production keeps using the prior release.
    await client.uploadFrom(path.join(directory,'index.html'),`${root}/index.html`);
  } finally {
    client.close();
  }
}

(async()=>{
  const prepared = await stage();
  const manifest = Object.fromEntries(Object.entries(prepared.files).filter(([name])=>!name.startsWith('backup-')).map(([name,content])=>[name,{bytes:Buffer.byteLength(content),sha256:sha256(content)}]));
  console.log(JSON.stringify({release:RELEASE,mode:deploy?'deploy':'dry-run',stagingDirectory:prepared.directory,manifest},null,2));
  if(!deploy) return;
  await upload(prepared.directory);
  console.log(`Deployed ${RELEASE}; production index switched after all release assets uploaded.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
