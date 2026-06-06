# 디자인 시스템 및 와이어프레임

## 기준 이미지

기본 와이어프레임은 `docs/design/assets/realtime-doodle-wireframe-overview.png`를 따른다. 해당 이미지는 로그인/회원가입, 홈/방 목록, 방 입장 전 대기 화면, 라운드 진행 화면, 라운드 종료/다음 라운드 준비, 결과 갤러리, 공통 내비게이션, 색상/폰트 방향을 한 장에 정리한다.

## 디자인 컨셉

- 키워드: 낙서장, 손그림, 종이, 스티커, 삐뚤어진 테두리, 가벼운 장난감 같은 조작감
- 방향: handdrawn.css 계열의 비정형 버튼, 완벽하게 직선이 아닌 카드, 단순한 음영
- 현재 프론트 적용: `Gaegu` 제목/강조, `Pretendard` 본문/버튼 fallback, 비정형 border-radius, dashed inner border, 마커형 underline, 종이 격자 배경
- Rough.js: 실제 패키지 도입은 의존성/lockfile 변경이 필요하므로 MVP 1차 디자인에서는 보류하고 CSS 기반 handdrawn 스타일로 대체한다.
- 지양: 과도한 그라디언트, 지나치게 매끈한 SaaS dashboard, 고채도 네온 UI
- 우선순위: 장식보다 드로잉 영역, 타이머, 채팅 가독성

## 화면별 와이어프레임 기준

| 화면 | 기준 |
|---|---|
| S-001 로그인/회원가입 | 중앙 카드에 `DOODLE` 브랜딩, 로그인/회원가입 전환, 이메일/비밀번호 입력 |
| S-002 홈/방 목록 | 사용자 인사, 새 방 만들기, 방 목록 표, 내가 참여한 방 |
| S-003 방 대기실 | 좌측 참가자, 중앙 업로드 사진/dropzone, 우측 채팅, 하단 준비/시작 |
| S-004 라운드 진행 | Canvas 최대 면적, 좌측 라운드/참가자, 중앙 도구, 우측 채팅, 상단 타이머 |
| S-005 라운드 종료 | 결과 이미지 중앙 미리보기, 결과 보기, 다음 라운드 countdown |
| S-006 결과 갤러리 | 라운드별 결과 grid, 전체 다운로드, 방 나가기 |

## 컴포넌트

| 컴포넌트 | 설명 | 상태 |
|---|---|---|
| `DoodleButton` | 손그림 테두리 기본 버튼 | default, hover, active, disabled |
| `PaperCard` | 종이 카드 형태의 콘텐츠 박스 | default, selected, warning |
| `RoomCodeBadge` | 방 코드를 강조하는 라벨 | copyable |
| `TimerBadge` | 남은 시간을 크게 보여주는 뱃지 | normal, warning, ended |
| `ToolButton` | 펜, 지우개, 색상 선택 버튼 | selected, default |
| `ChatPanel` | 채팅 목록과 입력창 | empty, active |
| `ImageUploadBox` | 사진 업로드 dropzone | idle, dragOver, uploading, error |
| `ResultCard` | 결과 갤러리 이미지 카드 | default, hover |

## 접근성/사용성

- 타이머와 주요 버튼은 색상만으로 상태를 구분하지 않는다.
- 채팅과 버튼 텍스트는 손글씨 폰트보다 읽기 쉬운 본문 폰트를 우선한다.
- 드로잉 영역은 화면에서 가장 큰 비중을 차지해야 한다.
- 업로드, 게임 시작, 다운로드 버튼은 시각적 우선순위를 명확히 둔다.
