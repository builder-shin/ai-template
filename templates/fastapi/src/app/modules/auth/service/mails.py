"""auth가 보내는 메일(인증, 재설정, 환영). 잡(auth/jobs.py)이 사용자 id를 받아 여기의 함수를 부른다.

- 잡 인자는 사용자 id뿐이다. 받는 사람의 주소와 이름, 1회용 토큰은 잡이 실행될 때 DB에서 읽거나
  발급한다. 그래서 큐(Valkey의 스트림과 재시도 스케줄)에 개인정보와 토큰이 머물지 않는다.
- 보낼 조건(활성이고 이메일이 있음, 인증 메일은 아직 인증 전)은 잡이 실행될 때 다시 본다.
  맞지 않으면 보내지 않고 끝낸다.
- 토큰은 발급해 commit한 뒤에 보낸다. commit 전에 보내면 DB에 없는 토큰이 메일로 나갈 수 있다.
  보내다 실패하면 잡이 재시도하며 새 토큰을 발급한다. 앞 시도의 토큰은 메일로 나가지 않았고,
  만료되면 정리 잡이 지운다.
- 템플릿은 auth/templates/<로케일>/<메일>.subject.txt, .txt, .html이다. 링크는 설정의 프론트
  주소(FRONTEND_URL)에 경로와 ?token=을 붙인다. 적합성 스위트가 이 형식으로 토큰을 꺼낸다.
"""

import uuid
from pathlib import Path

import app.modules.auth.service.tokens as tokens
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jobs import JobContext
from app.core.mail import Mail, MailTemplates, send
from app.modules import users
from app.modules.auth.models import TokenPurpose

TEMPLATES = MailTemplates(Path(__file__).resolve().parents[1] / "templates")
VERIFY_PATH = "/verify-email"
RESET_PATH = "/reset-password"


def link(settings: Settings, path: str, token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}?token={token}"


def _render(user: users.User, template: str, **context: object) -> Mail:
    if user.email is None:
        raise ValueError("이메일이 없는 계정에는 메일을 보내지 않는다.")
    return TEMPLATES.render(
        template, locale=user.locale, to=user.email, name=user.name or "", **context
    )


def _reachable(user: users.User) -> bool:
    """메일을 받을 수 있는 계정인가: 활성이고 이메일이 있다."""
    return user.status == users.UserStatus.ACTIVE and user.email is not None


async def send_verification(context: JobContext, user_id: uuid.UUID) -> None:
    """인증 메일. 아직 인증하지 않은 계정에만 보낸다."""
    async with context.sessions() as session:
        user = await users.get_account(session, user_id)
        if user is None or not _reachable(user) or user.email_verified_at is not None:
            return
        token = tokens.issue(session, user.id, TokenPurpose.EMAIL_VERIFICATION, utc_now())
        mail = _render(user, "verify_email", link=link(context.settings, VERIFY_PATH, token))
        await session.commit()
    await send(context.settings, mail)


async def send_password_reset(context: JobContext, user_id: uuid.UUID) -> None:
    """비밀번호 재설정 메일."""
    async with context.sessions() as session:
        user = await users.get_account(session, user_id)
        if user is None or not _reachable(user):
            return
        token = tokens.issue(session, user.id, TokenPurpose.PASSWORD_RESET, utc_now())
        mail = _render(user, "reset_password", link=link(context.settings, RESET_PATH, token))
        await session.commit()
    await send(context.settings, mail)


async def send_welcome(context: JobContext, user_id: uuid.UUID) -> None:
    """환영 메일. 이메일 인증을 처음 마쳤을 때 보낸다."""
    async with context.sessions() as session:
        user = await users.get_account(session, user_id)
        if user is None or not _reachable(user):
            return
        mail = _render(user, "welcome", link=context.settings.frontend_url)
    await send(context.settings, mail)
