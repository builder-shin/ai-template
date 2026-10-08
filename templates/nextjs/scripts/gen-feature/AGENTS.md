# 기능 생성기

- 템플릿 루트에서 `pnpm gen:feature <복수형 이름> [--singular <끝 단어의 단수형>]`으로 실행한다. `../gen-feature.ts`는 CLI, 이 폴더는 이름·변환·생성을 맡는다.
- 골든 `src/features/posts`·`src/app/[locale]/posts`·`src/app/[locale]/my-posts`와 두 HTTP 테스트를 복사한다. ko/en namespace와 `src/lib/session/routes.ts`의 로그인 보호도 등록한다.
- 이름은 20자 이하 영어 소문자 복수형 kebab-case다. 단수·복수의 camel·Pascal·snake·대문자·kebab 표기를 한 번씩 바꾸며 예약어와 기존 경로·namespace 충돌은 거절한다.
- TypeScript AST로 식별자를 바꾼다. 계약 타입·API 경로·JSON:API type·에러 코드·실시간 채널과 HTTP POST는 보존한다. 새 기능은 계약을 채울 초안이다.
- `gen:feature: 빼기`는 한 줄, `빼기 시작`·`빼기 끝`은 구간을 제외한다. `그대로`는 같은 줄의 이름을 보존하고 `고칠 곳 — 설명`은 검토 목록에 남긴다.
- 모든 입력·충돌과 포맷 결과를 확인한 뒤 쓴다. 기존 파일을 덮어쓰지 않으며 거절할 때 부분 생성하지 않는다. 골든 폴더에는 TS·TSX·Markdown 텍스트만 둔다.
- `pnpm test scripts/gen-feature.test.ts scripts/gen-feature/names.test.ts`로 임시 사본의 타입·린트·테스트와 거절·정리를 확인한다. 테스트 사본은 환경 파일을 읽거나 복사하지 않는다.
- [기능 추가](../../docs/recipes/add-feature.md)에 출력할 고칠 곳과 편집 순서를 함께 반영한다. 헤더·홈 링크는 생성 뒤 기능에 맞게 고친다.
