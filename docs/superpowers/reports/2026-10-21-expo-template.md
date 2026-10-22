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
- OAuth의 난수 생성·verifier 저장·브라우저 응답·일회 소비 도중 취소나 세션 복원이 발생하면 이전 로그인을 중단한다. 각 await 경계를 제어하는 실패 회귀를 확인한 뒤 수정했으며, 로그인 세션 복원 중에는 스피너만 표시한다.
- Android IME의 자동 대문자·자동 수정이 글 입력을 바꾸지 않도록 글 필드에서 두 옵션을 끈다. 실제 기기에서 입력한 제목·본문을 API 응답과 정확히 비교한다. 편집 시험은 커서 위치에 의존하는 Backspace 대신 전체 선택 후 지운다.
- 개발 클라이언트의 콜드 시작은 Metro 정보를 포함한 최초 URI 하나로 연다. MAIN 시작 직후 별도 VIEW intent를 보내는 경합을 제거했으며, SDK가 개발 전용 메타데이터를 제거한 뒤 원래 앱 경로를 전달한다. 복원 중인 백그라운드 로그인 화면이 경로를 바꾼다는 초기 가설은 Router 시험에서 재현되지 않아 별도 라우팅 구현을 추가하지 않았다.
- Windows 네이티브 C++ 경로를 위해 소유한 짧은 드라이브 루트 사본과 그 사본만의 hoisted 설치·CMake object 경로 설정을 쓴다. 원본 SDK·의존성·workspace 정책을 바꾸지 않는다.
- Maestro 2.11.0의 Windows 파일 잠금 실패는 실제 Java 호출로 재현했다. 공개 ABI를 유지하는 실행별 Java 어댑터와 UTF-8 read/write/delete 자체 시험을 둔다. 원래 배포 ZIP과 사용자 상태·자격 증명 저장소를 건드리지 않는다.
- 새 Android 이미지의 Chrome 최초 실행은 계정 없이 진행한다. OAuth는 실제 제공자와 API state/PKCE를 사용하며, 별도 콜드 시험은 제공자 응답을 대기시킨 뒤 앱을 종료하고 실제 결과 링크로 다시 시작한다.
- API 내부 주소와 기기 공개 주소가 다른 하네스 토폴로지를 검사한다. OAuth callback confinement는 명시한 공개 API Origin을 기준으로 한다. Android WebSocket Origin은 생성 조합의 공개 개발 기본값에 정확히 추가하며 기존 web/admin 허용값을 보존한다.

## 검증 증거와 한계

Expo의 전체 `pnpm check` 7단계는 포맷·린트·타입·Jest·Node 실행기·생성물·하네스를 포함한다. 루트 `pnpm check`는 별도 11단계이며 Expo 설치 없이 구조·사본과 루트 도구를 검사한다. Metro export는 네이티브 컴파일이나 기기 UI의 대체 증거가 아니다.

Windows에서 Java 21·Android SDK 37.0/Build Tools 37.0.0·NDK 27.1.12297006·CMake 3.22.1을 사용했다. 개발 APK와 cleartext를 금지한 release APK의 실제 컴파일 기록은 실행별 `templates/expo/artifacts/native/`에 보관한다. release에는 명시한 HTTPS 예제 주소만 넣으며 그 API에 접속하지 않는다. 원래 기기·개발 스택은 사용하지 않고 작업용 API 36 Google APIs 에뮬레이터를 쓴다.

Android 실제 UI 결과는 `auth`, `oauth`, `posts`, `account`, `uploads`, `realtime`, `locale`의 개별 성공과 최종 전체 성공으로 판정한다. 선택한 PNG는 실제 저장소에서 내려받아 fixture 바이트와 비교한다. 전체 사진 접근 권한을 미리 요청하지 않는 이미지 전용 picker를 쓰므로 시스템 picker 취소와 앱의 권한 오류 처리를 구분한다. 권한 오류는 네이티브 어댑터 시험으로 확인하며 불필요한 전체 라이브러리 권한을 추가하지 않는다.

스토리지에는 별도 공개 주소 4116을 사용한다. 목은 선택적인 `MOCK_STORAGE_URL`이 없으면 기존 `API_URL` 기본값을 유지한다. 전용 backend는 S3 공개 주소 4116과 실제 upstream 28435를 구분한다. 소유한 proxy는 서명된 Host·경로·쿼리·본문을 그대로 전달한다. 실제 기기 시험은 이 스토리지 listener만 닫아 API 200과 네이티브 실패 안내·아바타 미연결·API PUT 우회 없음·동일 주소 복구 뒤 정확한 PNG 바이트를 검증한다.

