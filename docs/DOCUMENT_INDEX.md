# 문서 인덱스

## 목적

이 문서는 Realtime Doodle Relay의 Markdown 기준 문서 역할, 읽는 순서, reference artifact와 source-of-truth 관계를 정의한다.

## Source of Truth 우선순위

| 우선순위 | 문서 | 역할 |
|---:|---|---|
| 1 | `AGENTS.md` | 최상위 작업 규칙과 금지사항 |
| 2 | `docs/DOCUMENT_INDEX.md` | 문서 역할, 기준 문서 우선순위, reference mapping |
| 3 | `docs/REQUIREMENTS.md` | 서비스 목표, MVP 범위, 기능/비기능 요구사항 |
| 4 | `docs/FUNCTIONAL_SPECIFICATION.md` | 화면별 기능, 예외 처리, 게임 진행 규칙 |
| 5 | `docs/ARCHITECTURE.md` | 시스템 구조와 책임 분리 |
| 6 | `docs/DATABASE_API_SOCKET.md` | DB, REST API, Socket.IO 계약 |
| 7 | `docs/USER_FLOW.md` | 사용자 여정과 상태 전이 |
| 8 | `docs/design/*` | 와이어프레임과 UI 스타일 기준 |
| 9 | `docs/DEPLOYMENT_OPERATION.md` | 배포, 환경변수, 운영 규칙 |
| 10 | `docs/DEVELOPMENT_PLAN_CHECKLIST.md` | MVP 구현 순서와 체크리스트 |
| 11 | `docs/ACCEPTANCE_CRITERIA.md`, `docs/TESTING.md`, `docs/REVIEW_CHECKLIST.md` | 완료, 검증, 리뷰 기준 |
| 12 | `packages/shared/src/*` | 구현 이후 실제 타입 계약 |

충돌 시 상위 문서를 우선하되, 코드가 이미 존재하는 경우 차이를 보고하고 사용자 확인 후 정리한다.

## Reference Artifact Mapping

| Reference | Markdown 기준 문서 |
|---|---|
| `docs/references/docx/00_document_package_guide.docx`, `docs/references/pdf/00_document_package_guide.pdf` | `docs/DOCUMENT_INDEX.md`, `README.md` |
| `docs/references/docx/01_requirements_definition.docx`, `docs/references/pdf/01_requirements_definition.pdf` | `docs/REQUIREMENTS.md` |
| `docs/references/docx/02_functional_specification.docx`, `docs/references/pdf/02_functional_specification.pdf` | `docs/FUNCTIONAL_SPECIFICATION.md`, `docs/USER_FLOW.md` |
| `docs/references/docx/03_system_architecture_specification.docx`, `docs/references/pdf/03_system_architecture_specification.pdf` | `docs/ARCHITECTURE.md` |
| `docs/references/docx/04_database_api_socket_specification.docx`, `docs/references/pdf/04_database_api_socket_specification.pdf` | `docs/DATABASE_API_SOCKET.md` |
| `docs/references/docx/05_user_flow_specification.docx`, `docs/references/pdf/05_user_flow_specification.pdf` | `docs/USER_FLOW.md` |
| `docs/references/docx/06_design_system_wireframe.docx`, `docs/references/pdf/06_design_system_wireframe.pdf` | `docs/design/DESIGN_SYSTEM_WIREFRAME.md`, `docs/design/UI_STYLE_GUIDE.md` |
| `docs/references/docx/07_deployment_operation_specification.docx`, `docs/references/pdf/07_deployment_operation_specification.pdf` | `docs/DEPLOYMENT_OPERATION.md` |
| `docs/references/docx/08_development_plan_checklist.docx`, `docs/references/pdf/08_development_plan_checklist.pdf` | `docs/DEVELOPMENT_PLAN_CHECKLIST.md`, `docs/TESTING.md`, `docs/ACCEPTANCE_CRITERIA.md` |
| `docs/design/assets/realtime-doodle-wireframe-overview.png` | `docs/design/DESIGN_SYSTEM_WIREFRAME.md`, `docs/design/UI_STYLE_GUIDE.md`, `docs/USER_FLOW.md` |

## 문서 관리 규칙

- 상세 규칙은 한 문서에만 둔다. 다른 문서는 링크와 요약만 둔다.
- API, Socket, DB schema 변경은 `docs/DATABASE_API_SOCKET.md`와 `packages/shared`를 함께 갱신한다.
- 환경변수, 배포, CORS 변경은 `docs/DEPLOYMENT_OPERATION.md`와 README를 함께 갱신한다.
- UI flow 변경은 `docs/USER_FLOW.md`와 `docs/design/DESIGN_SYSTEM_WIREFRAME.md`를 함께 갱신한다.
- 테스트 결과는 `docs/development/TEST_REPORT.md`에 누적한다.

## 누락 입력

현재 reference PDF, DOCX, wireframe image는 모두 존재한다. `packages/shared/src/*`와 앱 코드는 아직 scaffold 전이라 존재하지 않을 수 있다.
