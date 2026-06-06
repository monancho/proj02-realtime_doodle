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
