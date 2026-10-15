# 실시간 이벤트 추가

계약에 이벤트·페이로드·룸·채널·권한을 먼저 등록한다.
`src/core/realtime/declarations.ts`의 명시 타입과 모듈 `events.ts`의 선언을 갱신한다.
이름 있는 페이로드 Zod 컴포넌트를 등록하고 모듈 `index.ts`를 통해 앱 그래프에 포함한다.
구독 채널을 더하면 `modules/realtime/schemas.ts`의 enum과 권한 선언도 갱신한다.

서비스는 RealtimePublisher에 `afterCommit`을 넘긴다. 공개 룸과 소유자·관리자 룸의
문서를 분리하며 초안 본문을 공개 해제 알림에 싣지 않는다. 이벤트 이름·조건별 룸·
commit/rollback·모르는 채널·구독 권한·세션 만료를 시험한다.

`pnpm gen` 뒤 OpenAPI의 `x-realtime-events`, `x-realtime-channels`,
`x-realtime-messages`를 확인한다. 채널 구조 비교는 설명 문구의 완전한 동등성을
뜻하지 않는다. 실제 adapter·emitter·여러 프로세스·TTL·연결 종료와 플랫폼 적합성은
준비된 CI에서 검증한다.
