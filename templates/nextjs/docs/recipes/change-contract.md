# 계약 확장

이 저장소에서는 루트의 `contract/typespec/src/`를 고친 뒤 루트에서 `pnpm gen`, `pnpm sync`를 실행한다. 템플릿 사본을 직접 고치지 않는다.

독립 복사본에서는 다음 순서를 따른다.

1. `contract/typespec/src/`의 리소스와 operation을 고친다. 새 에러 코드는 `docs/conventions/error-codes.md`에도 같은 순서로 넣는다.
2. `pnpm gen`으로 `contract/openapi.yaml`, 목 타입, `src/lib/api/schema.d.ts`, `src/lib/generated/`를 다시 만든다.
3. `contract/mock/src/`에 핸들러와 테스트를 추가한다. API 문서는 `docs/conventions/jsonapi.md`를 따른다.
4. `pnpm check`로 생성물 최신 여부와 두 계약 패키지의 자체 검사까지 확인한다.
