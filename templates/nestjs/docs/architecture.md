# 아키텍처

`src/app.module.ts`가 도메인과 인프라를 조립하고 `src/modules/registry.ts`가
잡·주기 작업·include 로더와 파일 읽기 규칙을 등록한다. `posts`는 새 모듈의 골든이다.
도메인끼리는 각 모듈의 `index.ts`만 가져오며 core는 도메인을 가져오지 않는다.

| 경로                                                         | 책임                                                |
| ------------------------------------------------------------ | --------------------------------------------------- |
| `core/config`                                                | 모든 환경 키·운영 비밀 검증과 로케일                |
| `core/http`, `core/jsonapi`                                  | 협상·속도 제한·인증·operation 검증·JSON:API·OpenAPI |
| `core/db`, `core/redis`, `core/cache`                        | 트랜잭션·잠금·이름별 연결·커밋 뒤 캐시 무효화       |
| `core/jobs`, `core/mail`, `core/realtime`                    | 재시도·메일 렌더링·룸·이벤트 발행                   |
| `core/logging`, `core/telemetry`                             | 구조 로그·traceId·HTTP/pg/명시 span                 |
| `modules/auth`, `users`, `roles`                             | 인증·세션·OAuth·내 정보·관리 권한                   |
| `modules/posts`, `files`, `audit-logs`, `health`, `realtime` | 글·첨부·감사 조회·준비 상태·실시간 접속             |

요청은 미디어 협상과 전역 제한을 거쳐 operation의 인증·권한·Zod 검증을 받는다.
컨트롤러는 검증한 입력을 서비스에 넘긴다. 서비스는 `UnitOfWork.run` 안에서
저장소를 부르고 저장소만 Prisma 모델에 접근한다. 목록은 동일 스냅샷에서 count와
행을 읽는다. 쿼리·필터·fields·include는 operation에 선언한 범위만 허용한다.
에러는 공통 JSON:API 문서로 바꾸며 헬스와 본문 없는 OAuth 리다이렉트는 예외다.

같은 `Tx`로 변경과 감사를 기록하고 `afterCommit`으로 캐시·잡·실시간·객체 삭제를
예약한다. rollback된 변경의 효과는 실행하지 않는다. 분리 파일의 정리는 파일 행을
정렬된 순서로 잠그고 아바타·글·추가 모듈의 참조를 같은 트랜잭션에서 다시 확인한다.
생성기는 새 저장소의 참조 검사도 FilesModule에 등록한다.

API·worker·scheduler는 각각 독립 Nest 컨텍스트다. `pnpm dev`는 SWC 감시 빌드와
세 역할을 관리하며 소스 변경은 API만 재시작한다. worker는 진행 중 잡을 마친 뒤
큐·Prisma·Redis를 닫고 scheduler는 한 프로세스만 실행한다.
[잡 절차](recipes/jobs.md)와 [실제 CI 수명 시험](../tests/integration/jobs-lifecycle.test.ts)을 따른다.

일반 Redis 명령은 2초 제한과 요청별 재시도 1회를 쓴다. 이름이 `bullmq`인 연결만
차단 Worker 호환성을 위해 `maxRetriesPerRequest: null`이며 `commandTimeout`이 없다.
Queue와 Worker가 입력 연결을 공유하고 BullMQ가 복제한 차단 연결을 소유한다.
이 producer의 단절 감지를 2초로 보장하지 않는다. 이름 공간·lazy 연결·종료 정리는 유지한다.

Socket.IO API adapter와 worker emitter는 Redis 이름 공간을 공유한다. HTTP로 받은
일회용 ticket으로 연결하고 세션 재검사를 거친다. 권한 채널과 작성자 룸은 분리하며
공개 해제 이벤트는 초안 본문을 보내지 않는다. 이벤트는 commit 뒤 발행한다.
OpenAPI의 실시간 선언이 이름·페이로드·룸·권한을 기록한다. 플랫폼 비교의 채널 구조
일치는 설명 문구의 완전한 동등성까지 증명하지 않는다.

로그는 쿼리 문자열과 자격 증명을 남기지 않는다. traceId는 HTTP span에서 에러 문서와
로그로 이어진다. 헬스 요청은 계측하지 않는다. 속도 제한 저장소 장애의 통과 정책은
고정 분류 진단만 남긴다. [관측 절차](recipes/telemetry.md)를 따른다.

FastAPI와 같은 API 계약을 구현하지만 Nest의 operation·Zod 선언이 구현 스펙의 원본이다.
DI·SWC와 Prisma 생성 순서가 필요하며 JSON 숫자·유니코드 처리는 프로젝트 검증 계층을
거친다. 새 리소스는 플랫폼 계약을 먼저 확장한다. 구현에만 추가한 경로는 전체 계약
비교에서 차이로 드러나야 한다.
