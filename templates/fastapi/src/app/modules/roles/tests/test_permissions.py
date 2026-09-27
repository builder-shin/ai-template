"""실제 권한: 역할의 권한을 합치고, admin은 등록된 모든 권한이며, 등록되지 않은 코드는 뺀다."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.permissions import Permission, PermissionRegistry
from app.modules.roles.models import ADMIN_ROLE, Role
from app.modules.roles.service import effective_permissions, role_permissions
from app.tests.accounts import Accounts

pytestmark = pytest.mark.anyio

REGISTRY = PermissionRegistry(
    [
        Permission("posts:create", "Write posts.", "posts"),
        Permission("users:read", "Read users.", "users"),
    ]
)


def test_admin_has_every_registered_permission() -> None:
    admin = Role(name=ADMIN_ROLE, permissions=[], is_system=True)
    assert role_permissions(admin, REGISTRY) == REGISTRY.codes()


def test_unregistered_codes_are_dropped() -> None:
    editor = Role(name="editor", permissions=["users:read", "gone:code"], is_system=False)
    assert role_permissions(editor, REGISTRY) == frozenset({"users:read"})


def test_a_role_named_admin_is_not_admin_unless_it_is_the_system_role() -> None:
    impostor = Role(name=ADMIN_ROLE, permissions=[], is_system=False)
    assert role_permissions(impostor, REGISTRY) == frozenset()


async def test_effective_permissions_join_every_role(
    db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    user = await accounts.create(permissions={"users:read"})
    async with db() as session:
        assert await effective_permissions(session, REGISTRY, user.id) == frozenset(
            {"posts:create", "users:read"}
        )
