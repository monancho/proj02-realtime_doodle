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
  uploadedBy: { firebaseUid: string; nickname: string };
  originalName: string;
  mimeType: string;
  size: number;
  storageType: "gridfs";
  fileId: ObjectId;
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
| `AUTH_FORBIDDEN` | 인증은 되었으나 권한 없음 |

### Socket 인증

Socket.IO 연결은 다음 auth payload를 사용한다.

```ts
{
  token: string;
}
```

클라이언트는 `io(serverUrl, { auth: { token } })` 형태로 전달한다. query string token은 사용하지 않는다.

## Socket.IO 이벤트

| 이벤트 | 방향 | Payload | 설명 |
|---|---|---|---|
| `join-room` | client -> server | `{ roomCode }` | HTTP join 이후 repository membership 확인 및 socket room join |
| `leave-room` | client -> server | `{ roomCode }` | socket room 퇴장. MVP에서는 영속 participants 제거 없음 |
| `room-updated` | server -> client | `{ room }` | shared `RoomDetail` 기준 참가자 목록/방 상태 갱신 |
| `send-message` | client -> server | `{ roomCode, message }` | 채팅 전송 |
| `receive-message` | server -> client | `{ type, nickname, message, createdAt }` | 채팅 수신 |
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
