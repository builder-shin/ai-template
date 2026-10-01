# 골든 글 기능

- `pnpm gen:feature <복수형 이름>`이 이 폴더와 공개·내 글 화면, HTTP 테스트를 복사한다.
- `index.ts`가 공개 인터페이스다. 읽기는 `queries.ts`, 쓰기는 `actions.ts`에 둔다.
- 공개 목록·상세는 `/posts`, 내 글 목록·작성·수정·삭제 확인은 `/my-posts`다. 공개 조회는 발행 글만 읽고 작성자·커버를 include한다. 내 글 조회는 현재 사용자의 id로 거른다.
- `model.ts`는 표시 데이터·검색·정렬·페이지 링크를, `editor.tsx`는 Markdown 입력·미리보기를 맡는다. raw HTML은 렌더링하지 않는다. `realtime.tsx`는 posts 채널로 목록을 모아 갱신하고 같은 id의 상세만 갱신한다.
- 쓰기 뒤 양쪽 로케일의 영향받는 페이지를 갱신한다. 커버는 files의 공개 업로드를 쓰며 ready id만 저장하고 빈 값은 관계를 해제한다.
- `gen:feature: 빼기`는 해당 줄, `빼기 시작`·`빼기 끝`은 구간을 복사하지 않는다.
- `gen:feature: 그대로`는 같은 줄의 이름을 바꾸지 않는다. `고칠 곳 — 설명`은 생성 결과의 검토 목록에 남는다.
- 계약 타입·API 경로·JSON:API type·에러 코드·실시간 채널은 생성기가 보존한다. 새 기능의 계약을 만든 뒤 표시한 곳을 고친다.
- 새 기능도 Server Component·Server Action, `server-only`, JS 없는 폼, ko/en 번역, 스피너·스켈레톤 규칙을 따른다. 업로드와 미리보기는 JS가 필요하다.
- 실제 목으로 조회·Action·커버를 확인한다. HTTP 테스트는 로케일별 화면과 JS 없는 폼을 확인한다.
- [기능 추가](../../../docs/recipes/add-feature.md)의 순서로 생성된 계약·문구·권한을 채운다. 생성기는 헤더·홈의 진입 링크를 자동으로 넣지 않는다.
