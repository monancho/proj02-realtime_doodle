# Test Report

## 기록 원칙

## 검증 결과

### 2026-06-05 PHASE-00-PROJECT-SCAFFOLD

- 실행 명령: `git status --short`
- 성공: 작업 후 변경 파일 확인 완료
- 미실행: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- 미실행 사유: 사용자 요청 검증 명령이 `git status --short`였고, 의존성 설치/앱 기능 구현 범위가 아니었음.

### 2026-06-05 PHASE-01-HEALTH-ENV

- 실행 명령: `git status --short`
- 성공: 작업 후 변경 파일 확인 완료
- 미실행: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- 미실행 사유: 사용자 요청 검증 명령이 `git status --short`였고, 의존성 추가/설치 없이 최소 health/env 구조만 구현했음.

### 2026-06-05 PHASE-01-HEALTH-ENV-WIRING

- 실행 명령: `git status --short`
- 성공: 작업 후 변경 파일 확인 완료
- 추가 실행: `corepack pnpm --filter @doodle/server typecheck`
- 추가 실행: `corepack pnpm --filter @doodle/server test`
- 결과:
  - `test`: 통과. 2 files, 3 tests.
  - `typecheck`: 최초 실행 시 TypeScript 6의 `baseUrl` deprecation 설정과 env validation result narrowing 문제로 실패. `tsconfig.base.json`와 env validation/test 타입을 수정한 뒤 통과.

### 2026-06-05 PHASE-02-AUTH-PLAN

- 실행 명령: `git status --short`
- 추가 실행: `corepack pnpm --filter @doodle/server typecheck`
- 성공: 작업 후 변경 파일 확인 완료
- 성공: server typecheck 통과
- 미실행: `pnpm lint`, `pnpm test`, `pnpm build`
- 미실행 사유: 인증 구현이 아닌 계획/계약 정리 작업이며 요청 검증 명령은 `git status --short`였음.

### 2026-06-05 PHASE-02-AUTH-BACKEND

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과
  - `test`: 통과. 5 files, 11 tests.
  - `git status --short`: 변경 파일 확인 완료

### 2026-06-05 PHASE-02-AUTH-USER-UPSERT

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과
  - `test`: 통과. 6 files, 13 tests.
  - `git status --short`: 변경 파일 확인 완료

### 2026-06-05 PHASE-03-MONGODB-CONNECTION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 최초 실행 시 MongoDB index type mismatch로 실패. `IndexSpecification`으로 보정 후 통과.
  - `test`: 통과. 8 files, 16 tests.
  - `git status --short`: 변경 파일 확인 완료

### 2026-06-05 PHASE-03-MONGODB-WIRING

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과
  - `test`: 통과. 9 files, 17 tests.
  - `git status --short`: 변경 파일 확인 완료

### 2026-06-05 PHASE-03-MONGODB-SMOKE

- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `smoke:bootstrap`: 실패. 안전한 error label은 `Error:ECONNREFUSED`.
  - `typecheck`: 통과
  - `test`: 통과. 9 files, 17 tests.
  - `git status --short`: 변경 파일 확인 완료
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 다음 조치: 사용자가 MongoDB Atlas URI, Network Access, database user/password, local `.env` 값을 로컬에서 확인해야 함.

### 2026-06-05 PHASE-03-MONGODB-SMOKE-DIAGNOSTIC

- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 실행 명령: `node -e "require('dns').resolveSrv('_mongodb._tcp.test01.qukv9nr.mongodb.net',...)"`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 결과:
  - `smoke:bootstrap`: 실패. 안전한 diagnostic은 `name=Error code=ECONNREFUSED syscall=querySrv`.
  - Node DNS SRV 조회: 실패. 안전한 diagnostic은 `DNS_SRV_FAIL code=ECONNREFUSED syscall=querySrv`.
  - `typecheck`: 통과
  - `test`: 통과. 9 files, 17 tests.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 해석: MongoDB shard `27017` 연결 자체가 아니라, `mongodb+srv://`가 사용하는 Node DNS SRV 조회 단계에서 거부가 발생하고 있음.

