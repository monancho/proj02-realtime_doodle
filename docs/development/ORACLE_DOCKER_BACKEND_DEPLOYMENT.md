# Oracle Docker 백엔드 배포 런북

날짜: 2026-06-08

## 범위

이 문서는 Realtime Doodle Relay 백엔드를 Oracle Cloud에서 Docker 컨테이너로 실행하기 위한 운영 런북이다. 프론트엔드는 Cloudflare Pages에서 정적 앱으로 제공한다.

- 백엔드 컨테이너: `apps/server`
- 워크스페이스 공유 패키지: `packages/shared`
- 프론트엔드: Cloudflare Pages, 이 컨테이너에서 제공하지 않음
- 인증: 브라우저는 Firebase Authentication, 백엔드는 Firebase Admin으로 ID Token 검증
- 저장소: MongoDB 및 GridFS

secret 값은 이 문서에 기록하지 않는다.

## Docker 이미지

저장소 루트에서 빌드한다.

```bash
docker build -f apps/server/Dockerfile -t realtime-doodle-server:local .
```

Dockerfile은 워크스페이스 루트 manifest, `apps/server`, `packages/shared`를 함께 복사한다. 백엔드가 `@doodle/shared`를 참조하기 때문이다.

현재 서버 런타임은 package script를 통해 `tsx`로 TypeScript 소스를 직접 실행한다.

```bash
pnpm --filter @doodle/server start
```

따라서 1차 Docker 이미지는 TypeScript 소스 실행에 필요한 의존성을 포함한다. 추후 최적화 단계에서는 서버를 JavaScript로 빌드한 뒤 runtime TypeScript 도구를 제거하는 방향을 검토할 수 있다.

## 런타임 환경 변수

환경 변수는 컨테이너 실행 시 주입한다. 문서에는 이름과 목적만 기록한다.

| 이름 | 목적 |
| --- | --- |
| `NODE_ENV` | 런타임 모드. 배포에서는 `production` 사용 |
| `PORT` | API, health, Socket.IO가 사용하는 컨테이너 HTTP 포트 |
| `CLIENT_URL` | HTTP CORS에서 허용할 Cloudflare 프론트엔드 origin 또는 comma-separated origin 목록 |
| `SOCKET_CORS_ORIGIN` | Socket.IO CORS에서 허용할 Cloudflare 프론트엔드 origin 또는 comma-separated origin 목록 |
| `MONGODB_URI` | MongoDB 연결 문자열. secret |
| `MONGODB_DB_NAME` | MongoDB 데이터베이스 이름 |
| `FIREBASE_PROJECT_ID` | Firebase Admin이 사용하는 Firebase project id |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service account email. credential metadata |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin private key. secret |

런타임 env 값을 Docker 이미지에 bake하지 않는다. Oracle container runtime 설정, secret manager, 또는 커밋되지 않는 host 관리 env 파일로 주입한다.

## Oracle 런타임 템플릿

컨테이너 실행 명령은 아래 형태를 기준으로 한다. placeholder 참조는 Oracle host 또는 Oracle runtime 설정에서만 실제 값으로 바꾼다. 값은 커밋하지 않는다.

```bash
docker run -d \
  --name realtime-doodle-server \
  --restart unless-stopped \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e CLIENT_URL="$CLOUDFLARE_FRONTEND_ORIGINS" \
  -e SOCKET_CORS_ORIGIN="$CLOUDFLARE_FRONTEND_ORIGINS" \
  -e MONGODB_URI="$MONGODB_URI" \
  -e MONGODB_DB_NAME="$MONGODB_DB_NAME" \
  -e FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
  -e FIREBASE_CLIENT_EMAIL="$FIREBASE_CLIENT_EMAIL" \
  -e FIREBASE_PRIVATE_KEY="$FIREBASE_PRIVATE_KEY" \
  realtime-doodle-server:local
```

운영 메모:

