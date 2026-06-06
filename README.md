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
