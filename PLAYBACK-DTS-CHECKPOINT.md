# DTS investigation checkpoint — 2026-09-12

Frontend production assets previously verified at `0028ab0`; unchanged in this continuation.
Packet inference committed and pushed at `b61ed41`. It has not been deployed to the backend.

## Verified in this continuation

- Clean starting working tree; local branch matched its upstream.
- Persisted remote media-info cache now uses schema/directory/key version 3 and rejects missing or invalid `hasBFrames`. Old cache files remain untouched and cannot be selected.
- Eleven targeted capability/cache tests pass; server syntax and diff checks pass.
- Packet inference is independent of missing, zero, or correct cached B-frame depth when subsequent DTS and packet durations exist.
- Two 41 ms durations before DTS 2399.230 infer 2399.148. Matroska millisecond rounding explains the 1 ms difference from reconstructed output DTS 2399.147. Do not report inference as exactly 2399.147 for those rounded inputs.

## Real packet evidence

Re-probed existing real production-source compatibility artifacts with ffprobe, first three packets. These are saved outputs from the prior common-timestamp experiment, not newly generated production results.

| Stream | First PTS (s) | First DTS (s) | First audio PTS minus first video PTS |
| --- | ---: | ---: | ---: |
| Video | 2399.230000 | 2399.147000 | — |
| Hindi AAC | 2399.210667 | 2399.210667 | -19.333 ms |
| English AAC | 2399.233667 | 2399.233667 | +3.667 ms |

Artifacts: `/private/tmp/sv-prod-video-common/video.mp4`, `/private/tmp/sv-prod-common/audio-0.mp4`, `/private/tmp/sv-prod-common/audio-1.mp4`.

The stale origin was 2399.230, 83 ms above the measured decode origin. The inferred origin is 2399.148, 1 ms above it. This is a global mapping correction. Subtracting one shared origin from all streams cannot change their relative PTS differences; thus the measured packet differences above remain mathematically unchanged by this origin correction alone. First packet differences do not measure perceptual lip sync or audio hardware presentation latency. An exact live before/after A/V comparison has NOT been obtained. Do not attribute accumulating audible delay to this fix without that comparison.

## Deployment blocker and remaining acceptance

SSH to 100.110.28.30 timed out. Tailscale reports backend offline (last seen about two hours ago). Public `/api/playback/status` returns HTTP 530 / Cloudflare 1033. No backend files or processes were changed during this continuation. User was asked to restore machine/tunnel availability.

Once reachable, download current remote server.js and apply only the cache-version change, preserving the remote sourceVersion wrapper and unrelated dirty changes. Back up current remote files, deploy lib/playback-capability.js and patched server.js, restart through its existing supervisor, verify health and fresh timing metadata.

Remaining: actual production seeks 300/1200/2400/600/near-end with requested/actual global time, real video/audio PTS/DTS, offset and synchronized-resume latency; 30 real random seeks; five-minute drift; production click/drag/thumb geometry; cold/warm startup and buffering; unchanged multi-audio regression; final continuous 20-minute soak. None are claimed complete by the targeted tests.
