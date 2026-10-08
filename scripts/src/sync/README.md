# 공유 자산 동기화

저장소 루트에서 `pnpm sync` 명령을 실행하면 공유 자산 목록(`scripts/shared-assets.json`)을 읽는다. 복사 방식(`mode`)을 생략한 항목은 기존처럼 대상 파일·폴더를 통째로 교체한다. 설치물(`node_modules`)은 복사하지 않는다.

## 덮어 놓기 항목

```json
{
  "source": "shared/nextjs",
  "mode": "overlay",
  "targets": [{ "template": "nextjs", "path": "." }]
}
```

- 원본은 저장소 안, 템플릿 폴더(`templates/`) 밖의 일반 폴더다. 파일·폴더 링크는 허용하지 않는다.
- 대상은 템플릿 안(`templates/<template>/`)의 상대 경로다. `"."` 또는 빈 문자열은 템플릿 루트다.
- git 인덱스에 있고 디스크에 남은 원본 파일만 같은 상대 경로에 덮고 필요한 폴더를 만든다. 새 파일은 먼저 `git add`한다. 아직 커밋하지 않은 내용도 현재 파일의 바이트로 복사한다. 설치물(`node_modules`)은 제외한다. 숨김 파일과 캐시도 명시적으로 추적하면 포함하지만 미추적 편집기·OS 파일은 복사하거나 기록하지 않는다.
- 다른 앱 파일과 설치물은 그대로 둔다. 대상 파일 자리에 폴더나 링크가 있으면 쓰기 전에 멈춘다.
- 해당 대상의 기록에 없는 원본과 다른 내용의 앱 파일이 같은 자리를 쓰면 거절한다. 앱 파일을 옮기거나 원본과 같은 바이트로 맞춘 뒤 동기화한다. 같은 바이트는 옮긴 파일로 받아 기록한다. 새 대상은 다른 대상의 기록을 물려받지 않는다.
- 모든 항목의 쓰기 경로를 먼저 검사한다. 같은 파일이나 상하위 경로가 겹치면 거절한다. 통째로 교체할 폴더 안에는 다른 항목을 둘 수 없다.
- 현재 원본과 삭제 기록에 대소문자만 다른 경로가 있으면 거절한다. 옛 경로의 사본을 지우고 기록에서 뺀 뒤 동기화한다.

## 삭제 기록

동기화 명령(`pnpm sync`)은 각 덮어 놓기 항목과 대상에 관리 경로 배열(`managedFiles`)을 더한다. 항목의 값은 현재 원본 파일과 이전 기록의 정렬된 합집합이다. 대상의 값은 현재 원본 파일과 그 대상이 받은 이전 기록의 합집합이며, 항목 기록에서 뺀 경로는 제외한다. 삭제된 경로도 남긴다. 배열에는 슬래시 구분 상대 파일 경로만 적는다. 빈 구간, 점 구간(`.`, `..`), 설치물 구간(`node_modules`), 역슬래시와 콜론은 허용하지 않는다.

```json
{
  "source": "shared/nextjs",
  "mode": "overlay",
  "targets": [
    {
      "template": "nextjs",
      "path": ".",
      "managedFiles": ["src/lib/session/cookie.ts"]
    }
  ],
  "managedFiles": ["src/lib/session/cookie.ts"]
}
```

기록을 저장소 manifest와 함께 커밋한다. 설치 캐시나 이전 실행 상태가 없는 checkout에서도 지운 원본의 사본을 찾을 수 있다. 템플릿과 생성 프로젝트에는 기록 파일을 넣지 않는다.

현재 원본에 없고 항목과 해당 대상 양쪽에 기록된 사본 파일만 지운다. 지운 경로는 `templates/<template>/<path>: 사본 삭제` 한 줄씩 출력하며 삭제 없는 실행의 출력 줄 수는 그대로다. 폴더는 앱 파일을 담을 수 있으므로 지우지 않는다. 오래된 사본이 다시 생겨도 다음 검사와 동기화가 찾는다. 새 대상의 삭제 원본 경로는 앱 소유로 남으며 이후 동기화도 지우지 않는다. 그 원본을 다시 더하면 새 원본 충돌 검사로 보호한다.

공유 파일을 앱 소유로 돌리는 순서는 다음과 같다. 원본을 먼저 지우고 동기화하면 사본도 지워지므로 순서를 지킨다.

1. 항목의 `managedFiles`와 각 대상의 `managedFiles`에서 해당 경로를 먼저 뺀다. 항목 범위를 바꾸므로 모든 대상에서 앱 소유로 돌릴지 확인한다.
2. 공유 원본을 지우고 대상의 앱 파일을 남기거나 고친다.
3. `pnpm sync`와 `pnpm check:templates`로 사본이 보존되는지 확인한다.

이전 형식처럼 항목 기록만 있고 대상 기록이 없으면 기존 파일도 미기록 파일로 검사한다. 현재 원본 경로는 비어 있거나 원본과 바이트가 같아야 첫 동기화가 통과한다. 지운 원본의 사본을 계속 관리하려면 실제로 받은 대상의 `managedFiles`에 그 경로를 명시적으로 옮긴다. 출처를 알 수 없는 파일은 자동으로 삭제 권한에 넣지 않는다. 이 저장소의 기존 nextjs 대상 132개는 원본과 같은 바이트를 확인하고 동기화로 대상 기록을 만들었다.

