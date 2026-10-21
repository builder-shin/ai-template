# BFF 클라이언트 주소 전달

## 목적과 경계

Q1은 web/admin을 통과하는 서로 다른 클라이언트의 IP별 한도와 감사 주소를 보존한다. 기본값은 비활성화다. 현재 고정 버전과 독립 실행 모드를 유지한다.

신뢰 경계는 `브라우저 → 신뢰 ingress → BFF → API`다. 운영자가 ingress에서 전용 헤더를 항상 덮어쓰고 BFF 직접 접근을 네트워크로 막았을 때만 `TRUSTED_CLIENT_IP_HEADER=x-ingress-client-ip`를 설정한다. 헤더 존재 자체로 송신자를 인증할 수 없으며 이 설정은 ingress 배포 계약에 대한 명시적 동의다.

API는 BFF의 실제 연결 주소만 `FORWARDED_ALLOW_IPS`에 포함한다. NestJS는 기존 Express trust proxy 설정, FastAPI는 uvicorn 프로세스 환경을 사용한다. `*`나 불필요하게 넓은 대역은 사용하지 않는다. ingress 및 BFF 우회 접근을 차단하지 못하면 기능을 켜지 않는다.

## 구현

- 환경 키는 빈 문자열이 기본이며, 설정 시 소문자 `x-` HTTP 헤더 이름을 받는다. 잘못된 설정은 기존 시작 검증에서 변수명과 안내만 출력한다.
- 순수 주소 추출 함수는 설정한 헤더 하나만 읽는다. Node `net.isIP`로 IPv4/IPv6를 검증하며 목록, 포트, 괄호, zone identifier, 내부 공백·임의 문자는 거절한다. Fetch `Headers`가 가장자리 HTTP 공백을 정규화한 뒤의 값을 검증한다. 누락·무효 값은 전달하지 않고 기존 BFF 주소 예산으로 돌아간다.
- 동기 `createApiClient`는 Next 요청 문맥을 요구하지 않는다. 선택적인 `clientIp`를 검증하고 매 호출마다 `Forwarded`, `X-Forwarded-For`, `X-Real-IP`를 제거한 뒤 검증된 단일 `X-Forwarded-For`만 구성한다. 호출별 헤더로 이 값을 바꾸지 못한다. IP는 로그나 응답에 추가하지 않는다.
- 비동기 `createRequestApiClient`는 설정이 켜졌을 때만 `await headers()`로 요청 헤더를 읽는다. 비활성 상태는 Next 요청 문맥 없이도 동작한다. 활성 상태에서 요청 문맥이 없으면 API를 호출하기 전에 실패한다.
- 세션 클라이언트, web 인증 Action·공개 조회·OAuth 콜백과 admin 로그인은 요청 클라이언트를 쓴다. 토큰·주소를 공유 전역 상태에 저장하지 않는다.
- proxy는 `NextRequest.headers`를 직접 추출 함수에 넘기며 `headers()`를 호출하지 않는다. 갱신 함수는 선택적인 주소를 동기적으로 받아 기존 토큰별 single-flight Promise identity, 실패 기억과 완료 후 30초 만료를 보존한다. 같은 refresh token의 동시 요청은 최초 요청의 문맥을 공유한다. 서로 다른 토큰은 독립적이다.

## 대안과 선택

브라우저 `X-Forwarded-For` 체인을 그대로 전달하면 IP별 제한을 우회할 수 있다. Next `headers()`를 저수준 클라이언트에 넣으면 요청 외 테스트·도구 호출과 동기 갱신 인터페이스가 깨진다. 전용 요청 클라이언트와 단일 검증 주소를 선택한다. 별도 프록시 인증 프로토콜이나 의존성은 추가하지 않는다.

## 검증

- 기본 비활성, 올바른/잘못된 설정, IPv4/IPv6, 목록·zone·포트·공백·누락, 활성 요청 문맥 누락.
- 실제 HTTP 수신 헤더에서 호출자 위조 차단과 동시 요청 간 주소·토큰 분리.
- 세션·익명·인증·OAuth·proxy 갱신의 문맥 연결과 기존 single-flight identity/만료.
- NestJS 실제 HTTP trust proxy와 FastAPI uvicorn proxy middleware에서 신뢰/비신뢰 peer, 단일 주소 및 별도 클라이언트의 한도 분리.
- 기본 web/admin 전체 검사·build·목 E2E와 PR의 실제 백엔드 E2E. 운영 ingress/방화벽 배포 자체는 이 저장소가 만들지 않으므로 문서화된 운영 전제다.

구현 뒤 독립 보안 검토에서 위 신뢰 경계와 호출 경로 누락을 확인한다. 이 문서는 과거 검증이나 승인 기록을 소급해 만들지 않는다.
