/**
 * 컬렉션 조회 도우미: 정렬, 검색, 페이지. 모듈이 메모리의 행을 늘어놓을 때 쓴다(FastAPI의
 * core/listing.py).
 *
 * - ordered: 쿼리의 sort를 행의 순서로 바꾼다. 끝에 늘 id 오름차순을 붙여 같은 값이 여럿이어도 페이지
 *   사이의 순서가 흔들리지 않게 한다. id는 UUIDv7이라 만든 순서다.
 * - null은 PostgreSQL처럼 가장 큰 값으로 본다(오름차순이면 맨 뒤, 내림차순이면 맨 앞).
 * - 문자열은 코드 단위 순서로 비교한다. PostgreSQL의 정렬 규칙(collation)과 다를 수 있으니 문자열로
 *   정렬하는 모듈은 그 차이를 확인한다.
 */

import type { Page, SortField } from "../jsonapi/query.ts";

export type SortValue = number | string | null;
/** 정렬 이름(계약의 camelCase) → 행에서 그 값을 꺼내는 함수. */
export type SortColumns<Row> = Readonly<Record<string, (row: Row) => SortValue>>;

function compareValues(left: SortValue, right: SortValue): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

/** sort가 비었으면 defaults로 정렬한다. columns에 없는 정렬 이름은 쿼리 파서가 이미 거부했다. */
export function ordered<Row extends { readonly id: string }>(
  rows: Iterable<Row>,
  sort: readonly SortField[],
  columns: SortColumns<Row>,
  defaults: readonly SortField[],
): Row[] {
  const fields = sort.length > 0 ? sort : defaults;
  return [...rows].sort((left, right) => {
    for (const { name, descending } of fields) {
      const column = columns[name];
      if (column === undefined) throw new Error(`정렬 ${name}의 열이 없다.`);
      const order = compareValues(column(left), column(right));
      if (order !== 0) return descending ? -order : order;
    }
    return compareValues(left.id, right.id);
  });
}

/** 한 페이지의 행과 전체 개수(FastAPI의 fetch_page). */
export function pageOf<Row>(rows: readonly Row[], page: Page): { rows: Row[]; total: number } {
  const offset = (page.number - 1) * page.size;
  return { rows: rows.slice(offset, offset + page.size), total: rows.length };
}

/**
 * 부분 일치 검색(FastAPI의 contains와 ILIKE). 대소문자를 가리지 않고, 검색어의 %, _, \는 글자 그대로
 * 찾는다. 값이 null이면 맞지 않는다(SQL에서 NULL ILIKE는 참이 아니다).
 */
export function containsText(value: string | null, text: string): boolean {
  return value?.toLowerCase().includes(text.toLowerCase()) ?? false;
}
