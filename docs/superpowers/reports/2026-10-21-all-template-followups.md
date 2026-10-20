# 네 템플릿 후속 개선 기록

기준: main `fd59ec6c4063eb80ff8aa9277f115490e584bfaf`, Windows `feature/all-template-followups`.

2026-10-21에 HANDOFF·BACKLOG의 구현 책임을 Windows로 인계받았다. 정식 web·admin·FastAPI·NestJS 구현의 main 병합과 이번 후속 변경의 검증은 별개로 취급한다. NestJS PR #13·#14와 admin CI 보완 PR #11의 병합 상태는 연결된 GitHub에서 다시 확인했다.

## 항목별 구현

아래 경로의 `A`는 `templates/nextjs-admin`, `S`는 `shared/nextjs`, `C`는 `create`다. 기존 동작에 검사를 더한 경우와 실제 결함 수정을 구분했다.

| ID | 결과와 근거 |
| --- | --- |
| O1 | NestJS rate limit이 `errors[].meta.params.retryAfter`를 반환한다. global·strict 실제 HTTP 직렬화에서 양의 정수와 `Retry-After` 일치를 검사하고 잘못된 상위 키 부재를 확인한다. TypeSpec·생성 스키마는 이미 올바르므로 변경하지 않았다. |
| Q1 | [설계](../specs/2026-10-21-bff-client-address-design.md)와 [배포 규칙](../../../shared/nextjs/docs/recipes/client-address.md)에 따라 기본 비활성·단일 ingress IP·호출별 위조 헤더 제거·요청 클라이언트·proxy 갱신 문맥을 구현했다. 세션·인증·익명·OAuth·admin 실패 세션 정리까지 실제 HTTP 검사를 추가했다. 두 API의 신뢰/비신뢰 peer 경계도 검사한다. |
| Q4 | Windows 정상 global setup에서 기존 10개 파일·74개 테스트와 경고 17개 블록을 재현했다. RTL `act`, keyed uncontrolled 입력, native logout 버튼 선언으로 수정했다. 반복 실패의 반환 이름·이메일, 비밀번호 비복원, 키보드·마우스 제출을 call-through 진단 검사와 함께 확인한다. JS 없는 HTTP와 기존 Chromium 가입 흐름도 강화했다. |
| T1-M1/M2 | `S/scripts/process-tree.test.ts`의 무조건 출력은 실패 단언의 진단으로 옮겼다. Darwin 고정 시간 간격은 PID-before-ready·hold·명시적 release handshake로 바꾸고 실패 정리는 기록한 그룹·PID와 한도를 사용한다. native Darwin 실행 증거는 아래 경계에 남긴다. |
| fixture 위생 | root agents-md/check/discover/tools/project-files의 알려진 임시 폴더 소유자가 즉시 cleanup을 등록한다. shared setup/process/tree/types의 접두사를 `aitpl-`로 맞추고 기존 cleanup을 유지했다. 소유 불명 과거 TEMP는 지우지 않았다. |
| T2-I1 | `scripts/src/web-e2e/process.ts`에서 PID에 의존하는 조사를 없애고 종료 한도·강제 정리 안내를 명확히 했다. 오류·신호·종료 코드 의미는 유지한다. |
| T3-M1 | `A/src/components/resource/screen.tsx`에서 list/form의 관계 옵션 로드·403 전환·선택값 라벨을 공유한다. 다른 실패는 전파하고 해당 입력만 비활성화한다. |
| T3-M3 | 관계 라벨의 비선호 속성 fallback과 속성 부재 거절은 기존 구현이 충족했다. 생성기의 성공·무기록 실패 검사를 보충했다. |
| T3-M4 | included 라벨을 검사하기 전에 선택한 zzzz 역할이 첫 페이지에 없음을 실제 API로 확인한다. |
| T3-M5 / T6-RR1 | override에 `errorId`·`noticeId`·`describedBy`·`labelledBy` 문맥을 제공한다. 권한 picker는 올바르게 이름이 붙은 group이며 validation·관계 403 안내·checkbox 제출을 실제 DOM에서 검사한다. |
| T3-M6/M8 | shadowed callback 이름과 중복 next-intl import를 정리했다. |
| T3-RR1-M1/M2 | 검색 multi-select에 실제 combobox 역할을 사용하고 highlight가 있는 Enter는 선택을 토글한다. highlight 없는 Enter·검색 버튼은 검색하며 IME·고정 선택 행은 유지한다. E2E 역할도 맞췄다. |
| T3-RR2-M1 / pending | Space composition fixture는 32, Enter는 13, legacy IME는 229로 구분한다. 새 검색은 진행 중 요청을 대체할 수 있고 늦은 성공·실패는 최신 결과를 덮지 못한다. |
| T4-RR1 | `S/src/lib/session/redirect.ts`가 반복한 지원 로케일 접두사를 모두 제거하고 계정 언어를 붙인다. query/hash와 기존 안전 경로 검사를 유지한다. |
| T5-M1/M2 | unnamed-user 판단과 filter/create/edit presentation 선택을 각각 기존 라벨 함수·`screenPresentation`으로 공유한다. 번역·unincluded id fallback·독립 선언을 유지한다. |
| T6-M2 | permissionValues의 3페이지 요청 번호·size20·합치기·종료와 중간 페이지 문서 누락 실패를 직접 검사한다. |
| T6-M3 / T7-M7 | 생성 import는 directive·server-only·type import 뒤 import 블록에 들어간다. 충돌 없는 camelCaseResource 식별자와 기존 registry 순서를 보존한다. |
| T7-M3 | 날짜 범위 끝점 판단은 `isPeriodEnd`로 공유한다. 반개구간 API 변환 검사는 유지한다. |
| T7-M5/M6 | audit metadata null·scalar·array, target type 누락·비문자열 검사를 보충했다. 올바른 기존 분기는 유지하며 중복 타입 선언·불필요한 optional 호출을 정리했다. |
| FW-M2 | role description에만 `emptyToNull`을 선언했다. untouched null·텍스트 지우기·비어 있지 않은 값과 실패 후 입력 보존을 실제 form→Action→API로 검사한다. 모든 텍스트를 null로 바꾸지 않는다. |
| FW-M3 | admin locale Action의 비문자열 returnTo를 계정·쿠키 변경 전에 홈으로 정규화한다. ko/en malformed 값, 정상 복귀·429를 검사한다. |
| FW-M4 | `defineResource`가 계약 필드 enum의 누락·잘못된 표시 값을 타입 수준에서 거절한다. 모든 제품 표시 값의 ko/en 카탈로그 검사와 기존 permission 완전성 검사를 유지한다. |
| T8-M1/M2 | --keep 안내의 WEB/ADMIN 변수·실제 ID·`COMPOSE_DISABLE_ENV_FILE=1`을 네 앱/백엔드 조합에서 검사한다. compose 거절 검사는 변형 전 parse/stringify 기준선이 유효함을 확인한다. |
| T8-M3 / T8-RR1-M1 | build 성공·실패·신호의 진단 callback 횟수/내용과 두 출력 스트림을 검사한다. login 타입 단언은 별도 타입 모듈로 옮기고 mailLink 거절·실제 register callback을 보존한다. |
| T8-M4 | 기존 main에서 STACKS의 명시적 runIdVariable로 해결된 항목임을 확인했다. 중복 구현하지 않았다. |
| T9-M1/M2 | 외부 contract PostToolUse의 formatter 소유권과 앱 hook 경로를 검사한다. 개별 필수 devDependency 누락은 올바른 app/key·빈 대상·install/gen 부재를 검사한다. 기존 올바른 검증 동작은 유지한다. |
| T9-M3 / T11-M2 | 조합 README의 setup/포트 옆에 고정 포트·동시 실행 제한을 두고 선택한 web/admin만 문구·예시·실행 순서·healthcheck에 남긴다. |
| T9-RR1-M1 | shared hook catch 주석에 config 누락/파손과 외부 계약 해석 실패를 함께 설명한다. 동작 변경은 없다. |
| T10-M1 | E2E config의 읽기·JSON 실패에 앱/파일·수정 안내를 붙인다. missing·malformed·null·invalid-port는 backend 자식 실행 전에 실패한다. |
| T10-M3 | CI pruning은 `--filter app`·`--filter=app`, 여러 줄·여러 filter와 Dockerfile 옵션을 모두 확인한다. 선택하지 않은 프론트가 필요한 step만 제거하고 backend step은 보존한다. |
| T10-M4 / T11-M1 | spread 배열의 잘못된 시험 제목을 named/object rows로 바꾸어 선택한 앱 전체를 표시한다. |
| T10-M5 | setup/check/E2E의 첫 프론트 실패 종료 코드와 이후 앱 미실행/위임된 Turbo bail을 독립 검사한다. 누락된 원본 리뷰의 정확한 네 사례 문구는 새로 만들지 않았다. |
| T11-M3/M4/M5 | 생성 admin dockerignore를 직접 검사한다. lock 파싱/importer/path 오류에 app을 전달한다. admin-only의 web hook/task 부재와 실제 CLI help의 모든 단독·조합 선택지를 검사한다. |
| T12-M3/M5 | `%i`·named token·전체 앱 배열의 시험 제목을 정리했다. web 문서는 현재 기능·pin을 설명하고 날짜가 있는 과거 호환성 증거는 보존한다. admin/Nest 설계 머리말도 현재 main 상태와 당시 기록을 구분한다. |

