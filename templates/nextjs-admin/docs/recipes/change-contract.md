# 계약 확장

1. `contract/typespec/src/`의 TypeSpec을 고친다. `contract/openapi.yaml`은 직접 고치지 않는다.
2. `contract/mock/src/`의 수기 구현을 같은 계약으로 맞추고 실제 HTTP 테스트를 더한다.
3. `pnpm gen`으로 API·실시간·에러 타입을 갱신한다.
4. 에러 코드를 추가하면 `messages/shared/{ko,en}.json`과 `docs/conventions/error-codes.md`도 맞춘다.
5. `pnpm check`, `pnpm build`, `pnpm test:e2e`를 차례로 실행한다.
