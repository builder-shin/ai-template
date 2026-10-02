# 실시간 구독 추가

모든 명령과 경로는 이 프로젝트 루트 기준이다. 골든 예시는 `src/features/posts/realtime.tsx`다. 기존 `posts` 채널의 구독자를 추가하는 절차이며 새 채널은 아래 공통 타입도 확장한다.

## 파일 순서

1. `contract/typespec/src/realtime.tsp`와 `src/lib/generated/realtime.ts`에서 채널·이벤트 이름·payload를 확인한다. 새 선언은 [계약 확장](change-contract.md)으로 TypeSpec·목·테스트부터 맞추고 `pnpm gen`한다. 생성 타입을 직접 고치지 않는다.
2. 기능 옆 `realtime.test.tsx`에 관심 있는 id·이벤트만 화면을 갱신하는지, 연속 이벤트를 묶는지, 해제 때 타이머를 지우는지 먼저 검사한다. 실제 소켓은 `scripts/realtime.integration.test.ts`와 두 컨텍스트의 `e2e/posts.spec.ts`를 모델로 검사한다.
3. 기능의 `realtime.tsx`에 `"use client"`와 `lib/realtime`의 공개 `useChannel`을 쓴다. 기존 채널은 `useChannel("posts", handler)`로 구독한다. 처리기는 id·이벤트를 거르고 `router.refresh()`로 Server Component를 다시 읽는다. 골든 목록은 100ms 동안 이벤트를 묶고 상세는 같은 id만 갱신한다. payload를 데이터 캐시에 저장하지 않는다.
4. 삭제·비공개 전환 안내가 필요하면 기능의 클라이언트 layout에 작은 안내 상태만 둔다. ko/en 카탈로그에 안내·돌아가기 문구를 넣는다. 화면 데이터는 계속 queries에서 읽는다.
5. 새 채널일 때는 `src/lib/realtime/channel.ts`의 이벤트 union·이름별 listener·채널별 구독 처리를 생성된 payload에 맞춘다. 현재 `PostEvent`와 `post.*` listener는 posts 전용이라 생성만으로 새 이벤트가 연결되지는 않는다. 이어서 `provider.tsx`의 `useChannel` 인자 타입과 `index.ts` 공개 타입을 맞추고 `channel.test.tsx`·`provider.test.tsx`에 구독 ack·거절·재연결·마지막 소비자 해제를 검사한다.
6. 기능의 `index.ts`에서 구독 컴포넌트를 내보내고 `src/app/[locale]/`의 페이지·layout에서 가져온다. 로케일 layout의 기존 `RealtimeProvider` 아래에 둔다. 페이지마다 새 Provider나 Socket.IO 연결을 만들지 않는다.

## 규칙

- 구독은 기능의 공개 `index.ts`, 공통 연결은 `lib/realtime`을 쓴다. `lib`가 기능을 import하지 않는다. API·세션·티켓 발급 Action은 server-only로 유지한다.
- 브라우저의 직접 연결은 Socket.IO다. 연결·재연결마다 Server Action이 1회용 티켓을 발급하며 access·refresh token은 브라우저에 보내지 않는다. 공통 Provider의 세션 키·generation·해제 처리를 보존한다.
- `session.revoked`를 받았다는 이유만으로 로그아웃하지 않는다. 공통 Action의 현재 세션 `GET /me`가 401일 때만 지운다. 정상 응답·연결 오류·5xx에는 유지한다.
- 쓰기는 `useActionState`·`<form action>`·`toFormResult`를 쓰는 Action에 둔다. `SubmitButton`의 실시간 폼 대기를 보존해 결과 적용 전에 티켓·세션 확인이 폼을 덮어쓰지 않게 한다.
- 로딩은 스피너·스켈레톤만, 안내와 접근성 이름은 ko/en 카탈로그만 쓴다.

## 확인

프로젝트 루트에서 실행한다. 새 기능의 단위 검사도 같은 RED·GREEN 명령에 추가한다.

```sh
pnpm exec vitest run src/features/posts/realtime.test.tsx src/lib/realtime/channel.test.tsx src/lib/realtime/provider.test.tsx scripts/realtime.integration.test.ts
```

두 브라우저 컨텍스트로 다른 쪽의 발행·취소·삭제가 문서 이동 없이 반영되는지, 세션 폐기가 해당 세션만 로그아웃시키는지 확인한다. 개발 서버를 종료하고 3100·4110을 비운 뒤 순서대로 실행한다.

```sh
pnpm fix
pnpm check
pnpm build
pnpm test:e2e
```

외부 대상은 `e2e/AGENTS.md`의 FastAPI 설정과 실제 backend Origin 허용을 준비해 같은 흐름을 확인한다.
