# 버전과 공식 문서

먼저 설치된 버전의 문서를 읽는다. Next.js는 `node_modules/next/dist/docs`가 기준이다.
의존성은 `package.json`에 정확히 고정하고, lockfile을 커밋한다. pnpm은 공개 후 1440분이 지난 버전만 설치한다.

| 도구                                           | 버전                     | 문서                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js / pnpm                                 | 24 LTS / 12.6.0          | [Node](https://nodejs.org/docs/latest-v24.x/api/), [pnpm](https://pnpm.io/settings)                                                                                                            |
| Next.js / eslint-config-next                   | 16.3.7                   | 설치된 `node_modules/next/dist/docs`, [Next](https://nextjs.org/docs)                                                                                                                          |
| React / React DOM                              | 19.3.0                   | [React](https://react.dev/reference/react)                                                                                                                                                     |
| Tailwind / PostCSS plugin                      | 4.3.3 / 4.3.3            | [Tailwind](https://tailwindcss.com/docs/installation/using-postcss)                                                                                                                            |
| shadcn CLI / Base UI                           | 4.21.0 / 1.8.0           | [shadcn](https://ui.shadcn.com/docs/components/base), [Base UI](https://base-ui.com/react/components/menu)                                                                                     |
| lucide-react                                   | 1.49.0                   | [Lucide](https://lucide.dev/guide/packages/lucide-react)                                                                                                                                       |
| cn / class-variance-authority / tw-animate-css | 0.4.0 / 0.7.1 / 1.4.0    | [cn](https://github.com/shadcn-ui/cn), [CVA](https://cva.style/docs), [애니메이션](https://github.com/Wombosvideo/tw-animate-css)                                                              |
| PostCSS                                        | 8.5.28                   | [PostCSS](https://postcss.org/)                                                                                                                                                                |
| Testing Library React / user-event / jsdom     | 16.3.3 / 14.6.7 / 30.1.1 | [컴포넌트](https://testing-library.com/docs/react-testing-library/intro/), [사용자 입력](https://testing-library.com/docs/user-event/intro/), [jsdom](https://github.com/jsdom/jsdom)          |
| TypeScript                                     | 6.0.3                    | [TypeScript](https://www.typescriptlang.org/docs/)                                                                                                                                             |
| Zod                                            | 4.6.5                    | [Zod](https://zod.dev/api)                                                                                                                                                                     |
| jose                                           | 6.2.12                   | [JWE 암호화](https://github.com/panva/jose/blob/v6.2.12/docs/jwt/encrypt/classes/EncryptJWT.md), [복호화](https://github.com/panva/jose/blob/v6.2.12/docs/jwt/decrypt/functions/jwtDecrypt.md) |
| next-intl                                      | 4.14.7                   | [라우팅](https://next-intl.dev/docs/routing/setup), [타입](https://next-intl.dev/docs/usage/typescript), [요청 설정](https://next-intl.dev/docs/usage/configuration)                           |
| openapi-typescript / openapi-fetch             | 7.13.0 / 0.17.0          | [타입 생성](https://openapi-ts.dev/), [클라이언트](https://openapi-ts.dev/openapi-fetch/api), [미들웨어](https://openapi-ts.dev/openapi-fetch/middleware-auth)                                 |
| ESLint / typescript-eslint                     | 10.11.0 / 8.71.0         | [ESLint](https://eslint.org/docs/latest/), [typescript-eslint](https://typescript-eslint.io/)                                                                                                  |
| eslint-plugin-boundaries                       | 7.2.0                    | [Boundaries](https://www.jsboundaries.dev/docs/overview/)                                                                                                                                      |
| Prettier / tsx                                 | 3.9.9 / 4.23.15          | [Prettier](https://prettier.io/docs/), [tsx](https://tsx.is/)                                                                                                                                  |
| Vitest                                         | 5.0.1                    | [Vitest](https://vitest.dev/guide/)                                                                                                                                                            |
| Playwright / @playwright/test                  | 1.63.0 / 1.63.0          | [E2E](https://playwright.dev/docs/intro), [webServer](https://playwright.dev/docs/test-webserver)                                                                                              |
| @types/node                                    | 24.13.6                  | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                                                                                                                          |
| @types/react / @types/react-dom                | 19.3.0                   | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                                                                                                                          |
| server-only                                    | 0.0.1                    | [서버 전용 모듈](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)                                                                    |
| lefthook / Betterleaks                         | 2.1.14 / 1.8.1           | [lefthook](https://lefthook.dev/), [Betterleaks](https://github.com/betterleaks/betterleaks)                                                                                                   |
| next-devtools-mcp                              | 0.4.0                    | [Next 개발 도구](https://nextjs.org/docs/app/guides/mcp)                                                                                                                                       |

Next의 관리 지침 삽입은 `agentRules: false`로 끈다. 설치 문서 `01-app/02-guides/ai-agents.md`에 있는 옵션이다.
typescript-eslint는 설계 버전 8.71.0을 쓴다. 경계 플러그인은 ESLint 10에서 실제 import 픽스처로 검증한다.
Next 설정이 가져오는 React 플러그인은 아직 ESLint 10의 context API를 지원하지 않아 `@eslint/compat` 2.1.1의 `fixupConfigRules`로 감싼다([공식 호환 도구](https://github.com/eslint/rewrite/tree/main/packages/compat)).

계약 도구는 TypeSpec 1.16.0, openapi-typescript 7.13.0, yaml 2.9.1을 고정한다. 개발 환경 로더 `@next/env`는 Next와 같은 16.3.7이다. 목은 Hono 4.13.11 / @hono/node-server 2.1.3 / Socket.IO 4.8.4 / Ajv 8.20.0을 원본 그대로 사용한다.

next-intl의 네이티브 의존성 `@parcel/watcher`와 `@swc/core`만 빌드 허용 목록에 더한다. 버전은 lockfile에 고정하며 공개 후 1440분 규칙은 유지한다.

공식 shadcn 스킬은 `shadcn@4.21.0` 태그(commit `7c9eaba1c0a6404c990c144a654792e3313c650d`)의 `skills/shadcn/` Markdown 파일을 그대로 담는다. 바이너리 아이콘과 도구별 에이전트 메타데이터는 제외한다. [원본](https://github.com/shadcn-ui/ui/tree/shadcn%404.21.0/skills/shadcn), [프로젝트 스킬](../.claude/skills/shadcn/SKILL.md).
