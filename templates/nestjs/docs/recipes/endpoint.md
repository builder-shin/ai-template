# 엔드포인트 추가

플랫폼 계약에 요청·응답 상태·권한·에러 코드를 먼저 등록한다.
골든 `src/modules/posts/operations.ts`에서 operation의 경로·인증·쿼리·응답 스키마와
허용 에러를 선언하고 `schemas.ts`에 이름 있는 Zod 컴포넌트를 등록한다.

컨트롤러는 `@Operation`과 `@JsonApiRequest`로 검증한 값을 서비스에 전달한다.
서비스는 정책과 UnitOfWork를 조합하고 저장소가 Prisma를 사용한다. 컨트롤러에서
PrismaService·생성 클라이언트를 직접 가져오지 않는다. 소속 모듈은 내부 경로를
쓸 수 있고 다른 모듈은 `index.ts`만 가져온다.

소유자·익명·권한 없음·없는 리소스·본문과 URL id 충돌·잘못된 쿼리·응답 상태의
행동 시험을 쓴다. [JSON:API 절차](jsonapi.md)를 확인하고 `pnpm gen`과
`pnpm check --fast`, 준비된 환경의 전체 check를 실행한다.