### 2026-06-05 PHASE-03-MONGODB-SMOKE-SUCCESS-LOG

- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `smoke:bootstrap`: 통과. `SMOKE_OK server bootstrap and MongoDB connection succeeded`.
  - `typecheck`: 통과
  - `test`: 통과. 9 files, 17 tests.
  - `git status --short`: 변경 파일 확인 완료
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 해석: 로컬 환경에서 `mongodb+srv://` SRV DNS 조회가 `querySrv ECONNREFUSED`로 실패했으나, standard MongoDB connection string 적용 후 bootstrap smoke test가 성공함.

### 2026-06-05 PHASE-04-ROOM-CONTRACT-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과
  - `git status --short`: 변경 파일 확인 완료
- 미실행:
  - `test`: 이번 단계는 Room 구현 없이 문서 계약만 정리했으며, 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 이번 단계는 외부 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.

### 2026-06-05 PHASE-04-ROOM-CONTRACT-SHARED

- 실행 명령: `corepack pnpm --filter @doodle/shared typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `shared typecheck`: 성공 exit. 현재 script는 `typecheck not configured for @doodle/shared yet` echo placeholder.
  - `server typecheck`: 통과
  - `git status --short`: 변경 파일 확인 완료
- 미실행:
  - `test`: 이번 단계는 shared type contract 추가이며 사용자 지정 validation command에 포함되지 않음.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.

### 2026-06-05 PHASE-04-ROOM-REPOSITORY-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `server typecheck`: 통과
  - `git status --short`: 변경 파일 확인 완료
- 미실행:
  - `test`: 이번 단계는 Room route/repository 구현 없이 문서 계획만 정리했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 외부 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.

### 2026-06-06 PHASE-04-ROOM-REPOSITORY-IMPLEMENTATION

- 실행 명령: `corepack pnpm install`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - 최초 `typecheck`: 실패. `node_modules`가 없어 `tsc`를 찾지 못함.
  - `pnpm install`: 성공. lockfile은 최신 상태였고 workspace dependencies를 설치함.
  - 재실행 `typecheck`: 통과.
  - `test`: 통과. 11 files, 29 tests.
  - `git status --short`: 변경 파일 확인 완료.
- 미실행:
  - `smoke:bootstrap`: 이번 단계는 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-04-ROOM-ROUTE-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - 최초 `typecheck`: 실패. Express 5 route param type이 `string | string[]`로 추론되어 `roomCode` string 인자와 맞지 않았음.
  - 수정 후 `typecheck`: 통과.
  - `test`: 통과. 12 files, 36 tests.
  - `git status --short`: 변경 파일 확인 완료.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-04-ROOM-BOOTSTRAP-SMOKE

- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `smoke:bootstrap`: 통과. `SMOKE_OK server bootstrap and MongoDB connection succeeded`.
  - `typecheck`: 통과.
  - `test`: 통과. 12 files, 36 tests.
  - `git status --short`: 미추적 `package-lock.json`만 확인.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 해석:
  - 로컬 `.env` 기반 서버 bootstrap이 성공했다.
  - MongoDB 연결, users/rooms repository wiring, users/rooms index 생성 흐름이 시작 단계에서 통과했다.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-05-SOCKET-ROOM-MEMBERSHIP-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Socket 구현 없이 문서 계획만 정리했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 README_AND_DOC_SYNC

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 문서 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 앱 기능 코드 변경 없이 문서 동기화만 수행했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- `package-lock.json` 처리 방안:
  - 현재 저장소는 pnpm workspace와 `pnpm-lock.yaml`을 기준으로 한다.
  - `package-lock.json`은 npm lockfile이므로 pnpm 기준 프로젝트에서는 일반적으로 추적하지 않는 것이 일관적이다.
  - 사용자 승인 없이 삭제하지 않았고 commit 대상에도 포함하지 않았다.

### 2026-06-06 AGENTS-NEXT-TASK-TEMPLATE-RULE

- 실행 명령: `git status --short`
- 결과:
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `typecheck`, `test`: AGENTS.md와 개발 로그만 수정하는 문서 규칙 변경이며 앱/패키지 코드 변경이 없음.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-05-SOCKET-ROOM-MEMBERSHIP-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - 최초 `test`: 실패. Socket.IO private option assertion이 실제 내부 구조와 맞지 않았고, fake HTTP server cleanup에서 unhandled error가 발생함.
  - 수정 후 `typecheck`: 통과.
  - 수정 후 `test`: 통과. 14 files, 45 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-06-CHAT-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Chat 구현 없이 문서 계획만 정리했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-06-CHAT-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `test`: 통과. 14 files, 50 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - `send-message` 성공 시 trim된 `receive-message`를 같은 Socket.IO room에 emit하는지 검증.
  - auth context 없음, invalid payload, 빈 message, 200자 초과, room not found, access denied error code 검증.
  - in-memory recent messages가 roomCode별 최근 50개만 유지하는지 검증.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-07-DRAWING-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Drawing 구현 없이 문서 계획만 정리했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-07-DRAWING-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - 최초 `typecheck`: 실패. 테스트 helper의 `tool` 값이 `"pen" | "eraser"` literal type이 아니라 `string`으로 추론됨.
  - 수정 후 `typecheck`: 통과.
  - `test`: 통과. 14 files, 55 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - `draw-stroke` 성공 시 같은 Socket.IO room에만 broadcast하는지 검증.
  - auth context 없음, invalid payload, points 0개, points 129개, invalid point coordinate, invalid color, room not found, access denied error code 검증.
  - in-memory recent stroke batches가 `roomCode + roundId`별 최근 200개만 유지하는지 검증.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-08-ROUND-TIMER-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Round/Timer 구현 없이 문서 계획만 정리했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-07-IMAGE-UPLOAD-GRIDFS-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Image upload 구현 없이 문서 계획만 정리했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-07-IMAGE-UPLOAD-GRIDFS-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - 최초 `typecheck`: 실패. MongoDB GridFS upload option type에 `contentType` field가 없어 metadata 저장으로 수정.
  - 최초 `test`: 실패. binary stream 응답 테스트가 `response.text`를 읽어 `response.body` buffer 검증으로 수정.
  - 수정 후 `typecheck`: 통과.
  - 수정 후 `test`: 통과. 15 files, 61 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - image upload 성공 시 metadata 생성과 original file 저장 검증.
  - room image metadata 목록 조회 검증.
  - original image stream 응답 검증.
  - non-participant, non-waiting room, unsupported MIME type, empty file, per-user upload limit error code 검증.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-08-RANDOM-ROUND-START-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Random round start 구현 없이 문서 계획만 정리했으며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-08-RANDOM-ROUND-START-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `test`: 통과. 15 files, 64 tests.
  - `git status --short`: 변경 파일과 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - host `start-game` 성공 시 unused image 선택, `used: true` 처리, room `playing` 전이, `round-started` emit 검증.
  - auth context 없음, invalid payload, room not found, non-host, invalid room state, unused image 없음 error code 검증.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재했으며 이번 작업에서는 수정하거나 commit 대상으로 포함하지 않음.

### 2026-06-06 PHASE-10-TIMER-ROUND-END-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 문서 4개와 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Timer/round end 구현 없이 문서 계획만 정리하며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 수정, 삭제, commit 대상에 포함하지 않음.

### 2026-06-06 PHASE-10-TIMER-ROUND-END-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `test`: 통과. 15 files, 68 tests.
  - `git status --short`: 코드/문서 변경 파일과 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - `start-game` 성공 시 timer schedule 검증.
  - timer 만료 시 `round-ended` emit과 unused image 없음에 따른 `game-finished`/`finished` 전이 검증.
  - timer 만료 시 unused image가 있으면 다음 image used 처리, `currentRoundIndex + 1`, 다음 `round-started` emit 검증.
  - ended round와 non-playing room의 `draw-stroke` 거절 검증.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 수정, 삭제, commit 대상에 포함하지 않음.


### 2026-06-06 PHASE-11-RESULT-SAVE-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 문서 4개와 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Result save 구현 없이 문서 계획만 정리하며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 수정, 삭제, commit 대상에 포함하지 않음.


### 2026-06-06 PHASE-11-RESULT-SAVE-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `test`: 통과. 16 files, 71 tests.
  - `git status --short`: result 구현/문서 변경 파일과 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - `ResultSaveService`가 source image를 읽고 result image storage와 metadata repository에 저장하는지 검증.
  - 같은 `roomCode + roundId`에 대해 idempotent하게 기존 result를 재사용하는지 검증.
  - result save 실패가 throw되지 않고 `null`로 처리되는지 검증.
  - `round-ended` 이후 `result-saved` emit과 stroke batch 전달 검증.
  - result save 실패가 다음 round 전이를 막지 않는지 검증.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 수정, 삭제, commit 대상에 포함하지 않음.


### 2026-06-06 PHASE-12-GALLERY-DOWNLOAD-PLAN

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `git status --short`: 변경 문서 4개와 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- 미실행:
  - `test`: 이번 단계는 Gallery/download 구현 없이 문서 계획만 정리하며 사용자 지정 validation command에 포함되지 않음.
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 수정, 삭제, commit 대상에 포함하지 않음.


### 2026-06-06 PHASE-12-GALLERY-DOWNLOAD-IMPLEMENTATION

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `git status --short`
- 결과:
  - `typecheck`: 통과.
  - `test`: 통과. 17 files, 75 tests.
  - `git status --short`: Gallery/download 구현/문서 변경 파일과 작업 전부터 존재한 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - room participant의 result metadata 목록 조회와 cursor pagination 검증.
  - result image download stream body와 `Content-Type`, `Content-Length`, `Content-Disposition`, `Cache-Control` header 검증.
  - non-participant list/download 접근 거절 검증.
  - invalid query, missing room, missing result, missing result file error code 검증.
- 미실행:
  - `smoke:bootstrap`: 실제 MongoDB/Firebase/GridFS 연결 검증 범위가 아님.
- secret 출력 여부: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않음.
- 주의:
  - 작업 전부터 미추적 `package-lock.json`이 존재하며 이번 작업에서는 수정, 삭제, commit 대상에 포함하지 않음.

### 2026-06-06 FRONTEND-VITE-REACT-SCAFFOLD

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 결과:
  - 최초 `typecheck`/`build`: 실패. `import.meta.env`와 CSS side-effect import를 위한 Vite 타입 선언이 없었다.
  - `apps/web/src/vite-env.d.ts` 추가 후 `typecheck`: 통과.
  - `build`: 통과. Vite production build 생성 확인.
  - `server typecheck`: 통과.
  - Vite dev server: `5173`, `5174`가 사용 중이라 `http://localhost:5175`로 실행되었고 HTTP 200 응답 확인.
