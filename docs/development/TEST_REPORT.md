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
