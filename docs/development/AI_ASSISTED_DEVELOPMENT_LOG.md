# AI Assisted Development Log

## 기록 원칙

- 작업이 끝나면 목표, 변경 문서, 검증 결과, 다음 작업 추천 프롬프트를 기록한다.
- 다른 환경에서 이어받을 수 있도록 미완료 항목, 충돌, 누락, 리스크를 함께 적는다.
- secret, token, private key, URI 값은 기록하지 않는다.

## 작업 로그

### 2026-06-05 PHASE-00-DOCS-REFACTOR

- Agent: `docs-maintainer`
- 목표: 앱 개발 시작 전 reference 명세서, 기존 AI 문서, wireframe 이미지를 기반으로 Markdown 기준 문서 구조를 정리.
- 수행 내용:
  - `AGENTS.md`를 짧은 최상위 규칙 문서로 정리.
  - 요구사항, 기능 명세, 아키텍처, DB/API/Socket, 유저 플로우, 배포/운영, 개발 계획, 수용 기준, 테스트, 리뷰, 디자인 문서를 분리 생성.
  - Agent 역할과 workflow를 `docs/workflows/AGENT_ROLES.md`, `docs/workflows/AGENT_WORKFLOW.md`로 분리.
  - 최소 `.codex` config와 agent draft를 생성.
- 검증:
  - 실행: `git status --short`
  - 미실행: 문서 정리 작업이므로 lint, typecheck, test, build는 실행하지 않음.
- 충돌/주의:
  - reference 배포 문서는 `npm install` 예시가 있으나 프로젝트 원칙은 pnpm workspaces이므로 문서에는 pnpm 우선으로 정리.
  - reference API와 기존 AI 문서의 endpoint 목록이 일부 달라 MVP 흐름에 필요한 API를 기준 문서에 통합.
  - `git status --short`에 `D README`가 표시됨. 이번 작업에서는 `README.md`만 생성했으며 확장자 없는 `README`는 작업 범위에서 수정하지 않음.
- 다음 추천 작업:
  - `PHASE-00-PROJECT-SCAFFOLD`
  - pnpm workspace, `apps/web`, `apps/server`, `packages/shared` 기본 구조 생성.
  - Firebase Auth, Room, Upload, Socket feature는 아직 구현하지 않음.

### 2026-06-05 GIT-RULES-UPDATE

- 목표: 작업 종료 후 다음 추천 프롬프트 제공 규칙과 commit/push 운영 규칙을 명확히 문서화.
- 수행 내용:
  - `AGENTS.md`에 Git / Commit / Push 최상위 규칙 추가.
  - `docs/workflows/AGENT_WORKFLOW.md`에 commit/push 단계 추가.
  - 작업 handoff를 위해 이 로그에 현재 변경 내용을 기록.
- 검증 예정:
  - `git status --short`
- 다음 조치:
  - 사용자 요청에 따라 변경사항 commit 후 `main` branch를 `origin`에 push.

### 2026-06-05 PHASE-00-PROJECT-SCAFFOLD

