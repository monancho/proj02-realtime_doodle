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
