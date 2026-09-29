# 에러 코드

API 에러 객체의 `code` 값 목록이다. 원본은 `contract/typespec/src/errors.tsp`의 `ErrorCode`이고, 이 표와 어긋나면 계약 테스트가 실패한다.

- 형식은 `<영역>.<snake_case 사유>`다.
- 클라이언트는 `code`와 `meta.params`만 믿고 문구를 번역한다. `title`과 `detail`은 개발자용 영어다.
- 새 코드는 TypeSpec의 `ErrorCode`와 이 표에 함께 추가하고, 프론트 템플릿의 번역 카탈로그에도 넣는다.

| 코드                              | HTTP       | 의미                                                                                               |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `jsonapi.unsupported_media_type`  | 415        | 요청 Content-Type이 JSON:API 미디어 타입이 아니다                                                  |
| `jsonapi.not_acceptable`          | 406        | Accept가 JSON:API 미디어 타입을 허용하지 않는다                                                    |
| `jsonapi.invalid_document`        | 400        | 요청 본문이 JSON:API 문서 형식이 아니다                                                            |
| `jsonapi.invalid_query`           | 400        | 모르는 쿼리 파라미터나 필터다                                                                      |
| `jsonapi.unsupported_include`     | 400        | 허용하지 않은 include 경로다                                                                       |
| `jsonapi.unsupported_sort`        | 400        | 허용하지 않은 정렬 필드다                                                                          |
| `validation.required`             | 422        | 필수 값이 없다                                                                                     |
| `validation.too_short`            | 422        | 값이 너무 짧다(`meta.params.min`)                                                                  |
| `validation.too_long`             | 422        | 값이 너무 길다(`meta.params.max`)                                                                  |
| `validation.invalid_format`       | 422        | 형식이 틀렸다(이메일, UUID 등)                                                                     |
| `validation.out_of_range`         | 422        | 허용 범위를 벗어났다                                                                               |
| `validation.invalid_choice`       | 422        | 허용된 값이 아니다                                                                                 |
| `validation.already_taken`        | 422        | 이미 쓰는 값이다(예: 가입 이메일)                                                                  |
| `auth.unauthenticated`            | 401        | 로그인이 필요하다                                                                                  |
| `auth.invalid_credentials`        | 401        | 이메일이나 비밀번호가 틀렸다                                                                       |
| `auth.token_expired`              | 401        | access token이 만료됐다                                                                            |
| `auth.token_invalid`              | 401        | 토큰이 올바르지 않다. 실시간 티켓이 틀렸거나 만료됐으면 연결 거부(`connect_error`)의 message다     |
| `auth.refresh_token_reused`       | 401        | 이미 쓴 refresh token이다. 세션 계열을 폐기했다                                                    |
| `auth.oauth_code_invalid`         | 401        | 소셜 로그인 1회용 코드가 틀렸거나 만료됐다. `codeVerifier`가 맞지 않거나 형식이 틀릴 때도 쓴다     |
| `auth.reauthentication_required`  | 401        | 다시 로그인해야 한다. 탈퇴는 로그인한 지 10분 안의 세션만 한다(refresh로는 풀리지 않는다)          |
| `auth.oauth_denied`               | 리다이렉트 | 사용자가 제공자 화면에서 로그인을 거부했다(`access_denied`). 콜백이 프론트 콜백의 `error`로 보낸다 |
| `auth.oauth_failed`               | 리다이렉트 | `access_denied` 밖의 제공자 에러, 또는 코드 교환이나 신원 조회 실패다. 콜백이 `error`로 보낸다     |
| `auth.email_not_verified`         | 403        | 이메일 인증을 마치지 않았다                                                                        |
| `auth.account_deactivated`        | 403        | 비활성화된 계정이다                                                                                |
| `auth.verification_token_invalid` | 422        | 인증·재설정 토큰이 틀렸거나 만료됐다                                                               |
| `permission.denied`               | 403        | 권한이 없다. 생성 요청에 클라이언트가 만든 `id`가 있을 때도 쓴다                                   |
| `role.system_role_protected`      | 422        | 시스템 역할은 지울 수 없고, admin의 권한은 고칠 수 없다                                            |
| `role.last_admin_protected`       | 422        | 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 할 수 없다                                   |
| `resource.not_found`              | 404        | 리소스가 없다. 관계가 가리키는 리소스가 없을 때도 쓴다                                             |
| `resource.conflict`               | 409        | 요청이 현재 상태와 충돌한다(예: 본문의 `type`이나 `id`가 엔드포인트와 다르다)                      |
| `post.invalid_transition`         | 422        | 허용되지 않는 글 상태 전이다                                                                       |
| `file.too_large`                  | 422        | 파일이 너무 크다(`meta.params.max`)                                                                |
| `file.type_not_allowed`           | 422        | 허용하지 않는 MIME 타입이다                                                                        |
| `file.upload_incomplete`          | 422        | 스토리지에 업로드된 객체가 없다                                                                    |
| `rate_limit.exceeded`             | 429        | 요청 한도를 넘었다. `Retry-After`를 따른다                                                         |
| `internal.unexpected`             | 500        | 예상하지 못한 서버 오류다                                                                          |
| `service.unavailable`             | 503        | 의존 서비스(DB 등)를 쓸 수 없다                                                                    |

`POST /files`에서 크기와 타입이 모두 한도를 벗어나면 크기를 먼저 본다. 응답은 `file.too_large` 하나이고, 두 백엔드 모두 이 순서를 따른다. 여러 단계의 에러가 겹칠 때의 순서는 [JSON:API 규약](jsonapi.md)의 "에러 우선순위"에 있다.

소셜 로그인의 `codeVerifier`는 RFC 7636의 code verifier(`[A-Za-z0-9._~-]` 43~128자)여야 한다. 그 형식이 아니거나 `codeChallenge`와 맞지 않으면 `oauthCode` grant는 401 `auth.oauth_code_invalid`다. 콜백의 `error`는 제공자의 에러가 `access_denied`(사용자가 거부)일 때만 `auth.oauth_denied`이고, 그 밖의 제공자 에러(`server_error`, `invalid_scope` 등)는 `auth.oauth_failed`다.
