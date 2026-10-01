# 기능

- 기능 하나를 폴더 하나에 둔다. `index.ts`가 공개 인터페이스다.
- 다른 기능의 내부를 import하지 않는다. 같은 기능 안에서는 상대 경로를 쓴다.
- `actions.ts`와 `queries.ts`는 `server-only`다. 클라이언트 컴포넌트와 파일을 나눈다.
- 기능 테스트는 구현 옆의 `*.test.ts`에 둔다.
- `auth`는 비밀번호·소셜 로그인 안내, `me`는 프로필·비밀번호·탈퇴, `sessions`는 기기 관리, `files`는 JS가 필요한 업로드다. 함께 쓸 컴포넌트·Action도 각 공개 `index.ts`로 가져온다.
- 읽기는 Server Component와 요청별 `React.cache`, 쓰기는 Server Action이다. 폼은 `useActionState`·로케일별 permalink와 `toFormResult`의 명시한 입력칸 목록을 쓴다.
- `posts`는 골든 기능이다. `pnpm gen:feature <복수형 이름>`으로 화면·번역·테스트를 함께 복사한다.
- 생성기는 `posts` 계약을 보존한 초안을 만든다. 출력한 고칠 곳을 보고 새 계약·권한·문구를 채운다.
- 메시지는 ko/en 카탈로그로, 로딩은 스피너·스켈레톤으로 표시한다. [기능 추가](../../docs/recipes/add-feature.md)를 따른다.