- 테스트 범위:
  - React/Vite TypeScript compile 검증.
  - Vite production bundle 생성 검증.
- 미실행:
  - web unit/e2e test: 아직 테스트 도구와 브라우저 시나리오가 구성되지 않았다.
  - 실제 Firebase 로그인/API smoke: 사용자의 실제 ID Token과 서버 실행이 필요한 범위라 이번 작업에서 제외했다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.

### 2026-06-06 PHASE-LOCAL-MANUAL-E2E-SMOKE

- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `server typecheck`: 통과.
  - `server test`: 통과. 18 files, 79 tests.
  - `web typecheck`: 통과.
  - `web build`: 통과.
  - `git status --short`: 문서 변경과 기존 미추적 `package-lock.json` 확인.
- 로컬 실행 기준:
  - 백엔드: `corepack pnpm --filter @doodle/server dev`
  - 프론트엔드: `corepack pnpm --filter @doodle/web dev`
  - 브라우저 접속: `http://localhost:5173`
  - API health 확인: `http://localhost:4000/health`
  - HTTP API CORS는 `CLIENT_URL`, Socket.IO CORS는 `SOCKET_CORS_ORIGIN` 기준으로 확인한다.
- 수동 E2E 체크리스트:
  - [ ] Google 로그인 성공 후 `/api/users/me` upsert가 성공하는지 확인한다.
  - [ ] 로그인 후 닉네임을 수정/저장하고 participants/chat 표시 이름에 반영되는지 확인한다.
  - [ ] 로그아웃 시 token, 현재 room, socket 상태가 정리되는지 확인한다.
  - [ ] 사용자 A가 방을 생성하고 room code, host, participants가 표시되는지 확인한다.
  - [ ] 사용자 B가 같은 room code로 입장하고 양쪽 화면에서 participants가 갱신되는지 확인한다.
  - [ ] waiting 상태에서 JPEG/PNG/WebP 이미지를 업로드하고 image metadata 목록이 갱신되는지 확인한다.
  - [ ] 0 byte, 10MB 초과, 허용되지 않은 MIME type 파일이 안전한 오류로 거절되는지 확인한다.
  - [ ] 같은 room의 두 브라우저 세션에서 socket join 후 chat 메시지가 같은 room에만 표시되는지 확인한다.
  - [ ] start-game 후 `round-started` 수신, timer countdown, drawing 활성화가 동작하는지 확인한다.
  - [ ] drawing stroke가 같은 room의 다른 세션 canvas에 반영되는지 확인한다.
  - [ ] round 종료 후 drawing이 차단되고 `round-ended`, 다음 round 또는 `game-finished` 흐름이 표시되는지 확인한다.
  - [ ] result 저장 후 gallery 목록과 result download가 동작하는지 확인한다.
