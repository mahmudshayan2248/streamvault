'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {migrateApp,migrateIndex} = require('./migrate-player-session');
const origin = 'https://streamvault.fit';
const assets = new Map();
async function upstream(url) {
  if(!assets.has(url)) assets.set(url,fetch(origin+url).then(async response=>({status:response.status,type:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())})).catch(error=>{assets.delete(url);throw error;}));
  return assets.get(url);
}
http.createServer(async (req,res)=>{
  try {
    const pathname = new URL(req.url,'http://localhost').pathname;
    let body, type;
    if(['/player-session.js','/player-vlc-v1.js','/player-vlc-v1.css'].includes(pathname)) {
      body = fs.readFileSync(path.join(__dirname,'../hostinger',pathname.slice(1)));
      type = pathname.endsWith('.css')?'text/css':'application/javascript';
    } else if(pathname === '/' || pathname === '/index.html') {
      body = migrateIndex((await upstream('/')).body.toString()); type = 'text/html';
    } else if(pathname === '/app-v3.js') {
      body = migrateApp((await upstream('/app-v3.js')).body.toString()); type = 'application/javascript';
    } else {
      const result = await upstream(req.url);
      res.statusCode = result.status;
      ({body,type} = result);
    }
    res.setHeader('Content-Type',type || 'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    res.end(body);
  } catch(error) { console.error(error.message); res.writeHead(502); res.end('Preview asset unavailable'); }
}).listen(3199,'127.0.0.1',()=>console.log('PlayerSession production preview: http://127.0.0.1:3199'));
