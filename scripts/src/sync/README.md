# 공유 자산 동기화

저장소 루트의 `pnpm sync`가 `scripts/shared-assets.json`을 읽는다. `mode`가 없는 항목은 기존처럼 대상 파일·폴더를 통째로 교체한다. `node_modules`는 복사하지 않는다.

## 덮어 놓기 항목

```json
{
  "source": "shared/nextjs",
  "mode": "overlay",
  "targets": [{ "template": "nextjs", "path": "." }]
}
```

- 원본은 저장소 안, `templates/` 밖의 일반 폴더다. 파일·폴더 링크는 허용하지 않는다.
- 대상은 `templates/<template>/` 안의 상대 경로다. `"."` 또는 빈 문자열은 템플릿 루트다.
- 원본 파일을 같은 상대 경로에 덮고 필요한 폴더를 만든다. `node_modules`만 제외하며 숨김 파일과 `.cache`도 포함한다.
- 다른 앱 파일과 설치물은 그대로 둔다. 대상 파일 자리에 폴더나 링크가 있으면 쓰기 전에 멈춘다.
- 모든 항목의 쓰기 경로를 먼저 검사한다. 같은 파일이나 상하위 경로가 겹치면 거절한다. 통째로 교체할 폴더 안에는 다른 항목을 둘 수 없다.

## 삭제 기록

`pnpm sync`는 각 overlay 항목에 `managedFiles`를 더한다. 값은 지금까지 복사 대상으로 삼은 원본 상대 파일 경로의 정렬된 합집합이다. 삭제된 경로도 남긴다.

```json
{
  "source": "shared/nextjs",
  "mode": "overlay",
  "targets": [{ "template": "nextjs", "path": "." }],
  "managedFiles": ["src/lib/session/cookie.ts"]
}
```

기록을 저장소 manifest와 함께 커밋한다. 설치 캐시나 이전 실행 상태가 없는 checkout에서도 지운 원본의 사본을 찾을 수 있다. 템플릿과 생성 프로젝트에는 기록 파일을 넣지 않는다.

현재 원본에 없는 기록 경로의 사본 파일만 지운다. 폴더는 앱 파일을 담을 수 있으므로 지우지 않는다. 오래된 사본이 다시 생겨도 다음 검사와 동기화가 찾는다. 삭제 기록 경로를 앱 고유 파일로 다시 쓰려면 모든 대상의 사본을 정리한 뒤 해당 경로를 `managedFiles`에서 명시적으로 뺀다.

새 경로는 복사 전에 기록하므로 중간에 멈춘 복사도 다음 실행에서 다시 확인한다. CLI는 manifest를 저장소 Prettier 설정으로 포맷하며, 두 번째 실행은 파일 내용을 바꾸지 않는다. 원본 폴더 자체를 지우면 경로 오류로 멈춘다. 전체 파일을 없애려면 빈 원본 폴더를 남기고 동기화한다.

## 사본 검사

`pnpm check:templates`는 현재 원본 파일의 누락·내용 변경과 삭제 기록에 남은 사본 파일을 검사한다. 템플릿의 다른 파일은 비교하지 않는다. 실패 메시지는 원본 파일 경로를 적고 원본을 고친 뒤 `pnpm sync`하도록 안내한다.

`pnpm --dir scripts test test/sync/overlay.test.ts`가 임시 저장소에서 동기화·삭제·검사 CLI·경로 검증을 확인하고 생성한 임시 폴더를 정리한다.
