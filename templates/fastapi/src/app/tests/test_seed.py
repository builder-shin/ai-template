"""시드: 시스템 역할, 관리자 계정, 예제 글을 만들고, 다시 돌려도 아무것도 바꾸지 않는다."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.security import check_password
from app.modules.posts import Post
from app.modules.roles import Role, UserRole
from app.modules.users import User
from app.seed import seed

pytestmark = pytest.mark.anyio


async def test_seed_creates_system_roles_the_admin_and_example_posts_once(
    db: async_sessionmaker[AsyncSession], infra: Settings
) -> None:
    settings = infra.model_copy(update={"seed_admin_email": " Admin@Example.COM "})
    assert await seed(db, settings) == [
        "역할 admin",
        "역할 member",
        "관리자 admin@example.com",
        "글 환영합니다",
        "글 마크다운으로 쓰기",
        "글 초안",
    ]
    assert await seed(db, settings) == []
    async with db() as session:
        roles = {role.name: role for role in await session.scalars(select(Role))}
        admin = await session.scalar(select(User).where(User.email == "admin@example.com"))
        assert admin is not None
        granted = await session.scalars(
            select(UserRole.role_id).where(UserRole.user_id == admin.id)
        )
        assert list(granted) == [roles["admin"].id]
        statuses = sorted(
            post.status
            for post in await session.scalars(select(Post).where(Post.author_id == admin.id))
        )
        assert statuses == ["draft", "published", "published"]
    assert (roles["admin"].is_system, roles["member"].is_system) == (True, True)
    assert roles["member"].permissions == ["posts:create"]
    assert admin.email_verified_at is not None
    assert check_password(infra.seed_admin_password.get_secret_value(), admin.password_hash)
