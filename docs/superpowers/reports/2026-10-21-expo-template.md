# Expo 구현·검증 기록

승인된 [설계](../specs/2026-10-21-expo-template-design.md)와 [구현 계획](../plans/2026-10-21-expo-template.md)의 범위다. 기준 main은 `a6f1c9918b559b3ff12abdb0b3911e1dffec97eb`다. 기존 네 템플릿 후속 개선의 검증과 Expo 추가의 검증을 구분한다.

## 구현 대응표

| 범위 | 구현·시험 |
| --- | --- |
| 독립 iOS·Android 앱·공개 환경 설정 | `templates/expo`, app identity/config·unknown public key·release HTTPS 검사, SDK 검사 |
| JSON:API 직접 호출 | 생성 타입, base origin/path 제한, 전달 헤더 제거, SDK `expo/fetch`의 명시적 credentials omit·redirect error |
| 보안 세션 | 메모리 access token, SecureStore 단일 refresh 레코드, 세대별 요청·cache 격리, single-flight refresh·콜드 복원·저장 실패·늦은 응답 경합 시험 |
| OAuth·메일 | PKCE verifier의 보안 보관·일회 소비, 정확한 private callback allowlist, 두 API·목의 동일 정책, 실제 메일을 검증하는 개발 링크 어댑터 |
| 인증·계정·ko/en | 네이티브 Router·RNTL·실제 HTTP 시험, 가입·메일 인증·재설정·프로필·세션 취소, 시스템 테마·스피너 |
| posts 골든·생성기 | 목록·상세·CRUD·게시/게시 취소·페이지·권한, AST 기반 기능 복사·등록·사전검사·실패 rollback |
| 이미지 | 네이티브 이미지 선택·취소, 파일 크기/종류·presigned URL 검증, 정확한 PUT·준비 확인·관계 연결·정리, 실제 목 저장 바이트 시험 |
| 실시간 | 일회용 ticket·WebSocket, AppState 복귀·수동 재연결·세대별 중단, 실제 목 Socket.IO·원격 세션 취소 시험 |
| 생성 CLI | `--template expo`, 두 API의 `--mobile`, 하나의 루트 계약과 독립 모바일 lock/workspace·의존성 없는 proxy, 원래 web/admin 의존성 해석 보존 |
| 네이티브 하네스 | 소유한 CNG 사본·기기 앱·reverse·프로세스 정리, 고정 Maestro ZIP 검증, 실제 UI 7개 흐름, 전용 생성 백엔드 스택 |

Task 1–8은 각각 전체 검사와 커밋 뒤의 실제 생성 검증을 기록했다. 단독 Expo, FastAPI+mobile, NestJS+web+admin+mobile을 저장소 밖에서 생성해 frozen 설치·gen·Expo 전체 검사·양 플랫폼 Metro export를 확인하고 소유한 생성 폴더를 정리했다. NestJS API는 원래 독립 설치 경계를 유지한다.

## Windows에서 발견한 네이티브 차이

- React Native 0.88의 실제 `whatwg-fetch` Request는 `cache: no-store`를 GET의 `_=` 쿼리로 바꾼다. 엄격한 JSON:API가 이를 400으로 거절하는 실제 HTTP 회귀를 먼저 확인하고, Cache-Control 헤더로 바꿨다. 같은 네이티브 Request의 redirect 설정 손실은 `expo/fetch`에 정책을 별도 인자로 전달해 막는다. 실제 307 서버를 사용한 세션 본문 유출 방지 시험을 둔다.
- 인증된 콜드 시작이 `/login`에 도착하면 안전한 보호 경로로 이동한다. 실제 SessionManager 복원과 Router로 재현한 회귀 시험을 둔다.
- SDK의 개발 manifest host가 private OAuth callback에 들어가지 않도록 `makeRedirectUri`에 네이티브 URI를 명시한다. 실제 SDK helper를 쓰는 회귀 시험에서 실패를 재현한 뒤 수정했다.
- Windows 네이티브 C++ 경로를 위해 소유한 짧은 드라이브 루트 사본과 그 사본만의 hoisted 설치·CMake object 경로 설정을 쓴다. 원본 SDK·의존성·workspace 정책을 바꾸지 않는다.
- Maestro 2.11.0의 Windows 파일 잠금 실패는 실제 Java 호출로 재현했다. 공개 ABI를 유지하는 실행별 Java 어댑터와 UTF-8 read/write/delete 자체 시험을 둔다. 원래 배포 ZIP과 사용자 상태·자격 증명 저장소를 건드리지 않는다.
- 새 Android 이미지의 Chrome 최초 실행은 계정 없이 진행한다. OAuth는 실제 제공자와 API state/PKCE를 사용하며, 별도 콜드 시험은 제공자 응답을 대기시킨 뒤 앱을 종료하고 실제 결과 링크로 다시 시작한다.
- API 내부 주소와 기기 공개 주소가 다른 하네스 토폴로지를 검사한다. OAuth callback confinement는 명시한 공개 API Origin을 기준으로 한다. Android WebSocket Origin은 생성 조합의 공개 개발 기본값에 정확히 추가하며 기존 web/admin 허용값을 보존한다.

