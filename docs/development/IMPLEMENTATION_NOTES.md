# Implementation Notes

## 기록 원칙

## 결정 사항

## 구현 메모

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
