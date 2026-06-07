# AI Assisted Development Log

## 기록 원칙

- 작업이 끝나면 목표, 변경 문서, 검증 결과, 다음 작업 추천 프롬프트를 기록한다.
- 다른 환경에서 이어받을 수 있도록 미완료 항목, 충돌, 누락, 리스크를 함께 적는다.
- secret, token, private key, URI 값은 기록하지 않는다.

## 작업 로그

### 2026-06-07 PHASE-RESULT-CANVAS-FRAME-CROP

- Agent: `backend`
- 목표: 결과 다운로드 이미지가 원본 전체가 아니라 플레이 캔버스에서 보던 4:3 cover crop 구도와 맞도록 개선.
- 수행 내용:
  - result composer output frame을 `960x720`으로 고정했다.
  - source image는 `sharp` cover crop으로 frame에 맞춘 뒤 stroke SVG overlay를 합성한다.
  - composer test에 `960x720` metadata 기대값을 추가했다.
- 검증:
  - 실행: `corepack pnpm --filter @doodle/server typecheck`
  - 실행: `corepack pnpm --filter @doodle/server test`
  - 결과: 모두 통과
- 남은 확인:
  - 실제 다운로드 이미지가 플레이 화면 구도와 시각적으로 일치하는지는 로컬 브라우저에서 재확인한다.

### 2026-06-07 PHASE-STROKE-RETENTION-RESULT-COMPOSITE

- Agent: `frontend/backend`
- 목표: move segment 전송 이후 stroke 200개 제한으로 선이 사라지는 문제를 완화하고, result PNG를 원본+stroke 합성으로 개선.
- 수행 내용:
  - `RecentStrokeBatchStore` 보존 한도를 200에서 10,000으로 상향했다.
  - 프론트 canvas stroke render state 보존 한도를 10,000으로 상향했다.
  - `sharp`를 `@doodle/server` dependency로 추가했다.
  - result composer가 원본 이미지 위에 stroke SVG overlay를 composite한 PNG를 생성하도록 변경했다.
  - recent stroke batch limit 테스트를 새 정책에 맞게 갱신했다.
- 검증:
  - 실행: `corepack pnpm --filter @doodle/server typecheck`
  - 실행: `corepack pnpm --filter @doodle/web typecheck`
  - 실행: `corepack pnpm --filter @doodle/server test`
  - 실행: `corepack pnpm --filter @doodle/web build`
  - 결과: 모두 통과
- 남은 확인:
  - in-memory 보존 한도이므로 프로세스 재시작/다중 instance durability는 아직 없다.
  - 매우 긴 drawing session은 추가 최적화나 durable stroke store phase에서 다룬다.

### 2026-06-07 PHASE-CANVAS-RESULT-STABILITY-FIX

- Agent: `frontend/backend`
- 목표: drawing 중 선이 사라지는 문제, 사진 깜빡임, result 다운로드 파일 형식 문제 수정.
- 수행 내용:
  - Canvas 배경 이미지를 `backgroundImageUrl` 변경 시에만 로드하고 ref에 캐시하도록 변경했다.
  - stroke 변경 시에는 새 이미지 로드 없이 캐시된 image와 stroke를 동기 redraw한다.
  - result composer를 placeholder buffer에서 유효 PNG chunk 생성 방식으로 변경했다.
  - PNG signature, IHDR, IDAT, IEND chunk를 검증하는 unit test를 추가했다.
- 검증:
  - 실행: `corepack pnpm --filter @doodle/web typecheck`
  - 실행: `corepack pnpm --filter @doodle/server typecheck`
  - 실행: `corepack pnpm --filter @doodle/server test`
  - 실행: `corepack pnpm --filter @doodle/web build`
  - 결과: 모두 통과
- 남은 확인:
  - 다운로드 PNG는 유효 container이나, 원본 이미지와 stroke를 실제 픽셀 합성하는 고급 renderer는 아직 구현하지 않았다.
  - 사용자가 로컬에서 장시간 drawing 시 깜빡임/선 사라짐이 사라졌는지 재확인한다.

### 2026-06-07 PHASE-IMAGE-DOWNLOAD-HEADER-FIX

- Agent: `backend`
- 목표: 로컬 수동 점검 중 보고된 이미지 표시/다운로드 500 문제를 서버 stream header 관점에서 수정.
- 수행 내용:
  - 원본 이미지 download route의 `Content-Disposition` header를 ASCII fallback + RFC 5987 `filename*` 방식으로 변경했다.
  - 한글/비 ASCII 파일명 업로드 후 원본 이미지 stream이 200으로 내려오는 테스트를 추가했다.
  - 예상하지 못한 서버 예외가 HTML 500으로만 보이지 않도록 안전한 JSON error handler를 추가했다.
- 검증:
  - 실행: `corepack pnpm --filter @doodle/server test`
  - 실행: `corepack pnpm --filter @doodle/server typecheck`
  - 결과: 모두 통과
- 다음 확인:
  - 서버 dev는 nodemon 기반이므로 저장 후 자동 재시작되지만, 기존 프로세스가 오래 떠 있었다면 한 번 수동 재시작한다.
  - 브라우저에서 다시 라운드 이미지 표시와 결과 다운로드를 확인한다.

### 2026-06-07 PHASE-LOCAL-PLAY-FLOW-FIXES

- Agent: `frontend/backend-devex`
- 목표: 로컬 수동 점검 중 발견된 라운드 이미지 미표시 진단성 개선, drawing 실시간 반영, backend watch dev 개선.
- 수행 내용:
  - Canvas pointer move 중 두 점 segment를 `draw-stroke`로 emit하도록 변경했다.
  - server echo 기반으로 stroke state를 반영해 같은 Socket.IO room 동기화 경계를 유지했다.
  - `IMAGE_NOT_FOUND`, `IMAGE_FILE_*` 계열 error code frontend 표시를 보강했다.
  - `@doodle/server`에 `nodemon`을 추가하고 `dev` script를 파일 변경 시 자동 재시작하도록 변경했다.
- 검증:
  - 실행: `corepack pnpm --filter @doodle/web typecheck`
  - 실행: `corepack pnpm --filter @doodle/server typecheck`
  - 실행: `corepack pnpm --filter @doodle/server test`
  - 실행: `corepack pnpm --filter @doodle/web build`
  - 결과: 모두 통과
- 남은 확인:
  - 라운드 이미지 미표시는 실제 로컬 다운로드 응답 code 확인이 필요하다.
  - 변경 후 화면에 `IMAGE_NOT_FOUND` 등 구체 메시지가 보이면 해당 code 기준으로 backend storage/metadata를 추가 점검한다.
  - 두 브라우저 drawing segment 실시간 동기화는 사용자의 로컬 수동 확인이 필요하다.

### 2026-06-06 PHASE-FE-WIREFRAME-REFERENCE-POLISH

- Agent: `frontend`
- 목표: 사용자가 제공한 손그림 와이어프레임 이미지를 참고해 현재 구현 가능한 UI 요소를 자율 반영.
- 수행 내용:
  - 로그인 화면을 중앙 종이 카드와 큰 `DOODLE` 워드마크 중심으로 조정했다.
  - 상단 헤더를 손그림 내비게이션 바처럼 보이게 변경했다.
  - 방 대기 화면에 방 코드 복사 버튼을 추가했다.
  - 업로드 박스에 사용자당 사진 1장 업로드 기준을 더 명확히 표시했다.
  - 참가자 목록에 와이어프레임 스타일의 색 점을 추가했다.
- 의도적으로 제외:
  - 방 목록, 공개/비공개 방, 비밀번호 입장처럼 아직 backend/API 계약이 없는 기능.
  - Socket drawing, Upload, Timer, Result save 동작 변경.
- 검증:
  - 실행: `corepack pnpm --filter @doodle/web typecheck`
  - 실행: `corepack pnpm --filter @doodle/web build`
  - 결과: 모두 통과
- 주의:
  - `package-lock.json`은 미추적 상태로 유지하고 수정/삭제/commit하지 않는다.
  - 실제 브라우저 시각 QA와 로컬 E2E는 별도 작업에서 확인한다.

### 2026-06-06 PHASE-FE-ROUGHJS-DECORATION-LAYER

