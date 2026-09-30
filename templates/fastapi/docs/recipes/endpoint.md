# 엔드포인트 추가

## 언제

이미 있는 모듈에 라우트를 더하거나(예: 글의 좋아요, 사용자 목록의 필터) 요청·응답 모양을 바꿀 때. 새 리소스는 [모듈 추가](module.md)를 따른다.

## 명령

1. 문서 모델, 선언, 라우트, 서비스를 고친다(아래 "고칠 파일"). 쓰는 법은 [architecture.md](../architecture.md)의 "JSON:API 공통 계층 쓰는 법"에 있고, 정답 예시는 `src/app/modules/posts/router.py`다.
2. `uv run poe gen`: `openapi.json`을 다시 쓴다. 라우트나 문서 모델을 바꾸면 늘 돌린다.
3. `uv run poe check`: `generated` 단계가 `openapi.json`이 최신인지, `contract` 단계가 API 룰셋(이름, 경로, 에러 응답)을 지키는지 본다.

## 고칠 파일

- `schemas.py`: 요청과 응답 문서 모델. 제네릭(`Document[...]`)을 라우트에 직접 쓰지 않고 이름 있는 서브클래스를 만든다. 선택 필드는 `Omittable[T] = MISSING`이다.
- `router.py`
  - 선언: `Operation(name=..., errors=..., permission=..., description=...)`. 컬렉션은 `CollectionOperation(..., sort=..., filter=<FilterModel>)`이고, 포함 리소스와 필드는 `include=`, `fields=`로 허용한다. operationId는 `<interface>_<name>`이다.
  - 에러 묶음: 인증이 필요하면 `AUTH_ERRORS`, 경로의 리소스가 없을 수 있으면 `NOT_FOUND`, 본문이 있으면 `BODY_ERRORS`, POST는 `CREATE_ERRORS`, PATCH는 `CONFLICT`를 넣고 `COMMON_ERRORS`를 더한다.
  - 라우트: `@<라우터>.route("GET", "/{id}", 선언, response_model=<문서 모델>)`. 쿼리는 `Annotated[CollectionQuery[<필터>], Depends(선언)]`로 받고, 응답은 `render()`로 만든다. PATCH는 `require_matching_id()`로 본문의 id를 확인한다.
- `service.py`: 유스케이스와 트랜잭션 경계(commit). 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail, pointer=...)`로 던진다. 새 에러 코드는 `ErrorCode`(`app.core.jsonapi.error_codes`)에 더한다.
- `repository.py`: 쿼리. 정렬 열은 `SORT_COLUMNS`, 페이지는 `page()`를 따른다(posts 참고).
- 권한이 새로 필요하면 [권한 추가](permission.md), 요청 밖에서 할 일이 있으면 [잡 추가](job.md)를 따른다.
- `tests/`: `api`와 `accounts` fixture로 성공, 권한 없음(403), 없음(404), 틀린 본문(422)을 확인한다.

## 규칙

- 문서 모델의 정수는 `int`가 아니라 `Int32`·`Int64`(`app.core.jsonapi.models`)로 쓴다. 두 별칭은 strict라 계약의 integer처럼 숫자 문자열(`"10"`)과 불리언을 422 `validation.invalid_format`으로 거절한다. `int`는 lax라 둘을 정수로 바꿔 받는다.
- DB에 저장하는 문자열 필드에는 길이 제약(`Field(max_length=...)`, `StringConstraints(max_length=...)`)을 둔다. 제약이 있는 문자열만 Pydantic이 값을 파싱해 짝 없는 서로게이트(JSON의 `\ud800`)를 422 `validation.invalid_format`으로 거절한다. 제약 없는 `str`은 그 값을 그대로 받고, 저장할 때 psycopg가 UTF-8로 인코딩하지 못해 500이 난다. 제약 없는 문자열은 비교에만 쓴다(토큰, id, 허용 목록과 맞춰 보는 파일의 `contentType`).
- 계약 모양 때문에 길이를 `json_schema_extra`와 검증기로 따로 세는 필드(널 허용 문자열의 `maxLength`가 `anyOf` 밖에 있는 경우)는 Pydantic이 파싱하지 않는다. 그 검증기가 길이보다 먼저 짝 없는 서로게이트를 `string_unicode`로 거절한다(`roles/schemas.py`의 `RoleDescription`).

## 확인

- `uv run poe check`가 통과한다.
- `openapi.json`의 새 operation에 선언한 에러 응답과 쿼리 파라미터가 있다.
