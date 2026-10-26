# Expo Mobile Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 B안의 iOS/Android Expo 템플릿, API 업무 예제, AI 하네스와 단독/모바일 조합 생성을 완성한다.

**Architecture:** 모바일은 기존 JSON:API를 직접 호출하고 refresh 세션만 보안 저장소에 보관한다. Router 화면은 feature의 공개 진입점을 사용한다. 조합은 계약 원본 하나와 모바일 독립 pnpm 경계·의존성 없는 루트 proxy를 사용한다.

**Tech Stack:** Expo 58.0.16, React 19.3.0, React Native 0.88.0, TypeScript 6.0.3, Expo Router, SecureStore, TanStack Query, React Hook Form/Zod, i18next, Jest 30/RNTL 14, Maestro 2.11.0.

**Spec:** [승인된 Expo 설계](../specs/2026-10-21-expo-template-design.md). 사용자 승인: 2026-10-21 “승인한다”. 구현 계획의 검토와 실행 방식 선택은 아직 남는다.

## Global Constraints

- 기준 main `a6f1c9918b559b3ff12abdb0b3911e1dffec97eb`, 작업 브랜치 `feature/expo-template`; 기존 분리 워크트리를 사용하고 보호된 원본 checkout을 전환·reset하지 않는다.
- iOS와 Android, 기존 Google/Kakao/Naver OAuth, 인증·posts·계정·업로드·실시간·ko/en, `--template expo`·`--mobile` 조합이 범위다. Expo Web·EAS 프로젝트·스토어 출시는 범위 밖이다.
- 소스 400줄·테스트 600줄, Node `>=24 <25`, pnpm `12.6.0`, TypeScript override `6.0.3`, minimumReleaseAge `1440`, 명시한 allowBuilds를 유지한다. 기존 네 템플릿의 pin을 올리지 않는다.
- `.env`·`.env.local`을 읽거나 출력하지 않는다. 공개 기본값은 `.env.example`만 확인하고 시험은 명시적 환경을 주입한다. Expo 검사·CI에는 `EXPO_NO_DOTENV=1`을 사용한다.
- 계약·생성물은 원본과 생성기로만 변경한다. 기존 공유 사본은 원본 수정 후 `pnpm sync`; 새 공유 원본은 `git add → sync → fix:shared → sync` 순서다.
- `shared/nextjs/` 전체를 Expo에 복사하지 않는다. 계약 사본과 플랫폼 중립 하네스만 명시적으로 동기화한다.
- 개발 Metro/목은 `8081/4012`, E2E Metro/목은 `8082/4112`다. 사용 중인 포트·장치·ADB reverse·compose 자원을 먼저 검사한다.
- 로컬 Docker·DB·Valkey·스토리지와 개발 `fastapi`·`joon`·`nestjs` 스택/볼륨을 사용하거나 내리지 않는다. 실제 백엔드 E2E는 전용 PR CI에서만 한다.
- 로딩 문구를 표시하지 않는다. 스피너·스켈레톤에 접근성 이름을 제공한다. 토큰·메일 링크·코드·verifier는 로그와 검증 스크린샷에서 제외한다.
- 브라우저는 Orca CLI, Windows의 네이티브 UI 확인은 Orca Android 에뮬레이터 스킬을 사용한다. 네이티브 동작을 JS 테스트·Expo Go 결과로 대체했다고 주장하지 않는다.
- 생성 입력은 커밋된 HEAD다. 저장소 밖 소유한 `aitpl-` 폴더만 사용·정리한다. 정상 hook, 영어 Conventional Commit, AI 태그 없음, PR 담당자 지정.

## Review Focus

1. 갱신 응답과 보안 저장 완료 사이에 로그아웃·계정 교체가 발생해도 이전 세션이 살아나지 않는다 — Task 2의 지연 transport/storage 회귀.
2. cold start·중복 콜백·공격자가 만든 URI가 OAuth verifier를 바꾸거나 다른 origin으로 토큰을 보내지 않는다 — Task 3의 pending 상태·링크·실제 HTTP 회귀.
3. API는 emulator에서 열리지만 presigned 스토리지 주소가 닿지 않는 경우 명확히 실패하며 서명된 host를 고치지 않는다 — Task 6/9의 업로드 주소·기기 시험.
4. 앱 background 중 티켓 만료·계정 폐기가 일어나도 foreground에서 새 티켓과 데이터로 회복하고 이전 사용자의 cache를 보여주지 않는다 — Task 7의 AppState·서버 이벤트 회귀.
5. mobile-only 조합·Windows 공백 경로·잘못된 importer에서 웹 앱을 가정하거나 native peer 해석을 바꾸지 않는다 — Task 8의 14개 조합·잠금 그래프·실제 frozen 설치 회귀.

