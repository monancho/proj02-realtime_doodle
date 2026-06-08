# Troubleshooting

## 기록 원칙

## 이슈 목록

### MongoDB smoke test `ECONNREFUSED`

- 발생 단계: `PHASE-03-MONGODB-SMOKE`
- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 증상: `SMOKE_FAIL server bootstrap failed (Error:ECONNREFUSED)`
- 의미: 서버 bootstrap 중 MongoDB 연결 대상이 연결을 거부했다.
- secret 처리: MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

사용자가 확인할 항목:

- 로컬 `.env`의 `MONGODB_URI`가 Atlas connection string인지 확인
- URI username/password가 실제 Database User와 일치하는지 확인
- MongoDB Atlas Network Access에 현재 로컬 IP가 허용되어 있는지 확인
- cluster가 실행 중인지 확인
- 로컬 방화벽 또는 네트워크에서 Atlas 접속이 막히지 않는지 확인

확인 후 재시도 명령:

```bash
corepack pnpm --filter @doodle/server smoke:bootstrap
```

### MongoDB SRV DNS `querySrv` `ECONNREFUSED`

- 발생 단계: `PHASE-03-MONGODB-SMOKE-DIAGNOSTIC`
- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 증상: `SMOKE_FAIL server bootstrap failed (name=Error code=ECONNREFUSED syscall=querySrv)`
- 추가 확인: Node `dns.resolveSrv()`도 `DNS_SRV_FAIL code=ECONNREFUSED syscall=querySrv`로 실패
- 의미: MongoDB shard의 `27017` 포트 연결 이전에, `mongodb+srv://` connection string이 사용하는 SRV DNS 조회가 Node 런타임에서 거부되고 있다.
- secret 처리: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

사용자가 확인할 항목:

- Windows DNS 서버를 일시적으로 `1.1.1.1` 또는 `8.8.8.8` 같은 public DNS로 변경한 뒤 재시도
- VPN, 보안 DNS, 백신, 방화벽, 공유기 보안 기능이 SRV DNS query를 막는지 확인
- `ipconfig /flushdns` 실행 후 새 터미널에서 재시도
- MongoDB Atlas의 `Connect > Drivers`에서 SRV가 아닌 standard connection string 옵션을 사용할 수 있는지 확인
- standard connection string을 사용할 경우 username/password/full URI를 채팅이나 로그에 출력하지 말고 로컬 `.env`에서만 교체

확인 후 재시도 명령:

```bash
corepack pnpm --filter @doodle/server smoke:bootstrap
```

### MongoDB SRV DNS 우회 성공

- 발생 단계: `PHASE-03-MONGODB-SMOKE-SUCCESS-LOG`
- 이전 증상: `mongodb+srv://` connection string 사용 시 Node DNS SRV 조회가 `querySrv ECONNREFUSED`로 실패
- 해결 방법: MongoDB Atlas standard connection string을 로컬 `.env`의 `MONGODB_URI`에 적용
- 결과: `SMOKE_OK server bootstrap and MongoDB connection succeeded`
- secret 처리: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

운영 메모:

- 같은 로컬 네트워크에서 `mongodb+srv://`가 계속 실패하면 standard connection string 사용을 유지한다.
- DNS 설정을 변경하거나 네트워크 환경이 바뀌면 `mongodb+srv://` 재검증은 가능하지만 필수는 아니다.
- standard connection string도 username/password/full URI를 채팅, 로그, 문서에 기록하지 않는다.

### Render 2-service deployment CORS and localhost build env issue

- Phase: deployment manual QA
- Symptoms:
  - Frontend Static Site called `http://localhost:4000/api/users/me` after deployment.
  - After updating frontend API URL, browser still blocked `https://<backend>.onrender.com/api/users/me` from `https://<frontend>.onrender.com` with missing `Access-Control-Allow-Origin`.
  - Google popup also printed Cross-Origin-Opener-Policy warnings, but those were not the primary failure.
- Cause:
  - Vite `VITE_API_BASE_URL` and `VITE_SOCKET_URL` are build-time values. If they are left as localhost, the deployed frontend keeps calling localhost until the frontend is rebuilt.
  - Backend HTTP CORS uses `CLIENT_URL`; Socket.IO CORS uses `SOCKET_CORS_ORIGIN`. If the deployed frontend URL is missing, uses `http`, has a trailing slash mismatch, or the backend was not restarted/redeployed, preflight is rejected.
  - Render build command with `corepack enable` can fail on read-only filesystem while trying to unlink `/usr/bin/pnpm`.
