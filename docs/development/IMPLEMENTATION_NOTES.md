# Implementation Notes

## 기록 원칙

## 결정 사항

## 구현 메모

### 2026-06-07 PHASE-RESULT-CANVAS-FRAME-CROP

- 사용자가 결과 다운로드가 원본 사진 전체가 아니라 플레이 캔버스에서 보던 잘린 프레임 느낌과 맞아야 한다고 피드백했다.
- result composer 출력 크기를 프론트 Canvas와 같은 4:3 `960x720` frame으로 고정했다.
- 원본 이미지는 `sharp.resize(..., { fit: "cover", position: "centre" })`로 canvas cover crop과 같은 방향으로 맞춘 뒤 stroke overlay를 합성한다.
- 결과 metadata width/height도 `960x720` 기준으로 저장된다.

### 2026-06-07 PHASE-STROKE-RETENTION-RESULT-COMPOSITE

- move segment 방식으로 drawing을 실시간 전송하면서 기존 200개 recent stroke batch 제한이 너무 빨리 차 선이 사라지는 문제가 확인되었다.
- 서버 `RecentStrokeBatchStore`와 프론트 canvas render state의 stroke batch 보존 한도를 10,000개로 늘렸다.
- 결과 저장 composer에 `sharp`를 도입해 원본 이미지 위에 stroke SVG overlay를 합성한 실제 PNG를 생성하도록 변경했다.
- stroke point는 normalized 좌표를 결과 이미지 width/height 기준 pixel 좌표로 변환하고, pen/eraser 도구를 SVG path로 overlay한다.
- Redis/durable stroke store는 아직 구현하지 않았으며, MVP는 프로세스 내 in-memory 보존 한도 확대로 대응한다.

### 2026-06-07 PHASE-CANVAS-RESULT-STABILITY-FIX

- 로컬 수동 점검 중 drawing 중 이전 선이 사라지고 사진이 깜빡이는 문제가 보고되었다.
- Canvas redraw가 stroke 변경마다 배경 이미지를 새로 로드하던 구조를 수정했다.
- 배경 이미지는 URL 변경 시에만 로드해 ref에 캐시하고, stroke 변경 시에는 캐시된 이미지와 stroke 목록을 동기적으로 다시 그린다.
- 결과 다운로드 파일이 이미지 뷰어에서 열리지 않는 문제가 보고되어 result composer를 수정했다.
- 기존 composer는 PNG signature 뒤에 JSON을 붙인 placeholder였으나, 이제 IHDR/IDAT/IEND chunk와 CRC를 포함한 유효 PNG buffer를 생성한다.
- 실제 원본 이미지와 stroke를 시각적으로 합성하는 고급 rendering은 MVP 후속 개선으로 남겼다.

### 2026-06-07 PHASE-IMAGE-DOWNLOAD-HEADER-FIX

- 로컬 수동 점검 중 원본 이미지 표시와 결과 다운로드에서 500 응답이 보고되었다.
- 원본 이미지 stream route의 `Content-Disposition` header가 한글/비 ASCII 원본 파일명을 그대로 포함하면 Node HTTP header validation에서 500이 발생할 수 있어 보정했다.
- 원본 이미지 다운로드 header는 ASCII fallback `filename`과 RFC 5987 `filename*`를 함께 사용한다.
- 예상하지 못한 서버 예외도 HTML 500 대신 secret 없는 JSON `{ error: { code: "INTERNAL_SERVER_ERROR" } }` 형태로 반환하도록 안전 error handler를 추가했다.
- 결과 다운로드 route는 이미 ASCII 파일명을 사용하므로 header 변경 대상에서 제외했다.

### 2026-06-07 PHASE-LOCAL-PLAY-FLOW-FIXES

- 사용자가 로컬 수동 점검 중 라운드 사진 미표시와 drawing 실시간 반영 지연을 보고했다.
- 프론트 drawing은 기존 pointer up 시점 emit에서 pointer move 중 segment emit으로 변경했다.
- sender 로컬 state에 즉시 stroke를 중복 추가하지 않고 server echo를 기준으로 반영해 같은 room 동기화 기준을 유지했다.
- 이미지 다운로드 실패 시 `IMAGE_NOT_FOUND`, file type/size 관련 code가 일반 fallback으로 숨지 않도록 frontend error mapping을 보강했다.
- 백엔드 개발 중 파일 수정이 바로 반영되도록 `@doodle/server`에 `nodemon` devDependency를 추가하고 `dev` script를 watch 재시작 방식으로 변경했다.
- 원본 이미지 stream route, GridFS storage, Socket drawing validation 계약 자체는 변경하지 않았다.

### 2026-06-06 PHASE-FE-WIREFRAME-REFERENCE-POLISH

- 사용자가 제공한 손그림 와이어프레임 이미지를 기준으로 프론트 UI를 기능 변경 없이 정리했다.
- 로그인 화면은 중앙 종이 카드, 큰 `DOODLE` 워드마크, Google 단일 CTA가 먼저 보이도록 조정했다.
- 앱 상단은 손그림 내비게이션 바처럼 보이도록 브랜드 크기와 테두리/배경을 조정했다.
- 방 대기 화면에는 방 코드 복사 버튼, 사진 1장 업로드 강조, 참가자 색 점을 추가했다.
- 방 생성/입장, 업로드, Socket drawing, Timer, Result save 동작과 API 계약은 변경하지 않았다.

### 2026-06-06 PHASE-FE-ROUGHJS-DECORATION-LAYER

- `roughjs`를 `@doodle/web` dependency로 추가하고 `pnpm-lock.yaml`을 pnpm 기준으로 갱신했다.
- `apps/web/src/components/RoughDecoration.tsx`를 추가해 Rough.js SVG를 React lifecycle 안에서 생성/정리한다.
- 적용 범위는 hero underline, room code badge, gallery empty frame, result preview decoration으로 제한했다.
- 기능 Canvas drawing, stroke 송수신, Socket, Upload, Timer, Result save 동작은 변경하지 않았다.
- 기존 CSS handdrawn 스타일과 충돌하지 않도록 Rough.js SVG는 pointer event를 받지 않는 장식 레이어로 배치했다.

### 2026-06-05 PHASE-00-PROJECT-SCAFFOLD

- pnpm workspace root를 `package.json`, `pnpm-workspace.yaml`로 생성했다.
- 공통 TypeScript 기준 설정은 `tsconfig.base.json`에 두었다.
- `apps/web`, `apps/server`, `packages/shared` package 경계를 생성했다.
- 이번 단계에서는 React, Express, Firebase, Socket.IO, MongoDB, GridFS 기능을 구현하지 않았다.
- 의존성 설치와 production dependency 추가는 진행하지 않았다.
- `.env.example`에는 변수 이름만 두었고 실제 secret 값은 넣지 않았다.

### 2026-06-05 PHASE-01-HEALTH-ENV

- 의존성 추가 없이 framework-agnostic health handler를 `apps/server/src/health.ts`에 추가했다.
- `GET /health` 요청은 `200`과 `HealthResponse` payload를 반환하도록 정의했다.
- 그 외 method/path는 `404 NOT_FOUND` error payload를 반환하도록 정의했다.
- 서버 환경변수 검증 구조를 `apps/server/src/config/env.ts`에 추가했다.
- 필수 서버 환경변수 이름은 `packages/shared/src/env.ts`에서 공유 계약으로 관리한다.
- 실제 Express wiring, Firebase Auth, Room, Upload, Socket feature는 구현하지 않았다.
- secret 값은 생성하거나 출력하지 않았다.

### 2026-06-05 PHASE-01-HEALTH-ENV-WIRING

- `express` 기반 `createApp()`을 `apps/server/src/app.ts`에 추가했다.
- `GET /health` route를 기존 health handler에 연결했다.
- `apps/server/src/server.ts`에서 서버 시작 전 `validateServerEnv(process.env)`를 호출한다.
- 환경변수 검증 실패 시 값은 출력하지 않고 누락된 key 이름만 출력한다.
- `apps/server/src/app.test.ts`, `apps/server/src/config/env.test.ts`에 최소 테스트 구조를 추가했다.
- Firebase Auth, Room, Upload, Socket feature는 구현하지 않았다.

### 2026-06-05 PHASE-02-AUTH-PLAN

- Firebase Auth 구현 전 인증 경계를 문서화했다.
- HTTP API는 `Authorization: Bearer <Firebase ID Token>` 형식을 사용한다.
- Socket.IO는 `handshake.auth.token`만 사용하고 query string token은 사용하지 않는다.
- shared auth contract 초안을 `packages/shared/src/auth.ts`에 타입으로 추가했다.
- Firebase Admin SDK 검증 구현, middleware, socket middleware는 아직 작성하지 않았다.