- `CLIENT_URL`, `SOCKET_CORS_ORIGIN`은 comma-separated origin 목록을 사용할 수 있다.
- 사용자에게 노출되는 백엔드 public URL은 HTTPS만 사용한다.
- 긴 `docker run` 명령에 secret 값을 직접 쓰면 shell history에 남을 수 있으므로 host 관리 env 주입 또는 secret manager를 우선한다.
- host env 파일을 쓴다면 저장소 밖에 두고 파일 권한을 제한한다.
- 영구 upload 디렉터리를 mount하지 않는다. 원본 이미지와 결과 이미지는 MongoDB GridFS가 authoritative storage다.

## 로컬 Smoke 형태

유효한 runtime env 값으로 컨테이너를 시작한 뒤 아래를 확인한다.

```bash
curl -f http://localhost:4000/health
```

기대 결과: HTTP 200 및 service status JSON.

Docker 이미지에는 설정된 `PORT`의 `/health`를 호출하는 container `HEALTHCHECK`도 포함되어 있다.

## 로컬 검증 결과

최신 로컬 검증일: 2026-06-08

- `docker build -f apps/server/Dockerfile -t realtime-doodle-server:local .`: PASS
- 이미지 제외 확인: `.env`, root `package-lock.json`, 알려진 로컬 로그, `.codex/server-local.log` 미포함 PASS
- 필수 환경 변수 없이 runtime 시작: expected failure. 컨테이너가 서버 명령을 시작한 뒤 누락된 env 이름만 보고하고 종료함

전체 `/health` smoke는 사용자가 제공하는 MongoDB 및 Firebase Admin runtime 값이 필요하다. 해당 값은 컨테이너 runtime에 주입해야 하며, 문서나 커밋에 기록하지 않는다.

## Oracle Cloud 체크리스트

- Oracle network/security-list 계층에서 필요한 public port만 연다.
- production 사용 전 HTTPS를 reverse proxy 또는 load balancer에서 종료한다.
- `/socket.io` WebSocket upgrade 요청을 컨테이너로 전달한다.
- `/api` 하위 HTTP API 요청을 컨테이너로 전달한다.
- `/health`는 smoke check와 container health check 용도로 접근 가능해야 한다.
- `CLIENT_URL`, `SOCKET_CORS_ORIGIN`에는 허용할 Cloudflare production/custom/preview origin을 설정한다.
- wildcard CORS origin은 사용하지 않는다.
- 업로드 원본이나 생성 결과를 Oracle local disk에 저장하지 않는다. MongoDB GridFS가 authoritative storage다.
- Oracle runtime이 MongoDB와 Firebase Admin 검증 의존성에 접근 가능한지 확인한다.
- secret rotation은 배포와 QA가 끝난 뒤 사용자가 직접 수행한다.

## 기존 Docker Compose 및 Caddy 통합 메모

현재 Oracle 인스턴스에는 이미 Docker 기반 미니 프로젝트가 배포되어 있으며, 컨테이너 이름이 `infra-proxy-1`, `infra-api-1` 형태다. 이는 Docker Compose project 이름이 `infra`일 가능성이 높다.

기존 구조를 전제로 할 때 Realtime Doodle Relay backend는 아래 방식으로 붙이는 것이 안전하다.

- Caddy 컨테이너가 public `80`, `443`을 계속 담당한다.
- Doodle backend 컨테이너는 public `80`, `443`을 직접 bind하지 않는다.
- Doodle backend는 기존 Caddy와 같은 Docker network에 붙인다.
- Doodle backend internal port는 `4000`을 사용한다.
- Caddy route는 별도 backend domain 또는 subdomain을 Doodle backend 컨테이너의 `4000` port로 reverse proxy한다.
- 기존 `infra-api-1` route와 container는 건드리지 않는다.

Docker Compose를 사용 중이라면 새 service는 아래 형태를 참고한다. 값은 예시 이름이며 실제 secret 값은 작성하지 않는다.

