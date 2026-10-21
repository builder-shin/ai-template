# Expo mobile

iOS·Android 네이티브 앱이다. 설계와 설치된 라이브러리 문서는 [docs/stack.md](docs/stack.md)를 따른다.

| 명령                                             | 목적                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `pnpm setup`                                     | 고정 의존성 설치; 독립 Git 루트에서만 hook 설치              |
| `pnpm dev`                                       | Metro 8081과 단독 목 4012; backend 모드는 목을 띄우지 않는다 |
| `pnpm check`                                     | 포맷·린트·strict 타입·JS/컴포넌트·실행기·생성물·하네스       |
| `pnpm fix`                                       | 포맷·자동 수정 가능한 린트                                   |
| `pnpm test --runInBand`                          | Jest 네이티브 컴포넌트와 로직                                |
| `pnpm test:node`                                 | OS 실행기·생성기 시험                                        |
| `pnpm export --platform android`                 | Metro 번들; 네이티브 빌드와 다르다                           |
| `pnpm build --platform android`                  | 소유한 임시 사본에서 네이티브 컴파일                         |
| `pnpm test:e2e --platform android --device <id>` | 개발 빌드의 실제 네이티브 UI                                 |
| `pnpm gen`                                       | 선택 OpenAPI에서 클라이언트 타입·에러·실시간 선언 생성       |
| `pnpm gen:feature <name>`                        | posts 골든 기반 기능 초안                                    |

- `src/app`은 라우팅만, `src/features/*`는 공개 `index.ts`만 외부에 노출한다. 공통 코드는 `src/lib`·`src/components`에 둔다.
- API는 생성 타입과 JSON:API를 사용한다. BFF·Next.js 서버 API·DOM 코드를 가져오지 않는다.
- access token은 메모리만, refresh 세션은 SecureStore 단일 레코드만 사용한다. 토큰·메일 링크·verifier·비밀번호를 로그나 query cache에 넣지 않는다.
- 세션 세대가 바뀌면 이전 요청·cache·실시간 연결을 무효화한다. 늦은 응답은 새 사용자의 상태를 바꾸면 안 된다.
- `.env`·`.env.local`을 읽거나 출력하지 않는다. 키와 기본값은 `.env.example`에 있다. `EXPO_PUBLIC_*`에는 비밀을 넣지 않는다.
- Android emulator는 호스트 `10.0.2.2`, iOS simulator는 `localhost`, 실제 기기는 명시한 LAN 주소를 쓴다. release는 HTTPS만 허용한다. presigned URL을 고치지 않는다.
- 로딩은 ActivityIndicator·스켈레톤만 사용한다. ko/en 키·접근성 레이블·시스템 테마를 유지한다.
- `contract/openapi.yaml`·`**/generated/**`를 직접 고치지 않는다. 계약은 TypeSpec 원본과 생성 명령으로 바꾼다. 조합에서는 루트 계약 하나를 쓴다.
- 소스 400줄·테스트 600줄, 사유 없는 타입·린트 억제 금지. 완료 전에 `pnpm check`를 통과한다.
- Android/iOS·EAS·스토어의 자격 증명을 코드에 넣지 않는다. Expo Go를 OAuth 검증 증거로 쓰지 않는다.
- `android/`·`ios/`·설치물·캐시·실행 산출물은 추적하지 않는다. 실행기는 포트·기기·자원 소유권을 먼저 확인한다.
- 새 기능은 [기능 추가](docs/recipes/add-feature.md), 개발은 [개발 환경](docs/recipes/development.md)을 따른다.
- 커밋·PR에 AI 표시를 넣지 않으며 PR은 담당자를 지정한다. 검사를 건너뛰거나 강제 푸시하지 않는다.
