# 테스트 전략

## 자동 테스트 범위

| 범위 | 테스트 |
|---|---|
| Env | 필수 환경변수 누락 시 명확한 에러 |
| Health | `/health` 200 응답 |
| Auth | token 없음 401, 유효 token 통과 |
| User | Firebase uid 기준 사용자 upsert |
| Room | 생성, 조회, 입장, 인원 제한 |
| Socket | 인증 실패, `join-room`, `room-updated` |
| Chat | 같은 방 사용자에게만 broadcast |
| Upload | MIME/용량 검증, AI image moderation allow/block/fail-closed, metadata 저장, GridFS 저장 |
| Round | host 권한, 랜덤 선택, 종료 처리 |
| Drawing | payload validation, 종료 라운드 차단 |
| Result | 저장, 조회, 다운로드 |

## 수동 E2E 시나리오

1. A 사용자가 로그인한다.
2. A가 방을 생성한다.
3. B 사용자가 로그인한다.
4. B가 방 코드로 입장한다.
5. A/B가 각각 사진을 업로드한다.
   - 유해 이미지 moderation 차단과 AI Server 장애 시 업로드 fail-closed도 별도 확인한다.
6. A가 게임을 시작한다.
7. A가 그린 선이 B 화면에 보인다.
8. B가 보낸 채팅이 A 화면에 보인다.
9. 타이머 종료 후 라운드 결과가 표시된다.
10. 모든 라운드 종료 후 결과 갤러리에서 다운로드한다.

## 검증 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

문서 정리만 하는 작업은 요청에 따라 아래만 실행할 수 있다.

```bash
git status --short
```

## 테스트 기록

테스트 결과와 미실행 사유는 `docs/development/TEST_REPORT.md`에 누적한다.
