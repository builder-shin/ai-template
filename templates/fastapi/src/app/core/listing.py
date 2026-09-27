"""컬렉션 조회 도우미: 정렬, 검색 패턴, 페이지. 모듈의 repository가 쓴다.

- ordering: 쿼리의 sort(SortField)를 ORDER BY로 바꾼다. 끝에 늘 tiebreak(보통 id)를 붙여 같은 값이
  여럿이어도 페이지 사이의 순서가 흔들리지 않게 한다.
- contains: filter[q] 같은 검색어를 ILIKE 패턴으로 바꾼다. %, _, \\는 글자 그대로 찾는다.
- fetch_page: 전체 개수와 한 페이지의 행을 함께 읽는다.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import QueryableAttribute

from app.core.jsonapi.query import Page, SortField

ESCAPE = "\\"
# 정렬할 수 있는 것: 모델의 열 속성(User.name)이나 식(func.lower(User.name))
type Sortable = QueryableAttribute[Any] | ColumnElement[Any]


def ordering(
    sort: Sequence[SortField],
    columns: Mapping[str, Sortable],
    *,
    default: Sequence[SortField],
    tiebreak: Sortable,
) -> list[ColumnElement[Any]]:
    """sort가 비었으면 default로 정렬한다. columns는 정렬 이름(계약의 camelCase) → 열이다."""
    clauses = [
        columns[field.name].desc() if field.descending else columns[field.name].asc()
        for field in (sort or default)
    ]
    return [*clauses, tiebreak.asc()]


def contains(text: str) -> str:
    """ILIKE 패턴(부분 일치). column.ilike(contains(q), escape=ESCAPE)로 쓴다."""
    escaped = text.replace(ESCAPE, ESCAPE * 2).replace("%", f"{ESCAPE}%").replace("_", f"{ESCAPE}_")
    return f"%{escaped}%"


async def fetch_page[RowT](
    session: AsyncSession, query: Select[tuple[RowT]], page: Page
) -> tuple[list[RowT], int]:
    """(한 페이지의 행, 전체 개수). query에는 정렬을 붙여 넘긴다."""
    total = await session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    rows = await session.scalars(query.offset(page.offset).limit(page.size))
    return list(rows), total or 0