- Agent: `architect`
- 목표: Realtime Doodle Relay의 MVP 개발을 시작하기 위한 pnpm workspace 기반 프로젝트 scaffold 생성.
- 수행 내용:
  - root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example` 생성.
  - `apps/web`, `apps/server`, `packages/shared` package와 `src` placeholder 생성.
  - README와 개발/테스트 로그 갱신.
- 의도적으로 제외:
  - Firebase Auth, Room, Upload, Socket feature 구현.
  - React, Express, Socket.IO, Firebase, MongoDB 관련 dependency 추가 또는 설치.
  - lint, typecheck, test, build 실행.
- 다음 추천 작업:
  - `PHASE-01-HEALTH-ENV`
  - 서버 `/health` endpoint와 환경변수 검증 구조만 구현.

### 2026-06-05 PHASE-01-HEALTH-ENV

- Agent: `backend`
- 목표: 서버의 `/health` endpoint와 환경변수 검증 구조만 구현.
- 수행 내용:
  - `packages/shared/src/api.ts`에 `HealthResponse`, `ApiErrorResponse` 계약 추가.
  - `packages/shared/src/env.ts`에 필수 서버 환경변수 key 계약 추가.
  - `apps/server/src/health.ts`에 `GET /health` handler 추가.
  - `apps/server/src/config/env.ts`에 환경변수 검증 함수 추가.
  - README, 구현 메모, 테스트 리포트 갱신.
- 의도적으로 제외:
  - Express wiring.
  - Firebase Auth, Room, Upload, Socket feature.
  - dependency 추가 또는 설치.
- 다음 추천 작업:
  - `PHASE-01-HEALTH-ENV-WIRING`
  - 사용자 승인 후 Express, TypeScript 실행/빌드 도구, 테스트 도구 의존성을 추가하고 실제 HTTP server wiring과 최소 테스트를 구성.

### 2026-06-05 GIT-RULES-AUTOCOMMIT-UPDATE

- 목표: 작업 완료 후 commit은 자동으로 진행하고, push는 필요 시 사용자 확인 후 진행하는 규칙으로 변경.
- 수행 내용:
  - `AGENTS.md`의 Git / Commit / Push 규칙 갱신.
  - `docs/workflows/AGENT_WORKFLOW.md`의 Step 7 규칙 갱신.
- 다음 조치:
  - 현재 작업 변경 범위를 확인한 뒤 commit 진행.

### 2026-06-05 PHASE-01-HEALTH-ENV-WIRING

- Agent: `backend`
- 목표: Express 기반 서버 wiring을 추가하고 `/health` endpoint와 환경변수 검증을 실제 서버 시작 흐름에 연결.
- 수행 내용:
  - `express`, TypeScript 실행/테스트 관련 최소 의존성 추가.
  - `createApp()`과 `GET /health` route 추가.
  - 서버 시작 전 환경변수 검증 연결.
  - health/env 최소 테스트 구조 추가.
- 의도적으로 제외:
  - Firebase Auth, Room, Upload, Socket feature.
  - secret 값 생성 또는 출력.
- 다음 추천 작업:
  - `PHASE-02-AUTH-PLAN`
  - Firebase Auth 구현 전 API/Socket 인증 경계, env key, shared auth contract를 먼저 정리.

### 2026-06-05 PHASE-02-AUTH-PLAN

- Agent: `architect`
- 목표: Firebase Auth 구현 전 API/Socket 인증 경계, shared auth contract, env 요구사항 정리.
- 수행 내용:
  - `docs/ARCHITECTURE.md`에 HTTP/Socket 인증 경계 설계 추가.
  - `docs/DATABASE_API_SOCKET.md`에 Auth 계약 초안과 error code 추가.
  - `docs/DEPLOYMENT_OPERATION.md`에 Firebase Admin env 주의사항 추가.
  - `packages/shared/src/auth.ts`에 auth type contract 초안 추가.
- 의도적으로 제외:
  - Firebase Admin SDK 호출.
  - Express auth middleware 구현.
  - Socket.IO middleware 구현.
  - Firebase Client UI 구현.
- 리스크/확인 사항:
  - 다음 구현 단계에서 Firebase Admin SDK 의존성 추가가 필요하다.
  - `FIREBASE_PRIVATE_KEY` 줄바꿈 복원 방식은 구현 단계에서 secret 값을 출력하지 않도록 테스트해야 한다.
  - Socket auth 실패 응답의 실제 전송 방식은 Socket.IO middleware 구현 시 확정해야 한다.
- 다음 추천 작업:
  - `PHASE-02-AUTH-BACKEND`
  - Firebase Admin 초기화, HTTP auth middleware, Socket auth middleware 골격과 테스트 구현.

### 2026-06-05 REFERENCE-ARTIFACTS-COMMIT

- 목표: 다른 환경에서도 문서 기준과 reference artifact 관계가 완결되도록 `docs/references/**`와 wireframe asset을 저장소에 포함.
- 수행 내용:
  - reference PDF/DOCX와 `docs/design/assets/realtime-doodle-wireframe-overview.png` 파일 목록과 크기를 확인.
  - obvious secret pattern scan을 수행.
  - `07_deployment_operation_specification.docx`에서 env key placeholder가 감지되었으나 실제 secret 값이 아닌 `mongodb+srv://...`, `FIREBASE_PRIVATE_KEY=...` placeholder임을 확인.
- 다음 조치:
  - reference artifact와 wireframe asset을 commit 후 `origin/main`에 push.

### 2026-06-05 PHASE-02-AUTH-BACKEND

- Agent: `backend`
- 목표: Firebase Admin 기반 서버 인증 골격을 구현하고 HTTP API/Socket 인증 middleware의 최소 테스트를 추가.
- 수행 내용:
  - `firebase-admin`, `socket.io` dependencies 추가.
  - Firebase Admin app/token verifier 초기화 골격 추가.
  - HTTP Bearer token middleware 추가.
  - Socket.IO handshake auth middleware 골격 추가.
  - token verifier mock 기반 auth 테스트 추가.
- 의도적으로 제외:
  - Room, Upload, Drawing, Chat feature.
  - 실제 Firebase 프로젝트 연결 또는 secret 값 생성.
- 다음 추천 작업:
  - `PHASE-02-AUTH-USER-UPSERT`
  - 인증된 Firebase UID를 기반으로 `POST /api/users/me` 사용자 upsert API를 구현.

### 2026-06-05 PHASE-00-WORKFLOW-USER-ACTION-RULES

- Agent: `docs-maintainer`
- 목표: AI 작업 중 사용자가 직접 해야 하는 외부 작업과 secret 관리 절차를 문서화.
- 수행 내용:
  - `AGENTS.md`에 User Action Required 규칙 추가.
  - `docs/workflows/AGENT_WORKFLOW.md`에 사용자 행동 필요 단계 추가.
- 원칙:
  - AI는 `.env`, private key, token, credential 값을 만들거나 채우지 않는다.
  - Firebase Admin key, MongoDB URI, 배포 secret 등은 사용자가 직접 생성/등록한다.
  - 사용자 행동이 필요하면 해야 할 일, 이유, 보안 주의사항, 재개용 프롬프트를 함께 제공한다.
- 다음 추천 작업:
  - `PHASE-02-AUTH-USER-UPSERT`
  - 인증된 Firebase UID 기반 사용자 upsert API 구현.

### 2026-06-05 PHASE-02-AUTH-USER-UPSERT

- Agent: `backend`
- 목표: 인증된 Firebase 사용자 기준으로 `POST /api/users/me` 사용자 upsert API의 최소 구조와 테스트 구현.
- 수행 내용:
  - shared user API request/response contract 추가.
  - `UserRepository` interface와 `InMemoryUserRepository` 추가.
  - `POST /api/users/me` route 추가.
  - auth context 기반 user upsert 테스트 추가.
- 의도적으로 제외:
  - MongoDB 실제 연결.
  - Room, Upload, Drawing, Chat feature.
  - secret 값 생성 또는 출력.
- 다음 추천 작업:
  - `PHASE-03-MONGODB-CONNECTION`
  - MongoDB 연결과 실제 user repository 구현 전 사용자가 MongoDB Atlas URI를 준비해야 하는지 확인.

### 2026-06-05 PHASE-03-MONGODB-CONNECTION

- Agent: `backend`
- 목표: MongoDB 연결 계층과 실제 UserRepository 구현 골격 추가. 실제 MongoDB Atlas 값은 사용하지 않음.
- 수행 내용:
  - `mongodb` dependency 추가.
  - MongoDB client connection module 추가.
  - MongoDB 기반 `UserRepository` 구현 골격 추가.
  - `firebaseUid` unique index helper 추가.
  - 실제 연결 없이 mock/fake 기반 테스트 추가.
  - 실제 Atlas 설정이 필요한 시점을 배포 문서에 기록.
- 의도적으로 제외:
  - Room, Upload, Drawing, Chat feature.
  - 실제 `MONGODB_URI` 값 생성 또는 출력.
  - 실제 MongoDB Atlas 연결 테스트.
- 사용자 행동 필요 시점:
  - 실제 DB 연결 검증이나 배포 전에는 사용자가 MongoDB Atlas project/cluster/user/network access/URI 등록을 직접 완료해야 한다.
- 다음 추천 작업:
  - `PHASE-03-MONGODB-WIRING`
  - 서버 시작 흐름에서 MongoDB 연결과 `MongoUserRepository` wiring을 구성하되, 실제 연결 검증 전 사용자 MongoDB Atlas 준비 여부를 확인.

### 2026-06-05 PHASE-03-MONGODB-WIRING

- Agent: `backend`
- 목표: 서버 시작 흐름에 MongoDB 연결과 `MongoUserRepository` wiring을 추가하고 로컬 `.env` 기반으로 실제 연결 전 검증 가능한 구조 구성.
- 사용자 행동 완료:
  - 로컬 `.env` 생성.
  - Firebase project/Admin service account 값 준비.
  - MongoDB Atlas cluster/user/network access/URI 등록.
- 수행 내용:
  - local `.env` 로더 추가.
  - bootstrap에서 MongoDB connection, Firebase verifier, Mongo user repository, HTTP auth middleware를 app에 주입.
  - fake/mock 기반 bootstrap 테스트 추가.
- 의도적으로 제외:
  - Room, Upload, Drawing, Chat feature.
  - 실제 secret 값 출력.
  - 실제 MongoDB 연결 검증 로그 출력.
- 다음 추천 작업:
  - `PHASE-03-MONGODB-SMOKE`
  - 사용자가 원할 경우 로컬 `.env` 기반 실제 `/health` 및 DB 연결 smoke test를 secret 출력 없이 수행.

### 2026-06-05 PHASE-03-MONGODB-SMOKE

- Agent: `backend`
- 목표: 로컬 `.env` 기반으로 서버 bootstrap이 실제 MongoDB/Firebase 설정을 사용해 시작 가능한지 secret 출력 없이 smoke test.
- 수행 내용:
  - secret-safe bootstrap smoke script 추가.
  - `smoke:bootstrap` package script 추가.
  - root `.env` 기반 smoke test 실행.
- 검증 결과:
  - `smoke:bootstrap`: 실패. 안전한 error label은 `Error:ECONNREFUSED`.
  - `typecheck`: 통과.
  - `test`: 통과. 9 files, 17 tests.
- secret 처리:
  - `.env` 값, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 사용자 행동 필요:
  - MongoDB Atlas URI, Network Access, database user/password, cluster 상태, 로컬 네트워크를 확인해야 함.
- 다음 추천 작업:
  - `PHASE-03-MONGODB-SMOKE-RETRY`
  - 사용자가 MongoDB Atlas 설정을 확인한 뒤 같은 smoke test를 재실행.

### 2026-06-05 PHASE-03-MONGODB-SMOKE-SUCCESS-LOG

- Agent: `backend`
- 목표: standard MongoDB connection string 적용 후 로컬 `.env` 기반 bootstrap smoke test 성공 결과 기록.
- 수행 내용:
  - `smoke:bootstrap`, `typecheck`, `test` 성공을 문서화.
  - MongoDB SRV DNS `querySrv ECONNREFUSED` 문제를 standard connection string으로 우회했다고 기록.
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 검증 결과:
  - `smoke:bootstrap`: 통과. `SMOKE_OK server bootstrap and MongoDB connection succeeded`.
  - `typecheck`: 통과.
  - `test`: 통과. 9 files, 17 tests.
- 다음 추천 작업:
  - `PHASE-04-ROOM-CONTRACT-PLAN`
  - Room create/join 구현 전에 shared room contract, API 경계, repository interface를 먼저 정리.

### 2026-06-05 PHASE-04-ROOM-CONTRACT-PLAN

- Agent: `architect`
- 목표: Room create/join 구현 전 shared room contract, HTTP API 경계, repository interface, Socket 연계 범위를 설계.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Room 계약 계획을 추가.
  - HTTP API와 Socket.IO의 역할을 분리.
  - `RoomRepository` interface와 MongoDB `rooms` document 초안을 정리.
  - Drawing, Chat, Upload, Timer 기능은 구현하지 않음.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일 확인 완료.
- 남은 확인 사항:
  - `GET /api/rooms/:roomCode`의 참가 전 조회 허용 여부
  - `leave-room`의 영속 participants 제거 여부
  - 방 제목 기본값 생성 주체
- 다음 추천 작업:
  - `PHASE-04-ROOM-CONTRACT-SHARED`
  - `packages/shared`에 room contract 타입을 추가하고 server typecheck로 계약을 검증.

### 2026-06-05 PHASE-04-ROOM-CONTRACT-SHARED

- Agent: `backend`
- 목표: 문서화된 Room 계약을 기준으로 `packages/shared`에 room contract 타입 추가.
- 수행 내용:
  - `packages/shared/src/room.ts` 추가.
  - `packages/shared/src/index.ts`에서 room contract 타입 export.
  - Room create/join 서버 route, repository, MongoDB 구현은 아직 추가하지 않음.
  - Drawing, Chat, Upload, Timer 기능은 구현하지 않음.
- 검증 결과:
  - `corepack pnpm --filter @doodle/shared typecheck`: 성공 exit. 현재 shared typecheck script는 echo placeholder.
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일 확인 완료.
- 다음 추천 작업:
  - `PHASE-04-ROOM-REPOSITORY-PLAN`
  - RoomRepository 구현 전에 roomCode 생성/충돌 처리, in-memory 테스트 전략, MongoDB index 적용 범위를 확정.