## 고정 버전과 실행 도구

다음 버전은 2026-10-21 npm 메타데이터와 `expo@58.0.16`의 `bundledNativeModules.json`으로 확인했다. 조회한 SDK 패키지는 모두 24시간 이상 지난 게시물이다. 설치 시 같은 버전의 무결성과 전체 필수 peer를 다시 검사한다.

| 그룹 | 정확한 pin |
| --- | --- |
| 기반 | expo 58.0.16; react 19.3.0; react-native 0.88.0; typescript 6.0.3; @types/react 19.3.0 |
| 라우팅 | expo-router 58.0.24; expo-linking 58.0.13; expo-constants 58.0.12; @expo/log-box 58.0.12; react-native-screens 4.30.0; react-native-safe-area-context 5.10.1 |
| 인증·개발 | expo-secure-store 58.0.2; expo-auth-session 58.0.13; expo-web-browser 58.0.6; expo-crypto 58.0.7; expo-dev-client 58.0.14 |
| 파일·UI | expo-image-picker 58.0.10; expo-document-picker 58.0.4; expo-file-system 58.0.10; expo-localization 58.0.5; expo-splash-screen 58.0.10; expo-status-bar 58.0.3 |
| 업무 | @tanstack/react-query 5.104.5; react-hook-form 7.90.0; @hookform/resolvers 6.0.0; i18next 26.5.3; react-i18next 17.1.0 |
| 기존 공통 도구 | zod 4.6.5; openapi-fetch 0.17.0; openapi-typescript 7.13.0; socket.io-client 4.8.4; lefthook 2.1.14; prettier 3.9.9; eslint 10.11.0; eslint-plugin-boundaries 7.2.0; typescript-eslint 8.71.0; tsx 4.23.15; @types/node 24.13.6; yaml 2.9.1 |
| 시험 | jest 30.5.2; @types/jest 30.0.0; jest-expo 58.0.11; @react-native/jest-preset 0.88.0; @testing-library/react-native 14.1.0; test-renderer 1.3.0 |
| Expo 설정 | eslint-config-expo 58.0.4; babel-preset-expo 58.0.18; @babel/core 7.29.7; expo-doctor 1.21.5. native Stack만 사용하므로 선택적 web/RSC·NativeTabs·커스텀 애니메이션 peer를 기능 없이 추가하지 않는다. |

필수 peer·Babel/Metro 해석은 Task 1에서 SDK가 요구하는 범위와 frozen 설치를 검사한다. 불일치하면 설치를 강제하거나 공통 pin을 바꾸지 말고 해당 호환 경계를 조사한다. 모든 직접 의존성은 범위 기호 없이 고정하고 잠금을 커밋한다.

Maestro `cli-2.11.0`의 `maestro.zip` SHA256은 `5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a`다. 설치기는 이 아카이브를 검증하며 원격 설치 스크립트를 파이프로 실행하지 않는다. Java 21을 사용한다. Android emulator action v2.38.0의 commit은 `a421e43855164a8197daf9d8d40fe71c6996bb0d`, setup-java v6.1.0은 `b843ebf9b913146b38da2eaa7aeddf76074ae1ad`다. 나머지 action은 기존 SHA pin을 재사용한다.

---

## Task 1: 독립 앱·계약·검사 하네스

