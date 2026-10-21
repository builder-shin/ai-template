# Expo 모바일 템플릿 설계 제안

- 작성일: 2026-10-21
- 상태: B안 승인됨. 사용자가 2026-10-21 이 설계 문서를 검토한 뒤 “승인한다”고 답했다. iOS·Android 업무 예제와 단독/모바일 조합 생성 범위를 확정했고, 이후 구현 계획을 검토한 뒤 Native 인라인 실행을 지시했다. 현재 증거는 [구현·검증 기록](../reports/2026-10-21-expo-template.md)을 따른다.
- 기준: main `a6f1c9918b559b3ff12abdb0b3911e1dffec97eb`, 작업 브랜치 `feature/expo-template`.
- 목적: 기존 네 템플릿처럼 AI 코딩 규칙·골든·생성기·검사가 갖춰진 독립 Expo 프로젝트를 제공한다.
- 승인 시점에는 제품 코드·의존성 설치·네이티브 프로젝트 생성을 수행하지 않았다.

## 1. 요청과 추천 범위

사용자가 확정한 요청은 “template에 expo도 추가”다. 현재 저장소의 성공 기준은 독립 실행, 같은 플랫폼 API 계약, posts 골든, 강제되는 검사와 단독·조합 생성이다. 이 기준을 모바일에도 적용하는 안을 추천한다.

추천 대상은 iOS와 Android다. Expo Web을 별도 제품 프론트로 제공하는 범위는 포함하지 않는다. 웹은 기존 Next.js 템플릿을 사용한다. 첫 버전은 클라우드 계정 없이 로컬 개발과 CI 검증이 가능해야 한다.

추천 기능:

- 비밀번호 로그인, 가입·메일 인증·비밀번호 재설정, 토큰 갱신, 로그아웃·활성 세션 관리.
- 기존 Google·Kakao·Naver OAuth의 네이티브 앱 복귀와 PKCE 교환.
- 공개 글 목록·상세, 작성·수정·삭제·상태 전이의 posts 골든.
- 내 정보·언어 변경, 아바타·글 표지 업로드.
- 글 변경·세션 폐기 이벤트 처리, 앱 복귀 시 연결·데이터 재동기화.
- ko/en, 시스템 테마, 접근성, 스피너·스켈레톤 로딩, 재시도·오류 화면.
- 단독 `--template expo`와 FastAPI/NestJS 조합의 `--mobile` 생성.

결제·OS 푸시 알림·백그라운드 상시 연결·오프라인 쓰기 큐·스토어 제출은 이 제안의 범위 밖이다. 실시간은 기존 API의 앱 실행 중 이벤트를 뜻한다.

## 2. 접근 방식 비교

| 안 | 제공 범위 | 장점 | 비용·제약 |
| --- | --- | --- | --- |
| A. 최소 시작점 | Router·테마·API 클라이언트·최소 화면, 단독 생성 | 가장 작은 변경 | 인증·글·업로드의 실제 정답 예시가 부족하다 |
| B. 네이티브 API 연동 템플릿 — 추천 | 위 기능과 골든·하네스·단독/조합 생성 | 기존 템플릿의 성공 기준을 모바일에서도 충족한다 | 모바일 세션·링크·네이티브 CI와 CLI 경계가 필요하다 |
| C. Expo로 웹까지 통합 | B와 Expo Web의 제품 인증·배포 | 한 UI로 세 플랫폼을 다룬다 | 현재 Next.js 제품과 겹치며 브라우저 토큰·BFF 설계가 추가된다 |

## 3. 기술 기반과 폴더

공식 SDK 58 호환 조합과 npm 메타데이터를 확인했다. 기본 pin은 Expo `58.0.16`, React `19.3.0`, React Native `0.88.0`, TypeScript `6.0.3`이다. Expo 58.0.16의 게시 시각은 `2026-10-19T14:28:59.230Z`로 확인했다. Router·보안 저장소·픽커·네이티브 화면 라이브러리의 정확한 patch pin은 해당 Expo 패키지의 호환 목록과 게시 시각을 함께 확인해 잠금 파일에 고정한다. 기존 웹·API의 pin을 바꾸지 않는다.

