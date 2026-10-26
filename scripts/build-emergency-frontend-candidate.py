#!/usr/bin/env python3
"""Prepare an isolated frontend candidate from hash-verified production files."""
import argparse
import hashlib
import json
from pathlib import Path

HASHES = {
    'index.html': 'd713dc48b5a85eba029244d0c9fd4205f2e2c964eb509219652416a0401b222c',
    'app-v3.js': '8fed3fb9cfc32cb4067c1a7cb3c85d80b2addcff4d36261d34b50f1b97c947f5',
    'player-session.js': '3bf5872c595df24932a6e5e94072d240d38323bf08f7aacc8ea160b567204ff8',
    'player-vlc-v1.js': '743c3aed5eb8580d006603bd2cf559bb0c6a94dfd27c79a5d21c987285ed37a2',
}

def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Production anchor drift: ' + repr(old[:80]))
    return text.replace(old, new, 1)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    if a.source.resolve()==a.output.resolve():
        raise ValueError('Use an isolated output directory')
    repo=Path(__file__).resolve().parent.parent
    sources={name:(a.source/name).read_bytes() for name in HASHES}
    for name,data in sources.items():
        if hashlib.sha256(data).hexdigest()!=HASHES[name]:
            raise ValueError('Production hash drift: '+name)
    app=sources['app-v3.js'].decode()
    local_app=(repo/'hostinger/app-v3.js').read_text()
    start=local_app.index('function updateWatchProgress(')
    end=local_app.index('\nlet availableAudio',start)
    app=once(app,'function updateWatchProgress(id, currentTime, duration){}',local_app[start:end])
    app=once(app,'  seekToTime(playbackTime()+s);',
        '  if(window.playerSession?.active) window.playerSession.seekBy(s);\n  else seekToTime(playbackTime()+s);')
    app=once(app,'function setQuality(q){\n  if(window.playerSession && !isLiveMode) return;',
        "function setQuality(q){\n  if(window.playerSession?.active && !isLiveMode) {\n    if(!window.playerSession.setQuality(q))showToast('Quality option is unavailable for this stream.');\n    closeAllDropdowns();\n    return;\n  }")
    app=once(app,'    function commit(){\n      flushQueuedVisual();',
        "    function commit(event){\n      flushQueuedVisual();\n      const point=event?.changedTouches?.[0]||event;\n      if(Number.isFinite(point?.clientX) && dur()) visual(getP(event),dur());")
    app=once(app,"    pw.addEventListener('mousemove',e=>{\n      if(!progressDragging)return;", "    document.addEventListener('mousemove',e=>{\n      if(!progressDragging)return;")
    app=once(app,"document.addEventListener('mouseup',()=>{if(progressDragging)commit();});", "document.addEventListener('mouseup',e=>{if(progressDragging)commit(e);});")
    app=once(app,"    pw.addEventListener('touchend',()=>{", "    pw.addEventListener('touchend',e=>{")
    app=once(app,'        commit();\n        hideSeekPreview();', '        commit(e);\n        hideSeekPreview();')
    index=sources['index.html'].decode()
    local=(repo/'hostinger/index.html').read_text()
    start=local.index('          <div class="player-tool-wrap quality-tool"')
    end=local.index('          <div class="player-tool-wrap speed-tool"',start)
    anchor='          <div class="player-tool-wrap speed-tool"'
    index=once(index,anchor,local[start:end]+anchor)
    outputs={'app-v3.js':app.encode()}
    for name in ['player-session.js','player-vlc-v1.js']:
        outputs[name]=(repo/'hostinger'/name).read_bytes()
    # Content-addressed URLs avoid stale intermediary and service-worker assets.
    for name,data in outputs.items():
        import re
        pattern=re.compile(r'(/'+re.escape(name)+r')\?v=[^"\s]+')
        if len(pattern.findall(index))!=1:
            raise ValueError('Asset reference drift: '+name)
        index=pattern.sub(lambda m:m[1]+'?v='+hashlib.sha256(data).hexdigest()[:16],index)
    outputs['index.html']=index.encode()
    a.output.mkdir(parents=True,exist_ok=True)
    manifest={}
    for name,data in outputs.items():
        (a.output/name).write_bytes(data)
        manifest[name]={'before':HASHES[name],'after':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
    (a.output/'candidate-hashes.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))

if __name__=='__main__':main()
