# 배포 및 운영 명세서

## 배포 대상

| 대상 | 배포 위치 | 비고 |
|---|---|---|
| Backend | Render Web Service | Express + Socket.IO 서버 |
| Frontend | Render Static Site 또는 Vercel/Netlify | React 정적 빌드 |
| Database | MongoDB Atlas | 서비스 데이터 및 GridFS |
| Auth | Firebase Authentication | 회원가입/로그인 |

## Render 설정

| 항목 | 값 |
|---|---|
| Service Type | Web Service |
| Runtime | Node |
| Build Command | `pnpm install --frozen-lockfile && pnpm build` |
| Start Command | `pnpm start` |
| Health Check Path | `/health` |
| Port | `process.env.PORT` 사용 |

reference 문서에는 Render 예시로 `npm install`, `npm start`가 적혀 있으나 저장소 원칙은 pnpm workspaces이므로 실제 구현 시 pnpm 명령을 우선한다.

## 환경변수

아래 값은 예시 이름만 문서화한다. 실제 값은 `.env`, GitHub Secrets, Render Environment에만 저장한다.

```txt
NODE_ENV
PORT
CLIENT_URL
MONGODB_URI
MONGODB_DB_NAME
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
SOCKET_CORS_ORIGIN
```

### Firebase Admin 환경변수 주의사항

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`는 서버 전용이다.
- 프론트엔드 bundle에는 Firebase Admin 관련 값이 포함되면 안 된다.
- `FIREBASE_PRIVATE_KEY` 값은 로그, 문서, 테스트 fixture에 출력하지 않는다.
- Render에는 환경변수 값으로만 등록하고 저장소에는 `.env.example`의 key 이름만 유지한다.
- private key 줄바꿈 복원은 서버 config 계층에서 처리하되, 복원된 값을 출력하지 않는다.

## 운영 체크리스트

- [ ] Render 환경변수 등록 완료
- [ ] MongoDB Atlas Network Access 설정 완료
- [ ] Firebase Auth 로그인 제공자 활성화 완료
- [ ] CORS Origin 운영 URL로 제한
- [ ] `/health` 응답 확인
- [ ] Socket.IO 연결 확인
- [ ] 이미지 업로드/다운로드 확인
- [ ] 라운드 진행/결과 저장 확인

## 운영 주의사항

| 항목 | 주의사항 |
|---|---|
| Render 무료 플랜 | 비활성 상태에서 서버가 잠들 수 있어 첫 접속 지연 발생 가능 |
| Socket.IO | MVP는 단일 인스턴스 기준. 다중 인스턴스는 Redis/Mongo adapter 검토 필요 |
| 파일 업로드 | Render 로컬 디스크에 결과를 저장하지 않음 |
| 이미지 용량 | 업로드 제한과 이미지 리사이징이 없으면 DB 용량이 빠르게 증가 |
| 보안 | Firebase Admin private key와 MongoDB URI를 GitHub에 커밋하지 않음 |
