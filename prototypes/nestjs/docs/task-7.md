# NestJS 생성 프로브

독립 NestJS, NestJS+web, NestJS+admin, NestJS+web+admin 네 변형의 생성 경로를 추가했다.
실제 생성 프로젝트의 설치·인프라·실행·이미지 검증은 `create-combo-nestjs-probe` CI에서만 실행한다.
현재 문서는 구현과 로컬 증거이며 새 HEAD의 전체 14개 CI 성공은 별도 확인해야 한다.

## 백엔드와 생성물

`Backend`는 fastapi·nestjs이며 서술자는 package.json 소유, setup 도구, 조합 이미지 문맥과 예약 이름을 정한다.
FastAPI의 uv 래퍼와 세 조합의 전체 생성 파일 바이트·실행 권한은 변경 전 고정 기준과 비교한다.
기준은 web 69개, admin 68개, 두 프론트 85개 파일이다. 검사에서 기준을 다시 만들지 않는다.
NestJS는 자신의 package.json을 유지하고 조합에서 name만 api로 바꾼다.
두 백엔드는 원래 compose 내용에 같은 설명·프로젝트 이름을 붙이고 앱 image 값의 바이트 범위만 바꾼다.
nestjs 이름은 이를 포함한 단독과 조합에서 예약한다.

생성된 NestJS setup의 실제 진입점은 apps/api/pyproject.toml 존재로 백엔드를 고르고 uv를 확인하지 않는다.
프론트 E2E 진입점도 이 구분을 E2E_TARGET에 전달한다. 기존 helper 호출의 FastAPI 기본값은 보존한다.
프론트가 NestJS 대상을 받아 실제 브라우저 흐름을 실행하도록 하는 작업은 최종 제품 범위다.

## 잠금 파일과 정책

API의 직접 의존성과 도구 버전·importer·기존 package/integrity는 유지했다.
다섯 부모 snapshot의 하위 해석을 기존 프론트 버전에 맞췄다. 실제 부모의 semver 범위 25개와 바뀐 간선 16개를 확인했다.
원래 package/snapshot 삭제 없이 package 37개·snapshot 38개를 더하고, 기존 API 전용 노드 두 개의 optional 표식을 도달성에 맞췄다.

각 원본의 모든 importer에서 regular·optional 간선을 순환에 안전하게 따라가 선택 의존성 분류를 검증한다.
합친 그래프에서 required 경로가 생긴 API 노드는 optional 표식을 없앤다. 현재 공통 API 표식 91개가 이 경우다.
API 전용 두 노드는 optional-only로 남는다. 간선, peer 키, transitive metadata, 패키지 전체 metadata와 문서 설정은 엄격하게 비교한다.
프론트끼리의 비교와 FastAPI 경로는 기존 규칙 그대로다.
설치 전후의 실제 importer·package·snapshot을 다시 검증한다. 다른 metadata 해석이 필요하면 실패를 보존하고 별도 판정을 받는다.

minimumReleaseAge 1440과 override 동등성을 유지한다.
프론트 allowBuilds 동등성도 유지하며 API와는 같은 키의 값이 다르면 거절하고 나머지는 합친다.
루트 TypeScript override는 6.0.3이다.
호출자가 원본 프론트 pin을 명시하고 API importer의 specifier·version도 그 pin과 정확히 같을 때만,
없던 overrides를 {typescript: 6.0.3}로 더하는 파생 설정을 허용한다.
기존 override 변경, 다른 키·버전·settings·패키지 metadata와 peer snapshot 변경은 거절한다.
lockfile-only 뒤와 frozen 설치 뒤 모두 이 검증을 수행한다.
TypeScript 6.0.3, Zod 4.6.5, Node 타입 24.13.6, Vitest 5.0.1, socket.io-client 4.8.4, SWC 1.16.12는 각각 하나의 package 버전을 기록한다.
Vitest·socket.io-client·SWC에는 서로 다른 원본 peer snapshot이 있다. package 키 하나를 물리적 중복 제거 증거로 취급하지 않는다.

