"""네이티브 콜백은 명시한 scheme의 고정 경로만 허용한다."""

import pytest
from pydantic import TypeAdapter, ValidationError

from app.core.config import OAuthRedirectUris
from app.core.oauth_urls import valid_oauth_callback


@pytest.mark.parametrize(
    "value",
    [
        "aitpl-example://oauth/callback",
        "com.example.app://oauth/callback",
        "https://app.example.com/oauth/callback",
        "http://localhost:3000/oauth/callback?fixed=1",
        "https://example.com/callback?from=app&empty=#part",
    ],
)
def test_accepts_exact_callback(value: str) -> None:
    assert valid_oauth_callback(value)
    assert TypeAdapter(OAuthRedirectUris).validate_python(value) == frozenset({value})


@pytest.mark.parametrize(
    "value",
    [
        "javascript://oauth/callback",
        "data://oauth/callback",
        "file://oauth/callback",
        "exp://oauth/callback",
        "exps://oauth/callback",
        "aitpl-app://oauth/wrong",
        "aitpl-app://oauth/callback/",
        "aitpl-app://oauth/callback?next=evil",
        "aitpl-app://oauth/callback#part",
        "aitpl-*://oauth/callback",
        "aitpl-app://user@oauth/callback",
        "https://*.example.com/oauth/callback",
        "https://user:pass@example.com/callback",  # betterleaks:allow
    ],
)
def test_rejects_unsafe_callback(value: str) -> None:
    assert not valid_oauth_callback(value)
    with pytest.raises(ValidationError):
        TypeAdapter(OAuthRedirectUris).validate_python(value)