### 2026-06-05 PHASE-02-AUTH-BACKEND

- `firebase-admin`, `socket.io`를 `@doodle/server` dependencies에 추가했다.
- Firebase Admin 초기화 골격을 `apps/server/src/auth/firebase-admin.ts`에 추가했다.
- Firebase private key 줄바꿈 복원은 `normalizePrivateKey()`로 분리했고 값을 출력하지 않는다.
- Firebase token 검증은 `TokenVerifier` 인터페이스로 추상화해 테스트에서 mock 처리할 수 있게 했다.
- HTTP 인증 middleware는 `Authorization: Bearer <Firebase ID Token>` 형식을 검증하고 `request.auth`에 `AuthContext`를 저장한다.
- Socket 인증 middleware는 `handshake.auth.token`을 검증하고 `socket.data.auth`에 `AuthContext`를 저장한다.
- Room, Upload, Drawing, Chat feature는 구현하지 않았다.

### 2026-06-05 PHASE-02-AUTH-USER-UPSERT

- shared user API contract를 `packages/shared/src/user.ts`에 추가했다.
- `POST /api/users/me` route를 `apps/server/src/users/routes.ts`에 추가했다.
- route는 HTTP auth middleware가 설정한 `request.auth.user`를 기준으로 user profile을 upsert한다.
- 실제 MongoDB 연결은 하지 않고 `UserRepository` interface와 `InMemoryUserRepository`로 분리했다.
- Room, Upload, Drawing, Chat feature는 구현하지 않았다.

### 2026-06-05 PHASE-03-MONGODB-CONNECTION

- `mongodb` dependency를 `@doodle/server`에 추가했다.
- MongoDB client connection module을 `apps/server/src/db/mongodb.ts`에 추가했다.
- 실제 `MONGODB_URI` 값은 만들거나 출력하지 않았다.
- `MongoUserRepository`를 `apps/server/src/users/mongodb-user-repository.ts`에 추가했다.
- `firebaseUid` unique index 생성 helper를 추가했다.
- 테스트는 실제 MongoDB 연결 없이 mock collection과 fake client로 유지했다.
- 실제 MongoDB Atlas 설정이 필요한 시점은 `docs/DEPLOYMENT_OPERATION.md`에 문서화했다.

### 2026-06-05 PHASE-03-MONGODB-WIRING

- 서버 bootstrap wiring을 `apps/server/src/bootstrap.ts`에 추가했다.
- 서버 시작 시 `loadLocalEnvFile()`로 로컬 `.env`를 로드한 뒤 env validation을 수행한다.
- `createServerDependencies()`에서 MongoDB connection, Firebase token verifier, `MongoUserRepository`, HTTP auth middleware를 app에 주입한다.
- 실제 `.env` 값, MongoDB URI, Firebase private key는 읽더라도 출력하지 않는다.
- 테스트는 fake Mongo connection, mock Firebase verifier, in-memory repository로 유지했다.
- Room, Upload, Drawing, Chat feature는 구현하지 않았다.

### 2026-06-05 PHASE-03-MONGODB-SMOKE

- secret-safe bootstrap smoke script를 `apps/server/src/smoke/bootstrap-smoke.ts`에 추가했다.
- `@doodle/server`에 `smoke:bootstrap` script를 추가했다.
- smoke script는 root `.env`를 로드하지만 env 값, MongoDB URI, Firebase private key, token 값을 출력하지 않는다.
- smoke script는 서버 bootstrap과 MongoDB connection을 시도하고, 성공/실패 상태와 안전한 error name/code만 출력한다.
- 현재 smoke 결과는 `ECONNREFUSED` 실패이며, 실제 secret 값은 출력하지 않았다.

### 2026-06-05 PHASE-04-ROOM-CONTRACT-PLAN

- Room create/join 구현 전 설계만 수행했다.
- 앱 기능 코드, route, repository, shared type 파일은 아직 수정하지 않았다.
- `docs/DATABASE_API_SOCKET.md`에 다음 계약 초안을 정리했다.
  - shared room contract 초안
  - `POST /api/rooms`, `GET /api/rooms/:roomCode`, `POST /api/rooms/:roomCode/join` HTTP API 경계
  - `RoomRepository` interface 초안
  - MongoDB `rooms` document 및 index 초안
  - Socket `join-room`, `leave-room`, `room-updated`, `socket-error` 연계 범위
  - Room error code 초안
- 필요한 다음 문서 변경 범위:
  - 구현 단계에서 `packages/shared/src/room.ts`를 추가하면 `docs/DATABASE_API_SOCKET.md`와 실제 shared export를 동기화한다.
  - server route 구현 시 `docs/development/TEST_REPORT.md`에 route/repository 테스트 결과를 기록한다.
  - Room behavior가 변경되면 `docs/FUNCTIONAL_SPECIFICATION.md`의 방 생성/입장 예외 처리를 함께 갱신한다.
- 구현 전 리스크:
  - `GET /api/rooms/:roomCode`의 참가 전 조회 허용 여부 미확정
  - `leave-room`이 영속 participants를 제거할지 socket presence만 제거할지 미확정
  - 방 제목 기본값 생성 주체 미확정

### 2026-06-05 PHASE-04-ROOM-CONTRACT-SHARED

- `packages/shared/src/room.ts`를 추가해 문서화된 Room contract 타입을 shared package에 반영했다.
- `packages/shared/src/index.ts`에서 room contract 타입을 export했다.
- 추가한 타입:
  - `RoomStatus`
  - `RoomSettings`
  - `RoomParticipant`
  - `RoomSummary`
  - `RoomDetail`
  - `CreateRoomRequest`
  - `CreateRoomResponse`
  - `JoinRoomRequest`
  - `JoinRoomResponse`
  - `GetRoomResponse`
- Room create/join route, repository, MongoDB 구현은 아직 추가하지 않았다.
- Drawing, Chat, Upload, Timer feature는 구현하지 않았다.
- 문서 계약과 shared 타입은 현재 일치한다.

### 2026-06-05 PHASE-04-ROOM-REPOSITORY-PLAN

- Room create/join API 구현 전에 repository 구현 전략만 정리했다.
- Room create/join route, repository 구현 파일, MongoDB room collection 코드는 아직 추가하지 않았다.
- `docs/DATABASE_API_SOCKET.md`에 다음 항목을 확정 계획으로 추가했다.
  - `RoomRepository` interface 확정안
  - `RoomDomainError`와 `RoomErrorCode` 전략
  - 6자리 대문자/숫자 `roomCode` 생성 정책
  - unique index 충돌 시 최대 5회 재시도 정책
  - `InMemoryRoomRepository` 테스트 전략
  - `MongoRoomRepository` index 및 atomic update 전략
  - shared room contract 일치 확인
- MongoDB join 처리는 `status: "waiting"`, participant 중복 방지, 최대 인원 제한을 조건부 update로 묶는 방향을 채택했다.
- Drawing, Chat, Upload, Timer feature는 구현하지 않았다.

### 2026-06-06 PHASE-04-ROOM-REPOSITORY-IMPLEMENTATION

- Room create/join route 구현 전에 repository 계층을 추가했다.
- `apps/server/src/rooms/repository.ts`에 `RoomRepository`, `CreateRoomInput`, `JoinRoomInput` 계약을 추가했다.
- `apps/server/src/rooms/errors.ts`에 `RoomDomainError`, `RoomErrorCode`, HTTP status mapping helper를 추가했다.
- `apps/server/src/rooms/room-code.ts`에 6자리 대문자/숫자 roomCode 생성기와 normalize helper를 추가했다.
- `InMemoryRoomRepository`는 deterministic generator 주입, 최대 5회 roomCode 충돌 재시도, waiting room join, idempotent 중복 join, full/started 에러를 구현했다.
- `MongoRoomRepository`는 실제 MongoDB 연결 없이 검증 가능한 skeleton으로 추가했다.
  - `roomCode` unique index, `hostUid/createdAt`, `status/updatedAt` index helper를 제공한다.
  - `insertOne()` duplicate key error는 최대 5회 재시도 후 `ROOM_CODE_COLLISION`으로 변환한다.
  - `joinRoom()`은 사전 상태 확인 후 조건부 `findOneAndUpdate()` skeleton으로 구현했다.
- MongoDB `_id`는 shared `RoomDetail` 응답에 노출하지 않는다.
- Room create/join HTTP route, Drawing, Chat, Upload, Timer feature는 구현하지 않았다.

### 2026-06-06 PHASE-04-ROOM-ROUTE-IMPLEMENTATION