처음 적용한 YAML 후보는 의미가 같아도 첫 도구 문서의 명시적 시작 표식이 없어서 frozen 설치가 실패했다.
원본 도구 문서 4,555바이트를 그대로 복원한 한 번의 변경 설치는 성공했다.
이 결과는 프로토타입 설치 증거이며 생성된 네 프로젝트의 설치 성공은 CI에서 따로 측정한다.

## 선택 흐름의 독립성

기존 선택 검사에는 단독 프로젝트 밖의 계약 경로가 있었다.
`test/fixtures/conformance-flows/*.test.ts.txt`의 14개 파일은 원래 계약 흐름의 바이트 동일 100644 사본이다.
실행하거나 import하는 테스트가 아니다. 기존 선택 검사는 경로 문자열 세 개를 바꾸고 pinned Prettier의 정규 포맷을 적용했다.
모든 기존 175개 선언·assertion, 41개 선택 이름과 53개 제외 이름, 94개 선언 계수 규칙을 보존한다.
create 검사는 전체 fixture 이름 집합과 바이트를 원본과 비교하고 단독·조합 API 안의 경로를 확인한다.

## 측정 범위

CI는 정확히 테스트한 HEAD를 소유한 임시 clone으로 복제한다.
그 안에서만 추적한 프로토타입과 template.json을 templates/nestjs로 materialize하고 별도의 일반 clone-only 커밋을 만든다.
네 프로젝트는 clone 밖의 서로 다른 폴더와 예약되지 않은 compose 이름을 사용한다.

각 변형은 frozen 설치와 해석 보존, 실제 setup, API check·SWC build, e2e:serve 자식 환경과 /health/ready, 이미지 빌드, 깨끗한 생성 Git을 기록한다.
세 조합에는 루트 Node 검사와 turbo dry JSON도 있다.
단독 이미지는 앱 문맥, 조합 이미지는 `docker build -f apps/api/Dockerfile .`의 루트 문맥이다.
기존 compose의 build 항목은 그대로이며 이 프로브는 별도 명시적 이미지 빌드를 측정한다.
항상 정리 단계는 미리 없음을 확인한 소유 compose 자원과 정확한 이미지 태그·폴더만 정리한다.
원시 native 출력과 실제 반환 UTC·종료·wall·hash를 CI artifact에 보존한다.
CI helper 측정과 로컬 증거 수집기의 형식은 별개다.

API 부분 계약은 19 operation·83 schema, 원래 계약은 39 operation·126 schema다.
CI는 프론트 gen의 실제 파일 차이와 빠진 operation·schema를 기록한다.
전체 프론트 check·web 20개/admin 18개 브라우저 E2E·전체 conformance 94개 성공은 이 프로브의 주장이 아니다.

## 후속 제품 범위

전체 계약과 제외한 53개 흐름, 프론트 대상·생성·검사·브라우저 흐름, 개발 실행 하네스와 이미지 운용을 완성해야 한다.
ESM OpenTelemetry의 미완성 계측, 선언 peer 제한, Darwin 프로세스 신호 경합의 기존 실패도 최종 계획에서 해결한다.
새 전체 CI 성공과 완성한 설계·계획에 대한 새 사용자 승인이 최종 SDD 전에 필요하다.

## 보존한 로컬 실패

새 생성 fixture의 초기 CI 이미지 선택 순서 오류와 원본 도구 문서 표식 손실을 각각 수정한 변경 검사로 확인했다.
선택 테스트의 포맷 단계 실패도 원래 출력과 함께 보존하고 정규 포맷만 적용했다.
이후 기존 준비 제한 단위 사례가 5.288초로 3초 미만의 제한을 넘겨 174/175에서 실패했다.
이 실패와 소유 자식·그룹·임시 폴더 정리 증거를 보존했다. 프로세스 helper나 제한을 바꾸지 않았으며 신뢰성 해결을 주장하지 않는다.

