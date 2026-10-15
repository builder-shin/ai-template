# 스택과 고정 버전

직접 의존성의 원본은 `package.json`, 해석된 전체 그래프는 `pnpm-lock.yaml`이다.
Node는 24.15 이상·25 미만이며 CI와 이미지는 24.19.0, pnpm은 12.6.0을 쓴다.
`minimumReleaseAge: 1440`, TypeScript 6.0.3 override와 `allowBuilds`를 유지한다.

| 영역          | 고정 버전과 공식 문서                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP·DI       | [NestJS](https://docs.nestjs.com/) 12.1.2, CLI 12.0.8, express 5.2.1, reflect-metadata 0.2.2, rxjs 7.8.2                                                                              |
| 컴파일·시험   | TypeScript 6.0.3, @swc/core 1.16.12, @swc/cli 0.8.1, unplugin-swc 2.0.0, vite 8.3.1, [Vitest](https://vitest.dev/) 5.0.1, tsx 4.23.15, supertest 7.3.1                                |
| 검증·린트     | [Zod](https://zod.dev/) 4.6.5, ESLint 10.11.0, @eslint/js 10.0.1, typescript-eslint 8.71.0, boundaries 7.2.0, resolver-typescript 3.10.1, Prettier 3.9.9                              |
| DB            | [Prisma](https://www.prisma.io/docs/)·@prisma/client·@prisma/adapter-pg 7.10.0, pg 8.23.1                                                                                             |
| 보안          | argon2 0.45.1, jose 6.2.12                                                                                                                                                            |
| 잡·실시간     | [BullMQ](https://docs.bullmq.io/) 6.3.12, @nestjs/bullmq 12.0.0, ioredis 6.0.0, [Socket.IO](https://socket.io/docs/v4/) 4.8.3, client 4.8.4, redis-adapter 8.3.0, redis-emitter 5.1.0 |
| 스토리지·메일 | @aws-sdk/client-s3·s3-request-presigner 3.1149.0, nodemailer 10.1.0                                                                                                                   |
| 관측          | [OpenTelemetry](https://opentelemetry.io/docs/languages/js/) sdk-node·instrumentation-http 0.223.0, instrumentation-pg 0.75.0, sdk-trace-base 2.12.0, api 1.9.1                       |
| 타입          | @types/node 24.13.6, express 5.0.6, supertest 7.2.1, pg 8.23.1                                                                                                                        |
| 하네스        | [lefthook](https://lefthook.dev/) 2.1.14, [Betterleaks](https://github.com/betterleaks/betterleaks) 1.8.1(플랫폼별 SHA-256 검증)                                                      |

알려진 제한은 다음과 같다.

- eslint-plugin-import 2.32.0의 peer 범위는 이 ESLint 10 조합을 지원하지 않는다. 플러그인을 추가하지 않고 boundaries와 프로젝트 규칙을 쓴다. import resolver 설정은 유지한다.
- tsx는 Nest 생성자 DI에 필요한 데코레이터 메타데이터를 제공하지 않는다. 앱은 SWC로 빌드하고 스크립트에서 앱을 가져올 때도 기존 생성 로더 순서를 따른다.
- Prisma 8은 설계 조사 시점에 RC였으므로 이 템플릿은 7.10.0을 고정한다. 미리보기 버전으로 자동 갱신하지 않는다.
- BullMQ용 연결은 명령 시간 제한·요청별 재시도 제한이 없다. 상세 범위는 [아키텍처](architecture.md)와 [잡 절차](recipes/jobs.md)에 적는다.
- 인프라가 필요한 시험·실제 hook 거절·생성 모듈 전체 검사는 준비된 CI에서 실행한다. 단위 fixture의 성공은 실제 DB·연결·수명 시험의 성공을 뜻하지 않는다.
