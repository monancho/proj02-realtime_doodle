# Troubleshooting

## 기록 원칙

## 이슈 목록

### MongoDB smoke test `ECONNREFUSED`

- 발생 단계: `PHASE-03-MONGODB-SMOKE`
- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 증상: `SMOKE_FAIL server bootstrap failed (Error:ECONNREFUSED)`
- 의미: 서버 bootstrap 중 MongoDB 연결 대상이 연결을 거부했다.
- secret 처리: MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

사용자가 확인할 항목:

- 로컬 `.env`의 `MONGODB_URI`가 Atlas connection string인지 확인
- URI username/password가 실제 Database User와 일치하는지 확인
- MongoDB Atlas Network Access에 현재 로컬 IP가 허용되어 있는지 확인
- cluster가 실행 중인지 확인
- 로컬 방화벽 또는 네트워크에서 Atlas 접속이 막히지 않는지 확인

확인 후 재시도 명령:

```bash
corepack pnpm --filter @doodle/server smoke:bootstrap
```
