# 권한 추가

계약에 권한을 먼저 등록하고 `src/core/security/permissions.ts`의 명시 목록과
`src/modules/roles/permissions.ts`의 설명을 갱신한다. 모듈의 `permissions.ts`는
`PermissionCode`로 검사되는 상수를 공개하고 operation과 정책이 이를 사용한다.
관리자 시스템 역할은 전체 목록을 사용한다. member 역할의 부여는 별도로 결정한다.

권한 enum을 문자열 타입으로 넓히거나 OpenAPI에서 숨기지 않는다. 시드와
`scripts/tests/gen-bootstrap.test.ts`의 완전한 예상 권한 목록을 함께 갱신한다.
생성기는 자신이 추가하는 두 권한의 예상 literal을 독립 프로젝트 fixture에도 쓴다.

익명·작성자·다른 회원·관리 권한·권한 회수 후 세션 재검사를 시험한다.
모르는 권한과 중복 등록도 거절해야 한다. `pnpm gen`과 `pnpm check --fast` 뒤
준비된 환경에서 역할·세션·실시간 흐름을 확인한다.
