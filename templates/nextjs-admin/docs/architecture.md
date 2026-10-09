# 관리 BFF

서버가 API를 읽고 Server Action이 쓴다. 브라우저에는 계정 표시 정보만 전달한다. API 토큰은 JWE 세션 쿠키에 두며 proxy에서만 갱신한다. 여러 인스턴스에서는 갱신을 같은 프로세스로 보내는 sticky session이 필요하다.

비밀번호 로그인은 `POST /sessions`의 password grant 뒤 발급 토큰으로 `/me`를 읽는다. `admin:access`가 없으면 새 세션을 끝내고 세션·`NEXT_LOCALE` 쿠키를 쓰지 않는다. 발급 뒤 실패한 세션도 정리한다. 보호 레이아웃은 문서 요청마다, 관리 홈·리소스 화면과 Action은 요청마다 다시 확인한다. 클라이언트 이동은 레이아웃을 다시 실행하지 않으며 React 캐시는 요청 안의 중복 조회만 묶는다. `/forbidden`은 권한 판정 밖에서 계정을 읽어 메뉴 없는 레이아웃과 로그아웃을 보인다.

실시간 `me.updated`가 화면을 갱신해 접근 권한을 다시 확인한다. 현재 세션의 `session.revoked`는 401 확인 뒤 로그인 화면으로 보내며 다른 세션의 폐기는 무시한다. 로그아웃은 API 실패에도 브라우저 쿠키를 지우고 같은 언어의 로그인 화면으로 간다. 401은 쿠키 정리 route를 거쳐 로그인으로 보내고 그 밖의 모든 4xx는 `RequestNotice`로 같은 화면에 번역한다. 429는 `Retry-After`도 보인다. 서버 오류와 Next 이동·404 제어 흐름은 다시 던진다.

언어는 ko/en이며 로그인 성공은 계정 언어를 따른다. 로그인 중 전환은 `/me`의 locale, `NEXT_LOCALE`, 현재 화면 URL을 함께 바꾼다. 쿠키는 host-only다. 소셜 계정은 비밀번호를 먼저 설정해야 이 앱에 로그인할 수 있다.

## 리소스

`src/resources/<type>/resource.ts`의 선언이 열·상세·필터·정렬·권한을 정하고 `src/resources/index.ts`가 메뉴와 홈 이동 순서를 정한다. 계약 생성 타입이 필드·쿼리 키와 operation을 검사한다. `lib/resources/`의 서버 계층만 API 경로를 만들며 범용 화면은 등록 목록을 받는다. 화면은 리소스 내부를 직접 가져오지 않는다.

목록 쿼리는 URL에 있고 페이지 크기는 20이다. 관계는 선언의 include로 함께 읽고 등록한 상세와 보기 권한이 있을 때만 링크를 만든다. 검색 가능한 관계 옵션은 첫 페이지만, 검색 없는 옵션은 모든 페이지를 읽는다. 대상 목록의 403은 해당 필터만 비활성화한다. 기간 날짜는 설정 시간대의 하루 경계로 바꾸고 필터 입력에는 그 시간대의 날짜를 돌려준다.

선언의 `include`는 API 조회에만 쓰고 필터 막대·페이지 링크의 URL 쿼리에서는 뺀다.

정규화한 쿼리가 바뀌면 필터의 입력·선택 상태만 새로 만들고 폼과 적용 버튼은 유지한다. 뒤로 가기와 메뉴 이동도 URL의 검색·날짜·필터·정렬 값을 따르며 적용 버튼의 포커스가 남는다. 선택기는 갱신한 기본 옵션·라벨을 받되, 검색어가 있는 열린 팝업의 결과와 기다리는 응답은 새로고침에도 유지한다. 팝업 닫기·검색어 변경이나 비우기·URL 쿼리 변경은 검색을 끝내고, 늦게 도착한 응답은 반영하지 않는다. 검색이 끝나면 최신 기본 옵션을 보인다.

관계 검색 입력의 Enter와 검색 버튼은 같은 검색을 실행하며 진행 중에는 중복 요청을 막는다. Enter 뒤 응답을 기다리는 동안과 결과 도착 뒤에도 입력의 포커스를 유지한다. 검색 가능한 선택기는 선택한 항목을 앞에 고정한다. 결과가 바뀌어도 선택 항목의 인덱스가 움직이지 않아 Base UI의 선택 항목 포커스 동기화가 검색 입력을 방해하지 않는다.

현재 선택한 값에서 본 옵션은 기본 옵션·검색 결과에 항상 합친다. 그래서 새 검색에 기존 선택이 없어도 값이 지워지지 않고, 팝업을 닫아도 검색으로 고른 값과 라벨이 남는다. 단일·다중 관계 입력에 같은 규칙을 적용한다. 현재 선택의 옵션만 보관하고 새 기본 옵션의 라벨을 우선하므로 전체 대상 목록을 캐시하지 않는다. 옵션 밖 URL 선택값은 추가 요청 없이 included의 같은 대상·id에서 라벨을 읽고, included에 없으면 id로 보인다.

