# 계측

기본값은 `OTEL_ENABLED=false`다. 켜려면 환경의 `OTEL_ENABLED=true`,
`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`를 설정하고 빌드 뒤 실행한다.

```bash
pnpm build
node --import ./dist/core/telemetry/register.js dist/main.js
```

SDK가 애플리케이션보다 먼저 HTTP와 pg를 계측한다. OTLP 내보내기는 SDK가
검증된 환경의 `OTEL_EXPORTER_OTLP_ENDPOINT`를 읽는다. 처리기 span은 경로
템플릿과 operationId를, Redis span은 명령 이름과 `db.system`만 기록한다.
키·명령 인자·명시 span의 예외 원문은 넣지 않는다. 복제 연결에도 Redis 계측을
적용한다. 요청 로그와 오류 문서의 traceId는 활성 HTTP span을 따른다.

헬스 HTTP 요청은 계측에서 제외되며 내부 DB·Redis 계측도 억제한다.
헬스 확인 실패와 속도 제한 저장소 장애의 진단에는 고정 분류만 남긴다.
속도 제한 저장소 장애는 기존대로 통과하고 실제 한도 초과는 429다.

CI에서는 인프라와 시드가 준비된 뒤 다음 프로브를 실행한다.
Task 22의 `nestjs` 작업이 이 명령을 연결한다.

```bash
pnpm build
pnpm exec tsx scripts/otel-probe.ts
```

프로브는 빌드한 API를 임시 포트에 띄우고 시드 계정으로 로그인한 뒤
인증된 `GET /api/v1/me`와 두 헬스 경로를 요청한다. 결과 JSON의
`http`, `handler`, `pg`, `redis`가 모두 양수이며 `sameTrace=true`,
`healthSpans=0`이어야 `complete=true`다. 실패하면 종료 코드 1을 내고
앱·SDK를 닫는다. 로컬에서는 외부 인프라 없이 단위 fixture만 실행한다.
