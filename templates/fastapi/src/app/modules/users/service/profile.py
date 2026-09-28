"""내 정보(/me)의 유스케이스: 이름·로케일·아바타 바꾸기와 탈퇴.

- 아바타는 내가 올린 ready 이미지 파일이어야 한다(files.attachable_file). null이면 아바타를 뺀다.
"""

from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.service.accounts as accounts
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.modules import files, roles
from app.modules.users.models import Locale, User, UserStatus

AVATAR_POINTER = "/data/relationships/avatar/data"


async def update_me(
    session: AsyncSession,
    actor: Principal,
    *,
    name: str | None = None,
    locale: Locale | None = None,
    avatar: str | MISSING | None = MISSING,
) -> User:
    """내 이름, 로케일, 아바타를 바꾼다. None인 이름·로케일과 MISSING인 아바타는 그대로 둔다.

    avatar는 파일 id이고, None이면 아바타를 뺀다.
    """
    user = await accounts.require_user(session, actor.user_id)
    if avatar is not MISSING:
        if avatar is None:
            user.avatar_id = None
        else:
            file = await files.attachable_file(session, actor, avatar, pointer=AVATAR_POINTER)
            user.avatar_id = file.id
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