**Files:**
- Create: `templates/expo/{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,template.json,app.config.ts,tsconfig.json,babel.config.cjs,metro.config.cjs,jest.config.cjs,eslint.config.js,.env.example,.gitignore,.gitattributes,AGENTS.md,CLAUDE.md}`.
- Create: `templates/expo/src/app/{_layout.tsx,index.tsx}`, `src/lib/config/{env.ts,identity.ts}`, `src/lib/api/{client.ts,errors.ts,session-port.ts}`, `src/lib/i18n/{index.ts,messages/ko.json,messages/en.json}`, `src/components/{screen.tsx,field.tsx,button.tsx,spinner.tsx}`.
- Create: `templates/expo/scripts/{setup.mjs,dev.mjs,process.mjs,gen.ts,generate.ts}`, `scripts/check/{cli.ts,stages.ts}`, `.claude/hooks/{stop-check.mjs,post-tool.mjs,pre-tool.mjs,session-start.mjs}`, `.claude/settings.json`.
- Modify: `scripts/shared-assets.json`, `scripts/test/verify-templates/verify.test.ts`, root `.prettierignore`/`eslint.config.js` only for the new independent boundary.
- Test: `templates/expo/src/lib/config/{env.test.ts,identity.test.ts}`, `src/lib/api/client.test.ts`, `scripts/{dev.test.mjs,gen.test.ts,check/stages.test.ts}`.

**Interfaces:** `MobileEnv {apiBaseUrl:string;realtimeUrl:string;frontendUrl:string;scheme:string;mode:'mock'|'backend'}`; `readPublicEnv(input:Record<string,string|undefined>,platform:'android'|'ios',release:boolean):MobileEnv`; `nativeIdentity(name:string):{scheme:string;iosBundleIdentifier:string;androidApplicationId:string}`. `api/session-port.ts` defines `SessionCredentials {generation:number;accessToken:string}` and `SessionPort {credentials():SessionCredentials|null;refresh(failed:SessionCredentials):Promise<SessionCredentials|null>}` before `createApiClient(config:MobileEnv,session?:SessionPort):Client<paths>` consumes them. `generateFiles(root:string,openapi:string):Promise<Record<string,string>>` produces `src/lib/api/generated/{schema.d.ts,error-codes.ts,realtime.ts}`; `gen --check` compares temporary output without changing the tree. Generated client paths strip the configured `/api/v1` prefix exactly once, matching existing clients.

- [ ] Write RED tests: release HTTP rejected; development Android uses `10.0.2.2:4012`, iOS `localhost:4012`; explicit device URL retained; secret-like public keys rejected. `nativeIdentity('my-app')` returns scheme `aitpl-my-app`, iOS `com.example.my-app`, Android `com.example.my_app`.
- [ ] Write HTTP client tests: configured API origin only, JSON:API headers, ko/en, field errors; external origin override rejected before fetch; Forwarded/XFF/X-Real-IP removed. Add `gen --check` stale/no-write and missing-config tests.
- [ ] Run `pnpm --dir templates/expo test --runInBand` and Node runner tests; capture missing module/behavior RED before filling implementation.
- [ ] Add the exact package set and independent pnpm policy. Inspect required/optional peers, run frozen installation, `expo install --check` and the pinned SDK doctor; record versions and peer resolutions in `docs/stack.md`. React/TypeScript and existing template pins stay fixed.
- [ ] Implement the interfaces, shell-free Windows/POSIX runners, temporary generation and mock ownership. Inline `process.env.EXPO_PUBLIC_*` property reads at the composition root; do not pass dynamic `process.env` access to Metro. The five public keys are `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_REALTIME_URL`, `EXPO_PUBLIC_FRONTEND_URL`, `EXPO_PUBLIC_APP_SCHEME`, `EXPO_PUBLIC_API_MODE`; release is derived from build mode, not an untrusted public override. Add contract copies through sync, an empty Router screen, typed i18n and accessible native controls. Setup must not register hooks in a parent repository by accident.
- [ ] Provide all required commands, recipes and AGENTS/CLAUDE pairs. `dev` owns only its mock/Metro; backend mode does not start a mock. Fix only explicit shared-source targets.
- [ ] GREEN: Expo `check`, both native Metro exports, `pnpm check:templates`, sync-copy checks and root `pnpm check`; output no web export or native-run claim. Commit `feat(expo): add independent mobile template harness`.

## Task 2: 회전 토큰·보안 저장·요청 격리

**Files:** Create `templates/expo/src/lib/session/{types.ts,store.ts,manager.ts,transport.ts,context.tsx,index.ts}`, corresponding `*.test.ts`; extend `src/lib/api/client.ts`/`client.test.ts`; create `src/app/providers.tsx` and `src/lib/query/client.ts`.

