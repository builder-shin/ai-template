# NestJS backend

Node 24.15 이상·25 미만, pnpm 12.6.0, NestJS 12.1.2를 쓰는 ESM 백엔드 템플릿이다.
계정 영속성·인프라·API·개발 실행기와 검사 하네스를 제공한다.

## 명령

| 명령                                                   | 하는 일                                             |
| ------------------------------------------------------ | --------------------------------------------------- |
| `pnpm fix`                                             | Prettier·ESLint로 자동 수정한다                     |
| `pnpm test`                                            | 단위와 통합 시험을 돌린다                           |
| `pnpm build`                                           | SWC로 NestJS 소스를 컴파일한다                      |
| `pnpm check [--fast]`                                  | 생성·린트·타입·하네스·시험을 검사한다               |
| `pnpm setup`, `pnpm gen`                               | 인프라·세 DB 준비, Prisma 클라이언트 생성           |
| `pnpm db:migrate`, `pnpm db:reset`, `pnpm db:revision` | 소유 검사 뒤 deploy·로컬 reset·revision             |
| `pnpm dev`, `pnpm test:e2e`, `pnpm e2e:serve`          | 개발 세 역할, 실제 E2E, 격리한 명령 서버를 실행한다 |
| `pnpm gen:module <이름>`                               | Task 21에서 구현한다                                |

아직 구현하지 않은 명령은 담당 Task를 stderr에 알리고 종료 코드 1로 끝난다.
네 Claude hook은 exec form 선언만 있으며 모듈은 Task 21에서 더한다.

## 구조

| 경로                          | 내용                                              |
| ----------------------------- | ------------------------------------------------- |
| `src/core/config/settings.ts` | 52개 필수 환경 키를 검증하는 Zod 스키마와 DI 토큰 |
| `src/modules/posts/`          | 후속 구현과 생성기의 골든 모듈 자리               |
| `scripts/check/`              | 환경 예시와 설정 키의 일치 검사                   |
| `api-style/lint.mjs`          | 독립 프로젝트에 포함한 JSON:API 룰셋 사본         |
| `scripts/process-tree.mjs`    | 독립 프로젝트에 포함한 프로세스 종료 도구 사본    |
| `docs/recipes/`               | 변경 절차                                         |

## 규칙

- `.env`를 읽거나 출력하지 않는다. 공개 키와 개발 값은 `.env.example`에서 확인한다.
- 자식 환경 준비 도구 scripts/child-environment.mjs는 scripts에서만 가져온다. src의 import·재수출은 린트가 거절한다.
- 모든 설정 키는 필수다. 값을 빼면 키마다 오류 한 줄로 알린다. 기본값을 코드에 두지 않는다.
- 운영에서는 JWT·식별자 해시·시드 관리자 비밀을 새 값으로 바꾼다. 예시 값이면 시작하지 않는다.
- PORT는 1~65535다. FORWARDED_ALLOW_IPS는 신뢰하는 프록시 주소의 쉼표 목록이며 빈 값은 허용하고 *는 거절한다.
- HTTP API에는 CORS를 열지 않는다. Socket.IO·스토리지만 허용 Origin 목록을 쓴다.
- 의존성은 정확한 버전으로 고정한다. minimumReleaseAge 1440과 TypeScript 6.0.3 override, 선언한 allowBuilds를 유지한다.
- 템플릿 밖의 파일을 참조하지 않는다. 공유 자산은 이 프로젝트 안의 사본으로 쓴다.
- 소스 400줄·시험 600줄을 넘기지 않는다. 억제 주석에는 같은 줄에 사유를 적는다. 하네스는 `scripts/lint/fixtures/negative/ban-ts-comment/src/service.ts`의 첫 독립 `@ts-expect-error` 주석만 음성 검사 입력으로 허용한다.
- Prisma 생성 클라이언트는 추적하지 않는다. setup과 check는 lint 앞에서 생성한다.
- DB가 다른 도구 소유이면 변경하지 않는다. reset은 로컬 호스트만 허용한다.
- 생성물은 직접 고치지 않는다. 마이그레이션 절차는 [레시피](docs/recipes/migration.md)를 따른다.
- 로딩 UI는 스피너나 스켈레톤만 쓰고 로딩 문구는 쓰지 않는다.
- 커밋은 영문 Conventional Commits다. AI 태그·트레일러와 hook 우회는 쓰지 않는다.

## 완료 기준

완료 기준은 `pnpm check`다. 로컬 `--fast`는 통합을 제외하고 단위 시험을 실행한다.
통합은 준비된 인프라에서 직렬로 실행하며 app_test·Redis 15·Mailpit 메시지만 비운다.