가짜 서버의 소유 TCP peer가 HTTP 요청을 보내지 않고 연결된 경우를 새 단위 사례 한 개로 재현했다.
원본 fixture는 기존 정리 함수에서 5,036.205ms와 강제 종료 코드 1을 기록했다.
소유 grandchild 종료 뒤 server.close를 호출하고 이어 closeAllConnections로 연결을 닫는 fixture 수정은
같은 바이트의 테스트에서 27.768ms·부모 종료 코드 0을 기록했다.
두 단계 모두 peer 종료·자식과 그룹 ESRCH·실제 포트 재바인딩·정확한 임시 폴더 제거를 확인했다.
이것은 통제한 fake 연결의 종료 증거이며, 앞선 두 Vitest 실패의 실제 peer 상태나 제품 프로세스 신뢰성의 해결 증거가 아니다.
기존 175개 테스트와 제한값·프로세스 스크립트는 유지하고 새 사례를 포함한 전체 검사는 176개를 실행한다.

## Task 7 CI clone materialization correction

The original generation probe stopped at the clone-only ordinary commit before any generated variant started. Its root workspace frozen installation succeeded, but the newly copied independent `templates/nestjs` workspace had no installation: ESLint 10.11 could not resolve `eslint-plugin-boundaries` from its boundary configuration. The normal secret hook also reported twelve already reviewed bare constant references in copied conformance fixtures and one `@inquirer/password` package-key line in the copied lock file. Always-cleanup reported no remaining folders, an empty variant list and closed ports. The original workflow subsequently completed with thirteen successful jobs and the generation probe failed; this is preserved failure evidence.

Preparation now copies the same tracked files with their Git modes, writes the same template definition, runs measured `pnpm install --frozen-lockfile` and `pnpm run gen` inside the copied workspace, verifies every copied tracked SHA and filesystem mode, then stages and makes the same ordinary commit. A failure in installation, generation or preservation prevents staging and commit. The root format, lint and secret hooks remain enabled. All four variant runtime gates, resolution checks, resource ownership, cleanup, image and frontend-difference measurements retain their original code.

The scanner configuration preserves its complete 2,712-byte prefix and appends the exact two AND allowlists: `generic-password` with the five anchored copied conformance paths and the three anchored identifiers `PASSWORD`, `NEW_PASSWORD`, `LONE_SURROGATE`; and `generic-password` with the exact copied lock path and its package-key line. Other rules and existing policies are preserved.

| Local check                         |  Native exit | Wall seconds | Observed scope                                                                                                                                         |
| ----------------------------------- | -----------: | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Materialization RED                 |            1 |  0.910321959 | Four behavioral cases fail because ordinary commit occurs before copied-workspace bootstrap                                                            |
| Same-test GREEN                     |            0 |  0.906307750 | Four cases pass: preparation order, actual tracked byte/mode copying and ordinary Git commit, installation/generation failures, changed-byte rejection |
| Index-only scanner boundary control | 1 (expected) |  0.546942250 | All eight controls pass; scanner child 0.282450542 seconds, eleven intended positive findings                                                          |

The scanner ignores all three symbols on all five allowed paths and the package key only at the exact copied lock path. A different literal and bare identifier, all three symbols on an unlisted fixture and another path, another rule on an allowed path, a different password-looking lock line and the same package key on another lock remain detected. Only rule/file/line/fingerprint metadata is retained; candidate fields are discarded. The owned scanner fixture is removed and its recorded process has exited. Tests use owned Git/files and inert install/gen commands; they do not prove a real copied workspace installation or generated service acceptance.

