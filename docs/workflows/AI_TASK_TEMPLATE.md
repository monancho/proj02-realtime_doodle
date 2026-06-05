# AI Task Spec Template

## Task ID

PHASE-XX-NAME

예시:

```txt
PHASE-00-DOCS-REFACTOR
PHASE-00-PROJECT-SCAFFOLD
PHASE-01-HEALTH-ENV
PHASE-02-AUTH
```

---

## Agent

다음 중 하나를 선택한다.

```txt
architect
backend
frontend
qa-reviewer
docs-maintainer
```

역할 기준:

* `architect`: 구조 설계, 문서 정합성, 기술 결정 검토
* `backend`: Express, Socket.IO, Firebase Admin, MongoDB, GridFS
* `frontend`: React, Canvas, Firebase Client, Socket.IO Client, UI
* `qa-reviewer`: 테스트, 보안, 회귀 검토
* `docs-maintainer`: 문서 정리, 로그, README, 체크리스트

---

## Goal

작업 목표를 한 문장으로 작성한다.

예시:

```txt
문서 레퍼런스를 기반으로 Markdown 기준 문서를 생성한다.
```

```txt
서버 health check와 환경변수 검증 구조만 구현한다.
```

---

## Context Docs

작업 전에 읽어야 하는 문서를 작성한다.

기본값:

```txt
AGENTS.md
docs/development/AI_ASSISTED_DEVELOPMENT.md
docs/workflows/AI_TASK_TEMPLATE.md
docs/REQUIREMENTS.md
docs/ARCHITECTURE.md
docs/DATABASE_API_SOCKET.md
docs/ACCEPTANCE_CRITERIA.md
docs/TESTING.md
packages/shared/src/*
```

문서 정리 작업이라면 추가한다.

```txt
docs/references/pdf/*.pdf
docs/references/docx/*.docx
docs/design/assets/realtime-doodle-wireframe-overview.png
```

일부 문서가 없을 수 있다면 다음 문장을 포함한다.

```txt
Some referenced documents may not exist yet. Do not fail because of missing docs. Report missing documents and continue with available context.
```

---

## Scope

### Allowed files

수정 허용 파일을 명확히 적는다.

예시:

```txt
AGENTS.md
README.md
.gitignore
docs/DOCUMENT_INDEX.md
docs/REQUIREMENTS.md
docs/ARCHITECTURE.md
docs/DATABASE_API_SOCKET.md
docs/development/AI_ASSISTED_DEVELOPMENT.md
docs/development/AI_ASSISTED_DEVELOPMENT_LOG.md
docs/development/IMPLEMENTATION_NOTES.md
docs/development/TEST_REPORT.md
docs/workflows/AGENT_WORKFLOW.md
docs/workflows/AGENT_ROLES.md
docs/design/DESIGN_SYSTEM_WIREFRAME.md
docs/design/UI_STYLE_GUIDE.md
```

### Forbidden files

수정 금지 파일을 명확히 적는다.

예시:

```txt
apps/**
packages/**
tests/**
.github/**
docs/references/**
docs/design/assets/**
.env
.env.*
*.key
*.pem
*.zip
*.pdf
*.docx
```

---

## Requirements

작업 요구사항을 구체적으로 작성한다.

예시:

```txt
1. 앱 코드를 구현하지 않는다.
2. PDF/DOCX는 수정하지 않고 읽기만 한다.
3. 레퍼런스 명세서에서 요구사항을 추출해 Markdown 문서로 정리한다.
4. AGENTS.md는 짧은 최상위 규칙 문서로 유지한다.
5. 상세 AI 작업 규칙은 docs/development/AI_ASSISTED_DEVELOPMENT.md에 둔다.
6. 문서는 한글로 작성한다.
7. 파일명, 경로, 코드 식별자, commit 예시는 영어를 사용한다.
```

---

## Acceptance Criteria

작업 완료 기준을 체크리스트로 작성한다.

예시:

```md
- [ ] 허용된 파일만 수정했다.
- [ ] 금지된 파일을 수정하지 않았다.
- [ ] Markdown 기준 문서가 생성되었다.
- [ ] PDF/DOCX/reference 파일은 수정하지 않았다.
- [ ] 문서별 역할이 분리되었다.
- [ ] 중복 규칙이 제거되었다.
- [ ] 누락 문서와 남은 리스크를 보고했다.
```

---

## Validation Commands

작업 후 실행할 명령을 작성한다.

문서 작업만 하는 경우:

```bash
git status --short
```

코드 작업이 포함되는 경우:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

부분 작업일 경우:

```bash
pnpm --filter @doodle/server test
pnpm --filter @doodle/server typecheck
pnpm --filter @doodle/web build
```

---

## Documentation Updates

문서 갱신 기준을 작성한다.

```md
- [ ] API 변경 시 `docs/DATABASE_API_SOCKET.md` 갱신
- [ ] Socket 이벤트 변경 시 shared type과 문서 갱신
- [ ] DB schema 변경 시 `docs/DATABASE_API_SOCKET.md`와 `IMPLEMENTATION_NOTES.md` 갱신
- [ ] env 변경 시 `.env.example`, README, `DEPLOYMENT_OPERATION.md` 갱신
- [ ] UI 흐름 변경 시 `USER_FLOW.md`, `DESIGN_SYSTEM_WIREFRAME.md` 갱신
- [ ] 테스트 결과는 `TEST_REPORT.md`에 기록
- [ ] AI 작업은 `AI_ASSISTED_DEVELOPMENT_LOG.md`에 기록
```

---

## Output Format

AI는 작업 완료 후 아래 형식으로 보고한다.