- Fix checklist:
  - Frontend env: `VITE_API_BASE_URL=https://<backend>.onrender.com` and `VITE_SOCKET_URL=https://<backend>.onrender.com`.
  - Rebuild frontend after changing any `VITE_*` env value. Prefer Clear build cache & deploy when debugging stale assets.
  - Backend env: `CLIENT_URL=https://<frontend>.onrender.com` and `SOCKET_CORS_ORIGIN=https://<frontend>.onrender.com`.
  - Restart/redeploy backend after changing backend env values.
  - Do not include a trailing `/` in origin values.
  - Render build command should omit `corepack enable`; use `corepack pnpm ...` directly.
- Longer-term mitigation:
  - Consider a single Render Web Service where Express serves the Vite `apps/web/dist` output. See `docs/development/SINGLE_RENDER_SERVICE_PLAN.md`.
- Secret handling:
  - Do not paste `.env`, private keys, MongoDB URI, tokens, or service account values into chat/logs/docs.
  - If a private key or MongoDB credential is exposed, rotate it before production use.

### Render single-service root 404 after successful backend start

- Phase: single Render Web Service deployment QA
- Symptom: `/health` can be served by the backend, but `GET /` returns Render/Express 404 instead of the Vite frontend.
- Cause: Render starts the package script from the filtered package directory (`apps/server`). A static path based only on `process.cwd()/apps/web/dist` points to `apps/server/apps/web/dist`, so Express cannot find `index.html`.
- Fix: Resolve frontend dist from multiple likely working directories: monorepo root, `apps/server`, and nested fallback candidates. The valid `apps/web/dist` path is mounted when it exists.
- Verification: Added tests for resolving static frontend root from both monorepo root and `apps/server` cwd.

### Render root 404 when NODE_ENV is not production

- Symptom: single Web Service deployment starts backend successfully, but `GET /` still returns 404.
- Cause: static frontend serving was initially gated by `NODE_ENV=production`. If Render env was missing or not applied, the existing `apps/web/dist` output was ignored.
- Fix: static frontend root resolution now serves an existing `apps/web/dist` regardless of `NODE_ENV`; when dist is missing, non-production remains disabled and production still returns the expected candidate path.

### Slow transition after round end

- Phase: deployed play-flow QA
- Symptom: after a round ends, the next round or final gallery feels delayed.
- Likely cause:
  - The server emits `round-ended`, then reads the source image from GridFS, composes a PNG result with drawing strokes, writes the result image to GridFS, stores result metadata, emits `result-saved`, and only then may continue the visible transition if the flow waits on result saving.
  - On Render plus MongoDB Atlas/GridFS, source image read, PNG composition, and result GridFS write can be noticeable.
- MVP fix direction:
  - Keep `round-ended` immediate.
  - Do not let result saving block the post-round review timer or next round transition.
  - Emit `result-saved` when the async save finishes.
  - If save fails, continue the game transition and show a recoverable UI state instead of blocking the round.
- Client-side composition option:
  - The browser already downloads the round source image to draw it on canvas.
  - The browser can compose a fast local preview by combining the displayed source image and the local drawing layer.
  - This can make the round-end modal feel instant.
  - The server should still do authoritative async result storage, or at minimum verify any client-uploaded result against the selected image/round/stroke contract before storing it.
- Recommended architecture:
  - Short term: server authoritative async save, client shows optimistic/local preview while waiting for `result-saved`.
  - Later optimization: client-generated preview/result upload can be considered, but only with server-side validation and fallback server composition.
- Frontend mitigation applied:
  - `PHASE-FE-ROUND-END-GALLERY-PREVIEW-STABILIZATION` keeps the play page visible and shows the round result modal immediately after `round-ended`.
  - The client composes a temporary local PNG preview from the already loaded round image and current stroke list while server result storage continues.
  - When `result-saved` arrives, the modal switches to the server authoritative result preview. The local preview object URL is revoked on next round, gallery transition, room reset, or unmount.
- Secret handling:
  - Logs and docs must not include raw file ids, database URI, token, private key, or credential values.

### Uploaded image shows Google real name instead of app nickname

- Phase: deployed play-flow QA
- Symptom: uploaded image cards may show the Google/Firebase display name instead of the nickname configured in the app.
- Cause: image metadata can be created from the auth token context if the upload route does not fetch the latest stored user profile first.
- Fix direction:
  - When creating image metadata, prefer `UserRepository.findByFirebaseUid(firebaseUid)` and use the stored `nickname`/`avatarUrl`.
  - Fall back to auth context only if no stored profile exists.
  - Existing room participant profile updates should continue to use stored user profile data.