Normal create, prototype, repository/schema, SWC, DI, compiled lazy ESM, staged root check and ordinary hooks are required for local completion. Real copied installation/gen, all four generated variants and complete changed-head fourteen-job CI remain pending. This remains the partial 19-operation/83-schema probe with the existing 41-pass/53-skip selection of 94 cases; full 39/126/94 and web 20/admin 18 coverage, incomplete telemetry and cross-platform process reliability remain future product gates.

### Local verification failure and POSIX mode scope

The first ordinary prototype check for this correction exited 1 in 19.140801500 seconds: 175 passed and one failed out of the preserved 176 tests in 22 files. The existing controlled pending-peer cleanup case observed 5,049.293ms against its unchanged 3,000ms bound and fixture exit 1. The protected fake fixture, process code, assertions and deadlines are unchanged. All eight fresh owned cleanup observations confirm recorded processes/groups gone and temporary folders absent; the recorded peer port was rebound. The failed cache is retained, and its old generated-stage record is stale because the test stage stopped first. Actual termination ordering and the broader process reliability cause remain unresolved.

The full create check passed with 188 tests, seven existing skips, 195 total in 21 files and 66 Node tests. The initial four-case GREEN remains the original test-byte measurement. A subsequent measured Windows Node 24.19 filesystem probe reports mode 0666 after either chmod 0755 or 0644. Only the new positive executable-mode case now skips Windows; its complete assertions and all four Mac/Linux cases are retained. Executable-mode proof is POSIX and Ubuntu CI scope; this does not establish Windows generated-project acceptance. Installation/generation failure and changed-byte rejection cases remain portable inert controls. New checks for this narrowly changed test are recorded separately, while all prior successful and failed results remain preserved.

### Controlled close-order correction

A separate controlled experiment observed the fake grandchild's close event before requesting parent shutdown, while the parent and an incomplete owned TCP peer remained alive. The prior fake shutdown handler registered its close listener only after SIGTERM and therefore missed that already completed event. The measured private pair reproduced 5,047.168875ms / exit 1 and 27.953833ms / exit 0. The original failed whole-check run did not record this event order, so that run's exact timing cause remains unproven.

A new POSIX regression reads the actual fixture at execution time, inserts exactly one passive close-marker observer into an owned temporary copy, closes the owned grandchild first and observes its marker before calling the unchanged production cleanup helper. The fake fixture now registers close handling early and remembers both child completion and shutdown request, preserving its other bytes and behavior. The original 176 tests, all deadlines and production process helpers are unchanged.

The new test's native RED exited 1 in 5.561657875 seconds with measured 5,037.622959ms and fixture exit 1. After the exact fake shutdown-block change, the same test bytes passed native 0 in 0.457737584 seconds with measured 27.618125ms and fixture exit 0. Both runs prove the chosen event order, peer closure, two owned PIDs and group gone, owned port rebound and temporary folder absence. A separate Python rebind reader failed with address-in-use; the actual test and a fresh Node net.Server reader prove rebinding, and the Python-specific cause remains unmeasured. No test replay was used to repair that reader.

The local unit suite now comprises the preserved 176 cases plus one close-order case: 177 cases in 23 files. Final seven-stage, repository/schema, SWC, DI, compiled lazy graph, staged root and ordinary hook gates remain required; their actual outputs are retained in the correction report. The accepted changed create check remains 188 passed with seven existing skips / 195 total and Node 66. This proves fake-source cleanup only; production process reliability, all four real generated variants and new complete changed-head fourteen-job CI remain separate gates. Full product coverage and telemetry limitations remain as previously recorded.

## Task 7 real tracked harness inputs correction

The exact `f55f2259f16a9b1d12ba0a6bbdf76b563963e42d` workflow `38237468681` completed with thirteen successful jobs and one generation failure. Clone preparation independently installed and generated the copied workspace, and its ordinary commit `013` passed the existing format, lint and secret hooks. Standalone generation, frozen installation, setup, seven-stage 177-case check, SWC build, actual API child readiness, image build, clean Git and owned compose/image cleanup completed. Web generation `035` then failed with native 1 in 0.640899746 seconds, at 10:40:15.186Z–10:40:15.826Z, because `apps/api/.claude/settings.json` was missing. Cleanup at 10:40:17.859Z recorded standalone completed/cleaned, web incomplete/cleaned with no owned infrastructure or image, folders absent and ports closed. Admin and both never started. These are preserved failed-CI results, without an independent fresh check of all 35 historical command PIDs.

