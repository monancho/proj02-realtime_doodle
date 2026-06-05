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
    nickname: string;
    socketId?: string;
    joinedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

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
| `join-room` | client -> server | `{ roomCode, nickname }` | 방 입장 및 socket room join |
| `leave-room` | client -> server | `{ roomCode }` | 방 퇴장 |
| `room-updated` | server -> client | `{ participants, status }` | 참가자 목록/방 상태 갱신 |
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

- `GET /api/rooms/:roomCode`를 참가 전 사용자에게 허용할지, 참가자에게만 허용할지 확정 필요.
- MVP에서 `leave-room`이 영속 participants에서 제거하는지, socket presence만 제거하는지 확정 필요.
- 방 제목 기본값을 서버에서 생성할지, 클라이언트에서 입력받을지 확정 필요.
- `roomCode` 길이는 기존 기준대로 6자리 대문자/숫자를 유지한다.
- Room create/join 구현 시 Drawing, Chat, Upload, Timer 동작은 포함하지 않는다.
