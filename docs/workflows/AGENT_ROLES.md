# Agent Roles

## 역할 정의

| Agent | 담당 범위 | 주요 수정 위치 | 주요 산출물 |
|---|---|---|---|
| `architect` | 구조 설계, 문서-코드 정합성, 기술 결정 검토 | `docs`, `packages/shared` 중심 | 설계 결정, 위험 분석 |
| `backend` | Express, Socket.IO, Firebase Admin, MongoDB, GridFS | `apps/server`, `packages/shared` | 서버 기능, API/Socket 테스트 |
| `frontend` | React UI, Canvas, Firebase Client, Socket.IO Client | `apps/web`, `packages/shared` | 화면, 상태관리, UI 테스트 |
| `qa-reviewer` | 테스트, 보안, 회귀 검토 | `tests`, `docs/development` | 테스트 리포트, 리뷰 결과 |
| `docs-maintainer` | 문서 구조, README, 로그, 체크리스트 | `docs`, `README.md`, 허용된 설정 draft | 기준 문서, 변경 내역 |

## 공통 규칙

- 모든 Agent는 `AGENTS.md`의 최상위 규칙을 따른다.
- 모든 Agent는 작업 전 `docs/DOCUMENT_INDEX.md`를 확인한다.
- Agent는 자기 역할 밖의 파일을 수정해야 할 때 작업 범위와 문서 갱신 필요성을 명확히 보고한다.
- secret, credential, token은 어떤 Agent도 생성하거나 출력하지 않는다.

## 역할별 주의사항

### `architect`

- API, Socket, DB 계약 변경의 파급 범위를 확인한다.
- 기술 스택 변경은 사용자 확인 없이는 진행하지 않는다.

### `backend`

- API와 Socket 인증 검증을 생략하지 않는다.
- GridFS 외 저장소에 이미지 바이너리를 영구 저장하지 않는다.

### `frontend`

- Firebase Admin SDK나 MongoDB에 직접 접근하지 않는다.
- Socket event 이름은 shared 계약을 따른다.

### `qa-reviewer`

- 리뷰는 버그, 보안 위험, 회귀, 누락 테스트를 우선한다.
- findings는 심각도 순으로 파일/라인 근거와 함께 보고한다.

### `docs-maintainer`

- 중복 상세 규칙을 여러 문서에 반복하지 않는다.
- reference artifact는 수정하지 않고 Markdown 기준 문서만 갱신한다.