The real 366 tracked prototype files had none of `.claude/settings.json`, `lefthook.yml` or `.betterleaks.toml`. Production `writeHarness` requires all three API inputs. The older `nestjsFixture` copied a FastAPI fixture that fabricated empty settings and hook jobs, masking the actual missing NestJS inputs. Production CLI requirements, existing fixtures, 195 create cases, 177 prototype cases, all manifests/locks/goldens and the fourteen-job workflow remain unchanged.

The three new tracked inputs use existing prototype Node/pnpm tools. Settings allow the existing source checks, build, tests, generation, DI and scoped formatter/linter commands, explicitly deny private environment reads and generated/OpenAPI edits, and retain dangerous-command denies. The Lefthook input has staged Prettier and ESLint jobs and pre-push `pnpm check`. Betterleaks contains only `extend.useDefault = true`, without allowlists, prefilters or rule disabling. The existing 3,390-byte repository scanner configuration remains byte-identical.

The new parameterized `create/test/nestjs-probe-harness.test.ts` materializes actual tracked prototype inputs, selected real frontend inputs and tracked combo assets into owned Git/file fixtures. It calls the real `createProject` and combo `writeHarness` paths for standalone, web, admin and both. Only pnpm installation/format/generation calls are inert; no generated installation, setup, check, runtime or infrastructure runs locally. The test verifies required API input bytes and tracking, functional format/lint definitions, merged API/frontend jobs and the existing frontend-backed secret job, default scanner protection without API exceptions, moved environment/generated-source denies, ordinary fixture first commits and clean Git. It uses the existing Windows copy behavior and no new test skip; Windows runtime acceptance remains unmeasured.

| Local gate | Native exit | Wall seconds | Observed scope                                                                         |
| ---------- | ----------: | -----------: | -------------------------------------------------------------------------------------- |
| RED        |           1 | 17.253618750 | Four real missing-input failures; three combo failures originate in writeHarness       |
| GREEN      |           0 | 26.620075167 | Same 8,107-byte test, four variants pass after only the three tracked inputs are added |
| create     |           0 | 42.730691417 | 192 passed plus seven existing skips, 199 total / 22 files; all 66 Node cases pass     |
| prototype  |           0 | 16.857593166 | All seven normal stages and unchanged 177 cases / 23 files                             |
| repo       |           0 |  2.218515333 | Four stages, 36 cases / three files, 83 schemas with zero differences                  |
| SWC        |           0 |  0.371007667 | 134 compiled files                                                                     |
| DI         |           0 |  2.679976500 | tsc, SWC and Vitest SWC verify the graph and reject invalid type imports               |
| lazy       |           0 |  0.367011000 | Compiled ESM init/close, 19 operations, listening=false and infrastructure=false       |

RED and GREEN used identical test bytes, SHA256 `a15b4b50b94f8a5d0b113db05841f69976413b909b659464633914b667ff1f66`. Their twelve owned folders each were removed and their emitted owner PIDs were checked absent. Full create cleanup verified 299 recorded folders and emitted fixture owners; unrecorded inner Git/Node-test PIDs remain unknown. Source checks preserve the fresh nine fake-process observations, emitted PIDs, two explicit groups, mock/lazy process closure and four numeric port rebindings. The initial new-test lint diagnostic found an empty inert callback and a possibly undefined frontend expression; both were corrected before RED, without changing old tests. The first read-only follow-up proof reader incorrectly assumed mode 0444 for a coordinator file whose actual mode is 0644; the actual mode and failed reader were preserved. Native walls are command measurements, not CPU, model-token or currency estimates.