## 검증 상태

집중 회귀의 RED→GREEN과 기본 경고 재현은 인계 캐시의 원본 로그에 보존했다. 서로 다른 OS의 과거 결과를 이번 변경의 결과로 사용하지 않는다.

- admin 집중 검사: 32개 파일·285개 테스트, 타입·변경 파일 린트 통과.
- create 집중/전체 검사: Vitest 293개, Node 자산/hook 82개 통과. root E2E 실행기 213개 통과. 플랫폼 전용 건너뛰기는 유지한다.
- NestJS 전체 단위: 1,499개 통과·POSIX 전용 5개 건너뛰기. 빠른 검사 7단계 통과.
- FastAPI 신뢰 경계: 실제 uvicorn middleware와 실제 client 추출 함수의 8개 검사, Ruff·타입 검사 통과. DB/Redis 연결은 사용하지 않는다.
- Q1 실제 HTTP: 공통 클라이언트/주소/요청/refresh 집중 38개, web 업무 호출부 9개·admin 4개 통과. 기존 토큰별 갱신 만료 검사도 포함한다.
- 루트 `pnpm check`: 수정 후 11단계 통과(246.8초). 최초 통합 실행에서 cleanup 콜백 린트 5건과 공유 회귀의 앱 소유 proxy 허용 목록 누락을 발견해 고쳤고 관련 29개 검사가 통과했다.
- web: 전체 정상 suite 111개 파일·988개 통과·native 1개 건너뛰기, stderr/React act/Base UI 진단 0개. 9단계 check·운영 build·목 Chromium E2E 20개(36.5초) 통과. 반복 가입 실패의 이름·메일 유지·비밀번호 초기화도 실제 브라우저에서 통과했다.
- admin: 전체 정상 suite 98개 파일·892개 통과·native 1개 건너뛰기, stderr/React act/Base UI 진단 0개. 10단계 check(캐시 0개) 통과. 운영 build·목 E2E는 진행 중이다.
- 이번 web 전체 suite와 E2E에서는 destination-stream-closed 진단을 관측하지 않았다. 과거 진단의 원인이나 해소를 증명한 것은 아니다.
- 커밋 입력의 실제 생성 smoke와 새 PR의 15개 CI는 진행 중이다. 완료 결과는 이 절에 갱신한다.

