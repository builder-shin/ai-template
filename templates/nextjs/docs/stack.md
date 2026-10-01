# 버전과 공식 문서

먼저 설치된 버전의 문서를 읽는다. Next.js는 `node_modules/next/dist/docs`가 기준이다.
의존성은 `package.json`에 정확히 고정하고, lockfile을 커밋한다. pnpm의 `minimumReleaseAge: 1440`으로 공개 후 하루가 지난 버전만 설치한다. 아래는 W3 pin에 W4 Task 1의 Next 보안 패치를 반영한 버전이다.

| 도구                                                                         | 버전                     | 문서                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js / pnpm                                                               | 24 LTS / 12.6.0          | [Node](https://nodejs.org/docs/latest-v24.x/api/), [pnpm](https://pnpm.io/settings)                                                                                                            |
| Next.js / eslint-config-next                                                 | 16.3.8                   | 설치된 `node_modules/next/dist/docs`, [Next](https://nextjs.org/docs)                                                                                                                          |
| @next/env                                                                    | 16.3.8                   | [Next 환경 로더](https://nextjs.org/docs/app/guides/environment-variables#loading-environment-variables-with-nextenv)                                                                          |
| React / React DOM                                                            | 19.3.0                   | [React](https://react.dev/reference/react)                                                                                                                                                     |
| react-markdown / remark-gfm                                                  | 10.1.0 / 4.0.1           | [Markdown](https://github.com/remarkjs/react-markdown/tree/10.1.0), [GFM](https://github.com/remarkjs/remark-gfm/tree/4.0.1)                                                                   |
| @types/jsdom                                                                 | 30.0.0                   | [jsdom 타입](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/jsdom)                                                                                                       |
| Tailwind / PostCSS plugin                                                    | 4.3.3 / 4.3.3            | [Tailwind](https://tailwindcss.com/docs/installation/using-postcss)                                                                                                                            |
| shadcn CLI / Base UI                                                         | 4.21.0 / 1.8.0           | [shadcn](https://ui.shadcn.com/docs/components/base), [Base UI](https://base-ui.com/react/components/menu)                                                                                     |
| lucide-react                                                                 | 1.49.0                   | [Lucide](https://lucide.dev/guide/packages/lucide-react)                                                                                                                                       |
| cn / class-variance-authority / tw-animate-css                               | 0.4.0 / 0.7.1 / 1.4.0    | [cn](https://github.com/shadcn-ui/cn), [CVA](https://cva.style/docs), [애니메이션](https://github.com/Wombosvideo/tw-animate-css)                                                              |
| PostCSS                                                                      | 8.5.28                   | [PostCSS](https://postcss.org/)                                                                                                                                                                |
| Testing Library React / user-event / jsdom                                   | 16.3.3 / 14.6.7 / 30.1.1 | [컴포넌트](https://testing-library.com/docs/react-testing-library/intro/), [사용자 입력](https://testing-library.com/docs/user-event/intro/), [jsdom](https://github.com/jsdom/jsdom)          |
| TypeScript                                                                   | 6.0.3                    | [TypeScript](https://www.typescriptlang.org/docs/)                                                                                                                                             |
| Zod                                                                          | 4.6.5                    | [Zod](https://zod.dev/api)                                                                                                                                                                     |
| jose                                                                         | 6.2.12                   | [JWE 암호화](https://github.com/panva/jose/blob/v6.2.12/docs/jwt/encrypt/classes/EncryptJWT.md), [복호화](https://github.com/panva/jose/blob/v6.2.12/docs/jwt/decrypt/functions/jwtDecrypt.md) |
| next-intl                                                                    | 4.14.7                   | [라우팅](https://next-intl.dev/docs/routing/setup), [타입](https://next-intl.dev/docs/usage/typescript), [요청 설정](https://next-intl.dev/docs/usage/configuration)                           |
| openapi-typescript / openapi-fetch                                           | 7.13.0 / 0.17.0          | [타입 생성](https://openapi-ts.dev/), [클라이언트](https://openapi-ts.dev/openapi-fetch/api), [미들웨어](https://openapi-ts.dev/openapi-fetch/middleware-auth)                                 |
| yaml                                                                         | 2.9.1                    | [YAML](https://eemeli.org/yaml/)                                                                                                                                                               |
| ESLint / typescript-eslint                                                   | 10.11.0 / 8.71.0         | [ESLint](https://eslint.org/docs/latest/), [typescript-eslint](https://typescript-eslint.io/)                                                                                                  |
| eslint-plugin-boundaries                                                     | 7.2.0                    | [Boundaries](https://www.jsboundaries.dev/docs/overview/)                                                                                                                                      |
| @eslint/compat                                                               | 2.1.1                    | [ESLint 호환 도구](https://github.com/eslint/rewrite/tree/main/packages/compat)                                                                                                                |
| Prettier / tsx                                                               | 3.9.9 / 4.23.15          | [Prettier](https://prettier.io/docs/), [tsx](https://tsx.is/)                                                                                                                                  |
| Vitest                                                                       | 5.0.1                    | [Vitest](https://vitest.dev/guide/)                                                                                                                                                            |
| @playwright/test / playwright / playwright-core                              | 1.63.0 / 1.63.0 / 1.63.0 | [E2E](https://playwright.dev/docs/intro), [webServer](https://playwright.dev/docs/test-webserver)                                                                                              |
| @types/node                                                                  | 24.13.6                  | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                                                                                                                          |
| @types/react / @types/react-dom                                              | 19.3.0                   | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                                                                                                                          |
| server-only                                                                  | 0.0.1                    | [서버 전용 모듈](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)                                                                    |
| lefthook / Betterleaks                                                       | 2.1.14 / 1.8.1           | [lefthook](https://lefthook.dev/), [Betterleaks](https://github.com/betterleaks/betterleaks)                                                                                                   |
| next-devtools-mcp                                                            | 0.4.0                    | [Next 개발 도구](https://nextjs.org/docs/app/guides/mcp)                                                                                                                                       |
| @typespec/compiler / @typespec/http / @typespec/openapi / @typespec/openapi3 | 1.16.0                   | [TypeSpec](https://typespec.io/docs/)                                                                                                                                                          |
| hono / @hono/node-server                                                     | 4.13.11 / 2.1.3          | [Hono Node](https://hono.dev/docs/getting-started/nodejs)                                                                                                                                      |
| ajv / ajv-formats                                                            | 8.20.0 / 3.0.1           | [Ajv](https://ajv.js.org/), [형식 검증](https://ajv.js.org/packages/ajv-formats.html)                                                                                                          |
| socket.io / socket.io-client                                                 | 4.8.4 / 4.8.4            | [Socket.IO](https://socket.io/docs/v4/)                                                                                                                                                        |

Next의 관리 지침 삽입은 `agentRules: false`로 끈다. 설치 문서 `01-app/02-guides/ai-agents.md`에 있는 옵션이다.
typescript-eslint는 설계 버전 8.71.0을 쓴다. 경계 플러그인은 ESLint 10에서 실제 import 픽스처로 검증한다.
Next 설정이 가져오는 React 플러그인은 아직 ESLint 10의 context API를 지원하지 않아 `@eslint/compat` 2.1.1의 `fixupConfigRules`로 감싼다([공식 호환 도구](https://github.com/eslint/rewrite/tree/main/packages/compat)).

계약과 목의 의존성은 사본 package.json의 정확한 pin을 유지한다. 목의 `@ai-template/contract: workspace:*`는 이 프로젝트 안의 TypeSpec 사본만 가리킨다. Socket.IO 클라이언트 4.8.4는 web의 실시간 런타임 의존성이다. 2026-09-25 08:35 UTC에 공개되어 `minimumReleaseAge: 1440`을 만족한다.

W3에서 react-markdown은 공개 상세·편집기 미리보기의 HTML 제외 렌더링과 기본 URL 검사를, remark-gfm은 표 등 GFM을 맡는다. raw HTML 플러그인은 넣지 않는다. @types/jsdom은 기존 jsdom 30.1.1로 실제 SSR HTML을 읽는 통합 검사에 쓴다. 선택 당시 최신 안정판이며 공개 시각은 각각 2025-03-07 10:32 UTC, 2025-02-10 12:43 UTC, 2026-08-07 17:47 UTC여서 하루 규칙을 만족했다. Socket.IO는 실제 목 브라우저 연결·티켓·ack·이벤트를 검사했으며 FastAPI 대상은 W4에서 확인한다.

lockfile은 openapi-fetch의 `openapi-typescript-helpers` 0.1.0, Next 린트의 `eslint-plugin-import` 2.32.0·`eslint-plugin-jsx-a11y` 6.10.2·`eslint-plugin-react` 7.37.5도 고정한다. next-intl의 네이티브 전이 의존성 `@parcel/watcher` 2.6.0·`@swc/core` 1.16.12는 빌드 허용 목록에 추가했다. 공개 후 1440분 규칙은 유지한다.

CI는 위 @playwright/test의 CLI로 `pnpm exec playwright install --with-deps chromium`을 실행해 Chromium과 Linux 시스템 의존성을 설치한다. `pnpm setup`은 로컬 Chromium을 설치한다. 별도 에이전트 도구 `@playwright/cli` 0.1.22와 공식 skill은 W4 범위로 아직 설치하지 않았다.

공식 shadcn 스킬은 `shadcn@4.21.0` 태그(commit `7c9eaba1c0a6404c990c144a654792e3313c650d`)의 `skills/shadcn/` Markdown 파일을 그대로 담는다. 바이너리 아이콘과 도구별 에이전트 메타데이터는 제외한다. [원본](https://github.com/shadcn-ui/ui/tree/shadcn%404.21.0/skills/shadcn), [프로젝트 스킬](../.claude/skills/shadcn/SKILL.md).

### W4 호환성 확인 (2026-10-02)

Next.js·@next/env·eslint-config-next만 16.3.7에서 16.3.8로 올렸다. [16.3.8 공식 릴리스](https://github.com/vercel/next.js/releases/tag/v16.3.8)는 이미지 최적화의 SSRF와 메타데이터·캐시·개발 MCP의 보안 문제를 고친다. 다른 직접 의존성은 유지하며, lockfile은 Next의 SWC·린트 플러그인과 Next를 참조하는 peer 연결만 함께 바뀐다.

`pnpm view <패키지>@<버전> time --json`으로 확인한 npm 공개 시각과 1440분 뒤 설치 가능 시각은 다음과 같다. 모두 2026-10-02에 정책을 만족한다.

| 패키지                                                              | 버전   | 공개 시각(UTC)          | 설치 가능 시각(UTC)     |
| ------------------------------------------------------------------- | ------ | ----------------------- | ----------------------- |
| [next](https://registry.npmjs.org/next)                             | 16.3.8 | 2026-09-30 16:07:21.198 | 2026-10-01 16:07:21.198 |
| [@next/env](https://registry.npmjs.org/@next%2fenv)                 | 16.3.8 | 2026-09-30 15:56:43.745 | 2026-10-01 15:56:43.745 |
| [eslint-config-next](https://registry.npmjs.org/eslint-config-next) | 16.3.8 | 2026-09-30 15:59:39.390 | 2026-10-01 15:59:39.390 |
| [@playwright/cli](https://registry.npmjs.org/@playwright%2fcli)     | 0.1.22 | 2026-09-28 23:24:31.286 | 2026-09-29 23:24:31.286 |

Node 24 LTS를 유지한다. Node 26의 compiled JWT 호환성을 고치는 [Next PR #97492](https://github.com/vercel/next.js/pull/97492)는 아직 open·draft이며 병합되지 않았다. Next의 `engines.node >=20.9.0`만으로 Node 26에서 동작한다고 판단하지 않는다. 검증 환경은 Node 24.19.0이다.

TypeScript 6.0.3과 typescript-eslint 8.71.0도 유지한다. `pnpm view typescript-eslint@8.71.0 peerDependencies --json`과 [버전별 npm 메타데이터](https://registry.npmjs.org/typescript-eslint/8.71.0)의 TypeScript 범위는 `>=4.8.4 <6.1.0`으로 TS7을 포함하지 않는다. strict 설정도 유지한다.

`pnpm view @playwright/cli dist-tags --json`의 `latest`는 0.1.22다. [공식 릴리스](https://github.com/microsoft/playwright-cli/releases/tag/v0.1.22)와 공개 시각을 확인했으며, 이 안정판과 공식 skill은 W4 Task 9에서 추가한다. 기존 @playwright/test 1.63.0은 유지한다.

### 알려진 peer 경고

2026-10-01에 `pnpm peers check`와 각 패키지의 `pnpm view <패키지> versions`, `time`, `<패키지>@<버전> peerDependencies`로 확인했다. 아래는 버전 순으로 가장 최근 안정 릴리스 5개씩이며, 모두 공개 후 하루가 지났다. 최신 안정 릴리스에도 ESLint 10.11.0 또는 TypeScript 6.0.3을 포함하는 peer 선언이 없어 현재 pin을 유지한다.

| 패키지                 | 확인한 안정 버전                       | 최신 버전 공개 시각(UTC) | 최신 버전의 peer 선언                                                    |
| ---------------------- | -------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| eslint-plugin-import   | 2.29.0, 2.29.1, 2.30.0, 2.31.0, 2.32.0 | 2025-06-20 21:59:09.822  | eslint: `^2 \|\| ^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7.2.0 \|\| ^8 \|\| ^9` |
| eslint-plugin-jsx-a11y | 6.8.0, 6.9.0, 6.10.0, 6.10.1, 6.10.2   | 2024-10-26 04:45:18.067  | eslint: `^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8 \|\| ^9`             |
| eslint-plugin-react    | 7.37.1, 7.37.2, 7.37.3, 7.37.4, 7.37.5 | 2025-04-03 20:01:15.958  | eslint: `^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8 \|\| ^9.7`           |
| openapi-typescript     | 7.9.1, 7.10.0, 7.10.1, 7.12.0, 7.13.0  | 2026-02-11 16:02:25.378  | typescript: `^5.x`                                                       |

이 선언 범위 차이 때문에 `pnpm peers check`는 실패한다. 현재 템플릿의 린트·타입·계약 생성 검사와 인증 E2E에서는 동작하며, React 플러그인의 context API는 위의 `@eslint/compat`으로 보완한다. 경고를 없애기 위한 peer 허용 규칙이나 강제 override는 두지 않는다. 상위 패키지가 지원 범위를 넓힌 안정 버전을 내면 하루 뒤 실제 검사로 확인하고 정확한 pin으로 갱신한다.
