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

1. 라운드 종료/갤러리 안정화
2. 이미지 preload/cache/local preview
3. 서버 authoritative result 저장 안정화
4. GridFS cleanup/스토리지 정책
5. Socket.IO presence 기반 room lifecycle cleanup
6. Cloudflare Pages frontend 분리 계획
7. Render/Oracle backend 운영 결정
8. 실제 2인/4인/관전자 E2E QA
9. 운영 로그/health/error 추적
10. secret 회전

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
PHASE-FE-ROUND-END-GALLERY-PREVIEW-STABILIZATION

## Agent
frontend

## Goal
제품화 로드맵 1순위인 라운드 종료/갤러리 안정화를 진행하고, result 저장 지연이 있어도 사용자가 자연스럽게 preview와 다음 라운드 전환을 경험하도록 정리한다.

## Current Context
- `deploy/round-transition-test`는 MVP/속도 비교용 테스트 브랜치로 유지한다.
- 제품화 작업은 `main` 기반 별도 브랜치에서 진행한다.
- 먼저 `AGENTS.md`, `docs/development/PRODUCTIZATION_ROADMAP.md`, `docs/development/CODEX_AGENT_BOOTSTRAP.md`를 읽는다.
- `.env`, token, private key, MongoDB URI, credential 값은 절대 읽거나 출력하지 않는다.
- `package-lock.json`은 수정/삭제/commit하지 않는다.

## Requirements
1. 백엔드 계약은 변경하지 않는다.
2. 라운드 종료 시 플레이 화면은 유지하고 modal만 표시한다.
3. 서버 `result-saved`가 늦어도 local preview 또는 안정적인 placeholder를 먼저 보여준다.
4. 다음 라운드 전환 때 modal이 자연스럽게 닫히고 canvas/timer/toolbar 상태가 초기화되는지 확인한다.
5. 마지막 라운드 후 gallery 전환이 자연스럽게 이어지게 한다.
6. 이미지 preload/cache/local preview의 최소 구현 범위를 검토한다.
7. 변경사항은 검증 후 commit한다.
8. push는 하지 않는다.

## Validation Commands
corepack pnpm --filter @doodle/web typecheck
corepack pnpm --filter @doodle/web build
git status --short
```

## 다음 작업 프롬프트 작성 규칙

- `docs/workflows/AI_TASK_TEMPLATE.md`의 `AI Task Spec` 형식을 따른다.
- Task ID는 `PHASE-영역-작업명` 형태로 명확히 쓴다.
- `Requirements`에는 secret 금지, `package-lock.json` 금지, push 금지를 포함한다.
- 제품화 작업은 현재 우선순위와 선행 조건을 명시한다.
- validation command와 acceptance criteria를 포함한다.
