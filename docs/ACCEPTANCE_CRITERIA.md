# 수용 기준

## MVP 완료 기준

- [ ] 사용자는 Firebase Authentication으로 로그인할 수 있다.
- [ ] 로그인한 사용자는 방을 생성하고 6자리 방 코드를 확인할 수 있다.
- [ ] 다른 사용자는 방 코드로 방에 입장할 수 있다.
- [ ] 참가자 목록이 같은 방 사용자에게 동기화된다.
- [ ] API와 Socket 연결은 Firebase ID Token 없이는 차단된다.
- [ ] 참가자는 허용된 이미지 파일을 5MB 이하로 업로드할 수 있다.
- [ ] 유해 이미지 또는 검토가 필요한 이미지는 AI Server moderation을 통해 GridFS 저장 전에 차단된다.
- [ ] 원본 이미지는 GridFS에 저장되고 metadata는 MongoDB에 저장된다.
- [ ] 방장은 게임/라운드를 시작할 수 있다.
- [ ] 서버는 미사용 이미지 중 하나를 랜덤 선택한다.
- [ ] 선택된 이미지 위에 Canvas drawing을 할 수 있다.
- [ ] 드로잉 이벤트는 stroke 단위 또는 throttle batch 단위로 동기화된다.
- [ ] 같은 방 사용자끼리 채팅할 수 있다.
- [ ] 라운드 타이머 종료 후 드로잉 이벤트가 차단된다.
- [ ] 결과 이미지는 GridFS에 저장된다.
- [ ] 결과 갤러리에서 결과 목록을 확인하고 다운로드할 수 있다.
- [ ] Render 로컬 파일 시스템에 장기 저장 파일이 남지 않는다.

## Phase 0 문서 정리 완료 기준

- [ ] 허용된 문서와 `.codex` draft 파일만 수정한다.
- [ ] 앱 코드, scaffold, dependency 설치를 진행하지 않는다.
- [ ] reference PDF/DOCX/image 파일을 수정하지 않는다.
- [ ] Markdown 기준 문서가 생성 또는 정리된다.
- [ ] `AGENTS.md`가 짧은 최상위 규칙 문서로 유지된다.
- [ ] `docs/DOCUMENT_INDEX.md`에 source-of-truth와 reference artifact mapping이 정리된다.
- [ ] AI 작업 문서, Agent 역할 문서, Agent workflow 문서가 분리된다.
- [ ] 디자인 이미지가 디자인 문서에 연결된다.
- [ ] 충돌, 누락 정보, 남은 리스크를 보고한다.
