"""auth가 보내는 메일. 템플릿은 auth/templates/<로케일>/<메일>.subject.txt, .txt, .html이다.

링크는 설정의 프론트 주소(FRONTEND_URL)에 경로와 ?token=을 붙인다. 적합성 스위트가 이 형식으로
토큰을 꺼낸다. 프론트는 이 경로에서 토큰을 받아 API를 부른다.
"""

from pathlib import Path

from app.core.config import Settings
from app.core.mail import Mail, MailTemplates
from app.modules.users import User

TEMPLATES = MailTemplates(Path(__file__).resolve().parents[1] / "templates")
VERIFY_PATH = "/verify-email"
RESET_PATH = "/reset-password"


def link(settings: Settings, path: str, token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}?token={token}"


def _render(user: User, template: str, **context: object) -> Mail:
    if user.email is None:
        raise ValueError("이메일이 없는 계정에는 메일을 보내지 않는다.")
    return TEMPLATES.render(
        template, locale=user.locale, to=user.email, name=user.name or "", **context
    )


def verification(settings: Settings, user: User, token: str) -> Mail:
    return _render(user, "verify_email", link=link(settings, VERIFY_PATH, token))


def welcome(settings: Settings, user: User) -> Mail:
    return _render(user, "welcome", link=settings.frontend_url)


def password_reset(settings: Settings, user: User, token: str) -> Mail:
    return _render(user, "reset_password", link=link(settings, RESET_PATH, token))
