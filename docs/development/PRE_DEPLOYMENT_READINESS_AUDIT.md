# Pre-Deployment Readiness Audit

Date: 2026-06-08

이 문서는 Render 배포 전 backend, frontend, documentation 기준의 준비 상태와 남은 수동 QA 항목을 정리한다. secret 값은 포함하지 않는다.

## Automated Validation

| Area | Command | Result |
|---|---|---|
| Backend | `corepack pnpm --filter @doodle/server typecheck` | PASS |
| Backend | `corepack pnpm --filter @doodle/server test` | PASS, 20 files / 105 tests |
| Frontend | `corepack pnpm --filter @doodle/web typecheck` | PASS |
| Frontend | `corepack pnpm --filter @doodle/web build` | PASS |

## Current Readiness Summary

- Backend API, Socket.IO, cleanup-on-boot, room/profile contracts have automated test coverage.
- Frontend production build succeeds.
- Bootstrap smoke passed in the previous cleanup smoke phase.
- Actual production deployment has not been executed.
- `package-lock.json` remains untracked and must not be committed unless the team intentionally changes npm lockfile policy.

## Required Manual QA Before Deployment

### Auth and profile

- Google login with a real account.
- First login with incomplete profile setup shows nickname modal.
- Nickname validation: 1 character, 13 characters, duplicate nickname.
- Profile avatar URL from Google profile is visible to other room users after profile setup/update.

### Room flow

- Create room from lobby.
- Join room with invite code.
- Room max player behavior: fifth non-spectator waiting-room join returns a user-facing full-room message.
- Waiting-room leave removes participant and their ready/upload requirement.
- Joining during `starting` or `playing` shows spectator behavior.

### Upload and ready

- Upload one image per user.
- Replace uploaded image while room is `waiting`.
- Upload/replace is blocked during `starting` countdown and `playing`.
- All active participants become ready only after each has one active image.

### Socket play flow

- Two browsers/two accounts join the same room.
- Chat works in waiting, starting, playing, and finished states.
- Drawing strokes sync in real time between active participants.
- Spectator can chat but cannot draw.
- Remote cursor display remains non-blocking and does not affect drawing payloads.

### Round/result/gallery

- `start-game` enters countdown, then round starts.
- Timer bar visually progresses during round.
- Round end keeps play page visible and shows result modal.
- `result-saved` populates modal preview.
- Round-to-round transition closes modal naturally.
- Final round transitions to gallery after review delay.
- Gallery result cards can be selected.
- PNG download opens as a valid image file.

### Cleanup staging QA

Follow `docs/development/CLEANUP_STAGING_MANUAL_QA.md` before claiming cleanup deletion confidence.

- Use staging or local test database only.
- Create expired `finished` room test data with linked image/result/GridFS data.
- Compare before/after counts for `rooms`, `images`, `results`, `originalImages.files/chunks`, `resultImages.files/chunks`.
- Confirm active rooms and non-expired finished rooms are not deleted.
- Confirm cleanup logs do not include raw fileId/ObjectId, URI, token, or secret values.

## User Action Required Before Deployment

The user must complete the following outside the repository:

- Create or confirm Render backend service.
- Create or confirm frontend hosting target.
- Register Render environment variables without exposing values in docs or logs.
- Configure Firebase Authentication Google sign-in provider.
- Configure Firebase authorized domains for deployed frontend.
- Configure MongoDB Atlas database user and network access for deployment.
- Register deployed frontend origin in backend `CLIENT_URL`.
- Register deployed frontend origin in Socket.IO `SOCKET_CORS_ORIGIN`.
- Confirm `MONGODB_DB_NAME` points to the intended deployment database.
- Confirm no production data is used for cleanup destructive QA.

## Deployment Risks

| Risk | Status | Mitigation |
|---|---|---|
| Real Google OAuth flow not fully rechecked after latest polish | Manual QA required | Test with real deployed frontend origin. |
| Live upload/result GridFS cleanup not destructively tested | Manual QA required | Use staging/local DB and `CLEANUP_STAGING_MANUAL_QA.md`. |
| Socket behavior across deployed network not checked | Manual QA required | Test two browsers/accounts after deploy. |
| Render free instance sleep may delay first request | Accepted MVP risk | Documented in deployment notes. |
| Single-instance Socket.IO only | Accepted MVP risk | Redis adapter excluded from MVP. |
| `package-lock.json` untracked | Needs decision | Leave untracked for pnpm workspace unless user approves deletion/policy change. |

## Go / No-Go

Automated checks are green. Deployment can proceed only after the user completes external service setup and at least one real manual E2E pass covering login, room, upload, drawing, result, download, and cleanup staging QA.
