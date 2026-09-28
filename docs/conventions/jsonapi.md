# JSON:API 규약

플랫폼 API는 [JSON:API 1.1](https://jsonapi.org/format/)을 따른다. 이 문서는 스펙이 정하지 않은 부분을 우리가 어떻게 정했는지 적는다. 원본은 `contract/typespec/`이고, 규칙 대부분은 `contract/api-style/` 룰셋이 기계적으로 검사한다.

## 적용 범위

- `/api/v1` 아래의 모든 요청·응답 본문은 JSON:API 문서다. 미디어 타입은 `application/vnd.api+json` 하나만 쓴다.
- 예외는 두 가지다.
  - OAuth 리다이렉트(`/api/v1/oauth/{provider}/authorize`, `/callback`): 본문 없이 302로 응답한다. 허용하지 않은 `redirectUri`, 없거나 형식이 틀린 `codeChallenge`, 없거나 만료된 `state`는 400 `jsonapi.invalid_query`(`source.parameter`)다. `POST /sessions`의 `oauthCode` grant는 `codeVerifier`가 있어야 한다. 콜백은 제공자가 덧붙이는 쿼리 파라미터를 받아들인다.
  - 헬스체크(`/health/live`, `/health/ready`): API 밖에 있고 `application/json`으로 응답한다.
- 확장(Atomic Operations 등)과 프로필은 쓰지 않는다.

## 문서와 리소스

- `type`은 복수형 kebab-case이고 URL 첫 세그먼트와 같다(`/api/v1/audit-logs` ↔ `audit-logs`). `/api/v1/me`만 `users`를 돌려주는 별칭이다.
- `id`는 UUIDv7 문자열이다. 권한(`permissions`)만 권한 코드를 id로 쓴다.
- 속성과 관계 이름은 camelCase다.
- 관계 전용 엔드포인트(`/relationships/...`)는 두지 않는다. 관계는 리소스를 `PATCH`해서 바꾸고, 관계의 `self` 링크도 내보내지 않는다.
- 생성은 201과 문서, 삭제는 204로 응답한다. 비동기로 처리하는 생성(인증 메일 재발송, 비밀번호 재설정 요청)은 계정이 있는지 드러내지 않도록 항상 202다.
- CRUD가 아닌 동작도 리소스로 표현한다. 예: 로그인은 `POST /sessions`, 글 발행은 `PATCH /posts/{id}`로 `status: "published"`.

## 스키마 이름

두 백엔드는 아래 이름을 그대로 재현한다. `<Name>`은 `type`의 단수 PascalCase다(`audit-logs` → `AuditLog`).

| 스키마                 | 이름                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| 속성, 관계             | `<Name>Attributes`, `<Name>Relationships`                           |
| 리소스 객체            | `<Name>Resource`                                                    |
| 단건·컬렉션 문서       | `<Name>Document`, `<Name>CollectionDocument`                        |
| 생성·수정 요청 문서    | `<Name>CreateDocument`, `<Name>UpdateDocument`                      |
| 생성·수정 요청 속성    | `<Name>CreateAttributes`, `<Name>UpdateAttributes`                  |
| 실시간 이벤트 페이로드 | `<Resource><Event>EventDocument` (예: `PostPublishedEventDocument`) |

- 그 밖의 보조 스키마(`PostStatus`, `SessionGrant` 등)도 리소스 이름으로 시작한다.
- 리소스에 속하지 않는 공용 스키마는 다음뿐이다: `ErrorCode`, `ErrorDocument`, `ErrorObject`, `ErrorSource`, `PageMeta`, `PaginationLinks`, `CollectionMeta`, `Locale`, `OAuthProvider`, `HealthReport`, 그리고 실시간 구독 메시지의 `RealtimeChannel`, `RealtimeSubscription`, `RealtimeAck`. 늘리려면 룰셋(`redocly.yaml`의 `shared`)과 이 목록을 함께 고친다.
- 백엔드 스펙에는 계약의 스키마 이름이 모두 있어야 한다. 백엔드 생성기가 중첩 모델에 붙이는 보조 이름(예: `PostCreateData`)은 더 있어도 된다. 프론트 코드는 계약에 있는 이름만 참조한다.

## 쿼리 파라미터

| 파라미터                     | 규칙                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include`                    | 허용 경로를 operation의 `x-jsonapi-include`에 적는다. 그 밖의 경로는 400 `jsonapi.unsupported_include`                                                                       |
| `fields[type]`               | 모든 리소스에서 지원한다. 요청하면 그 밖의 필드를 넣지 않는다                                                                                                                |
| `sort`                       | 허용 필드를 `x-jsonapi-sort`에 적는다. `-` 접두사는 내림차순. 그 밖은 400 `jsonapi.unsupported_sort`                                                                         |
| `page[number]`, `page[size]` | 기본 1과 20, 최대 100. `meta.page{number,size,total,totalPages}`와 `links.first/prev/next/last`를 돌려준다. 링크는 요청 경로 기준의 상대 경로이고 대괄호는 퍼센트 인코딩한다 |
| `filter[...]`                | 리소스마다 명시한 필터만 받는다. 검색은 `filter[q]`. 모르는 필터는 400 `jsonapi.invalid_query`                                                                               |

- `totalPages`는 `ceil(total / size)`다. 결과가 없으면 0이다.
- 페이지 링크는 요청 경로에 쿼리를 붙인 상대 경로다.
  - 쿼리는 `application/x-www-form-urlencoded` 규칙으로 인코딩한다. 대괄호는 `%5B`, `%5D`이고 공백은 `+`다.
  - 원래 요청의 파라미터를 받은 순서대로 두고, `page[number]`만 빼서 맨 뒤에 붙인다.
  - 예: `GET /api/v1/users?filter[q]=kim&page[size]=10&page[number]=2`의 `next`는 `/api/v1/users?filter%5Bq%5D=kim&page%5Bsize%5D=10&page%5Bnumber%5D=3`이다.
- 관계로 거르는 필터(`filter[role]`, `filter[author]`, `filter[actor]`)는 관련 리소스의 id(uuid)를 받는다. 형식이 틀리면 400 `jsonapi.invalid_query`다.
- 기간 필터(`filter[createdFrom]`, `filter[createdTo]`)는 시작을 포함하고 끝을 포함하지 않는다. 시각은 오프셋이 있는 RFC 3339(`2026-09-27T00:00:00Z`)이고, 오프셋이 없으면 400 `jsonapi.invalid_query`다.
- `filter[이름]`의 이름은 속성 이름과 같은 camelCase만 받는다. `filter[created_from]`처럼 다른 표기는 모르는 필터(400)다. `filter[`로 시작하지만 `]`로 끝나지 않는 파라미터도 400이다.
- 계약의 스키마는 필드를 모두 담은 기본 표현이다. `fields[type]`을 요청한 응답은 그 표현에서 요청한 필드만 남긴 투영이다. 적합성 테스트는 이 경우 `assertSparseFieldset`으로 검사한다.
- 포함 리소스는 문서 안의 어떤 관계에서든 참조되어야 한다(full linkage). 같은 리소스를 두 번 담지 않는다.
- 다른 리소스의 `included`에 들어가는 `users`는 보는 사람과 관계없이 항상 공개 형태(`UserPublicResource`)다(§4.10).

## 에러

- 에러 응답은 `{ "errors": [...], "meta": { "traceId": "..." } }`이다.
- 에러 객체는 `status`(문자열), `code`, `title`, `detail`, `source.pointer` 또는 `source.parameter`, `meta.params`를 담는다.
- `source.pointer`는 RFC 6901 JSON Pointer다. 요청 문서 전체는 빈 문자열 `""`이다(`"/"`는 이름이 빈 문자열인 멤버를 가리킨다).
- 필드 검증 오류는 필드마다 에러 객체 하나를 만들어 422로 응답한다.
- JSON:API 1.1이 반드시(MUST) 쓰라는 상태를 따른다.
  - 요청 본문의 `type`이 엔드포인트의 리소스와 다르면 409 `resource.conflict`다(POST와 PATCH 모두). PATCH는 `id`가 경로의 리소스와 달라도 409다. `/api/v1/me`는 로그인한 사용자의 id가 경로의 리소스다.
  - 생성 요청(POST)에 클라이언트가 만든 `id`가 있으면 403 `permission.denied`다. 클라이언트가 만든 id는 받지 않는다.
  - 관계가 가리키는 리소스가 없으면 404 `resource.not_found`이고, `source.pointer`가 그 식별자를 가리킨다(예: `/data/relationships/roles/data/1`).
  - 그래서 계약의 모든 POST는 403과 409를, 관계를 함께 보내는 요청은 404를 선언한다. 로그인 없이 부르는 POST에는 `CreateErrors`(403, 409)를, 로그인이 필요한 POST에는 `Conflict`를 더한다(`AuthErrors`에 403이 있다).
- 코드 목록은 [error-codes.md](error-codes.md)에 있다.

### 에러 우선순위

한 요청에 문제가 여럿이면 먼저 걸린 단계의 에러만 돌려준다. 두 백엔드 모두 이 순서를 따른다.

1. 429 `rate_limit.exceeded`: IP별 전역 요청 한도
2. 415, 406: 콘텐츠 협상
3. 400 `jsonapi.invalid_document`: 본문이 JSON이 아니다
4. 401, 403: 인증과 권한(operation의 `security`, `x-permission`)
5. 400: 쿼리 파라미터(`jsonapi.invalid_query`, `jsonapi.unsupported_include`, `jsonapi.unsupported_sort`)
6. 본문과 경로 검증: 문서 구조 400, `type` 불일치 409, 클라이언트가 만든 `id` 403, 필드 422, 경로의 id 형식 404. 이 단계에서 상태가 둘 이상 섞이면 가장 일반적인 400으로 응답하고, 에러 객체는 모두 담는다.
7. 엄격한 요청 한도(로그인, 가입, 메일 발송 요청)의 429
8. 도메인 에러: 없는 리소스 404, 상태 충돌 409, 도메인 규칙 422 등

### 상태 코드 → 에러 코드

라우팅, 인증 미들웨어 등 프레임워크나 공통 계층이 JSON:API 문서 없이 HTTP 상태만 내는 에러는 그 상태로 에러 코드를 정한다. 두 백엔드 모두 이 표를 따른다.

| 상태                                           | 코드                       |
| ---------------------------------------------- | -------------------------- |
| 400                                            | `jsonapi.invalid_document` |
| 401                                            | `auth.unauthenticated`     |
| 403                                            | `permission.denied`        |
| 404, 그리고 `Allow` 헤더 없이 404로 답하는 405 | `resource.not_found`       |
| 409                                            | `resource.conflict`        |
| 429                                            | `rate_limit.exceeded`      |
| 503                                            | `service.unavailable`      |
| 그 밖의 상태                                   | 500 `internal.unexpected`  |

## 인증과 권한 표기

- 로그인이 필요한 operation은 `security: [{ BearerAuth: [] }]`, 로그인이 선택이면 `[{ BearerAuth: [] }, {}]`다.
- 권한이 필요한 operation은 `x-permission`에 권한 코드를 적는다. 소유권 규칙(작성자만 수정 등)은 description에 적는다.

## 실시간

- OpenAPI 루트의 `x-realtime-channels`가 구독 가능한 채널과 필요한 권한을, `x-realtime-events`가 이벤트 이름·받는 곳·페이로드 스키마를 적는다.
- `x-realtime-events`의 `rooms`는 그 이벤트를 늘 받는 룸이다. `user:{userId}`와 `user:{authorId}`는 해당 사용자(글 이벤트는 작성자)의 `user:{id}` 룸이다. `conditionalRooms`는 조건이 맞을 때만 받는 룸이고 `{ room, when }` 꼴이다. `when`은 `published`(바뀐 뒤 글이 발행 상태)와 `wasPublished`(지우기 전 글이 발행 상태였음) 둘 중 하나다.
- 페이로드도 JSON:API 문서이고 `components.schemas`에 있다. 그래서 프론트엔드는 같은 생성 과정으로 이벤트 타입을 얻는다.
- 클라이언트가 보내는 메시지는 `x-realtime-messages`에 적는다. `subscribe`와 `unsubscribe`는 페이로드 `RealtimeSubscription`(`{ channel }`)을 보내고, 서버는 ack `RealtimeAck`로 답한다. 성공이면 `{ ok: true }`, 실패면 `{ ok: false, error }`이고 `error`는 에러 객체다(권한 없음 403 `permission.denied`, 모르는 채널이나 틀린 페이로드 422 `validation.invalid_choice`, `source.pointer`는 `/channel`).
- 채널 권한은 구독할 때만 본다. 구독한 뒤에 권한을 잃거나 계정이 비활성화되거나 탈퇴해도, 그 연결은 끊기거나 구독을 풀 때까지 그 채널의 이벤트를 받는다. 그래서 `me.updated`(`changed`에 `roles`나 `status`)나 `session.revoked`를 받은 클라이언트는 연결을 끊고 새 티켓으로 다시 붙어 구독을 다시 검사받아야 한다. 서버에서 그런 연결을 내보내는 일은 후속 작업이다(인스턴스를 가로질러 사용자별 소켓 id를 기록해야 한다).
- 연결: 전송은 WebSocket만 받는다. 브라우저 연결의 Origin은 허용 목록으로 본다. 로그인한 연결은 `auth.ticket`에 티켓(`POST /realtime-tickets`, 30초, 1회용)을 넣는다. 티켓이 틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부하고, `connect_error`의 message는 `auth.token_invalid`, data는 에러 객체(`status` "401")다. 티켓이 없으면 익명 연결이다.
- 이벤트는 쓰기가 commit된 뒤에 나간다. 한 연결이 여러 룸에 있어도 한 번 받는다. `session.revoked`는 그 사용자의 모든 연결이 받으므로(페이로드에 세션 id가 없다) 클라이언트는 자기 세션이 살아 있는지 확인한다. `me.updated`의 `changed`는 `roles`(역할을 받거나 잃음, 가진 역할의 권한이 바뀌거나 역할이 지워짐), `status`(관리자가 상태를 바꿈), `profile`(이름, 로케일, 아바타)이다.

## 메일 링크

인증 메일과 재설정 메일은 프론트 주소(`FRONTEND_URL`)의 경로에 토큰을 붙인 링크를 담는다. 프론트는 그 경로에서 토큰을 받아 API를 부른다. 적합성 스위트는 이 경로로 메일의 종류를 가리고 토큰을 꺼낸다.

| 메일            | 링크                                         | 프론트가 부르는 API                |
| --------------- | -------------------------------------------- | ---------------------------------- |
| 이메일 인증     | `{FRONTEND_URL}/verify-email?token=<토큰>`   | `POST /api/v1/email-verifications` |
| 비밀번호 재설정 | `{FRONTEND_URL}/reset-password?token=<토큰>` | `POST /api/v1/password-resets`     |

## 계약을 바꾸는 방법

1. `contract/typespec/src/`의 TypeSpec을 고친다. 새 리소스는 `resources/posts.tsp`의 구조를 따른다.
2. `pnpm gen`으로 `contract/openapi.yaml`과 적합성 테스트 타입을 다시 만든다. 생성물은 직접 고치지 않는다.
3. `pnpm check`로 룰셋, 계약 테스트, 생성물 최신 여부를 확인한다.
4. 에러 코드를 더했다면 [error-codes.md](error-codes.md)에도 적는다.

## 룰셋 규칙

| 규칙                            | 검사                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `jsonapi/media-type`            | `/api/v1` 본문은 `application/vnd.api+json`만 쓴다                      |
| `jsonapi/error-response`        | 4xx 응답이 하나 이상 있고, 4xx·5xx는 `ErrorDocument`를 참조한다         |
| `jsonapi/request-document`      | POST 본문은 `*CreateDocument`, PATCH 본문은 `*UpdateDocument`다         |
| `jsonapi/type-matches-path`     | 요청·응답 리소스의 `type`이 경로 첫 세그먼트와 같다(`me` → `users`)     |
| `jsonapi/collection-parameters` | 컬렉션 GET은 페이지·정렬·필드 선택 파라미터와 `x-jsonapi-sort`를 가진다 |
| `jsonapi/include-extension`     | `include` 파라미터와 `x-jsonapi-include`를 함께 선언한다                |
| `jsonapi/schema-naming`         | 스키마 이름이 위의 이름 규칙을 따른다                                   |
| `jsonapi/camel-case-properties` | 스키마 속성 이름은 camelCase다                                          |

백엔드 템플릿은 이 룰셋의 사본으로 자기가 내보낸 `openapi.json`을 검사한다(`node lint.js <파일>`).
