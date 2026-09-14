# StreamVault stable production baseline V2 — 2026-09-14

THIS IS THE PRE-SUBTITLE-FIX ROLLBACK BASELINE.

Production URL: https://streamvault.fit
Backend URL: https://backend.streamvault.fit

## Exact verified production state

- Frontend stable tag: `streamvault-frontend-stable-2026-09-14-v2`
- Frontend stable SHA: `5d471583f8eb863f82351d2bc944901f7247cda4`
- Frontend deployment branch: `origin/hostinger-frontend-only`
- Backend stable tag: `streamvault-backend-stable-2026-09-14-v2`
- Backend stable SHA: `cf481b068f6fc93365e5b103b8769ff6e29e7881`
- Backend deployment/checkpoint branch recorded from prior production baseline: `checkpoint/production-running-20260913-221601`
- Manifest tag: `streamvault-stable-2026-09-14-v2`

## Frontend asset versions observed in production

- App shell: `app-v3.js?v=20260914-controls-autohide-v1`
- PlayerSession: `player-session.js?v=20260913-seek-immediate-stop-v1`
- Player adapter: `player-vlc-v1.js?v=20260914-controls-autohide-v1`
- Player CSS: `player-vlc-v1.css?v=20260912-media-engine-v2`

## Backend `/api/version` observed in production

```json
{"ok":true,"version":"title-details-route-active","build":"20260624-lite-ui-preview-cleanup2"}
```

The endpoint includes a live `time` field and does not expose a Git SHA. SSH authentication to `streamvault-mini` was unavailable during this checkpoint, so the backend SHA is the previously verified production backend commit. The public backend version/build and playback status endpoints were live and matched the prior production baseline, and no backend deployment was performed for the auto-hide frontend release.

## Verified working features before subtitle work

- fast playback startup
- improved buffering behavior
- reliable seek bar
- immediate seek presentation stop
- direct playback path
- compatibility/HLS playback path
- source resolution
- canonical remote-source recovery
- multi-audio switching, including Hindi ↔ English during playback
- VLC-like 5-second control auto-hide
- current player UI baseline

## Rollback instructions

### Frontend rollback

```bash
git fetch origin --tags
git checkout streamvault-frontend-stable-2026-09-14-v2
# Deploy the Hostinger frontend from this checked-out frontend state using the existing frontend deployment path.
```

### Backend rollback

On the backend machine:

```powershell
cd "C:\Users\Mac Mini\Desktop\Website Host\Streaming_Website\streamvault"
git fetch origin --tags
git checkout streamvault-backend-stable-2026-09-14-v2
# Restart the backend service using the existing production backend start procedure only when performing the rollback.
```

## Notes

- Creating this V2 checkpoint did not deploy frontend changes.
- Creating this V2 checkpoint did not restart the backend.
- Existing historical stable tags remain unchanged:
  - `streamvault-frontend-stable-2026-09-14`
  - `streamvault-backend-stable-2026-09-14`
  - `streamvault-stable-2026-09-14`
- Subtitle work must roll back to these V2 tags if it regresses playback, seeking, buffering, source resolution, A/V sync, or multi-audio.
