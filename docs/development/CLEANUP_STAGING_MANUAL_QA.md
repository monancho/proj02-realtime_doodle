# Cleanup Staging Manual QA

이 문서는 `PHASE-BE-CLEANUP-STAGING-MANUAL-QA-PLAN` 기준의 수동 QA 절차다. 실제 production database에서는 실행하지 않는다.

## Safety Rules

- production MongoDB/Render 환경에서는 이 절차를 수행하지 않는다.
- `.env`, MongoDB URI, Firebase private key, token, raw credential 값은 문서/로그/스크린샷에 남기지 않는다.
- 검증 대상은 staging database 또는 local test database로 제한한다.
- QA용 roomCode, user nickname, file count 같은 안전한 요약값만 기록한다.
- raw GridFS `fileId`, ObjectId, URI, token, secret 값은 기록하지 않는다.

## Test Data Setup

만료 cleanup 검증용 test data는 다음 조건을 만족해야 한다.

1. `rooms` collection에 `status: "finished"` room을 만든다.
2. `finishedAt`은 현재 시각보다 24시간 이상 과거로 둔다.
3. 가능하면 `expiresAt`도 현재 시각보다 과거로 둔다.
4. 같은 `roomCode`를 가진 `images` metadata를 1개 이상 만든다.
5. 같은 `roomCode`를 가진 `results` metadata를 1개 이상 만든다.
6. `images.fileId`는 `originalImages.files`와 `originalImages.chunks`에 연결된 QA용 GridFS file을 가리켜야 한다.
7. `results.resultFileId`와 필요 시 `results.thumbnailFileId`는 `resultImages.files`와 `resultImages.chunks`에 연결된 QA용 GridFS file을 가리켜야 한다.
8. 비교용으로 삭제되면 안 되는 `waiting`, `starting`, `playing`, 또는 보관 기간 내 `finished` room도 각각 1개 이상 준비한다.

## Pre-Cleanup Count Check

cleanup 실행 전 다음 count를 기록한다. 값 자체는 QA용 count만 기록하고 raw id는 기록하지 않는다.

| Target | Check |
|---|---|
| `rooms` | 만료된 `finished` QA room count |
| `images` | QA roomCode에 연결된 image metadata count |
| `results` | QA roomCode에 연결된 result metadata count |
| `originalImages.files` | QA original image GridFS files count |
| `originalImages.chunks` | QA original image GridFS chunks count |
| `resultImages.files` | QA result image GridFS files count |
| `resultImages.chunks` | QA result image GridFS chunks count |

비교용 room의 count도 함께 기록해 cleanup 이후 유지되는지 확인한다.

## Cleanup Execution

MVP 구현은 서버 시작 시 cleanup을 1회 실행한다.

1. staging/local test database를 가리키는 안전한 환경에서 server를 시작한다.
2. startup log에서 cleanup success/failure 문구를 확인한다.
3. log에는 삭제 count summary만 있어야 한다.
4. log에 raw fileId/ObjectId, MongoDB URI, token, Firebase private key, credential 값이 보이면 실패로 기록한다.
5. cleanup 실패가 발생해도 서버가 계속 부팅되는지 확인한다.

## Post-Cleanup Count Check

cleanup 실행 후 다음을 확인한다.

- 만료된 `finished` QA room은 `rooms`에서 삭제되어야 한다.
- 해당 `roomCode`의 `images` metadata는 삭제되어야 한다.
- 해당 `roomCode`의 `results` metadata는 삭제되어야 한다.
- 해당 original image GridFS file/chunk는 삭제되어야 한다.
- 해당 result image GridFS file/chunk는 삭제되어야 한다.
- 보관 기간 내 `finished` room은 삭제되면 안 된다.
- `waiting`, `starting`, `playing` room은 삭제되면 안 된다.
- 일부 GridFS file이 이미 없어도 cleanup은 가능한 항목을 계속 처리해야 한다.

## Rollback / Reset

staging/local QA에서 예상과 다르게 데이터가 삭제되거나 남는 경우:

1. 즉시 production 환경이 아닌지 다시 확인한다.
2. QA용 database snapshot 또는 test fixture로 database를 reset한다.
3. 실패한 count와 safe summary만 `TEST_REPORT.md`에 기록한다.
4. raw fileId/ObjectId, URI, token, secret 값은 기록하지 않는다.
5. cleanup query 조건(`status`, `expiresAt`, `finishedAt`, `updatedAt`)과 GridFS bucket name을 재점검한다.

## Pass Criteria

- 만료된 `finished` room과 연결된 metadata/GridFS data만 삭제된다.
- active room과 보관 기간 내 finished room은 유지된다.
- cleanup 실패가 서버 부팅을 막지 않는다.
- cleanup log에는 count와 안전한 고정 메시지만 포함된다.
- secret, URI, token, raw fileId/ObjectId가 출력되지 않는다.

## Remaining Manual QA

이 문서는 절차 계획이며 실제 staging/local test database에 대한 destructive cleanup 실행은 아직 수행하지 않았다. 배포 전 controlled staging data로 위 절차를 한 번 수행해야 한다.