**Interfaces:** `StoredSession {sessionId:string;refreshToken:string;refreshTokenExpiresAt:string}`; `SessionStore {read():Promise<StoredSession|null>;write(value:StoredSession):Promise<void>;clear():Promise<void>}`. Import `SessionCredentials`/`SessionPort` from Task 1 rather than redefining them. `SessionSnapshot {status:'restoring'|'anonymous'|'authenticated';generation:number;sessionId:string|null;networkError:boolean}`. `SessionManager` implements SessionPort and adds `restore():Promise<void>`, `signIn(grant:SessionGrant):Promise<void>`, `signOut():Promise<void>`, `snapshot():SessionSnapshot` and `subscribe(listener:()=>void):()=>void`; `SessionGrant`/tokens derive from generated schema. Transport uses a bare API client so session POST cannot recursively refresh itself.

- [ ] RED: 20 concurrent unauthorized requests trigger exactly one refresh; stale access failures reuse the newer credentials; 403/network failure does not rotate; a second 401 does not loop. Actual HTTP captures origin, headers, payload and request count.
- [ ] RED: hold refresh response and SecureStore write separately, log out or sign in as B, release A, and assert B/anonymous state plus store/cache remain correct. Repeat for failed store write and app restore offline versus revoked refresh.
- [ ] RED: no access token is serialized; malformed/expired record is rejected; failed rotation persistence never retries the old refresh token; clear failures fail closed and are reported without secret values.
- [ ] Pin external-store stability and race assertions: `expect(manager.snapshot()).toBe(manager.snapshot())` between transitions; after releasing A's held write following sign-in B, `expect(await store.read()).toEqual(sessionB)` and `expect(manager.snapshot().sessionId).toBe(sessionB.sessionId)`.
- [ ] Implement serialized storage writes with a generation fence and a per-generation refresh flight. Snapshot transitions cancel old requests and clear private query data. Guard late fetch results before returning them to query/mutation consumers.
- [ ] Attach the session port to authenticated fetch, clone retryable JSON requests before consumption and retry once with the returned current credentials. Bare credential endpoints and presigned PUT bypass refresh wrapping.
- [ ] GREEN: `pnpm --dir templates/expo test --runInBand src/lib/session src/lib/api` then full Expo `check`; commit `feat(expo): add secure session lifecycle and refresh isolation`.

## Task 3: 네이티브 OAuth·메일 링크와 백엔드 정책

**Files:** Create `templates/expo/src/lib/links/{parse.ts,oauth.ts,pending.ts,index.ts}` and `*.test.ts`; `src/app/{oauth/callback.tsx,verify-email.tsx,reset-password.tsx,+native-intent.ts}`; `docs/recipes/app-links.md` and `docs/app-links/{apple-app-site-association,assetlinks.json}`.
- Modify: `templates/nestjs/src/core/config/settings.ts`; add `oauth-callback.ts`/`tests/oauth-callback.test.ts` there; modify `templates/fastapi/src/app/core/config.py` and add `oauth_urls.py`/`tests/test_oauth_urls.py`; modify `contract/mock/src/config.ts` and add `core/oauth-callback.ts`/tests.
- Test/runner config: `contract/conformance/test/flows/oauth.test.ts`, `scripts/src/conformance/targets.ts`, backend OAuth HTTP tests, mock OAuth tests. Read descendant AGENTS before editing.

**Interfaces:** `parseAppLink(url:string,env:MobileEnv):{kind:'oauth'|'verify-email'|'reset-password';value:string}|null`; `OAuthPending {provider:'google'|'kakao'|'naver';verifier:string;createdAt:number}`; `beginOAuth(provider:OAuthPending['provider']):Promise<void>` and `finishOAuth(url:string):Promise<void>` use Task 2 manager and a separate SecureStore pending key. `validOAuthCallback(value:string):boolean`/Python `valid_oauth_callback(value:str)->bool` retain valid existing HTTP(S) values and permit configured private app schemes only in the shape `<scheme>://oauth/callback`.