The DI exploratory tsx graph remains verified=false with erased metadata; it is not an accepted app runtime. Existing negative-test error/warning logs and older process/telemetry failures remain preserved. The final complete six-path staging precedes one root eleven-stage gate and one ordinary normal-hook commit; their actual outcomes belong to the correction report.

These files supply partial prototype generation inputs, not full standalone security or agent-harness acceptance. Standalone Lefthook/secret-tool installation and invocation have not been implemented or measured here. The default scanner input adds no exception for the copied source references; the full product must separately design and validate standalone secret tooling and narrowly justified source-reference handling. Migration-aware, tool-edit, stop and session agent hooks are absent from this prototype input and remain full-product planning gates. Combo hooks and frontend-backed scanner wiring are configuration evidence, not measured generated-runtime security acceptance. No tool download, dependency/pin change, scanner exemption or CLI fallback was added. All four real changed-head generated variants, their runtime/images/cleanup and a new exact whole fourteen-job CI remain pending. Full 39-operation/126-schema/94-flow and web 20/admin 18 coverage, complete telemetry, process reliability and a new concrete full-plan approval remain separate product gates.

## R31·R32: 정상 CLI 이후 잠금 관측과 원본 Zod 집합 보존

시작 HEAD `ef9fca4fb98bba0e840218b51a21f83575ac76d8`의 CI `38241941310`은 14개 작업 중 13개 성공, 생성 프로브 1개 실패로 끝났다. 정상 web 생성은 `11:22:10.671Z`–`11:22:17.732Z`, native 1, 7.060851838초였으며 실제 lockfile-only 해석 뒤 web 루트 importer 보존을 거절했다. standalone은 완료·정리했고 admin·both는 시작하지 않았다. 거절된 after 잠금 파일은 남지 않아 실제 변경 필드는 여전히 **UNKNOWN**이다. 다섯 peer 문맥 차이는 원본 비교의 가설이며 실제 실패 원인으로 확정하지 않는다.

R31은 정상 `pnpm new`의 모든 인자·환경·순서와 fatal 결과를 유지한다. 실제 조합 importer 거절 뒤에만 별도 이름·대상의 CI 진단을 한 번 실행한다. 기존 `createProject`와 `runPnpm`을 그대로 쓰고 주입 경계에서 원본 잠금, 생성 manifest·workspace, before·after 원문과 해시 및 전체 구조 차이를 staging 밖에 독점 생성한다. 파일 허용 목록은 잠금·manifest·workspace뿐이며 환경·설치물·캐시는 담지 않는다. 기존 verifier와 정리를 유지하고 진단이 재현되지 않아도 다음 runner 호출에서 멈춰 frozen·format·gen·setup·runtime·image로 진행하지 않는다. 외부 진단 native 측정과 runPnpm을 감싼 UTC·wall 측정은 별개이고, 노출되지 않은 내부 pnpm PID·native exit·자체 wall은 null이다. 이 자료는 별도 재현 자료이며 기존 실패의 소급 candidate가 아니다. 진단 성공·실패·비재현·기록 실패 모두 동일한 원래 CLI 오류 객체를 다시 전파한다.

R32는 별도로 승인한 잠재 검사 오류 수정이다. 변경하지 않은 프론트 원본은 `zod@3.25.76`과 `zod@4.6.5`를 함께 갖지만 이전 overlap 검사는 Zod 하나만 허용했다. 선택한 원본들의 정확히 정렬한 Zod package-key 합집합과 direct 4.6.5를 요구하며 새 버전·원본 Zod3 삭제·Zod4 삭제·direct pin 변경을 거절한다. 다른 다섯 overlap 검사와 모든 원본 해석 verifier는 그대로다. Zod 수정은 위 실제 importer 실패의 원인이나 해석 수정이 아니다.