## 검증 증거와 한계

Expo의 전체 `pnpm check` 7단계는 포맷·린트·타입·Jest·Node 실행기·생성물·하네스를 포함한다. 루트 `pnpm check`는 별도 11단계이며 Expo 설치 없이 구조·사본과 루트 도구를 검사한다. Metro export는 네이티브 컴파일이나 기기 UI의 대체 증거가 아니다.

Windows에서 Java 21·Android SDK 37.0/Build Tools 37.0.0·NDK 27.1.12297006·CMake 3.22.1을 사용했다. 개발 APK와 cleartext를 금지한 release APK의 실제 컴파일 기록은 실행별 `templates/expo/artifacts/native/`에 보관한다. release에는 명시한 HTTPS 예제 주소만 넣으며 그 API에 접속하지 않는다. 원래 기기·개발 스택은 사용하지 않고 작업용 API 36 Google APIs 에뮬레이터를 쓴다.

Android 실제 UI 결과는 `auth`, `oauth`, `posts`, `account`, `uploads`, `realtime`, `locale`의 개별 성공과 최종 전체 성공으로 판정한다. 선택한 PNG는 실제 저장소에서 내려받아 fixture 바이트와 비교한다. 전체 사진 접근 권한을 미리 요청하지 않는 이미지 전용 picker를 쓰므로 시스템 picker 취소와 앱의 권한 오류 처리를 구분한다. 권한 오류는 네이티브 어댑터 시험으로 확인하며 불필요한 전체 라이브러리 권한을 추가하지 않는다.

iOS 실제 UI·unsigned release와 실제 FastAPI/NestJS 저장소·메일·제공자 시험은 PR CI에서 실행한다. Windows의 목 시험을 이 증거로 대신하지 않는다. 외부 제공자의 실제 계정 로그인, 운영 App Links/Universal Links 도메인 소유 검증, 스토어 서명·배포는 제품 배포 단계의 별도 설정이다.

## PR CI 판정

기존 15개 작업을 유지하고 다음 6개를 추가해 최종 커밋의 **21개 성공**을 요구한다. 결과의 기준은 PR Checks의 정확한 HEAD이며, 실패한 이전 실행은 성공으로 계산하지 않는다.

| 작업 | 책임 |
| --- | --- |
| `expo` | frozen 설치, 전체 check, SDK 호환성·doctor, Android/iOS Metro export |
| `expo-android` | mock 개발 APK·실제 UI 7개·release APK |
| `expo-ios` | 소유한 simulator의 mock UI 7개·unsigned iphoneos release |
| `expo-e2e-fastapi` | HEAD에서 생성한 mobile-only 조합, 전용 API·worker·스토리지·메일·제공자, Android UI 7개와 정리 |
| `expo-e2e-nestjs` | 같은 생성·네이티브 흐름과 NestJS 독립 설치·worker·정리 |
| `create-expo` | 실제 단독·FastAPI-mobile·NestJS-all 생성과 root/mobile/API frozen 경계·setup·check·gen·export |

네이티브 원시 trace·JSON·스크린샷은 인증 값을 포함할 수 있어 실행별 소유 폴더와 함께 지운다. 보관하는 진단은 URL·토큰·비밀번호를 제거한 텍스트뿐이다. 스택 정리에 실패하면 소유권 기록과 생성 폴더를 남기고 같은 ID의 `--down`으로 재시도한다. 개발 프로젝트 `fastapi`·`joon`·`nestjs`와 기존 reverse·기기 앱은 정리 대상으로 채택하지 않는다.
