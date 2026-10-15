# 잡 추가

도메인의 `jobs.ts`에 처리기를 두고 `index.ts`로 등록 함수를 공개한다.
`src/modules/registry.ts`에서 `registerJob`으로 이름과 처리기를 등록한다.
잡 데이터에는 안정적인 id만 넣으며 메일 주소·본문·비밀은 넣지 않는다.

DB 변경 뒤 `afterCommit`에서 enqueue한다. 처리기는 같은 id의 재실행에도 안전해야
한다. 기본 시도 횟수와 지연, 주기 작업 제거, BullMQ 연결과 종료 순서는
[잡·메일 수명 절차](jobs.md)를 따른다. 주기 작업은 UTC와 고정 이름을 선언한다.

단위 시험은 commit 전 발행 금지·rollback·재시도·실패 보존을 검증한다.
실제 worker의 진행 중 commit과 scheduler 등록·종료는
[CI 수명 시험](../../tests/integration/jobs-lifecycle.test.ts)이 다룬다.
실제 Redis·DB·SMTP를 쓰는 통합 시험은 준비된 CI에서 실행한다.
