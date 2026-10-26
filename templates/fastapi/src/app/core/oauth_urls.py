"""웹과 네이티브 OAuth 콜백의 설정 정책. 실제 authorize는 정확한 allowlist도 확인한다."""

import re
from urllib.parse import urlsplit

_RESERVED = frozenset(
    {
        "http",
        "https",
        "javascript",
        "data",
        "file",
        "exp",
        "exps",
        "intent",
        "about",
        "chrome",
        "blob",
        "content",
        "ftp",
        "ws",
        "wss",
        "mailto",
        "tel",
    }
)


def valid_oauth_callback(value: str) -> bool:
    """주소 바이트를 바꾸지 않고 HTTP(S) 또는 고정 앱 콜백만 허용한다."""
    if re.search(r"[\s\x00-\x1f\x7f\\*]", value):
        return False
    if re.match(r"https?://", value, re.IGNORECASE):
        try:
            parts = urlsplit(value)
            _ = parts.port
            return bool(parts.hostname) and parts.username is None and parts.password is None
        except ValueError:
            return False
    native = re.fullmatch(r"([a-z][a-z0-9+.-]{1,63})://oauth/callback", value)
    return native is not None and native[1] not in _RESERVED
