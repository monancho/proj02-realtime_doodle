# 개발 계획 및 체크리스트

## MVP 개발 단계

| Phase | 작업 | 완료 기준 |
|---:|---|---|
| 0 | 프로젝트 초기 세팅 | pnpm workspace, web/server/shared, env example, CI 초안 |
| 1 | Health check와 env validation | `/health`, 필수 환경변수 검증 |
| 2 | Firebase Auth | 회원가입/로그인/로그아웃, API token 전달 |
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