로컬은 실제 Git·파일 생성과 inert pnpm callback만 썼다. 최종 capture 단일 사례는 컴파일되는 pass-through에서 외부 before 자료 누락으로 RED(native 1, 1.315900459초), 동일 테스트 바이트에서 GREEN(native 0, 1.876886458초)이다. SHA256은 `7a725413436d561498c793d07471855f7c2e95643bd284312dcac66d310a2bef`이며 synthetic importer version만 바꾸고 specifier·strict exit 1·한 번의 lock delegate·후속 호출 금지·정리·외부 원문/해시/444 모드·원래 오류 객체 identity를 확인한다. Zod 단일 사례는 실제 원본 `mergeAppLocks`에서 이전 assertion으로 RED(native 1, 1.854597875초), 동일 바이트에서 GREEN(native 0, 1.876776458초)이며 SHA256은 `ce11d231532cf4736d4612161f2fa98ac5c9f173e18896758b90797af627a9b6`이다. 원본·pin 음성 대조도 같은 사례에서 확인했다.

초기 capture GREEN은 마지막 새 fixture 상태 assertion에서 실패했다(native 1, 1.446396500초). 기존 fixture가 의도적으로 남기는 무추적 파일을 깨끗한 상태로 잘못 가정했으며, 승인받아 새 테스트의 초기 상태와 최종 상태를 비교하도록 고쳤다. 원래 RED·실패·정리 자료는 유지했다. 새 파일의 typed lint 오류와 CI 파일 400줄 제한 피드백도 유지하고, 승인된 타입·문법·동일 오류 identity 검사 뒤 최종 동일 바이트 RED/GREEN을 새로 측정했다. lint 면제·기존 fixture 변경·새 skip은 없다.

완전한 create check는 native 0, 45.858688375초로 끝났다. 기존 199개(192 PASS+기존 7 SKIP)에 새 두 사례를 더해 201개(194 PASS+7 SKIP), Vitest 24개 파일과 기존 Node 66 PASS이며 FastAPI golden 대조도 유지했다. 이 기록 뒤 정확한 일곱 파일을 stage하고 루트 11단계와 일반 hook 커밋을 확인한다. 변경하지 않은 prototype 177·통합 43·auth 13·quota 20·적합성 선택 41/94 및 이전 SWC·DI·lazy 결과는 역사적 증거이며 이번에 재실행하지 않았다. 실제 resolution·frozen 설치나 생성 API runtime·Docker·DB·Redis·메일·스토리지는 로컬에서 실행하지 않았다.

새 HEAD의 실제 CI capture는 아직 **pending**이다. 다음 CI가 원래 strict 거절로 실패하며 자료만 남겨도 Task7 수락이 아니다. 실제 before/after로 확인한 최소 해석 수정 뒤 네 생성 변형의 실제 호환 결과와 새 exact-head 14개 작업 성공이 필요하다. 전체 39 operation·126 schema·94 적합성·web 20/admin 18·완전한 OTel·운영 프로세스 신뢰성·standalone 보안 도구/agent hook은 후속 전체 제품 게이트로 남긴다. draft PR은 병합하지 않으며 전체 설계·계획의 게시와 새로운 구체적 사용자 승인이 있어야 SDD를 시작한다.

## Task 7 R33 — 별도 lock 진단의 pnpm 라이프사이클

`675b07699fc43fa51186321c3ae95100f5f52957`의 CI `38251366271`은 14개 작업 중 13개 성공, `create-combo-nestjs-probe` 하나 실패로 완료했다. 정상 035 `pnpm new --api nestjs --web`은 2026-10-12 12:51:20.102–12:51:29.366 UTC, native exit 1, 9.264155219초에 기존 `web: . importer의 해석 결과가 바뀌었다` 거절을 유지했다. 별도 036 진단은 12:51:29.386–12:51:29.824 UTC, exit 1, 0.437705323초에 `pnpm을 찾을 수 없다 — pnpm 12.6.0으로 pnpm new를 실행한다`로 끝났다.

