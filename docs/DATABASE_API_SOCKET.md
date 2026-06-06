# DB/API/Socket 계약

## MongoDB 컬렉션

### `users`

```ts
{
  _id: ObjectId;
  firebaseUid: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### `rooms`

```ts
{
  _id: ObjectId;
  roomCode: string;
  title: string;
  hostUid: string;
  status: "waiting" | "playing" | "finished";
  currentRoundIndex: number;
  settings: {
    roundDurationSec: number;
    maxPlayers: number;
    maxImagesPerUser: number;
  };
  participants: Array<{
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
    joinedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

`rooms.participants`는 영속 room membership만 저장한다. Socket.IO `socketId`와 접속 여부 같은 presence 정보는 MVP에서 socket layer의 메모리 상태로 분리하며 MongoDB room document에 저장하지 않는다.

### `images`

```ts
{
  _id: ObjectId;
  roomId: ObjectId;
  uploadedBy: {
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  originalName: string;
  mimeType: string;
  size: number;
  storageType: "gridfs";
  fileId: ObjectId;
  width: number | null;
  height: number | null;
  used: boolean;
  createdAt: Date;
}
```

### `rounds`

```ts
{
  _id: ObjectId;
  roomId: ObjectId;
  roundIndex: number;
  imageId: ObjectId;
  startedAt: Date;
  endedAt: Date | null;
  status: "playing" | "finished";
}
```

### `results`

```ts
{
  _id: ObjectId;
  roomId: ObjectId;
  roundId: ObjectId;
  imageId: ObjectId;
  resultFileId: ObjectId;
  thumbnailFileId: ObjectId | null;
  createdAt: Date;
}
```

### `chatMessages`

```ts
{
  _id: ObjectId;
  roomId: ObjectId;
  firebaseUid: string | null;
  nickname: string | null;
  type: "chat" | "system";
  message: string;
  createdAt: Date;
}
```

## 인덱스

| 컬렉션 | 인덱스 | 목적 |
|---|---|---|
| `users` | `firebaseUid` unique | Firebase 사용자와 서비스 사용자 1:1 매핑 |
| `rooms` | `roomCode` unique | 방 코드 입장 속도와 중복 방지 |
| `images` | `roomId`, `used` | 랜덤 선택 후보 조회 |
| `rounds` | `roomId`, `roundIndex` | 라운드 순서 조회 |
| `results` | `roomId`, `createdAt` | 결과 갤러리 조회 |
| `chatMessages` | `roomId`, `createdAt` | 최근 채팅 조회 |

## REST API

| Method | Endpoint | Auth | 역할 |
|---|---|---|---|
| `GET` | `/health` | 없음 | 서버 상태 확인 |
| `POST` | `/api/users/me` | 필요 | Firebase uid 기준 사용자 프로필 생성/조회 |
| `POST` | `/api/rooms` | 필요 | 방 생성 |
| `GET` | `/api/rooms/:roomCode` | 필요 | 방 정보 조회 |
| `POST` | `/api/rooms/:roomCode/join` | 필요 | 방 입장 보조 API |
| `POST` | `/api/rooms/:roomCode/images` | 필요 | 사진 업로드 |
| `GET` | `/api/rooms/:roomCode/images` | 필요 | 업로드 이미지 목록 |
| `GET` | `/api/images/:imageId` | 필요 | 원본 이미지 스트림 조회 |
| `POST` | `/api/rooms/:roomCode/rounds/start` | 필요 | 방장 라운드 시작 |
| `POST` | `/api/rounds/:roundId/results` | 필요 | 라운드 결과 이미지 업로드 |
| `GET` | `/api/rooms/:roomCode/results` | 필요 | 결과 갤러리 조회 |
| `GET` | `/api/results/:resultId/download` | 필요 | 결과 이미지 다운로드 |

### `POST /api/users/me`

인증된 Firebase 사용자 기준으로 서비스 사용자 프로필을 생성하거나 갱신한다.

Request body:

```ts
{
  nickname?: string | null;
  avatarUrl?: string | null;
}
```

Response body:

```ts
{
  user: {
    firebaseUid: string;
    email: string | null;
    nickname: string | null;
    avatarUrl: string | null;
    createdAt: string;
    updatedAt: string;
  }
}
```

MVP 초기 구현에서는 repository interface를 통해 동작하며, 실제 MongoDB 연결은 다음 DB 연결 단계에서 구현한다.

## Auth 계약 초안

### HTTP 인증

인증이 필요한 REST API는 다음 header를 요구한다.

```txt
Authorization: Bearer <Firebase ID Token>
```

서버는 Firebase Admin SDK로 ID Token signature/project를 검증한 뒤 decoded token의 `firebase.sign_in_provider`가 `google.com`인지 확인한다. MVP에서는 Google OAuth 로그인 사용자만 HTTP API와 Socket 연결을 사용할 수 있다. provider raw payload, token, email, Firebase UID 값은 오류 메시지에 포함하지 않는다.

검증 성공 시 서버 내부 request context는 shared `AuthContext`를 사용한다.

```ts
{
  user: {
    firebaseUid: string;
    email: string | null;
    nickname: string | null;
    avatarUrl: string | null;
  };
  tokenIssuedAt?: number;
  tokenExpiresAt?: number;
}
```

인증 실패 응답은 shared `AuthErrorResponse` 형식을 따른다.

```json
{
  "error": {
    "code": "AUTH_TOKEN_MISSING",
    "message": "Authentication is required."
  }
}
```

허용 error code 초안:

| Code | 의미 |
|---|---|
| `AUTH_TOKEN_MISSING` | token 없음 또는 Bearer 형식 아님 |
| `AUTH_TOKEN_INVALID` | Firebase token 검증 실패 |
| `AUTH_TOKEN_EXPIRED` | 만료된 token |
| `AUTH_USER_DISABLED` | 비활성화된 Firebase 사용자 |
| `AUTH_PROVIDER_UNSUPPORTED` | Google OAuth가 아닌 Firebase sign-in provider |
| `AUTH_FORBIDDEN` | 인증은 되었으나 권한 없음 |

### Socket 인증

Socket.IO 연결은 다음 auth payload를 사용한다.

```ts
{
  token: string;
}
```

클라이언트는 `io(serverUrl, { auth: { token } })` 형태로 전달한다. query string token은 사용하지 않는다. Socket auth middleware도 HTTP auth와 동일하게 Firebase ID Token 검증 후 `firebase.sign_in_provider === "google.com"`을 요구하며, 실패 시 `AUTH_PROVIDER_UNSUPPORTED`를 안전한 socket auth error로 전달한다.

## Socket.IO 이벤트

| 이벤트 | 방향 | Payload | 설명 |
|---|---|---|---|
| `join-room` | client -> server | `{ roomCode }` | HTTP join 이후 repository membership 확인 및 socket room join |
| `leave-room` | client -> server | `{ roomCode }` | socket room 퇴장. MVP에서는 영속 participants 제거 없음 |
| `room-updated` | server -> client | `{ room }` | shared `RoomDetail` 기준 참가자 목록/방 상태 갱신 |
| `send-message` | client -> server | `{ roomCode, message }` | 같은 room participant의 채팅 전송 |
| `receive-message` | server -> client | `{ roomCode, type, firebaseUid, nickname, avatarUrl, message, createdAt }` | 같은 Socket.IO room 사용자에게 채팅 수신 |
| `system-message` | server -> client | `{ type, message, createdAt }` | 입장/퇴장/라운드 알림 |
| `start-game` | client -> server | `{ roomCode }` | 방장 게임 시작 요청 |
| `round-started` | server -> client | `{ roundId, imageId, durationSec, startedAt }` | 라운드 시작 |
| `draw-stroke` | client <-> server | `{ roomCode, roundId, stroke }` | 드로잉 stroke 공유 |
| `clear-canvas` | client <-> server | `{ roomCode, roundId }` | 캔버스 초기화. MVP에서는 방장만 허용 권장 |
| `round-ended` | server -> client | `{ roundId }` | 라운드 종료 |
| `game-finished` | server -> client | `{ roomCode }` | 게임 종료 및 결과 갤러리 이동 |
| `socket-error` | server -> client | `{ code, message }` | 인증/권한/검증 오류 |

## Payload 예시

```json
{
  "roomCode": "ABC123",
  "roundId": "round-id",
  "stroke": {
    "tool": "pen",
    "color": "#222222",
    "lineWidth": 4,
    "points": [
      { "x": 120, "y": 80 },
      { "x": 123, "y": 84 }
    ],
    "clientStrokeId": "client-stroke-id"
  }
}
```

## 검증 규칙

| 대상 | 규칙 |
|---|---|
| 이미지 파일 | `jpg`, `jpeg`, `png`, `webp`만 허용, 5MB 이하 |
| 채팅 메시지 | trim 후 빈 문자열 차단, 200자 이하 |
| 방 코드 | 6자리 대문자/숫자 조합 |
| 라운드 상태 | `playing` 상태에서만 `draw-stroke` 허용 |
| 권한 | `start-game`은 `hostUid`와 요청자 uid가 일치해야 허용 |

## Room Create/Join 계약 계획

이 섹션은 `PHASE-04-ROOM-CONTRACT-PLAN`의 기준 계약이다. 아직 구현 코드를 추가하지 않으며, 다음 구현 단계에서 `packages/shared`의 room contract와 `apps/server`의 repository/API 구현이 이 내용을 따른다.

### Shared Room Contract 초안

다음 타입은 다음 구현 단계에서 `packages/shared/src/room.ts`에 추가하는 것을 기준으로 한다.

```ts
export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomSettings {
  roundDurationSec: number;
  maxPlayers: number;
  maxImagesPerUser: number;
}

export interface RoomParticipant {
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  joinedAt: string;
}

export interface RoomSummary {
  roomCode: string;
  title: string;
  status: RoomStatus;
  hostUid: string;
  settings: RoomSettings;
  participantCount: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomDetail extends RoomSummary {
  participants: RoomParticipant[];
  currentRoundIndex: number;
}

export interface CreateRoomRequest {
  title?: string | null;
  settings?: Partial<RoomSettings>;
}

export interface CreateRoomResponse {
  room: RoomDetail;
}

export type JoinRoomRequest = Record<string, never>;

export interface JoinRoomResponse {
  room: RoomDetail;
}

export interface GetRoomResponse {
  room: RoomDetail;
}
```

### HTTP API 경계

| Method | Endpoint | Auth | 목적 | 비고 |
|---|---|---|---|---|
| `POST` | `/api/rooms` | 필요 | 인증된 사용자를 host로 방 생성 | `request.auth.user.firebaseUid` 기준 |
| `GET` | `/api/rooms/:roomCode` | 필요 | 방 상세 조회 | 참가 전 조회 허용 여부는 구현 전 확정 필요 |
| `POST` | `/api/rooms/:roomCode/join` | 필요 | 인증된 사용자를 방 참가자로 등록 | 중복 참가 시 idempotent 응답 권장 |

HTTP API는 방 생성, 방 조회, 참가자 등록 같은 영속 상태 변경을 담당한다. Socket.IO는 실시간 presence와 브로드캐스트를 담당하며, 최초 참가 권한과 room membership은 HTTP API와 repository 상태를 기준으로 검증한다.

### RoomRepository Interface 초안

다음 interface는 다음 구현 단계에서 `apps/server/src/rooms/repository.ts`에 추가하는 것을 기준으로 한다.

```ts
export interface CreateRoomInput {
  host: {
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  title: string;
  settings: RoomSettings;
}

export interface JoinRoomInput {
  roomCode: string;
  participant: {
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
}

export interface RoomRepository {
  createRoom(input: CreateRoomInput): Promise<RoomDetail>;
  findRoomByCode(roomCode: string): Promise<RoomDetail | null>;
  joinRoom(input: JoinRoomInput): Promise<RoomDetail>;
}
```

Repository는 MongoDB document를 shared response shape로 변환해서 반환한다. API route는 MongoDB ObjectId를 클라이언트에 노출하지 않고 `roomCode`를 외부 식별자로 사용한다.

### MongoDB `rooms` Document 초안

```ts
{
  _id: ObjectId;
  roomCode: string;
  title: string;
  hostUid: string;
  status: "waiting" | "playing" | "finished";
  currentRoundIndex: number;
  settings: {
    roundDurationSec: number;
    maxPlayers: number;
    maxImagesPerUser: number;
  };
  participants: Array<{
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
    joinedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

Index 기준:

| Collection | Index | 목적 |
|---|---|---|
| `rooms` | `roomCode` unique | 공개 방 코드 중복 방지 |
| `rooms` | `hostUid`, `createdAt` | 사용자별 생성 방 조회 확장 대비 |
| `rooms` | `status`, `updatedAt` | waiting room 조회 확장 대비 |

### Socket 연계 범위

| Event | 방향 | Payload 초안 | 경계 |
|---|---|---|---|
| `join-room` | client -> server | `{ roomCode: string }` | HTTP join 이후 socket room 참가. 서버는 auth context와 repository membership을 확인 |
| `leave-room` | client -> server | `{ roomCode: string }` | socket room 퇴장 및 presence 갱신. MVP에서는 영속 participants 제거 여부 보류 |
| `room-updated` | server -> client | `{ room: RoomDetail }` | 참가자 목록, status, count 갱신 |
| `socket-error` | server -> client | `{ code: string; message: string }` | token, membership, room status 오류. secret/token 값 포함 금지 |

Socket `join-room`은 DB에 새 참가자를 생성하는 주 API가 아니다. 클라이언트는 먼저 `POST /api/rooms/:roomCode/join`을 호출한 뒤 socket에 연결하거나 `join-room`을 보낸다. 서버는 socket auth context의 `firebaseUid`가 room participants에 존재하는지 확인한 뒤 Socket.IO room `room:${roomCode}`에 참가시킨다.

### Room Error Code 초안

| Code | 의미 | HTTP Status |
|---|---|---|
| `ROOM_NOT_FOUND` | 존재하지 않는 방 코드 | `404` |
| `ROOM_FULL` | 최대 참가자 수 초과 | `409` |
| `ROOM_ALREADY_STARTED` | MVP에서 진행 중인 방 신규 입장 차단 | `409` |
| `ROOM_CODE_COLLISION` | 방 코드 생성 충돌 재시도 초과 | `500` |
| `ROOM_ACCESS_DENIED` | 인증 사용자가 room action 권한 없음 | `403` |

### 구현 전 확인 사항

- `GET /api/rooms/:roomCode`는 MVP에서 인증된 사용자라면 참가 전에도 조회 가능하게 구현했다.
- MVP에서 `leave-room`이 영속 participants에서 제거하는지, socket presence만 제거하는지 확정 필요.
- 방 제목 기본값은 서버에서 `Untitled Room`으로 생성한다.
- `roomCode` 길이는 기존 기준대로 6자리 대문자/숫자를 유지한다.
- Room create/join 구현 시 Drawing, Chat, Upload, Timer 동작은 포함하지 않는다.

## RoomRepository 구현 전략 계획

이 섹션은 `PHASE-04-ROOM-REPOSITORY-PLAN`의 기준이다. 아직 Room create/join route를 구현하지 않으며, 다음 구현 단계에서 repository interface, in-memory repository, MongoDB repository가 이 내용을 따른다.

### Repository 파일 경계

다음 파일 구조를 기준으로 구현한다.

```txt
apps/server/src/rooms/repository.ts
apps/server/src/rooms/in-memory-room-repository.ts
apps/server/src/rooms/mongodb-room-repository.ts
apps/server/src/rooms/room-code.ts
apps/server/src/rooms/errors.ts
```

| 파일 | 책임 |
|---|---|
| `repository.ts` | `RoomRepository`, input type, domain error contract 정의 |
| `room-code.ts` | 6자리 대문자/숫자 roomCode 생성 |
| `in-memory-room-repository.ts` | route/repository 테스트용 메모리 구현 |
| `mongodb-room-repository.ts` | MongoDB document mapping, index, atomic update 구현 |
| `errors.ts` | Room domain error와 HTTP error mapping 보조 |

### RoomRepository Interface 확정안

```ts
export interface CreateRoomInput {
  host: {
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  title: string;
  settings: RoomSettings;
}

export interface JoinRoomInput {
  roomCode: string;
  participant: {
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
}

export interface RoomRepository {
  createRoom(input: CreateRoomInput): Promise<RoomDetail>;
  findRoomByCode(roomCode: string): Promise<RoomDetail | null>;
  joinRoom(input: JoinRoomInput): Promise<RoomDetail>;
}
```

`RoomRepository`는 shared `RoomDetail`을 반환한다. MongoDB `_id`는 외부 응답에 포함하지 않는다. 외부 식별자는 `roomCode`만 사용한다.

### Domain Error 전략

Repository는 기능별 예외를 일반 `Error` 문자열로 흘리지 않고 Room domain error로 변환한다.

```ts
export type RoomErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "ROOM_CODE_COLLISION"
  | "ROOM_ACCESS_DENIED";

export class RoomDomainError extends Error {
  public constructor(
    public readonly code: RoomErrorCode,
    message: string
  ) {
    super(message);
  }
}
```

HTTP route 구현 시 mapping 기준:

| Error Code | HTTP Status | 기준 |
|---|---|---|
| `ROOM_NOT_FOUND` | `404` | `findRoomByCode` 또는 `joinRoom` 대상 없음 |
| `ROOM_FULL` | `409` | `participants.length >= settings.maxPlayers` |
| `ROOM_ALREADY_STARTED` | `409` | `status !== "waiting"`인 방 신규 입장 |
| `ROOM_CODE_COLLISION` | `500` | roomCode 생성 재시도 초과 |
| `ROOM_ACCESS_DENIED` | `403` | 추후 host-only action에서 사용 |

에러 응답은 기존 shared `ApiErrorResponse` shape를 사용하며, secret/token 값을 포함하지 않는다.

### roomCode 생성 및 충돌 재시도 정책

- 문자 집합: `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`
- 길이: 6
- 생성 위치: `apps/server/src/rooms/room-code.ts`
- 생성 함수 초안: `export type RoomCodeGenerator = () => string`
- 기본 generator는 cryptographically strong random source 사용을 우선한다.
- 테스트에서는 deterministic generator를 주입해 충돌과 재시도를 검증한다.
- `createRoom()`은 unique `roomCode` insert를 최대 5회 재시도한다.
- 5회 모두 unique index 충돌이면 `ROOM_CODE_COLLISION`을 throw한다.
- `roomCode`는 대문자로 normalize하며, 외부 입력 roomCode도 trim + uppercase 후 조회한다.

### InMemoryRoomRepository 테스트 전략

In-memory 구현은 route 테스트와 repository 단위 테스트를 위한 deterministic 저장소다.

| 동작 | 기대 결과 |
|---|---|
| 방 생성 | host가 participants 첫 항목으로 들어가고 `isHost=true`로 mapping |
| roomCode 생성 | 주입한 generator 값을 사용 |
| roomCode 충돌 | 같은 code가 있으면 generator 재호출 |
| 충돌 재시도 초과 | `ROOM_CODE_COLLISION` |
| 방 조회 | 존재하지 않으면 `null` |
| 참가 | waiting room이면 participant 추가 |
| 중복 참가 | participant를 중복 추가하지 않고 기존 room detail 반환 |
| 최대 인원 초과 | `ROOM_FULL` |
| 진행 중 방 참가 | `ROOM_ALREADY_STARTED` |

In-memory 저장소는 실제 Socket.IO presence나 `socketId`를 저장하지 않는다. Socket presence는 Socket layer에서 별도로 다룬다.

### MongoRoomRepository atomic update 전략

MongoDB 구현은 unique index와 조건부 update로 race condition을 줄인다.

Index:

```ts
await rooms.createIndex({ roomCode: 1 }, { unique: true });
await rooms.createIndex({ hostUid: 1, createdAt: -1 });
await rooms.createIndex({ status: 1, updatedAt: -1 });
```

`createRoom()`:

- `insertOne()`을 사용한다.
- duplicate key error가 발생하면 roomCode generator를 재호출하고 최대 5회 재시도한다.
- insert 성공 후 document를 shared `RoomDetail`로 mapping한다.

`joinRoom()`:

- 먼저 `findOne({ roomCode })`로 현재 room 상태를 확인한다.
- `status !== "waiting"`이면 `ROOM_ALREADY_STARTED`.
- 이미 참가 중이면 idempotent하게 현재 `RoomDetail`을 반환한다.
- 참가자 수가 `maxPlayers` 이상이면 `ROOM_FULL`.
- 신규 참가자는 조건부 `findOneAndUpdate()`를 사용한다.

조건부 update 기준:

```ts
{
  roomCode,
  status: "waiting",
  "participants.firebaseUid": { $ne: participant.firebaseUid },
  $expr: { $lt: [{ $size: "$participants" }, "$settings.maxPlayers"] }
}
```

update:

```ts
{
  $push: { participants: participantDocument },
  $set: { updatedAt: now }
}
```

주의:

- MongoDB `$expr`와 `$size` 조건이 driver typing에서 복잡하면 repository 내부 helper로 격리한다.
- update 결과가 `null`이면 다시 `findOne({ roomCode })`로 원인을 판별해 `ROOM_NOT_FOUND`, `ROOM_ALREADY_STARTED`, `ROOM_FULL`, idempotent 중 하나로 변환한다.
- `participants` 내 중복 방지는 application condition과 재확인으로 처리한다. 필요하면 후속 단계에서 별도 participants collection 분리를 검토한다.

### Shared Contract 일치 확인

현재 `packages/shared/src/room.ts`와 이 문서의 shared room contract는 다음 기준으로 일치한다.

- `JoinRoomRequest`는 route param `:roomCode`와 중복되지 않도록 `Record<string, never>`를 사용한다.
- `RoomDetail`은 `RoomSummary`를 확장하고 `participants`, `currentRoundIndex`를 포함한다.
- 응답 타입은 `CreateRoomResponse`, `JoinRoomResponse`, `GetRoomResponse` 모두 `{ room: RoomDetail }` shape를 사용한다.

### 다음 구현 전 결정 사항

- `leave-room`은 이번 repository 구현 범위에서 제외한다. 추후 socket presence와 영속 participants 제거 정책을 별도 task로 결정한다.
- 실제 route 구현 전 shared typecheck script가 placeholder인 점을 개선할지 결정 필요.

## Room Create/Join HTTP Route 구현 기록

이 섹션은 `PHASE-04-ROOM-ROUTE-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 endpoint

| Method | Endpoint | Auth | 구현 상태 |
|---|---|---|---|
| `POST` | `/api/rooms` | 필요 | 구현됨 |
| `GET` | `/api/rooms/:roomCode` | 필요 | 구현됨. 참가 전 인증 사용자 조회 허용 |
| `POST` | `/api/rooms/:roomCode/join` | 필요 | 구현됨. 중복 참가 idempotent |

### Create Room 기본값

`POST /api/rooms` 요청 body가 비어 있거나 일부 setting이 생략된 경우 서버는 다음 기본값을 사용한다.

```ts
{
  title: "Untitled Room",
  settings: {
    roundDurationSec: 60,
    maxPlayers: 8,
    maxImagesPerUser: 3
  }
}
```

`title`은 trim 후 빈 문자열이면 기본값을 사용한다. `settings`의 각 값은 양의 정수일 때만 반영하고, 그 외 값은 기본값을 유지한다.

### Route Error Mapping

Room route는 `RoomDomainError`를 shared `ApiErrorResponse` shape로 변환한다.

| Error Code | HTTP Status |
|---|---:|
| `ROOM_NOT_FOUND` | `404` |
| `ROOM_FULL` | `409` |
| `ROOM_ALREADY_STARTED` | `409` |
| `ROOM_ACCESS_DENIED` | `403` |
| `ROOM_CODE_COLLISION` | `500` |

인증 context가 없으면 `AUTH_TOKEN_MISSING` 401 응답을 반환한다.

### 제외 범위

- Drawing, Chat, Upload, Timer feature는 구현하지 않았다.
- Socket.IO room membership 검증은 아직 구현하지 않았다.
- 실제 MongoDB 연결 검증은 이번 route 테스트 범위에서 제외하고 `InMemoryRoomRepository` 중심으로 검증했다.

## Socket Room Membership 구현 계획

이 섹션은 `PHASE-05-SOCKET-ROOM-MEMBERSHIP-PLAN`의 기준이다. 아직 Socket.IO event handler 코드를 구현하지 않으며, 다음 socket 구현 단계에서 이 경계를 따른다.

### 목표 경계

Socket `join-room`은 room participant를 새로 생성하는 API가 아니다. 영속 membership 생성은 HTTP API가 담당한다.

클라이언트 흐름:

1. Firebase 로그인 후 ID token을 준비한다.
2. 방 생성자는 `POST /api/rooms`로 room과 host participant를 생성한다.
3. 참가자는 `POST /api/rooms/:roomCode/join`으로 영속 participant에 등록한다.
4. Socket.IO 연결은 `handshake.auth.token`으로 인증한다.
5. 클라이언트가 `join-room`을 보내면 서버는 repository의 `RoomDetail.participants`에서 socket auth context의 `firebaseUid`가 존재하는지 확인한다.
6. 확인된 사용자만 Socket.IO room `room:${roomCode}`에 참가시킨다.

### Event Payload 기준

| Event | 방향 | Payload | 기준 |
|---|---|---|---|
| `join-room` | client -> server | `{ roomCode: string }` | `roomCode`는 trim + uppercase normalize. `nickname`은 auth/HTTP user profile 기준을 사용하므로 socket payload에서 받지 않는다. |
| `leave-room` | client -> server | `{ roomCode: string }` | socket room 퇴장만 처리한다. MVP에서는 MongoDB `rooms.participants`에서 제거하지 않는다. |
| `room-updated` | server -> client | `{ room: RoomDetail }` | shared `RoomDetail` shape와 동일하다. `participants`, `participantCount`, `status`, `currentRoundIndex`를 별도 축약 payload로 분리하지 않는다. |
| `socket-error` | server -> client | `{ code: string; message: string }` | token, credential, URI, private key 값은 포함하지 않는다. |

### `join-room` 검증 순서

1. Socket auth middleware가 `socket.data.auth`에 shared `AuthContext`를 저장했는지 확인한다.
2. payload에서 `roomCode`가 문자열인지 확인하고 trim + uppercase normalize한다.
3. `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
4. room이 없으면 `socket-error` `{ code: "ROOM_NOT_FOUND", message: "Room was not found." }`를 보낸다.
5. `room.participants.some(participant => participant.firebaseUid === socket.data.auth.user.firebaseUid)`를 확인한다.
6. participant가 아니면 `socket-error` `{ code: "ROOM_ACCESS_DENIED", message: "Join the room over HTTP before opening the socket room." }`를 보낸다.
7. 검증 성공 시 Socket.IO room `room:${room.roomCode}`에 참가시킨다.
8. 같은 socket이 같은 room에 중복 join해도 idempotent하게 처리한다.
9. 같은 room 참가자에게 `room-updated` `{ room }`을 broadcast한다.

### `leave-room` MVP 정책

- `leave-room`은 socket presence만 처리한다.
- MongoDB `rooms.participants` 배열에서는 사용자를 제거하지 않는다.
- `participantCount`는 영속 participant 수를 의미하므로 `leave-room`만으로 감소하지 않는다.
- 실시간 접속자 수가 필요해지면 후속 단계에서 별도 presence payload 또는 in-memory presence store를 추가한다.
- socket disconnect 시에도 같은 정책을 적용한다.

### Socket Error Code 기준

| Code | 의미 |
|---|---|
| `AUTH_TOKEN_MISSING` | socket auth context가 없음 |
| `AUTH_TOKEN_INVALID` | token 검증 실패. socket auth middleware에서 처리 |
| `ROOM_NOT_FOUND` | `roomCode`에 해당하는 room 없음 |
| `ROOM_ACCESS_DENIED` | HTTP join을 하지 않은 사용자가 socket room 참가 시도 |
| `ROOM_PAYLOAD_INVALID` | payload가 `{ roomCode: string }` 형식이 아님 |

### 구현 제외 범위

- Drawing, Chat, Upload, Timer feature는 이 단계와 다음 socket membership 구현의 범위가 아니다.
- `send-message`, `draw-stroke`, `start-game`, `round-started`는 membership 검증 구현 이후 별도 단계에서 다룬다.
- Redis adapter나 다중 instance presence는 MVP 범위 밖이다.

## Socket Room Membership 구현 기록

이 섹션은 `PHASE-05-SOCKET-ROOM-MEMBERSHIP-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 server wiring

- HTTP server에 Socket.IO server를 연결한다.
- Socket.IO CORS origin은 `SOCKET_CORS_ORIGIN` env 값을 사용한다.
- Socket auth middleware는 `handshake.auth.token`을 검증하고 `socket.data.auth`에 shared `AuthContext`를 저장한다.
- Room membership handler는 `RoomRepository`를 통해 영속 participants를 확인한다.

### 구현된 event

| Event | 구현 결과 |
|---|---|
| `join-room` | `{ roomCode: string }` payload를 검증하고, repository membership 확인 후 `room:${roomCode}`에 join |
| `leave-room` | `{ roomCode: string }` payload를 검증하고, socket room leave만 수행 |
| `room-updated` | `{ room: RoomDetail }` payload로 Socket.IO room에 emit |
| `socket-error` | `{ code: string; message: string }` payload로 현재 socket에 emit |

### 구현된 error code

| Code | 기준 |
|---|---|
| `AUTH_TOKEN_MISSING` | socket auth context가 없는 상태에서 room event 처리 시도 |
| `ROOM_PAYLOAD_INVALID` | payload가 `{ roomCode: string }` 형식이 아니거나 빈 roomCode |
| `ROOM_NOT_FOUND` | repository에서 room을 찾지 못함 |
| `ROOM_ACCESS_DENIED` | socket auth user가 room participants에 없음 |

### 제외 범위

- `leave-room`은 MongoDB `rooms.participants`를 제거하지 않는다.
- Drawing, Chat, Upload, Timer feature는 구현하지 않았다.
- Redis adapter, 다중 instance presence, 영속 presence store는 구현하지 않았다.

## Chat 구현 계획

이 섹션은 `PHASE-06-CHAT-PLAN`의 기준이다. 아직 Chat event handler 코드를 구현하지 않으며, 다음 Chat 구현 단계에서 이 경계를 따른다.

### 목표 경계

Chat은 Socket.IO room membership 검증 이후 동작한다. `send-message`는 socket auth context와 repository membership을 기준으로 검증하며, 같은 Socket.IO room `room:${roomCode}`에 참가한 사용자에게만 `receive-message`를 broadcast한다.

영구 채팅 아카이브는 MVP 제외 범위로 유지한다. 다만 라운드 중 UX를 위해 최근 메시지 저장은 MVP 정책 초안으로 별도 저장소에 제한적으로 둘 수 있다.

### Event Payload 기준

```ts
export interface SendMessagePayload {
  roomCode: string;
  message: string;
}

export interface ReceiveMessagePayload {
  roomCode: string;
  type: "chat";
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  message: string;
  createdAt: string;
}
```

System message는 별도 event `system-message`로 유지한다. Chat MVP에서 `receive-message.type`은 `"chat"`만 사용한다.

### `send-message` 검증 순서

1. Socket auth middleware가 `socket.data.auth`에 shared `AuthContext`를 저장했는지 확인한다.
2. payload가 `{ roomCode: string; message: string }` 형식인지 확인한다.
3. `roomCode`는 trim + uppercase normalize한다.
4. `message`는 trim한다.
5. trim 결과가 빈 문자열이면 `socket-error` `{ code: "CHAT_MESSAGE_EMPTY", message }`를 보낸다.
6. trim 결과가 200자를 초과하면 `socket-error` `{ code: "CHAT_MESSAGE_TOO_LONG", message }`를 보낸다.
7. `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
8. room이 없으면 `socket-error` `{ code: "ROOM_NOT_FOUND", message }`를 보낸다.
9. socket auth user가 `room.participants`에 없으면 `socket-error` `{ code: "ROOM_ACCESS_DENIED", message }`를 보낸다.
10. 검증 성공 시 `receive-message` payload를 생성해 Socket.IO room `room:${room.roomCode}`에 broadcast한다.

### Broadcast 기준

- server는 `io.to("room:${roomCode}")`에만 `receive-message`를 emit한다.
- 다른 room에는 message를 전달하지 않는다.
- client가 보낸 raw message가 아니라 trim된 message를 broadcast한다.
- sender도 같은 Socket.IO room에 있으면 동일하게 `receive-message`를 받는다.
- payload에는 token, credential, URI, private key 값을 포함하지 않는다.

### 최근 메시지 저장 정책 초안

MVP에서 영구 채팅 아카이브는 구현하지 않는다. 다음 Chat 구현 단계의 기본값은 in-memory recent messages로 제한한다.

| 항목 | 정책 |
|---|---|
| 저장 위치 | server memory |
| 저장 범위 | roomCode별 최근 50개 chat message |
| 재시작 시 유지 | 유지하지 않음 |
| MongoDB 저장 | 후속 단계에서 필요 시 검토 |
| 조회 API | 이번 Chat MVP에서는 추가하지 않음 |

`chatMessages` MongoDB collection은 명세에 남겨두되, MVP 초기 Chat 구현에서는 바로 쓰지 않는다. 영구 저장이 필요해지는 경우 별도 task에서 repository와 retention 정책을 정한다.

### Chat Error Code 기준

| Code | 의미 |
|---|---|
| `AUTH_TOKEN_MISSING` | socket auth context가 없음 |
| `ROOM_NOT_FOUND` | `roomCode`에 해당하는 room 없음 |
| `ROOM_ACCESS_DENIED` | room participant가 아닌 사용자가 메시지 전송 시도 |
| `CHAT_PAYLOAD_INVALID` | payload가 `{ roomCode: string; message: string }` 형식이 아님 |
| `CHAT_MESSAGE_EMPTY` | trim 후 빈 문자열 |
| `CHAT_MESSAGE_TOO_LONG` | trim 후 200자 초과 |

### 구현 제외 범위

- Drawing, Upload, Timer, Round feature는 Chat 구현 범위가 아니다.
- 영구 채팅 아카이브와 MongoDB chat repository는 이번 MVP Chat 구현 기본 범위가 아니다.
- profanity filter, markdown rendering, mention, read receipt, typing indicator는 MVP 범위 밖이다.

## Chat 구현 기록

이 섹션은 `PHASE-06-CHAT-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 event

| Event | 구현 결과 |
|---|---|
| `send-message` | `{ roomCode: string; message: string }` payload를 검증하고 room membership 확인 후 처리 |
| `receive-message` | `{ roomCode, type: "chat", firebaseUid, nickname, avatarUrl, message, createdAt }` payload를 같은 Socket.IO room에 emit |
| `socket-error` | Chat payload, message validation, room 조회, access denied 실패를 code 중심으로 응답 |

### 구현된 validation

- `roomCode`는 trim 후 uppercase normalize한다.
- `message`는 trim한다.
- trim 후 빈 문자열은 `CHAT_MESSAGE_EMPTY`로 거절한다.
- trim 후 200자를 초과하면 `CHAT_MESSAGE_TOO_LONG`으로 거절한다.
- payload 형식이 `{ roomCode: string; message: string }`가 아니면 `CHAT_PAYLOAD_INVALID`로 거절한다.
- socket auth context가 없으면 `AUTH_TOKEN_MISSING`으로 거절한다.
- `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
- room이 없으면 `ROOM_NOT_FOUND`로 거절한다.
- socket auth user가 room participants에 없으면 `ROOM_ACCESS_DENIED`로 거절한다.

### Broadcast와 저장 범위

- 검증 성공 시 server는 `io.to("room:${roomCode}")`에만 `receive-message`를 emit한다.
- 다른 Socket.IO room에는 Chat message를 전달하지 않는다.
- broadcast payload에는 trim된 message를 사용한다.
- 최근 메시지는 server memory에 roomCode별 최근 50개까지만 보관한다.
- 이 in-memory recent messages는 재시작 후 유지하지 않는다.
- MongoDB chat repository와 영구 채팅 아카이브는 MVP 제외 범위로 유지한다.

### 구현 제외 범위

- Drawing, Upload, Timer, Round feature는 구현하지 않았다.
- Chat 조회 API, 영구 채팅 아카이브, MongoDB chat repository는 구현하지 않았다.
- Redis adapter, 다중 instance message sync, 영속 presence store는 구현하지 않았다.

## Drawing 구현 계획

이 섹션은 `PHASE-07-DRAWING-PLAN`의 기준이다. 아직 Drawing event handler 코드를 구현하지 않으며, 다음 Drawing 구현 단계에서 이 경계를 따른다.

### 목표 경계

Drawing은 Socket.IO room membership 검증 이후 동작한다. `draw-stroke`는 socket auth context와 repository membership을 기준으로 검증하며, 같은 Socket.IO room `room:${roomCode}`에 참가한 사용자에게만 stroke를 broadcast한다.

MVP에서는 완성 결과 이미지 저장은 별도 Upload/Result 단계에서 다루고, stroke 영구 아카이브는 기본 구현 범위에서 제외한다. 다만 라운드 중 재접속 UX를 위해 최근 stroke batch를 server memory에 제한적으로 둘 수 있다.

### Event Payload 기준

```ts
export interface DrawPoint {
  x: number;
  y: number;
  pressure?: number | null;
  t?: number | null;
}

export interface DrawStroke {
  strokeId: string;
  tool: "pen" | "eraser";
  color: string;
  width: number;
  points: DrawPoint[];
}

export interface DrawStrokePayload {
  roomCode: string;
  roundId: string;
  stroke: DrawStroke;
}
```

서버가 같은 room에 broadcast할 때도 `draw-stroke` event를 사용하되, server-generated metadata를 덧붙이는 경우 다음 필드를 허용한다.

```ts
export interface DrawStrokeBroadcastPayload extends DrawStrokePayload {
  firebaseUid: string;
  createdAt: string;
}
```

### Stroke Validation 기준

| 항목 | 기준 |
|---|---|
| `roomCode` | string, trim + uppercase normalize, 빈 문자열 차단 |
| `roundId` | string, trim 후 빈 문자열 차단 |
| `stroke.strokeId` | string, trim 후 빈 문자열 차단. client-generated UUID 권장 |
| `stroke.tool` | `"pen"` 또는 `"eraser"` |
| `stroke.color` | CSS hex color `#RRGGBB` 형식. eraser는 서버에서 색상 의미를 사용하지 않아도 됨 |
| `stroke.width` | number, 1 이상 64 이하 |
| `stroke.points` | 1개 이상 128개 이하 |
| `point.x`, `point.y` | finite number, 0 이상 1 이하의 normalized canvas coordinate |
| `point.pressure` | 없거나 null 또는 0 이상 1 이하 |
| `point.t` | 없거나 null 또는 0 이상의 number |

invalid payload는 `socket-error` `{ code: "DRAW_PAYLOAD_INVALID", message }`로 응답한다. room이 없으면 `ROOM_NOT_FOUND`, participant가 아니면 `ROOM_ACCESS_DENIED`를 사용한다.

### Throttle / Batch 기준

- client는 pointer move를 raw event마다 전송하지 않고 stroke point batch로 묶어 보낸다.
- 권장 전송 주기는 16ms 이상 또는 animation frame 단위다.
- 한 payload의 `points`는 최대 128개로 제한한다.
- server는 MVP에서 stroke를 재샘플링하지 않고 validation 후 그대로 broadcast한다.
- server-side rate limit은 후속 구현 단계에서 필요 시 socket별 초당 payload 수 기준으로 추가한다.

### Broadcast 기준

- server는 `io.to("room:${roomCode}")`에만 `draw-stroke`를 emit한다.
- 다른 room에는 stroke를 전달하지 않는다.
- socket auth user가 HTTP room participants에 있어야 한다.
- `roundId`는 현재 라운드 검증 기능이 구현되기 전까지 payload validation만 수행하고, Timer/Round 구현 단계에서 실제 current round와 연결한다.
- payload에는 token, credential, URI, private key 값을 포함하지 않는다.

### Stroke 저장 정책 초안

MVP 기본 구현은 stroke 영구 저장을 하지 않는다. 다음 Drawing 구현 단계의 기본값은 in-memory recent stroke batches로 제한한다.

| 항목 | 정책 |
|---|---|
| 저장 위치 | server memory |
| 저장 범위 | `roomCode + roundId`별 최근 200개 stroke payload |
| 재시작 시 유지 | 유지하지 않음 |
| MongoDB 저장 | 후속 결과 저장/라운드 복구 요구가 생기면 별도 task에서 검토 |
| 조회 API | 이번 Drawing MVP에서는 추가하지 않음 |

영구 결과물은 stroke log가 아니라 최종 이미지 저장/다운로드 단계에서 다룬다. 원본/결과 이미지 바이너리는 기존 원칙대로 MongoDB GridFS를 사용한다.

### 구현 제외 범위

- Drawing handler 코드는 이 단계에서 구현하지 않는다.
- Chat, Upload, Timer, Round feature는 이 단계에서 구현하지 않는다.
- stroke 영구 아카이브, multi-instance stroke sync, Redis adapter는 MVP 범위 밖이다.

## Drawing 구현 기록

이 섹션은 `PHASE-07-DRAWING-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 event

| Event | 구현 결과 |
|---|---|
| `draw-stroke` | `{ roomCode, roundId, stroke }` payload를 검증하고 room membership 확인 후 처리 |
| `draw-stroke` broadcast | `{ roomCode, roundId, stroke, firebaseUid, createdAt }` payload를 같은 Socket.IO room에 emit |
| `socket-error` | Drawing payload, room 조회, access denied 실패를 code 중심으로 응답 |

### 구현된 validation

- `roomCode`는 trim 후 uppercase normalize한다.
- `roundId`는 trim 후 빈 문자열을 차단한다.
- `stroke.strokeId`는 trim 후 빈 문자열을 차단한다.
- `stroke.tool`은 `"pen"` 또는 `"eraser"`만 허용한다.
- `stroke.color`는 CSS hex color `#RRGGBB` 형식만 허용한다.
- `stroke.width`는 1 이상 64 이하 finite number만 허용한다.
- `stroke.points`는 1개 이상 128개 이하만 허용한다.
- `point.x`, `point.y`는 0 이상 1 이하 finite number만 허용한다.
- `point.pressure`는 없거나 null 또는 0 이상 1 이하 finite number만 허용한다.
- `point.t`는 없거나 null 또는 0 이상의 finite number만 허용한다.
- invalid payload는 `DRAW_PAYLOAD_INVALID`로 거절한다.
- socket auth context가 없으면 `AUTH_TOKEN_MISSING`으로 거절한다.
- room이 없으면 `ROOM_NOT_FOUND`로 거절한다.
- socket auth user가 room participants에 없으면 `ROOM_ACCESS_DENIED`로 거절한다.

### Broadcast와 저장 범위

- 검증 성공 시 server는 `io.to("room:${roomCode}")`에만 `draw-stroke`를 emit한다.
- 다른 Socket.IO room에는 stroke를 전달하지 않는다.
- 최근 stroke batch는 server memory에 `roomCode + roundId`별 최근 200개까지만 보관한다.
- 이 in-memory recent stroke batches는 재시작 후 유지하지 않는다.
- stroke 영구 아카이브와 MongoDB stroke repository는 MVP 제외 범위로 유지한다.

### 구현 제외 범위

- Chat, Upload, Timer, Round feature는 구현하지 않았다.
- stroke 조회 API, stroke 영구 아카이브, MongoDB stroke repository는 구현하지 않았다.
- Redis adapter, 다중 instance stroke sync, 영속 presence store는 구현하지 않았다.

## Round/Timer 구현 계획

이 섹션은 `PHASE-08-ROUND-TIMER-PLAN`의 기준이다. 아직 Round/Timer event handler 코드를 구현하지 않으며, 다음 Round/Timer 구현 단계에서 이 경계를 따른다.

### 목표 경계

Round/Timer는 Socket.IO room membership 검증 이후 동작한다. `start-game`은 host만 요청할 수 있고, 서버는 room 상태를 `waiting`에서 `playing`으로 전이한 뒤 첫 라운드 timer를 시작한다.

MVP에서는 단일 서버 메모리 timer를 사용한다. Redis scheduler, durable job queue, multi-instance timer coordination은 MVP 범위에서 제외한다.

### Event Payload 기준

```ts
export interface StartGamePayload {
  roomCode: string;
}

export interface RoundStartedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  durationSec: number;
  startedAt: string;
  endsAt: string;
  imageId: string | null;
}

export interface RoundEndedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  endedAt: string;
}
```

`imageId`는 Upload feature가 구현되기 전까지 `null`을 허용한다. Upload/랜덤 이미지 선택이 구현되면 `round-started.imageId`는 선택된 원본 이미지 id로 채운다.

### `start-game` 검증 기준

1. Socket auth middleware가 `socket.data.auth`에 shared `AuthContext`를 저장했는지 확인한다.
2. payload가 `{ roomCode: string }` 형식인지 확인한다.
3. `roomCode`는 trim + uppercase normalize한다.
4. `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
5. room이 없으면 `socket-error` `{ code: "ROOM_NOT_FOUND", message }`를 보낸다.
6. socket auth user가 `room.participants`에 없으면 `ROOM_ACCESS_DENIED`를 보낸다.
7. socket auth user의 `firebaseUid`가 `room.hostUid`와 다르면 `ROOM_HOST_REQUIRED`를 보낸다.
8. room status가 `waiting`이 아니면 `ROOM_STATE_INVALID`를 보낸다.
9. 검증 성공 시 room status를 `playing`으로 전이하고 `currentRoundIndex`를 `0`으로 유지 또는 설정한다.
10. 첫 라운드를 생성하고 같은 Socket.IO room `room:${roomCode}`에 `round-started`를 emit한다.

### 상태 전이 기준

| 현재 상태 | 이벤트 | 다음 상태 | 기준 |
|---|---|---|---|
| `waiting` | `start-game` 성공 | `playing` | host 권한, 참가자 membership, room 상태 검증 통과 |
| `playing` | round timer 만료 | `playing` 또는 `finished` | 다음 round가 있으면 `currentRoundIndex + 1`, 더 없으면 `finished` |
| `finished` | 추가 `start-game` | `finished` | `ROOM_STATE_INVALID`로 거절 |

MVP에서 총 라운드 수는 업로드 이미지/게임 규칙 구현 전까지 repository가 확정하기 어렵다. 다음 구현 단계의 기본값은 `maxImagesPerUser * participantCount`를 상한으로 보되, Upload 구현 전에는 단일 라운드 또는 mock image-less round로 제한할 수 있다.

### Timer Scheduling 기준

- `durationSec`는 room settings의 `roundDurationSec`를 사용한다.
- 허용 범위는 기존 Room settings validation과 맞춰 10초 이상 300초 이하로 유지한다.
- `startedAt`과 `endsAt`은 server clock 기준 ISO string으로 생성한다.
- server는 `setTimeout` 기반 in-memory timer로 `round-ended`를 emit한다.
- timer key는 `roomCode + roundId` 기준으로 관리한다.
- 같은 room에서 중복 `start-game`이 들어오면 기존 timer를 새로 만들지 않고 `ROOM_STATE_INVALID`로 거절한다.
- 서버 재시작 시 in-memory timer는 복구되지 않는다. durable timer 복구는 MVP 이후 별도 task에서 다룬다.

### Broadcast 기준

- `round-started`와 `round-ended`는 `io.to("room:${roomCode}")`에만 emit한다.
- 다른 room에는 round/timer event를 전달하지 않는다.
- payload에는 token, credential, URI, private key 값을 포함하지 않는다.
- `room-updated`는 room status/currentRoundIndex 변경 후 `{ room: RoomDetail }` shape로 함께 emit하는 것을 권장한다.

### Round/Timer Error Code 기준

| Code | 의미 |
|---|---|
| `AUTH_TOKEN_MISSING` | socket auth context가 없음 |
| `ROOM_PAYLOAD_INVALID` | payload가 `{ roomCode: string }` 형식이 아님 |
| `ROOM_NOT_FOUND` | `roomCode`에 해당하는 room 없음 |
| `ROOM_ACCESS_DENIED` | room participant가 아닌 사용자가 요청 |
| `ROOM_HOST_REQUIRED` | host가 아닌 participant가 `start-game` 요청 |
| `ROOM_STATE_INVALID` | room status가 요청을 처리할 수 없는 상태 |

### 구현 제외 범위

- Round/Timer handler 코드는 이 단계에서 구현하지 않는다.
- Drawing, Chat, Upload feature는 이 단계에서 구현하지 않는다.
- Redis scheduler, durable job queue, multi-instance timer coordination은 MVP 범위 밖이다.

## Image Upload/GridFS 구현 계획

이 섹션은 `PHASE-07-IMAGE-UPLOAD-GRIDFS-PLAN`의 기준이다. 아직 Image upload 구현 코드를 작성하지 않으며, 다음 Image upload 구현 단계에서 이 경계를 따른다.

### 목표 경계

Image upload는 인증된 room participant가 라운드 후보 이미지를 업로드하는 HTTP 기능이다. 서버는 업로드된 원본 이미지 바이너리를 MongoDB GridFS에 저장하고, 조회/랜덤 선택에 필요한 metadata만 `images` collection에 저장한다.

Render local filesystem은 임시 처리 공간으로도 가능하면 사용하지 않는다. 사용하더라도 요청 처리 중 임시 버퍼로만 다루고, 업로드 이미지나 결과 이미지를 Render local filesystem에 영구 저장하지 않는다.

### HTTP API 기준

| Method | Path | Auth | Content-Type | 설명 |
|---|---|---|---|---|
| `POST` | `/api/rooms/:roomCode/images` | 필요 | `multipart/form-data` | room participant의 이미지 업로드 |
| `GET` | `/api/rooms/:roomCode/images` | 필요 | - | room에 업로드된 이미지 metadata 목록 조회 |
| `GET` | `/api/images/:imageId` | 필요 | - | GridFS 원본 이미지 stream 응답 |

`POST /api/rooms/:roomCode/images` multipart field 기준:

| Field | Type | 필수 | 기준 |
|---|---|---:|---|
| `image` | file | 예 | 업로드할 원본 이미지 파일 |

MVP에서는 한 요청에 한 파일만 허용한다. 여러 장 업로드 UI가 필요하면 client가 파일별로 API를 반복 호출한다.

### 인증과 Membership 검증 기준

1. HTTP auth middleware가 Firebase ID Token을 검증한다.
2. `:roomCode`는 trim + uppercase normalize한다.
3. `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
4. room이 없으면 `ROOM_NOT_FOUND`로 응답한다.
5. auth user가 `room.participants`에 없으면 `ROOM_ACCESS_DENIED`로 응답한다.
6. room status가 `waiting`일 때만 업로드를 허용한다. `playing` 또는 `finished`이면 `ROOM_STATE_INVALID`로 응답한다.
7. 사용자별 업로드 수는 room settings의 `maxImagesPerUser` 이하로 제한한다.

### 파일 검증 기준

| 항목 | 기준 |
|---|---|
| multipart field | `image` 단일 파일 |
| MIME type | `image/jpeg`, `image/png`, `image/webp` |
| 확장자 | `.jpg`, `.jpeg`, `.png`, `.webp` 권장. 보조 검증으로만 사용 |
| 파일 크기 | MVP 기본값 10MB 이하 |
| 파일명 | 저장 경로로 사용하지 않고 metadata `originalName`에만 보관 |
| 빈 파일 | 0 byte 파일 차단 |
| 이미지 크기 | 구현 단계에서 이미지 parser를 사용 가능하면 width/height metadata 저장. parser가 없으면 null 허용 |

서버는 client가 보낸 MIME type만 신뢰하지 않는다. 다음 구현 단계에서 가능한 경우 magic byte 또는 이미지 parser 기반 검증을 추가한다.

### GridFS 저장 기준

- 원본 이미지 바이너리는 MongoDB GridFS bucket에 저장한다.
- bucket name 기본값은 `originalImages`로 둔다.
- GridFS file metadata에는 `roomCode`, `uploadedByFirebaseUid`, `mimeType`, `originalName`, `createdAt`을 포함한다.
- API 응답과 랜덤 선택은 GridFS file document가 아니라 `images` collection metadata를 기준으로 한다.
- GridFS 저장 성공 후 `images` metadata insert를 수행한다.
- metadata insert 실패 시 고아 GridFS file이 남지 않도록 가능한 경우 업로드한 GridFS file 삭제를 시도한다.
- Render local filesystem에는 업로드 이미지와 결과 이미지를 영구 저장하지 않는다.

### `images` Metadata Schema 기준

```ts
export interface ImageMetadata {
  id: string;
  roomCode: string;
  uploadedBy: {
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  originalName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  storageType: "gridfs";
  fileId: string;
  width: number | null;
  height: number | null;
  used: boolean;
  createdAt: string;
}
```

MongoDB `images` document는 `roomId` 또는 normalized `roomCode`로 room과 연결한다. 현재 RoomRepository가 public contract로 `roomCode`를 반환하므로 다음 구현 단계에서는 `roomCode` 기반 repository 계약을 우선 사용하고, MongoDB 내부 구현에서 필요하면 room document `_id`를 함께 저장한다.

### 응답 Payload 기준

```ts
export interface UploadImageResponse {
  image: ImageMetadata;
}

export interface ListRoomImagesResponse {
  images: ImageMetadata[];
}
```

`GET /api/images/:imageId`는 JSON payload가 아니라 GridFS stream을 반환한다. 응답 header는 `Content-Type`, `Content-Length`를 가능한 범위에서 설정한다.

### 구현 제외 범위

- Image upload 구현 코드는 이 단계에서 작성하지 않는다.
- Random round start, Timer, Result save는 구현하지 않는다.
- 이미지 리사이징, 썸네일 생성, 바이러스 스캔, 고급 이미지 편집은 MVP 범위 밖이다.

## Image Upload/GridFS 구현 기록

이 섹션은 `PHASE-07-IMAGE-UPLOAD-GRIDFS-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 HTTP API

| Method | Path | 구현 결과 |
|---|---|---|
| `POST` | `/api/rooms/:roomCode/images` | multipart/form-data 단일 `image` file field 업로드 |
| `GET` | `/api/rooms/:roomCode/images` | room participant 대상 image metadata 목록 조회 |
| `GET` | `/api/images/:imageId` | room participant 대상 GridFS 원본 이미지 stream 응답 |

### 구현된 검증

- Firebase HTTP auth middleware의 auth context를 사용한다.
- `roomCode`는 trim 후 uppercase normalize한다.
- `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
- room이 없으면 `ROOM_NOT_FOUND`로 응답한다.
- auth user가 room participants에 없으면 `ROOM_ACCESS_DENIED`로 응답한다.
- 업로드는 `waiting` room에서만 허용하고, 아니면 `ROOM_STATE_INVALID`로 응답한다.
- 사용자별 업로드 수는 `room.settings.maxImagesPerUser` 이하로 제한하고, 초과 시 `IMAGE_LIMIT_REACHED`로 응답한다.
- multipart payload는 단일 `image` file field만 허용한다.
- MIME type은 `image/jpeg`, `image/png`, `image/webp`만 허용한다.
- 0 byte 파일은 `IMAGE_FILE_EMPTY`로 거절한다.
- 10MB 초과 파일은 `IMAGE_FILE_TOO_LARGE`로 거절한다.

### 저장 구현

- `ImageRepository` 계약과 `InMemoryImageRepository`, `MongoImageRepository`를 추가했다.
- `ImageStorage` 계약과 `InMemoryImageStorage`, GridFS 기반 storage를 추가했다.
- MongoDB metadata collection은 `images`를 사용한다.
- GridFS bucket 기본값은 `originalImages`다.
- GridFS 저장 성공 후 `images` metadata를 insert한다.
- metadata insert 실패 시 업로드한 GridFS file 삭제를 시도한다.
- Render local filesystem에 이미지 바이너리를 영구 저장하지 않는다.

### 구현 제외 범위

- Random round start, Timer, Result save는 구현하지 않았다.
- 이미지 리사이징, 썸네일 생성, 바이러스 스캔, 고급 이미지 편집은 구현하지 않았다.
- 실제 MongoDB/GridFS 연결 검증은 이번 테스트 범위에서 제외했다.

## Random Round Start 구현 계획

이 섹션은 `PHASE-08-RANDOM-ROUND-START-PLAN`의 기준이다. 아직 Random round start 구현 코드를 작성하지 않으며, 다음 Random round start 구현 단계에서 이 경계를 따른다.

### 목표 경계

Random round start는 host가 `start-game`을 요청하면 room의 미사용 업로드 이미지 중 하나를 선택하고, 선택된 이미지를 round 대상 이미지로 확정한 뒤 같은 Socket.IO room에 `round-started`를 broadcast하는 기능이다.

Timer scheduling과 `round-ended` 자동 emit은 다음 Timer 구현 단계에서 다룬다. 이번 Random round start 구현 범위는 첫 round 시작과 image selection/used 처리까지로 제한한다.

### 미사용 이미지 선택 기준

1. `ImageRepository`에서 `roomCode` 기준 image metadata를 조회한다.
2. `used === false`인 이미지만 후보로 사용한다.
3. 후보가 없으면 `ROUND_IMAGE_NOT_FOUND`로 거절한다.
4. 후보가 있으면 서버 random source로 하나를 선택한다.
5. 선택 결과는 테스트에서 deterministic random 또는 selector를 주입할 수 있어야 한다.
6. 선택된 image는 round 생성과 함께 `used: true`로 전환한다.

동시 `start-game` 요청에서 같은 image가 중복 선택되지 않도록 MongoDB 구현은 가능한 경우 conditional update 또는 transaction을 사용한다. MVP skeleton에서는 repository 계약에 atomic selection 의도를 명시한다.

### Event Payload 기준

```ts
export interface StartGamePayload {
  roomCode: string;
}

export interface RoundStartedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  durationSec: number;
  startedAt: string;
}
```

Upload 구현 이후 `round-started`는 `imageId` 단일 필드보다 `image: ImageMetadata`를 우선 사용한다. 클라이언트는 `image.id`로 `GET /api/images/:imageId`를 호출해 원본 이미지를 stream으로 가져온다.

### Host 권한과 Membership 검증 기준

1. Socket auth middleware가 `socket.data.auth`에 shared `AuthContext`를 저장했는지 확인한다.
2. payload가 `{ roomCode: string }` 형식인지 확인한다.
3. `roomCode`는 trim + uppercase normalize한다.
4. `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
5. room이 없으면 `ROOM_NOT_FOUND`로 응답한다.
6. socket auth user가 room participants에 없으면 `ROOM_ACCESS_DENIED`로 응답한다.
7. socket auth user의 `firebaseUid`가 `room.hostUid`와 다르면 `ROOM_HOST_REQUIRED`로 응답한다.
8. room status가 `waiting`이 아니면 `ROOM_STATE_INVALID`로 응답한다.
9. 검증 성공 후 image selection과 room 상태 전이를 수행한다.

### 상태 전이와 Round 생성 기준

| 단계 | 기준 |
|---|---|
| 시작 전 room status | `waiting` |
| 성공 후 room status | `playing` |
| 첫 round index | `0` |
| `currentRoundIndex` | `0`으로 설정 또는 유지 |
| round id | server-generated id |
| selected image | `used: false` image 중 하나 |
| selected image 처리 | round 생성과 함께 `used: true` |

`room-updated`는 room status/currentRoundIndex 변경 후 `{ room: RoomDetail }` shape로 함께 emit하는 것을 권장한다.

### Error Code 기준

| Code | 의미 |
|---|---|
| `AUTH_TOKEN_MISSING` | socket auth context가 없음 |
| `ROOM_PAYLOAD_INVALID` | payload가 `{ roomCode: string }` 형식이 아님 |
| `ROOM_NOT_FOUND` | room 없음 |
| `ROOM_ACCESS_DENIED` | room participant가 아닌 사용자가 요청 |
| `ROOM_HOST_REQUIRED` | host가 아닌 participant가 요청 |
| `ROOM_STATE_INVALID` | room status가 `waiting`이 아님 |
| `ROUND_IMAGE_NOT_FOUND` | 사용할 수 있는 `used: false` image가 없음 |

### 구현 제외 범위

- Random round start 구현 코드는 이 단계에서 작성하지 않는다.
- Timer scheduling과 `round-ended` 자동 emit은 구현하지 않는다.
- Result save는 구현하지 않는다.
- multi-instance random coordination과 durable round recovery는 MVP 범위 밖이다.

## Random Round Start 구현 기록

이 섹션은 `PHASE-08-RANDOM-ROUND-START-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 event

| Event | 구현 결과 |
|---|---|
| `start-game` | `{ roomCode: string }` payload를 검증하고 host 권한, room 상태, unused image를 확인 |
| `round-started` | `{ roomCode, roundId, roundIndex, image, durationSec, startedAt }` payload를 같은 Socket.IO room에 emit |
| `room-updated` | room status/currentRoundIndex 전이 후 `{ room: RoomDetail }` payload를 같은 Socket.IO room에 emit |
| `socket-error` | 권한, 상태, 이미지 부족 실패를 code 중심으로 응답 |

### 구현된 검증과 상태 전이

- socket auth context가 없으면 `AUTH_TOKEN_MISSING`으로 거절한다.
- invalid `{ roomCode }` payload는 `ROOM_PAYLOAD_INVALID`로 거절한다.
- room이 없으면 `ROOM_NOT_FOUND`로 거절한다.
- socket auth user가 room participant가 아니면 `ROOM_ACCESS_DENIED`로 거절한다.
- host가 아니면 `ROOM_HOST_REQUIRED`로 거절한다.
- room status가 `waiting`이 아니면 `ROOM_STATE_INVALID`로 거절한다.
- `ImageRepository.listUnusedImagesByRoomCode(roomCode)`로 `used === false` 후보를 조회한다.
- 후보 이미지가 없으면 `ROUND_IMAGE_NOT_FOUND`로 거절한다.
- 선택된 image는 `ImageRepository.markImageUsed(imageId)`로 `used: true` 처리한다.
- `RoomRepository.startGame(roomCode)`로 room status를 `playing`으로 전이하고 `currentRoundIndex`를 `0`으로 유지한다.

### Repository 변경

- `RoomRepository.startGame()` 계약을 추가했다.
- `InMemoryRoomRepository.startGame()`을 구현했다.
- `MongoRoomRepository.startGame()`은 `status: "waiting"` 조건부 update로 구현했다.
- `ImageRepository.listUnusedImagesByRoomCode()` 계약을 추가했다.
- `ImageRepository.markImageUsed()` 계약을 추가했다.
- `InMemoryImageRepository`와 `MongoImageRepository`에 unused 조회/used 처리 구현을 추가했다.

### 구현 제외 범위

- Timer scheduling과 `round-ended` 자동 emit은 구현하지 않았다.
- Result save는 구현하지 않았다.
- multi-instance random coordination과 durable round recovery는 구현하지 않았다.

## Timer/Round End 구현 계획

이 섹션은 `PHASE-10-TIMER-ROUND-END-PLAN`의 기준 계약이다. Timer/round end 구현 코드는 아직 작성하지 않으며, 다음 구현 단계에서 Socket.IO timer handler와 repository 계약이 이 내용을 따른다.

### 목표 경계

Timer/round end는 `start-game` 성공으로 시작된 현재 라운드가 `roundDurationSec`만큼 진행된 뒤 서버가 라운드를 닫고, 다음 미사용 이미지가 있으면 다음 라운드를 시작하거나 더 이상 사용할 이미지가 없으면 room을 `finished`로 전이하는 기능이다.

MVP에서는 단일 서버 프로세스의 in-memory timer만 사용한다. Redis scheduler, durable timer recovery, multi-instance timer coordination, Result save는 이 단계의 범위가 아니다.

### Event Payload 기준

```ts
import type { ImageMetadata, RoomDetail } from "@doodle/shared";

export interface RoundEndedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  endedAt: string;
}

export interface GameFinishedPayload {
  roomCode: string;
  room: RoomDetail;
  finishedAt: string;
}
```

- `round-ended`는 같은 Socket.IO room `room:${roomCode}`에만 emit한다.
- `game-finished`는 room status가 `finished`로 전이된 뒤 같은 Socket.IO room에 emit한다.
- 상태 변경 뒤 `room-updated`는 기존 기준대로 `{ room: RoomDetail }` shape를 유지한다.
- payload에는 token, credential, URI, private key 값을 포함하지 않는다.

### Round Timer 만료 처리 순서

1. `start-game` 또는 다음 라운드 시작 성공 시 `roomCode + roundId` key로 in-memory timer를 등록한다.
2. timer가 만료되면 `RoomRepository.findRoomByCode(roomCode)`로 최신 room을 다시 조회한다.
3. room이 없거나 status가 `playing`이 아니면 timer callback은 추가 emit 없이 safe no-op 처리한다.
4. callback의 `roundId`와 현재 active round가 다르면 stale timer로 보고 safe no-op 처리한다.
5. 현재 라운드를 닫고 `round-ended` `{ roomCode, roundId, roundIndex, image, endedAt }`를 emit한다.
6. 해당 `roomCode + roundId`에 대한 추가 drawing write를 차단한다.
7. `ImageRepository.listUnusedImagesByRoomCode(roomCode)`로 다음 후보 이미지를 조회한다.
8. unused image가 있으면 deterministic test가 가능하도록 selector를 통해 하나를 고르고 `used: true`로 처리한다.
9. 다음 round를 생성하고 `currentRoundIndex`를 1 증가시킨 뒤 `round-started`를 emit한다.
10. unused image가 없으면 room status를 `finished`로 전이하고 `game-finished`와 `room-updated`를 emit한다.

### Drawing 차단 기준

- `draw-stroke`는 room status가 `playing`인 경우에만 허용한다.
- `draw-stroke.roundId`는 현재 active round id와 일치해야 한다.
- `round-ended` emit 이후 같은 `roundId`로 들어오는 `draw-stroke`는 거절한다.
- 종료된 round에 대한 최근 stroke batch는 읽기/재전송 용도로 남길 수 있지만 새 stroke append는 허용하지 않는다.
- 구현 단계의 socket error code는 `DRAW_ROUND_CLOSED` 또는 `ROUND_STATE_INVALID` 중 하나로 고정하되, 클라이언트가 code 중심으로 분기할 수 있게 message에는 secret을 포함하지 않는다.

### 다음 라운드 전이 기준

| 조건 | 처리 |
|---|---|
| unused image 존재 | image selector로 1개 선택, `used: true`, `currentRoundIndex + 1`, 새 `roundId` 생성 |
| 다음 라운드 시작 성공 | `round-started` `{ roomCode, roundId, roundIndex, image, durationSec, startedAt }` emit |
| 다음 timer 등록 | 새 `roomCode + roundId` key로 in-memory timer 등록 |
| 상태 | room status는 계속 `playing` 유지 |

### Finished 전이 기준

| 조건 | 처리 |
|---|---|
| unused image 없음 | room status를 `finished`로 전이 |
| active timer | 해당 room의 active timer reference 제거 |
| emit | `game-finished` `{ roomCode, room, finishedAt }` emit 후 `room-updated` `{ room }` emit |
| 이후 `start-game` | `ROOM_STATE_INVALID`로 거절 |
| 이후 `draw-stroke` | room status가 `playing`이 아니므로 거절 |

### Error Code 기준

| Code | 기준 |
|---|---|
| `ROOM_NOT_FOUND` | timer 만료 처리 또는 socket event 중 room을 찾을 수 없음 |
| `ROOM_STATE_INVALID` | room status가 요청을 처리할 수 없는 상태 |
| `ROUND_STATE_INVALID` | 요청 round가 현재 active round와 일치하지 않음 |
| `DRAW_ROUND_CLOSED` | 이미 종료된 round에 stroke를 보내는 경우 |
| `ROUND_IMAGE_NOT_FOUND` | 다음 round로 사용할 unused image가 없음. Timer 만료 flow에서는 error emit 대신 `finished` 전이에 사용 |

### 구현 제외 범위

- Timer/round end handler 코드는 이 단계에서 구현하지 않는다.
- Result save와 합성 이미지 생성은 구현하지 않는다.
- Redis scheduler, durable timer recovery, multi-instance coordination은 구현하지 않는다.
- Drawing, Chat, Upload 기존 동작을 변경하지 않는다.

## Timer/Round End 구현 기록

이 섹션은 `PHASE-10-TIMER-ROUND-END-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 Event

| Event | 구현 결과 |
|---|---|
| `start-game` | 성공 시 selected image를 used 처리하고 active round를 runtime state에 등록한 뒤 in-memory timer schedule |
| `round-ended` | timer 만료 시 `{ roomCode, roundId, roundIndex, image, endedAt }` payload를 같은 Socket.IO room에 emit |
| `round-started` | 다음 unused image가 있으면 `currentRoundIndex + 1` 후 새 `{ roomCode, roundId, roundIndex, image, durationSec, startedAt }` payload emit |
| `game-finished` | unused image가 없으면 room status를 `finished`로 전이하고 `{ roomCode, room, finishedAt }` payload emit |
| `room-updated` | round start, next round, finished 상태 변경 후 `{ room: RoomDetail }` payload emit |

### Runtime State와 Timer

- `RoundRuntimeStateStore`가 room별 active round `{ roomCode, roundId, roundIndex, image }`를 in-memory로 관리한다.
- `InMemoryRoundTimerScheduler`가 room별 active timer를 `setTimeout` 기반으로 관리한다.
- 새 round timer를 schedule하면 같은 room의 기존 timer는 clear한다.
- timer callback은 최신 room을 repository에서 다시 조회하고, room이 없거나 `playing`이 아니면 no-op 처리한다.
- timer callback의 `roundId`가 현재 active round와 다르면 stale timer로 보고 no-op 처리한다.
- Redis scheduler, durable timer recovery, multi-instance coordination은 구현하지 않았다.

### Drawing 차단 구현

- `draw-stroke`는 room status가 `playing`일 때만 허용한다.
- `draw-stroke.roundId`는 `RoundRuntimeStateStore`의 active round id와 일치해야 한다.
- 이미 종료된 round는 `DRAW_ROUND_CLOSED`로 거절한다.
- 현재 active round와 맞지 않는 round는 `ROUND_STATE_INVALID`로 거절한다.
- 종료된 round에는 recent stroke batch를 새로 append하지 않는다.

### Repository 변경

- `RoomRepository.advanceRound()` 계약을 추가했다.
- `RoomRepository.finishGame()` 계약을 추가했다.
- `InMemoryRoomRepository.advanceRound()`는 `playing` room의 `currentRoundIndex`를 1 증가시킨다.
- `InMemoryRoomRepository.finishGame()`은 `playing` room status를 `finished`로 전이한다.
- `MongoRoomRepository.advanceRound()`는 `status: "playing"` 조건부 update와 `$inc`로 currentRoundIndex를 증가시킨다.
- `MongoRoomRepository.finishGame()`은 `status: "playing"` 조건부 update로 room status를 `finished`로 전이한다.

### 구현 제외 범위

- Result save와 합성 이미지 생성은 구현하지 않았다.
- Redis scheduler, durable timer recovery, multi-instance coordination은 구현하지 않았다.
- 실제 MongoDB 연결 검증은 수행하지 않았다.

## Result Save 구현 계획

이 섹션은 `PHASE-11-RESULT-SAVE-PLAN`의 기준 계약이다. Result save 구현 코드는 아직 작성하지 않으며, 다음 구현 단계에서 결과 합성, GridFS 저장, `results` metadata repository가 이 내용을 따른다.

### 목표 경계

Result save는 round가 종료된 뒤 원본 이미지와 해당 round의 drawing stroke를 하나의 결과 이미지로 합성하고, 결과 이미지 바이너리를 MongoDB GridFS에 저장한 뒤 조회에 필요한 metadata를 `results` collection에 저장하는 기능이다.

MVP에서는 서버 단일 프로세스에서 round 종료 직후 best-effort로 처리한다. Redis scheduler, durable job queue, multi-instance result worker, Gallery/download API는 이 단계의 범위가 아니다.

### 결과 저장 Trigger 기준

| Trigger | 기준 |
|---|---|
| `round-ended` emit 직후 | 해당 round의 drawing이 닫힌 뒤 결과 저장을 시작한다. |
| 다음 round 시작 전 | MVP 기본 정책은 `round-ended` 후 결과 저장을 시도하고, 저장 실패가 다음 round 시작 자체를 막지는 않도록 한다. |
| `game-finished` 전 | 마지막 round 결과 저장도 동일하게 시도한다. 실패해도 room `finished` 전이는 유지한다. |
| 중복 trigger | `roomCode + roundId` 기준 idempotent하게 처리한다. 이미 저장된 result가 있으면 새 GridFS file을 만들지 않는다. |

### 이미지 합성 MVP 기준

- 원본 이미지는 `images` metadata의 `fileId`로 GridFS bucket `originalImages`에서 stream 또는 buffer로 읽는다.
- drawing stroke는 현재 MVP의 in-memory recent stroke batches를 `roomCode + roundId` 기준으로 사용한다.
- stroke 영구 아카이브가 없으므로 서버 재시작 후 과거 round result 재생성은 보장하지 않는다.
- 합성 canvas 크기는 원본 이미지의 실제 pixel size를 우선 사용한다.
- 원본 width/height metadata가 `null`이면 이미지 decoder에서 크기를 읽고, 읽지 못하면 `RESULT_IMAGE_INVALID`로 실패 처리한다.
- stroke point의 `x`, `y`는 0..1 normalized coordinate로 해석해 canvas pixel 좌표로 변환한다.
- `pen`은 stroke color/width를 적용하고, `eraser`는 destination-out 또는 투명 stroke 정책으로 처리한다.
- MVP 결과 포맷은 `image/png`를 기본으로 한다. 원본 MIME type을 그대로 유지하지 않는다.
- 썸네일 생성은 MVP 구현에서 선택 사항이며, 구현하더라도 실패가 원본 result 저장 성공을 무효화하지 않는다.

### GridFS 저장 기준

- 결과 이미지 바이너리는 MongoDB GridFS bucket `resultImages`에 저장한다.
- thumbnail을 생성하는 경우 bucket은 `resultThumbnails`를 사용한다.
- GridFS file metadata에는 `roomCode`, `roundId`, `sourceImageId`, `mimeType`, `createdAt`을 포함한다.
- GridFS 저장 성공 후 `results` metadata insert를 수행한다.
- metadata insert 실패 시 가능한 경우 방금 업로드한 result GridFS file 삭제를 시도한다.
- Render local filesystem에는 결과 이미지와 thumbnail을 영구 저장하지 않는다.
- 임시 파일이 꼭 필요하면 request/job 처리 중 생성하고 완료 또는 실패 시 삭제한다. 기본 구현은 buffer/stream 기반을 우선한다.

### `results` Metadata Schema 기준

```ts
export interface ResultMetadata {
  id: string;
  roomCode: string;
  roundId: string;
  roundIndex: number;
  sourceImageId: string;
  sourceImageFileId: string;
  resultFileId: string;
  thumbnailFileId: string | null;
  mimeType: "image/png";
  width: number;
  height: number;
  strokeCount: number;
  createdAt: string;
}
```

- `roomCode`는 normalized uppercase room code를 저장한다.
- `roundId`는 `round-ended` payload의 round id와 일치한다.
- `roundIndex`는 `round-ended.roundIndex`와 일치한다.
- `sourceImageId`는 `round-ended.image.id`와 일치한다.
- `sourceImageFileId`는 원본 `ImageMetadata.fileId`를 기록해 추적 가능성을 유지한다.
- `resultFileId`는 GridFS bucket `resultImages`의 file id다.
- `thumbnailFileId`는 thumbnail 미생성 또는 실패 시 `null`이다.

### 결과 완료 Event Payload 기준

```ts
import type { ResultMetadata } from "@doodle/shared";

export interface ResultSavedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  result: ResultMetadata;
  createdAt: string;
}
```

- event name은 `result-saved`를 사용한다.
- `result-saved`는 같은 Socket.IO room `room:${roomCode}`에만 emit한다.
- Gallery/download 구현 전에도 클라이언트는 payload metadata를 통해 저장 완료 여부를 알 수 있다.
- payload에는 token, credential, URI, private key 값을 포함하지 않는다.

### 실패와 재시도 기준

| Code | 기준 |
|---|---|
| `RESULT_SOURCE_IMAGE_NOT_FOUND` | source image metadata 또는 GridFS 원본 file을 찾을 수 없음 |
| `RESULT_IMAGE_INVALID` | 원본 이미지 decode 또는 크기 확인 실패 |
| `RESULT_STROKE_RENDER_FAILED` | stroke rendering 중 복구 불가능한 오류 |
| `RESULT_STORAGE_FAILED` | result GridFS 저장 실패 |
| `RESULT_METADATA_FAILED` | `results` metadata 저장 실패 |
| `RESULT_ALREADY_EXISTS` | 같은 `roomCode + roundId` result가 이미 존재 |

- MVP 자동 재시도는 같은 프로세스 내 1회까지로 제한한다.
- 재시도 후에도 실패하면 `result-save-failed`를 같은 Socket.IO room에 emit할 수 있다.
- 실패가 다음 round 시작 또는 room `finished` 전이를 rollback하지 않는다.
- 수동 재처리 API와 durable retry queue는 MVP 이후 별도 단계에서 다룬다.

### 구현 제외 범위

- Result save 구현 코드는 이 단계에서 작성하지 않는다.
- Gallery/download API는 구현하지 않는다.
- Redis scheduler, durable job queue, multi-instance processing은 구현하지 않는다.
- 고급 이미지 편집, 이미지 필터, 투표/랭킹은 MVP 범위 밖이다.

## Result Save 구현 기록

이 섹션은 `PHASE-11-RESULT-SAVE-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 계약과 모듈

| 영역 | 구현 결과 |
|---|---|
| shared contract | `ResultMetadata` 타입 추가 및 `@doodle/shared` export |
| result repository | `ResultRepository`, `InMemoryResultRepository`, `MongoResultRepository` 추가 |
| result storage | `ResultImageStorage`, `InMemoryResultImageStorage`, GridFS `resultImages` storage 추가 |
| composer | `ResultImageComposer` 계약과 deterministic PNG result composer 추가 |
| service | `ResultSaveService`가 source image read, compose, GridFS 저장, metadata 저장, idempotency 처리 |
| socket | `round-ended` 이후 best-effort result save trigger 및 `result-saved` emit 추가 |

### Result Save Flow

1. `handleRoundTimerExpired`가 `round-ended`를 같은 Socket.IO room에 emit한다.
2. `ResultSaveService.saveRoundResult()`를 호출한다.
3. service는 `roomCode + roundId` 기준 기존 result metadata를 먼저 조회한다.
4. 기존 result가 있으면 새 GridFS file을 만들지 않고 기존 metadata로 `result-saved` payload를 만든다.
5. 기존 result가 없으면 `ImageMetadata.fileId`로 원본 image를 `ImageStorage.getFile()`에서 읽는다.
6. `RecentStrokeBatchStore.list(roomCode, roundId)` 결과를 composer에 전달한다.
7. composer는 MVP deterministic `image/png` result buffer를 생성한다.
8. result buffer는 GridFS bucket `resultImages`에 저장한다.
9. `results` metadata를 생성한다.
10. 성공 시 `result-saved` `{ roomCode, roundId, roundIndex, result, createdAt }`를 같은 Socket.IO room에 emit한다.

### Failure Policy

- result save는 같은 프로세스 안에서 최대 2회 시도한다.
- source image read, compose, result storage, metadata 저장 실패는 service 내부에서 `null`로 흡수한다.
- 실패해도 다음 round 시작 또는 room `finished` 전이는 rollback하지 않는다.
- metadata 저장 실패 시 가능한 경우 방금 저장한 result GridFS file 삭제를 시도한다.
- `result-save-failed` event와 durable retry queue는 구현하지 않았다.

### 구현 제외 범위

- Gallery/download API는 구현하지 않았다.
- Redis scheduler, durable job queue, multi-instance processing은 구현하지 않았다.
- 실제 MongoDB/GridFS 연결 검증은 수행하지 않았다.
- 고급 이미지 합성 라이브러리 기반 pixel-perfect rendering은 구현하지 않았다.

## Gallery/Download 구현 계획

이 섹션은 `PHASE-12-GALLERY-DOWNLOAD-PLAN`의 기준 계약이다. Gallery/download 구현 코드는 아직 작성하지 않으며, 다음 구현 단계에서 `results` metadata 조회 API와 result image stream API가 이 내용을 따른다.

### 목표 경계

Gallery/download는 Result save 이후 저장된 `results` metadata를 room participant가 조회하고, 개별 result image 바이너리를 MongoDB GridFS bucket `resultImages`에서 stream으로 내려받는 HTTP 기능이다.

MVP에서는 result metadata 목록 조회와 원본 result image download만 다룬다. Thumbnail API, result 재생성, Result save worker, Redis scheduler, durable job queue, multi-instance processing은 이 단계의 범위가 아니다.

### HTTP API 기준

| Method | Endpoint | Auth | 역할 |
|---|---|---|---|
| `GET` | `/api/rooms/:roomCode/results` | 필요 | room의 result metadata 목록 조회 |
| `GET` | `/api/results/:resultId/download` | 필요 | result image stream 다운로드 |

#### `GET /api/rooms/:roomCode/results`

- `roomCode`는 trim 후 uppercase normalize한다.
- Firebase HTTP auth middleware의 auth context를 사용한다.
- `RoomRepository.findRoomByCode(roomCode)`로 room을 조회한다.
- 요청자가 room participants에 포함되어야 한다.
- 성공 응답은 `{ results, page }` shape를 사용한다.

```ts
export interface ListRoomResultsResponse {
  results: ResultMetadata[];
  page: {
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
  };
}
```

#### `GET /api/results/:resultId/download`

- Firebase HTTP auth middleware의 auth context를 사용한다.
- `ResultRepository.findResultById(resultId)`로 result metadata를 조회한다.
- result의 `roomCode`로 room을 조회하고 요청자가 participants에 포함되어야 한다.
- `result.resultFileId`로 GridFS bucket `resultImages`에서 file을 stream한다.
- JSON payload가 아니라 binary stream 응답을 반환한다.

### Pagination/Sort 기준

| 항목 | 기준 |
|---|---|
| 기본 정렬 | `createdAt` descending, 같은 값이면 `id` descending |
| 기본 limit | 20 |
| 최대 limit | 50 |
| cursor | opaque string. MVP 구현은 `createdAt:id`를 base64url encode한 값 사용 가능 |
| nextCursor | 다음 page가 없으면 `null` |
| 필터 | `roomCode` 기준만 MVP에 포함 |

### Result Stream 응답 Header 기준

| Header | 기준 |
|---|---|
| `Content-Type` | `result.mimeType`, MVP 기본 `image/png` |
| `Content-Length` | GridFS file length를 알 수 있으면 설정 |
| `Content-Disposition` | `attachment; filename="doodle-${roomCode}-${roundIndex}.png"` |
| `Cache-Control` | MVP 기본 `private, max-age=0, no-cache` |

- 파일명에는 token, uid, URI, private key, credential 값을 넣지 않는다.
- 다운로드 응답 전 권한 검증을 먼저 완료한다.

### Error Code 기준

| Code | HTTP | 기준 |
|---|---:|---|
| `ROOM_NOT_FOUND` | 404 | `roomCode`에 해당하는 room 없음 |
| `ROOM_ACCESS_DENIED` | 403 | 요청자가 room participant가 아님 |
| `RESULT_NOT_FOUND` | 404 | `resultId`에 해당하는 metadata 없음 |
| `RESULT_FILE_NOT_FOUND` | 404 | metadata는 있으나 GridFS `resultImages` file 없음 |
| `RESULT_QUERY_INVALID` | 400 | pagination limit/cursor가 유효하지 않음 |
| `AUTH_TOKEN_MISSING` | 401 | HTTP auth middleware에서 인증 없음 |
| `AUTH_TOKEN_INVALID` | 401 | HTTP auth middleware에서 token 검증 실패 |

### Thumbnail API MVP 정책

- Thumbnail metadata field인 `thumbnailFileId`는 유지한다.
- `GET /api/results/:resultId/thumbnail`은 MVP 선택 범위로 문서화만 하고 이번 계획의 구현 대상에서 제외한다.
- thumbnail이 없는 result는 gallery에서 result download URL 또는 placeholder를 사용한다.
- thumbnail 생성/저장 실패는 result download 가능 여부에 영향을 주지 않는다.

### 구현 제외 범위

- Gallery/download 구현 코드는 이 단계에서 작성하지 않는다.
- Result save flow는 이 단계에서 변경하지 않는다.
- Redis scheduler, durable job queue, multi-instance processing은 구현하지 않는다.
- Thumbnail API와 thumbnail 생성은 구현하지 않는다.

## Gallery/Download 구현 기록

이 섹션은 `PHASE-12-GALLERY-DOWNLOAD-IMPLEMENTATION`의 구현 결과 기준이다.

### 구현된 HTTP API

| Method | Path | 구현 결과 |
|---|---|---|
| `GET` | `/api/rooms/:roomCode/results` | room participant 대상 result metadata 목록 조회 |
| `GET` | `/api/results/:resultId/download` | room participant 대상 result image stream 다운로드 |

### 구현된 검증과 Pagination

- Firebase HTTP auth middleware의 auth context를 사용한다.
- `roomCode`는 trim 후 uppercase normalize한다.
- 두 API 모두 result의 room 또는 route room에 대해 `RoomRepository.findRoomByCode()`로 room을 조회한다.
- 요청자의 `firebaseUid`가 room participants에 없으면 `ROOM_ACCESS_DENIED`로 거절한다.
- metadata 목록은 `{ results, page }` shape로 반환한다.
- 기본 limit은 20, 최대 limit은 50이다.
- sort는 `createdAt` descending, 같은 값이면 `id` descending이다.
- cursor는 `{ createdAt, id }`를 base64url encoding한 opaque string을 사용한다.

### Download Stream 기준

- `GET /api/results/:resultId/download`는 `ResultRepository.findResultById()`로 metadata를 조회한다.
- `result.resultFileId`로 `ResultImageStorage.getResultImage()`를 호출한다.
- storage 구현은 GridFS bucket `resultImages`에서 file을 조회하고 stream을 반환한다.
- 응답 header는 `Content-Type`, `Content-Length`, `Content-Disposition`, `Cache-Control`을 설정한다.
- filename은 `doodle-${roomCode}-${roundIndex}.png` 형식을 사용하며 secret 값을 포함하지 않는다.

### Repository/Storage 변경

- `ResultRepository.findResultById()` 계약을 추가했다.
- `ResultRepository.listResultsByRoomCode()` 계약을 추가했다.
- `InMemoryResultRepository`와 `MongoResultRepository`에 find/list 구현을 추가했다.
- `ResultImageStorage.getResultImage()` 계약을 추가했다.
- `InMemoryResultImageStorage`와 GridFS result storage에 stream 조회 구현을 추가했다.
- Express app에 room result router와 result binary router를 연결했다.

### 구현 제외 범위

- Thumbnail API는 구현하지 않았다.
- Result save flow는 변경하지 않았다.
- Redis scheduler, durable job queue, multi-instance processing은 구현하지 않았다.
- 실제 MongoDB/GridFS 연결 검증은 수행하지 않았다.
## Room Ready / Upload Limit / Profile Broadcast 구현 기록

이 섹션은 `PHASE-BE-ROOM-READY-UPLOAD-PROFILE-BROADCAST`의 구현 기준이다.

### 이미지 업로드 제한

- 같은 room에서 같은 Firebase 사용자는 이미지 1장만 업로드할 수 있다.
- 서버는 GridFS 저장 전에 `roomCode + uploadedByFirebaseUid` 기준 기존 업로드 수를 확인한다.
- 이미 업로드한 사용자의 추가 업로드는 `IMAGE_UPLOAD_LIMIT_EXCEEDED`로 거절한다.
- room 생성 기본 설정의 `maxImagesPerUser`는 MVP 정책에 맞춰 1로 유지한다.
- Render local filesystem에 원본 이미지를 영구 저장하지 않고 기존 GridFS storage 계약을 유지한다.

### Room Ready 기준

- MVP ready 기준은 participant별 이미지 1장 업로드 완료이다.
- 별도 ready 버튼은 서버 계약에 추가하지 않는다.
- `start-game`은 host 권한, `waiting` 상태, room membership 검증 이후 모든 participants가 ready인지 확인한다.
- 준비되지 않은 participant가 있으면 `ROOM_PARTICIPANTS_NOT_READY` socket error를 보낸다.
- 모든 participants가 ready이지만 unused image가 없으면 기존 `ROUND_IMAGE_NOT_FOUND`를 유지한다.

### Broadcast 기준

- 이미지 업로드 성공 후 같은 Socket.IO room `room:${roomCode}`에 `room-updated { room }`을 emit한다.
- `profile-updated { roomCode }` socket event를 추가한다.
- `profile-updated`는 socket auth context와 room membership을 검증한다.
- 서버는 `UserRepository.findByFirebaseUid(firebaseUid)`로 최신 user profile을 조회한다.
- 조회한 nickname/avatarUrl을 room participant에 반영한 뒤 `room-updated { room }`을 같은 Socket.IO room에 emit한다.
- profile 조회 실패 시 `USER_PROFILE_NOT_FOUND`, room 없음은 `ROOM_NOT_FOUND`, participant가 아니면 `ROOM_ACCESS_DENIED`를 사용한다.

### 구현 제외

- 프론트엔드 UI 변경은 이번 backend 작업 범위에서 제외했다.
- Drawing, Chat, Timer, Result save 기존 동작은 변경하지 않았다.
- 실제 MongoDB/GridFS 연결 검증, Redis adapter, durable presence, multi-instance coordination은 수행하지 않았다.
