# 기능

- 기능 하나를 폴더 하나에 둔다. `index.ts`가 공개 인터페이스다.
- 다른 기능의 내부를 import하지 않는다. 같은 기능 안에서는 상대 경로를 쓴다.
- `actions.ts`와 `queries.ts`는 `server-only`다. 클라이언트 컴포넌트와 파일을 나눈다.
- 기능 테스트는 구현 옆의 `*.test.ts`에 둔다.
- `posts/.gitkeep`은 골든 기능이 들어올 자리다. W3에서 구현한다.
