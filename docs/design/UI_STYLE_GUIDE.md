# UI Style Guide

## 색상 토큰

| 토큰 | 용도 | 권장값 |
|---|---|---|
| `--paper` | 전체 배경 | `#F7F3EC` |
| `--ink` | 본문/라인 | `#222222` |
| `--muted-ink` | 보조 텍스트 | `#6B6258` |
| `--accent` | 주요 버튼/강조 | `#5B4636` |
| `--accent-soft` | 연한 강조 배경 | `#E8DCC8` |
| `--danger` | 삭제/오류 | `#B84A4A` |
| `--success` | 완료/성공 | `#4F7A52` |
| `--yellow` | 준비/강조 | `#F4C542` |
| `--blue` | 참여자/도구 색상 | `#6EA8D8` |
| `--pink` | 장식/상태 색상 | `#E8A1B3` |
| `--purple` | 보조 참여자 색상 | `#B9A4E6` |

## 타이포그래피

| 구분 | 권장 |
|---|---|
| 본문/버튼 | Pretendard 우선, Noto Sans KR/system-ui fallback |
| 제목/강조 | Gaegu 우선, Pretendard fallback |
| 숫자/타이머 | 가독성 높은 sans-serif |

손글씨 폰트는 제목, 장식, 짧은 라벨에만 사용하고 본문 전체에는 적용하지 않는다.

## Handdrawn 적용 기준

- Rough.js는 실제 dependency로 도입하되 장식 SVG 레이어에만 사용한다.
- Rough.js 적용 대상은 hero underline, room code badge, result/empty preview frame 같은 보조 장식으로 제한한다.
- 기능 Canvas drawing, stroke 송수신, upload, timer, result save 동작에는 Rough.js를 사용하지 않는다.
- 카드와 모달은 `8px` 이하의 비정형 border-radius 조합으로 손그림 느낌을 낸다.
- 카드 내부에는 얇은 dashed inner border를 사용해 종이 위 스케치 느낌을 만든다.
- 버튼 hover는 작은 회전과 그림자 축소로 눌리는 장난감 같은 감각을 준다.
- H1에는 Rough.js underline을 사용하되 본문 가독성을 가리지 않는다.
- 로그인 화면은 큰 `DOODLE` 워드마크와 단일 Google CTA로 시작한다.
- 대기실은 room code badge, copy button, ready count, 참가자 색 점, 사진 1장 업로드 안내를 우선 노출한다.
- 모바일에서는 카드 회전을 제거하고 preview/grid 요소가 한 줄로 눌리지 않도록 한다.

## 레이아웃 원칙

- 라운드 진행 화면에서는 Canvas가 가장 넓은 영역을 차지한다.
- 채팅과 참가자 목록은 보조 영역이지만 라운드 중 항상 접근 가능해야 한다.
- 버튼과 입력창은 충분한 터치/클릭 영역을 가진다.
- 텍스트가 버튼과 카드 안에서 줄바꿈 없이 잘리지 않도록 한다.
- 데스크톱/태블릿 우선이며 모바일 완전 최적화는 MVP 후순위다.

## CSS 방향 예시

```css
:root {
  --paper: #F7F3EC;
  --ink: #222222;
  --muted-ink: #6B6258;
  --accent: #5B4636;
  --accent-soft: #E8DCC8;
}

.paper-card {
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 18px 14px 20px 12px;
  box-shadow: 4px 4px 0 rgba(34, 34, 34, 0.18);
}

.doodle-button {
  border: 2px solid var(--ink);
  border-radius: 14px 18px 12px 16px;
  background: var(--accent-soft);
  transform: rotate(-0.4deg);
}

.doodle-button:hover {
  transform: rotate(0.2deg) translateY(-1px);
}
```

## 지양 사항

- 과도한 그라디언트
- 고채도 네온 중심 UI
- 장식 때문에 Canvas, 타이머, 채팅 가독성이 낮아지는 구성
- 처음부터 대형 UI 라이브러리에 의존하는 방식
