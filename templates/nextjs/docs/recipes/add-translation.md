# 번역 추가

모든 명령과 경로는 이 프로젝트 루트 기준이다. ko는 `/`, en은 `/en`이며 메시지 타입은 ko에서 파생한다.

## 파일 순서

1. [스택](../stack.md)의 설치된 next-intl 버전 문서를 읽고 사용할 namespace·키·ICU 인자를 정한다. 기존 기능의 namespace를 우선 쓴다.
2. 앱 화면 문구는 `messages/ko.json` → `messages/en.json`, 공통 컴포넌트·에러 문구는 `messages/shared/ko.json` → `messages/shared/en.json` 순서로 **같은 키와 같은 ICU 인자**를 채운다. 같은 키를 두 카탈로그에 넣지 않는다. 예를 들어 posts에 `count` 키를 더할 때 각각 `"{count}개의 글"`, `"{count, plural, one {# post} other {# posts}}"`를 넣는다. JSON 키 안에 점을 넣지 않고 중첩 객체로 만든다.
3. Server Component는 `getTranslations("posts")`, 클라이언트 컴포넌트는 `useTranslations("posts")`와 `t("count", { count })`를 쓴다. 문구를 위해 컴포넌트를 클라이언트로 바꾸지 않는다. `src/lib/i18n/types.d.ts`의 ko 기반 선언은 새 키를 자동으로 읽으므로 타입 목록을 손으로 복제하지 않는다.
4. 날짜·숫자는 `getFormatter`·`useFormatter`로 표시한다. 요청 설정 `src/lib/i18n/request.ts`와 Provider가 공유하는 `TIME_ZONE`을 유지하고 실행 환경의 기본 시간대를 쓰지 않는다. 로케일 링크는 `src/lib/i18n/navigation.ts`의 `Link`·`getPathname`을 쓴다.
5. 새 API 에러는 [계약 확장](change-contract.md)으로 먼저 선언한다. 공통 ko/en 카탈로그의 `errors` 아래에 코드와 같은 중첩 키를 넣고 `meta.params`의 인자로 번역한다. Action의 `toFormResult`는 현재 locale과 실제 입력칸 목록을 받는다. 백엔드 영어 detail을 UI 문구로 쓰지 않는다.
6. 기능 옆 컴포넌트 검사나 `scripts/http/`·`e2e/`에서 ko/en의 문구·오류·ICU 값과 이동을 확인한다. 개수 예시는 0·1·2, 날짜는 같은 시각을 두 언어로 확인한다. 카탈로그 키 목록을 베끼는 테스트는 만들지 않는다.

## 규칙

- app·다른 기능은 공개 `index.ts`를 쓴다. 읽기는 Server Component, 쓰기는 server-only Action이며 번역 추가로 API·세션을 클라이언트에 가져오지 않는다.
- 폼은 `useActionState`·`<form action>`·`toFormResult`를 보존한다. 필드 label·오류·버튼·alt·접근성 이름도 번역한다.
- 로딩 문구는 두 카탈로그에도 넣지 않는다. 스피너는 기존 `Spinner`의 `accessibility.spinner`를 화면 낭독기용 `aria-label`로만 쓰고 스켈레톤은 장식으로 둔다.
- `src/lib/i18n/routing.ts`의 ko/en·as-needed, `NEXT_LOCALE`, 계정 로케일 우선순위를 유지한다. 새 언어 추가는 별도 라우팅·인증·테스트 변경이다.

## 확인

개발 서버를 종료하고 3100·4110을 비운 뒤 프로젝트 루트에서 순서대로 실행한다.

```sh
pnpm fix
pnpm check
pnpm build
pnpm test:e2e
```

check의 i18n 단계는 공통·앱 각각의 ko/en 키·빈 값, 두 카탈로그의 중복 키, 공통 카탈로그의 모든 계약 에러 코드 번역을 검사한다. ICU 인자·실제 표시·계정 언어·URL·선택 쿠키는 컴포넌트·HTTP·E2E에서 확인한다. 테스트의 Provider에는 `src/lib/i18n/catalogs.ts`가 내보내는 ko/en 병합 결과를 쓴다.