036은 기존 `runPnpm`이 요구하는 `npm_execpath`가 없는 `pnpm exec tsx` 진입이었다. failure의 staging은 null이고 원본 API·web lock 사본과 failure/evidence만 남았다. `capture.json`, before/after lock, diff는 없으므로 실제 해석 후 변경 필드는 여전히 UNKNOWN이다. 원본·native 증거 검증은 tested 675와 materialization `50855ea3358aefd99bca4687d0704f8998ead878`의 125 artifact 파일, 36 native 명령·72 stream, 369 추적 prototype 파일을 묶는다. 265,348바이트 job log의 해시·메타데이터 검증을 전체 수동 열람으로 표현하지 않는다.

R33 변경은 정확히 다섯 경로다. 루트에 private 진단용 `probe:nestjs:lock-capture = tsx create/test/nestjs-probe-lock-capture.ts` 하나를 더하고, `diagnosticPlan`의 실행 prefix만 `run probe:nestjs:lock-capture`로 바꾼다. evidence·binding·separator·target·API·frontend·name 인자는 그대로다. 새 운영 회귀 한 개와 이 두 문서의 append가 나머지다. pnpm 자체 라이프사이클이 진입점을 공급하며 production `runPnpm`, capture 본문·버전 preflight·불변 출력·엄격한 거절·원래 오류 객체·CI guard·후속 phase 중단·소유 정리는 유지한다. pin·lock·resolver·정책·importer guard 변경 근거는 없다.

새 회귀는 `npm_execpath` 없는 직접 CI 호출 형태에서 실제 `diagnosticPlan` launcher를 소유한 inert package/script fixture로 실행한다. stub은 실제 변경 없는 `runPnpm(cwd, ["--version"])`만 호출하고 실제 나머지 인자를 전달받았음을 확인한다. root script key/value와 연결하며 설치·해석·frozen·gen·backend 호출은 없다. 동일한 4,670바이트 테스트 SHA256 `873e12ca2bcee65dbe396c484463e54bd20e1c1fc07f46a1a87633889eeca913`으로 원래 exec launch RED는 native 1/0.757070459초, 수정 후 GREEN은 native 0/0.903759125초였다. RED는 실제 missing-entry 분기까지 도달했고 GREEN은 버전 probe를 완료했다. 각 소유 fixture 제거와 기록된 자식 PID의 종료를 확인했다. 이 시간은 enclosing 테스트 명령이며 `runPnpm` 내부 자식 PID·exit·wall은 공개되지 않아 UNKNOWN이다.

로컬 전체 `pnpm --dir create check`는 exit 0/46.470731375초였다. Vitest 195 PASS + 기존 7 SKIP = 202개, 24 passed/1 skipped 파일과 기존 Node 66 PASS를 확인했다. 기존 capture·Zod 회귀와 원래 201개 선언은 유지한다. 최종 완료 기준은 다섯 파일 전체 staging 뒤 새로운 루트 `pnpm check` 11단계와 일반 hook 커밋이다. 이 절은 그 최종 실행 전 staging용 기록이며 실제 최종 native 결과는 커밋 검증에서 별도로 확인한다. 변경 없는 prototype/SWC/DI/lazy gate는 재실행하지 않는다.

새 exact-head CI는 아직 대기다. 다음 진단 CI도 정상 035에서 실패하면서 before/after를 남길 수 있다. capture 성공은 호환 생성이나 Task 7 성공이 아니다. 실제 diff에 근거한 별도 최소 수정 뒤 네 생성 variant 모두 호환되고 새로운 전체 14개 작업이 성공해야 Task 7을 수용한다. draft PR 12는 병합하지 않으며 전체 Windows 설계·계획, MAIN 두 문서 검증·게시와 새 구체적 사용자 계획 승인은 후속 단계다.