- [ ] RED across three targets: configured `aitpl-example://oauth/callback` succeeds; unlisted callback is 400 before provider redirect; javascript/data/file/exp/exps, wildcard, credentials, fragment or wrong native path fails config validation. Existing web callback tests remain green.
- [ ] RED: native PKCE exchange requires the original verifier; wrong/replayed code fails. Include this HTTP sequence in conformance and add the native URI only to explicit test configuration, not production defaults.
- [ ] RED links: cold-start pending restoration, cancel, expiry after 10 minutes, duplicate callback, wrong scheme/origin/path, multiple code/error/token values and encoded path confusion. Reject before token exchange. Match existing mail paths `verify-email`/`reset-password` and supported locale prefixes.
- [ ] Implement exact allowlist policy in API/mock config and native link parsing, persisted pending PKCE before opening the browser, one-time consumption and cleanup. Provider secrets remain server-side. API response shapes do not change.
- [ ] Add operational associated-domain examples with clearly named substitutions and a dev/CI mail-link adapter. Native routing receives validated link results; it never uses URL-supplied user identity or privileges.
- [ ] GREEN: focused Jest/backend config+HTTP tests and `pnpm conformance mock`. Real backend conformance runs in PR CI. Sync mock copies and run the relevant root checks. Commit `feat(expo): support secure native authentication links`.

## Task 4: 인증 UI·세션 관리·언어

**Files:** Create `templates/expo/src/features/auth/{api.ts,schemas.ts,login-screen.tsx,signup-screen.tsx,reset-screen.tsx,verify-screen.tsx,index.ts}`, `src/features/account/{api.ts,sessions-screen.tsx,index.ts}` and their tests; wire `src/app/{login.tsx,signup.tsx,forgot-password.tsx,(app)/_layout.tsx,(app)/me/sessions.tsx}`; extend both message catalogs.

**Interfaces:** `AuthApi` wraps the existing registrations/email-verifications/password-reset/sessions contract using Task 1 client. Screens consume the session manager and link functions; `(app)` uses Router protected routes. `sessionQueryKey(generation:number,locale:'ko'|'en'):readonly unknown[]` scopes private requests. Cross-feature calls use public indexes.

- [ ] RED component/API flows: repeated signup validation preserves name/email and clears passwords; field-pointer errors, 401/403/409/422/429, password reset request/completion, verification expired/already-used response and retry preserve safe input.
- [ ] RED route/identity flows: protected deep link before restore, recent-login failure, current/other/all session revocation, logout during fetch, locale switch after API error; queries cannot expose the previous generation.
- [ ] Implement actual native labelled controls and schema-backed forms, keyboard/focus handling, protected navigation and restoring/offline/error states. Spinners/skeletons have accessible names and no visible loading strings.
- [ ] Complete ko/en key/type checks and locale propagation to raw/session/API clients; validate the user's returned locale before adopting it. Keep remote error codes typed from generated output.
- [ ] GREEN: RNTL user interactions with native Router tests and real mock HTTP, full Expo `check`; commit `feat(expo): add authentication and session screens`.

## Task 5: posts 골든·화면·기능 생성기

**Files:** Create `templates/expo/src/features/posts/{api.ts,queries.ts,schemas.ts,list-screen.tsx,detail-screen.tsx,editor-screen.tsx,index.ts}` and tests; route `src/app/{index.tsx,posts/[id].tsx,(app)/posts/new.tsx,(app)/posts/[id]/edit.tsx}`; create `scripts/gen-feature/{cli.ts,plan.ts,write.ts}`/tests, recipe and thin `.claude/skills/add-feature/SKILL.md`.

**Interfaces:** `postKeys.list(scope:{generation:number;locale:'ko'|'en';author?:string;page:number})`; `PostsApi {list(input:PostListInput):Promise<PostCollection>;get(id:string):Promise<PostDocument>;create(input:PostCreateInput):Promise<PostDocument>;update(id:string,input:PostUpdateInput):Promise<PostDocument>;remove(id:string):Promise<void>}` derives input/output types from schema. Generator `planFeature(root:string,name:string):FileEdit[]` validates every output before `writeFeature(edits:readonly FileEdit[]):void`; `FileEdit {path:string;content:string}`.