- Expo Router: 파일 기반 라우팅과 보호된 화면 그룹.
- React Native 기본 컴포넌트·StyleSheet: 웹 DOM·Next.js·Base UI 의존성을 가져오지 않는다.
- OpenAPI에서 생성한 타입과 JSON:API 클라이언트: 현재 세션·글·파일 계약 사용.
- TanStack Query: 원격 데이터·무효화·페이지네이션. 세션 비밀은 query cache에 넣지 않는다.
- Zod, React Hook Form: 입력·환경 검증과 서버 필드 오류 연결.
- expo-secure-store: refresh 세션의 보안 저장. access token은 메모리에 보관한다.
- expo-localization과 React용 i18n: ko/en 카탈로그·서버 언어 헤더 일치.
- Jest 30·jest-expo·React Native Testing Library 14 이상: SDK 58 공식 테스트 조합. 순수 실행기 시험은 기존 Node/Vitest 패턴을 유지한다.

```text
templates/expo/
  src/app/                 # 얇은 Router 화면·레이아웃
  src/features/auth/       # 인증 화면·폼·메일 링크
  src/features/posts/      # 골든: query·mutation·화면·테스트
  src/features/account/    # 내 정보·세션·아바타
  src/lib/api/             # 생성 타입·JSON:API·오류
  src/lib/session/         # 저장소·갱신·로그아웃 경합
  src/lib/realtime/        # 티켓·연결·앱 상태
  src/lib/upload/          # 픽커·presigned PUT·완료 확인
  src/lib/i18n/            # 카탈로그·언어
  scripts/                 # setup/dev/check/gen/생성기
  contract/                # 단독 프로젝트의 계약·목 사본
  e2e/                     # 네이티브 사용자 흐름
  docs/recipes/            # 기능 추가·주소·링크·빌드 절차
```

각 기능은 공개 진입점만 제공한다. 소스 400줄·테스트 600줄 한도와 기존 모듈 경계 규칙을 적용한다. 생성 타입과 계약은 원본 TypeSpec·생성기로만 갱신한다. `shared/nextjs/` 전체를 모바일에 복사하지 않는다.

## 4. 인증과 보안 경계

모바일은 BFF 없이 API를 직접 호출한다. 기존 `POST /sessions`가 password·refreshToken·oauthCode grant와 토큰을 이미 제공하므로 별도 인증 서버를 만들지 않는다. 외부 제공자의 client secret은 기존 백엔드에 남긴다.

- 보안 저장소에 refresh token·세션 식별자·만료 정보의 단일 레코드를 쓴다. access token·비밀번호를 일반 저장소나 로그에 남기지 않는다.
- 앱 재시작은 보안 레코드 복원과 갱신으로 인증 상태를 확정한다. 네트워크 실패와 서버의 무효한 세션 응답을 구분한다.
- 동시 401은 같은 세션 세대의 갱신 한 번을 공유한다. 재시도는 한 번으로 제한한다. 이미 갱신된 access token으로 실패한 요청은 현재 토큰으로 재시도한다.
- 로그인 전환·로그아웃은 세대를 바꾸고 이전 요청과 갱신을 무효화한다. 늦은 결과가 세션을 복원하거나 다른 사용자의 cache에 쓰지 못해야 한다.
- refresh 회전 후 보안 저장 실패는 이전 refresh token 재사용으로 복구하지 않는다. 인증 상태를 정리하고 다시 로그인하게 한다.
- 앱의 보호 화면은 UX 경계다. 권한 검사는 기존 API가 수행한다.
- 네이티브 클라이언트가 Forwarded·X-Forwarded-For·X-Real-IP를 만들어 보내지 않는다. 앞선 BFF ingress 신뢰 설정을 모바일로 옮기지 않는다.

주요 회귀: 동시 갱신, 갱신 도중 로그아웃·계정 변경, 저장 실패, 중단·오프라인, 토큰 재사용, 보호 화면 진입, 사용자별 cache 격리.

## 5. OAuth와 메일 링크

개발과 제품의 인증 경로는 development build를 기준으로 한다. Expo Go에서 네이티브 OAuth 복귀가 검증됐다고 주장하지 않는다.

