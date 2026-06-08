# Productization Roadmap

작성일: 2026-06-08

## 목적

MVP 이후 Realtime Doodle Relay를 실제 사용자 테스트와 운영 배포에 맞게 안정화하기 위한 제품화 로드맵이다. 이 문서는 새 기능 확장보다 안정성, 성능, 배포 구조, 보안, UX 복구성을 우선한다.

## 현재 기준

- MVP 기능은 Firebase 로그인, 닉네임 설정, 방 생성/입장, 이미지 업로드, 라운드 진행, 실시간 드로잉, 채팅, 결과 저장/다운로드까지 포함한다.
- 현재 배포 실험은 Render 단일 Web Service 구조와 테스트 브랜치 `deploy/round-transition-test`를 사용한다.
- 테스트 브랜치 `deploy/round-transition-test`의 목적은 라운드 종료 후 결과 저장을 기다리지 않고 다음 라운드 전환을 시작하는 방식의 체감 속도를 기존 버전과 비교하는 것이다.
- secret 회전은 오늘 작업의 마지막 단계에서 사용자가 직접 수행한다.

## 지금 바로 해야 할 것

1. 라운드 종료/갤러리 안정화
   - 라운드 종료 모달, 다음 라운드 전환, 마지막 갤러리 진입이 자연스럽게 이어지는지 실제 1인/2인 흐름으로 확인한다.
   - 결과 이미지 생성/저장 지연이 사용자 흐름을 막지 않도록 서버 저장과 클라이언트 preview 표시를 분리한다.

2. 이미지 preload/cache/local preview 전략
   - 게임 시작 시 원본 이미지를 클라이언트가 미리 받아두고, 라운드 종료 시 즉시 local preview를 보여준다.
   - 서버는 authoritative 저장소로 유지하고, 저장 완료 후 최종 result URL을 동기화한다.

3. 배포 구조 결정
   - 단기: Render 테스트 서비스로 `deploy/round-transition-test` 속도와 안정성을 비교한다.
   - 중기: frontend는 Cloudflare Pages, backend는 Render 또는 Oracle로 분리하는 구조를 검토한다.

4. Socket.IO presence 기반 room lifecycle cleanup
   - disconnect 즉시 삭제하지 않고 room status별 grace period를 둔다.
   - 모든 사용자가 나간 뒤 일정 시간 동안 재접속 기회를 주고, 이후 room/image/result/GridFS cleanup을 실행한다.

5. 실제 E2E QA
   - 최소 2인, 가능하면 4인 기준으로 로그인, 닉네임, 방 생성/입장, 업로드, 라운드 전환, 갤러리, 다운로드를 확인한다.
   - 4인 초과, 관전자, 재접속은 별도 체크 항목으로 둔다.

6. secret 회전
   - 모든 배포/성능/QA 작업이 끝난 뒤 사용자가 직접 수행한다.
   - AI는 secret 값을 만들거나 출력하거나 저장하지 않는다.

## 후속 개선

- Oracle backend 운영 또는 유료 Render plan으로 cold start와 CPU/RAM 병목을 줄인다.
- Cloudflare Pages로 frontend 정적 자산을 분리해 frontend 응답성을 높인다.
- 이미지 저장은 GridFS 유지 여부, 객체 스토리지 이전 여부, 썸네일 저장 여부를 비교한다.
- 운영 로그, health check, 에러 추적, cleanup dry-run을 추가한다.
- 장기적으로 Redis adapter나 durable queue는 사용자 규모가 커진 뒤 검토한다.

## 배포 구조 비교

| 구조 | 목적 | 장점 | 현재 리스크 | 검증 기준 |
| --- | --- | --- | --- | --- |
| 기존 Render 단일 배포 | MVP 빠른 운영 | backend/frontend 한 URL, CORS 단순 | 무료/저사양 cold start, 결과 생성 지연 | 로그인, 방 생성, 라운드 전환, 갤러리 |
| Render 테스트 배포 | 브랜치별 성능 비교 | 기존 배포를 유지한 채 속도 비교 | env/Firebase domain 분리 필요 | 기존 버전 대비 라운드 종료 체감 시간 |
| Cloudflare Pages + backend | frontend 응답성 개선 | 정적 자산 CDN, frontend 배포 빠름 | CORS, Socket URL, Firebase authorized domain 설정 필요 | 로그인 popup, API/Socket 연결, SPA fallback |
| Oracle backend | backend 성능/상시 실행 개선 | 더 안정적인 CPU/RAM, cold start 완화 | 서버 관리, 보안 패치, 배포 자동화 필요 | 부팅, health, Socket.IO, GridFS, cleanup |

