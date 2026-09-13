'use strict';

require('dotenv').config({ path: '.env.hostinger' });

const fs = require('fs');
const os = require('os');
const path = require('path');
const ftp = require('basic-ftp');

async function main() {
  for (const name of ['HOSTINGER_FTP_HOST', 'HOSTINGER_FTP_USER', 'HOSTINGER_FTP_PASS']) {
    if (!process.env[name]) throw new Error(`Missing ${name}`);
  }
  let client;
  const root = process.env.HOSTINGER_FTP_ROOT || '/public_html';
  const staging = path.join(os.tmpdir(), 'streamvault-production-index-download-v2.html');
  try {
    const maxAttempts = process.argv.includes('--once') ? 1 : 8;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      client = new ftp.Client(120000);
      try {
        await client.access({
          host: process.env.HOSTINGER_FTP_HOST,
          user: process.env.HOSTINGER_FTP_USER,
          password: process.env.HOSTINGER_FTP_PASS,
          secure: process.argv.includes('--secure'),
          ...(process.argv.includes('--secure') ? { secureOptions: { rejectUnauthorized: false } } : {}),
        });
        break;
      } catch (error) {
        client.close();
        client = null;
        if (attempt === maxAttempts) throw error;
        console.warn(`Hostinger FTP login attempt ${attempt} failed; retrying`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }
    await client.downloadTo(staging, path.posix.join(root, 'index.html'));
    let index = fs.readFileSync(staging, 'utf8');
    const tag = '<script defer src="/media-download-launch-v2.js?v=20260825-episode-download-v2"></script>';
    if (!index.includes('/media-download-launch-v2.js')) {
      const marker = /(<script[^>]+src=["']\/series-modal-episodes-v7\.js[^>]*><\/script>)/i;
      if (!marker.test(index)) throw new Error('Production series modal script marker was not found');
      index = index.replace(marker, `$1\n${tag}`);
      fs.writeFileSync(staging, index);
    }
    await client.uploadFrom(
      path.join('hostinger', 'media-download-launch-v2.js'),
      path.posix.join(root, 'media-download-launch-v2.js')
    );
    await client.uploadFrom(staging, path.posix.join(root, 'index.html'));
    console.log('Uploaded media-download-launch-v2.js and patched production index.html');
  } finally {
    client?.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
