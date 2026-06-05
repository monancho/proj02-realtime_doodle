# Realtime Doodle Relay

Realtime Doodle Relay는 여러 사용자가 각자 사진을 업로드하고, 서버가 무작위로 선택한 사진 위에 제한 시간 동안 함께 낙서하며 채팅한 뒤 결과 이미지를 저장하고 다운로드하는 웹 기반 협업 드로잉 릴레이 서비스다.

## 현재 상태

이 저장소는 Phase 0 scaffold 단계다. pnpm workspace, `apps/web`, `apps/server`, `packages/shared` 경계만 준비되어 있으며 Firebase Auth, Room, Upload, Socket feature는 아직 구현하지 않았다.

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

다음 작은 작업은 `PHASE-02-AUTH` 전 준비 검토다. 현재는 Express 서버 wiring, `GET /health` route, 서버 시작 전 환경변수 검증 구조가 준비되어 있다.
