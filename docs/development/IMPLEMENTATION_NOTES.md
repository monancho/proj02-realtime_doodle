# Implementation Notes

## 기록 원칙

## 결정 사항

## 구현 메모

### 2026-06-05 PHASE-00-PROJECT-SCAFFOLD

- pnpm workspace root를 `package.json`, `pnpm-workspace.yaml`로 생성했다.
- 공통 TypeScript 기준 설정은 `tsconfig.base.json`에 두었다.
- `apps/web`, `apps/server`, `packages/shared` package 경계를 생성했다.
- 이번 단계에서는 React, Express, Firebase, Socket.IO, MongoDB, GridFS 기능을 구현하지 않았다.
- 의존성 설치와 production dependency 추가는 진행하지 않았다.
- `.env.example`에는 변수 이름만 두었고 실제 secret 값은 넣지 않았다.

### 2026-06-05 PHASE-01-HEALTH-ENV

- 의존성 추가 없이 framework-agnostic health handler를 `apps/server/src/health.ts`에 추가했다.
- `GET /health` 요청은 `200`과 `HealthResponse` payload를 반환하도록 정의했다.
- 그 외 method/path는 `404 NOT_FOUND` error payload를 반환하도록 정의했다.
- 서버 환경변수 검증 구조를 `apps/server/src/config/env.ts`에 추가했다.
- 필수 서버 환경변수 이름은 `packages/shared/src/env.ts`에서 공유 계약으로 관리한다.
- 실제 Express wiring, Firebase Auth, Room, Upload, Socket feature는 구현하지 않았다.
- secret 값은 생성하거나 출력하지 않았다.