- [ ] RED actual HTTP: public published versus own draft visibility, pagination termination, relationship labels, title 1–200/body 100000 limits, draft↔published, unauthorized mutation and stale 404/conflict.
- [ ] RED native UI: list→detail→new/edit→publish/unpublish→delete, keyboard submission, field errors, empty/network states, old account results dropped and ko/en output.
- [ ] Implement queries, native screens and generated-schema mutations. Form values survive server failures. Invalidation targets the relevant post/list keys, not unrelated session data.
- [ ] RED generator: valid new feature produces routes/catalogs/tests and passes types; invalid/reserved/duplicate name, import collision or missing input leaves no written file. Generated names are stable and registration is explicit.
- [ ] Implement the golden-based generator and recipe, keeping backend permissions as a reviewed product choice and reporting exact follow-up edits. No test merely asserts prose strings.
- [ ] GREEN: focused Jest/Node generator tests, generated feature smoke in an owned temp copy, full Expo `check`; commit `feat(expo): add posts golden and feature generator`.

## Task 6: 내 정보·네이티브 파일 업로드

**Files:** Create `templates/expo/src/lib/upload/{picker.ts,upload.ts,index.ts}`/tests; `src/features/account/{profile-screen.tsx,avatar-field.tsx}`/tests and `src/app/(app)/me/index.tsx`; add posts cover field and its tests.

**Interfaces:** `PickedFile {uri:string;name:string;mimeType:string;size:number}`; `pickImage():Promise<PickedFile|null>` distinguishes cancellation from denied permission; `uploadFile(file:PickedFile,options:{signal:AbortSignal}):Promise<FileResource>` uses pending metadata→unauthenticated presigned PUT→completion confirmation. Account API wraps existing `/me` and avatar relationship operations.

- [ ] RED: cancelled picker performs no API call; denied permission has actionable UI; size/MIME/quota failure; aborted PUT; completion failure; invalid readiness; expired session before metadata; stale generation before attaching the uploaded resource.
- [ ] RED HTTP: PUT receives precisely the original presigned origin/path/signature/content type and file bytes; API Authorization never goes to storage. Unreachable emulator storage host is reported without rewriting the URL or logging it.
- [ ] Implement SDK 58 File/picker adapters, permitted upload lifecycle, profile/name/locale updates, avatar and post-cover attach/remove. Keep picker/native details behind the upload public index.
- [ ] GREEN: Jest/RNTL tests against actual mock storage bytes, full Expo `check`; record Android/iOS permission and real storage cases for Task 9. Commit `feat(expo): add profile and native uploads`.

## Task 7: 실시간과 앱 상태 회복

**Files:** Create `templates/expo/src/lib/realtime/{connection.ts,events.ts,provider.tsx,index.ts}`/tests; extend Task 2 providers and Task 5 query invalidation; add `docs/recipes/realtime.md`.

**Interfaces:** `startRealtime(input:{session:SessionManager;queryClient:QueryClient;appState:AppStatePort}):()=>void`; `AppStatePort {current(): 'active'|'background'|'inactive';subscribe(listener:(state:string)=>void):()=>void}`. Events use generated realtime declarations. Native transport is socket.io-client 4.8.4 with a fresh API ticket in auth payload, never access tokens in URLs.

- [ ] RED: background disconnect; foreground obtains a new ticket then revalidates lists; expired/reused ticket, transient disconnect and reconnect backoff; session-revoked event clears secure state/cache and routes to login.
- [ ] RED: late event/connection callback after account switch has no effect on the new session; unmount cancels timers/listeners/sockets; duplicate event does not duplicate list data. Exercise real mock Socket.IO alongside AppState unit control.
- [ ] Implement connection ownership and query invalidation. An ordinary network loss does not erase a valid refresh record; definitive revocation does. Foreground does not reuse an expired ticket.
- [ ] GREEN: realtime/session integration and full Expo `check`; commit `feat(expo): reconnect realtime safely across app lifecycle`.

## Task 8: 단독·모바일 조합 CLI와 잠금 경계

**Files:** Modify `create/src/{arguments.ts,create.ts,standalone.ts,combo.ts,workspace.ts,lockfile.ts}` only at the new app dispatch boundary; create `create/src/{frontends.ts,mobile-workspace.ts}`. Add `create/assets/combo/mobile-only/tools/mobile/package.json`, `mobile-only/scripts/mobile-command.mjs` and selected-app harness/README/CI edits.
- Test: `create/test/{arguments.test.ts,mobile-generation.test.ts,mobile-lock-boundary.test.ts,mobile-policy.test.ts,mobile-identity.test.ts}`, combo runner Node tests, existing FastAPI byte golden and NestJS resolution suites.
- Docs/config: root `AGENTS.md`/`README.md`, `create/README.md`, harness standard; keep existing historical specs intact.

