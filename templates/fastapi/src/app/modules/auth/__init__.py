"""auth 모듈의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다."""

from app.modules.auth.events import EVENTS
from app.modules.auth.jobs import JOBS
from app.modules.auth.router.accounts import registrations, verification_requests, verifications
from app.modules.auth.router.passwords import changes, reset_requests, resets
from app.modules.auth.router.sessions import revocations, sessions
from app.modules.auth.service.credentials import (
    IssuedTokens,
    authenticate,
    close_credentials,
    open_session,
    session_principal,
)

ROUTERS = (
    registrations,
    verification_requests,
    verifications,
    sessions,
    revocations,
    reset_requests,
    resets,
    changes,
)

__all__ = [
    "EVENTS",
    "JOBS",
    "ROUTERS",
    "IssuedTokens",
    "authenticate",
    "close_credentials",
    "open_session",
    "session_principal",
]
