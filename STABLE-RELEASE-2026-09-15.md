# INVALID STABLE RELEASE â€” DO NOT USE AS KNOWN-GOOD ROLLBACK

Manual user verification after tagging showed subtitles still do not render.

2026-09-15 release status: **FAILED USER ACCEPTANCE â€” SUBTITLES NOT VISIBLE IN NORMAL USER BROWSER.**

These published tags are forensic/checkpoint snapshots only and must not be treated as approved rollback baselines:

- `streamvault-frontend-stable-2026-09-15`
- `streamvault-backend-stable-2026-09-15`
- `streamvault-stable-2026-09-15`

Do not move these existing published tags. A future stable baseline requires user manual confirmation after normal-browser verification.

---
# StreamVault stable production baseline â€” 2026-09-15

Production URL: https://streamvault.fit
Backend URL: https://backend.streamvault.fit

## Exact verified production state

- Frontend stable tag: `streamvault-frontend-stable-2026-09-15`
- Frontend stable SHA: `531969a19df83c7f4fdce93a76ad5edf28fee0be`
- Frontend deployed asset versions:
  - `app-v3.js?v=20260914-controls-autohide-v1`
  - `player-session.js?v=20260915-subtitle-continuity-v4`
  - `player-vlc-v1.js?v=20260914-bitmap-subtitles-v1`
- Frontend deployed asset SHA256:
  - `app-v3.js`: `63f0eb5223b93f3537b410c1a4a4a4779aeab2036d7833be0a18d583cc621001`
  - `player-session.js`: `d0a300a76aa32d018277b0da02e9056622b4eab609b05a335df8f18ebed4c7dc`
  - `player-vlc-v1.js`: `cb766a563f903e6baf99f5e25cf9270d19110d2381f8ef936dec5d142aa113e8`
- Backend stable tag: `streamvault-backend-stable-2026-09-15`
- Backend stable SHA: `f3837a6add62b603fb14b15ee6599f471ec8adc1`
- Backend deployed subtitle file: `lib/playback-capability.js`
- Backend deployed subtitle file blob: `a4768d0d23bd3f97f7a1804b507a1a41acaeea8c`
- Backend parent production HEAD before checkpoint: `374fa19205d370c0a6bc607c089cd6e6f6103eb6`
- Bitmap subtitle version: `bitmap-subtitles-v9-versioned-manifest-url`
- Combined release tag: `streamvault-stable-2026-09-15`

Frontend and backend are intentionally recorded as separate stable tags because production uses different deployed commits/histories for frontend assets and backend code.

## Production health at checkpoint

- Frontend `https://streamvault.fit`: HTTP 200
- Backend `/api/version`: HTTP 200

```json
{"ok":true,"version":"title-details-route-active","build":"20260624-lite-ui-preview-cleanup2"}
```

- Backend `/api/playback/status`: HTTP 200
- `activeWorkers`: `0`
- `subtitleJobs`: `0`
- `bitmapSubtitleJobs`: `0`
- Backend Node process: running as `server.js`, PID `8000` at checkpoint
- Cloudflare tunnel: running at checkpoint
- FFmpeg/ffprobe orphan processes: none observed at checkpoint

## Verified working features

- normal production player path opens and plays media
- visible bitmap DVD subtitles render on Iron Man (2008)
- bitmap subtitle rows are selectable through the real CC menu
- bitmap subtitles continue across dense cue windows
- bitmap subtitles survive seek forward/back and deep seek
- Off removes subtitles immediately
- fullscreen subtitle rendering works
- text/WebVTT subtitles still work
- Hindi/English multi-audio still works with subtitles enabled
- direct playback remains working
- compatibility/HLS playback remains working
- seek bar and seeking remain working
- 5-second control auto-hide remains working while subtitles continue
- no subtitle extraction workers remained active after verification

## Rollback commands

### Frontend rollback

```bash
git fetch origin --tags
git checkout streamvault-frontend-stable-2026-09-15
# Deploy Hostinger/frontend assets using the existing production frontend deployment path.
```

### Backend rollback

On the backend machine:

```powershell
cd "C:\Users\Mac Mini\Desktop\Website Host\Streaming_Website\streamvault"
git fetch origin --tags
git checkout streamvault-backend-stable-2026-09-15
# Restart the backend service using the existing production backend start procedure only when intentionally rolling back.
```

### Combined release manifest

```bash
git fetch origin --tags
git checkout streamvault-stable-2026-09-15
cat STABLE-RELEASE-2026-09-15.md
```

## Notes

- This checkpoint records the already verified production state only.
- No playback, seeking, HLS, multi-audio, subtitle behavior, buffering, or source-resolution functionality was changed while creating this release record.
- The backend code checkpoint committed only the deployed `lib/playback-capability.js` subtitle backend changes; unrelated operational/cache/checkpoint dirty files were preserved.
- Creating this checkpoint did not redeploy frontend code and did not restart the backend.