새 경로는 복사 전에 기록하므로 중간에 멈춘 복사도 다음 실행에서 다시 확인한다. CLI는 manifest를 저장소 Prettier 설정으로 포맷하며, 두 번째 실행은 파일 내용을 바꾸지 않는다. 원본 폴더 자체를 지우면 경로 오류로 멈춘다. 전체 파일을 없애려면 빈 원본 폴더를 남기고 동기화한다.

## 사본 검사

사본 검사 명령(`pnpm check:templates`)은 현재 원본 파일의 누락·내용 변경과 해당 대상의 삭제 기록에 남은 사본 파일을 검사한다. 템플릿의 다른 파일은 비교하지 않는다. 현재 원본의 사본은 원본 경로와 동기화 방법을 안내한다. 지운 원본의 사본은 관리 경로 배열(`managedFiles`)에서 빼서 앱 파일로 남기거나 동기화로 지우도록 안내한다.

Next.js 공유 import 검사는 목록(`scripts/shared-assets.json`)의 모든 대상에서 상대 경로와 별칭(`@/` → `src/`)을 푼다. 일반 파일만 인정하며 폴더는 `index.ts`로 푼다. 같은 상대 경로의 원본 파일이 없으면 앱 파일로 분류한다. 대상에서는 풀리지 않고 원본에서만 풀리는 import는 동기화 누락으로 따로 알린다. 원본과 대상을 모두 찾아도 풀리지 않는 경로와 공유 경로를 가리는 앱 파일은 고정 앱 파일 목록 밖이면 실패한다.

## 공유 원본 자동 수정

루트 `pnpm fix`와 pre-commit은 `shared/**`를 제외한다. 공유 파일에는 아래 저장소 명령을 쓴다. 템플릿의 `pnpm fix`는 공유 사본을 고치므로 이 용도로 쓰지 않는다.

```sh
git add shared/nextjs/수정한-파일.ts
pnpm fix:shared shared/nextjs/수정한-파일.ts
pnpm sync
```

파일 인자를 생략하면 추적 중인 일반 공유 소스를 모두 고른다. helper(`scripts/src/sync/fix-nextjs.mjs`)는 원본 내용에 web의 ESLint 설정과 대응 사본 경로를 적용해 자동 수정한 뒤, 사본 경로의 Prettier 설정으로 포맷한다. 원본에만 쓰며 생성물·환경 파일은 제외한다. web 의존성이 설치되어 있어야 한다. 자동 수정할 수 없는 린트 오류는 실패 코드로 알린다. 이후 원본·manifest·사본을 함께 스테이징하고 루트·템플릿 check로 확인한다.

## 앱 계약

공유 코드가 import하는 앱 파일은 아래 여덟 개다. 경로와 내보내기는 두 앱에서 같다.

| 파일                                   | 계약                                                |
| -------------------------------------- | --------------------------------------------------- |
| `app.config.json`                      | 앱 이름과 dev·mock·e2e·e2eMock 포트                 |
| `messages/en.json`, `messages/ko.json` | 공유 카탈로그와 겹치지 않는 앱 문구                 |
| `e2e/targets/app.ts`                   | `appEnvironment`, `mockEnvironment`, `extendTarget` |
| `scripts/check/steps.ts`               | `assembleSteps`, `ContractInputs`                   |
| `scripts/test/e2e-app.ts`              | `extraE2eEnv`                                       |
| `src/lib/env.ts`                       | `envSchema`                                         |
| `src/lib/session/routes.ts`            | `isProtectedPath`                                   |

import 밖의 계약도 앱이 제공한다. 자세한 기준은 [admin 설계 §3.3](../../../docs/superpowers/specs/2026-10-08-nextjs-admin-design.md#33-앱마다-두는-것)에 있다.

| 위치                                   | 계약                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude/settings.json`                | 공통 hook exec form, 명령 어휘 허용, 환경 파일 읽기·생성물 Edit/Write·위험 명령 차단                                                                   |
| `tsconfig.json`, `tsconfig.check.json` | strict, `@/*` → `src/*`, 공통 TS·TSX·MJS 포함. check 설정은 기본 설정을 잇고 `.next/dev` 제외                                                          |
| 단계 이름 `types`, `harness`           | `types` 성공 뒤 route 타입 캐시 재계산, `harness` 공통 하네스·공식 skill 직접 검사                                                                     |
| Vitest global setup                    | `ProvidedContext.mockBaseUrl: string` 선언, 실제 목 Origin을 `project.provide("mockBaseUrl", …)`로 제공하고 종료 함수로 정리                           |
| `package.json`의 `start`               | `next start --port <ports.dev>`                                                                                                                        |
| `.env.example`                         | `envSchema`와 키 일치. 공통 키 `API_BASE_URL`, `APP_URL`, `SESSION_SECRET`, `TIME_ZONE`, `NEXT_PUBLIC_REALTIME_URL`; 단독 기본 주소는 앱 dev·mock 포트 |

아래 명령으로 임시 저장소에서 동기화·삭제·검사 CLI·경로 검증을 확인한다. 테스트는 생성한 임시 폴더를 정리한다.

```sh
pnpm --dir scripts test test/sync/overlay.test.ts test/sync/fix-nextjs.test.ts
```
