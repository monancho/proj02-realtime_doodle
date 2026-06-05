# AI Assisted Development Log

## 기록 원칙

- 작업이 끝나면 목표, 변경 문서, 검증 결과, 다음 작업 추천 프롬프트를 기록한다.
- 다른 환경에서 이어받을 수 있도록 미완료 항목, 충돌, 누락, 리스크를 함께 적는다.
- secret, token, private key, URI 값은 기록하지 않는다.

## 작업 로그

### 2026-06-05 PHASE-00-DOCS-REFACTOR

- Agent: `docs-maintainer`
- 목표: 앱 개발 시작 전 reference 명세서, 기존 AI 문서, wireframe 이미지를 기반으로 Markdown 기준 문서 구조를 정리.
- 수행 내용:
  - `AGENTS.md`를 짧은 최상위 규칙 문서로 정리.
  - 요구사항, 기능 명세, 아키텍처, DB/API/Socket, 유저 플로우, 배포/운영, 개발 계획, 수용 기준, 테스트, 리뷰, 디자인 문서를 분리 생성.
  - Agent 역할과 workflow를 `docs/workflows/AGENT_ROLES.md`, `docs/workflows/AGENT_WORKFLOW.md`로 분리.
  - 최소 `.codex` config와 agent draft를 생성.
- 검증:
  - 실행: `git status --short`
  - 미실행: 문서 정리 작업이므로 lint, typecheck, test, build는 실행하지 않음.
- 충돌/주의:
  - reference 배포 문서는 `npm install` 예시가 있으나 프로젝트 원칙은 pnpm workspaces이므로 문서에는 pnpm 우선으로 정리.
  - reference API와 기존 AI 문서의 endpoint 목록이 일부 달라 MVP 흐름에 필요한 API를 기준 문서에 통합.
  - `git status --short`에 `D README`가 표시됨. 이번 작업에서는 `README.md`만 생성했으며 확장자 없는 `README`는 작업 범위에서 수정하지 않음.
- 다음 추천 작업:
  - `PHASE-00-PROJECT-SCAFFOLD`
  - pnpm workspace, `apps/web`, `apps/server`, `packages/shared` 기본 구조 생성.
  - Firebase Auth, Room, Upload, Socket feature는 아직 구현하지 않음.

### 2026-06-05 GIT-RULES-UPDATE

- 목표: 작업 종료 후 다음 추천 프롬프트 제공 규칙과 commit/push 운영 규칙을 명확히 문서화.
- 수행 내용:
  - `AGENTS.md`에 Git / Commit / Push 최상위 규칙 추가.
  - `docs/workflows/AGENT_WORKFLOW.md`에 commit/push 단계 추가.
  - 작업 handoff를 위해 이 로그에 현재 변경 내용을 기록.
- 검증 예정:
  - `git status --short`
- 다음 조치:
  - 사용자 요청에 따라 변경사항 commit 후 `main` branch를 `origin`에 push.
