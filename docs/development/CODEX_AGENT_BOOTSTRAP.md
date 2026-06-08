# Codex Agent Bootstrap

작성일: 2026-06-08

## 목적

이 문서는 새 채팅 또는 새 Codex 에이전트가 긴 기존 대화 맥락 없이 Realtime Doodle Relay 제품화 작업을 안전하게 이어받기 위한 시작 가이드다.

## 시작 시 읽기 순서

1. `AGENTS.md`
2. `docs/development/PRODUCTIZATION_ROADMAP.md`
3. `docs/development/CODEX_AGENT_BOOTSTRAP.md`
4. `docs/development/PRE_DEPLOYMENT_READINESS_AUDIT.md`
5. `docs/development/TROUBLESHOOTING.md`
6. `docs/development/TEST_REPORT.md`
7. `docs/development/AI_ASSISTED_DEVELOPMENT_LOG.md`
8. 작업 영역에 따라 `docs/ARCHITECTURE.md`, `docs/DATABASE_API_SOCKET.md`, `docs/TESTING.md`

`.env` 파일과 `.codex/*.log` 파일은 secret이 섞여 있을 수 있으므로 내용을 출력하지 않는다. 로그 파일은 존재 여부와 파일 크기 정도만 확인한다.

## 브랜치 운영 원칙

- `deploy/round-transition-test`는 MVP/속도 비교용 테스트 브랜치로 유지한다.
- 제품화 작업은 `main` 기반의 별도 브랜치에서 진행한다.
- 현재 제품화 문서화 브랜치 예시는 `docs/productization-roadmap`이다.
- 구현 작업은 목적이 드러나는 새 브랜치에서 진행한다.
  - 예: `feat/round-gallery-preview-stabilization`
  - 예: `infra/cloudflare-frontend-plan`
- push, deploy, 외부 서비스 생성은 사용자 확인 없이 수행하지 않는다.

## 제품화 우선순위

`docs/development/PRODUCTIZATION_ROADMAP.md`의 `Productization Execution Order`를 따른다.

1. Oracle/Render backend와 Cloudflare Pages frontend 운영 구조 결정
2. Cloudflare Pages frontend 분리와 backend public URL 계획
3. Oracle 또는 Render backend 운영 결정
4. 배포 환경 health/login/API/Socket smoke QA
5. 실제 배포 환경 2인/4인/관전자 E2E QA
6. 라운드 종료/갤러리 안정화
7. 이미지 preload/cache/local preview
8. GridFS cleanup과 서버 authoritative result 안정화
9. Socket.IO presence lifecycle cleanup과 운영 로그/health/error 추적
10. secret 회전

로컬 QA 통과만으로 제품화 완료를 판단하지 않는다. 사용자가 확인한 주요 문제는 배포 환경에서 나타나는 경우가 많으므로, 지금은 UX polish보다 실제 서비스가 정상 구동 가능한 배포 인프라를 먼저 확정한다.

secret 회전은 모든 기능, 배포, QA 작업이 끝난 뒤 사용자가 직접 수행한다.

## 절대 금지

- `.env` 파일을 읽거나 출력하지 않는다.
- Firebase private key, MongoDB URI, token, credential, deploy hook URL 값을 만들거나 채우거나 출력하거나 커밋하지 않는다.
- `package-lock.json`을 수정, 삭제, stage, commit하지 않는다.
- 자동 push 또는 자동 deploy를 수행하지 않는다.
- Render, Cloudflare, Oracle, Firebase, MongoDB 외부 리소스를 사용자 확인 없이 생성하거나 변경하지 않는다.
- `.codex/server-local.log`, `.codex/web-dev.log` 같은 로그의 원문 내용을 출력하지 않는다.

## 작업 전 체크리스트

1. `git status --short --branch`로 현재 브랜치와 변경 범위를 확인한다.
2. `package-lock.json`이 미추적 또는 변경 상태여도 사용자 요청 없이는 건드리지 않는다.
3. 작업이 문서인지, frontend인지, backend인지, infra인지 구분한다.
4. 제품화 작업이면 `PRODUCTIZATION_ROADMAP.md`와 이 문서를 먼저 읽는다.
5. 사용자 변경으로 보이는 파일은 되돌리지 않는다.
6. 기능 코드 변경 전에는 영향 범위를 짧게 설명한다.