- 인증 middleware와 `RoomRepository`를 연결한 HTTP route를 추가했다.
- `apps/server/src/rooms/routes.ts`에 다음 endpoint를 구현했다.
  - `POST /api/rooms`
  - `GET /api/rooms/:roomCode`
  - `POST /api/rooms/:roomCode/join`
- `createApp()`은 `roomRepository` dependency를 받으며 기본값으로 `InMemoryRoomRepository`를 사용한다.
- `createServerDependencies()`는 MongoDB `rooms` collection에 index를 보장한 뒤 `MongoRoomRepository`를 app에 주입한다.
- `POST /api/rooms`는 인증 context의 `firebaseUid`, `nickname`, `avatarUrl`을 host 정보로 사용한다.
- 방 생성 기본값은 `Untitled Room`, `roundDurationSec=60`, `maxPlayers=8`, `maxImagesPerUser=3`이다.
- `GET /api/rooms/:roomCode`는 MVP에서 인증된 사용자라면 참가 전에도 조회 가능하게 구현했다.
- `RoomDomainError`는 shared `ApiErrorResponse` shape로 변환한다.
- route 테스트는 `InMemoryRoomRepository` 중심으로 추가했다.
- Drawing, Chat, Upload, Timer feature와 실제 MongoDB 연결 검증은 구현하지 않았다.

### 2026-06-06 PHASE-05-SOCKET-ROOM-MEMBERSHIP-PLAN

- Socket `join-room` 구현 전에 HTTP room membership과 socket auth context를 연결하는 검증 경계를 문서화했다.
- Socket 구현 코드는 추가하지 않았다.
- `join-room`은 participant 생성 API가 아니며, `POST /api/rooms/:roomCode/join` 이후 repository membership을 확인하는 event로 정의했다.
- `join-room` payload는 `{ roomCode: string }`이며 `nickname`은 socket payload에서 받지 않고 auth/HTTP user profile 기준을 사용한다.
- `room-updated` payload는 `{ room: RoomDetail }`로 shared room contract와 맞춘다.
- `leave-room`은 MVP에서 영속 participants를 제거하지 않고 socket presence만 처리하는 정책으로 정리했다.
- Drawing, Chat, Upload, Timer feature는 구현하지 않았다.

### 2026-06-06 README_AND_DOC_SYNC

- 다음 Socket 구현 전에 README와 기준 문서 간 불일치를 정리했다.
- README의 현재 상태를 Phase 5 Socket room membership 구현 직전 상태로 갱신했다.
- `docs/DATABASE_API_SOCKET.md`의 top-level `rooms` schema를 current Room contract/MongoRoomRepository 방향과 맞췄다.
  - participant `nickname`은 `string | null`로 정리했다.
  - participant `avatarUrl`을 추가했다.
  - 영속 participants에서 `socketId`를 제거하고 socket presence는 socket layer 메모리 상태로 분리한다고 명시했다.
- `docs/USER_FLOW.md`의 이탈/재접속 정책을 Socket membership 계획과 맞췄다.
- 앱 기능 코드, packages 코드, `.env`, reference artifact는 수정하지 않았다.

### 2026-06-06 PHASE-05-SOCKET-ROOM-MEMBERSHIP-IMPLEMENTATION

- HTTP server에 Socket.IO server를 연결하는 `apps/server/src/socket/server.ts`를 추가했다.
- Socket.IO server는 기존 socket auth middleware를 사용해 `socket.data.auth`에 저장된 `AuthContext`를 기준으로 동작한다.
- `apps/server/src/socket/rooms.ts`에 `join-room`/`leave-room` membership handler를 추가했다.
- `join-room`은 `RoomRepository.findRoomByCode()`로 room을 조회하고 socket auth user가 participants에 있는지 확인한다.
- 검증 성공 시 `room:${roomCode}`에 join하고 `{ room: RoomDetail }` 형태의 `room-updated`를 emit한다.
- 중복 `join-room`은 에러 없이 idempotent하게 처리한다.
- `leave-room`은 socket room leave만 수행하고 MongoDB participants를 제거하지 않는다.
- invalid payload, missing auth context, room not found, access denied는 `socket-error` code로 응답한다.
- Drawing, Chat, Upload, Timer feature는 구현하지 않았다.

### 2026-06-06 PHASE-06-CHAT-PLAN

- Chat 구현 전에 `send-message`/`receive-message` payload, message validation, 저장 범위를 문서화했다.
- Chat 구현 코드는 추가하지 않았다.
- `send-message` payload는 `{ roomCode: string; message: string }`로 정리했다.
- `receive-message` payload는 `{ roomCode, type: "chat", firebaseUid, nickname, avatarUrl, message, createdAt }`로 정리했다.
- message는 trim 후 빈 문자열 차단, 200자 이하로 제한한다.
- Chat broadcast는 같은 Socket.IO room `room:${roomCode}` 사용자에게만 전달한다.
- 영구 채팅 아카이브는 MVP 제외로 유지하고, 초기 Chat 구현의 최근 메시지는 roomCode별 in-memory 최근 50개 정책 초안으로 정리했다.
- Drawing, Upload, Timer, Round feature는 구현하지 않았다.

### 2026-06-06 PHASE-06-CHAT-IMPLEMENTATION

- Socket.IO `send-message` handler를 구현했다.
- payload는 `{ roomCode: string; message: string }`를 사용하며 `roomCode`는 trim + uppercase normalize한다.
- message는 trim 후 빈 문자열을 `CHAT_MESSAGE_EMPTY`, 200자 초과를 `CHAT_MESSAGE_TOO_LONG`으로 거절한다.
- 잘못된 Chat payload는 `CHAT_PAYLOAD_INVALID`로 응답한다.
- socket auth context와 `RoomRepository.findRoomByCode(roomCode)` 기반 room membership 검증을 추가했다.
- 검증 성공 시 `receive-message`를 Socket.IO room `room:${roomCode}`에만 emit한다.
- `receive-message` payload는 `{ roomCode, type: "chat", firebaseUid, nickname, avatarUrl, message, createdAt }`를 사용한다.
- `RecentChatMessageStore`를 추가해 server memory에 roomCode별 최근 50개 chat message만 보관한다.
- 영구 채팅 아카이브, MongoDB chat repository, Chat 조회 API는 구현하지 않았다.
- Drawing, Upload, Timer, Round feature는 구현하지 않았다.

### 2026-06-06 PHASE-07-DRAWING-PLAN

- Drawing 구현 전에 `draw-stroke` payload, throttle/batch 기준, stroke validation, 저장 범위를 문서화했다.
- Drawing 구현 코드는 추가하지 않았다.
- `draw-stroke` payload는 `{ roomCode, roundId, stroke }`로 정리했다.
- stroke는 `strokeId`, `tool`, `color`, `width`, `points`를 포함하는 구조로 정리했다.
- point는 normalized canvas coordinate 기준으로 `x`, `y`를 0 이상 1 이하 finite number로 제한한다.
- `points`는 payload당 1개 이상 128개 이하로 제한하는 초안을 정리했다.
- client는 raw pointer event가 아니라 16ms 이상 또는 animation frame 단위 batch 전송을 권장한다.
- server broadcast는 같은 Socket.IO room `room:${roomCode}` 사용자에게만 전달한다.
- MVP 기본 구현에서는 stroke 영구 저장을 제외하고, `roomCode + roundId`별 in-memory 최근 200개 stroke payload 정책 초안으로 정리했다.
- Chat, Upload, Timer, Round feature는 구현하지 않았다.

### 2026-06-06 PHASE-07-DRAWING-IMPLEMENTATION

- Socket.IO `draw-stroke` handler를 구현했다.
- payload는 `{ roomCode, roundId, stroke }`를 사용하며 `roomCode`는 trim + uppercase normalize한다.
- socket auth context와 `RoomRepository.findRoomByCode(roomCode)` 기반 room membership 검증을 추가했다.
- 검증 성공 시 `draw-stroke`를 Socket.IO room `room:${roomCode}`에만 emit한다.
- broadcast payload는 `{ roomCode, roundId, stroke, firebaseUid, createdAt }`를 사용한다.
- stroke validation은 `strokeId`, `tool`, `color`, `width`, `points`, point coordinate/pressure/time 기준으로 수행한다.
- payload당 `points`는 1개 이상 128개 이하로 제한한다.
- `RecentStrokeBatchStore`를 추가해 server memory에 `roomCode + roundId`별 최근 200개 stroke batch만 보관한다.
- stroke 영구 저장, MongoDB stroke repository, stroke 조회 API는 구현하지 않았다.
- Chat, Upload, Timer, Round feature는 구현하지 않았다.

### 2026-06-06 PHASE-08-ROUND-TIMER-PLAN

