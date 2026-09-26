# JSON:API 규약

플랫폼 API는 [JSON:API 1.1](https://jsonapi.org/format/)을 따른다. 이 문서는 스펙이 정하지 않은 부분을 우리가 어떻게 정했는지 적는다. 원본은 `contract/typespec/`이고, 규칙 대부분은 `contract/api-style/` 룰셋이 기계적으로 검사한다.

## 적용 범위

- `/api/v1` 아래의 모든 요청·응답 본문은 JSON:API 문서다. 미디어 타입은 `application/vnd.api+json` 하나만 쓴다.
- 예외는 두 가지다.
  - OAuth 리다이렉트(`/api/v1/oauth/{provider}/authorize`, `/callback`): 본문 없이 302로 응답한다.
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
- 리소스에 속하지 않는 공용 스키마는 다음뿐이다: `ErrorCode`, `ErrorDocument`, `ErrorObject`, `ErrorSource`, `PageMeta`, `PaginationLinks`, `CollectionMeta`, `Locale`, `OAuthProvider`, `HealthReport`. 늘리려면 룰셋(`redocly.yaml`의 `shared`)과 이 목록을 함께 고친다.
- 백엔드 스펙에는 계약의 스키마 이름이 모두 있어야 한다. 백엔드 생성기가 중첩 모델에 붙이는 보조 이름(예: `PostCreateData`)은 더 있어도 된다. 프론트 코드는 계약에 있는 이름만 참조한다.

## 쿼리 파라미터

| 파라미터                     | 규칙                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `include`                    | 허용 경로를 operation의 `x-jsonapi-include`에 적는다. 그 밖의 경로는 400 `jsonapi.unsupported_include`     |
| `fields[type]`               | 모든 리소스에서 지원한다. 요청하면 그 밖의 필드를 넣지 않는다                                              |
| `sort`                       | 허용 필드를 `x-jsonapi-sort`에 적는다. `-` 접두사는 내림차순. 그 밖은 400 `jsonapi.unsupported_sort`       |
| `page[number]`, `page[size]` | 기본 1과 20, 최대 100. `meta.page{number,size,total,totalPages}`와 `links.first/prev/next/last`를 돌려준다 |
| `filter[...]`                | 리소스마다 명시한 필터만 받는다. 검색은 `filter[q]`. 모르는 필터는 400 `jsonapi.invalid_query`             |

- `totalPages`는 `ceil(total / size)`다. 결과가 없으면 0이다.
- 계약의 스키마는 필드를 모두 담은 기본 표현이다. `fields[type]`을 요청한 응답은 그 표현에서 요청한 필드만 남긴 투영이다. 적합성 테스트는 이 경우 `assertSparseFieldset`으로 검사한다.
- 포함 리소스는 문서 안의 어떤 관계에서든 참조되어야 한다(full linkage). 같은 리소스를 두 번 담지 않는다.

## 에러

- 에러 응답은 `{ "errors": [...], "meta": { "traceId": "..." } }`이다.
- 에러 객체는 `status`(문자열), `code`, `title`, `detail`, `source.pointer` 또는 `source.parameter`, `meta.params`를 담는다.
- 필드 검증 오류는 필드마다 에러 객체 하나를 만들어 422로 응답한다.
- 코드 목록은 [error-codes.md](error-codes.md)에 있다.

## 인증과 권한 표기

- 로그인이 필요한 operation은 `security: [{ BearerAuth: [] }]`, 로그인이 선택이면 `[{ BearerAuth: [] }, {}]`다.
- 권한이 필요한 operation은 `x-permission`에 권한 코드를 적는다. 소유권 규칙(작성자만 수정 등)은 description에 적는다.

## 실시간

- OpenAPI 루트의 `x-realtime-channels`가 구독 가능한 채널과 필요한 권한을, `x-realtime-events`가 이벤트 이름·받는 곳·페이로드 스키마를 적는다.
- `x-realtime-events`의 `rooms`는 그 이벤트를 늘 받는 룸이다. `user:{userId}`와 `user:{authorId}`는 해당 사용자(글 이벤트는 작성자)의 `user:{id}` 룸이다. `conditionalRooms`는 조건이 맞을 때만 받는 룸이고 `{ room, when }` 꼴이다. `when`은 `published`(바뀐 뒤 글이 발행 상태)와 `wasPublished`(지우기 전 글이 발행 상태였음) 둘 중 하나다.
- 페이로드도 JSON:API 문서이고 `components.schemas`에 있다. 그래서 프론트엔드는 같은 생성 과정으로 이벤트 타입을 얻는다.

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
