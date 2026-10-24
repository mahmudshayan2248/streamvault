# Desktop adaptive streaming: final local validation, 2026-10-23

## Status

**Local candidate ready for review; production deployment is not yet safe.** No Mac mini file, process, credential, cache, or Hostinger deployment was changed. The desktop frontend and loopback adaptive preview remain functional. This report extends the earlier investigation in `desktop-streaming-repair-20261023.md`; earlier statements that SSH was unavailable describe that earlier snapshot.

## Connectivity and exact backend

Local Tailscale was `Stopped` although its existing node key and route settings were retained. `tailscale up --accept-routes` restored the existing connection without reauthentication or configuration reset. The Mac mini at `100.110.28.30` answered Tailscale ping. SSH initially denied the default identity; read-only SSH using the already present `~/.ssh/streamvault_codex` identity succeeded. Neither authentication nor Mac mini services were changed.

Windows PID 6832 was running `node.exe server.js`, started 2026-10-13 12:19:58 UTC from `C:\Users\Mac Mini\Desktop\Website Host\Streaming_Website\streamvault`. The checkout reported branch `codex/catalog-metadata-prod-20260923`, HEAD `73b03bc71bc38827328fec3e7ebe0e6e3f295963`, and many uncommitted files. The exact disk bytes, both last modified before process start, were:

| File | SHA-256 |
| --- | --- |
| `server.js` | `089ae5a8702796209561671253c091f2aa2b7daeff4ebdc3c3e76016faa2a154` |
| `lib/playback-capability.js` | `920b8058eecf9993c3ab18124505f891cad4d355236f5ddcd458be54d357dbd4` |

The running source installs `lib/playback-capability.js` with canonical local/movie/episode lookup and approved remote catalog resolution. It exposes `/api/playback/:id`, `/api/playback/remote`, `/api/playback/status`, `/api/playback-hls/:key/master.m3u8`, release/assets, and subtitle routes. The checkout's `server.js` has incompatible capability routes and must not replace this running server. The deployed capability creates one HLS video rendition per source/seek window; deep seeks can create separate transcodes. Its source defaults are two HLS workers, two transcoding threads, four-second segments, 1 GiB minimum free space, and six-hour stale cache cleanup. The launcher did not override these values; the effective environment of the running process was not independently extracted. FFmpeg is `C:\ffmpeg\bin\ffmpeg.exe`, version 8.1 essentials build.

Read-only Mac mini capacity snapshot: Intel i5-2415M, 2 cores/4 logical processors; 8.30 GB visible RAM, 3.74 GB free; 67.02 GB free on C:; Node working set 806 MB; zero FFmpeg processes at observation. `/api/playback/status` returned 123 registered sessions (25 complete, 98 idle), zero active workers. This is one instant, not a sustained concurrency limit. A safe number of simultaneous uncached transcodes or cached viewers on the Mac mini remains **unmeasured**. The offline packager limits itself to one FFmpeg child per cache root and one encoding thread per child; scheduling such a job while production is busy still requires an operator capacity window.

## Candidate architecture and remaining route gate

`lib/adaptive-hls.js` packages an approved source once into aligned 360p/480p/720p/1080p fMP4 VOD renditions and separate AAC tracks. It never starts FFmpeg from a playback request. Source identity changes select a new cache key; completed packages are published by directory rename. Before publication, Windows absolute FFmpeg init/segment paths are normalized and validated as relative HLS URLs. A global exclusive encode lock prevents duplicate jobs in the same cache root. Jobs enforce a deadline, total cache byte cap, and free-space reserve. The new eviction pass removes oldest completed packages only after 20 minutes without access, protects active HTTP readers and selected playback capabilities for up to two hours or until release, and refuses new encoding when recent playback or disk pressure leaves no safe eviction candidate. `complete.json` access times persist eviction order across process restarts. A single coordinator/cache root is assumed; this is not distributed locking.

`lib/adaptive-capability.js` is a passive completed-cache selector. `scripts/build-adaptive-capability-candidate.py` accepts only the exact deployed capability SHA-256 above and generates an isolated replacement module; it does not edit the running backend. With `SV_ADAPTIVE_HLS_ENABLED=1`, the generated module adds `/api/adaptive-hls/:key/*` and advertises a completed package through the existing capability JSON. If no matching package exists, it retains the current direct or single-rendition HLS decision. `?adaptive=0` keeps the original path for a request. Subtitles use a full-title timeline, and `/api/playback/status` includes selected offline packages. The generated candidate passed a local route-shape smoke test with an exact-byte backend snapshot. It has **not** run in the Mac mini process.

