# NestJS 프로토타입

병합하지 않는 draft 브랜치의 독립 ESM 실험이다. 최종 템플릿이나 최종 SDD 승인이 아니다.
루트 workspace 밖에서 자체 잠금 파일과 check를 사용한다.

| 경로                 | 역할                                              |
| -------------------- | ------------------------------------------------- |
| `src/core/config`    | Zod 설정 스키마 하나와 SETTINGS 토큰              |
| `src/core/jsonapi`   | 요청 순서·에러·응답·쿼리와 OpenAPI 3.1 emitter    |
| `src/modules/health` | 인프라 없는 liveness                              |
| `src/modules/roles`  | 계약의 정적 권한 등록부                           |
| `scripts`            | check, tmp 사전 확인, DI 변환 비교와 린트 규칙    |
| `test/fixtures`      | 실제 DI 그래프와 의도적으로 잘못된 경계·주석 사례 |
| `docs/evidence.md`   | 관측한 결과, 결정과 남은 범위                     |

- `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, `pnpm probe:di`로 검사한다. 저장소 안에서는 `pnpm check:repo`도 통과한다.
- `check`는 프로젝트 내부 입력만 쓴다. 계약 lint·schema-diff·실제 로컬 목 대조·subset spec 비교는 `check:repo`가 맡는다.
- `openapi.json`은 `pnpm gen`으로 만든다. 직접 고치지 않는다. `pnpm gen --check`는 재생성 차이를 거절한다.
- operation은 선언 19개 중 실제 마운트 표식이 있는 `Health_live`·`Permissions_list`만 문서에 낸다. 조각과 실시간에서 닿는 스키마 83개와 ErrorCode 39개는 모두 등록한다.
- 저장하는 문자열은 `codePointString`을 쓴다. UTF-16 `.max()`로 길이를 재지 않는다. 명시한 경계·pattern·required·ref·discriminator를 비교 양쪽에서 지우지 않는다.
- Zod 4.6.5의 BigInt int64는 JSON Schema 변환이 안 된다. 승인된 JSON-number 정수 선언을 쓰며 안전 정수 한계를 추가하지 않는다. JSON 숫자의 정밀도 한계는 최종 설계에서 결정한다.
- Node 24.15 이상 25 미만, pnpm 12.6.0, Nest 12.1.2, TypeScript 6.0.3을 유지한다.
- 빌드는 Nest CLI SWC, 테스트는 Vitest + unplugin-swc, 타입 검사는 tsc다.
- 앱을 tsx로 실행하지 않는다. 데코레이터 생성자에 사용하는 클래스는 값 import를 보존한다.
- 상대 import에 `.js`를 쓴다. 인터페이스는 `import type`, 순환 DI는 `forwardRef` + `WrapperType`를 쓴다.
- 모듈 외부에는 `index.ts`만 공개한다. controller → service → repository → generated-prisma 방향을 지킨다.
- 승인된 DAG는 roles ← users ← auth, realtime → auth, posts → users·files다. files는 독립이다.
- core는 modules를 모른다. 생성 Prisma import는 repository와 core/db만 허용한다.
- `$queryRawUnsafe`·`$executeRawUnsafe`를 쓰지 않는다. 대신 매개변수를 바인딩하는 tagged SQL을 쓴다.
- 억제 주석과 any에는 web 하네스와 같이 같은 줄의 실제 주석에 `사유:` 설명을 붙인다.
- 소스·스크립트는 400줄, 테스트·fixture는 600줄 이하로 나눈다.
- `.env`를 읽거나 출력하지 않는다. 공개 기본값은 `.env.example`에서 확인한다.
- tsx 명령 전에는 `scripts/preflight-tmp.mjs`로 물리 OS tmp의 보수적 IPC 길이를 확인한다.
- 임시 실험은 소유한 `aitpl-nestjs-proto-*`만 만든다. 사용자 임시 항목은 건드리지 않는다.
- 로컬 Docker, 실제 DB·Redis·스토리지·메일 검사는 금지다. 해당 증거는 후속 CI에서만 만든다.
- `shadow:warn`은 예상하지 못한 모든 라우트 중첩을 거절하지 않는다. 제한은 evidence에 기록한다.
- 계약·생성물·프론트·shared와 기존 CI 작업은 바꾸지 않는다.
- 완료 전에 자체 check와 루트 `pnpm check`를 통과하고 일반 Git hook을 그대로 사용한다.

Task 1의 툴체인·설정·헬스·권한 등록·DI·경계·라우트 실험과 Task 2의 JSON:API·이름이 일치하는 OpenAPI 조각을 구현했다.
권한 목록의 인증은 Authenticator 포트이며 테스트 대역만 검증했다. 실제 인증은 Task 3이다.
Task 3–7의 Prisma 7.10.0·실제 인증·도메인·잡·파일·실시간·조합 구현과 실제 인프라 검증은 아직 남아 있다.
이 증거 프로토타입의 승인과 최종 제품 SDD 승인을 구분한다. 최종 SDD는 완성한 Opus 설계·계획에 대한 새 사용자 승인이 필요하다.
