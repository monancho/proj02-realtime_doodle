# 리뷰 체크리스트

## 요구사항 정합성

- [ ] 변경 내용이 `docs/REQUIREMENTS.md`의 MVP 범위에 포함된다.
- [ ] MVP 제외 기능이 명시 요청 없이 추가되지 않았다.
- [ ] 기능 동작이 `docs/FUNCTIONAL_SPECIFICATION.md`와 일치한다.
- [ ] UI 흐름이 `docs/USER_FLOW.md`와 일치한다.

## 아키텍처 경계

- [ ] `apps/web`가 서버 비밀키, Firebase Admin SDK, MongoDB 직접 접근을 포함하지 않는다.
- [ ] `apps/server`가 인증 검증, API, Socket, GridFS 책임을 가진다.
- [ ] `packages/shared`가 API/Socket payload 계약을 관리한다.
- [ ] Render 로컬 파일 시스템에 영구 데이터를 저장하지 않는다.

## 보안

- [ ] API 요청은 Firebase ID Token을 검증한다.
- [ ] Socket 연결은 Firebase ID Token을 검증한다.
- [ ] 비밀정보가 코드, 문서, 로그, 테스트 fixture에 포함되지 않는다.
- [ ] 인증 없는 room/image/result 접근이 없다.

## 데이터와 계약

- [ ] DB schema 변경이 `docs/DATABASE_API_SOCKET.md`에 반영되었다.
- [ ] API path 변경이 shared type과 문서에 반영되었다.
- [ ] Socket event 이름과 payload가 shared type과 문서에 반영되었다.
- [ ] 이미지 파일은 GridFS에 저장된다.

## 테스트와 검증

- [ ] 위험도에 맞는 테스트가 추가 또는 갱신되었다.
- [ ] lint/typecheck/test/build 중 필요한 검증을 실행했다.
- [ ] 실패 또는 미실행 검증의 이유와 다음 조치가 기록되었다.