## 독립 최종 검토와 보완

독립 검토는 전체 원본 diff·백로그와 298개 공유 사본의 바이트 일치를 확인했다. Important 1건: 프론트 잠금 파일의 의존성 문서에 `.` importer가 없거나 `contract/../../outside` 같은 경로가 있으면 설치 단계에 도달할 수 있었다. 다른 material finding은 확인하지 않았다.

해당 입력의 rewrite/merge 6개와 실제 생성 2개 회귀가 먼저 실패함을 확인하고, 의존성 문서에 원본 importer를 요구하며 contract 경로의 빈·dot·dotdot·역슬래시 구간을 거절하도록 수정했다. pnpm 도구 설치 문서는 그대로 보존한다. 관련 두 파일 39개 검사가 통과했으며 root 전체 검사도 통과했다. 생성 실패는 install/gen 전에 끝나고 대상·임시 형제를 남기지 않는다.

공유 갱신 회귀가 두 앱의 앱 소유 `src/proxy.ts`를 검사하도록 허용 목록에 경로 하나를 명시했다. 다른 앱 파일 import를 허용하는 범위는 넓히지 않았다. 미래 shell 구문의 모든 변형을 해석하는 일반 파서는 도입하지 않았고, CI의 명시한 filter/Dockerfile 형식과 backend 전용 step 보존을 검증한다.

## 유지한 경계

- 운영 ingress의 헤더 덮어쓰기와 BFF/API 우회 차단은 배포 전제다. 저장소 테스트로 운영 네트워크를 검증했다고 주장하지 않는다.
- Windows는 native Darwin EPERM→ESRCH 증거를 제공하지 않는다. 명시적 handshake와 bounded cleanup은 소스를 수정했고 native 실행 한계는 남긴다. Linux CI도 Darwin 실행 증거가 아니다.
- 실제 PostgreSQL·Valkey·스토리지·이미지와 두 API의 web/admin E2E는 새 PR CI에서 확인한다. 개발 `fastapi`·`joon`·`nestjs` 스택과 볼륨은 사용하거나 내리지 않는다.
- `The destination stream closed early`는 Q4 component probe로 원인을 증명하지 않았다. 전체 브라우저 흐름의 관측 여부를 별도로 기록하며 경고 17개 수정과 혼동하지 않는다.
- 번역한 unnamed 사용자 표시, 삭제된 audit target의 404 가능성, package.json 기반 앱 발견, dangling link·Windows 비정상 일반 파일 경계, unknown TEMP provenance, native IME/구형 브라우저·flake 빈도는 기존에 수용한 제품/증거 경계다. 임의 기능 추가나 데이터 삭제로 바꾸지 않았다.
- 프로토타입 PR #12는 병합 대상이 아니다. 미래 major 버전 이행은 이번 고정 버전 후속 개선의 범위가 아니다.
