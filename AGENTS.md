# AGENTS.md

## 프로젝트 원칙

**Realtime Doodle Relay**는 Firebase 인증, 방 생성/입장, 사진 업로드, 랜덤 라운드, 실시간 공동 드로잉, 채팅, 결과 저장/다운로드를 제공하는 웹 기반 협업 낙서 릴레이 서비스다.

## 최상위 규칙

- TypeScript와 pnpm workspaces를 사용한다.
- `apps/web`, `apps/server`, `packages/shared`, `docs`의 책임을 분리한다.
- `.env`, Firebase Admin private key, service account, MongoDB URI, token, deploy hook URL 등 비밀정보를 생성, 출력, 커밋하지 않는다.
- Render 로컬 파일 시스템에 업로드 이미지나 결과 이미지를 영구 저장하지 않는다.
- 원본 이미지와 결과 이미지 바이너리는 MongoDB GridFS에 저장한다.
- API와 Socket 연결은 Firebase ID Token을 검증해야 한다.
- 드로잉 이벤트는 stroke 단위 또는 throttle된 batch 단위로 전송한다.
- MVP 범위를 유지한다. 랭킹, 투표, 결제, 관리자 페이지, 모바일 앱, Redis scaling, 영구 채팅 아카이브, 고급 이미지 편집은 명시 요청 없이 구현하지 않는다.

## 작업 전 읽기 순서

1. `docs/DOCUMENT_INDEX.md`
2. `docs/development/AI_ASSISTED_DEVELOPMENT.md`
3. `docs/REQUIREMENTS.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DATABASE_API_SOCKET.md`
6. `docs/ACCEPTANCE_CRITERIA.md`
7. `docs/TESTING.md`
8. `packages/shared/src/*`가 존재하면 확인

문서가 없으면 실패하지 말고 누락으로 보고한다.

## 완료 보고

모든 작업은 변경 파일, 실행한 검증 명령, 실패/미실행 사유, 충돌/누락/리스크를 요약한다.
작업 종료 시 다음 작업이 무엇인지와 바로 붙여 넣어 사용할 수 있는 추천 프롬프트를 한국어 설명과 함께 제공한다.
다음 작업 추천 프롬프트는 `docs/workflows/AI_TASK_TEMPLATE.md`의 `AI Task Spec` 형식을 참조해 작성한다.
다른 환경에서 이어받을 수 있도록 필요한 작업 기록은 `docs/development/AI_ASSISTED_DEVELOPMENT_LOG.md`에 남긴다.
상세 AI 작업 규칙은 `docs/development/AI_ASSISTED_DEVELOPMENT.md`를 따른다.

## User Action Required

- AI는 `.env`, private key, token, credential 값을 만들거나 채우지 않는다.
- 실제 외부 서비스 생성, Firebase Admin key 발급, MongoDB Atlas URI 생성, 배포 secret 등록은 사용자가 직접 수행한다.
- 작업 중 사용자 행동이 필요하면 AI는 사용자가 해야 할 일, 필요한 이유, 주의할 secret/보안 사항, 완료 후 이어서 붙여 넣을 다음 프롬프트를 함께 제공한다.
- 사용자의 외부 작업이 완료되기 전에는 해당 secret이나 외부 리소스에 의존하는 구현/검증을 진행하지 않는다.

## Git / Commit / Push

- 작업이 완료되면 변경 범위를 확인한 뒤 적절한 단위로 commit한다.
- commit 전에는 `git status --short`로 변경 범위를 확인한다.
- secret, `.env`, key, token, credential, deploy hook URL이 포함되지 않았는지 확인한다.
- 요청된 검증 명령을 실행하거나 미실행 사유를 기록한다.
- commit message는 영어로 작성한다.
- push가 필요한 상황이라고 판단되면 먼저 사용자에게 push 대상 branch와 이유를 한국어로 설명하고 확인을 받은 뒤 수행한다.
- `git reset --hard`, `git checkout --`, force push, rebase, amend는 명시 요청 없이는 하지 않는다.
- 사용자 변경으로 보이는 파일은 임의로 되돌리지 않는다.