- Agent: `frontend`
- 목표: Rough.js를 실제 dependency로 도입하고 기능 동작을 바꾸지 않는 장식 레이어에 최소 적용.
- 수행 내용:
  - `roughjs`를 `@doodle/web` dependency로 추가하고 `pnpm-lock.yaml`을 갱신했다.
  - `RoughDecoration` 컴포넌트를 추가해 Rough.js SVG를 mount 시 생성하고 cleanup 시 제거하도록 구성했다.
  - hero underline, room code badge, gallery empty frame, result preview decoration에만 적용했다.
  - Drawing canvas, stroke socket payload, upload, timer, result save 기능 로직은 변경하지 않았다.
- 검증:
  - 실행: `corepack pnpm --filter @doodle/web typecheck`
  - 실행: `corepack pnpm --filter @doodle/web build`
  - 결과: 모두 통과
- 주의:
  - `package-lock.json`은 미추적 상태로 유지하고 수정/삭제/commit하지 않는다.
  - 모바일/데스크톱 실제 브라우저 시각 QA는 별도 로컬 QA에서 확인한다.
- 다음 추천 작업:
  - `PHASE-LOCAL-E2E-PLAY-FLOW-QA-FIX`
  - Google 로그인부터 방 생성/입장, 이미지 업로드, ready, start-game, 라운드 이미지 표시, socket drawing 동기화, 결과 전환까지 로컬 수동 QA로 점검한다.

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

### 2026-06-05 PHASE-04-ROOM-REPOSITORY-PLAN

- Agent: `backend`
- 목표: Room create/join API 구현 전에 RoomRepository 구현 전략, roomCode 생성/충돌 처리, in-memory 테스트 전략, MongoDB index 적용 범위를 확정.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 RoomRepository 구현 전략 계획을 추가.
  - Room domain error, HTTP status mapping, roomCode 생성/충돌 재시도 정책을 정리.
  - InMemoryRoomRepository 테스트 전략과 MongoRoomRepository atomic update 전략을 정리.
  - shared room contract와 문서 계약의 일치 상태를 확인.
  - Room create/join route, Drawing, Chat, Upload, Timer 기능은 구현하지 않음.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일 확인 완료.
- 다음 추천 작업:
  - `PHASE-04-ROOM-REPOSITORY-IMPLEMENTATION`
  - Room route 없이 repository interface, roomCode generator, InMemoryRoomRepository, MongoRoomRepository skeleton과 테스트를 구현.

### 2026-06-06 PHASE-04-ROOM-REPOSITORY-IMPLEMENTATION

- Agent: `backend`
- 목표: Room route 구현 전에 RoomRepository interface, roomCode generator, InMemoryRoomRepository, MongoRoomRepository skeleton과 repository 테스트 구현.
- 수행 내용:
  - `apps/server/src/rooms/repository.ts` 추가.
  - `apps/server/src/rooms/errors.ts` 추가.
  - `apps/server/src/rooms/room-code.ts` 추가.
  - `apps/server/src/rooms/in-memory-room-repository.ts` 추가.
  - `apps/server/src/rooms/mongodb-room-repository.ts` 추가.
  - InMemoryRoomRepository 테스트와 MongoRoomRepository mock collection 테스트 추가.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Room create/join HTTP route.
  - Drawing, Chat, Upload, Timer feature.
  - 실제 MongoDB 연결 기반 repository 테스트.
- 검증 결과:
  - 최초 `corepack pnpm --filter @doodle/server typecheck`: 실패. `node_modules`가 없어 `tsc` 실행 불가.
  - `corepack pnpm install`: 성공.
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 11 files, 29 tests.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
  - MongoRoomRepository는 실제 MongoDB 연결 없이 collection mock 기준으로 검증한 skeleton 수준이다.
- 다음 추천 작업:
  - `PHASE-04-ROOM-ROUTE-IMPLEMENTATION`
  - 인증 middleware와 RoomRepository를 연결해 `POST /api/rooms`, `GET /api/rooms/:roomCode`, `POST /api/rooms/:roomCode/join` route와 route 테스트를 구현.

### 2026-06-06 PHASE-04-ROOM-ROUTE-IMPLEMENTATION

- Agent: `backend`
- 목표: 인증 middleware와 RoomRepository를 연결해 Room HTTP route 구현.
- 수행 내용:
  - `apps/server/src/rooms/routes.ts` 추가.
  - `POST /api/rooms`, `GET /api/rooms/:roomCode`, `POST /api/rooms/:roomCode/join` 구현.
  - `apps/server/src/app.ts`에 `/api/rooms` router wiring 추가.
  - `apps/server/src/bootstrap.ts`에 `MongoRoomRepository` wiring과 room index 보장 추가.
  - `apps/server/src/rooms/routes.test.ts` 추가.
  - `apps/server/src/bootstrap.test.ts`에 room repository wiring 검증 추가.
  - `docs/DATABASE_API_SOCKET.md`, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 결정 사항:
  - 방 제목 기본값은 `Untitled Room`.
  - 기본 room settings는 `roundDurationSec=60`, `maxPlayers=8`, `maxImagesPerUser=3`.
  - `GET /api/rooms/:roomCode`는 인증된 사용자라면 참가 전에도 조회 가능.
- 의도적으로 제외:
  - Drawing, Chat, Upload, Timer feature.
  - Socket.IO room membership 검증.
  - 실제 MongoDB 연결 검증.
- 검증 결과:
  - 최초 `corepack pnpm --filter @doodle/server typecheck`: 실패. Express route param type 보정 필요.
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 12 files, 36 tests.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-04-ROOM-BOOTSTRAP-SMOKE`
  - 사용자가 원할 경우 로컬 `.env` 기반 bootstrap smoke를 재실행해 MongoDB room index 생성까지 secret 출력 없이 확인.

### 2026-06-06 PHASE-04-ROOM-BOOTSTRAP-SMOKE

- Agent: `backend`
- 목표: 로컬 `.env` 기반 bootstrap smoke를 secret 출력 없이 재실행해 MongoDB users/rooms index 생성과 서버 dependency wiring 성공 여부 확인.
- 수행 내용:
  - smoke script가 secret-safe diagnostic만 출력하는지 확인.
  - `corepack pnpm --filter @doodle/server smoke:bootstrap` 실행.
  - `corepack pnpm --filter @doodle/server typecheck` 실행.
  - `corepack pnpm --filter @doodle/server test` 실행.
  - TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Room route 기능 추가 구현.
  - Drawing, Chat, Upload, Timer feature.
  - `.env` 값 출력 또는 secret 기록.
- 검증 결과:
  - `smoke:bootstrap`: 통과. `SMOKE_OK server bootstrap and MongoDB connection succeeded`.
  - `typecheck`: 통과.
  - `test`: 통과. 12 files, 36 tests.
  - `git status --short`: 미추적 `package-lock.json`만 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-05-SOCKET-ROOM-MEMBERSHIP-PLAN`
  - Socket `join-room` 구현 전 HTTP room membership과 socket auth context를 연결하는 검증 경계를 문서화.

### 2026-06-06 PHASE-05-SOCKET-ROOM-MEMBERSHIP-PLAN