For local media, the package key includes canonical file path, size, and modification time. Remote FTP/HTTP package selection requires an explicit approved hostname, a 64-digit operator source version, and an expiring (24-hour) binding to the catalog URL fingerprint. `scripts/adaptive-hls-prepare.js` creates the package and binding offline; playback cannot create either. The operator must establish that the source version still identifies the same remote bytes. A changing URL target without updated catalog/version information is a remaining correctness risk; the expiry bounds reuse but does not prove immutability.

## Measured local performance

Both cold numbers are 12-second synthetic 1920×1080, two-audio-track development-Mac jobs. They are separate runs, so the small timing difference is **not** evidence of a transcoder speedup. The current changes optimize cache reuse and capacity behavior, not the x264 codec.

| Run | Cold encode | Peak FFmpeg CPU | Peak RSS | Result |
| --- | ---: | ---: | ---: | --- |
| Earlier v2 benchmark | 21.7 s | 205.3% | 199 MiB | Four completed renditions |
| Current `scripts/benchmark-adaptive-hls.js` | 19.79 s | 255.7% | 196.5 MiB | Four completed renditions; 10.56 MB cache |

The current identical-source warm lookup took 0.68 ms. Ten concurrent loopback clients fetched one cached 360p segment in 96.7 ms total, and active read references returned to zero. A separate browser replay counted 41 completed-package asset hits, zero misses (100% local cache hit rate), and 27.6 MB served; this count excludes API and subtitle requests. This proves local cached serving only; it is not a Mac mini load test. Since 19.79 seconds of cold work produces 12 seconds of video, uncached four-rendition encoding cannot sustain live playback. Pre-transcoding and cache reuse are required. The completed VOD package supports immediate indexed seeking to any position; requested position priority for an incomplete package is intentionally not exposed as a live stream.

## Chrome playback on the same synthetic title and loopback backend

Chrome HTTP cache was disabled, with CDP network emulation and 100 ms latency unless noted. The same 60-second title and backend were used for the single-1080p and adaptive comparison. This is synthetic throttling, **not real mobile data**. Startup is the player `READY` interval. Bitrate levels are the completed package's measured peak values (360p 419 kbps, 480p 831 kbps, 720p 2,028 kbps, 1080p 4,055 kbps).

| Simulated link | Adaptive startup | Selected level | Observation |
| --- | ---: | --- | --- |
| 20 Mbps | 7.99 s | 1080p | 7.15 media seconds at 15.2 s wall, no stall |
| 5 Mbps | 10.41 s | 720p | 6.72 media seconds at 17.2 s wall, no stall; one nonfatal request error |
| 1 Mbps | 11.49 s | 360p | 6.65 media seconds at 18.2 s wall, no stall; two nonfatal aborted requests |
| 500 Kbps | 12.23 s | 360p | Reached 55.16 media seconds with 4.92 s buffered and no recorded stall |
| 500 Kbps, 1080p-only | Still not ready at 57.06 s | 1080p | Time stayed 0; one fragment timeout |

During 1 → 0.5 → 20 Mbps changes, playback advanced from 27.49 to 37.52 seconds with no stall; quality stayed at 360p because the short clip had already buffered. During an offline period, seeking to 36.83 seconds of unbuffered media entered `BUFFERING` with zero buffer and fragment errors. Eighteen seconds after restoring 500 Kbps, it had resumed to 51.69 seconds with 8.39 seconds buffered. One eight-millisecond stall was recorded around the seek. Manual 480p and second-audio selection, Auto reset, paused +10/−10 second seeks, pause/resume, and WebVTT cue display were verified in Chrome. The preview harness initially lacked `fetchText`; it was fixed and the active cue `Second caption` was observed with zero subtitle errors. Browser audio audibility/lip-sync and progress persistence were not independently measured.

One later 20 Mbps emulated replay reported `bufferSeekOverHole` and `bufferStalledError` and remained at 0.18 seconds despite a full buffer. Clearing Chrome network emulation restored playback; a controlled repeat at 20 Mbps advanced to 8.24 seconds after 16.2 seconds wall with no error or stall. The cause of the intermittent first-frame stall is **unresolved** and is an additional release blocker. The 20 Mbps table row above records the earlier clean run, not a guarantee of repeatability.

