'use strict';
// Synthetic encoding contract test. It verifies output, not Mac mini production throughput.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getDesktopProfile } = require('../lib/desktop-quality');
const hasTool = name => spawnSync(name, ['-version'], {timeout:3000}).status === 0;

test('FFmpeg emits playable H.264/AAC HLS in both desktop low-data tiers', {skip: !hasTool('ffmpeg') || !hasTool('ffprobe'), timeout:60000}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-desktop-hls-'));
  try {
    const source = path.join(temp, 'input.mp4');
    let result = spawnSync('ffmpeg', [
      '-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=24',
      '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','5',
      '-c:v','libx264','-preset','ultrafast','-c:a','aac','-y',source
    ], {timeout:20000, encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    for (const quality of ['480p','360p']) {
      const profile = getDesktopProfile(quality);
      const dir = path.join(temp, quality);
      fs.mkdirSync(dir);
      result = spawnSync('ffmpeg', [
        '-hide_banner','-loglevel','error','-nostdin','-readrate','1.25','-i',source,
        '-map','0:v:0','-map','0:a:0?','-sn','-dn',
        '-vf',`scale=w=min(${profile.width}\\,iw):h=-2,fps=${profile.fps}`,
        '-c:v','libx264','-preset','ultrafast','-tune','zerolatency',
        '-threads','1','-filter_threads','1','-profile:v','baseline','-level','3.1',
        '-crf',String(profile.crf),'-maxrate',profile.videoRate,
        '-bufsize',profile.bufferRate,'-pix_fmt','yuv420p',
        '-g','48','-keyint_min','48','-sc_threshold','0',
        '-c:a','aac','-b:a',profile.audioRate,'-ar','48000','-ac','2',
        '-f','hls','-hls_time','3','-hls_list_size','0','-hls_flags','independent_segments',
        '-hls_segment_filename',path.join(dir,'seg_%05d.ts'),path.join(dir,'index.m3u8')
      ], {timeout:20000, encoding:'utf8'});
      assert.equal(result.status, 0, result.stderr);
      const playlist = fs.readFileSync(path.join(dir,'index.m3u8'),'utf8');
      assert.match(playlist, /#EXTINF/);
      const segments = fs.readdirSync(dir).filter(n => n.endsWith('.ts'));
      assert.ok(segments.length > 0);
      const probe = spawnSync('ffprobe', [
        '-v','error','-select_streams','v:0','-show_entries','stream=width',
        '-of','default=noprint_wrappers=1:nokey=1',path.join(dir,segments[0])
      ],{encoding:'utf8',timeout:3000});
      assert.equal(Number(probe.stdout.trim()), profile.width);
    }
  } finally { fs.rmSync(temp, {recursive:true, force:true}); }
});