## 작업 영역별 계획

| 영역 | 목적 | 현재 문제 | 추천 해결책 | 우선순위 | 선행 조건 | 검증 방법 |
| --- | --- | --- | --- | --- | --- | --- |
| 배포 구조 | 운영 가능한 배포 단순화 | Render 단일 서비스와 분리 배포 선택지가 섞임 | 테스트 브랜치로 Render 비교 후 Cloudflare/Oracle 방향 결정 | 높음 | 배포 URL, Firebase domain 등록 | health, 로그인, API, Socket |
| Cloudflare Pages frontend 분리 | frontend 응답 속도 개선 | Render backend 부하와 frontend serving이 묶임 | Vite build를 Cloudflare Pages에 배포하고 API/Socket은 backend URL 사용 | 중간 | backend public URL, env name 정리 | 로그인, CORS preflight, Socket 연결 |
| Render/Oracle backend 운영 | backend 안정성과 리소스 확보 | 무료/저사양 환경에서 이미지 처리 지연 가능 | 단기 Render test, 장기 Oracle 또는 유료 plan 검토 | 높음 | 서버 env 등록, Mongo/Firebase 접근 | 라운드 종료 시간, memory/CPU 로그 |
| 라운드 종료/갤러리 안정화 | 게임 흐름 끊김 감소 | 결과 저장 지연이 전환 UX를 흔듦 | round transition과 result save 분리, preview 우선 표시 | 최상 | 테스트 브랜치 배포 | 1인/2인 라운드->라운드, 라운드->갤러리 |
| 이미지 preload/cache/local preview | 체감 속도 개선 | 원본/결과 이미지 요청이 라운드 끝에 몰림 | 라운드 시작 전 preload, browser cache, local composed preview | 높음 | 클라이언트 이미지 상태 설계 | 네트워크 waterfall, preview 표시 시간 |
| GridFS cleanup/스토리지 정책 | DB 용량과 비용 관리 | 게임 종료 후 파일을 오래 보관할 필요가 낮음 | finished/empty room에 grace period와 retention을 적용해 삭제 | 높음 | room lifecycle 기준 | cleanup count, raw id 미출력 로그 |
| Socket.IO presence lifecycle cleanup | 방 생명 주기 관리 | disconnect만으로 삭제하면 재접속/일시 끊김이 위험 | status별 grace period: waiting은 짧게, playing은 길게 | 높음 | socket participant tracking | disconnect/reconnect 시나리오 |
| 보안/secret 회전 | 노출 리스크 회수 | 개발 중 secret 노출 가능성이 있었음 | 모든 작업 종료 후 사용자가 Firebase/Mongo/Render secret 회전 | 최상, 마지막 | 배포 안정화 완료 | 기존 secret 폐기, 새 env 동작 확인 |
| 성능 최적화 | 저사양 서버 병목 완화 | 이미지 합성/전송/저장이 느릴 수 있음 | client preview, async save, 이미지 크기 제한, 썸네일 | 높음 | 병목 측정 | 라운드 종료 p95, upload size |
| 실제 2인/4인 E2E QA | 제품 품질 확인 | 4인/관전자/재접속 확인이 부족 | 계정/브라우저 분리로 시나리오 매트릭스 실행 | 높음 | 테스트 계정, 배포 URL | QA 체크리스트 완료 |

## Socket.IO Presence 기반 Lifecycle 원칙

- "생명주기"라는 표현은 room lifecycle 또는 room/session lifecycle로 사용해도 적절하다.
- Socket disconnect는 네트워크 불안정, 새로고침, 탭 전환 때문에 즉시 삭제 신호로 보지 않는다.
- `waiting` room은 모든 non-spectator가 나간 뒤 짧은 grace period 후 삭제 후보로 둔다.
- `starting`/`playing` room은 재접속 가능성을 고려해 더 긴 grace period를 둔다.
- `finished` room은 갤러리 확인/다운로드 시간을 보장한 뒤 retention 또는 expiresAt 기준으로 정리한다.
- cleanup은 raw ObjectId, fileId, URI, token, secret 값을 로그에 출력하지 않고 count 중심으로 기록한다.