iOS 실제 UI·unsigned release와 실제 FastAPI/NestJS 저장소·메일·제공자 시험은 PR CI에서 실행한다. Windows의 목 시험을 이 증거로 대신하지 않는다. 외부 제공자의 실제 계정 로그인, 운영 App Links/Universal Links 도메인 소유 검증, 스토어 서명·배포는 제품 배포 단계의 별도 설정이다.

## 독립 검토와 회귀

리뷰 수정 뒤 Windows의 루트 전체 검사 **11단계(263.8초)**와 Expo 전체 검사 **7단계**가 통과했다. Android `win-ui-a25`는 기본 7개 흐름을 모두 연속 성공했으며, 중간의 스토리지 중단·실패·복구도 포함한다. 별도 `win-focus-storage-a1`도 같은 실패·복구를 실제 기기에서 성공했다. 개발 APK `win-native-debug-a7`은 네이티브 바이너리를 재사용하고 Metro에서 검증 대상 소스를 제공했다. `win-release-a3`은 실제 release 컴파일과 cleartext 금지를 확인한 이전 체크포인트이므로 최종 소스의 release 빌드는 해당 PR CI에서 다시 판정한다.

기준 main부터 `a5511cbcc138e3c672958d72e6854cf0526143c8`까지 새 리뷰어 한 명이 전체 브랜치를 읽기 전용으로 검토했다. Critical 0개·Important 4개·Minor 0개이며, 기존 17개 설계 판단을 수용했다. 다음 네 항목을 구현자가 실패 재현 뒤 수정했으며 재리뷰를 성공 증거로 대신하지 않는다.

| 지적 | 수정·검증 |
| --- | --- |
| 갱신 실패가 dirty 화면을 unmount | 인증된 Stack을 유지하는 오류 배너와 같은 세대의 refresh 재시도. 실제 HTTP Router에서 프로필·새 글·기존 글의 입력을 실패·재인증·데이터 재조회 뒤 보존하는 RED→GREEN, 관련 12개 시험 |
| 생성 조합의 mobile E2E 연결 누락 | 명시한 플랫폼·기기·backend 인자와 proxy/upstream/provider 설정 전달. 웹 전용 서버 대신 준비된 native backend로 실행하며 생성 문서에 전제 명시. 실제 생성 호출 체인과 네이티브 옵션·환경 검증기의 RED→GREEN |
| 기존 이미지 태그 소유권 누락 | 생성 전과 기동 전 같은 자원 inventory 사용. 기존 태그와 조회 실패의 RED→GREEN에서 up/down/image removal을 모두 금지 |
| 기기의 스토리지 주소 실패 시험 누락 | 실제 API가 별도 서명 주소를 발급하고 API 연결을 유지한 채 스토리지 listener만 중단. Node HTTP와 Android 기기에서 실패·미연결·우회 없음·복구 후 실제 바이트 검증 |

생성 aggregate의 모바일 단계는 준비된 전용 native backend와 기기를 요구한다. 기기 없는 CI aggregate의 명시적인 모바일 제외는 성공으로 계산하지 않으며 별도 native 작업과 실제 backend 조합 작업을 유지한다.

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

CI에서 확인한 실행 경로도 회귀 시험으로 고정했다. SDK 도구는 설치 경로로 실행하고, 생성 smoke와 iOS 실행기는 실제 pnpm lifecycle로 호출한다. iOS simulator는 SDK가 호환성을 확인한 모델만 채택하며 생성한 UUID만 정리한다. 생성 조합의 세 실행 스크립트도 고정 formatter로 정리한다. 관련 create 전체 시험은 357개와 Node 82개가 통과했다(각 1개 환경 조건 skip).

Navikt 6.0.3에는 거절 전용 form이 없으므로 기존 web 하네스처럼 현재 state와 `access_denied`를 정확한 API callback으로 전달한다. 실제 API가 native 교환 코드 없이 거절하는 회귀를 포함하며 승인 로그인은 제공자 form·token 교환을 사용한다. 생성된 모바일 예제의 추가 origin 때문에 깨진 FastAPI 정규화 시험은 명시한 입력으로 분리해 27개를 통과했고, 반복 회원가입 응답 시험은 실제 응답 필드 반영을 기다리도록 고쳤다.