- Round/Timer 구현 전에 `start-game`, `round-started`, `round-ended` payload와 권한/상태/timer 기준을 문서화했다.
- Round/Timer 구현 코드는 추가하지 않았다.
- `start-game` payload는 `{ roomCode: string }`로 정리했다.
- `round-started` payload는 `{ roomCode, roundId, roundIndex, durationSec, startedAt, endsAt, imageId }`로 정리했다.
- `round-ended` payload는 `{ roomCode, roundId, roundIndex, endedAt }`로 정리했다.
- `start-game`은 room participant이면서 `room.hostUid`와 socket auth user `firebaseUid`가 일치하는 host만 허용한다.
- room status는 `waiting -> playing -> finished` 전이를 기준으로 정리했다.
- `currentRoundIndex`는 첫 라운드에서 `0`을 사용하고 다음 라운드가 있으면 1씩 증가하는 기준으로 정리했다.
- MVP timer는 `roundDurationSec` 기반 server memory `setTimeout` scheduling으로 정리했다.
- Drawing, Chat, Upload feature는 구현하지 않았다.

### 2026-06-06 PHASE-07-IMAGE-UPLOAD-GRIDFS-PLAN

- Image upload/GridFS 구현 전에 업로드 API, 파일 검증, GridFS 저장, `images` metadata 저장 범위를 문서화했다.
- Image upload 구현 코드는 추가하지 않았다.
- `POST /api/rooms/:roomCode/images`는 `multipart/form-data`의 단일 `image` file field를 사용하는 기준으로 정리했다.
- `GET /api/rooms/:roomCode/images`, `GET /api/images/:imageId` 조회/stream API 기준을 정리했다.
- 인증된 room participant만 업로드할 수 있고, `waiting` room에서만 허용하는 기준으로 정리했다.
- 사용자별 업로드 수는 `room.settings.maxImagesPerUser` 이하로 제한하는 기준으로 정리했다.
- 허용 MIME type은 `image/jpeg`, `image/png`, `image/webp`, 파일 크기는 MVP 기본 10MB 이하로 정리했다.
- 원본 이미지 바이너리는 MongoDB GridFS bucket `originalImages`에 저장하고, API/랜덤 선택은 `images` metadata를 기준으로 한다.
- Render local filesystem에는 업로드 이미지나 결과 이미지를 영구 저장하지 않는 정책을 명시했다.
- Random round start, Timer, Result save는 구현하지 않았다.

### 2026-06-06 PHASE-07-IMAGE-UPLOAD-GRIDFS-IMPLEMENTATION

- Image upload API, GridFS storage, images metadata repository를 구현했다.
- `POST /api/rooms/:roomCode/images`는 multipart/form-data 단일 `image` file field를 처리한다.
- `GET /api/rooms/:roomCode/images` metadata 목록 조회를 구현했다.
- `GET /api/images/:imageId` 원본 이미지 stream 응답을 구현했다.
- Firebase auth context와 `RoomRepository.findRoomByCode(roomCode)` 기반 room membership 검증을 추가했다.
- `waiting` room에서만 업로드를 허용하고, 사용자별 `maxImagesPerUser` 제한을 적용했다.
- MIME type은 `image/jpeg`, `image/png`, `image/webp`만 허용하고, 0 byte와 10MB 초과 파일을 거절한다.
- `ImageRepository`, `ImageStorage` 계약과 in-memory/MongoDB GridFS 구현을 추가했다.
- MongoDB `images` metadata index와 GridFS bucket `originalImages` wiring을 bootstrap에 추가했다.
- Render local filesystem에 이미지를 영구 저장하는 코드는 추가하지 않았다.
- Random round start, Timer, Result save는 구현하지 않았다.

### 2026-06-06 PHASE-08-RANDOM-ROUND-START-PLAN

- Random round start 구현 전에 미사용 이미지 선택, `round-started` payload, image used 처리, room 상태 전이 기준을 문서화했다.
- Random round start 구현 코드는 추가하지 않았다.
- 미사용 이미지는 `ImageRepository`에서 `roomCode` 기준으로 조회한 `used === false` image metadata 중 선택하는 기준으로 정리했다.
- 후보 이미지가 없으면 `ROUND_IMAGE_NOT_FOUND`로 거절하는 기준을 정리했다.
- 선택된 image는 round 생성과 함께 `used: true`로 전환하는 기준을 정리했다.
- `round-started` payload는 `{ roomCode, roundId, roundIndex, image, durationSec, startedAt }`로 정리했다.
- `start-game`은 room participant이면서 host인 사용자만 요청할 수 있는 기준으로 정리했다.
- 성공 시 room status는 `waiting -> playing`, `currentRoundIndex`는 `0` 기준으로 정리했다.
- Timer, Result save는 구현하지 않았다.

### 2026-06-06 PHASE-08-RANDOM-ROUND-START-IMPLEMENTATION

- Socket.IO `start-game` event를 구현했다.
- payload는 `{ roomCode: string }`를 사용하며 `roomCode`는 trim + uppercase normalize한다.
- socket auth context, room membership, host 권한, `waiting` room 상태 검증을 추가했다.
- `ImageRepository.listUnusedImagesByRoomCode(roomCode)`로 `used === false` image 후보를 조회한다.
- 후보 이미지가 없으면 `ROUND_IMAGE_NOT_FOUND`로 응답한다.
- deterministic test가 가능하도록 image selector와 round id generator를 handler dependency로 분리했다.
- 선택된 image는 `ImageRepository.markImageUsed(imageId)`로 `used: true` 처리한다.
- `RoomRepository.startGame()` 계약과 in-memory/MongoDB 구현을 추가해 room status를 `playing`으로 전이한다.
- 성공 시 `round-started`를 같은 Socket.IO room `room:${roomCode}`에만 emit한다.
- `round-started` payload는 `{ roomCode, roundId, roundIndex, image, durationSec, startedAt }`를 사용한다.
- Timer scheduling, `round-ended` 자동 emit, Result save는 구현하지 않았다.

### 2026-06-06 PHASE-10-TIMER-ROUND-END-PLAN

- Timer/round end 구현 전에 `round-ended`, `game-finished`, drawing 차단, 다음 round 또는 finished 전이 기준을 문서화했다.
- Timer/round end 구현 코드는 추가하지 않았다.
- `round-ended` payload는 `{ roomCode, roundId, roundIndex, image, endedAt }` 기준으로 정리했다.
- `game-finished` payload는 `{ roomCode, room, finishedAt }` 기준으로 정리했다.
- round timer 만료 시 최신 room 재조회, stale timer no-op, `round-ended` emit, drawing write 차단, unused image 조회, 다음 round 또는 `finished` 전이 순서로 정리했다.
- 종료된 round의 `draw-stroke`는 차단하고, room status가 `playing`이며 `roundId`가 현재 active round와 일치할 때만 drawing을 허용하는 기준으로 정리했다.
- 다음 unused image가 있으면 `used: true` 처리 후 `currentRoundIndex + 1`로 다음 `round-started`를 emit하는 기준으로 정리했다.
- unused image가 없으면 room status를 `finished`로 전이하고 `game-finished`와 `room-updated`를 emit하는 기준으로 정리했다.
- Result save, durable timer recovery, Redis scheduler, multi-instance coordination은 MVP 제외 범위로 유지했다.

### 2026-06-06 PHASE-10-TIMER-ROUND-END-IMPLEMENTATION

- In-memory round timer, `round-ended`, drawing block, next round 또는 finished 전이를 구현했다.
- `RoundRuntimeStateStore`를 추가해 room별 active round와 closed round를 in-memory로 관리한다.
- `InMemoryRoundTimerScheduler`를 추가해 `start-game` 및 다음 round 시작 성공 시 round timer를 schedule한다.
- timer 만료 시 `round-ended` `{ roomCode, roundId, roundIndex, image, endedAt }`를 같은 Socket.IO room에 emit한다.
- unused image가 있으면 선택된 image를 `used: true`로 처리하고 `RoomRepository.advanceRound()`로 `currentRoundIndex`를 증가시킨 뒤 다음 `round-started`를 emit한다.
- unused image가 없으면 `RoomRepository.finishGame()`으로 room status를 `finished`로 전이하고 `game-finished`와 `room-updated`를 emit한다.
- `draw-stroke`는 room status가 `playing`이고 active round id가 일치할 때만 허용하도록 차단 기준을 구현했다.
- `DRAW_ROUND_CLOSED`, `ROUND_STATE_INVALID` socket error code를 추가했다.
- Result save, Redis scheduler, durable timer recovery, multi-instance coordination은 구현하지 않았다.

### 2026-06-06 PHASE-11-RESULT-SAVE-PLAN