## 이미지 최적화 원칙

- 클라이언트는 빠른 UX를 위해 원본 이미지 preload, browser cache, local preview를 사용한다.
- 서버는 authoritative 저장소 역할을 유지한다.
- 서버 저장 결과와 클라이언트 preview가 다를 수 있으므로, 최종 gallery/download는 서버 저장 완료 결과를 기준으로 동기화한다.
- 서버가 이미지를 못 찾거나 hash/metadata가 맞지 않으면 fallback으로 서버 저장본을 다시 내려주거나 result save를 재시도한다.
- MVP 이후에는 업로드 전 리사이즈/압축, 썸네일, 이미지 크기 제한을 추가로 검토한다.

## 사용자 직접 작업

- Render/Cloudflare/Oracle 서비스 생성과 환경변수 등록.
- Firebase Authentication authorized domain 추가.
- MongoDB Atlas 접근 정책과 테스트 DB 분리.
- 테스트 계정 준비와 실제 2인/4인 수동 QA.
- 모든 작업 마지막에 Firebase Admin key, MongoDB credential, 배포 secret 회전.
- secret 값은 문서, 로그, 코드, 커밋에 기록하지 않는다.

## 다음 구현 프롬프트 후보

### Backend

```md
# AI Task Spec

## Task ID
PHASE-BE-SOCKET-PRESENCE-LIFECYCLE-CLEANUP

## Agent
backend

## Goal
Socket.IO presence를 기준으로 room lifecycle cleanup 정책을 구현한다.

## Requirements
1. disconnect 즉시 room을 삭제하지 않는다.
2. waiting/playing/finished 상태별 grace period를 둔다.
3. 모든 participant가 떠난 room만 cleanup 후보로 둔다.
4. cleanup log에는 secret, URI, raw fileId/ObjectId를 출력하지 않는다.
5. mock/in-memory 테스트를 추가한다.
6. push는 하지 않는다.
```

### Frontend

```md
# AI Task Spec

## Task ID
PHASE-FE-IMAGE-PRELOAD-LOCAL-RESULT-PREVIEW

## Agent
frontend

## Goal
라운드 시작 전 원본 이미지를 preload하고, 라운드 종료 시 local preview를 즉시 표시해 체감 지연을 줄인다.

## Requirements
1. 백엔드 계약은 변경하지 않는다.
2. 서버 result-saved가 늦어도 round-ended 모달 preview가 자연스럽게 보이게 한다.
3. 최종 gallery/download는 서버 저장 완료 결과와 동기화한다.
4. 이미지 불일치/누락 fallback을 사용자에게 과하게 노출하지 않는다.
5. push는 하지 않는다.
```

### Infra

```md
# AI Task Spec

## Task ID
PHASE-INFRA-CLOUDFLARE-FRONTEND-SPLIT-PLAN

## Agent
infra

## Goal
Cloudflare Pages frontend와 Render/Oracle backend 분리 배포 절차를 문서화한다.

## Requirements
1. 구현 코드는 작성하지 않는다.
2. 환경변수는 이름과 목적만 정리하고 값을 기록하지 않는다.
3. CORS, Socket URL, Firebase authorized domain 체크리스트를 작성한다.
4. 기존 Render 단일 배포와 rollback 기준을 정리한다.
5. push는 하지 않는다.
```

### QA

```md
# AI Task Spec

## Task ID
PHASE-QA-PRODUCTIZATION-E2E-MATRIX

## Agent
qa

## Goal
제품화 전 1인/2인/4인/관전자/재접속 수동 QA 매트릭스를 작성하고 실행 결과를 기록한다.

## Requirements
1. 앱 기능 코드는 수정하지 않는다.
2. 로그인, 닉네임, 방 입장, 업로드, 라운드 전환, 갤러리, 다운로드를 확인한다.
3. 확인 불가 항목은 이유와 다음 조건을 문서화한다.
4. secret 값은 출력하지 않는다.
5. push는 하지 않는다.
```

## Productization Execution Order

