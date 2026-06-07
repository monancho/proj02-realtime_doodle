# Single Render Web Service Deployment Plan

Date: 2026-06-08

이 문서는 Render 배포 단순화를 위해 Express backend가 Vite frontend build 결과를 함께 serve하는 단일 Web Service 구조를 검토한 계획이다. 구현 코드는 아직 작성하지 않았다.

## 배경

현재 배포 구조는 Render Frontend Static Site와 Render Backend Web Service 2개 서비스로 나뉜다.

- Frontend는 `VITE_API_BASE_URL`, `VITE_SOCKET_URL`에 backend URL을 build time에 포함한다.
- Backend는 `CLIENT_URL`, `SOCKET_CORS_ORIGIN`에 frontend URL을 runtime 환경변수로 받아 HTTP CORS와 Socket.IO CORS를 허용한다.
- 두 URL 중 하나라도 틀리거나 재배포가 누락되면 Google login 이후 `/api/users/me` preflight가 CORS로 차단된다.

## 현재 2서비스 구조의 문제점

- Frontend env는 Vite build 시점에 고정되므로 URL 변경 후 frontend 재배포가 필요하다.
- Backend env는 runtime 값이므로 `CLIENT_URL` 또는 `SOCKET_CORS_ORIGIN` 변경 후 backend restart/redeploy가 필요하다.
- Frontend URL과 Backend URL을 서로 교차 등록해야 해서 배포 초기에 CORS 설정 실수가 쉽다.
- Render 무료/저가 환경에서는 backend sleep 이후 첫 API/Socket 요청이 느려질 수 있다.
- Static Site와 Web Service 로그가 분리되어 초보 운영자가 문제 원인을 찾기 어렵다.

## 단일 Render Web Service 목표 구조

```txt
Render Web Service 1개
  Express backend
    /health
    /api/*
    Socket.IO
    static frontend files from apps/web/dist
    SPA fallback to index.html
```

사용자 접속 URL과 API/Socket URL이 같은 origin이 된다.

```txt
https://proj02-realtime-doodle.onrender.com
```

## Express Static Serving 기준

구현 시 `createApp` 또는 server bootstrap 이후에 frontend dist 경로를 선택적으로 serve한다.

권장 정책:

- production에서만 static frontend serving을 활성화한다.
- dist 경로는 repository root 기준 `apps/web/dist`를 사용한다.
- `express.static(frontendDistPath)`는 API 라우트와 `/health` 등록 이후, safe error handler 이전 또는 SPA fallback 이전에 둔다.
- SPA fallback은 `GET` 요청 중 `/api`, `/health`, Socket.IO path를 제외하고 `index.html`로 응답한다.
- dist가 없으면 서버가 부팅 실패하지 않도록 할지, 배포 실패로 볼지 구현 시 결정한다. Render production에서는 build command가 web build를 먼저 수행하므로 dist 누락은 배포 설정 오류로 간주해도 된다.

## Route 충돌 방지 기준

다음 route는 frontend fallback보다 먼저 처리되어야 한다.

- `GET /health`
- `/api/users/*`
- `/api/rooms/*`
- `/api/images/*`
- `/api/results/*`
- Socket.IO endpoint, 기본 `/socket.io/*`

fallback 대상:

- `/`
- `/room/...` 같은 미래 frontend route
- refresh로 직접 접근한 SPA route

fallback 제외:

- `/api/*`
- `/health`
- `/socket.io/*`
- 명확한 asset 요청 중 static middleware가 처리하지 못한 파일

## Build / Start Command 변경 기준

Render Web Service build command 후보:

```bash
corepack pnpm install --frozen-lockfile && corepack pnpm --filter @doodle/web build && corepack pnpm --filter @doodle/server build
```

Render Web Service start command 후보:

```bash
corepack pnpm --filter @doodle/server start
```

주의:

- Render 환경에서 `corepack enable`은 read-only filesystem 문제를 일으킬 수 있으므로 build command에 넣지 않는다.
- 기존 `package-lock.json`은 pnpm workspace 기준 배포에 필요하지 않으며, 삭제/수정/commit은 별도 결정이 필요하다.

## CORS / Env 단순화 범위

단일 origin 구조에서는 브라우저가 frontend와 backend를 같은 origin으로 보게 된다.

단순화 가능:

- Frontend `VITE_API_BASE_URL`은 빈 값 또는 same-origin 상대경로로 전환 가능하다.
- Frontend `VITE_SOCKET_URL`도 빈 값 또는 same-origin으로 전환 가능하다.
- Backend HTTP CORS는 production에서 필수 요구가 줄어든다.
- Backend Socket.IO CORS도 same-origin 기준으로 단순화할 수 있다.

유지할 수 있는 안전한 방식:

- 기존 env를 당장 제거하지 않고, 값이 없으면 same-origin fallback을 사용한다.
- local development는 계속 `http://localhost:5173` frontend와 `http://localhost:4000` backend 분리 실행을 허용한다.
- production 단일 서비스에서는 `CLIENT_URL`, `SOCKET_CORS_ORIGIN`을 서비스 URL로 맞추거나 CORS middleware를 생략하는 정책을 구현한다.