## 작업 후 체크리스트

1. 요청된 validation command를 실행한다.
2. 실행하지 못한 검증은 이유를 기록한다.
3. `git status --short`로 변경 파일을 확인한다.
4. secret 패턴이 diff에 포함되지 않았는지 확인한다.
5. `package-lock.json`이 stage되지 않았는지 확인한다.
6. 필요한 경우 `TEST_REPORT.md`와 `AI_ASSISTED_DEVELOPMENT_LOG.md`를 갱신한다.
7. 적절한 영어 commit message로 commit한다.
8. push는 사용자 확인 전까지 하지 않는다.

## AGENTS.md와 .codex 우선순위

- 보안, secret, push/deploy, 사용자 직접 작업 관련 충돌이 있으면 `AGENTS.md`를 우선한다.
- 제품화 우선순위 관련 충돌이 있으면 `docs/development/PRODUCTIZATION_ROADMAP.md`를 우선한다.
- `.codex` 설정은 에이전트 시작 문서와 scope 안내용이며, 보안 규칙을 완화하는 근거로 사용하지 않는다.

## 새 채팅용 시작 프롬프트

```md
# AI Task Spec

## Task ID
PHASE-INFRA-SERVICE-DEPLOYMENT-STRUCTURE-DECISION

## Agent
architect

## Goal
Oracle Cloud, Cloudflare Pages, Render 중 Realtime Doodle Relay가 실제 서비스로 정상 구동 가능한 배포 구조를 먼저 결정하고 전환 체크리스트를 작성한다.

## Current Context
- `deploy/round-transition-test`는 MVP/속도 비교용 테스트 브랜치로 유지한다.
- 제품화 작업은 `main` 기반 별도 브랜치에서 진행한다.
- 먼저 `AGENTS.md`, `docs/development/PRODUCTIZATION_ROADMAP.md`, `docs/development/CODEX_AGENT_BOOTSTRAP.md`를 읽는다.
- 로컬 1인/2인 QA는 주요 기능 기준으로 통과했지만, 사용자가 확인한 주요 문제는 배포 환경에서 나타났다.
- 지금 최우선순위는 라운드 UX polish보다 실제 서비스가 정상 구동 가능한 배포 인프라 결정이다.
- `.env`, token, private key, MongoDB URI, credential 값은 절대 읽거나 출력하지 않는다.
- `package-lock.json`은 수정/삭제/commit하지 않는다.

## Requirements
1. 앱 기능 코드는 수정하지 않는다.
2. 외부 서비스 생성, push, deploy는 하지 않는다.
3. 환경변수는 이름과 목적만 정리하고 값을 기록하지 않는다.
4. Cloudflare Pages frontend + Oracle backend, Cloudflare Pages frontend + Render backend, Render single Web Service 구조를 비교한다.
5. 각 구조별 Firebase authorized domain, CORS, Socket URL, API base URL, SPA fallback, MongoDB 접근, rollback 기준을 정리한다.
6. 사용자가 직접 해야 할 외부 작업과 secret 주의사항을 구분한다.
7. 다음 실행 작업 프롬프트를 `AI Task Spec` 형식으로 작성한다.
8. 변경사항은 검증 후 commit한다.
9. push는 하지 않는다.

## Validation Commands
git status --short
```

## 다음 작업 프롬프트 작성 규칙

- `docs/workflows/AI_TASK_TEMPLATE.md`의 `AI Task Spec` 형식을 따른다.
- Task ID는 `PHASE-영역-작업명` 형태로 명확히 쓴다.
- `Requirements`에는 secret 금지, `package-lock.json` 금지, push 금지를 포함한다.
- 제품화 작업은 현재 우선순위와 선행 조건을 명시한다.
- validation command와 acceptance criteria를 포함한다.
