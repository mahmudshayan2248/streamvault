# StreamVault stable production baseline — 2026-09-14

Production URL: https://streamvault.fit
Backend URL: https://backend.streamvault.fit

## Exact verified production state

- Frontend stable tag: `streamvault-frontend-stable-2026-09-14`
- Frontend stable SHA: `287630ad75833fa3017c59f18d49737e42a65235`
- Frontend branch recorded: `origin/hostinger-frontend-only`
- Backend stable tag: `streamvault-backend-stable-2026-09-14`
- Backend stable SHA: `cf481b068f6fc93365e5b103b8769ff6e29e7881`
- Backend branch recorded: `checkpoint/production-running-20260913-221601`
- PlayerSession asset version: `player-session.js?v=20260913-seek-immediate-stop-v1`
- Player adapter asset version: `player-vlc-v1.js?v=20260912-media-engine-v2`
- Player CSS asset version: `player-vlc-v1.css?v=20260912-media-engine-v2`
- Backend `/api/version` at release time:

```json
{"ok":true,"version":"title-details-route-active","build":"20260624-lite-ui-preview-cleanup2"}
```

Frontend and backend are intentionally recorded as separate stable tags because production uses different commits/histories for the deployed frontend and backend.

## Verified working

- unified PlayerSession playback engine
- reliable seek bar
- immediate seek presentation stop
- stable direct and compatibility playback
- resolved A/V seek synchronization
- working multi-audio
- improved buffering
- canonical playback/download source resolution
- remote-source alternate recovery
- stable series/movie playback

## Rollback instructions

### Frontend rollback

```bash
git fetch origin --tags
git checkout streamvault-frontend-stable-2026-09-14
# Deploy the Hostinger frontend from this checked-out frontend state using the existing frontend deployment path.
```

### Backend rollback

On the backend machine:

```powershell
cd "C:\Users\Mac Mini\Desktop\Website Host\Streaming_Website\streamvault"
git fetch origin --tags
git checkout streamvault-backend-stable-2026-09-14
# Restart the backend service using the existing production backend start procedure only when performing the rollback.
```

## Notes

- This file records the stable release baseline only.
- Creating this checkpoint did not deploy frontend changes and did not restart the backend.
- Existing backend checkpoint history and untracked operational files were preserved.
