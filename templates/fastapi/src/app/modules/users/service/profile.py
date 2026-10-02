"""내 정보(/me)의 유스케이스: 이름·로케일·아바타 바꾸기와 탈퇴.

- 아바타는 내가 올린 ready 이미지 파일이어야 한다(files.attachable_file). null이면 아바타를 뺀다.
  바꾸거나 뺀 아바타는 다른 리소스가 가리키지 않으면 지운다(files.release).
"""

import uuid
from datetime import timedelta

from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.events as events
import app.modules.users.service.accounts as accounts
from app.core.access import Principal, require_recent_login
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.core.config import Settings
from app.core.db import utc_now
from app.core.storage import Storage
from app.modules import files, roles
from app.modules.users.models import Locale, User, UserStatus

AVATAR_POINTER = "/data/relationships/avatar/data"


async def update_me(
    session: AsyncSession,
    storage: Storage,
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
    before = (user.name, user.locale, user.avatar_id)
    released: uuid.UUID | None = None
    if avatar is not MISSING:
        new_avatar = None
        if avatar is not None:
            file = await files.attachable_file(session, actor, avatar, pointer=AVATAR_POINTER)
            new_avatar = file.id
        if new_avatar != user.avatar_id:
            released = user.avatar_id
        user.avatar_id = new_avatar
    if name is not None:
        user.name = name
    if locale is not None:
        user.locale = locale
    if (user.name, user.locale, user.avatar_id) != before:
        events.me_updated(session, [user.id], ["profile"])
    keys = await files.release(session, [released])
    await session.commit()
    await files.delete_objects(storage, keys)
    return user


async def delete_me(
    session: AsyncSession, storage: Storage, actor: Principal, client: Client, settings: Settings
) -> None:
    """탈퇴(F3): 개인정보를 지우고 계정을 닫는다. 글처럼 남이 보는 콘텐츠는 남는다.

    한 트랜잭션에서 이메일·이름·비밀번호·아바타를 지우고 상태를 deleted로 바꾸고, 역할을
    빼고, 다른 리소스가 가리키지 않는 내 파일을 지우고, 계정 닫기 처리(세션 폐기, 남은 토큰
    삭제)를 부르고, 감사 로그 user.deleted를 남긴다. 파일의 객체는 commit한 뒤에 지운다.
    RECENT_LOGIN_SECONDS(기본 600초) 안에 로그인한 세션만 탈퇴할 수 있다.
    """
    require_recent_login(actor, utc_now(), window=timedelta(seconds=settings.recent_login_seconds))
    user = await accounts.require_user(session, actor.user_id)
    await accounts.protect_last_admin(session, user)
    user.email = None
    user.name = None
    user.password_hash = None
    user.avatar_id = None
    user.status = UserStatus.DELETED
    await session.flush()
    await roles.clear_roles(session, user.id)
    keys = await files.remove_unreferenced(session, user.id)
    await accounts.close_account(session, user.id, accounts.Closure.DELETED)
    await record_audit(
        session,
        AuditLogAction.USER_DELETED,
        actor_id=user.id,
        ip_address=client.ip,
        target=(AuditLogTargetType.USERS, user.id),
    )
    await session.commit()
    await files.delete_objects(storage, keys)