화면 요청마다 `requireAdmin`과 리소스 권한을 다시 확인한다. 미등록 경로·선언 없는 화면은 API 전에 404, 권한 상실은 같은 언어의 forbidden으로 간다. URL의 잘못된 필터를 포함한 API 4xx는 `RequestNotice`로 같은 화면에 보인다. 401은 세션 정리, 서버 오류와 Next 제어 흐름은 기존 경계로 전달한다.

수정 화면은 수정 권한도 확인한다. 권한이 있는 관리자의 최신 레코드가 `edit.visible` 조건과 다르면 409 `resource.conflict`를 같은 화면의 안내로 보인다.

폼의 옵션은 관계·열거값 입력에만 준다. 관계의 현재값은 단건 응답의 included 라벨이나 id로 보충하고 추가 요청은 하지 않는다. 대상 목록의 403은 해당 입력만 비활성화하고 옆에 번역 안내를 보인다. 비활성 입력과 존재 표식은 제출하지 않으며 다른 입력과 저장은 유지한다. 단일 관계의 빈 옵션은 선택 안 함(None), 필터는 전체(All)다. 저장과 취소는 상세가 있으면 상세로, 없으면 목록으로 간다.

필드 이름과 다른 관계 필터는 list.filters의 값에 `{ kind: "relation", relation: { type, label, search? } }`를 둔다. 계약의 목록 type과 대상 속성으로 검사하며 fields에 가짜 키를 더하지 않는다. 기존 문자열 필터는 같은 이름의 fields 표시를 따른다. 폼 열거값은 fields의 inputValues를 우선하고, 목록·상세·필터는 values를 유지한다. resource-messages는 inputValues가 values의 일부인지와 두 목록의 번역을 확인한다.

이름 없는 사용자는 layout.unnamedUser(사용자/User)로 표시한다. 사용자 목록·상세와 included 관계, 관계 기본 옵션·현재 선택·검색 결과에 같은 규칙을 적용한다. include하지 않은 관계는 id 대체를 유지하며 추가 API 요청은 하지 않는다.

삭제와 동작의 UI 상태는 `delete`·`action:<name>` 키로 묶는다. 새로고침 뒤 동작이 사라져도 대화상자·실패 안내가 다른 동작으로 옮겨가지 않는다.

최상위 fields의 표시 종류·열거값·관계 라벨·override가 목록과 상세에 쓰인다. `resource-messages`는 서버 표식만 이 검사 프로세스에서 풀어 선언을 읽고 제목·필드·필터·정렬·열거값·동작의 ko/en 문구를 검사한다. 전체 check와 빠른 검사에 모두 포함한다.

글 골든은 `src/resources/posts/`에 있다. 목록과 상세에 작성자·표지 이미지를 include하며 상세에서만 표지 이미지의 파일 이름을 표시한다. 목록에는 coverImage 열이 없다. 작성·수정 화면 없이 발행·발행 취소·삭제를 제공한다. 글 동작의 inline Server Action은 관리 권한과 최신 상태를 확인한 뒤 status만 PATCH한다. 이미 목표 상태인 글은 `resource.conflict` 안내로 반환한다.

선언한 실시간 채널은 목록·상세에서만 구독한다. 구독 컴포넌트: `ResourceRealtime`. 첫 이벤트부터 1000ms 고정 창 안의 연속 이벤트를 한 번의 갱신으로 묶으며 이후 이벤트로 예약을 미루지 않는다. 상세는 자신의 레코드 id와 같은 이벤트만 반영한다. 숨은 탭은 갱신을 보류하고 다시 보일 때 한 번 갱신한다. 채널·레코드 변경과 unmount 때 이전 예약과 보류를 취소한다.

목록 갱신 한 번은 `/me`, 목록, 검색 가능한 각 관계 필터의 첫 페이지를 읽는다.

현재 제품 등록은 posts, users, roles, permissions, audit-logs 순서다. 사용자는 users:read로 목록·상세를 보고 users:manage로 상태·역할을 수정한다. 목록은 이름·이메일·상태·역할·생성 시각과 검색·상태·역할 필터, 기본 -createdAt 정렬을 제공한다. roles만 include하며 아바타는 제외한다. 상세에는 언어·이메일 인증 시각·수정 시각도 표시한다. 상태 입력은 active·deactivated만 제공하고 표시·필터는 deleted도 포함한다. 탈퇴한 사용자 수정은 숨기며 수정 화면·저장 Action은 최신 상태를 확인해 409를 보인다. 자기 자신·상위 권한 대상의 수정은 API의 403을 폼 배너로 알린다.

`pnpm gen:resource <type>`은 API 타입 생성과 같은 `gen.config.json` 입력으로 선언·ko/en 자리표시자·등록 초안을 만들고 기존 자료는 덮지 않는다. operation의 `x-permission`이 없으면 `admin:access`를 넣으므로 권한·필드·문구를 검토한다. [리소스](recipes/add-resource.md)·[필드 종류](recipes/add-field-kind.md)·[동작](recipes/add-action.md) 레시피를 따른다. 외부 FastAPI에도 같은 E2E 시나리오를 실행한다.

