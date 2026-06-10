# Realtime Doodle Relay

Realtime Doodle Relay는 여러 사용자가 각자 사진을 업로드하고, 서버가 무작위로 선택한 사진 위에 제한 시간 동안 함께 낙서하며 채팅한 뒤 결과 이미지를 저장하고 다운로드하는 웹 기반 협업 드로잉 릴레이 서비스다.

## 현재 상태

이 저장소는 Phase 5 Socket room membership 구현 직전 단계다. pnpm workspace 기반 구조 위에 서버 health check, env validation, Firebase Admin 인증 middleware 골격, `POST /api/users/me`, MongoDB 연결, Mongo user/room repository, Room create/get/join HTTP route가 구현되어 있다.

완료된 주요 backend slice:

- Express `GET /health`
- 서버 env validation과 local `.env` bootstrap loader
- Firebase Admin HTTP/Socket auth middleware skeleton
- `POST /api/users/me` user upsert
- MongoDB connection module과 `MongoUserRepository`
- Room shared contract
- Room code generator, `InMemoryRoomRepository`, `MongoRoomRepository`
- `POST /api/rooms`, `GET /api/rooms/:roomCode`, `POST /api/rooms/:roomCode/join`
- 로컬 `.env` 기반 bootstrap smoke 성공 기록

아직 구현하지 않은 주요 MVP 기능:

- Socket.IO `join-room`/`leave-room` membership event handler
- 채팅
- 이미지 업로드와 GridFS 저장
- 랜덤 라운드 시작
- Canvas drawing sync
- 타이머/라운드 종료
- 결과 저장/갤러리/다운로드
- React frontend UI

## 기준 문서

- 문서 지도: `docs/DOCUMENT_INDEX.md`
- 요구사항: `docs/REQUIREMENTS.md`
- 기능 명세: `docs/FUNCTIONAL_SPECIFICATION.md`
- 아키텍처: `docs/ARCHITECTURE.md`
- DB/API/Socket 계약: `docs/DATABASE_API_SOCKET.md`
- 유저 플로우: `docs/USER_FLOW.md`
- 디자인 기준: `docs/design/DESIGN_SYSTEM_WIREFRAME.md`, `docs/design/UI_STYLE_GUIDE.md`
- 테스트/검수: `docs/TESTING.md`, `docs/ACCEPTANCE_CRITERIA.md`, `docs/REVIEW_CHECKLIST.md`

## 고정 스택

| 영역 | 기술 |
|---|---|
| Monorepo | pnpm workspaces |
| Language | TypeScript |
| Frontend | React, Vite, Canvas API, Firebase Client SDK, Socket.IO Client |
| Backend | Express, Socket.IO, Firebase Admin SDK, MongoDB, GridFS |
| Database | MongoDB Atlas |
| Deploy | Render Web Service, Render Static Site 또는 Vercel |

## 보안 원칙

비밀정보와 운영 토큰은 저장소에 포함하지 않는다. 업로드 파일과 결과 파일은 Render 로컬 디스크가 아니라 MongoDB GridFS에 저장한다.
Doodle 이미지 업로드는 서버 전용 AI Server moderation을 통과한 경우에만 GridFS에 저장한다.

## AI Server 이미지 Moderation

Doodle backend는 이미지 업로드 시 내부 AI Server Docker service의 `POST /ai/image/moderate`만 호출한다. Quiz 관련 AI Server 기능은 이 서비스에서 사용하지 않는다.

필요한 서버 환경변수 이름:

```txt
AI_SERVER_BASE_URL
AI_SERVER_API_KEY
AI_SERVER_TIMEOUT_SECONDS
```

`AI_SERVER_API_KEY` 값은 프론트엔드에 전달하지 않고, 로그/문서/커밋에 남기지 않는다.

## Workspace 구조

```txt
apps/
  web/
  server/
packages/
  shared/
docs/
```

## 다음 구현 단계

다음 작은 작업은 `PHASE-05-SOCKET-ROOM-MEMBERSHIP-IMPLEMENTATION`이다. 구현 기준은 `docs/DATABASE_API_SOCKET.md`의 Socket Room Membership 구현 계획을 따른다.

핵심 경계:

- Socket 연결은 Firebase ID Token으로 인증한다.
- `join-room`은 HTTP join 이후 repository membership을 확인한다.
- `room-updated` payload는 `{ room: RoomDetail }`을 사용한다.
- `leave-room`은 MVP에서 MongoDB `rooms.participants`를 제거하지 않고 socket presence만 처리한다.

## Frontend Scaffold Update

`apps/web`은 이제 placeholder가 아니라 Vite + React + TypeScript 기반 앱으로 전환되었다.

- 로비, 방 생성/입장, 대기실, 이미지 업로드, 플레이 placeholder, 결과 갤러리 shell을 포함한다.
- 서버 REST API client가 추가되어 방/이미지/결과 API를 호출할 수 있다.
- Firebase Client SDK 로그인과 Socket.IO client 연결은 아직 다음 프론트 작업으로 남아 있다.
- 로컬 실행은 `corepack pnpm --filter @doodle/web dev`를 사용한다.
