# Emergency playback repair: new evidence, 26 October 2026

Status: **NOT READY; not deployed.** Production files and processes were not replaced or restarted. Normal authorized playback requests populated the existing subtitle cache.

## Confirmed repairs

- Seek completion previously accepted a timeout as success and committed the requested clock before presentation. It now requires media readiness at the target, reports failure on timeout, and commits the confirmed clock. Startup seeks queue, rapid seeks supersede obsolete operations, relative seeks accumulate, and stale events cannot finish the current seek.
- Timeline release now uses the actual release coordinate and tracks movement outside the timeline.
- Calling `hls.startLoad()` during an active unbuffered seek restarted audio/init loading. With a concurrent track change this produced a cancellation loop. Native HLS seeking now owns scheduling; stopped loaders alone are restarted, after setting currentTime.
- Exact production `updateWatchProgress` was an empty function. Confirmed positions now persist in the existing `sv_progress` store, preserving other history. Preparation and unfinished seeks do not overwrite resume positions.
- Subtitle `force-cache` replayed a failed conversion response. A retry took 34 ms and failed; a no-store request returned HTTP 200 VTT in 18,847 ms. The view now bypasses HTTP cache for retrieval; PlayerSession still caches valid VTT.

## Executed evidence

Chrome, existing desktop browser, local candidate frontend. Network shaping below is browser simulation, **not mobile-data acceptance**.

| Check | Recorded result |
| --- | --- |
| Focused seek/recovery/persistence/subtitle retry tests | 17/17 PASS; Node 26.6.0 |
| Existing frontend playback-session tests | 16/16 PASS |
| Audio playback regression boundaries | PASS |
| Candidate JavaScript syntax and diff whitespace | PASS |
| Real 70.403-second Succession excerpt, audio change + unbuffered seek at 1 Mbps | Before: 233 aborted requests, 14,149 ms. After saved repair/reload: 4 cancellations, 3,416 ms, target 30 seconds reached. Remaining cancellations accompany superseding old fragments. |
| Exact production timeline UI, paused drags | 10%: 7.053865 s/230 ms; 50%: 35.224108 s/231 ms; 90%: 63.349134 s/230 ms. |
| Timeline release outside track | Target 35.224108 s, presented frame 35.208333 s, 155 ms. |
| Actual ±10-second buttons | Presented frames 53.333333, 43.333333, 53.333333; pause intent retained. |
| Close/reopen progress | Saved 0.497137906 of 70.403 s; reopened at 35.016297 s. |
| Page reload progress | Saved 44.237438 s; reopened at 44.247456 s. |
| 500 Kbps cold startup with queued seek to 50 s | Both operations succeeded, 360p, no HLS errors, seek 9,526 ms; total 9,686 ms. |
| Offline seek, reconnect at 1 Mbps | Target 10 s reached in 27,310 ms including outage; paused throughout; two expected nonfatal network errors. Outage duration not independently measured. |
| Full Succession episode, unchanged production backend | Duration 3381.525 s; advancing video and audio observed. Initial startup 76,997 ms, capability request 62,591.6 ms. Warm reopen 8,030 ms. Different cache conditions: not a controlled improvement claim. |
| Full episode deep seek | Target 1690.7625 s, presented frame 1690.73 s, 2,302 ms, paused. Subsequent +10 seek and English audio produced advancing frames/audio bytes. |
| Full episode embedded subtitles | Initial extraction failed. After cache-retry repair, saved candidate reload succeeded: 1,015 cues, showing, one active cue at 11.5 s, no player errors in that run. |
| Local adaptive cache sample | 357 hits, 0 misses, 15,177,404 bytes served; zero encoding workers. Snapshot, not sustained capacity measurement. |

All full-episode checks used the real production capability/HLS endpoints through a **local candidate frontend**, not the deployed public frontend. Adaptive four-rendition checks used the real excerpt with the guarded exact-backend candidate. These are different test environments and must not be conflated.

Final Mac mini sample: zero FFmpeg processes, zero active encoding workers, zero subtitle jobs; 4,190 MiB free of 8,103 MiB RAM. This is an idle cleanup sample, not a capacity limit.

## Exact deployment preparation

Hostinger FTPS origin resolved to `/hbuilds/versions/01a14e3e-1a3d-7053-b94d-c31356cb01b0/nodejs/hostinger`. `/public_html` only contains the Passenger mapping. Certificate verification remained enabled. Exact origin files and all HTML-referenced JS/CSS were captured under `~/Library/Caches/streamvault-emergency-20261026/frontend-origin/`; `.htaccess` was also captured. No origin files were changed.

`build-emergency-frontend-candidate.py` checks the captured production hashes and unique anchors before preparing four changed files. It preserves the live app and autoplay implementation; it does not upload the unrelated branch app wholesale. Content hashes version affected script URLs. Candidate hashes are written to `frontend-candidate/candidate-hashes.json`.

Fresh SSH hashes matched the audit: server `089ae5a8702796209561671253c091f2aa2b7daeff4ebdc3c3e76016faa2a154`; capability `920b8058eecf9993c3ab18124505f891cad4d355236f5ddcd458be54d357dbd4`. Existing exact-backend adaptive candidate remains `8546c4fd295664c4c11b192b479cfa0a33460ef06d5dee8af0f4f8e269e41f30`.

Review-branch push inspection: all eight checked-in workflows target `hostinger-frontend-only`, not this review branch; GitHub reports zero repository webhooks and zero environments. No workflow dispatch or production-branch push was performed.

## Remaining release gates

- Safari is not exposed by the connected browser tooling; native app control is disabled. No Safari acceptance result exists.
- A full-title four-rendition package and production binding have not been prepared/validated. The 70-second package cannot stand in for the 3381-second episode. Production continues its existing single-rendition route; adaptive staging does not imply adaptive production.
- The initial 77-second startup is unresolved. A warm retry is not evidence of cold-start reliability.
- No new movie, external subtitle, sustained capacity, or actual carrier-data acceptance is claimed.

Rollback preparation: before any future replacement, recheck current hashes and capture a fresh backup if drifted. Restore exact captured frontend assets/index together, version rollback URLs, and verify served bytes. For an installed backend candidate, restore the captured capability module/config and restart only the verified Node PID through its existing launcher, then verify health, worker cleanup, and real playback. No rollback was executed because no deployment occurred.