빈 Android 사진함의 CI 회귀도 별도로 재현했다. PNG의 IDAT 체크섬을 바로잡고, Android에서는 SDK로 전송을 닫은 뒤 정확한 상대 경로·바이트 크기의 MediaStore 등록을 확인한다. 새 nonce 폴더를 원자적으로 확보하고 해당 행·파일·빈 폴더만 정리한다. 새 기기의 `win-media-uploads-a3`는 사진 선택·스토리지 중단·실패 안내·연결 복구·실제 68바이트 전송과 정리를 통과했다. 고정 Maestro Android 스트림과 iOS 미디어 경로를 구분하며, 각 PNG chunk의 체크섬 회귀를 추가했다.

iOS 초기 화면에서 발생한 네이티브 오류는 AppState의 Android 전용 `focus`·`blur` 구독이 원인이었다. 고정 SDK의 iOS `RCTAppState`는 해당 이벤트를 지원하지 않는다. 실제 어댑터에 플랫폼 조건을 적용했고, iOS의 지원 이벤트·초기 상태·구독 정리와 Android의 포커스·백그라운드 처리를 재현하는 RED→GREEN을 추가했다. 관련 실시간 시험 17개가 통과했으며, iOS 전체 UI 7개와 unsigned release의 최종 통과는 PR CI에서 판정한다.

그다음 실제 iOS 실행은 시작·회원가입을 통과했고 cold 이메일 인증 링크에서 SecureStore 오류를 보였다. OSStatus는 기록되지 않아 특정 오류 번호로 단정하지 않았다. Debug에도 적용하던 서명 금지를 없애고 Simulator 전용 ad-hoc 서명으로 바꿨다. 빌드 산출물과 재사용 앱의 실제 서명·bundle ID를 검사하며, unsigned 기기용 Release와 ATS 검사는 유지한다. Windows의 가짜 SDK 명령을 사용한 실제 빌드 실행기 시험은 기존 unsigned 산출물을 RED로 재현하고 서명·불일치 거절·소유 사본 정리를 검증한다. 실제 Keychain과 전체 iOS 흐름의 판정은 최신 PR CI가 담당한다.

서명 수정 뒤 실제 Xcode Debug 빌드와 서명·식별자 검사는 통과했다. 다음 iOS 실행은 회원가입 제출 후 완료 문구를 기다리다 실패했고, 저장된 hierarchy에는 키보드 시작 위치(y=459)가 제출 버튼 중앙(y=467)을 가린 상태였다. 고정 Maestro의 iOS `hideKeyboard`는 짧은 드래그를 사용하지만 공통 ScrollView의 기본 `keyboardDismissMode`는 `none`이었다. 화면에 `on-drag`를 적용해 사용자의 스크롤과 기존 네이티브 시험의 드래그가 키보드를 닫도록 했다. UI assertion·timeout·인증 흐름은 그대로 유지하며, cold 링크와 실제 SecureStore 복구 성공 여부도 후속 전체 iOS CI에서 확인한다.

그 뒤 CI는 19개 성공·2개 실패였다. iOS는 초기 링크 처리 직후 확인창이 없다고 판정했지만, 실패 시점의 실제 화면에는 Open/Cancel 시스템 확인창이 있었다. 초기 하네스에 확인창 또는 앱 준비 화면을 기다리는 30초 단계와 앱 화면을 기다리는 90초 단계를 두어 기존 120초 시작 예산 안에서 비동기 확인창을 처리한다. NestJS 모바일은 auth·OAuth·posts를 통과한 뒤 account의 첫 명령 전에 중단됐고 표준 출력에는 원인이 남지 않았다. 소유한 Maestro 텍스트 로그의 오류 줄만 기존 민감 값 필터와 동일한 문맥으로 제한해 출력하며, 진단 필터 회귀 13개가 통과했다. 두 플랫폼의 실제 후속 흐름은 최신 전체 CI로 다시 판정한다.

