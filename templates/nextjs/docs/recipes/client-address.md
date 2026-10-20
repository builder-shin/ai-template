# 신뢰 ingress 뒤의 클라이언트 주소

기본 설정은 `TRUSTED_CLIENT_IP_HEADER=`이며 API는 BFF 연결 주소를 본다. 따라서 IP별 요청 한도는 같은 BFF를 사용하는 사용자끼리 공유한다. 독립 개발·목 모드에서는 기본값을 유지한다.

클라이언트별 IP 한도와 감사 주소가 필요한 배포에서는 아래 조건을 모두 갖춘 뒤 설정한다.

1. 신뢰 ingress가 `X-Ingress-Client-IP` 같은 전용 헤더를 실제 클라이언트의 **단일 IP**로 항상 덮어쓴다. 브라우저가 보낸 값이나 임의 `X-Forwarded-For` 체인을 복사하지 않는다.
2. 방화벽·보안 그룹·비공개 연결로 ingress를 우회한 BFF 직접 접근을 막는다. BFF는 헤더만 보고 ingress의 신원을 확인할 수 없다.
3. BFF 프로세스에 `TRUSTED_CLIENT_IP_HEADER=x-ingress-client-ip`를 설정한다. 소문자 `x-` 헤더 이름만 받으며 잘못된 설정은 시작 시 실패한다.
4. API는 BFF와 명시한 프록시의 실제 연결 주소만 신뢰하고, BFF를 우회한 API 접근도 제한한다. 모든 주소를 신뢰하는 `*`와 불필요하게 넓은 대역은 사용하지 않는다.

| API     | 신뢰 설정                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NestJS  | 설정 `FORWARDED_ALLOW_IPS`에 BFF 연결 주소·필요한 프록시 대역을 명시한다. Express `trust proxy`가 이 목록을 사용한다.                                      |
| FastAPI | **uvicorn 프로세스 환경** `FORWARDED_ALLOW_IPS`에 BFF 연결 주소·필요한 프록시 대역을 명시한다. 앱의 환경 파일에 쓰는 것만으로는 uvicorn에 전달되지 않는다. |

ingress와 BFF 사이에 프록시가 더 있으면 그 프록시도 같은 덮어쓰기·접근 제한 계약을 지켜야 한다. 이 전제를 보장할 수 없으면 기능을 끈다. IP 공유 NAT의 사용자끼리는 같은 예산을 쓰며 이 기능이 사용자 인증을 대체하지 않는다.

주소는 IPv4·IPv6 하나만 허용한다. 누락·목록·포트·괄호·zone identifier·잘못된 값은 전달하지 않고 BFF 주소 예산으로 돌아간다. Fetch `Headers`가 가장자리 HTTP 공백을 정규화한 뒤 단일 값을 검증하며, 문자열 내부의 공백은 허용하지 않는다.

Server Component·Action·OAuth 콜백은 `createRequestApiClient`, 세션 요청은 `createSessionApiClient`를 쓴다. 요청 외 테스트·도구는 동기 `createApiClient`를 계속 쓴다. 요청 클라이언트가 켜졌는데 Next 요청 문맥이 없으면 네트워크 호출 전에 실패한다. proxy 갱신은 `NextRequest.headers`에서 직접 주소를 선택한다.

API 클라이언트는 매 호출의 `Forwarded`·`X-Forwarded-For`·`X-Real-IP`를 제거한 뒤 검증한 단일 `X-Forwarded-For`만 구성한다. 호출별 헤더로 주소를 바꾸지 못하며 주소를 로그·응답에 더하지 않는다. 동일 refresh token의 동시 갱신은 최초 요청의 주소와 같은 Promise를 공유하고, 다른 토큰의 요청 문맥은 분리한다. 갱신의 완료 후 30초 기억·실패 재사용·만료 규칙은 유지한다.

배포 확인에서는 서로 다른 두 클라이언트의 API 한도가 분리되는지, 브라우저 위조 헤더와 ingress/BFF 우회 연결이 신원을 바꾸지 못하는지 확인한다. 저장소의 회귀 검사는 주소 선택·요청 분리·backend 신뢰 경계를 확인하지만 운영 네트워크의 접근 제한을 대신 만들지는 않는다.