- 사용자 조작 필요:
  - Google 로그인이 가능한 실제 Firebase 계정 2개 또는 브라우저 세션 2개가 필요하다.
  - 테스트 이미지는 secret이 아닌 일반 샘플 이미지만 사용한다.
  - 브라우저 개발자 도구 Network 탭에서 Authorization header 값이나 token 값을 문서/채팅에 복사하지 않는다.
- Phase 13 전 리스크:
  - 위 수동 체크리스트는 이번 자동 검증에서 실제 조작까지 완료하지 못했다.
  - Firebase Auth 설정, MongoDB Atlas 네트워크 접근, 로컬 `.env` 값이 사용자 환경에 의존한다.
  - Socket multi-client, 이미지 업로드/GridFS, result download는 배포 전 최소 1회 수동 확인이 필요하다.

### 2026-06-06 FRONTEND-GOOGLE-AUTH-UX-CORRECTION

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과.
- 테스트 범위:
  - Firebase `GoogleAuthProvider` popup 로그인 compile 확인.
  - 로그인 후 닉네임 저장 form compile 확인.
  - 방 선택 후에만 방 화면 이동 tab이 표시되는 흐름 compile 확인.
  - 로컬 기본 API URL fallback `http://localhost:4000` 반영 확인.
- 미실행:
  - 실제 Google popup 로그인은 사용자 브라우저 세션과 Firebase Console의 Google provider 활성화가 필요해 수동 QA 범위로 남겼다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