후속 실행에서 NestJS 모바일은 전체 흐름을 통과했고 iOS 초기 확인창·앱 준비 대기도 통과했다. iOS 회원가입은 키보드 닫기와 제출을 거친 뒤 비밀번호 길이 오류를 보였다. Maestro의 원본 재현 기록에는 iOS 첫 `newPassword` 필드에서 문자가 덮어써지고 다른 필드로 포커스를 옮겼다가 돌아오면 회복되는 사례가 있다. 같은 입력 경로를 분리하기 위해 첫 포커스에 버릴 한 글자를 입력하고 Email로 이동한 뒤 돌아와 지운 다음 실제 fixture 비밀번호를 입력한다. 제품 자동완성·검증 규칙은 변경하지 않았다. 실패 시 기존 API 관찰 기록의 메서드·쿼리 없는 경로·상태만 최근 20개까지 출력해 등록 요청 여부도 확인한다. 실제 cold 링크·SecureStore와 iOS 전체 성공은 다음 CI로 판정한다.

다음 실제 iOS 실행은 회원가입 API 201과 완료 화면을 통과했지만 cold 인증 링크가 로그인으로 열렸다. SDK 58의 Router는 자체 런처 URL 해석 전에 `+native-intent`를 호출하고, iOS Linking은 원본 URL을 전달한다. 따라서 앱의 엄격한 파서는 테스트 링크의 런처 매개변수를 추가 쿼리로 거절했다. 개발 빌드에서만 자체 scheme·정확한 loopback Metro URL·두 안내 제어 값과 중복 여부를 확인한 뒤 이 세 매개변수만 분리하고 기존 경로 검증을 적용한다. 릴리스와 일반 링크 검증은 유지한다. 네 경로의 RED→GREEN, 관련 링크 40개, 실제 목 메일·PKCE와 설치된 SDK 해석을 함께 쓰는 fixture 시험 3개가 통과했다. 실제 iOS 전체 성공은 최신 CI에서 확인한다.

그 뒤 CI는 다른 20개 작업이 모두 성공했지만 iOS의 cold 인증 화면 버튼을 찾지 못했다. 저장된 화면은 이전 로그인 화면과 달리 앱 내용이 없는 26개 네이티브 노드뿐이었고, 앱 종료·링크 열기 뒤 OS 확인 처리만 마치면 바로 버튼을 찾고 있었다. 설치된 Router의 실제 초기 링크 설정에 native Linking URL을 넣고 실제 인증 화면까지 렌더링하는 시험은 통과했다. 대기가 빠진 cold 링크에는 기존 OAuth 흐름과 같은 60초 제한의 대상 화면 준비 대기를 추가했다. 원래 인증·복원·프로필 assertion은 유지하고 링크를 다시 열지 않는다. 기존 OAuth·실시간의 명시적 대기 한도도 유지한다. 이 대기로 실제 iOS가 준비를 마치는지는 후속 전체 CI로 판정한다.

60초 대기 뒤에는 SDK 개발 런처의 프로젝트 로드·연결 실패 화면이 확인됐다. 추가 대기로 해결된 것으로 보지 않는다. 첫 실행에서 성공한 기존 `expo-development-client/?url=<Metro>` 명령을 cold 링크에도 사용하고 원래 목적지는 `aitpl_link`로 전달한다. 개발 전용 어댑터는 정확한 두 매개변수·자체 scheme·loopback Metro 주소를 확인한 뒤 기존 엄격한 앱 링크 검증을 적용한다. SDK의 원래 목적지 해석과 실제 인증 경로 렌더링, 실제 목 메일·PKCE 교환을 함께 검증했다. SDK의 알려진 로드 오류 문구도 소유한 iOS 인증 실패의 명시적인 fixture 제거 문맥에서만 3줄·600자로 진단하며, 관련 개인정보 제거 시험 14개가 통과했다. 실제 iOS 전체 통과는 새 CI로 판정한다.

관측된 iOS 실행은 Debug 컴파일에 약 42분, 그 뒤 드라이버 준비와 첫 가입까지 약 14분이 걸렸다. 남은 UI 흐름과 별도 기기용 Release 컴파일도 수행할 수 있도록 저장소·단독 Expo·생성 조합의 iOS 작업 예산을 120분으로 맞췄다. 개별 UI 대기와 검증 조건은 유지한다.

다음 iOS 실행은 cold 링크 전에 가입 완료 assertion에서 중단됐다. API 관찰 기록에는 등록 201이 있었지만, 실패 화면의 입력칸과 제출 버튼은 비활성화된 pending 상태였다. 응답 헤더 도착과 UI 완료를 같은 시점으로 보지 않고, 가입·인증·재설정·프로필·언어·글 변경은 기존 60초 네트워크 준비 예산 안에서 실제 완료 상태를 기다린 뒤 원래 assertion과 서버 검증을 수행한다. 수정 저장은 편집 폼을 떠난 뒤 서버를 확인해 이전 데이터 검사 경합도 막는다. 최근 20개 공개 API 진단에는 실제 헤더 관측 시각을 더했다. 지연된 가입 완료 전에는 성공 문구가 없고 중복 제출을 막으며 완료 후 비밀번호를 비우는 회귀를 포함해 관련 폼 시험 6개가 통과했다. 이 실행은 cold 링크에 도달하지 못했으므로 새 런처 방식의 실제 iOS 판정은 다음 CI가 담당한다.

