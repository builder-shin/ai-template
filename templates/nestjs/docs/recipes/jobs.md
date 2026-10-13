# 잡과 메일

작업 이름은 `<모듈>.<동사>`다. `registerDomain`에서 `registerJob`으로 처리기를 등록한다.
`JobQueue.enqueue(afterCommit, name, { id })`는 commit 뒤에만 잡을 넣는다.
처리기는 매 시도마다 id로 대상을 다시 읽고 발송 조건을 확인한다.
토큰이 필요한 메일은 매 시도마다 새 토큰을 발급하고 commit한 뒤 트랜잭션 밖에서 보낸다.
인증·파일 도메인의 실제 처리기와 주기 선언은 해당 도메인에서 추가한다.

운영 환경 변수를 준비하고 빌드한 뒤 `node dist/worker.js`와 `node dist/scheduler.js`를 별도 프로세스로 실행한다.
scheduler 프로세스는 하나만 띄운다. 여러 scheduler 프로세스를 함께 실행하는 것은 지원하지 않는다.
`registerPeriodic({ name, pattern, tz: "UTC" })`는 같은 이름의 BullMQ scheduler를 멱등 등록한다.
주기 잡의 id는 작업 이름이며 처리기는 이를 정리 작업의 식별자로 사용한다.
이름을 바꾸거나 선언을 지워도 기존 scheduler 항목은 남아 계속 잡을 만든다.
운영자가 이전 작업 이름의 scheduler를 명시적으로 제거해야 해당 잡 생성이 멈춘다.

worker의 Queue와 Worker는 `RedisClients.connection("bullmq")` 연결을 공유한다.
이 연결은 차단 명령을 지원하므로 명령별 시간 제한과 요청별 재시도 제한이 없다.
연결이 끊겼을 때 producer의 enqueue가 2초 안에 실패한다고 보장하지 않는다.
BullMQ가 내부에서 만드는 차단 연결은 BullMQ가 소유하고 닫는다.
일반 Redis 연결의 2초 시간 제한과 요청별 재시도 1회 정책은 유지한다.

처음 포함 최대 다섯 번 실행하며 재시도 n회의 지연은 `min(5000 * n, 60000) + random(0..1000)`밀리초다.
완료 잡은 지우고 최종 실패 잡은 failed 기록으로 남긴다.
통합 시험은 실제 지연·SMTP와 직접 구성한 host와 큐의 수동 종료를 확인하는 사례를 포함한다.
Nest 컨텍스트의 실제 DI 시작과 진행 중 잡의 종료 순서는 별도 운영·CI 검증에서 확인한다.

메일 파일은 `src/modules/<모듈>/templates/<ko|en>/<메일>.{subject.txt,txt,html}`에 둔다.
`loadMailTemplates`로 선택한 로케일을 읽고 `renderMail`로 `{{이름}}` 값을 치환한다.
HTML 값만 이스케이프하며 누락 값은 오류다. 하네스는 두 로케일의 세 형식 누락을 알린다.
`MailSender.send`는 `SMTP_URL`과 `MAIL_FROM`을 사용하고 발송 실패를 처리기에 전한다.