**Interfaces:** `Frontend = 'web'|'admin'|'mobile'`; `frontendTemplate(app:Frontend):'nextjs'|'nextjs-admin'|'expo'`; `MobileBoundaryInput {root:string;sourceLock:string;sourceWorkspace:string;pnpm:PnpmRunner}`; `configureMobileBoundary(input:MobileBoundaryInput):void` removes only standalone contract importers, retains mobile app/tool resolution, configures root proxy and installs frozen. `verifyMobileBoundary(root:string,sourceLock:string):void` compares the retained importer closure, packages, snapshots and tool documents. Missing `.` or unsafe importer path is a pre-install error.

- [ ] RED parser matrix: two backends × seven nonempty web/admin/mobile subsets, standalone Expo, conflicting/duplicate flags, reserved combo `mobile`, allowed standalone names and help. Error exit 2 before child commands/target writes.
- [ ] RED fixtures: native lock keeps exact React/Expo/native peer and pnpm-tool resolutions; missing/traversing contract importer, changed override/age/allowBuilds, Windows case/space path, registry failure and gen failure leave no target/temp sibling. Check executable bits from Git index.
- [ ] Implement app descriptors, native identity rewriting in `app.config` data, selected assets and independent mobile workspace. Root owns one contract; mobile invokes root contract generation before its API type generation and never installs root contract packages again.
- [ ] Implement dependency-free root `tools/mobile` proxy and Turbo inputs pointing at `apps/mobile/**` with cache disabled for gen/check/native work. Mobile dependency add/remove/exec uses `pnpm --dir apps/mobile`. Preserve NestJS `tools/api` isolation and all web/admin resolutions.
- [ ] RED runner/CI pruning: no mobile commands/assets when absent; no web/admin assumptions when mobile-only; first failure stops later tasks; `--filter mobile`/`--filter=mobile`/multiple lines handled. Do not create a mobile web Dockerfile or healthcheck.
- [ ] GREEN: full create and combo Node suites, root `pnpm check`, then normal commit `feat(create): support standalone and composed Expo apps` before real generation smoke.
- [ ] Generate outside repo from committed HEAD: standalone Expo, FastAPI+mobile, NestJS+web+admin+mobile. Compare source bytes/permissions; frozen root/mobile/API installs, gen and native Metro exports; existing project input invariants and no secret/install copying. Native device/backend checks belong to Task 9 CI. Clean only owned temp projects.

## Task 9: 네이티브 빌드·사용자 흐름·CI·최종 검토

**Files:** Create `templates/expo/scripts/native/{build.mjs,e2e.mjs,device.mjs,maestro.mjs,manifest.json}`/Node tests; `templates/expo/e2e/{auth.yaml,oauth.yaml,posts.yaml,account.yaml,uploads.yaml,realtime.yaml,locale.yaml}` and support fixtures. Add `scripts/src/mobile-e2e/{cli.ts,plan.ts,run.ts}`/tests and dedicated `scripts/compose/expo-e2e-{fastapi,nestjs}.yaml`.
- Modify `.github/workflows/ci.yml`; add Expo's standalone CI and generated mobile CI asset. Add `docs/superpowers/reports/2026-10-21-expo-template.md` for validation evidence.

**Interfaces:** `NativeRunOptions {platform:'android'|'ios';target:'mock'|'fastapi'|'nestjs';deviceId:string;runId:string}`; `NativePlan {commands:readonly {argv:readonly string[];cwd:string;env:Record<string,string>}[];deviceId:string;reversePorts:readonly number[];projectName?:string;imageTag?:string}`; `nativePlan(options:NativeRunOptions):NativePlan` checks commands/resources before execution. Node native runners accept `--platform`, `--device`, `--run-id`; root `pnpm mobile-e2e <fastapi|nestjs>` uses a generated mobile combo and explicit dedicated stack/image ownership. `--print`, `--keep`, `--down` follow existing runner safety semantics; printed environment is an explicit public allowlist and runtime link values are redacted.