## Firebase Authorized Domain

단일 서비스 전환 후 Firebase Authorized domains에는 최종 사용자 접속 도메인을 등록해야 한다.

예:

```txt
proj02-realtime-doodle.onrender.com
```

기존 frontend static site 도메인을 더 이상 사용하지 않는다면 Firebase Authorized domains에서 유지할 필요는 없지만, 롤백 가능성을 위해 당분간 남겨둘 수 있다.

## 구현 단계 제안

1. 서버 정적 파일 서빙 옵션 설계
2. `apps/server/src/app.ts`에 production static serving hook 추가
3. SPA fallback route 추가
4. frontend API/Socket client가 same-origin fallback을 사용할 수 있는지 확인
5. Render build command를 web build + server build 순서로 문서화
6. local validation
7. 단일 Render Web Service로 배포 QA

## 리스크

- Express 5 wildcard route 문법이 Express 4와 다르므로 SPA fallback route 작성 시 테스트가 필요하다.
- static serving path는 `tsx src/server.ts` 실행 위치와 Render working directory에 따라 달라질 수 있으므로 `process.cwd()` 기준 path 계산을 명확히 해야 한다.
- Vite env가 계속 absolute localhost URL을 build에 포함하면 단일 서비스에서도 API가 잘못 연결된다. frontend client fallback 정책 점검이 필요하다.
- 기존 Static Site를 유지한 채 단일 서비스도 켜면 Firebase authorized domains와 CORS 설정이 혼재할 수 있다.

## 다음 구현 프롬프트

```md
# AI Task Spec

## Task ID
PHASE-DEPLOY-SINGLE-RENDER-SERVICE-IMPLEMENTATION

## Agent
backend-frontend

## Goal
Express backend가 Vite frontend build 결과를 함께 serve하도록 구현해 Render 단일 Web Service 배포 구조를 지원한다.

## Requirements
1. 기존 API `/api/*`, `/health`, Socket.IO 동작을 변경하지 않는다.
2. production 또는 명시 env 조건에서 `apps/web/dist` 정적 파일을 serve한다.
3. SPA fallback은 `/api/*`, `/health`, `/socket.io/*`와 충돌하지 않는다.
4. frontend API/Socket client는 배포 환경에서 same-origin fallback을 사용할 수 있게 한다.
5. local dev의 분리 실행 `localhost:5173` frontend + `localhost:4000` backend 흐름은 유지한다.
6. Render build/start command를 문서화한다.
7. `.env`, token, Firebase private key, MongoDB URI는 절대 출력하지 않는다.
8. `package-lock.json`은 수정/삭제/commit하지 않는다.
9. 문서와 TEST_REPORT를 갱신한다.
10. 변경사항을 commit한다.
11. push는 사용자 확인 후 진행한다.

## Validation Commands
corepack pnpm --filter @doodle/server typecheck
corepack pnpm --filter @doodle/server test
corepack pnpm --filter @doodle/web typecheck
corepack pnpm --filter @doodle/web build
git status --short
```

## Implementation Result

2026-06-08에 단일 Render Web Service 지원을 구현했다.

- `apps/server/src/app.ts`는 선택적 `staticFrontendRoot`를 받아 dist가 존재할 때만 정적 frontend 파일을 serve한다.
- `GET`/`HEAD` HTML 요청 중 `/api`, `/health`, `/socket.io`가 아닌 경로는 `index.html`로 fallback된다.
- `/health`, `/api/*`, Socket.IO endpoint는 frontend fallback보다 우선한다.
- `apps/server/src/bootstrap.ts`는 `NODE_ENV=production`일 때 `apps/web/dist`를 static root로 연결한다.
- `apps/web/src/App.tsx`는 `VITE_API_BASE_URL`이 비어 있으면 production에서 same-origin relative API를 사용하고, dev에서는 기존 `http://localhost:4000`을 유지한다.
- `VITE_SOCKET_URL`이 비어 있으면 API base URL 또는 current origin으로 Socket.IO 연결을 시도한다.

### Implemented Render single-service commands

Build Command:

```bash
corepack pnpm install --frozen-lockfile && corepack pnpm --filter @doodle/web build && corepack pnpm --filter @doodle/server build
```

Start Command:

```bash
corepack pnpm --filter @doodle/server start
```

Frontend env in single-service mode:

```txt
VITE_API_BASE_URL=
VITE_SOCKET_URL=
```

Backend env in single-service mode:

```txt
CLIENT_URL=https://단일-render-service-url
SOCKET_CORS_ORIGIN=https://단일-render-service-url
```

### Rollback option

기존 2서비스 구조로 되돌릴 수 있다.

- Frontend Static Site를 유지한다.
- Frontend env에 `VITE_API_BASE_URL=https://backend-url`, `VITE_SOCKET_URL=https://backend-url`을 등록하고 frontend를 재빌드한다.
- Backend env에 `CLIENT_URL=https://frontend-url`, `SOCKET_CORS_ORIGIN=https://frontend-url`을 등록하고 backend를 재시작한다.
- Firebase Authorized domains에는 실제 frontend 접속 도메인을 등록한다.