- Result save 구현 전에 라운드 종료 후 결과 이미지 생성/저장, MongoDB GridFS 저장, `results` metadata 저장 범위를 문서화했다.
- Result save 구현 코드는 추가하지 않았다.
- 결과 저장 trigger는 `round-ended` emit 직후 `roomCode + roundId` 기준 idempotent 처리로 정리했다.
- 원본 image와 drawing stroke 합성은 원본 pixel canvas와 normalized stroke point를 기준으로 수행하는 MVP 정책으로 정리했다.
- 결과 이미지 GridFS bucket은 `resultImages`, thumbnail bucket은 선택적으로 `resultThumbnails`를 사용하는 기준으로 정리했다.
- Render local filesystem에 결과 이미지나 thumbnail을 영구 저장하지 않는 정책을 유지했다.
- `results` metadata schema와 `roomCode`, `roundId`, `roundIndex`, `sourceImageId`, `resultFileId` 연결 기준을 정리했다.
- 결과 완료 event는 `result-saved` `{ roomCode, roundId, roundIndex, result, createdAt }` 기준으로 정리했다.
- 실패 code와 MVP 재시도 범위는 같은 프로세스 내 1회 best-effort로 정리했다.
- Gallery/download, Redis scheduler, durable job queue, multi-instance processing은 구현하지 않았다.

### 2026-06-06 PHASE-11-RESULT-SAVE-IMPLEMENTATION

- Round 종료 후 result image 합성, GridFS 저장, `results` metadata repository, `result-saved` emit을 구현했다.
- shared `ResultMetadata` contract를 추가했다.
- `ResultRepository`와 in-memory/MongoDB 구현을 추가했다.
- `ResultImageStorage`와 in-memory/GridFS `resultImages` storage 구현을 추가했다.
- `ResultImageComposer` 계약과 deterministic PNG result composer를 추가했다.
- `ResultSaveService`가 `roomCode + roundId` 기준 idempotency, 원본 image read, stroke batch 전달, result storage, metadata 저장을 처리한다.
- `handleRoundTimerExpired`에서 `round-ended` 이후 result save를 best-effort로 trigger하고 성공 시 `result-saved`를 같은 Socket.IO room에 emit한다.
- result save 실패는 다음 round 시작 또는 room `finished` 전이를 rollback하지 않는다.
- Gallery/download API, Redis scheduler, durable job queue, multi-instance processing은 구현하지 않았다.

### 2026-06-06 PHASE-12-GALLERY-DOWNLOAD-PLAN

- Gallery/download 구현 전에 저장된 `results` metadata 조회와 result image download API 범위를 문서화했다.
- Gallery/download 구현 코드는 추가하지 않았다.
- `GET /api/rooms/:roomCode/results` API 기준과 Firebase auth, room membership 검증 기준을 정리했다.
- `GET /api/results/:resultId/download` API 기준과 result metadata 조회, room participant 권한 검증, GridFS stream 응답 기준을 정리했다.
- `results` metadata 조회 pagination은 `createdAt` desc, 기본 limit 20, 최대 limit 50, cursor 기반으로 정리했다.
- result image download header는 `Content-Type`, `Content-Length`, `Content-Disposition`, `Cache-Control` 기준으로 정리했다.
- `ROOM_NOT_FOUND`, `ROOM_ACCESS_DENIED`, `RESULT_NOT_FOUND`, `RESULT_FILE_NOT_FOUND`, `RESULT_QUERY_INVALID` error code 기준을 정리했다.
- Thumbnail API는 MVP 선택 범위로 문서화만 하고 구현 제외로 유지했다.
- Result save, Redis scheduler, durable job queue, multi-instance processing은 구현하지 않았다.

### 2026-06-06 PHASE-12-GALLERY-DOWNLOAD-IMPLEMENTATION

- `results` metadata list API와 result image GridFS download API를 인증 및 room membership 검증 기반으로 구현했다.
- `GET /api/rooms/:roomCode/results`를 추가했다.
- `GET /api/results/:resultId/download`를 추가했다.
- `ResultRepository.findResultById()`와 `ResultRepository.listResultsByRoomCode()` 계약 및 in-memory/MongoDB 구현을 추가했다.
- `ResultImageStorage.getResultImage()` 계약 및 in-memory/GridFS 구현을 추가했다.
- pagination은 기본 limit 20, 최대 limit 50, cursor 기반으로 구현했다.
- result image download response에 `Content-Type`, `Content-Length`, `Content-Disposition`, `Cache-Control` header를 설정한다.
- Thumbnail API, Result save flow 변경, Redis scheduler, durable job queue, multi-instance processing은 구현하지 않았다.

### 2026-06-06 FRONTEND-VITE-REACT-SCAFFOLD

- `apps/web`을 placeholder 패키지에서 실제 Vite + React + TypeScript 앱으로 전환했다.
- `@doodle/web`에 React, React DOM, Vite, Vite React plugin, lucide-react와 React 타입 의존성을 추가했다.
- `apps/web/index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/api/client.ts`, `src/vite-env.d.ts`를 추가했다.
- 첫 화면은 로비, 대기실, 플레이, 갤러리 탭으로 구성했다.
- 로컬/배포 API 서버 URL은 `VITE_API_BASE_URL` 또는 화면 입력값으로 설정한다.
- Firebase Client SDK 로그인은 아직 구현하지 않고, 현재는 로컬 검증용 Firebase ID Token을 사용자가 직접 입력하는 경계로 유지했다.
- REST API client는 방 생성, 방 조회, 방 입장, 이미지 목록/업로드, 결과 목록, 결과 다운로드를 서버 계약에 맞춰 호출한다.
- 결과 다운로드는 인증 헤더가 필요하므로 단순 링크가 아니라 fetch 후 Blob 다운로드로 구현했다.
- Socket.IO client, 실시간 canvas drawing, 채팅 UI 연결, Firebase Client SDK 로그인은 다음 프론트 slice로 남겼다.

### 2026-06-06 FRONTEND-PHASE-CHECKLIST

- `docs/DEVELOPMENT_PLAN_CHECKLIST.md`에 프론트 전용 `PHASE-FE-*` 작업 흐름을 추가했다.
- 기존 MVP Phase 0-14는 전체/백엔드 중심 구현 순서로 유지하고, 프론트 추천 프롬프트는 별도 FE 단계로 참조하도록 정리했다.
- FE-01부터 FE-08까지 Web scaffold, Firebase auth client, lobby/room, upload/gallery, socket/chat, canvas drawing, round timer UX, frontend QA/polish 단계로 나누었다.
- 현재 완료된 FE-01 Web scaffold 상태를 명시했다.
- 프론트 작업 원칙으로 서버 API/Socket 계약 사용, `VITE_` 환경변수, secret 출력 금지, 백엔드 구현 분리 기준을 적었다.

### 2026-06-06 PHASE-FE-02-FIREBASE-AUTH-CLIENT

- `apps/web`에 Firebase Client SDK를 추가하고 초기에는 이메일/비밀번호 로그인 UI를 구현했다.
- Firebase web config는 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`만 읽도록 분리했다.
- Firebase 로그인 성공 후 ID Token을 발급받아 API client에 연결하고 `POST /api/users/me`를 호출해 user upsert를 수행한다.
- 로그인 사용자는 토큰 갱신 버튼으로 `getIdToken(true)`를 호출할 수 있다.
- 로그아웃 시 Firebase session, token, user profile, 현재 room/images/results 상태를 정리한다.
- 수동 Firebase ID Token 입력은 `details` 기반 개발용 fallback으로 유지했다.
- Socket.IO client, Canvas drawing, Chat 구현은 추가하지 않았다.

### 2026-06-06 FRONTEND-GOOGLE-AUTH-UX-CORRECTION

- 프론트 인증 UX를 제품 방향에 맞춰 Google 로그인 중심으로 정리했다.
- 이메일/비밀번호 로그인 폼은 제거하고 Firebase `GoogleAuthProvider` popup 로그인만 사용한다.
- 로그인 성공 후 Google displayName/photoURL로 `/api/users/me` upsert를 수행한다.
- 닉네임은 로그인 후 프로필 카드에서 수정/저장할 수 있도록 분리했다.
- 개발용 token fallback은 숨겨진 `details` 영역으로 유지하되 일반 수동 QA 흐름에서는 사용하지 않는다.
- 로컬 기본 API URL fallback을 `http://localhost:4000`으로 맞췄다.
- 방이 없을 때 `대기실/플레이/갤러리` 탭이 먼저 보이지 않도록 하고, 방 선택 이후에 `방 준비/그리기/결과` 이동을 보여준다.

### 2026-06-06 PHASE-FE-AUTH-LOBBY-UX-REFINE

