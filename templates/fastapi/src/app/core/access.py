"""인증과 권한 검사. 라우트 선언(Operation)의 auth와 permission을 JsonApiRouter가 강제한다.

- 인증기(Authenticator)는 auth 모듈이 만들고, 앱을 조립할 때 install_access로 건다. 인증기는
  Bearer 토큰을 검증해 Principal을 돌려주거나 401 ApiError를 던진다.
- 라우터는 선언마다 검사 의존성(access_guard)을 쿼리 파싱보다 먼저 단다. 그래서 인증(401)과
  권한(403)이 쿼리 오류(400)보다 먼저 나온다. 결과는 request.state.principal에 둔다.
- 엔드포인트는 PrincipalDep(로그인 필수 선언)이나 OptionalPrincipalDep(로그인 선택)으로 받는다.
"""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Literal, Protocol

from fastapi import Depends, FastAPI, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionDep
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.permissions import PermissionRegistry

type Auth = Literal["none", "optional", "required"]

_CHALLENGE = {"WWW-Authenticate": "Bearer"}


@dataclass(frozen=True, slots=True)
class Principal:
    """인증된 요청의 주체. permissions는 이번 요청에서 계산한 실제 권한이다."""

    user_id: uuid.UUID
    session_id: uuid.UUID
    permissions: frozenset[str]


class Authenticator(Protocol):
    """Bearer 토큰 → Principal. 토큰이 틀리면 401 ApiError를 던진다."""

    async def __call__(self, request: Request, session: AsyncSession, token: str) -> Principal: ...


def install_access(
    app: FastAPI, authenticator: Authenticator, permissions: PermissionRegistry
) -> None:
    """앱에 인증기와 권한 레지스트리를 건다(app.state.authenticator, app.state.permissions)."""
    app.state.authenticator = authenticator
    app.state.permissions = permissions


def bearer_token(request: Request) -> str | None:
    """Authorization: Bearer <토큰>의 토큰. 헤더가 없거나 Bearer가 아니면 None이다."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip()


async def authorize(
    request: Request, session: AsyncSession, *, auth: Auth, permission: str | None
) -> None:
    """선언의 auth와 permission을 검사하고 request.state.principal을 채운다.

    - 토큰이 없으면 required는 401 auth.unauthenticated, optional은 익명(None)이다.
    - 토큰이 있으면 선택이어도 검증한다. 틀리면 인증기가 401을 던진다.
    - permission이 있고 Principal에 없으면 403 permission.denied다.
    - 401에는 WWW-Authenticate: Bearer를 붙인다(RFC 6750).
    """
    token = bearer_token(request)
    if token is None:
        if auth == "required":
            detail = "An access token is required (Authorization: Bearer <token>)."
            raise ApiError(401, ErrorCode.AUTH_UNAUTHENTICATED, detail, headers=_CHALLENGE)
        request.state.principal = None
        return
    authenticator: Authenticator = request.app.state.authenticator
    try:
        principal = await authenticator(request, session, token)
    except ApiError as error:
        if error.status == 401:
            error.headers = {**(error.headers or {}), **_CHALLENGE}
        raise
    if permission is not None and permission not in principal.permissions:
        detail = f"Permission {permission} is required."
        raise ApiError(403, ErrorCode.PERMISSION_DENIED, detail)
    request.state.principal = principal


def access_guard(auth: Auth, permission: str | None) -> Callable[..., Awaitable[None]]:
    """라우트 의존성. 엔드포인트와 같은 요청 세션(SessionDep)을 인증기에 넘긴다."""

    async def guard(request: Request, session: SessionDep) -> None:
        await authorize(request, session, auth=auth, permission=permission)

    return guard


def _principal(request: Request) -> Principal | None:
    principal: object = getattr(request.state, "principal", None)
    return principal if isinstance(principal, Principal) else None


def current_principal(request: Request) -> Principal:
    principal = _principal(request)
    if principal is None:
        raise RuntimeError(
            "PrincipalDep은 로그인이 필요한 선언(auth='required')의 엔드포인트에서만 쓴다."
        )
    return principal


def optional_principal(request: Request) -> Principal | None:
    return _principal(request)


PrincipalDep = Annotated[Principal, Depends(current_principal)]
OptionalPrincipalDep = Annotated[Principal | None, Depends(optional_principal)]
