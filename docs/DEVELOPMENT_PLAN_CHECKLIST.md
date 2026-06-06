# 개발 계획 및 체크리스트

## MVP 개발 단계

| Phase | 작업 | 완료 기준 |
|---:|---|---|
| 0 | 프로젝트 초기 세팅 | pnpm workspace, web/server/shared, env example, CI 초안 |
| 1 | Health check와 env validation | `/health`, 필수 환경변수 검증 |
| 2 | Firebase Auth | Google 로그인/로그아웃, API token 전달 |
| 3 | User upsert | `POST /api/users/me`, Firebase uid 기반 사용자 저장 |
| 4 | Room create/join | roomCode 기반 방 생성/조회/입장 |
| 5 | Socket auth/participant | Socket 인증, `join-room`, `room-updated` |
| 6 | Chat | `send-message`, `receive-message` 동작 |
| 7 | Image upload/GridFS | 파일 검증, GridFS 저장, `images` metadata 저장 |
| 8 | Random round start | 미사용 이미지 랜덤 선택, `round-started` 전송 |
| 9 | Canvas drawing sync | 로컬 드로잉과 실시간 stroke 반영 |
| 10 | Timer/round end | 타이머 종료, 드로잉 차단, `round-ended` |
| 11 | Result save | 합성 이미지 저장과 `results` 생성 |
| 12 | Gallery/download | 결과 조회와 다운로드 |
| 12.5 | Local E2E UX QA Polish | 2인 로컬 플레이 기준 ready/start/result/download UX 마찰 점검과 최소 수정 |
| 13 | CI/CD and deploy | Render 및 프론트 배포 URL에서 동작 확인 |
| 14 | Final QA | 수동 E2E 점검, `TEST_REPORT.md` 작성 |

## 우선순위

| 우선순위 | 기능 |
|---|---|
| P0 | 로그인, 방 생성/입장, Socket 연결, 채팅, 이미지 업로드, 드로잉 동기화 |
| P1 | 라운드 타이머, 결과 저장, 결과 갤러리, 다운로드 |
| P2 | 디자인 디테일, 업로드 진행률, 채팅 최근 메시지 복원 |
| P3 | Undo/Redo, 투표, 랭킹, 모바일 최적화, 이미지 리사이징 |

P3 항목은 MVP 제외 또는 후순위이며 명시 요청 없이 구현하지 않는다.

## Frontend 개발 단계

백엔드 MVP Phase는 서버 기능의 구현 순서를 기준으로 유지한다. 프론트엔드는 백엔드 계약을 소비하는 별도 작업 흐름으로 관리하며, 추천 프롬프트는 아래 `PHASE-FE-*` 번호를 우선 참조한다.

| Phase | 작업 | 완료 기준 |
|---:|---|---|
| FE-01 | Web scaffold | Vite, React, TypeScript 앱 entry, 기본 layout, REST API client shell |
| FE-02 | Firebase Auth Client | Firebase Client SDK 로그인, ID Token 발급/갱신, `POST /api/users/me` 연동 |
| FE-03 | Lobby and Room Flow | 방 생성/입장, room detail 조회, 참가자/업로드 상태 표시 |
| FE-04 | Image Upload and Gallery | 이미지 업로드 UI, image metadata 목록, result gallery/download UI |
| FE-05 | Socket Room and Chat | Socket auth, `join-room`/`leave-room`, `room-updated`, chat 송수신 UI |
| FE-06 | Canvas Drawing | round image 표시, drawing tool, `draw-stroke` 송수신, local canvas 반영 |
| FE-07 | Round Timer UX | `round-started`, timer 표시, `round-ended`, `game-finished` 상태 전환 |
| FE-08 | Frontend QA and Polish | 주요 user flow 수동 점검, responsive layout, 접근성/오류 상태 정리 |

현재 완료된 프론트 작업:

- `FE-01 Web scaffold`: 완료. `apps/web`은 Vite + React + TypeScript 기반 앱으로 전환되었고 REST API client shell을 포함한다.
- `FE-02 Firebase Auth Client`: 완료. Firebase Client SDK 로그인, ID Token 발급/갱신, `/api/users/me` 연동을 포함한다.
- `FE-03 Lobby and Room Flow`: 완료. 로그인 기반 방 생성/입장, room detail refresh, 참가자/이미지 상태 UX를 정리했다.
- `FE-04 Image Upload and Gallery`: 완료. 이미지 업로드 사전 검증, 업로드 후 목록 refresh, 결과 갤러리/download UX를 정리했다.
- `FE-05 Socket Room and Chat`: 완료. Socket auth, `join-room`/`leave-room`, `room-updated`, chat 송수신 UI를 구현했다.
- `FE-06 Canvas Drawing`: 완료. Canvas drawing surface, pointer stroke 입력, `draw-stroke` 송수신, local canvas 반영을 구현했다.
- `FE-07 Round Timer UX`: 완료. `round-started`, countdown, `round-ended`, `game-finished` 기반 상태 전환을 구현했다.
- `FE-08 Frontend QA and Polish`: 완료. 주요 flow 점검 기준, responsive/accessibility/error/loading polish와 build warning 정리를 수행했다.

프론트 작업 원칙:

- Firebase Admin SDK, MongoDB, GridFS에 직접 접근하지 않고 서버 API와 Socket 계약만 사용한다.
- `.env`, Firebase private key, token, MongoDB URI를 출력하거나 커밋하지 않는다.
- 브라우저에 노출되는 환경변수는 `VITE_` prefix만 사용한다.
- Socket event 이름과 payload는 `docs/DATABASE_API_SOCKET.md` 및 `packages/shared` 계약을 따른다.
- 백엔드 기능을 새로 구현하지 않고 필요한 경우 별도 backend task로 분리한다.