- OAuth는 기존 API authorize → 시스템 브라우저 → 앱 콜백 → 기존 oauthCode+codeVerifier 교환을 사용한다.
- 앱 복귀 주소·PKCE verifier·만료한 진행 상태를 검증한다. 취소·오류·중복 콜백·cold start를 처리한다.
- 설계 기준 main의 NestJS `OAUTH_REDIRECT_URIS`는 HTTP(S)만 받았다. 구현에서는 두 API와 목에 동일한 콜백 정책을 적용하고, 명시적으로 설정한 앱 scheme의 정확한 주소만 추가로 허용한다. 기존 웹 주소와 정확한 문자열 allowlist를 유지하며 wildcard·임의 returnTo를 허용하지 않는다.
- 앱 scheme·bundle identifier·Android applicationId는 생성 이름에서 유효한 값으로 만들고 레시피에서 변경 지점을 설명한다. OAuth 콜백 설정도 함께 맞춘다.
- 운영 메일은 기존 HTTPS 링크와 iOS Universal Links·Android App Links를 연결한다. 도메인 연동 파일·설정 예시를 제공한다. 개발·CI는 실제 목 메일의 토큰을 검증한 뒤 앱 링크로 여는 전용 하네스를 사용한다.
- 앱 링크는 허용한 경로와 매개변수만 해석한다. URL에 있는 사용자·권한 값을 인증 사실로 사용하지 않는다.

메일 URL·인증 코드·verifier·토큰을 로그나 스크린샷 검증 결과에 출력하지 않는다. 외부 제공자 계정의 실로그인과 스토어 도메인 소유 검증은 저장소 CI의 목 제공자 시험과 구분한다.

## 6. 데이터·업로드·실시간

- posts는 계약의 필드·정렬·필터·페이지·관계와 오류 포인터를 사용한다. 실제 목록→상세→작성/편집→상태 변경→삭제를 골든으로 삼는다.
- mutation 완료와 실시간 이벤트는 해당 query를 무효화한다. UI는 API의 권한·충돌·검증 응답을 일관되게 표시한다.
- 파일 선택 취소와 권한 거절을 구분한다. 기존 pending 파일 생성 → presigned PUT → 서버 완료 확인 흐름을 사용하고 크기·MIME 실패를 표시한다.
- API와 스토리지 URL은 실제 기기에서 접근 가능해야 한다. presigned URL의 host를 클라이언트가 바꾸지 않는다.
- 세션에서 실시간 티켓을 받아 연결한다. 로그아웃 시 연결·대기 요청을 끝낸다. background에서 상시 연결을 보장하지 않으며 foreground 복귀 시 새 티켓·목록 재조회로 상태를 맞춘다.
- 네트워크 실패 후 입력 보존·재시도를 검사한다. 로딩 문구는 표시하지 않고 스피너·스켈레톤만 사용한다.

## 7. 독립 실행과 AI 하네스

`template.json`은 name `expo`, kind `frontend`, runner `pnpm`, goldenModule `src/features/posts`로 선언한다. 기존 manifest 종류를 불필요하게 늘리지 않는다.

- `setup`, `dev`, `check`, `fix`, `test`, `test:e2e`, `gen`, `gen:feature`를 제공한다.
- `check`는 포맷·린트·strict 타입·단위/컴포넌트·생성물·로케일·설정·하네스를 검사한다. native 빌드·E2E와 구분한다.
- 단독 `dev`는 목 API와 Metro를 함께 소유하고 종료 시 자신의 프로세스를 정리한다. 백엔드 모드는 준비된 API를 사용한다.
- `setup`은 고정 의존성·공개 기본 환경을 준비한다. 플랫폼 빌드 도구의 필요 조건과 Mac/Windows에서 가능한 명령을 명확히 안내한다.
- AGENTS/CLAUDE 짝, exec-form 네 hook, 생성물 편집 차단, 비밀 스캔, feature 생성기와 레시피를 제공한다.
- 예시 기본 포트는 Metro 8081·목 4012, 네이티브 E2E는 Metro 8082·목 4112다. 실행기는 먼저 포트·자원 소유권을 검사한다.
- emulator의 localhost·실기기의 LAN 주소·운영 HTTPS를 구분한다. 공개 Expo 환경 변수에 비밀을 넣지 않으며 release 설정은 HTTPS를 요구한다.

## 8. CLI와 조합

```text
pnpm new <대상> --template expo
pnpm new <대상> --api fastapi --mobile
pnpm new <대상> --api nestjs --web --admin --mobile
```