- Agent: `backend`
- 목표: Socket `join-room` 구현 전에 HTTP room membership과 socket auth context를 연결하는 검증 경계 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Socket Room Membership 구현 계획 추가.
  - `join-room`이 HTTP join 이후 repository membership을 확인하는 event임을 정리.
  - `room-updated` payload를 `{ room: RoomDetail }` 기준으로 고정.
  - `leave-room`은 영속 participants 제거 없이 socket presence만 처리하는 MVP 정책으로 정리.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Socket.IO event handler 구현.
  - Drawing, Chat, Upload, Timer feature.
  - Redis adapter 또는 다중 instance presence.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 상단 Socket.IO 이벤트 표와 상세 Socket Room Membership 구현 계획의 payload 기준을 함께 정리했다.
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-05-SOCKET-ROOM-MEMBERSHIP-IMPLEMENTATION`
  - Socket.IO server wiring과 `join-room`/`leave-room` membership 검증을 repository mock 중심 테스트로 구현.

### 2026-06-06 README_AND_DOC_SYNC

- Agent: `docs-maintainer`
- 목표: 다음 Socket 구현 전에 현재 구현 상태와 문서 간 불일치 정리.
- 수행 내용:
  - README.md의 현재 상태와 다음 작업을 최신 Phase 기준으로 갱신.
  - `docs/DATABASE_API_SOCKET.md`의 `rooms.participants` schema를 current Room contract와 맞춤.
  - `docs/USER_FLOW.md`의 이탈/재접속 정책을 Socket membership 계획과 맞춤.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - 앱 기능 코드 구현.
  - `apps/**`, `packages/**` 수정.
  - `.env`, reference PDF/DOCX/image 수정.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 문서 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- `package-lock.json` 처리:
  - pnpm workspace 기준으로는 `pnpm-lock.yaml`이 기준 lockfile이다.
  - `package-lock.json`은 사용자 승인 없이 삭제하지 않았고 commit에도 포함하지 않았다.
- 다음 추천 작업:
  - `PHASE-05-SOCKET-ROOM-MEMBERSHIP-IMPLEMENTATION`
  - Socket.IO server wiring과 `join-room`/`leave-room` membership 검증을 repository mock 중심 테스트로 구현.

### 2026-06-06 AGENTS-NEXT-TASK-TEMPLATE-RULE

- Agent: `docs-maintainer`
- 목표: 다음 작업 추천 프롬프트를 `docs/workflows/AI_TASK_TEMPLATE.md` 형식에 맞추도록 최상위 규칙에 명시.
- 수행 내용:
  - `AGENTS.md`의 완료 보고 규칙에 다음 작업 추천 프롬프트 작성 기준을 추가.
  - 추천 프롬프트는 `docs/workflows/AI_TASK_TEMPLATE.md`의 `AI Task Spec` 형식을 참조하도록 명시.
  - TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - 앱 기능 코드 구현.
  - `.env`, 앱/패키지 코드, reference artifact 수정.
- 검증 결과:
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.

### 2026-06-06 PHASE-05-SOCKET-ROOM-MEMBERSHIP-IMPLEMENTATION

- Agent: `backend`
- 목표: Socket.IO server wiring과 `join-room`/`leave-room` membership 검증 구현.
- 수행 내용:
  - `apps/server/src/socket/server.ts` 추가.
  - `apps/server/src/socket/rooms.ts` 추가.
  - Socket.IO server를 HTTP server 시작 흐름에 연결.
  - `join-room`에서 repository membership 확인 후 `room:${roomCode}` join 구현.
  - `leave-room`에서 socket room leave만 수행하도록 구현.
  - `room-updated` payload를 `{ room: RoomDetail }`로 emit.
  - mock/in-memory repository 기반 socket handler 테스트 추가.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Drawing, Chat, Upload, Timer feature.
  - Redis adapter, 다중 instance presence, 영속 presence store.
  - 실제 MongoDB 연결 검증.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 최초 실패 후 테스트 안정화, 최종 통과. 14 files, 45 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-06-CHAT-PLAN`
  - Chat 구현 전에 `send-message`/`receive-message` payload, message validation, 최근 메시지 저장 여부를 문서화.

### 2026-06-06 PHASE-06-CHAT-PLAN

- Agent: `backend`
- 목표: Chat 구현 전에 `send-message`/`receive-message` payload, message validation, 저장 범위 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Chat 구현 계획 추가.
  - `send-message` payload 기준 정리.
  - `receive-message` payload 기준 정리.
  - message trim, 빈 문자열 차단, 200자 제한 기준 정리.
  - 같은 Socket.IO room broadcast 경계 정리.
  - 영구 채팅 아카이브 제외와 in-memory 최근 50개 저장 정책 초안 정리.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Chat 구현 코드.
  - Drawing, Upload, Timer, Round feature.
  - MongoDB chat repository와 영구 채팅 아카이브.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-06-CHAT-IMPLEMENTATION`
  - Socket.IO `send-message`/`receive-message`와 in-memory recent messages를 membership 검증 기반으로 구현.

### 2026-06-06 PHASE-06-CHAT-IMPLEMENTATION

- Agent: `backend`
- 목표: Socket.IO `send-message`/`receive-message`를 room membership 검증 기반으로 구현.
- 수행 내용:
  - `apps/server/src/socket/rooms.ts`에 `send-message` handler 추가.
  - `send-message` payload `{ roomCode: string; message: string }` 검증 추가.
  - `roomCode` trim + uppercase normalize 처리 추가.
  - message trim, 빈 문자열 차단, 200자 제한 추가.
  - socket auth context와 `RoomRepository.findRoomByCode(roomCode)` 기반 membership 검증 추가.
  - 성공 시 `receive-message` payload를 Socket.IO room `room:${roomCode}`에만 emit하도록 구현.
  - `RecentChatMessageStore`를 추가해 roomCode별 in-memory 최근 50개 chat message만 보관.
  - `apps/server/src/socket/rooms.test.ts`에 mock/in-memory repository 기반 Chat handler 테스트 추가.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - 영구 채팅 아카이브.
  - MongoDB chat repository.
  - Chat 조회 API.
  - Drawing, Upload, Timer, Round feature.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 14 files, 50 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-07-DRAWING-PLAN`
  - Drawing 구현 전에 `draw-stroke` payload, throttle/batch 기준, stroke validation, 저장 범위를 문서화.

### 2026-06-06 PHASE-07-DRAWING-PLAN

- Agent: `backend`
- 목표: Drawing 구현 전에 `draw-stroke` payload, throttle/batch 기준, stroke validation, 저장 범위 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Drawing 구현 계획 추가.
  - `draw-stroke` payload `{ roomCode, roundId, stroke }` 기준 정리.
  - stroke point validation 기준 정리.
  - throttle/batch 전송 기준 정리.
  - 같은 Socket.IO room broadcast 경계 정리.
  - MVP stroke 저장 범위를 in-memory recent stroke batches 초안으로 정리.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Drawing 구현 코드.
  - Chat, Upload, Timer, Round feature.
  - stroke 영구 아카이브, Redis adapter, multi-instance stroke sync.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-07-DRAWING-IMPLEMENTATION`
  - Socket.IO `draw-stroke` broadcast와 in-memory recent stroke batches를 membership 검증 기반으로 구현.

### 2026-06-06 PHASE-07-DRAWING-IMPLEMENTATION

- Agent: `backend`
- 목표: Socket.IO `draw-stroke` broadcast와 in-memory recent stroke batches를 room membership 검증 기반으로 구현.
- 수행 내용:
  - `apps/server/src/socket/rooms.ts`에 `draw-stroke` handler 추가.
  - `draw-stroke` payload `{ roomCode, roundId, stroke }` 검증 추가.
  - `roomCode` trim + uppercase normalize 처리 추가.
  - socket auth context와 `RoomRepository.findRoomByCode(roomCode)` 기반 membership 검증 추가.
  - 성공 시 `draw-stroke` payload를 Socket.IO room `room:${roomCode}`에만 emit하도록 구현.
  - stroke point validation과 payload당 points 1개 이상 128개 이하 제한 추가.
  - `RecentStrokeBatchStore`를 추가해 `roomCode + roundId`별 in-memory 최근 200개 stroke batch만 보관.
  - `apps/server/src/socket/rooms.test.ts`에 mock/in-memory repository 기반 Drawing handler 테스트 추가.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - stroke 영구 저장.
  - MongoDB stroke repository.
  - stroke 조회 API.
  - Chat, Upload, Timer, Round feature.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 최초 실패 후 수정하여 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 14 files, 55 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-08-ROUND-TIMER-PLAN`
  - Round/Timer 구현 전에 `start-game`, `round-started`, `round-ended` payload와 host 권한, 상태 전이, duration 기준을 문서화.

### 2026-06-06 PHASE-08-ROUND-TIMER-PLAN

- Agent: `backend`
- 목표: Round/Timer 구현 전에 `start-game`, `round-started`, `round-ended` payload와 host 권한, 상태 전이, duration 기준 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Round/Timer 구현 계획 추가.
  - `start-game` payload `{ roomCode: string }` 기준 정리.
  - `round-started` payload 기준 정리.
  - `round-ended` payload 기준 정리.
  - host만 `start-game`을 요청할 수 있는 권한 기준 정리.
  - room status와 `currentRoundIndex` 상태 전이 기준 정리.
  - round duration과 server memory timer scheduling MVP 정책 정리.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Round/Timer 구현 코드.
  - Drawing, Chat, Upload feature.
  - Redis scheduler, durable job queue, multi-instance timer coordination.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-08-ROUND-TIMER-IMPLEMENTATION`
  - Socket.IO `start-game`과 in-memory round timer를 host 권한 및 room 상태 전이 검증 기반으로 구현.

### 2026-06-06 PHASE-07-IMAGE-UPLOAD-GRIDFS-PLAN

- Agent: `backend`
- 목표: Image upload/GridFS 구현 전에 업로드 API, 파일 검증, GridFS 저장, images metadata 저장 범위 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Image Upload/GridFS 구현 계획 추가.
  - `POST /api/rooms/:roomCode/images` multipart/form-data 기준 정리.
  - `GET /api/rooms/:roomCode/images`, `GET /api/images/:imageId` 기준 정리.
  - 인증 및 room membership 검증 기준 정리.
  - 이미지 파일 MIME type, size, empty file, originalName 처리 기준 정리.
  - MongoDB GridFS bucket과 `images` metadata 저장 기준 정리.
  - Render local filesystem에 이미지 바이너리를 영구 저장하지 않는 정책 명시.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Image upload 구현 코드.
  - Random round start, Timer, Result save.
  - 이미지 리사이징, 썸네일 생성, 고급 이미지 편집.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-07-IMAGE-UPLOAD-GRIDFS-IMPLEMENTATION`
  - Image upload API, GridFS storage, images metadata repository를 인증 및 room membership 검증 기반으로 구현.

### 2026-06-06 PHASE-07-IMAGE-UPLOAD-GRIDFS-IMPLEMENTATION

- Agent: `backend`
- 목표: Image upload API, GridFS storage, images metadata repository를 인증 및 room membership 검증 기반으로 구현.
- 수행 내용:
  - shared image contract 추가.
  - `ImageRepository`, `ImageStorage` 계약 추가.
  - `InMemoryImageRepository`, `InMemoryImageStorage` 추가.
  - `MongoImageRepository`와 GridFS image storage 추가.
  - `POST /api/rooms/:roomCode/images` 구현.
  - `GET /api/rooms/:roomCode/images` 구현.
  - `GET /api/images/:imageId` 구현.
  - Firebase auth context, room membership, waiting room, per-user maxImagesPerUser 검증 추가.
  - MIME type, 0 byte, 10MB 초과 파일 검증 추가.
  - bootstrap에 MongoDB `images` index와 GridFS storage wiring 추가.
  - Image route 테스트 추가.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Random round start.
  - Timer.
  - Result save.
  - 실제 MongoDB/GridFS 연결 검증.
  - 이미지 리사이징, 썸네일 생성, 고급 이미지 편집.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 최초 실패 후 수정하여 통과.
  - `corepack pnpm --filter @doodle/server test`: 최초 실패 후 수정하여 통과. 15 files, 61 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-08-RANDOM-ROUND-START-PLAN`
  - 미사용 이미지 랜덤 선택과 `round-started` payload를 Image metadata 기반으로 문서화.

### 2026-06-06 PHASE-08-RANDOM-ROUND-START-PLAN

- Agent: `backend`
- 목표: Random round start 구현 전에 미사용 이미지 선택, `round-started` payload, image used 처리, room 상태 전이 기준 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Random Round Start 구현 계획 추가.
  - 미사용 이미지 랜덤 선택 기준 정리.
  - `round-started` payload를 Image metadata 기반으로 정리.
  - selected image의 `used: true` 처리 기준 정리.
  - host 권한과 room membership 검증 기준 정리.
  - `waiting -> playing` 상태 전이 기준 정리.
  - 업로드 이미지 부족 시 `ROUND_IMAGE_NOT_FOUND` error code 기준 정리.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Random round start 구현 코드.
  - Timer scheduling과 `round-ended` 자동 emit.
  - Result save.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-08-RANDOM-ROUND-START-IMPLEMENTATION`
  - Image metadata repository 기반 미사용 이미지 선택, used 처리, `round-started` emit을 host 권한 검증 기반으로 구현.

### 2026-06-06 PHASE-08-RANDOM-ROUND-START-IMPLEMENTATION

- Agent: `backend`
- 목표: Image metadata repository 기반 미사용 이미지 선택, used 처리, `round-started` emit을 host 권한 검증 기반으로 구현.
- 수행 내용:
  - Socket.IO `start-game` event 추가.
  - socket auth context, room membership, host 권한, `waiting` status 검증 추가.
  - `ImageRepository.listUnusedImagesByRoomCode()` 계약과 구현 추가.
  - `ImageRepository.markImageUsed()` 계약과 구현 추가.
  - `RoomRepository.startGame()` 계약과 in-memory/MongoDB 구현 추가.
  - deterministic test가 가능하도록 image selector와 round id generator를 handler dependency로 분리.
  - 성공 시 selected image를 `used: true`로 처리하고 `round-started` payload emit.
  - room status/currentRoundIndex 변경 후 `room-updated` emit.
  - socket handler 테스트 추가.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Timer scheduling.
  - `round-ended` 자동 emit.
  - Result save.
  - 실제 MongoDB/GridFS 연결 검증.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 15 files, 64 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-10-TIMER-ROUND-END-PLAN`
  - Timer/round end 구현 전에 `round-ended`, 드로잉 차단, 다음 라운드 또는 finished 전이 기준을 문서화.

### 2026-06-06 PHASE-10-TIMER-ROUND-END-PLAN

- Agent: `backend`
- 목표: Timer/round end 구현 전에 `round-ended`, drawing 차단, 다음 round 또는 finished 전이 기준 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Timer/Round End 구현 계획 섹션 추가.
  - `round-ended` payload를 `{ roomCode, roundId, roundIndex, image, endedAt }` 기준으로 정리.
  - `game-finished` payload를 `{ roomCode, room, finishedAt }` 기준으로 정리.
  - timer 만료 시 room 재조회, stale timer no-op, `round-ended` emit, drawing 차단, unused image 조회, 다음 round 또는 finished 전이 순서 정리.
  - 종료된 round와 finished room에서 drawing을 차단하는 기준 정리.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Timer/round end 구현 코드.
  - Result save.
  - Redis scheduler, durable timer recovery, multi-instance coordination.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 문서 4개와 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-10-TIMER-ROUND-END-IMPLEMENTATION`
  - In-memory round timer, `round-ended`, drawing block, next round 또는 finished 전이를 구현.

### 2026-06-06 PHASE-10-TIMER-ROUND-END-IMPLEMENTATION

- Agent: `backend`
- 목표: In-memory round timer, `round-ended`, drawing block, next round 또는 finished 전이 구현.
- 수행 내용:
  - `RoundRuntimeStateStore`와 `InMemoryRoundTimerScheduler` 추가.
  - `start-game` 성공 후 active round 등록과 in-memory timer schedule 추가.
  - timer 만료 시 `round-ended` emit 구현.
  - unused image가 있으면 다음 image used 처리, `currentRoundIndex` 증가, 다음 `round-started` emit 구현.
  - unused image가 없으면 room status `finished` 전이, `game-finished`, `room-updated` emit 구현.
  - `draw-stroke`를 active playing round에서만 허용하도록 차단 구현.
  - `RoomRepository.advanceRound()`, `RoomRepository.finishGame()` 계약과 in-memory/MongoDB 구현 추가.
  - socket handler 테스트 추가 및 기존 drawing/start-game 테스트 갱신.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Result save와 합성 이미지 생성.
  - Redis scheduler, durable timer recovery, multi-instance coordination.
  - 실제 MongoDB 연결 검증.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 15 files, 68 tests.
  - `git status --short`: 코드/문서 변경 파일과 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-11-RESULT-SAVE-PLAN`
  - round 종료 후 합성 이미지 생성/저장과 `results` metadata 저장 범위를 문서화.


### 2026-06-06 PHASE-11-RESULT-SAVE-PLAN

- Agent: `backend`
- 목표: Result save 구현 전에 결과 이미지 생성/저장, GridFS 저장, `results` metadata 저장 범위 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Result Save 구현 계획 섹션 추가.
  - `round-ended` 이후 `roomCode + roundId` 기준 결과 저장 trigger와 idempotency 기준 정리.
  - 원본 image와 in-memory stroke batch 합성 MVP 기준 정리.
  - GridFS bucket `resultImages`, 선택 thumbnail bucket `resultThumbnails` 저장 기준 정리.
  - Render local filesystem 영구 저장 금지 정책 재확인.
  - `results` metadata schema와 room/round/image 연결 기준 정리.
  - `result-saved` event payload와 실패/error code, 재시도 범위 정리.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Result save 구현 코드.
  - Gallery/download API.
  - Redis scheduler, durable job queue, multi-instance processing.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 문서 4개와 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-11-RESULT-SAVE-IMPLEMENTATION`
  - round 종료 후 result image 합성, GridFS 저장, `results` metadata repository, `result-saved` emit을 구현.


### 2026-06-06 PHASE-11-RESULT-SAVE-IMPLEMENTATION

- Agent: `backend`
- 목표: Round 종료 후 result image 합성, GridFS 저장, `results` metadata repository, `result-saved` emit 구현.
- 수행 내용:
  - `packages/shared/src/result.ts`에 `ResultMetadata` 추가.
  - `apps/server/src/results`에 repository, storage, composer, service 모듈 추가.
  - MongoDB `results` repository와 GridFS bucket `resultImages` storage skeleton 구현.
  - bootstrap/server/socket dependency wiring에 result repository/storage/service 연결.
  - `handleRoundTimerExpired`에서 `round-ended` 이후 result save를 trigger하고 성공 시 `result-saved` emit 추가.
  - result save 실패가 다음 round/finished 전이를 막지 않도록 best-effort 처리.
  - service/socket/bootstrap 테스트 추가 및 갱신.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Gallery/download API.
  - Redis scheduler, durable job queue, multi-instance processing.
  - 실제 MongoDB/GridFS 연결 검증.
  - 고급 이미지 합성 라이브러리 기반 pixel-perfect rendering.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 16 files, 71 tests.
  - `git status --short`: result 구현/문서 변경 파일과 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-12-GALLERY-DOWNLOAD-PLAN`
  - 저장된 `results` metadata 조회와 result image download API 범위를 문서화.


### 2026-06-06 PHASE-12-GALLERY-DOWNLOAD-PLAN

- Agent: `backend`
- 목표: Gallery/download 구현 전에 저장된 `results` metadata 조회와 result image download API 범위 문서화.
- 수행 내용:
  - `docs/DATABASE_API_SOCKET.md`에 Gallery/Download 구현 계획 섹션 추가.
  - `GET /api/rooms/:roomCode/results` API 기준 정리.
  - `GET /api/results/:resultId/download` API 기준 정리.
  - Firebase auth와 room membership 검증 기준 정리.
  - pagination/sort/cursor 기준 정리.
  - GridFS bucket `resultImages` stream 응답과 download headers 기준 정리.
  - result/room/access/file missing error code 기준 정리.
  - Thumbnail API MVP 선택 범위를 문서화하되 구현 제외로 명시.
  - IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Gallery/download 구현 코드.
  - Result save 변경.
  - Redis scheduler, durable job queue, multi-instance processing.
  - Thumbnail API 구현.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `git status --short`: 변경 문서 4개와 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-12-GALLERY-DOWNLOAD-IMPLEMENTATION`
  - `results` metadata list API와 result image GridFS download API를 인증 및 room membership 검증 기반으로 구현.


### 2026-06-06 PHASE-12-GALLERY-DOWNLOAD-IMPLEMENTATION

- Agent: `backend`
- 목표: `results` metadata list API와 result image GridFS download API를 인증 및 room membership 검증 기반으로 구현.
- 수행 내용:
  - `GET /api/rooms/:roomCode/results` API 추가.
  - `GET /api/results/:resultId/download` API 추가.
  - `ResultRepository.findResultById()`와 `listResultsByRoomCode()` 계약 및 구현 추가.
  - `ResultImageStorage.getResultImage()` 계약 및 구현 추가.
  - Express app에 result route wiring 추가.
  - result route 테스트 추가.
  - DATABASE_API_SOCKET.md, IMPLEMENTATION_NOTES.md, TEST_REPORT.md 갱신.
- 의도적으로 제외:
  - Thumbnail API.
  - Result save flow 변경.
  - Redis scheduler, durable job queue, multi-instance processing.
  - 실제 MongoDB/GridFS 연결 검증.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과. 17 files, 75 tests.
  - `git status --short`: Gallery/download 구현/문서 변경 파일과 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 충돌/주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 건드리지 않음.
- 다음 추천 작업:
  - `PHASE-13-CICD-DEPLOY-PLAN`
  - Render/server 배포와 프론트 배포 URL 기준의 CI/CD, env, smoke 검증 범위를 문서화.

### 2026-06-06 FRONTEND-VITE-REACT-SCAFFOLD

- Agent: `frontend`
- 목표: placeholder 상태의 `apps/web`을 실제 Vite + React + TypeScript 앱 scaffold로 전환.
- 수행 내용:
  - `@doodle/web` scripts를 실제 `typecheck`, `build`, `dev`, `preview` 명령으로 교체.
  - React/Vite/lucide 의존성과 React 타입 의존성 추가.
  - Vite entry와 React root를 추가.
  - `App.tsx`에 로비, 방 생성/입장, 대기실, 이미지 업로드, 플레이 placeholder, 결과 갤러리 화면을 구성.
  - `src/api/client.ts`에 서버 REST 계약 기반 API client를 추가.
  - 인증이 필요한 result download는 fetch + Blob 다운로드 방식으로 구현.
  - `styles.css`에 hand-drawn paper UI 방향의 responsive layout을 추가.
- 의도적으로 제외:
  - Firebase Client SDK 로그인 구현.
  - Socket.IO client 연결.
  - Canvas drawing 실제 편집 도구.
  - Chat 실시간 UI.
  - 프론트 e2e 테스트.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 최초 실패 후 Vite 타입 선언 추가로 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 충돌/주의:
  - 기존 미추적 `package-lock.json`은 건드리지 않았다.
  - `pnpm-lock.yaml`은 pnpm workspace 의존성 추가로 갱신되었다.
- 다음 추천 작업:
  - `PHASE-FE-02-FIREBASE-AUTH-CLIENT`
  - Firebase Client SDK 로그인과 ID Token 발급/갱신, `/api/users/me` 연동을 프론트에 구현한다.

### 2026-06-06 FRONTEND-PHASE-CHECKLIST

- Agent: `docs-maintainer`
- 목표: 프론트 작업을 기존 MVP/backend Phase와 분리해 공식 체크리스트로 문서화.
- 수행 내용:
  - `docs/DEVELOPMENT_PLAN_CHECKLIST.md`에 `Frontend 개발 단계` 섹션 추가.
  - `PHASE-FE-*` 흐름을 FE-01부터 FE-08까지 정리.
  - FE-01 Web scaffold 완료 상태를 명시.
  - 프론트 작업 원칙과 secret 처리 기준을 추가.
- 의도적으로 제외:
  - 앱 기능 코드 변경.
  - Firebase Client SDK 로그인 구현.
  - Socket.IO client 구현.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `git status --short`: 문서 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 추천 작업:
  - `PHASE-FE-02-FIREBASE-AUTH-CLIENT`
  - Firebase Client SDK 로그인과 ID Token 발급/갱신, `/api/users/me` 연동을 프론트에 구현한다.

### 2026-06-06 PHASE-FE-02-FIREBASE-AUTH-CLIENT

- Agent: `frontend`
- 목표: 프론트엔드 Firebase Client SDK 로그인과 ID Token 발급/갱신, `/api/users/me` 연동 구현.
- 수행 내용:
  - `@doodle/web`에 `firebase` 의존성 추가.
  - `src/auth/firebase.ts`를 추가해 Firebase client app/auth 초기화를 `VITE_` 환경변수 기반으로 분리.
  - 초기 구현에서는 이메일/비밀번호 로그인 UI와 로그인 상태 표시, 토큰 갱신, 로그아웃 동작을 추가.
  - 로그인 성공 시 ID Token을 발급받고 `ApiClient.upsertMe()`로 `/api/users/me`를 호출한다.
  - 로그아웃 시 token, profile, room/images/results 상태를 정리한다.
  - 개발용 수동 token fallback은 접을 수 있는 패널로 유지했다.
- 의도적으로 제외:
  - Socket.IO client 연결.
  - Canvas drawing 구현.
  - Chat 구현.
  - 실제 Firebase 계정 기반 smoke 검증.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 추천 작업:
  - `PHASE-FE-03-LOBBY-ROOM-FLOW`
  - 로그인된 사용자 기준으로 방 생성/입장, room detail refresh, 참가자/업로드 상태 UX를 다듬는다.
### 2026-06-06 PHASE-FE-03-LOBBY-ROOM-FLOW

- Agent: `frontend`
- 목표: 로그인된 사용자 기준 방 생성/입장, room detail refresh, 참가자/업로드 상태 UX 정리.
- 수행 내용:
  - 로그인 전 방 생성/입장 action 비활성화 및 안내 추가.
  - roomCode normalize를 UI 입력과 API 호출 경계에 적용.
  - room refresh를 `Promise.allSettled` 기반으로 안정화해 일부 목록 실패가 전체 화면을 깨지 않게 정리.
  - 참가자/이미지/결과 목록 loading, empty, error 상태 추가.
  - API error code를 안전한 사용자 문구로 표시하도록 매핑.
- 의도적으로 제외:
  - Socket.IO client 구현.
  - Canvas drawing 구현.
  - Chat 구현.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 자동 진행:
  - `PHASE-FE-04-IMAGE-UPLOAD-GALLERY`
### 2026-06-06 PHASE-FE-04-IMAGE-UPLOAD-GALLERY

- Agent: `frontend`
- 목표: 이미지 업로드 UI와 결과 갤러리/download UX를 서버 API 계약에 맞춰 정리.
- 수행 내용:
  - JPEG/PNG/WebP MIME type, 0 byte, 10MB 초과 업로드 사전 검증 추가.
  - 업로드 성공 후 image metadata 목록 refresh 적용.
  - 이미지 목록에 파일 크기와 used 상태 표시 추가.
  - Gallery toolbar, result count, pagination 상태, download 버튼 문구 개선.
- 의도적으로 제외:
  - Thumbnail API 구현.
  - Socket.IO client 구현.
  - Canvas drawing 구현.
  - Chat 구현.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 자동 진행:
  - `PHASE-FE-05-SOCKET-ROOM-AND-CHAT`
### 2026-06-06 PHASE-FE-05-SOCKET-ROOM-AND-CHAT

- Agent: `frontend`
- 목표: Socket.IO client 연결, room join/leave, room-updated, chat UI 구현.
- 수행 내용:
  - `socket.io-client` 의존성 추가.
  - token 기반 socket auth와 `join-room`/`leave-room` emit 추가.
  - `room-updated`, `socket-error`, `receive-message` handler 추가.
  - `send-message` form과 200자 이하 validation 추가.
  - chat list와 socket connection 상태 UI 추가.
- 의도적으로 제외:
  - Canvas drawing 구현.
  - Timer UX 구현.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 자동 진행:
  - `PHASE-FE-06-CANVAS-DRAWING`
### 2026-06-06 PHASE-FE-06-CANVAS-DRAWING

- Agent: `frontend`
- 목표: Canvas drawing UI와 `draw-stroke` 송수신 구현.
- 수행 내용:
  - Canvas drawing surface 추가.
  - pointer event 기반 stroke 입력과 normalized point 생성 추가.
  - points 128개 이하 batch 전송 구현.
  - `draw-stroke` 송신과 수신 stroke local canvas 반영 구현.
  - non-playing 또는 socket disconnected 상태 drawing 비활성화 구현.
- 의도적으로 제외:
  - Result save API 구현.
  - Timer UX 구현.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 자동 진행:
  - `PHASE-FE-07-ROUND-TIMER-UX`
### 2026-06-06 PHASE-FE-07-ROUND-TIMER-UX

- Agent: `frontend`
- 목표: Round started/ended/game finished 이벤트 기반 timer UX와 상태 전환 구현.
- 수행 내용:
  - `round-started`, `round-ended`, `game-finished` socket handler 추가.
  - active round 상태와 countdown 표시 추가.
  - round-ended 이후 drawing 비활성화 처리.
  - 다음 round-started 시 canvas stroke 초기화 처리.
  - game-finished gallery CTA 추가.
- 의도적으로 제외:
  - Timer scheduling 구현.
  - Result save flow 구현.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 자동 진행:
  - `PHASE-FE-08-FRONTEND-QA-POLISH`
### 2026-06-06 PHASE-FE-08-FRONTEND-QA-POLISH

- Agent: `frontend`
- 목표: 프론트 주요 user flow와 responsive/error/loading/accessibility polish 마무리.
- 수행 내용:
  - FE-03부터 FE-08 완료 상태를 개발 체크리스트에 반영.
  - mobile/desktop responsive layout 보강.
  - Vite build chunk size warning 정리.
  - 수동 QA 기준을 TEST_REPORT에 기록.
- 의도적으로 제외:
  - backend 구현 변경.
  - 배포 수행.
  - 실제 Firebase/Socket multi-client E2E smoke.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 프론트 자동 진행 결과:
  - FE-03, FE-04, FE-05, FE-06, FE-07, FE-08 구현 완료.
- 다음 추천 작업:
  - `PHASE-13-CICD-DEPLOY-PLAN`
  - Render/server 배포와 프론트 배포 URL 기준의 CI/CD, env, smoke 검증 범위를 문서화한다.

### 2026-06-06 LOCAL-BACKEND-FRONTEND-INTEGRATION-SMOKE

- Agent: `backend/frontend-integration`
- 목표: Phase 13 진행 전 로컬 기준으로 백엔드와 프론트엔드가 함께 실행 가능한지 점검.
- 수행 내용:
  - 서버 bootstrap smoke, 서버 typecheck/test, 웹 typecheck/build를 실행했다.
  - `@doodle/server dev`가 workspace root `.env`를 찾지 못하는 문제를 확인하고 상위 디렉터리 탐색 기반 env loader로 보강했다.
  - Express HTTP API용 CORS middleware를 추가하고 `CLIENT_URL` 기준으로 preflight를 허용하도록 wiring했다.
  - `GET /health`, 웹 dev server 200 응답, API preflight 204 응답을 로컬에서 확인했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server smoke:bootstrap`: 통과.
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과.
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 작업 변경과 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 실제 Firebase 로그인, 이미지 업로드, Socket multi-client E2E는 사용자 계정/브라우저 세션 기반 수동 QA 범위로 남겼다.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 추천 작업:
  - `PHASE-13-CICD-DEPLOY-PLAN`
  - 배포 전에 수동 로컬 E2E 체크리스트를 한 번 수행하면 더 안전하다.

### 2026-06-06 PHASE-LOCAL-MANUAL-E2E-SMOKE

- Agent: `qa`
- 목표: Phase 13 배포 전에 로컬 환경에서 프론트엔드와 백엔드의 실제 사용자 플로우 연결 상태를 점검하고 수동 QA 기준을 문서화.
- 수행 내용:
  - 서버 typecheck/test와 웹 typecheck/build를 실행했다.
  - 로컬 실행 기준을 백엔드 dev server, 웹 dev server, 브라우저 URL, health URL 기준으로 정리했다.
  - Firebase 로그인, user upsert, 방 생성/입장, 이미지 업로드/목록, socket join/chat/drawing, round timer/result/gallery 흐름을 수동 E2E 체크리스트로 기록했다.
  - 실제 사용자 조작이 필요한 항목과 Phase 13 전 리스크를 `TEST_REPORT.md`에 남겼다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과.
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 문서 변경과 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 앱 기능 코드 변경.
  - 실제 Firebase 계정/브라우저 세션을 이용한 수동 조작 대행.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 추천 작업:
  - 수동 체크리스트를 실제 브라우저 2세션으로 확인한 뒤 `PHASE-13-CICD-DEPLOY-PLAN`을 진행한다.

### 2026-06-06 FRONTEND-GOOGLE-AUTH-UX-CORRECTION

- Agent: `frontend`
- 목표: 실제 제품 방향에 맞게 이메일/비밀번호 로그인 대신 Google 로그인 중심 UX로 정리.
- 수행 내용:
  - Firebase client 로그인 방식을 `GoogleAuthProvider` + popup 로그인으로 변경했다.
  - 이메일/비밀번호 입력 폼을 제거했다.
  - 로그인 후 닉네임을 별도로 수정/저장할 수 있는 프로필 form을 추가했다.
  - 개발용 token fallback은 일반 흐름이 아니라 숨겨진 개발용 보조 수단으로 유지했다.
  - 방이 없는 상태에서 `대기실/플레이/갤러리` 버튼이 먼저 보이지 않도록 정리하고, 방 선택 후 `방 준비/그리기/결과` 이동만 보여주도록 변경했다.
  - 로컬 기본 API URL fallback을 서버 기본 포트인 `http://localhost:4000`으로 맞췄다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
- 의도적으로 제외:
  - 실제 Google 로그인 popup 수동 조작.
  - 백엔드 API/Socket 기능 변경.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-06 PHASE-FE-AUTH-LOBBY-UX-REFINE

- Agent: `frontend`
- 목표: Google 로그인 중심 초기 진입/로비 UX 정리와 방 만들기/입장 모달화.
- 수행 내용:
  - 로그인 전에는 Google 로그인 중심의 단일 화면만 렌더링하도록 변경했다.
  - 로그인 후 상단 오른쪽 프로필 메뉴를 추가하고 닉네임 변경/로그아웃 액션을 제공했다.
  - 일반 UI에서 API 서버 input과 개발용 token fallback을 제거했다.
  - 로비를 `방 만들기`, `방 입장` 두 CTA 중심으로 단순화했다.
  - 방 만들기와 방 입장 입력을 각각 모달 form으로 이동했다.
  - 백엔드는 변경하지 않고 Firebase ID Token 검증 흐름을 유지했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 프론트/문서 변경과 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 백엔드 provider 강제 검증.
  - Socket, Drawing, Upload, Timer, Result 기능 변경.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-06 PHASE-BE-GOOGLE-AUTH-PROVIDER-GUARD

- Agent: `backend`
- 목표: Firebase ID Token 인증 흐름에서 Google OAuth 로그인 사용자만 허용하도록 provider 검증 경계 추가.
- 수행 내용:
  - shared `AuthErrorCode`에 `AUTH_PROVIDER_UNSUPPORTED`를 추가했다.
  - `VerifiedFirebaseToken`에 Firebase decoded token의 `firebase.sign_in_provider` claim을 포함했다.
  - `verifyAuthToken()` 공통 경계에서 `google.com` provider만 허용하도록 검증했다.
  - Firebase Admin verifier가 decoded token의 `firebase` claim을 전달하도록 수정했다.
  - HTTP auth, Socket auth, token 단위 테스트에 Google provider 통과와 non-Google provider 거절 케이스를 추가했다.
  - `DATABASE_API_SOCKET.md`와 `USER_FLOW.md`에 Google provider guard 정책을 문서화했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과.
  - `git status --short`: backend/shared/docs 변경과 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 프론트엔드 코드 변경.
  - 실제 Firebase Admin/Google OAuth 연결 검증.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-06 LOCAL-VITE-FALLBACK-CORS-FIX

- Agent: `backend`
- 목표: Vite dev server가 5174 등 fallback port로 실행될 때 local HTTP API/Socket CORS가 막히는 문제 해결.
- 수행 내용:
  - HTTP CORS middleware가 configured origin뿐 아니라 non-production에서 localhost/127.0.0.1 Vite fallback origin pattern을 허용하도록 변경했다.
  - Express app bootstrap에서 `NODE_ENV !== "production"`일 때만 localhost dev origin fallback을 켰다.
  - Socket.IO CORS도 non-production에서 같은 localhost Vite fallback origin pattern을 허용하도록 보강했다.
  - `http://localhost:5174` preflight 허용 테스트를 추가했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과.
  - `git status --short`: backend/docs 변경과 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - production origin 완화.
  - 프론트엔드 코드 변경.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
### 2026-06-06 PHASE-BE-ROOM-READY-UPLOAD-PROFILE-BROADCAST

- Agent: `backend`
- 목표: 사용자당 이미지 1장 제한, room ready 검증, 이미지 업로드/profile 변경 후 `room-updated` broadcast 구현.
- 수행 내용:
  - 이미지 업로드 route에서 같은 room의 같은 Firebase 사용자가 이미 업로드한 경우 GridFS 저장 전에 `IMAGE_UPLOAD_LIMIT_EXCEEDED`로 거절하도록 변경했다.
  - room 생성 기본 `maxImagesPerUser`를 1로 조정했다.
  - `SocketRoomUpdatePublisher`를 추가하고 HTTP image route 성공 후 같은 Socket.IO room에 `room-updated { room }`을 emit하도록 wiring했다.
  - `start-game`에 participants ready guard를 추가했다. 모든 participants가 이미지 1장을 업로드해야 시작할 수 있다.
  - `ROOM_PARTICIPANTS_NOT_READY` socket error code를 추가했다.
  - `profile-updated { roomCode }` socket event를 추가하고 socket auth, room membership, latest user profile 조회, room participant profile 갱신, `room-updated` emit 순서로 처리했다.
  - `RoomRepository.updateParticipantProfile()`과 `UserRepository.findByFirebaseUid()` 계약 및 in-memory/MongoDB 구현을 추가했다.
  - mock/in-memory 중심 테스트를 추가하고 기존 테스트 기대값을 MVP 정책에 맞췄다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과.
  - `git status --short`: backend/docs 변경 및 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 프론트엔드 코드 변경.
  - Drawing, Chat, Timer, Result save 동작 변경.
  - 실제 MongoDB/GridFS 연결 검증.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 다음 작업 후보:
  - 프론트엔드에서 이미지 업로드 미리보기, 사용자당 1장 UI 제한, socket 연결 상태 숨김, `room-updated` 기반 준비 상태 갱신, 자동 play/result 화면 전환 UX를 반영한다.
### 2026-06-06 PHASE-FE-ROOM-READY-UPLOAD-PREVIEW-AUTO-FLOW

- Agent: `frontend`
- 목표: 방 준비 화면을 ready 중심으로 정리하고 업로드 미리보기, 자동 플레이/결과 전환 UX를 구현.
- 수행 내용:
  - 방 준비 화면에서 participant별 `Ready`/`Waiting` 상태를 표시하도록 변경했다.
  - ready 기준은 `images.uploadedBy.firebaseUid` 기준 사용자당 이미지 1장 업로드 완료로 계산한다.
  - host에게만 `시작하기` 버튼을 표시하고, 모든 참가자가 ready일 때만 활성화했다.
  - 파일 선택 즉시 업로드하지 않고 client validation 후 object URL preview를 표시하도록 변경했다.
  - preview 취소/업로드 완료/cleanup 시 object URL을 정리한다.
  - 이미 업로드한 사용자의 업로드 UI를 비활성화했다.
  - 닉네임 저장 성공 후 현재 room이 있으면 socket `profile-updated { roomCode }`를 emit한다.
  - `room-updated` 수신 시 room detail과 image list를 갱신한다.
  - `round-started` 수신 시 play 화면, `result-saved`/`game-finished` 수신 시 gallery 화면으로 자동 전환한다.
  - 일반 UI에서 socket 연결 상태 표시를 숨기고 socket 오류만 상태 메시지로 유지했다.
  - 수동 `그리기`/`결과` 탭을 제거했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: frontend/docs 변경 및 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 백엔드 코드 변경.
  - Drawing, Chat, Timer, Result save 기존 동작 변경.
  - 실제 브라우저 다중 세션 E2E.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
### 2026-06-06 PHASE-FE-HANDDRAWN-DESIGN-SYSTEM

- Agent: `frontend`
- 목표: Rough.js/Gaegu/Pretendard 기반 손그림 낙서 스타일 정리.
- 수행 내용:
  - 기능 동작은 변경하지 않고 CSS 중심으로 UI 분위기를 조정했다.
  - `Gaegu`를 제목/강조에, `Pretendard` fallback을 본문/버튼에 유지했다.
  - Rough.js 실제 도입은 dependency/lockfile 변경이 필요해 보류했다.
  - 종이 배경, 마커형 underline, sketchy card, dashed inner border, 비정형 버튼/입력/모달/캔버스 스타일을 적용했다.
  - 모바일에서 카드 회전을 제거하고 upload preview layout을 단일 column으로 보정했다.
  - 디자인 문서에 Rough.js 보류와 CSS handdrawn 적용 기준을 기록했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 변경 파일 및 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 기능 동작 변경.
  - Rough.js package 설치.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
### 2026-06-06 PHASE-LOCAL-E2E-PLAY-FLOW-QA-FIX

- Agent: `qa-frontend`
- 목표: 로컬 Google 로그인부터 start-game, 라운드 이미지 표시, drawing socket sync, result/gallery 자동 전환까지 플레이 흐름 점검.
- 수행 내용:
  - 프론트/백엔드 socket/API 결합 지점을 코드 기준으로 점검했다.
  - `result-saved` 수신 후 gallery 자동 전환 시 이전 pagination cursor가 남을 수 있는 문제를 수정했다.
  - 로컬 server/web 실행 기준과 사용자 수동 E2E 체크리스트를 `TEST_REPORT.md`에 기록했다.
  - Rough.js 실제 도입은 dependency/lockfile 변경이 필요하므로 별도 phase 후보로 남겼다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과.
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `git status --short`: 변경 파일 및 기존 미추적 `package-lock.json` 확인.
- 의도적으로 제외:
  - 실제 Google 계정 로그인 자동화.
  - 다중 브라우저 수동 drawing sync 자동화.
  - Rough.js package 설치.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-07 PHASE-12.5-LOCAL-E2E-UX-QA-POLISH

- Agent: `qa-frontend`
- 목표: Phase 13 전 사용자 관점 전체 플레이 플로우 완성도 점검 및 치명 UX 마찰 최소 수정.
- 수행 내용:
  - `docs/DEVELOPMENT_PLAN_CHECKLIST.md`에 Phase 12.5 로컬 E2E UX QA polish 단계를 추가했다.
  - 방 준비 화면의 시작 조건 안내를 강화했다.
  - 준비 안 된 참가자 목록, host 시작 가능 상태, guest 대기 상태를 구분해 표시한다.
  - `round-ended` 이후 결과 저장 중/저장 완료 상태를 play 화면 상태 패널과 전역 메시지에 반영했다.
  - 갤러리 empty/error 상태에서 결과를 다시 불러올 수 있는 버튼을 추가했다.
  - 모바일/좁은 화면에서 profile, room code, 주요 버튼이 줄바꿈되어 겹치지 않도록 CSS를 보강했다.
- 의도적으로 제외:
  - 새로운 게임 기능 추가.
  - 백엔드 API/Socket 계약 변경.
  - 실제 Google 계정 기반 2인 브라우저 조작 자동화.
  - `package-lock.json` 변경/삭제/commit.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-07 WIREFRAME-MVP-LAYOUT-POLISH

- Agent: `frontend`
- 목표: 제공된 손그림 와이어프레임에서 MVP 범위에 해당하는 화면 구조만 선별해 현재 UI 레이아웃 완성도를 높임.
- 수행 내용:
  - 방 목록, 비공개방, 비밀번호, 최대 인원, 전체 다운로드는 MVP 외 범위로 제외했다.
  - 대기실 summary를 상단 전체 폭 카드로 조정하고 room code, 상태, 참가자, 이미지, ready 정보를 한눈에 보이게 했다.
  - host start/refresh action을 같은 action row로 묶었다.
  - 업로드 이미지 목록을 카드형 grid로 바꿔 와이어프레임의 사진 카드 흐름에 가깝게 조정했다.
  - 플레이 화면에 참가자 rail을 추가해 참가자, canvas, chat 3영역 구조를 만들었다.
  - canvas header에 현재 라운드와 현재 사진 업로드 사용자를 표시했다.
  - gallery toolbar/result card의 시각 계층을 보강했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
- 의도적으로 제외:
  - 기능 동작 변경.
  - 백엔드/API/Socket 계약 변경.
  - `package-lock.json` 변경/삭제/commit.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-07 DRAWING-TOOL-LAYER-POLISH

- Agent: `frontend/backend`
- 목표: 와이어프레임 기준 MVP에 포함할 수 있는 drawing tool을 추가하고, 지우개가 사진을 훼손하지 않도록 레이어 합성 방식으로 수정.
- 수행 내용:
  - 프론트엔드 canvas toolbar에 `펜`, `지우개`, 색상 swatch, 굵기 선택을 추가했다.
  - 기존 `draw-stroke` payload의 `tool`, `color`, `width` 필드를 사용해 Socket 계약 변경 없이 도구 상태를 전송한다.
  - 클라이언트 canvas redraw는 사진 배경을 먼저 그리고, 별도 offscreen drawing layer에 stroke를 replay한 뒤 합성한다.
  - 지우개 stroke는 drawing layer에서만 `destination-out`으로 처리해 원본 사진을 지우지 않는다.
  - 서버 result composer도 eraser를 흰색 stroke로 그리지 않고, SVG mask로 이전 stroke를 제거하는 방식으로 수정했다.
  - play layout은 중간 화면에서 깨지지 않도록 1180px 이하 단일 column breakpoint를 추가했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server typecheck`: 통과.
  - `corepack pnpm --filter @doodle/server test`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
- 의도적으로 제외:
  - 전체 지우기 동기화 이벤트.
  - Undo/Redo.
  - 백엔드 Socket/API 계약 변경.
  - `package-lock.json` 변경/삭제/commit.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-07 OVERALL-UI-UX-VISUAL-POLISH

- Agent: `frontend`
- 목표: 전체 레이아웃과 UI/UX를 다시 점검해 과한 손그림 장식으로 인한 산만함과 깨짐 가능성을 줄임.
- 수행 내용:
  - 기능 동작은 변경하지 않고 CSS 중심으로 시각 polish를 적용했다.
  - paper/card rotation을 제거하고 shadow, border, radius를 더 일관된 값으로 정리했다.
  - 색상 토큰을 더 부드러운 paper/post-it palette로 조정했다.
  - body grid background와 hero 영역을 줄여 작업 화면의 시각 집중도를 높였다.
  - sticky header, status strip, button hover, profile popover 스타일을 정돈했다.
  - 업로드 이미지 목록의 과한 가짜 thumbnail 느낌을 줄이고 metadata card로 정리했다.
  - canvas, drawing toolbar, chat, gallery, modal의 border/radius/shadow를 통일했다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
- 의도적으로 제외:
  - 기능 동작 변경.
  - backend/API/Socket 계약 변경.
  - 실제 브라우저 수동 시각 QA.
  - `package-lock.json` 변경/삭제/commit.
  - push.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-07 PHASE-FE-DEV-UI-PREVIEW-MODE

- Agent: `frontend`
- 목표: 로그인 없이 로컬 브라우저 시각 QA를 수행할 수 있는 dev-only UI preview mode 추가.
- 수행 내용:
  - `?preview=login|lobby|room|play|gallery` query를 지원하는 `PreviewApp` 분기를 추가했다.
  - preview mode는 `import.meta.env.DEV` 또는 `VITE_ENABLE_UI_PREVIEW=true`일 때만 활성화된다.
  - mock user, room, participants, images, active round, chat messages, drawing strokes, results를 추가했다.
  - preview branch는 실제 앱 hook/API/Socket 초기화 전에 return하여 Firebase/API/Socket 요청을 실행하지 않는다.
  - preview 화면 action은 no-op 또는 submit prevent로 처리한다.
  - `dev preview` badge를 추가해 실제 앱 상태와 구분한다.
- 검증 결과:
  - `corepack pnpm --filter @doodle/web typecheck`: 통과.
  - `corepack pnpm --filter @doodle/web build`: 통과.
  - `http://localhost:5173/?preview=login|lobby|room|play|gallery`: 각 200 응답 확인.
- 의도적으로 제외:
  - 백엔드 인증/API/Socket 변경.
  - Firebase auth 우회.
  - 실제 저장/업로드/다운로드 기능 mock 이상 구현.
  - `package-lock.json` 변경/삭제/commit.
  - push.
- 참고:
  - Browser 런타임 연결은 Windows sandbox `spawn setup refresh` 실패로 완료하지 못했다.
- secret 처리:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