- 로그인 전 화면은 Google 로그인 CTA 중심의 단일 진입 화면으로 정리했다.
- 일반 UI에서 API 서버 입력과 개발용 token fallback을 제거했다.
- 로그인 후 상단 오른쪽에 Google 프로필 이미지와 닉네임을 표시하는 프로필 메뉴를 추가했다.
- 프로필 메뉴에서 닉네임 변경과 로그아웃을 제공한다.
- 로비는 `방 만들기`, `방 입장` 두 개의 주요 CTA만 표시한다.
- 방 이름과 방 코드는 로비에 상시 노출하지 않고 각각 모달에서 입력하도록 변경했다.
- Google OAuth ID Token 기반 API 호출과 기존 Firebase Admin 백엔드 검증은 유지했다.
- Socket, Drawing, Upload, Timer, Result 기능 코드는 변경하지 않았다.

### 2026-06-06 PHASE-BE-GOOGLE-AUTH-PROVIDER-GUARD

- Firebase ID Token 검증 후 decoded token의 `firebase.sign_in_provider`가 `google.com`인지 확인하는 provider guard를 추가했다.
- provider guard는 `verifyAuthToken()` 공통 경계에 추가해 HTTP auth middleware와 Socket auth middleware가 같은 기준을 사용하도록 했다.
- Google provider가 아닌 token은 `AUTH_PROVIDER_UNSUPPORTED`로 거절한다.
- error message에는 token, email, Firebase UID, provider raw payload, secret 값을 포함하지 않는다.
- Firebase Admin verifier는 decoded token의 `firebase` claim을 `VerifiedFirebaseToken`으로 전달하도록 보강했다.
- `/api/users/me` user upsert contract와 Google nickname/avatarUrl 저장 흐름은 변경하지 않았다.
- 실제 Firebase Admin 또는 실제 Google OAuth 연결 검증은 수행하지 않고 mock token verifier 기반 테스트로 검증했다.

### 2026-06-06 LOCAL-VITE-FALLBACK-CORS-FIX

- 로컬 웹 dev server가 `http://localhost:5173` 대신 `http://localhost:5174`로 뜰 때 HTTP API preflight가 CORS에서 거절되는 문제를 확인했다.
- production에서는 설정된 `CLIENT_URL`/`SOCKET_CORS_ORIGIN`만 허용하는 정책을 유지한다.
- non-production 서버 실행에서는 `http://localhost:5170`부터 `http://localhost:5179` 및 `http://127.0.0.1:5170`부터 `http://127.0.0.1:5179` 범위의 Vite fallback origin을 HTTP API와 Socket.IO CORS에서 허용하도록 보강했다.
- CORS 응답의 `Access-Control-Allow-Origin`은 실제 요청 origin을 반사하되, 허용된 origin인 경우에만 설정한다.
- Google popup 과정의 `Cross-Origin-Opener-Policy` warning은 Firebase popup 흐름에서 브라우저가 표시할 수 있는 경고이며, 이번 장애의 직접 원인은 `/api/users/me` preflight CORS 실패였다.
### 2026-06-06 PHASE-FE-03-LOBBY-ROOM-FLOW

- 로그인 전 방 생성/입장 action을 비활성화하고 안내 문구를 추가했다.
- roomCode 입력과 API 호출 경계에서 trim 후 uppercase normalize를 적용했다.
- 방 생성/입장 성공 후 room detail, participants, images, results를 안정적으로 refresh하도록 `Promise.allSettled` 기반 로딩 경계를 추가했다.
- 참가자 목록과 이미지 목록에 loading, empty, error 상태를 추가했다.
- API error code를 사용자에게 안전한 한국어 문구로 매핑했다.
- Firebase Client SDK 로그인 흐름과 개발용 token fallback은 유지했다.
- Socket.IO client, Canvas drawing, Chat 구현은 추가하지 않았다.
### 2026-06-06 PHASE-FE-04-IMAGE-UPLOAD-GALLERY

- 이미지 업로드 전 프론트 검증을 추가했다: 0 byte 차단, 10MB 초과 차단, JPEG/PNG/WebP MIME type만 허용.
- 업로드 성공 후 `GET /api/rooms/:roomCode/images`를 다시 호출해 image metadata 목록을 refresh한다.
- 이미지 목록에 파일 크기와 used 상태 표시를 추가했다.
- 결과 갤러리에 result count, pagination 상태, `PNG 다운로드` 버튼 문구를 추가해 download UX를 다듬었다.
- Thumbnail API, Socket.IO client, Canvas drawing, Chat 구현은 추가하지 않았다.
### 2026-06-06 PHASE-FE-05-SOCKET-ROOM-AND-CHAT

- `socket.io-client`를 `@doodle/web`에 추가했다.
- room이 선택되고 token이 존재할 때 Socket.IO client를 연결하고 `join-room`을 보낸다.
- room 변경, logout, unmount 시 `leave-room` 후 socket을 disconnect한다.
- `room-updated` `{ room }` payload를 받아 room detail UI를 갱신한다.
- `socket-error` code를 안전한 사용자 문구로 매핑한다.
- `send-message` UI를 추가하고 trim, 빈 문자열 차단, 200자 이하 제한을 적용했다.
- `receive-message` payload를 chat list에 표시한다.
- Canvas drawing과 Timer UX는 구현하지 않았다.
### 2026-06-06 PHASE-FE-06-CANVAS-DRAWING

- Canvas drawing surface를 추가했다.
- Pointer event 기반 stroke 입력을 구현하고 좌표를 0-1 정규화 point로 저장한다.
- stroke points는 payload당 최대 128개로 batch한다.
- `draw-stroke` event를 Socket.IO room으로 전송하고, 수신한 `draw-stroke` stroke를 local canvas에 반영한다.
- room status가 `playing`이 아니거나 socket이 connected가 아니면 drawing을 비활성화한다.
- Chat 기능은 유지하되 확장하지 않았고 Result save API는 구현하지 않았다.
### 2026-06-06 PHASE-FE-07-ROUND-TIMER-UX

- `round-started`, `round-ended`, `game-finished` socket event handler를 추가했다.
- `round-started` payload를 active round 상태로 저장하고 countdown을 표시한다.
- `round-ended` 수신 시 active round를 ended 상태로 표시하고 drawing을 비활성화한다.
- 다음 `round-started` 수신 시 canvas stroke 상태를 초기화한다.
- `game-finished` 수신 시 gallery CTA를 표시한다.
- Timer scheduling은 서버 책임으로 유지했고 Result save flow는 구현하지 않았다.
### 2026-06-06 PHASE-FE-08-FRONTEND-QA-POLISH

- `docs/DEVELOPMENT_PLAN_CHECKLIST.md`의 FE-03부터 FE-08까지 완료 상태를 갱신했다.
- responsive layout을 보강했다: mobile play/chat layout, gallery toolbar, auth actions, room code sizing.
- Vite build chunk size warning은 Firebase/Socket client bundle 규모를 고려해 `chunkSizeWarningLimit`를 700KB로 조정해 정리했다.
- 주요 수동 점검 흐름을 문서화했다: 로그인 -> 방 생성 -> 업로드 -> room 상태, 로그인 -> 방 입장 -> socket join -> chat, round -> drawing -> round end -> gallery.
- backend 구현과 배포는 변경하지 않았다.

### 2026-06-06 LOCAL-BACKEND-FRONTEND-INTEGRATION-SMOKE

- Phase 13 배포 준비 전에 로컬 기준 백엔드와 프론트엔드 결합 상태를 점검했다.
- `@doodle/server dev`가 workspace root `.env`를 찾지 못하는 문제를 발견해 `loadLocalEnvFile()`이 현재 작업 디렉터리의 상위 디렉터리까지 `.env`를 탐색하도록 보강했다.
- 브라우저에서 `http://localhost:5173` 웹 앱이 `http://localhost:4000` HTTP API를 호출할 때 필요한 HTTP CORS middleware를 추가했다.
- HTTP CORS origin은 기존 서버 env 계약의 `CLIENT_URL`을 사용하며, Socket.IO CORS는 기존 `SOCKET_CORS_ORIGIN` 계약을 유지한다.
- `OPTIONS` preflight는 허용 origin에서 204와 `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`를 반환한다.
- 서버 health, 웹 dev 서버 응답, HTTP API preflight를 로컬에서 확인했다.
- 실제 Firebase 로그인, 업로드, Socket multi-client E2E는 사용자 계정/브라우저 세션이 필요한 수동 QA 범위로 남겼다.
### 2026-06-06 PHASE-BE-ROOM-READY-UPLOAD-PROFILE-BROADCAST

