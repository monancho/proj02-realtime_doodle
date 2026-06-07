# Next Review Actions

## 2026-06-07 사용자 일정 이후 확인할 항목

이 문서는 사용자가 자리를 비운 동안 바로 진행 가능한 작업과, 추가 설계/확인이 필요한 작업을 분리해 남긴다.
비밀정보, `.env`, token, Firebase private key, MongoDB URI 값은 포함하지 않는다.

## 이번에 바로 진행 가능한 작업

- 백엔드 room 생성 기본 최대 인원을 4명으로 변경한다.
- room route 테스트의 기본 `maxPlayers` 기대값을 4로 갱신한다.
- 프론트 dev preview mock room도 4명 기준으로 맞춘다.
- 이미지 파일 선택 후 업로드 확인 패널이 `이미지 추가` 패널 아래에 새로 쌓이지 않고, 같은 위치를 대체하도록 정리한다.

## 추가 구현이 필요한 작업

### 최초 로그인 후 닉네임 설정

- 현재는 Google profile의 `displayName`을 nickname 기본값으로 `/api/users/me`에 upsert한다.
- 사용자가 원하는 흐름은 최초 로그인 후 nickname을 명시적으로 설정하는 것이다.
- 필요한 작업:
  - user profile에 nickname 설정 완료 여부를 표현할지 결정한다.
  - nickname이 비어 있거나 최초 사용자이면 프론트에서 nickname modal을 강제 표시한다.
  - 닉네임 저장 전에는 방 만들기/입장을 막을지 결정한다.
  - nickname validation 기준을 문서화한다. 예: trim 후 2-12자, 빈 문자열 금지.

### 닉네임 중복 체크

- 단순 프론트 검증만으로는 부족하므로 백엔드/DB 계약이 필요하다.
- 필요한 작업:
  - users collection에 normalized nickname 필드를 추가할지 결정한다.
  - unique index를 적용할 범위 결정: 전체 서비스 단위 또는 room 단위.
  - 중복 시 API error code 예: `USER_NICKNAME_TAKEN`.
  - nickname 변경 시 기존 room participant profile 동기화와 `room-updated` broadcast 유지.

### 프로필 이미지 URL 저장 및 표시

- 현재 Firebase decoded token의 `picture`/Google photoURL을 `avatarUrl`로 저장하고, participant payload에도 포함한다.
- 추가 확인:
  - Google profile image URL이 users collection에 지속 저장되는지 실제 Mongo repository 기준으로 점검한다.
  - `/api/users/me` nickname 변경 시 avatarUrl을 null로 덮어쓰지 않는지 확인한다.
  - 방 참가자 목록, 채팅, 업로드 metadata, 결과 metadata에서 avatarUrl 표시 기준을 통일한다.

### 결과/업로드 미리보기 일관성

- 대기실의 4개 이미지 슬롯 톤을 결과 갤러리 라운드 기록에도 맞춘다.
- 결과 대표 preview와 라운드 기록 카드의 비율, 여백, selected 상태가 대기실 미리보기와 같은 분위기로 보이도록 추가 visual QA가 필요하다.
- Browser 자동 screenshot QA는 현재 Windows sandbox runtime 문제로 실패했으므로, 사용자가 직접 확인하거나 다른 실행 환경에서 재시도해야 한다.

## 사용자가 지시하지 않았지만 해야 할 작업

- 현재 `apps/web/src/App.tsx`와 일부 문서에 과거 인코딩 깨짐 문자열이 남아 있다.
- TypeScript/build는 통과하지만, UI 문구가 깨져 보일 수 있으므로 별도 phase로 한글 문구 정리 작업이 필요하다.
- 이 작업은 기능 변경과 분리해서 진행해야 한다.

## 추천 후속 순서

1. `PHASE-BE-USER-NICKNAME-UNIQUENESS-PLAN`
2. `PHASE-BE-USER-NICKNAME-UNIQUENESS-IMPLEMENTATION`
3. `PHASE-FE-FIRST-LOGIN-NICKNAME-GUARD`
4. `PHASE-FE-KOREAN-COPY-CLEANUP`
5. `PHASE-FE-GALLERY-PREVIEW-VISUAL-POLISH`


## Cursor effects follow-up

- Local revert checkpoint before this feature: checkpoint/pre-cursor-effects.
- Real QA needed: run two logged-in browsers in the same room, start a round, move both cursors over the canvas, and verify peer cursor labels/tools stay aligned with the visible canvas image.
- Tune later if needed: cursor throttle interval, particle count, scratch pad placement, and whether spectator cursors should be visible.
- The cursor-move event is intentionally volatile and not stored in MongoDB/GridFS.
