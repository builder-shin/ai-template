"""테스트용 소셜 로그인. 모의 OAuth 서버(compose의 oauth)의 로그인 폼에 신원을 보낸다.

모의 서버는 인가 주소에서 로그인 폼(username, claims)을 보여 준다. 폼을 그 주소로 보내면 claims를
토큰과 userinfo에 그대로 담고 redirect_uri로 돌려보낸다. username이 sub가 된다. 제공자마다 다른
신원 응답(카카오의 kakao_account, 네이버의 response)을 claims로 흉내 낸다.
- claims의 문자열은 ASCII로 쓴다. 모의 서버 6.0.3은 비ASCII 값을 깨뜨린다(스펙 §14).
- 거부(access_denied)는 모의 서버가 만들지 못한다. 콜백을 error와 함께 직접 부른다.
"""

import json
from typing import Any
from urllib.parse import parse_qsl, urlsplit

import httpx


def claims(
    provider: str, *, subject: str, email: str | None, verified: bool, name: str
) -> dict[str, Any]:
    """provider의 프로필 응답 모양으로 만든 claims."""
    if provider == "kakao":
        account = {
            "email": email,
            "is_email_valid": verified,
            "is_email_verified": verified,
            "profile": {"nickname": name},
        }
        return {"id": subject, "kakao_account": account}
    if provider == "naver":
        return {"response": {"id": subject, "email": email, "name": name}}
    return {"email": email, "email_verified": verified, "name": name}


async def sign_in_at_provider(location: str, subject: str, found: dict[str, Any]) -> dict[str, str]:
    """authorize가 보낸 제공자 주소에서 로그인하고, 콜백 주소의 쿼리(code, state 등)를 준다."""
    form = {"username": subject, "claims": json.dumps(found)}
    async with httpx.AsyncClient() as client:
        response = await client.post(location, data=form)
    assert response.status_code == 302, response.text
    return dict(parse_qsl(urlsplit(response.headers["location"]).query))
