# AI 전용 개발 명세서

## 문서 역할

이 문서는 Codex / AI Agent가 Realtime Doodle Relay를 구현, 검토, 테스트, 문서화할 때 따르는 상세 작업 규칙을 정의한다. 서비스 요구사항 자체는 `docs/REQUIREMENTS.md`, 기능 동작은 `docs/FUNCTIONAL_SPECIFICATION.md`, 계약은 `docs/DATABASE_API_SOCKET.md`를 기준으로 한다.

## 기본 원칙

1. 문서 우선: 구현 전에 `AGENTS.md`와 `docs/DOCUMENT_INDEX.md`의 읽기 순서를 따른다.
2. 작은 단위 작업: 한 번에 하나의 feature slice만 구현한다.
3. 공유 계약 우선: API, Socket, domain type은 `packages/shared`에 먼저 정의한다.
4. 검증 없는 완료 금지: 가능한 범위에서 요청된 검증 명령을 실행한다.
5. 문서 동기화: API, Socket, DB, env, deployment, UI flow 변경 시 관련 문서를 함께 갱신한다.
6. 비밀정보 보호: secret, private key, token, URI를 출력하거나 커밋하지 않는다.
7. MVP 유지: 제외 범위 기능은 명시 요청 없이 구현하지 않는다.

## 작업 절차

상세 절차는 `docs/workflows/AGENT_WORKFLOW.md`를 따른다. Agent별 책임은 `docs/workflows/AGENT_ROLES.md`를 따른다. 작업 요청 형식은 `docs/workflows/AI_TASK_TEMPLATE.md`를 사용한다.

## 변경별 문서 갱신 기준

| 변경 | 갱신 문서 |
|---|---|
| API 추가/변경 | `docs/DATABASE_API_SOCKET.md`, `docs/ACCEPTANCE_CRITERIA.md`, `packages/shared` |
| Socket 이벤트 추가/변경 | `docs/DATABASE_API_SOCKET.md`, `docs/TESTING.md`, `packages/shared` |
| DB schema 변경 | `docs/DATABASE_API_SOCKET.md`, `docs/development/IMPLEMENTATION_NOTES.md` |
| 환경변수 추가/변경 | `.env.example`, README, `docs/DEPLOYMENT_OPERATION.md` |
| 배포 방식 변경 | `docs/DEPLOYMENT_OPERATION.md`, CI 문서 또는 workflow |
| UI flow 변경 | `docs/USER_FLOW.md`, `docs/design/DESIGN_SYSTEM_WIREFRAME.md` |
| 테스트 결과 | `docs/development/TEST_REPORT.md` |
| AI 작업 기록 | `docs/development/AI_ASSISTED_DEVELOPMENT_LOG.md` |

## 금지 행동

- `.env` 또는 service account key 생성/출력/커밋
- Firebase private key, MongoDB URI, deploy hook URL 로그 출력
- 인증 없는 API 또는 Socket 접근 추가
- DB 초기화/삭제 코드 임의 추가
- Render 로컬 파일 시스템에 영구 데이터 저장
- 테스트 실패를 숨기고 완료 처리
- 대형 라이브러리 또는 새 외부 서비스 임의 추가
- MVP 외 기능 몰래 추가
- 기존 문서와 충돌하는 구현을 설명 없이 진행
- 의미 없는 대규모 리팩터링
- Socket 이벤트 이름을 문서/공유 타입과 다르게 구현

## 사용자 확인이 필요한 상황

- 기술 스택 변경
- DB schema 큰 변경
- API path 변경
- Socket event 이름 변경
- 배포 플랫폼 변경
- 새 외부 서비스 추가
- 결제, 랭킹, 투표 등 MVP 외 기능 추가
- 보안 정책 완화
- UI 컨셉 변경
- 큰 의존성 추가

## Definition of Done

- 요구사항과 수용 기준이 연결되어 있다.
- TypeScript 타입 에러가 없다.
- 관련 테스트가 추가 또는 갱신되었다.
- 가능한 검증 명령을 실행했다.
- 실패한 검증은 원인과 후속 조치를 기록했다.
- API/Socket/DB/env 변경이 문서에 반영되었다.
- 비밀정보가 코드, 로그, 문서에 포함되지 않았다.
- MVP 범위를 벗어난 기능이 추가되지 않았다.

## 완료 보고 포맷

```md
## 완료 요약
- 목표:
- 수행 내용:
- 변경 파일:

## 검증 결과
- 실행 명령:
- 성공:
- 실패:
- 미실행 사유:

## 문서 갱신
- 갱신한 문서:
- 미갱신 사유:

## 충돌 / 누락 / 리스크
- 충돌:
- 누락:
- 리스크:

## 다음 작업
- 추천 작업:
```