- [ ] RED runner tests: invalid config/device/port/resource collision fails before child spawn; existing ADB reverse is not replaced; interrupted build/test returns a signal exit code and owns bounded process cleanup; `--down` removes only the run's exact stack/volume/image tags and created reverse mappings.
- [ ] Implement checked Maestro installer with the pinned ZIP hash, Java 21 and shell-free Windows launcher; CNG native build runs in owned copies so android/ios build output cannot enter Git/source generation. Default Android compile SDK 37, emulator API 36 x86_64; iOS runner `macos-26`, verify installed Xcode meets SDK 58's 26.4 floor before building.
- [ ] Compile release artifacts with explicit example HTTPS API URLs and no network interaction; development emulator runs use explicit reachable API/storage/provider endpoints. Release compilation must not succeed by enabling production cleartext or claiming a development-mode build is release.
- [ ] Build development APK and simulator app, run the real UI flows in the seven flow files, and verify a release native artifact can compile without signing/store submission. Test cold start link, logout during refresh, permission denial/cancel, real selected bytes and background→foreground recovery. Clear input secrets before screenshots; redact native/HTTP diagnostics.
- [ ] Extend CI with exactly six required jobs: `expo`, `expo-android`, `expo-ios`, `expo-e2e-fastapi`, `expo-e2e-nestjs`, `create-expo`. Preserve the existing 15 jobs and their checks; the final expected total is 21. Pin new actions to the hashes above.
- [ ] `expo` runs frozen install, full check and Android/iOS Metro exports. `expo-android` runs mock development/release build and native UI flows; `expo-ios` runs simulator build/mock UI plus unsigned release compilation. Backend jobs build and exercise generated mobile-only combos against their dedicated API/storage/provider stacks. `create-expo` validates the three actual generated cases from Task 8 including nested boundaries and selected-app CI commands.
- [ ] Run local full Expo/root checks and permitted Android native verification. Use Orca Android skill for Windows UI inspection; record any unavailable local tool honestly. Docker/real backend and iOS verification run only on their actual CI platforms; never silently substitute exports or JS mocks.
- [ ] Reconcile all approved spec sections with source/tests/evidence. Request one independent whole-branch review, address findings with regressions, run affected checks and normal commits/hooks.
- [ ] Create a PR with assignee, then obtain all 21 exact-head CI successes, including cleanup steps. Preserve earlier failed logs and distinguish native Android/iOS evidence. Final sync/Git clean, owned temp cleanup and Korean result report; notification when the client provides that tool.

## 검증 명령 계약

Task 1 creates the command surface used by later tasks:

```text
pnpm --dir templates/expo setup
pnpm --dir templates/expo check
pnpm --dir templates/expo test --runInBand [test paths]
pnpm --dir templates/expo build --platform android|ios
pnpm --dir templates/expo test:e2e --platform android|ios --device <owned device id>
pnpm --dir templates/expo gen
pnpm --dir templates/expo gen:feature <name>
pnpm mobile-e2e fastapi|nestjs --run-id <id>
pnpm check
```

`build` means native compilation; Metro-only generation is an explicit `export` script. Native `test:e2e` requires a real available device and gives a prerequisite error before spawning if unavailable. As for the other independent templates, root `check` validates Expo's structure/copies and root tooling without requiring a template install or simulator; Expo's own `check` and the required `expo` CI job run all JS/type/config checks.

## 자기 검토와 실행 선택

- Spec §1–3/7 → Task 1/4/5; §4 → Task 2; §5 → Task 3; §6 → Task 5/6/7; §8 → Task 8; §9–10 → Task 9.
- SessionPort/Manager, generated API client, NativeRunOptions and mobile boundary interfaces are defined above before their consumers. No app accesses Next.js server APIs or unrelated feature internals.
- The five Review Focus cases have explicit owning tests. Emulator upload reachability and iOS actual UI remain device gates, not Node assertions.
- Implementation cannot start until the user reviews this saved plan and selects Native or Subagent-driven execution. Recommended: Native implementation in this session with one fresh final reviewer, because session/link/API/CLI interfaces are tightly coupled and task-local fresh contexts would duplicate the same large setup repeatedly.
