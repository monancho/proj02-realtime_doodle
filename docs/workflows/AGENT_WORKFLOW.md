# Agent Workflow

## 목적

AI Agent가 작업을 시작하고 완료할 때 따르는 표준 절차를 정의한다.

## Step 1. Context 확인

작업 시작 전 아래 문서를 읽는다.

```txt
AGENTS.md
docs/DOCUMENT_INDEX.md
docs/development/AI_ASSISTED_DEVELOPMENT.md
docs/REQUIREMENTS.md
docs/ARCHITECTURE.md
docs/DATABASE_API_SOCKET.md
docs/ACCEPTANCE_CRITERIA.md
docs/TESTING.md
packages/shared/src/*
```

없는 문서는 누락으로 보고하고 가능한 범위에서 계속 진행한다.

## Step 2. 범위 확인

수정 전에 다음을 정리한다.

```md
## 작업 범위
- 목표:
- 수정 예정 파일:
- 수정하지 않을 파일:
- 필요한 검증:
- 문서 갱신 필요 여부:
- 예상 위험:
```

## Step 3. 작업 수행

- 한 번에 하나의 feature slice만 처리한다.
- 불필요한 리팩터링을 같이 하지 않는다.
- 계약 변경은 shared type과 문서를 먼저 맞춘다.
- 의존성 추가는 사용자 승인 후 진행한다.
- forbidden file은 읽기 전용 reference가 아닌 이상 수정하지 않는다.

## Step 4. 검증

작업 요청에 명시된 검증 명령을 실행한다. 일반 구현 작업의 기본 검증은 다음과 같다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

문서 전용 작업은 요청에 따라 `git status --short`만 실행할 수 있다.

## Step 5. 문서 갱신

API, Socket, DB, env, deployment, UI flow, 테스트 결과가 바뀌면 `docs/development/AI_ASSISTED_DEVELOPMENT.md`의 문서 갱신 기준에 따라 관련 문서를 갱신한다.

## Step 6. 완료 보고

완료 보고에는 목표, 수행 내용, 변경 파일, 검증 결과, 미실행 사유, 충돌, 누락, 리스크, 다음 작업을 포함한다.

## Step 7. Commit / Push

작업이 완료되면 변경 범위를 확인한 뒤 적절한 단위로 commit한다. Push는 필요하다고 판단될 때 사용자 확인을 받은 뒤 수행한다.

1. `git status --short`로 변경 파일을 확인한다.
2. 금지 파일, secret, `.env`, key, token, credential, deploy hook URL이 포함되지 않았는지 확인한다.
3. 요청된 검증 명령을 실행했는지 확인하고, 미실행 항목은 사유를 기록한다.
4. commit message는 영어로 작성한다.
5. push가 필요한 상황이라고 판단되면 push 대상 branch와 이유를 한국어로 설명하고 사용자 확인을 받은 뒤 실행한다.
6. `git reset --hard`, `git checkout --`, force push, rebase, amend는 명시 요청 없이는 실행하지 않는다.
7. 사용자 변경으로 보이는 파일은 임의로 되돌리지 않는다.