제품화 작업은 아래 순서를 기본으로 진행한다. 앞 단계의 안정화가 끝나기 전에는 배포 구조 변경이나 secret 회전처럼 되돌리기 어려운 작업을 먼저 진행하지 않는다.

| 순서 | Phase | 작업명 | 목적 | 선행 조건 | 완료 기준 | 추천 담당 agent |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Stabilization | 라운드 종료/갤러리 안정화 | 라운드 종료 후 다음 라운드 또는 최종 갤러리로 넘어가는 흐름을 끊기지 않게 만든다. | 현재 MVP 흐름과 `deploy/round-transition-test` 비교 기준 확인 | 1인/2인 기준 라운드->라운드, 라운드->갤러리 전환이 자연스럽다. | frontend, qa-frontend |
| 2 | Image UX | 이미지 preload/cache/local preview | 결과 이미지 생성/전송 지연이 있어도 사용자가 즉시 preview를 볼 수 있게 한다. | 라운드 종료 modal 흐름 안정화 | local preview가 먼저 보이고, 서버 저장 완료 후 최종 result와 동기화된다. | frontend |
| 3 | Result Reliability | 서버 authoritative result 저장 안정화 | client preview와 서버 최종 저장 결과를 분리해 다운로드/갤러리 신뢰성을 유지한다. | local preview 정책 정리 | result-saved 실패/지연/재시도 기준이 명확하고 gallery fallback이 동작한다. | backend, frontend |
| 4 | Storage Cleanup | GridFS cleanup/스토리지 정책 | 원본/결과 이미지와 room/result 데이터를 필요 이상으로 보관하지 않는다. | room 상태와 result 보관 기간 기준 합의 | 만료된 finished room과 연결 GridFS 데이터가 안전하게 정리된다. | backend, qa-backend |
| 5 | Presence Lifecycle | Socket.IO presence 기반 room lifecycle cleanup | 모든 사용자가 떠난 방을 상태별 grace period 후 정리한다. | cleanup 대상과 grace period 정책 정의 | waiting/playing/finished 상태별 disconnect/reconnect 시나리오가 안전하다. | backend |
| 6 | Deployment Split Plan | Cloudflare Pages frontend 분리 계획 | frontend 정적 자산을 CDN에 두고 backend API/Socket 운영을 분리한다. | 라운드/이미지/cleanup 안정화 | env 이름/목적, CORS, Socket URL, Firebase authorized domain 체크리스트가 준비된다. | infra, planner |
| 7 | Backend Hosting Decision | Render/Oracle backend 운영 결정 | backend CPU/RAM/cold start 병목을 줄일 운영 환경을 선택한다. | 테스트 배포 성능 비교 | Render 유지/유료화/Oracle 이전 중 선택 기준과 rollback 기준이 명확하다. | infra, backend |
| 8 | E2E QA | 실제 2인/4인/관전자 QA | 제품화 전 실제 사용 조건에서 주요 플로우를 검증한다. | 테스트 배포 URL과 테스트 계정 준비 | 로그인, 닉네임, 입장, 업로드, 라운드, 채팅, 갤러리, 다운로드 체크가 완료된다. | qa |
| 9 | Observability | 운영 로그/health/error 추적 | 배포 후 문제를 재현하고 원인을 찾을 수 있게 한다. | 운영 배포 구조 결정 | health, cleanup log, result save timing, socket lifecycle log가 secret 없이 확인된다. | backend, infra |
| 10 | Security Finalization | secret 회전 | 개발/테스트 중 노출 가능성이 있었던 credential 리스크를 회수한다. | 모든 기능/배포/QA 작업 완료 | 사용자가 직접 새 secret을 등록하고 기존 secret을 폐기한 뒤 정상 동작을 확인한다. | user, infra |

### 순서 운영 원칙

- 1~3단계는 사용자 체감 품질을 바로 좌우하므로 최우선으로 진행한다.
- 4~5단계는 데이터 비용과 방 생명주기 안정성을 위한 backend 제품화 작업이다.
- 6~7단계의 Cloudflare/Oracle/Render 배포 구조 변경은 기능 안정화 이후 진행한다.
- 8~9단계는 제품화 배포 전 품질 확인과 운영 가시성을 보강하는 단계다.
- 10단계 secret 회전은 모든 작업의 마지막에 사용자가 직접 진행한다.
