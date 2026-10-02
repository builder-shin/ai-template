# E2E

- Playwright의 역할·접근 가능한 이름으로 요소를 찾는다. 테스트 id는 최소로 둔다.
- 기본 대상은 실제 목 서버다. 테스트 대상 어댑터에서 메일 등 부수 채널을 읽는다.
- webServer는 운영 빌드와 next start를 쓴다. 테스트용 포트는 개발 포트와 분리한다.
- 가입·메일 인증, 로그인·로그아웃, 비밀번호 재설정, returnTo를 두 언어에서 검사한다.
- 같은 Chromium E2E 20개가 mock·fastapi에서 이름·아바타, 프로필·헤더의 언어 전환, 내 글·커버·발행·취소·삭제, 비밀번호 변경, 소셜 로그인·거부, 탈퇴 재인증까지 검사한다. 대상별 skip·필터·흐름 분기는 넣지 않는다.
- 세션 폐기·비밀번호 변경은 두 컨텍스트의 실제 session.revoked를 확인하고 현재 세션은 유지되는지 본다. 공개 목록은 posts 구독 ack 뒤 변경하며 문서 이동 없이 반영되는지 본다.
- `targets`가 메일·재인증 창·가짜 제공자의 username/claims 폼을 처리한다. 일반 흐름에는 대상별 분기나 목 전용 URL을 넣지 않는다. FastAPI는 같은 인터페이스에 Mailpit·모의 OAuth 서버를 연결한다.
- 대상은 `E2E_TARGET`으로 고른다(기본 mock). mock만 목 4110을 검사·기동한다. fastapi는 미리 준비한 외부 API의 `/health/ready`를 기다린 뒤 web만 빌드·기동한다. Docker와 목은 실행하지 않는다.
- fastapi에는 `APP_URL=http://localhost:3100`, `API_BASE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `E2E_MAILPIT_URL`, `E2E_OAUTH_URL`, `E2E_RECENT_LOGIN_SECONDS`를 명시한다. 빠진 설정과 URL의 `?`·`#`는 기동 전에 실패한다. 외부 스택의 기동·정리는 호출자가 맡는다.
- 외부 주소는 아래 행렬처럼 전달한다. Mailpit·OAuth·APP·실시간은 http(s) Origin이며 API는 `/api/v1`까지 포함한다. URL에는 값이 없는 `?`·`#` 구분 문자도 허용하지 않는다. 최근 로그인 창은 양의 정수이고 백엔드의 `RECENT_LOGIN_SECONDS`와 맞춘다.

| 변수                       | mock                                           | 외부 FastAPI 예시               |
| -------------------------- | ---------------------------------------------- | ------------------------------- |
| `E2E_TARGET`               | 기본 `mock`                                    | `fastapi`                       |
| `APP_URL`                  | 실행기가 `http://localhost:3100`으로 설정      | `http://localhost:3100`         |
| `API_BASE_URL`             | 실행기가 `http://127.0.0.1:4110/api/v1`로 설정 | `http://127.0.0.1:18100/api/v1` |
| `NEXT_PUBLIC_REALTIME_URL` | 실행기가 `http://127.0.0.1:4110`으로 설정      | `http://127.0.0.1:18100`        |
| `E2E_MAILPIT_URL`          | 사용하지 않음                                  | `http://127.0.0.1:28125`        |
| `E2E_OAUTH_URL`            | 사용하지 않음                                  | `http://127.0.0.1:28180`        |
| `E2E_RECENT_LOGIN_SECONDS` | 어댑터의 10초                                  | `10`                            |

- FastAPI의 `FRONTEND_URL`, `REALTIME_ALLOWED_ORIGINS`, `STORAGE_ALLOWED_ORIGINS`는 web Origin으로, `OAUTH_REDIRECT_URIS`는 `http://localhost:3100/oauth/callback`으로 준비한다. 브라우저의 S3 주소도 접근 가능한 외부 주소여야 한다(예: `http://127.0.0.1:28433`).
- Mailpit은 수신자·인증/재설정 목적·새 메일을 골라 실제 web 링크를 읽으며 메일함을 비우지 않는다. 모의 OAuth는 제공자별 claims 폼과 실제 redirect·state를 쓰고 BFF의 PKCE를 유지한다. `expireRecentLogin`은 설정한 창과 여유 시간을 기다린다.
- 두 대상 모두 web 3100을 검사하며 mock만 목 4110도 비워 둔다. 기존 서버는 재사용하지 않는다. 운영 비밀은 실행마다 생성하며 파일에 저장하지 않는다. 각 테스트는 새 계정과 브라우저 컨텍스트를 쓴다.
- 재현 가능한 headless Chromium 검사를 쓴다. 영상·스크린샷·trace는 저장하지 않는다.
- 이미지 빌드만 `NEXT_OUTPUT=standalone`을 설정하고 `node server.js`로 시작한다. standalone 시작 검증은 [Docker 이미지](../docs/architecture.md#docker-이미지), 일반 설정은 [환경 행렬](../docs/architecture.md#환경-행렬)을 따른다. 일반 빌드와 E2E는 이 변수 없이 일반 운영 빌드의 `next start` 경로를 쓴다.
- 테스트 흐름을 확장할 때 [레시피](../AGENTS.md#완료-기준과-문서)를 먼저 읽는다. 공식 Playwright CLI skill은 고정 `pnpm exec playwright-cli`를 쓰며 테스트·Chromium 설치용 `pnpm exec playwright`와 구분한다. 세션의 브라우저 도구 규칙이 우선한다.
