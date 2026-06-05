# 시스템 아키텍처

## 전체 구조

```txt
React Client
  - Firebase Client SDK
  - Socket.IO Client
  - Canvas API
  - hand-drawn UI
        |
        | Firebase Login / ID Token
        v
Firebase Authentication
        |
        | token attached to HTTP/Socket
        v
Render Web Service
  - Node.js
  - Express REST API
  - Socket.IO Server
  - Firebase Admin SDK
        |
        | MongoDB Driver or Mongoose
        v
MongoDB Atlas
  - users / rooms / images / rounds / results / chatMessages
  - GridFS for original/result images
```

## 패키지 경계

| 경로 | 책임 |
|---|---|
| `apps/web` | React 화면, Firebase Client 로그인, Socket.IO Client 연결, Canvas 조작, 업로드/채팅/갤러리 UI |
| `apps/server` | Express API, Socket.IO server, Firebase Admin token 검증, MongoDB/GridFS, 라운드 타이머, 결과 저장 |
| `packages/shared` | REST request/response 타입, Socket payload 타입, 공통 domain type, validation schema |
| `docs` | 요구사항, 명세, 아키텍처, 테스트, 운영, 리뷰 기록 |

## 기술별 책임

| 기술 | 책임 | 저장 여부 |
|---|---|---|
| React | 화면 렌더링, Canvas 조작, 채팅/드로잉 UI | 브라우저 상태 |
| Firebase Authentication | 회원가입, 로그인, ID Token 발급 | Firebase 관리 |
| Firebase Admin SDK | 서버에서 ID Token 검증 | 저장 없음 |
| Express | REST API, 업로드, 결과 조회/다운로드 | 저장 없음 |
| Socket.IO | 방 입장, 채팅, 드로잉, 라운드 이벤트 실시간 동기화 | 메모리 상태 일부 |
| MongoDB Atlas | 서비스 데이터 저장 | 영구 저장 |
| GridFS | 원본 이미지와 결과 이미지 바이너리 저장 | 영구 저장 |
| Render | 백엔드 실행과 외부 URL 제공 | 로컬 파일 영구 저장 금지 |

## 인증 흐름

1. 사용자가 프론트엔드에서 Firebase Authentication으로 로그인한다.
2. Firebase Client SDK가 ID Token을 발급한다.
3. API 요청은 `Authorization: Bearer <Firebase ID Token>` 헤더를 포함한다.
4. Socket.IO 연결은 `handshake.auth.token`에 같은 토큰을 포함한다.
5. 서버는 Firebase Admin SDK `verifyIdToken`으로 토큰을 검증한다.
6. 검증된 `uid`를 MongoDB `users.firebaseUid`와 매핑한다.

## 인증 경계 설계

### HTTP API

- `GET /health`는 인증 없이 접근 가능하다.
- `/api/*` endpoint는 기본적으로 Firebase ID Token 검증이 필요하다.
- 인증 middleware는 `Authorization` header의 `Bearer <token>` 형식만 허용한다.
- 검증 성공 시 request context에 shared `AuthContext` 형태의 사용자 정보를 저장한다.
- 검증 실패 시 token 값은 로그에 남기지 않고 error code와 안전한 메시지만 반환한다.

### Socket.IO

- Socket 연결은 `handshake.auth.token`을 사용한다.
- query string token은 URL/log에 노출될 수 있으므로 사용하지 않는다.
- 연결 시점에 Firebase ID Token을 검증하고 socket context에 `AuthContext`를 저장한다.
- 인증 실패 시 연결을 거부하고 `socket-error` payload에는 token 값 없이 code/message만 포함한다.
- room join, chat, drawing, round control은 socket context의 `firebaseUid`와 room membership을 기준으로 추가 검증한다.

### Shared Auth Contract

- `packages/shared/src/auth.ts`는 다음 구현 단계에서 API/Socket 양쪽이 공유할 인증 타입 초안이다.
- 포함 타입:
  - `AuthenticatedUser`
  - `AuthContext`
  - `AuthErrorCode`
  - `AuthErrorResponse`
  - `SocketAuthPayload`
- Firebase Admin SDK 호출과 token decoding은 `apps/server`에만 둔다.

## 실시간 통신 구조

- Socket namespace는 MVP에서 default namespace를 사용한다.
- Socket room은 `room:${roomCode}` 형식을 권장한다.
- `join-room`은 검증 후 socket room에 참가시킨다.
- `send-message`는 같은 방 사용자에게만 `receive-message`로 전달한다.
- `draw-stroke`는 현재 라운드 상태를 확인한 뒤 같은 방 사용자에게 전달한다.
- `round-started`, `round-ended`, `game-finished`는 서버가 방 단위로 발행한다.

## 서버 메모리와 DB 분리

| 데이터 | 메모리 | MongoDB |
|---|---|---|
| 현재 접속 `socketId` | 필요 | 선택 |
| 현재 라운드 타이머 | 필요 | `rounds`에 결과 기록 |
| 드로잉 좌표 | 실시간 브로드캐스트 | MVP에서는 저장 생략 가능 |
| 채팅 메시지 | 실시간 브로드캐스트 | 최근 50개 저장 권장 |
| 원본 이미지 | 불필요 | GridFS 저장 |
| 결과 이미지 | 불필요 | GridFS 저장 |

## Render 제약

- Render 로컬 파일 시스템은 영구 저장소로 사용하지 않는다.
- 서버는 `process.env.PORT`를 사용한다.
- 무료 플랜은 비활성 상태에서 spin down될 수 있다.
- MVP는 단일 Render Web Service 인스턴스 기준이다.
- 다중 인스턴스 확장 시 Socket.IO adapter가 필요하며 MVP 범위 밖이다.