- 모든 파일은 커밋된 추적 입력을 사용한다. 저장소 밖 생성·이름·중단·실행 권한·원자적 실패 규칙은 유지한다.
- 조합은 선택한 앱만 만들고 `apps/mobile`을 포함한다. `mobile`도 조합 workspace의 예약 이름으로 추가한다.
- 계약의 원본은 조합 루트 `contract/` 하나다. 모바일 gen은 선택 API의 OpenAPI를 사용하고 사본 원본을 별도로 편집하게 만들지 않는다.
- 모바일은 자체 pnpm 잠금·workspace 경계를 유지하는 안을 사용한다. 루트의 의존성 없는 `tools/mobile` proxy가 mobile filter·Turbo 명령을 전달한다. Next.js의 잠금 해석이나 native 모듈의 숨은 hoist에 의존하지 않는다.
- 단독용 contract importer를 조합에서 분리할 때 모바일 앱의 pin·도구 해석·동일 의존성 resolution을 보존하고 frozen 설치로 확인한다. 루트 계약의 의존성을 모바일 설치가 다시 소유하지 않는다.
- React Native 네이티브 앱을 웹 Docker 이미지처럼 취급하지 않는다. 기존 web/admin/API 이미지와 CI는 보존하고 모바일에는 native 빌드·설치·E2E를 적용한다.
- web/admin/mobile의 선택 조합, FastAPI/NestJS, 잘못된 옵션·이름·lock·생성 도중 실패를 검사한다.

## 9. 검증과 완료 기준

1. Expo 전체 `check`와 root `pnpm check` 통과. 기존 네 템플릿·CLI 검증을 약화하지 않는다.
2. Jest·실제 HTTP 회귀로 세션 보안·업무 호출·JSON:API·권한·로케일·업로드·실시간·Router 경계를 검사한다.
3. Android development build와 emulator에서 목을 사용하는 전체 사용자 흐름을 검증한다. Windows의 네이티브 UI 확인은 Orca Android 에뮬레이터 도구를 사용한다.
4. CI에서 iOS simulator build·목 사용자 흐름을 검증한다. Windows 결과를 iOS 실행 증거로 쓰지 않는다.
5. FastAPI·NestJS에 연결한 Android E2E와 조합 생성·frozen 설치·gen·검사·native build를 PR CI에서 확인한다. 로컬 Docker와 기존 개발 스택은 사용하지 않는다.
6. 생성 프로젝트 smoke는 저장소 밖의 소유한 `aitpl-` 폴더만 쓰고 끝나면 정리한다.
7. 독립 검토, 정상 hook 커밋·푸시, 담당자가 있는 PR과 정확한 HEAD의 모든 필수 CI가 완료 기준이다.

## 10. 구현 순서와 검토 경계

설계 승인 후 별도 구현 계획을 작성한다. 계획의 의미 있는 검증 단위는 다음 순서다.

1. 독립 Expo 하네스·계약 생성·기본 라우팅·목 연결.
2. 보안 세션·인증·앱 링크와 필요한 백엔드 콜백 정책 회귀.
3. posts 골든·내 정보·업로드·실시간·ko/en·feature 생성기.
4. CLI 단독/조합과 모바일 잠금 경계·선택 앱별 실행기.
5. Android/iOS 네이티브 검증·실제 백엔드 E2E·생성 CI·문서·최종 검토.

B의 iOS/Android·전체 업무 예제·`--mobile` 조합 포함 범위가 승인되었다. 외부 계정 개설이나 EAS 프로젝트·스토어 출시는 이 설계 승인에 포함되지 않는다.

## 근거

- [저장소 하네스 표준](../../harness/standard.md), [생성 CLI 설계](2026-10-03-create-cli-design.md), [현재 BFF 주소 설계](2026-10-21-bff-client-address-design.md).
- [Expo SDK 58 발표](https://expo.dev/changelog/sdk-58), [SDK 호환표](https://docs.expo.dev/versions/v58.0.0/), [공식 기본 템플릿 metadata](https://registry.npmjs.org/expo-template-default/latest).
- [Expo 인증·development build](https://docs.expo.dev/guides/authentication/), [Router 인증](https://docs.expo.dev/router/advanced/authentication/), [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).
- [Jest·SDK 58 테스트 조합](https://docs.expo.dev/develop/unit-testing/), [pnpm·모노레포 격리](https://docs.expo.dev/guides/monorepos/).