역할은 roles:read로 목록·상세를, roles:manage로 이름·설명·권한 배열의 생성·수정과 삭제를 제공한다. 설명은 선택 사항인 textarea다. permissions는 관계가 아닌 enum-many 속성이며 FormData의 같은 이름으로 여러 값을 제출하고 빈 선택은 []를 attributes에 보낸다. 표시와 선택기 이름은 resources.roles.enums.permissions의 ko/en 번역이다. 서버의 loadValues는 /permissions의 모든 페이지를 읽고 선언한 values 안의 코드를 제공한다. 선택기는 코드 접두사로 그룹을 나누고 영어 API 설명은 쓰지 않는다. 시스템 역할의 삭제 버튼은 숨기며 직접 Action 호출은 최신 상태를 읽어 409로 막는다. 시스템 이름 변경·admin 권한 변경의 API 422는 번역 배너, 중복 이름의 pointer는 이름 아래 오류로 보인다. API의 권한 범위 거부는 403 배너다.

권한은 roles:read의 읽기 전용 목록이다. id·group·description을 표시하며 상세·필터·정렬·쓰기는 없다. id 열은 레코드 식별자를 읽고 fields.id 문구를 쓴다. 상세도 id 표시를 선언할 수 있지만 쓰기 계약·관계 라벨·정렬 범위는 유지한다.

감사 로그는 audit-logs:read의 읽기 전용 목록·상세다. 행위자·13개 행위·대상 종류·기간으로 거르며 기본 정렬은 -createdAt이다. actor는 공개 표현의 이름만 표시하고 users:read가 있을 때만 사용자 상세로 링크한다. 없는 계정의 로그인 실패에는 행위자가 없다. users:read가 없으면 행위자 옵션의 403은 해당 필터만 비활성화한다. metadata.tsx는 임의 JSON 객체의 키·값을 표시하고 배열·중첩 객체를 들여쓴 JSON으로 보인다. target.tsx는 DisplayProps.linkable(type)으로 등록된 상세와 현재 권한을 확인해 대상 링크 또는 id만 표시한다. null은 범용 빈 값이다.

기간의 종료 날짜는 포함한다. API의 createdTo는 배타적이므로 date.ts의 calendarDateFilter는 설정 시간대의 다음 날 0시를 보내며 1ms를 빼지 않는다. filterCalendarDate는 ISO 종료 경계의 직전 시각이 속한 날짜로 입력을 되돌린다. 시작은 당일 0시이며 서머타임의 23·25시간 날짜도 다음 날 경계를 따른다.

## 테스트

Vitest global setup이 실제 목 프로세스를 시작하고 `mockBaseUrl`을 제공한다. 요청 저장소를 대체한 Action 검사도 실제 HTTP API로 로그인·권한·폐기를 확인한다. 앱 번역 테스트는 `scripts/test/intl-fixture.ts`로 환경 스키마의 시간대를 고정한다. E2E 18개는 목(4111), 운영 admin(3101), 두 Chromium worker로 인증·글·사용자·역할·권한·감사 로그·언어를 확인하며 실행기가 시작한 자원을 종료한다. 작성자·역할 필터는 대상 검색으로 고르고 실시간 검사는 화면마다 새 subscribe ACK를 확인한 뒤 다른 세션에서 변경한다. 기존 포트의 서버는 재사용하거나 종료하지 않는다. 영상·스크린샷·trace는 저장하지 않는다. FastAPI는 E2E_TARGET=fastapi와 APP_URL·API_BASE_URL·NEXT_PUBLIC_REALTIME_URL·E2E_MAILPIT_URL·E2E_RECENT_LOGIN_SECONDS, 필수 E2E_SEED_ADMIN_EMAIL·E2E_SEED_ADMIN_PASSWORD를 받는다. 계정은 API 가입 뒤 Mailpit 인증 링크의 토큰으로 인증하고 로그인한다. 메일 링크 Origin은 APP_URL과 같아야 하므로 backend FRONTEND_URL도 3101 출처로 맞춘다. 시드 계정은 역할 준비만 맡는다. 성공한 운영 빌드는 조용히 끝내며 실패한 빌드의 두 출력 스트림은 stderr로 전달한다.

## 실행과 이미지

환경 예시의 API와 실시간 주소는 목(4011)이다. `pnpm dev`는 HTTP loopback의 이 주소일 때 목도 시작한다. 실제 백엔드 주소면 admin만 시작한다. `pnpm build`에는 비밀이 필요 없다. 서버 시작과 instrumentation은 환경 스키마를 확인하고 운영 예시 비밀을 거절한다.

Docker 이미지는 `NEXT_OUTPUT=standalone`으로 빌드하며 `node server.js`와 포트 3001, UID/GID 10001로 실행한다. API·APP·실시간 URL과 새 세션 비밀은 실행 때 전달한다. healthcheck는 로그인 이동도 따라간다. 일반 운영·E2E는 standalone 설정 없이 `next start`를 쓴다.
