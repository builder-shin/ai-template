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
