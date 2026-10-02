# UI 부품 추가

모든 명령과 경로는 이 프로젝트 루트 기준이다. shadcn CLI는 `4.21.0`, `@base-ui/react`는 `1.8.0`으로 고정되어 있다. 기본 UI 부품은 CLI로 추가한다.

## 파일 순서

1. [스택](../stack.md)과 `.claude/skills/shadcn/SKILL.md`를 읽는다. 공식 skill의 latest 명령은 이 프로젝트의 `pnpm exec shadcn`으로 바꾼다. `pnpm dlx ...@latest`로 버전을 바꾸지 않는다.
2. `components.json`의 `style: "base-nova"`, `rsc: true`, CSS·별칭을 확인한다. 기존 `src/components/ui/`에 필요한 부품이 있으면 재사용한다. Base UI의 `render`를 Radix의 `asChild`로 바꾸지 않는다.
3. 예를 들어 Dialog가 필요하면 프로젝트 루트에서 아래 명령을 실행한다. 설치된 CLI의 docs로 용법을 확인하고 add로 소스를 넣는다. 이미 수정한 파일을 강제로 덮어쓰지 않는다.

```sh
pnpm exec shadcn --version
pnpm exec shadcn info --json
pnpm exec shadcn docs dialog
pnpm exec shadcn add dialog
```

4. `src/components/ui/dialog.tsx` → `package.json` → `pnpm-lock.yaml` 순서로 diff를 검토한다. Base UI 기반 import인지와 필요한 파일만 생겼는지 본다. 새 의존성이 필요하면 안정판의 정확한 버전을 `pnpm view <패키지>@<버전> time --json`으로 확인하고 공개 후 1440분이 지난 버전만 `pnpm add --save-exact <패키지>@<버전>`으로 고정한다. 범위·새 latest·기존 pin의 불필요한 변경을 남기지 않으며 lockfile을 함께 커밋한다.
5. `messages/ko.json`·`messages/en.json`에 제목·설명·버튼·접근성 이름을 넣고 기능의 컴포넌트에서 기본 부품을 조합한다. Dialog에는 번역한 Title·Description, 닫기 이름을 둔다. CLI가 넣은 영어 Close 같은 기본 문구도 카탈로그로 바꾼다. `components/ui`에는 기능 데이터·API·세션·업무 문구를 넣지 않는다.
6. 기능의 `index.ts`에 필요한 조합만 내보내고 페이지는 공개 인터페이스를 쓴다. 기능 옆 컴포넌트 테스트에서 역할·번역한 이름, 키보드·포커스·닫기·비활성 상태를 검사한다. 기존 부품을 감쌀 때는 `src/components/ui/tabs.test.tsx`처럼 Base UI의 props 전달도 확인한다.

## 규칙

- 공통 부품은 기능을 import하지 않는다. app·다른 기능은 기능의 공개 `index.ts`만 쓴다. 데이터는 Server Component가 읽고 server-only Action이 쓰며 UI에 API·세션을 넣지 않는다.
- 폼은 `useActionState`·`<form action>`·`toFormResult`와 계약의 `name`을 유지한다. 제출 버튼은 기존 `SubmitButton`으로 pending·실시간 대기를 연결한다.
- 로딩은 기존 `Spinner`·CLI의 `Skeleton`만 쓰고 문구는 표시하지 않는다. 모든 문구·접근성 이름은 ko/en으로 번역한다.
- 시스템 다크 모드와 CSS 의미 토큰을 쓰며 별도 테마 저장소·스위치를 만들지 않는다. 토큰·반응형 레이아웃을 기존 부품과 맞춘다.

## 확인

프로젝트 루트에서 실행한다. frozen install은 pin·lockfile의 일치를 확인한다. 개발 서버를 종료하고 3100·4110을 비운다.

```sh
pnpm install --frozen-lockfile
pnpm fix
pnpm check
pnpm build
pnpm test:e2e
```

필요하면 검사 뒤 `pnpm dev`로 ko/en, 좁은 화면, 시스템 밝은·어두운 모드, 키보드 포커스를 확인하고 서버를 종료한다. 새 사용자 흐름은 `e2e/`에서 역할·이름으로 검사한다.
