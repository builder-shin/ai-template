"""내 정보(/me)의 유스케이스: 이름·로케일 바꾸기와 탈퇴."""

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.service.accounts as accounts
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.modules import roles
from app.modules.users.models import Locale, User, UserStatus


async def update_me(
    session: AsyncSession,
    actor: Principal,
    *,
    name: str | None = None,
    locale: Locale | None = None,
) -> User:
    """내 이름과 로케일을 바꾼다. None인 값은 그대로 둔다."""
    user = await accounts.require_user(session, actor.user_id)
    if name is not None:
        user.name = name
    if locale is not None:
        user.locale = locale
    await session.commit()
    return user


async def delete_me(session: AsyncSession, actor: Principal, client: Client) -> None:
    """탈퇴(F3): 개인정보를 지우고 계정을 닫는다. 글처럼 남이 보는 콘텐츠는 남는다.

    한 트랜잭션에서 이메일·이름·비밀번호를 지우고 상태를 deleted로 바꾸고, 역할을 빼고, 계정 닫기
    처리(세션 폐기, 남은 토큰 삭제)를 부르고, 감사 로그 user.deleted를 남긴다.
    """
    user = await accounts.require_user(session, actor.user_id)
    await accounts.protect_last_admin(session, user)
    user.email = None
    user.name = None
    user.password_hash = None
    user.status = UserStatus.DELETED
    await roles.clear_roles(session, user.id)
    await accounts.close_account(session, user.id, accounts.Closure.DELETED)
    await record_audit(
        session,
        AuditLogAction.USER_DELETED,
        actor_id=user.id,
        ip_address=client.ip,
        target=(AuditLogTargetType.USERS, user.id),
    )
    await session.commit()