### 2026-06-06 PHASE-FE-AUTH-LOBBY-UX-REFINE

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과.
  - `git status --short`: 프론트/문서 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - 로그인 전 Google 로그인 전용 화면 compile 확인.
  - 로그인 후 상단 프로필 메뉴, 닉네임 변경 모달, 로그아웃 버튼 compile 확인.
  - 로비의 `방 만들기`/`방 입장` CTA와 모달 form compile 확인.
  - 일반 UI에서 API 서버 input과 개발용 token fallback 제거 확인.
  - 기존 Socket, Drawing, Upload, Timer, Result handler compile 유지 확인.
- 미실행:
  - 실제 Google popup 로그인과 프로필 메뉴 hover/click 동작은 사용자 브라우저 세션이 필요한 수동 QA 범위로 남겼다.
- 수동 확인 항목:
  - [ ] 로그인 전에는 Google 로그인 버튼 중심 화면만 보이는지 확인한다.
  - [ ] 로그인 후 로비에 `방 만들기`, `방 입장` 두 CTA만 주요 액션으로 보이는지 확인한다.
  - [ ] 상단 오른쪽 프로필 hover/click 시 `닉네임 변경`, `로그아웃`이 보이는지 확인한다.
  - [ ] `방 만들기` 클릭 시 방 이름 모달이 열리고 생성 성공 후 방 준비 화면으로 이동하는지 확인한다.
  - [ ] `방 입장` 클릭 시 방 코드 모달이 열리고 입장 성공 후 방 준비 화면으로 이동하는지 확인한다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.

