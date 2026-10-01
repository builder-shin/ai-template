# 버전과 공식 문서

먼저 설치된 버전의 문서를 읽는다. Next.js는 `node_modules/next/dist/docs`가 기준이다.
의존성은 `package.json`에 정확히 고정하고, lockfile을 커밋한다. pnpm은 공개 후 1440분이 지난 버전만 설치한다.

| 도구                            | 버전             | 문서                                                                                                                        |
| ------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node.js / pnpm                  | 24 LTS / 12.6.0  | [Node](https://nodejs.org/docs/latest-v24.x/api/), [pnpm](https://pnpm.io/settings)                                         |
| Next.js / eslint-config-next    | 16.3.7           | 설치된 `node_modules/next/dist/docs`, [Next](https://nextjs.org/docs)                                                       |
| React / React DOM               | 19.3.0           | [React](https://react.dev/reference/react)                                                                                  |
| TypeScript                      | 6.0.3            | [TypeScript](https://www.typescriptlang.org/docs/)                                                                          |
| Zod                             | 4.6.5            | [Zod](https://zod.dev/api)                                                                                                  |
| ESLint / typescript-eslint      | 10.11.0 / 8.71.0 | [ESLint](https://eslint.org/docs/latest/), [typescript-eslint](https://typescript-eslint.io/)                               |
| eslint-plugin-boundaries        | 7.2.0            | [Boundaries](https://www.jsboundaries.dev/docs/overview/)                                                                   |
| Prettier / tsx                  | 3.9.9 / 4.23.15  | [Prettier](https://prettier.io/docs/), [tsx](https://tsx.is/)                                                               |
| Vitest                          | 5.0.1            | [Vitest](https://vitest.dev/guide/)                                                                                         |
| @types/node                     | 24.13.6          | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                                                       |
| @types/react / @types/react-dom | 19.3.0           | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                                                       |
| server-only                     | 0.0.1            | [서버 전용 모듈](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning) |
| lefthook / Betterleaks          | 2.1.14 / 1.8.1   | [lefthook](https://lefthook.dev/), [Betterleaks](https://github.com/betterleaks/betterleaks)                                |
| next-devtools-mcp               | 0.4.0            | [Next 개발 도구](https://nextjs.org/docs/app/guides/mcp)                                                                    |

Next의 관리 지침 삽입은 `agentRules: false`로 끈다. 설치 문서 `01-app/02-guides/ai-agents.md`에 있는 옵션이다.
typescript-eslint는 설계 버전 8.71.0을 쓴다. 경계 플러그인은 ESLint 10에서 실제 import 픽스처로 검증한다.
Next 설정이 가져오는 React 플러그인은 아직 ESLint 10의 context API를 지원하지 않아 `@eslint/compat` 2.1.1의 `fixupConfigRules`로 감싼다([공식 호환 도구](https://github.com/eslint/rewrite/tree/main/packages/compat)).