- 같은 room에서 같은 사용자가 이미지 1장만 업로드할 수 있도록 서버 업로드 제한을 강화했다.
- `POST /api/rooms/:roomCode/images`는 GridFS 저장 전에 `roomCode + uploadedBy.firebaseUid` 기준 기존 업로드를 확인하고 중복 업로드를 `IMAGE_UPLOAD_LIMIT_EXCEEDED`로 거절한다.
- room 생성 기본 `maxImagesPerUser`를 MVP ready 정책에 맞춰 1로 조정했다.
- 이미지 업로드 성공 후 같은 Socket.IO room에 `room-updated { room }`을 emit할 수 있도록 `SocketRoomUpdatePublisher`를 추가하고 HTTP app/bootstrap/server wiring에 연결했다.
- `start-game`은 host 권한과 waiting 상태 검증 이후 모든 participants가 이미지 1장을 업로드했는지 확인한다.
- 준비되지 않은 참가자가 있으면 `ROOM_PARTICIPANTS_NOT_READY` socket error로 거절한다.
- `profile-updated { roomCode }` socket event를 추가했다.
- `profile-updated`는 socket auth context와 room membership을 검증한 뒤 `UserRepository.findByFirebaseUid()`의 최신 nickname/avatarUrl을 room participant에 반영하고 `room-updated { room }`을 emit한다.
- `RoomRepository.updateParticipantProfile()`과 `UserRepository.findByFirebaseUid()` 계약 및 in-memory/MongoDB 구현을 추가했다.
- 프론트엔드 코드, Drawing, Chat, Timer, Result save 기존 동작은 변경하지 않았다.
- 실제 MongoDB/GridFS 연결 검증은 수행하지 않았고 mock/in-memory 테스트 중심으로 검증했다.
### 2026-06-06 PHASE-FE-ROOM-READY-UPLOAD-PREVIEW-AUTO-FLOW

- 방 준비 화면을 participant ready 중심으로 정리했다.
- ready 기준은 같은 room에서 participant별 이미지 1장 업로드 완료로 계산한다.
- participants 목록에 `Ready`/`Waiting` 상태와 현재 사용자 표시를 추가했다.
- host에게만 `시작하기` 버튼을 표시하고, 모든 participants가 ready이며 room이 `waiting` 상태일 때만 활성화한다.
- 이미지 업로드는 파일 선택 즉시 실행하지 않고, client validation 후 `URL.createObjectURL()` 기반 preview를 표시한다.
- preview 취소, 업로드 완료, component cleanup 시 object URL을 정리한다.
- 같은 room에서 이미 이미지를 업로드한 사용자는 업로드 UI를 비활성화한다.
- 닉네임 저장 성공 후 현재 room이 있으면 socket `profile-updated { roomCode }`를 emit하도록 연결했다.
- `room-updated { room }` 수신 시 room detail을 갱신하고 이미지 목록을 다시 불러와 ready 상태를 반영한다.
- `round-started` 수신 시 play 화면으로 자동 전환하고, `result-saved`/`game-finished` 수신 시 gallery 화면으로 자동 전환한다.
- 일반 사용자 UI에서 socket 연결 상태 표시는 숨기고 socket 오류는 상태 메시지로만 표시한다.
- 수동 `그리기`/`결과` 탭은 제거하고 이벤트 기반 화면 전환을 기본 흐름으로 유지했다.
- 백엔드 코드, Drawing/Chat/Timer/Result save 기존 동작은 변경하지 않았다.
### 2026-06-06 PHASE-FE-PLAY-CANVAS-IMAGE-SOCKET-FIX

- `round-started.image`를 사용해 원본 이미지를 인증 API `GET /api/images/:imageId`로 불러오고 canvas 배경에 그리도록 수정했다.
- active round image object URL은 round 변경/cleanup 시 정리한다.
- 프론트 `draw-stroke` payload를 백엔드 계약에 맞춰 `strokeId`, `tool`, `color`, `width`, `points`를 포함하도록 수정했다.
- stroke chunk 전송 시 chunk별 `strokeId`를 안정적으로 부여한다.
- Canvas drawing preview와 수신 stroke 렌더링은 기존 흐름을 유지한다.
- 제목/강조 UI는 `Gaegu`, 본문/버튼은 `Pretendard` fallback 중심으로 조정했다.
- Rough.js 패키지는 이번 즉시 수정에서 추가하지 않고 CSS 기반 손그림 톤만 1차 반영했다.
- 백엔드 코드, `.env`, secret 파일은 수정하지 않았다.
### 2026-06-06 PHASE-FE-HANDDRAWN-DESIGN-SYSTEM

- 기능 동작 변경 없이 `apps/web/src/styles.css` 중심으로 손그림 낙서 스타일을 정리했다.
- 제목/강조는 `Gaegu`, 본문/버튼은 `Pretendard` fallback 기준으로 분리했다.
- Rough.js 실제 패키지 도입은 dependency와 lockfile 변경이 필요해 이번 MVP 1차 적용에서는 보류했다.
- CSS 기반으로 handdrawn border, sketchy card, dashed inner border, marker-like H1 underline, doodle-style divider를 적용했다.
- 버튼 hover에 작은 회전/그림자 변화를 추가해 손으로 누르는 조작감을 만들었다.
- 방 코드, 업로드 박스, 캔버스, 채팅, 갤러리, 모달의 border-radius와 dashed border를 통일했다.
- 모바일에서는 카드 회전을 제거하고 upload preview가 한 열로 내려가도록 조정했다.
- `docs/design/DESIGN_SYSTEM_WIREFRAME.md`, `docs/design/UI_STYLE_GUIDE.md`에 Rough.js 검토 결과와 적용 기준을 기록했다.
- `package-lock.json`은 수정, 삭제, commit하지 않았다.
### 2026-06-06 PHASE-LOCAL-E2E-PLAY-FLOW-QA-FIX

- 로컬 플레이 흐름 결합 지점을 점검했다.
- 자동 점검 대상은 `round-started`, `draw-stroke`, `result-saved`, `game-finished`, `start-game`, image download API 결합이다.
- `result-saved` 수신 후 gallery 자동 전환 시 이전 pagination cursor가 남을 수 있어 `nextResultCursor`를 초기화하도록 수정했다.
- 실제 Google 로그인, 2계정/2브라우저 drawing sync, canvas 원본 이미지 표시 확인은 사용자 수동 QA 체크리스트로 분리했다.
- Rough.js 실제 도입은 dependency/lockfile 변경이 필요하므로 이번 QA에서는 보류 판단을 유지했다.
- 백엔드 기능 코드는 변경하지 않았다.

### 2026-06-07 PHASE-12.5-LOCAL-E2E-UX-QA-POLISH

- Phase 13 배포 전 로컬 E2E UX gate로 `docs/DEVELOPMENT_PLAN_CHECKLIST.md`에 Phase 12.5를 추가했다.
- 방 준비 화면에서 start-game 비활성 이유를 더 명확히 표시하도록 개선했다.
- 준비되지 않은 참가자가 있으면 해당 참가자 닉네임을 안내하고, 모든 참가자가 ready이면 host/guest별 다음 행동을 설명한다.
- `round-ended` 수신 후 result save 진행 상태를 `saving`으로 표시하고, `result-saved`/`game-finished` 수신 시 `saved` 상태로 갱신한다.
- 갤러리 결과 조회 실패 또는 결과 없음 상태에서 사용자가 직접 다시 불러올 수 있는 버튼을 추가했다.
- 좁은 화면에서 header profile, room code, copy/start/preview/gallery 버튼이 겹치지 않도록 responsive style을 보강했다.
- Drawing 장시간 입력 보존은 기존 10,000 stroke batch retention 정책을 유지하고 추가 기능 변경은 하지 않았다.
- 서버 API/Socket 계약, Upload, Timer, Result save backend flow는 변경하지 않았다.

### 2026-06-07 WIREFRAME-MVP-LAYOUT-POLISH

- 사용자가 제공한 손그림 와이어프레임을 기준으로 MVP에 해당하는 레이아웃 요소만 선별했다.
- MVP 반영 범위는 Google 로그인 이후 `방 만들기/방 입장`, 대기실 ready/upload, 라운드 drawing/chat, 결과 gallery/download 흐름이다.
- MVP 제외 범위는 방 목록, 공개/비공개/비밀번호, 최대 인원 설정, 전체 결과 일괄 다운로드, 설정/프로필 nav 확장이다.
- 대기실은 와이어프레임처럼 상단 방 정보 summary와 하단 participants/upload 구조가 더 분명하게 보이도록 grid layout을 조정했다.
- 업로드 목록은 단순 행 목록에서 사진 카드 느낌의 grid로 조정해 참가자별 이미지 1장 흐름을 더 잘 드러내도록 했다.
- 플레이 화면은 참가자 rail, canvas, chat의 3열 구조로 조정해 협업 드로잉 화면의 정보 구조를 와이어프레임에 맞췄다.
- Canvas header에는 현재 라운드와 현재 사진 업로드 사용자를 표시한다.
- Gallery toolbar와 result card style을 보강해 라운드별 결과 카드 흐름을 더 명확히 했다.
- Socket, Upload, Timer, Result save 기능 동작과 backend 계약은 변경하지 않았다.