```yaml
services:
  doodle-api:
    image: realtime-doodle-server:local
    container_name: realtime-doodle-server
    restart: unless-stopped
    expose:
      - "4000"
    environment:
      NODE_ENV: production
      PORT: "4000"
      CLIENT_URL: ${CLOUDFLARE_FRONTEND_ORIGINS}
      SOCKET_CORS_ORIGIN: ${CLOUDFLARE_FRONTEND_ORIGINS}
      MONGODB_URI: ${MONGODB_URI}
      MONGODB_DB_NAME: ${MONGODB_DB_NAME}
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
      FIREBASE_CLIENT_EMAIL: ${FIREBASE_CLIENT_EMAIL}
      FIREBASE_PRIVATE_KEY: ${FIREBASE_PRIVATE_KEY}
    networks:
      - infra

networks:
  infra:
    external: true
```

주의:

- 실제 network 이름은 Oracle host에서 `docker network ls`로 확인한다.
- Compose project 내부 network라면 이름이 `infra_default`처럼 생성되었을 수 있다.
- 기존 Caddy compose 파일을 수정하는 경우, 기존 service와 route를 삭제하지 않는다.
- Compose env 파일을 사용한다면 저장소 밖에 두고 파일 권한을 제한한다.
- `ports: ["4000:4000"]` 대신 `expose: ["4000"]`을 우선한다. public ingress는 Caddy가 담당한다.

## Caddy route 템플릿

기존 Caddyfile에 Doodle backend용 site block을 추가하는 방식이 가장 단순하다. 실제 domain 값은 사용자가 Oracle/Caddy 설정에서만 입력한다.

```caddyfile
{$DOODLE_BACKEND_DOMAIN} {
  reverse_proxy realtime-doodle-server:4000
}
```

Caddy는 일반적으로 WebSocket proxy를 자동 처리하지만, 배포 smoke QA에서 `/socket.io` 연결과 upgrade를 반드시 확인한다.

확인할 route:

- `GET /health`
- `/api/*`
- `/socket.io/*`

## Reverse Proxy 및 WebSocket 체크리스트

Docker 앞에 Nginx 또는 다른 reverse proxy를 둘 경우:

- `/health`, `/api/*`, `/socket.io/*`를 컨테이너 port로 proxy한다.
- `Host`, `X-Forwarded-Proto`, `X-Forwarded-For` header를 보존한다.
- Socket.IO를 위해 HTTP/1.1 proxying을 활성화한다.
- WebSocket upgrade를 위해 `Upgrade`, `Connection` header를 전달한다.
- 이미지 업로드 payload를 감당할 수 있도록 request body limit을 충분히 설정한다.
- HTTPS 인증서 자동 갱신이 동작하는지 확인한다.
- 백엔드 public origin이 Cloudflare `VITE_API_BASE_URL`, `VITE_SOCKET_URL` 값과 정확히 일치하는지 확인한다.

## Cloudflare Pages 연결

Cloudflare Pages에는 아래 env를 설정한다.

- `VITE_API_BASE_URL`: Oracle 백엔드 public HTTPS origin
- `VITE_SOCKET_URL`: Socket.IO가 별도 origin/route를 쓰지 않는다면 Oracle 백엔드 public HTTPS origin
- Firebase web config 변수: 백엔드가 사용하는 Firebase project와 같은 project의 web app config

Firebase Authentication authorized domains에는 사용자가 접속할 Cloudflare production/custom 프론트엔드 domain이 포함되어야 한다.

## Cloudflare Pages 체크리스트

