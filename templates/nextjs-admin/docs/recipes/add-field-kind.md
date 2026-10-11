# 필드 종류 추가

먼저 `src/lib/resources/definition.ts`와 `src/components/resource/types.ts`를 읽는다. 기존 text·textarea·date·enum·boolean·relation·relation-many·file로 표현되는지 확인한다. 필터는 text·enum·relation·date, 입력은 text·textarea·enum·boolean·relation·relation-many다.

1. 리소스 하나만 필요한 표시는 그 폴더의 컴포넌트를 최상위 `fields.<name>.display`에 둔다. 입력은 `input`에 둔다. `DisplayProps`는 name·value·record·included·locale·timeZone, `InputProps`는 name·label·kind·defaultValue·options·search·disabled·error를 받는다. options는 관계·열거값 입력에만 있고 search는 관계 입력에만 있다.
2. 입력은 같은 name으로 제출하고 `useResourceField(name)`으로 오류·접근성 속성을 읽는다. 비운 관계·체크박스는 `__present_<name>`을 제출한다. 비활성 입력은 둘 다 제출하지 않는다. 범용 fieldset이 입력 override도 비활성화하며 사용자 정의 선택 부품에도 disabled를 전달한다. Server Action과 `useActionState`를 유지한다. 일반 컴포넌트 함수를 클라이언트 props로 넘기지 않는다.
3. 공통 종류가 필요하면 definition의 DisplayKind·InputKind·FilterKind와 화면 types를 함께 늘린다. display.tsx·form.tsx·filters.tsx·screen.tsx의 실제 소비자를 맞춘다. 모든 종류를 세 위치에 무조건 추가하지 않는다.
4. 쓰기 종류는 `src/lib/resources/values.ts`의 FormData 해석과 data.ts의 JSON:API attributes·relationships 분류도 맞춘다. 이름만 추가하면 문서가 달라지므로 실제 목의 요청·응답과 source.pointer를 검사한다.
5. `scripts/gen-resource/draft.ts`의 스키마 추론을 검토하고 계약 조각 테스트를 더한다. 자동 추론이 불가능한 종류는 레시피에 수동 선언 절차를 적는다. 문구·enum values는 ko/en 양쪽에 둔다.
6. 날짜는 TIME_ZONE, enum은 번역한 배지, 관계는 included의 이름·id 대체를 유지한다. 관계 키의 relation.type은 계약의 대상, 그 밖의 필드는 목록이 있는 ResourceType이며 label은 대상의 속성 키다. 파일은 목록 없이 단건 응답의 속성(예: filename)으로 검사하며 id는 라벨 선언으로 쓰지 않는다. 쓰기 계약의 단일 관계는 relation, 다중 관계는 relation-many만 받는다.
7. 관계 현재값은 단건 included로 보충하고 추가 조회하지 않는다. 옵션 목록의 403은 해당 입력만 비활성화하고 번역 안내를 옆에 보인다. 다른 오류는 기존 오류 경계로 던진다. 폼의 빈 단일 관계는 resource.none(선택 안 함/None), 필터는 resource.all(전체/All)이다. 관계 검색의 Enter 뒤에도 입력 포커스를 유지한다. DOM에서 값·오류·비운 값·접근성과 다른 필드의 저장을 확인한다. UI 부품은 고정 `pnpm exec shadcn add <부품>`을 쓴다.
8. `pnpm check`, `pnpm build`, `pnpm test:e2e`를 차례로 통과시키고 시작한 서버를 종료한다. 로딩은 스피너·스켈레톤만 쓴다.
