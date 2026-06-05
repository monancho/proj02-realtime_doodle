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

### MongoDB SRV DNS `querySrv` `ECONNREFUSED`

- 발생 단계: `PHASE-03-MONGODB-SMOKE-DIAGNOSTIC`
- 실행 명령: `corepack pnpm --filter @doodle/server smoke:bootstrap`
- 증상: `SMOKE_FAIL server bootstrap failed (name=Error code=ECONNREFUSED syscall=querySrv)`
- 추가 확인: Node `dns.resolveSrv()`도 `DNS_SRV_FAIL code=ECONNREFUSED syscall=querySrv`로 실패
- 의미: MongoDB shard의 `27017` 포트 연결 이전에, `mongodb+srv://` connection string이 사용하는 SRV DNS 조회가 Node 런타임에서 거부되고 있다.
- secret 처리: `.env`, MongoDB URI, Firebase private key, token 값은 출력하지 않았다.

사용자가 확인할 항목:

- Windows DNS 서버를 일시적으로 `1.1.1.1` 또는 `8.8.8.8` 같은 public DNS로 변경한 뒤 재시도
- VPN, 보안 DNS, 백신, 방화벽, 공유기 보안 기능이 SRV DNS query를 막는지 확인
- `ipconfig /flushdns` 실행 후 새 터미널에서 재시도
- MongoDB Atlas의 `Connect > Drivers`에서 SRV가 아닌 standard connection string 옵션을 사용할 수 있는지 확인
- standard connection string을 사용할 경우 username/password/full URI를 채팅이나 로그에 출력하지 말고 로컬 `.env`에서만 교체

확인 후 재시도 명령:

```bash
corepack pnpm --filter @doodle/server smoke:bootstrap
```
