# JSON:API 선언과 검증

`defineOperation()`에 계약의 operationId·경로·인증·권한·스키마·응답을 선언한다.
`@Operation()`은 `{id}`를 Nest의 `:id`로 등록한다. 컨트롤러 경로는 빈 경로로 두고
`@JsonApiRequest()`에서 원본 URL의 쿼리, 파싱된 경로와 본문, 주체를 받는다.
주체 해석과 인증·권한 guard는 후속 보안 계층이 맡는다.

쿼리는 먼저 검사한다. 중복 키·미선언 파라미터와 필터는 400이고, include·sort의
허용 목록 위반은 각각의 오류 코드다. 경로와 본문은 같은 단계에서 검사하며,
오류 상태가 섞이면 400으로 집계한다. Zod issue의 코드와 경계로 `meta.params`를
정하므로 사용자에게 보여 줄 메시지는 오류 코드와 params로 번역한다.

문자열 길이는 `codePointString()`으로 코드 포인트를 센다. `jsonInteger()`는
유한한 JSON number 정수와 선언한 경계만 검사한다. int64에도 안전 정수 상한을
추가하지 않는다. JavaScript의 `JSON.parse()`는 2^53을 넘는 정수 표기의 정밀도를
잃는다. 예를 들어 9007199254740993은 9007199254740992가 된다. BigInt는 쓰지 않는다.

이메일·UUID·날짜시간에는 `emailString()`·`uuidString()`·`dateTimeString()`을 쓴다.
형식은 검사하되 JSON Schema에 pattern을 더하지 않는다. 컴포넌트는 계약 이름으로
`registerComponent()`에 등록하고, 판별 유니온은 discriminator 옵션을 함께 준다.
레지스트리는 스키마와 선언을 보존한다. OpenAPI 문서의 참조 생성은 문서 생성기가 맡는다.

컬렉션은 `collectionDocument()`로 페이지 메타와 상대 링크를 만든다. 링크는 원래
쿼리 순서를 보존하고 `page[number]`만 맨 뒤에 붙인다. 빈 결과의 totalPages는 0이다.
`IncludeRegistry`의 로더는 요청의 트랜잭션과 viewer를 받고 id를 묶어서 조회한다.
포함 리소스는 관계에서 찾은 것만 남기며 중복과 주 리소스를 제외한다. users는 name과
avatar 관계만 남기는 공개 형태다. 로더는 허용하지 않는 리소스를 반환하지 않는다.

`DocumentInterceptor`는 `writeDocument()`로 Buffer를 직접 쓰고 JSON:API 미디어 타입을
그대로 유지한다. 비 ASCII 문자는 소문자 `\uXXXX`로 이스케이프한다.