```md
## 완료 요약
- 목표:
- 구현 내용:
- 변경 파일:

## 검증 결과
- 실행 명령:
- 성공:
- 실패:
- 미실행 사유:

## 문서 갱신
- 갱신한 문서:
- 미갱신 사유:

## 로그 갱신
- 갱신한 로그:
- 미갱신 사유:

## 리스크 / 다음 작업
- 리스크:
- 사용자 확인 필요 사항:
- 다음 작업:
```

---

# Ready-to-use Task Example

## 문서 구조 정리 작업

````txt
# AI Task Spec

## Task ID
PHASE-00-DOCS-REFACTOR

## Agent
docs-maintainer

## Goal
레퍼런스 명세서와 기존 AI 문서를 기반으로 Markdown 기준 문서 구조를 정리한다.

## Context Docs
- AGENTS.md
- docs/development/AI_ASSISTED_DEVELOPMENT.md
- docs/workflows/AI_TASK_TEMPLATE.md
- docs/references/pdf/*.pdf
- docs/references/docx/*.docx
- docs/design/assets/realtime-doodle-wireframe-overview.png

Some referenced documents may not exist yet. Do not fail because of missing docs. Report missing documents and continue with available context.

## Scope

### Allowed files
- AGENTS.md
- README.md
- .gitignore
- docs/DOCUMENT_INDEX.md
- docs/REQUIREMENTS.md
- docs/FUNCTIONAL_SPECIFICATION.md
- docs/ARCHITECTURE.md
- docs/DATABASE_API_SOCKET.md
- docs/USER_FLOW.md
- docs/DEPLOYMENT_OPERATION.md
- docs/DEVELOPMENT_PLAN_CHECKLIST.md
- docs/ACCEPTANCE_CRITERIA.md
- docs/TESTING.md
- docs/REVIEW_CHECKLIST.md
- docs/development/AI_ASSISTED_DEVELOPMENT.md
- docs/development/AI_ASSISTED_DEVELOPMENT_LOG.md
- docs/development/IMPLEMENTATION_NOTES.md
- docs/development/TEST_REPORT.md
- docs/development/TROUBLESHOOTING.md
- docs/workflows/AI_TASK_TEMPLATE.md
- docs/workflows/AGENT_WORKFLOW.md
- docs/workflows/AGENT_ROLES.md
- docs/design/DESIGN_SYSTEM_WIREFRAME.md
- docs/design/UI_STYLE_GUIDE.md
- .codex/config.toml
- .codex/agents/architect.toml
- .codex/agents/backend.toml
- .codex/agents/frontend.toml
- .codex/agents/qa-reviewer.toml
- .codex/agents/docs-maintainer.toml

### Forbidden files
- apps/**
- packages/**
- tests/**
- .github/**
- docs/references/**
- docs/design/assets/**
- .env
- .env.*
- *.key
- *.pem
- *.zip
- *.pdf
- *.docx
- Any credential or secret file

## Requirements
1. 앱 코드를 구현하지 않는다.
2. 의존성을 설치하지 않는다.
3. 빌드 명령을 실행하지 않는다.
4. PDF/DOCX/image 파일은 수정하지 않는다.
5. references의 상세 명세서를 참고해 Markdown 기준 문서를 생성한다.
6. wireframe 이미지를 참고해 디자인 문서를 생성한다.
7. AGENTS.md는 짧은 최상위 규칙 파일로 유지한다.
8. AI 작업 상세 규칙은 docs/development/AI_ASSISTED_DEVELOPMENT.md에 정리한다.
9. Agent 역할은 docs/workflows/AGENT_ROLES.md에 정리한다.
10. Agent 작업 절차는 docs/workflows/AGENT_WORKFLOW.md에 정리한다.
11. 중복된 상세 규칙을 여러 문서에 반복하지 않는다.
12. 문서는 한글로 작성한다.
13. 파일명, 경로, 코드 식별자, branch, commit 예시는 영어로 작성한다.
14. 충돌 또는 누락 정보가 있으면 보고한다.

## Acceptance Criteria
- [ ] 허용된 파일만 수정했다.
- [ ] 금지된 파일을 수정하지 않았다.
- [ ] 앱 코드를 생성하지 않았다.
- [ ] Markdown 기준 문서가 생성되었다.
- [ ] reference artifact와 source-of-truth 문서의 관계가 DOCUMENT_INDEX.md에 정리되었다.
- [ ] 디자인 이미지가 디자인 문서에 연결되었다.
- [ ] 개발 로그 파일이 필요한 경우 생성되었다.
- [ ] 남은 리스크와 누락 정보를 보고했다.

## Validation Commands

```bash
git status --short
````

## Documentation Updates

* [ ] docs/DOCUMENT_INDEX.md 생성 또는 갱신
* [ ] docs/development/AI_ASSISTED_DEVELOPMENT.md 정리
* [ ] docs/workflows/AGENT_WORKFLOW.md 생성 또는 갱신
* [ ] docs/workflows/AGENT_ROLES.md 생성 또는 갱신
* [ ] docs/design/DESIGN_SYSTEM_WIREFRAME.md 생성 또는 갱신
* [ ] docs/design/UI_STYLE_GUIDE.md 생성 또는 갱신

## Output Format

```md
## 완료 요약
- 목표:
- 구현 내용:
- 변경 파일:

## 검증 결과
- 실행 명령:
- 성공:
- 실패:
- 미실행 사유:

## 문서 갱신
- 갱신한 문서:
- 미갱신 사유:

## 로그 갱신
- 갱신한 로그:
- 미갱신 사유:

## 리스크 / 다음 작업
- 리스크:
- 사용자 확인 필요 사항:
- 다음 작업:
```

```
```