그 뒤 실제 iOS는 가입·cold 메일 인증과 API 인증 201을 통과했고 내 정보·세션 조회 200도 확인됐다. 로그인 후 `Not Now`·`Save` 시스템 확인창이 세션 화면을 덮어 기존 대기가 실패했다. 소유한 iOS fixture 로그인에서 세션 또는 확인창이 나타나는지 기다린 뒤 두 버튼이 모두 있는 경우에만 `Not Now`로 저장을 거절한다. 제품 자동완성 힌트와 원래 세션 assertion은 유지한다. cold 세션 복원·OAuth·나머지 실제 UI 흐름과 unsigned Release의 전체 성공은 후속 CI로 판정한다.

이 확인창 처리는 실제 iOS에서 통과했고 기존 Current session 검증도 성공했다. 다음 빈 `scheme://` 홈 이동 명령은 앱을 세션 화면에 그대로 남겼다. 설치된 Router에 홈 이벤트를 직접 전달하면 이동하므로, 시험의 홈 명령도 이미 cold 실행에서 검증한 fixture 런처 전송으로 통일하고 기존 Account 버튼 도착 검증 전에 같은 60초 준비 예산을 적용했다. 설치된 SDK의 실제 live 구독을 거쳐 세션에서 홈으로 이동하는 회귀 시험을 추가했다. 제품 링크·엄격한 파서는 변경하지 않았으며 전체 iOS·Release·정리 성공은 최신 CI에서 판정한다.

이후 실제 iOS 인증 흐름은 가입·cold 메일 인증·비밀번호 로그인·홈 이동·cold SecureStore 세션 복원·비밀번호 재설정·재로그인을 모두 통과했다. 다음 OAuth 준비 단계의 로그아웃 탭은 API 호출이나 UI 전환이 없어 같은 커밋에서 재실행했고, 재실행은 OAuth 전체와 글 작성·발행·수정·삭제까지 통과했다. 다음 프로필 편집은 OS의 Select All 메뉴를 찾지 못해 실패했다. 짧은 fixture 이름의 입력칸 오른쪽을 탭한 뒤 최대 100자를 지우도록 바꾸고 정확한 서버 값 검증을 유지한다. 목록 요청의 400 응답도 반복 관측되어, 다음 실제 실행에서 원인을 좁히도록 GET posts 400에만 최대 16 KiB의 허용된 오류 코드·정적 매개변수 이름 분류를 추가했다. 본문·쿼리 값·헤더·자격 증명은 진단에 노출하지 않으며 응답 바이트와 원래 UI 검증은 유지한다. 목록·실시간 흐름과 전체 iOS·unsigned Release·정리 성공은 최신 CI로 판정한다.

다음 iOS 실행은 프로필 전에 회원가입의 Password 탭에서 Maestro가 종료되어 같은 커밋의 iOS만 재실행했다. 재실행은 인증 흐름을 통과한 뒤 OAuth 준비의 로그아웃 탭 무반응을 다시 보였고, 새 진단은 목록 오류를 `jsonapi.unsupported_include`의 include로 좁혔다. OAuth 준비는 무반응일 때만 재탭하는 공식 옵션과 로그인 화면 도착 검증을 사용한다. 기본 쿼리 직렬화가 대괄호 이름은 원문, 값은 인코딩해 전달하는 상태를 RED로 재현했다. 네이티브 URL 경계의 혼합 인코딩 가설을 검증하기 위해 기존 배열·객체 직렬화 뒤 이름·값 전체를 URLSearchParams로 정규화했고, 쉼표·더하기·퍼센트·한글 값과 실제 HTTP 연동 시험 8개가 통과했다. 진단에는 원문 값 대신 고정된 include 인코딩 형태 분류만 더했으며, 응답 보존·개인정보 경계 시험 16개가 통과했다. 실제 iOS 오류 해결과 전체 UI·Release·정리는 최신 CI에서 확인한다.