### 2026-06-06 LOCAL-BACKEND-FRONTEND-INTEGRATION-SMOKE

- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 실행 명령: `corepack pnpm --filter @doodle/server typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/server test`
- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `corepack pnpm --filter @doodle/server dev`
- 실행 명령: `curl.exe -i -X OPTIONS http://localhost:4000/api/users/me -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"`
- 실행 명령: `git status --short`
- 결과:
  - `server smoke:bootstrap`: 통과. 서버 bootstrap과 MongoDB 연결 smoke 성공.
  - `server typecheck`: 통과.
  - `server test`: 통과. 18 files, 79 tests.
  - `web typecheck`: 통과.
  - `web build`: 통과.
  - `server dev`: 최초 실행 시 workspace root `.env` 탐색 문제를 확인했고, env loader 보강 후 정상 실행.
  - `GET http://localhost:4000/health`: 200 응답 확인.
  - `GET http://localhost:5173`: 200 응답 확인.
  - HTTP API CORS preflight: 204 응답과 허용 CORS header 확인.
- 테스트 범위:
  - 서버 bootstrap wiring, MongoDB users/rooms/images/results index 준비 경로 smoke.
  - Express HTTP CORS middleware unit test.
  - 로컬 웹 dev 서버와 서버 API origin 간 preflight 확인.
  - 웹 production build 생성 확인.
- 미실행:
  - 실제 Firebase 로그인, 이미지 업로드, Socket multi-client E2E는 사용자 계정/브라우저 세션이 필요한 수동 QA 범위로 남겼다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.

### 2026-06-06 FRONTEND-PHASE-CHECKLIST

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `git status --short`: 프론트 Phase 체크리스트 문서/로그 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - 문서 변경 후 기존 web TypeScript compile 영향 없음 확인.
- 미실행:
  - web build: 이번 작업은 문서 체계 정리이며 직전 FE-01 작업에서 build 통과를 확인했다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.

### 2026-06-06 PHASE-FE-02-FIREBASE-AUTH-CLIENT

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과. Vite production build 생성 확인.
  - `git status --short`: Firebase auth client 구현 파일, 문서 변경, pnpm lockfile 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - Firebase Client SDK import와 auth UI TypeScript compile 검증.
  - `/api/users/me` API client 타입 검증.
  - Vite production bundle 생성 검증.
- 미실행:
  - 실제 Firebase 로그인 smoke: 실제 Firebase web config와 사용자 계정이 필요한 범위라 이번 작업에서 제외했다.
  - Socket.IO, Canvas, Chat 검증: 이번 FE-02 범위가 아니다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - Firebase client config는 브라우저 공개용 `VITE_` 값만 사용한다.
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.
### 2026-06-06 PHASE-FE-03-LOBBY-ROOM-FLOW

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과. Firebase SDK bundle size 경고는 남아 있으나 실패는 아님.
  - `git status --short`: FE-03 웹/문서 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - 로그인 전 방 action 비활성화 UI TypeScript compile 검증.
  - room detail, participants, images, results loading/error 상태 compile 검증.
  - Vite production bundle 생성 검증.
