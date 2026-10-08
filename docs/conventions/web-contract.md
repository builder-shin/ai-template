# web 계약 동기화

이 문서는 템플릿 저장소를 유지하는 절차다. 복사한 web 프로젝트는 자기 `docs/recipes/change-contract.md`를 따른다.

## 파일 순서

1. 루트 `contract/typespec/src/`를 고친다. API 규약은 [JSON:API](jsonapi.md), 새 에러 코드는 [에러 코드](error-codes.md)를 따른다. 실시간 선언은 `contract/typespec/src/realtime.tsp`에 둔다.
2. 루트에서 `pnpm gen`한다. `contract/openapi.yaml`, `contract/mock/src/generated/`, 적합성 타입은 생성기로만 만든다.
3. 루트 `contract/mock/src/modules/`의 핸들러·서비스·문서와 `contract/mock/test/`를 계약에 맞춘다. mock의 `AGENTS.md`를 읽고 기존 상태·권한·오류·이벤트 규칙을 보존한다. 테스트부터 RED를 확인하고 구현 뒤 GREEN을 확인한다.
4. 새 에러를 추가했으면 루트 규약과 `shared/nextjs/messages/shared/{ko,en}.json`을 함께 맞춘다. web 화면 문구는 `templates/nextjs/messages/{ko,en}.json`에 둔다. web 기능은 공개 `index.ts`, 읽기는 Server Component, 쓰기는 server-only Action·`toFormResult`, 로딩은 스피너·스켈레톤 규칙을 따른다.
5. 루트에서 아래 명령을 차례로 실행한다. web의 생성기를 실행해 공유 원본의 API 타입·에러 코드·실시간 타입을 먼저 만든다. 설치된 web 의존성을 쓰며 생성 결과를 원본에 직접 쓴다. `pnpm sync`만 TypeSpec·목·OpenAPI·규약·공유 코드를 사본에 복사한다. `templates/nextjs/contract/`, `docs/conventions/`와 manifest가 관리하는 공유 사본은 직접 고치지 않는다.

```sh
pnpm gen
pnpm --dir templates/nextjs exec tsx ../../scripts/src/sync/gen-nextjs.mjs
pnpm sync
```

6. web의 queries·Action·모델·화면·테스트를 새 생성 타입에 맞춘다. mock과 같은 계약을 쓰는 외부 백엔드도 구현을 맞춘 뒤 연결한다. 실제 API 테스트를 줄여 차이를 숨기지 않는다.

## 확인

저장소 루트에서 순서대로 실행한다. web check·build·E2E는 빌드 산출물을 공유하므로 동시에 돌리지 않는다.

```sh
pnpm check
pnpm --dir templates/nextjs check
pnpm --dir templates/nextjs build
pnpm --dir templates/nextjs test:e2e
pnpm conformance mock
pnpm web-e2e fastapi
```

루트 check의 `verify-templates`는 공유 사본이 원본과 같은지 검사한다. web check는 생성물·타입·i18n·경계·실제 목 통합을 확인한다. conformance mock은 계약 흐름을, 두 E2E는 같은 사용자 흐름을 확인한다.

FastAPI E2E는 루트 runner가 전용 `ai-template-web-e2e-<실행 ID>` 프로젝트와 임시 볼륨만 소유한다. 실행 전후 `docker compose ls -a`로 개발 프로젝트가 그대로인지 확인한다. 개발 FastAPI compose나 `pnpm conformance fastapi`로 대신하지 않는다.