The 60-second fixture cannot establish 10-minute sustained playback. Safari, real FTP/BDIX, a real movie/series pair, real mobile data, playback progress persistence, remote subtitle selection, and production FFmpeg cleanup after adaptive use remain acceptance gates. The local HTTP remote-stage test validates a loopback remote source with a subtitle stream and two audio streams; it is not an FTP/BDIX acceptance test.

## Regression and preview

Passed: adaptive HLS tests (source boundaries, cache eviction/holds, Windows playlist normalization, four profiles, aligned media, dual audio, remote HTTP staging, byte ranges); passive capability test; network recovery tests; 17 audio-language tests; 16 frontend playback-session tests; audio playback boundaries; media modal UI; Hostinger frontend boundary and runtime resilience. `scripts/adaptive-hls-prepare.js` reused the existing 60-second package with the expected key. Generated exact-backend candidate passed `node --check` and a local mocked capability/status/release route smoke test.

Inherited broad-suite failures: `test:player-ui` expects a seek-row loading indicator; `test:runtime-handler-paths` cannot extract production function `play`; `hostinger/test-service-worker-caching.js` reports `/api/ready` unhandled. None of their source/test files changed after `576e3c3`. `npm run test:playback` stops at the first failure. These are not evidence that adaptive playback works, and should be handled separately before a production release gate.

Working local preview URLs: `http://127.0.0.1:8765/`, `http://127.0.0.1:8765/adaptive-preview.html`, and the controlled single-rendition comparison `http://127.0.0.1:8765/adaptive-preview.html?single=1`. The preview backend responds at `http://127.0.0.1:8766/api/playback/preview`. Preview playback makes loopback requests only; the main frontend preview still points to the existing production backend for normal titles.

## Proposed deployment and rollback, approval required

1. Preserve the current Mac mini `server.js`, `lib/playback-capability.js`, launcher, environment, and cache in a dated, immutable backup; confirm the two hashes above and actual process route responses again immediately before deployment. Abort on drift.
2. In an isolated directory, run `python3 scripts/build-adaptive-capability-candidate.py --input <exact-backend-snapshot>/playback-capability.js --output <staging>/lib/playback-capability.js`. Stage that output with `lib/adaptive-hls.js` and `lib/adaptive-capability.js`, leaving `server.js` and all other production functions untouched. Run the exact-backend test suite and syntax checks against this staged tree.
3. Configure an owner-only/ACL-restricted cache root, explicit frontend origin, and free-space/cache limits. Pre-transcode one approved local title during an operator-selected low-load window using `scripts/adaptive-hls-prepare.js`. For remote titles, approve hostname and source version, stage once, and write the expiring binding. Verify hashes, tracks, aligned segments, and cache free space before enabling the flag.
4. After separate deployment approval, temporarily replace only the capability module and add the two new passive modules; restart the service under observation with `SV_ADAPTIVE_HLS_ENABLED=0`. Check the existing routes and direct/HLS playback first. Enable the flag only for controlled canary traffic, then run real Chrome/Safari, local/series/FTP, 10-minute, mobile-data, concurrent-viewer, CPU/RAM/disk, and cleanup tests. Hold the release if any gate fails.
5. Roll back by setting `SV_ADAPTIVE_HLS_ENABLED=0`, restoring the exact saved module, and restarting under observation. Verify original routes and playback; retain the new cache for inspection. Frontend rollback, if needed, restores `player-session.js` and `index.html` from `1f33c04888ef9235c9b882cee2b30779cdb348b9`.

Feature-branch push audit: the branch's eight workflow files target `hostinger-frontend-only` only; no feature-branch deployment job or deployment environment was found. GitHub reported no repository webhooks. `master` has no `.github/workflows` tree in the fetched commit. After the feature push, GitHub nevertheless recorded failed Actions run `39979759658` for `fix-series-detail.yml` on this branch. Its check suite contained **zero jobs/check runs and no log**, so no deployment step executed; the exact reason GitHub created the failed run remains unclear. The production frontend branch remained at `1f33c04888ef9235c9b882cee2b30779cdb348b9`, and the Mac mini backend hashes above were unchanged. No merge, deployment, or production modification is authorized by this push.