- build command가 monorepo workspace에서 web app을 빌드하도록 설정되어 있는지 확인한다.
- publish directory가 `apps/web`의 Vite output을 가리키는지 확인한다.
- `VITE_API_BASE_URL`을 Oracle 백엔드 HTTPS origin으로 설정한다.
- `VITE_SOCKET_URL`을 Oracle 백엔드 HTTPS origin으로 설정한다. Socket.IO를 다른 origin으로 라우팅할 때만 별도 값을 쓴다.
- Firebase web config env 이름을 백엔드와 같은 Firebase project 기준으로 설정한다.
- env 변경 후 Cloudflare Pages를 rebuild한다. Vite env 값은 정적 frontend bundle에 bake된다.
- preview deployment QA가 필요하면 preview origin도 backend `CLIENT_URL`, `SOCKET_CORS_ORIGIN`에 추가한다.

## Firebase 체크리스트

- Google sign-in provider를 활성화한다.
- Cloudflare production domain을 authorized domain에 추가한다.
- 최종 custom frontend domain은 public QA 전에 authorized domain에 추가한다.
- preview deployment에서 로그인 QA가 필요할 때만 preview domain을 추가한다.
- frontend Firebase web app config와 backend Firebase Admin credential이 같은 project에 속하는지 확인한다.
- Firebase Admin private key 값은 docs, chat, git commit, shell history, Docker image layer에 붙여넣지 않는다.

## MongoDB 및 GridFS 체크리스트

- Oracle에서 MongoDB에 필요한 network path로 접근 가능한지 확인한다.
- MongoDB auth user가 target database에 필요한 최소 권한을 갖는지 확인한다.
- `MONGODB_DB_NAME`이 의도한 production 또는 staging database를 가리키는지 확인한다.
- 업로드 원본과 생성 결과가 GridFS에 저장되는지 확인한다.
- production data를 사용하기 전에 room cleanup 정책을 이해한다.
- persistence를 Oracle local filesystem으로 바꾸지 않는다.

## 배포 후 Smoke QA 순서

배포 후 아래 순서로 확인한다.

1. Oracle 백엔드 public HTTPS URL에서 `GET /health` 확인
2. Cloudflare frontend가 static asset 오류 없이 로드되는지 확인
3. Cloudflare frontend domain에서 Firebase login popup이 완료되는지 확인
4. 인증된 API 호출이 성공하는지 확인. 예: profile upsert 또는 room fetch
5. 방 생성과 방 입장이 동작하는지 확인
6. Cloudflare frontend에서 Oracle backend로 Socket.IO 연결이 되는지 확인
7. 두 브라우저에서 drawing sync가 되는지 확인
8. 이미지 업로드가 동작하고 업로드 metadata가 보이는지 확인
9. round start, round end, local preview, `result-saved` 흐름 확인
10. final gallery 로드 확인
11. result download 확인

중간 단계가 실패하면 다음 단계로 넘어가지 말고 해당 계층을 먼저 고친다.

## Rollback 및 Triage

Rollback trigger:

- 컨테이너 시작 후 `/health` 실패
- production frontend domain에서 Firebase login 실패
- Cloudflare origin에서 API CORS preflight 실패
- Cloudflare origin에서 Socket.IO 연결 또는 upgrade 실패
- 배포 QA에서 이미지 업로드 또는 result generation 실패
- 저장된 result의 gallery/download 실패

먼저 볼 항목:

- 컨테이너 상태와 restart count
- 컨테이너 로그. 단, secret 값 출력은 피한다
- Oracle firewall/security-list port rule
- reverse proxy HTTPS 및 WebSocket upgrade 설정
- `CLIENT_URL`, `SOCKET_CORS_ORIGIN`의 origin 철자, scheme, comma separation
- Cloudflare `VITE_API_BASE_URL`, `VITE_SOCKET_URL` 값과 Cloudflare rebuild 여부
- Firebase authorized domains
- MongoDB network access 및 database name

Rollback options:

- 새 컨테이너를 중지하고 이전 known-good image tag로 재시작한다.
- Cloudflare env를 임시로 이전 backend origin으로 되돌리고 Cloudflare Pages를 rebuild한다.
- deployed smoke QA가 통과할 때까지 이전 image tag를 유지한다.