### 2026-06-07 DRAWING-TOOL-LAYER-POLISH

- 와이어프레임의 drawing 도구 중 MVP에 적합한 `펜`, `지우개`, `색상`, `굵기`를 프론트엔드에 추가했다.
- `draw-stroke` payload의 기존 `tool`, `color`, `width` 계약을 그대로 사용하므로 Socket/API 계약은 변경하지 않았다.
- Canvas 렌더링은 사진 배경과 드로잉 레이어를 논리적으로 분리해 합성한다.
- 지우개는 흰색 선을 그리는 방식이 아니라 드로잉 레이어에서만 `destination-out`으로 stroke를 지우도록 수정했다.
- 결과 PNG 합성도 같은 정책을 따르도록 서버 result composer의 eraser 처리를 SVG mask 기반으로 변경했다.
- `전체 지우기`는 별도 동기화 이벤트와 결과 저장 계약이 필요하므로 이번 MVP polish에서는 제외했다.
- 레이아웃은 중간 화면에서 play 3열이 깨지지 않도록 1180px 이하에서 단일 column으로 내려가게 보강했다.

### 2026-06-07 OVERALL-UI-UX-VISUAL-POLISH

- 기능 동작 변경 없이 `apps/web/src/styles.css` 중심으로 전체 시각 밀도와 레이아웃 안정성을 정리했다.
- 기존의 과한 card rotation, 강한 shadow, 거친 border 조합을 줄이고 더 차분한 paper UI로 조정했다.
- 색상 토큰을 부드러운 notebook/post-it 계열로 재정리하고 body background grid를 더 은은하게 조정했다.
- authenticated 화면의 hero 영역을 compact하게 줄여 실제 작업 영역이 더 빨리 보이게 했다.
- header를 sticky paper bar로 정리하고 profile/menu가 좁은 화면에서 덜 깨지도록 유지했다.
- status strip은 강한 상하선 대신 dashed paper notice로 바꿔 화면 전체 톤과 맞췄다.
- 버튼 hover 회전을 제거하고 이동/그림자 중심으로 정리해 산만함을 줄였다.
- 업로드 이미지 목록은 가짜 큰 thumbnail 느낌을 줄이고 작은 이미지 marker가 있는 metadata card로 정리했다.
- canvas, drawing toolbar, chat list, gallery card의 radius/border/shadow를 통일했다.
- chat form은 input/button 2열 구조로 정리하고 좁은 화면에서는 기존 responsive 흐름을 유지한다.

### 2026-06-07 PHASE-FE-DEV-UI-PREVIEW-MODE

- 로그인 없이 로컬 UI 시각 QA를 할 수 있도록 프론트엔드 dev-only preview mode를 추가했다.
- preview mode는 `import.meta.env.DEV` 또는 `VITE_ENABLE_UI_PREVIEW=true`일 때만 `?preview=` query를 인식한다.
- 지원 URL:
  - `?preview=login`
  - `?preview=lobby`
  - `?preview=room`
  - `?preview=play`
  - `?preview=gallery`
- preview mode에서는 mock user, room, participants, images, active round, chat messages, strokes, results를 사용한다.
- preview branch는 실제 Firebase auth, API request, Socket connection hooks보다 먼저 return하므로 외부 요청을 실행하지 않는다.
- preview 화면의 button action은 no-op 또는 submit prevent로 처리한다.
- 백엔드 인증/API/Socket 동작은 변경하지 않았다.

### 2026-06-07 PHASE-FE-PREVIEW-VISUAL-QA-ITERATION

- preview mode 기반 시각 QA 반복을 위해 preview 화면 전환 링크를 추가했다.
- preview 화면 상단에서 `login`, `lobby`, `room`, `play`, `gallery`로 바로 이동할 수 있다.
- 좁은 화면에서 chat input과 send button이 한 줄에 눌리지 않도록 mobile breakpoint에서 chat form을 단일 column으로 내린다.
- Browser 런타임은 Windows sandbox 문제로 screenshot 확인을 완료하지 못했으며, 대체로 preview URL 응답, typecheck/build, 코드 기반 layout 점검을 수행했다.
- 기능 동작, Firebase auth, API, Socket 계약은 변경하지 않았다.

### 2026-06-07 PHASE-FE-MANUAL-VISUAL-POLISH-FOLLOWUP

- dev-only preview mode를 기준으로 MVP 화면의 추가 시각 polish를 수행했다.
- Browser 도구는 Windows sandbox `spawn setup refresh` 문제로 다시 연결되지 않아 screenshot 기반 점검은 수행하지 못했다.
- 대체 검증으로 로컬 preview URL 5종의 HTTP 200 응답, TypeScript typecheck, production build를 확인했다.
- 기능 동작, Firebase auth, 백엔드 API, Socket 계약은 변경하지 않고 CSS 레이아웃 안정화만 적용했다.
- 플레이 화면은 중앙 canvas 영역을 우선하도록 desktop grid 비율을 조정하고, canvas 최소 높이를 viewport 기반으로 안정화했다.
- drawing toolbar는 좁은 화면에서 버튼과 색상 swatch가 겹치지 않도록 wrapping과 mobile full-width 배치를 보정했다.
- chat form은 버튼 최소 폭을 보장하고 mobile에서는 기존 단일 column 흐름을 유지했다.
- gallery card는 결과 정보가 갤러리 카드처럼 읽히도록 내부 간격과 summary grid를 정리했다.
- mobile status strip의 좌우 padding을 복구해 안내 문구가 카드 테두리에 붙지 않도록 했다.

### 2026-06-07 PHASE-FE-REAL-FLOW-VISUAL-QA-FIX

- 실제 Google 로그인 후 E2E 조작은 사용자 계정 조작이 필요해 자동 수행하지 못했다.
- 실제 사용자 플로우 코드 기준으로 로그인, 로비, 방 준비, 플레이, 갤러리 화면의 남은 UX 마찰을 점검했다.
- 백엔드 인증/API/Socket 계약과 Firebase auth 흐름은 변경하지 않았다.
- 일반 사용자에게 불필요한 기술 용어가 보이지 않도록 canvas lock 안내에서 `Socket` 직접 노출을 제거했다.
- 참가자 ready 상태 표기를 `Ready`/`Waiting`에서 `준비`/`대기`로 변경해 방 준비 화면의 문맥을 맞췄다.
- 업로드 안내 문구가 카드 안에서 안정적으로 줄바꿈되도록 upload box text style을 보정했다.
- 업로드 preview 확인/취소 버튼은 같은 줄에서 균형 있게 배치되도록 flex sizing을 보정했다.
- 갤러리 결과 카드의 다운로드 버튼은 카드 하단에서 일관되게 보이도록 full-width와 auto margin을 적용했다.

### 2026-06-07 PHASE-BE-ROOM-STARTING-REUSE-UPLOAD-REPLACE

- room status에 `starting`을 추가했다.
- `start-game`은 이제 `waiting -> starting` 전이 후 `game-starting { roomCode, countdownSec, startsAt, room }`을 emit한다.
- MVP countdown은 5초이며 countdown 만료 후 첫 라운드를 선택하고 `round-started`를 emit한다.
- countdown 중 room status가 `starting`이므로 이미지 업로드/교체는 기존 room state guard로 거절된다.
- image metadata에 `active`와 `replacedAt` 계약을 추가했다.
- 같은 사용자가 `waiting` 상태에서 다시 업로드하면 새 image를 active로 만들고 기존 active image를 비활성화한다.
- ready 계산과 unused image 선택은 active image 기준으로 동작한다.
- `starting`, `playing`, `finished` 상태에서 join한 사용자는 `isSpectator: true` participant로 표시할 수 있다.
- spectator는 chat은 가능하지만 `draw-stroke`는 `ROOM_SPECTATOR_DRAWING_DENIED`로 거절된다.
- `prepare-next-game` socket event를 추가해 host가 `finished -> waiting`으로 같은 방을 재사용할 수 있게 했다.
- 재사용 시 `currentRoundIndex`는 0으로 초기화하고 이전 active images는 비활성화하며 results는 보존한다.
- 프론트엔드 코드는 변경하지 않았다.
