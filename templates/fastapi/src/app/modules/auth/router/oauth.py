"""소셜 로그인 리다이렉트(OAuth). 본문이 없는 JSON:API 예외 엔드포인트다.

규칙은 service/oauth.py에 있다.
"""

from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.responses import RedirectResponse

import app.modules.auth.service.oauth as service
from app.core.config import Settings
from app.core.db import SessionDep
from app.core.jsonapi.operation import (
    REDIRECT_ERRORS,
    JsonApiRouter,
    QueryParameter,
    RedirectOperation,
)
from app.core.jsonapi.query import RedirectQuery
from app.core.redis import RedisDep
from app.modules import users
from app.modules.auth.schemas import OAuthProvider

oauth = JsonApiRouter(prefix="/oauth/{provider}", tag="oauth", interface="OAuth")

AUTHORIZE = RedirectOperation(
    name="authorize",
    errors=REDIRECT_ERRORS,
    query=(QueryParameter("redirectUri", required=True, format="uri"),),
    description=(
        "제공자 로그인 화면으로 보낸다. redirectUri는 허용 목록으로 검사한다. "
        "state와 PKCE(S256)를 붙인다. 세 제공자 모두 PKCE를 지원한다."
    ),
)
CALLBACK = RedirectOperation(
    name="callback",
    errors=REDIRECT_ERRORS,
    query=(QueryParameter("state", required=True), QueryParameter("code"), QueryParameter("error")),
    callback=True,
    description=(
        "제공자가 돌아오는 곳. 성공하면 1회용 코드(60초)를 code로 붙여 프론트 콜백으로 보낸다. "
        "실패하면 code 대신 error(auth.oauth_denied, auth.oauth_failed, "
        "auth.account_deactivated)를 붙여 보낸다. state가 없거나 만료됐으면 돌려보낼 곳을 모르므로 "
        "400이다."
    ),
)


@oauth.route("GET", "/authorize", AUTHORIZE, response_model=None)
async def authorize(
    provider: OAuthProvider,
    request: Request,
    redis: RedisDep,
    query: Annotated[RedirectQuery, Depends(AUTHORIZE)],
) -> Response:
    settings: Settings = request.app.state.settings
    location = await service.authorize(redis, settings, provider, query.values["redirectUri"])
    return RedirectResponse(location, status_code=302)


@oauth.route("GET", "/callback", CALLBACK, response_model=None)
async def callback(
    provider: OAuthProvider,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    query: Annotated[RedirectQuery, Depends(CALLBACK)],
) -> Response:
    settings: Settings = request.app.state.settings
    location = await service.callback(
        session,
        redis,
        settings,
        provider,
        state=query.values["state"],
        code=query.values.get("code"),
        error=query.values.get("error"),
        locale=users.locale_from(request.headers.get("accept-language")),
    )
    return RedirectResponse(location, status_code=302)