- 미실행:
  - 실제 로그인/방 생성 smoke: 사용자의 실제 Firebase 계정과 서버 실행이 필요한 범위라 이번 자동 구현 단계에서는 제외했다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.
### 2026-06-06 PHASE-FE-04-IMAGE-UPLOAD-GALLERY

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과. Firebase SDK bundle size 경고는 남아 있으나 실패는 아님.
  - `git status --short`: FE-04 웹/문서 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - 이미지 업로드 사전 검증 TypeScript compile 검증.
  - 업로드 후 image list refresh 흐름 compile 검증.
  - Gallery pagination/download UI compile 검증.
- 미실행:
  - 실제 업로드/download smoke: 서버 실행과 인증된 사용자 세션이 필요한 범위라 이번 자동 구현 단계에서는 제외했다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.
### 2026-06-06 PHASE-FE-05-SOCKET-ROOM-AND-CHAT

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과. Firebase/Socket client bundle size 경고는 남아 있으나 실패는 아님.
  - `git status --short`: FE-05 웹/문서/pnpm lockfile 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - Socket.IO client import와 join/leave/chat handler TypeScript compile 검증.
  - Chat message validation UI compile 검증.
  - Vite production bundle 생성 검증.
- 미실행:
  - 실제 socket smoke: 서버 실행과 인증된 사용자 세션이 필요한 범위라 이번 자동 구현 단계에서는 제외했다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.
### 2026-06-06 PHASE-FE-06-CANVAS-DRAWING

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과. Firebase/Socket client bundle size 경고는 남아 있으나 실패는 아님.
  - `git status --short`: FE-06 웹/문서 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - Canvas pointer event, stroke batching, draw-stroke emit/receive handler TypeScript compile 검증.
  - Vite production bundle 생성 검증.
- 미실행:
  - 실제 multi-client drawing smoke: 서버 실행과 인증된 사용자 세션, 복수 브라우저가 필요한 범위라 이번 자동 구현 단계에서는 제외했다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.
### 2026-06-06 PHASE-FE-07-ROUND-TIMER-UX

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과. Firebase/Socket client bundle size 경고는 남아 있으나 실패는 아님.
  - `git status --short`: FE-07 웹/문서 변경과 기존 미추적 `package-lock.json` 확인.
- 테스트 범위:
  - round-started/round-ended/game-finished handler와 countdown TypeScript compile 검증.
  - Drawing lock 상태 compile 검증.
  - Vite production bundle 생성 검증.
- 미실행:
  - 실제 round timer socket smoke: 서버 실행과 game start flow가 필요한 범위라 이번 자동 구현 단계에서는 제외했다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.
### 2026-06-06 PHASE-FE-08-FRONTEND-QA-POLISH

- 실행 명령: `corepack pnpm --filter @doodle/web typecheck`
- 실행 명령: `corepack pnpm --filter @doodle/web build`
- 실행 명령: `git status --short`
- 결과:
  - `web typecheck`: 통과.
  - `web build`: 통과. 이전 Firebase/Socket client bundle size warning은 `chunkSizeWarningLimit` 조정 후 표시되지 않음.
  - `git status --short`: FE-08 웹/문서 변경과 기존 미추적 `package-lock.json` 확인.
- 수동 점검 기준:
  - 로그인 -> 방 생성 -> 이미지 업로드 -> room 상태 확인.
  - 로그인 -> 방 입장 -> socket join -> chat 송수신.
  - round 진행 -> drawing -> round end -> gallery CTA.
- 미실행:
  - 실제 E2E smoke: 서버 실행, Firebase 사용자 계정, 복수 브라우저 세션이 필요한 범위라 이번 자동 구현 단계에서는 제외했다.
  - 배포: 이번 작업 범위가 아니다.
- secret 출력 여부:
  - `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.
- 주의:
  - 기존 미추적 `package-lock.json`은 수정, 삭제, commit 대상에 포함하지 않는다.
