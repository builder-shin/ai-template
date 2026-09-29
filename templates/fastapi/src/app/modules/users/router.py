"""내 정보(Me)와 사용자 관리(Users) API. 사용자 문서의 조립(관계, 포함 리소스)도 여기서 한다."""

import uuid
from collections.abc import Awaitable, Callable, Iterable, Sequence
from typing import Annotated, Literal

from fastapi import Depends, Path, Request, Response
from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.service.accounts as accounts
import app.modules.users.service.management as management
import app.modules.users.service.profile as profile
from app.core.access import PermissionsDep, Principal, PrincipalDep
from app.core.clients import ClientDep
from app.core.db import SessionDep
from app.core.jsonapi.errors import require_matching_id
from app.core.jsonapi.media import JsonApiBody
from app.core.jsonapi.models import CollectionMeta, ResourceIdentifier, ToMany
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CONFLICT,
    NOT_FOUND,
    CollectionOperation,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.query import CollectionQuery, ResourceQuery
from app.core.jsonapi.rendering import load_included, pagination, render
from app.core.permissions import PermissionRegistry
from app.core.storage import Storage, StorageDep
from app.modules import files, roles
from app.modules.users.models import User
from app.modules.users.permissions import USERS_MANAGE, USERS_READ
from app.modules.users.schemas import (
    UserAttributes,
    UserCollectionDocument,
    UserDocument,
    UserFilter,
    UserMeDocument,
    UserMeDocumentMeta,
    UserMeUpdateDocument,
    UserRelationships,
    UserResource,
    UserUpdateDocument,
)

me = JsonApiRouter(prefix="/me", tag="me", interface="Me")
users = JsonApiRouter(prefix="/users", tag="users", interface="Users")

USER_INCLUDE = ("roles", "avatar")
USER_FIELDS = ("users", "roles", "files")
GET_ME = Operation(
    name="get", errors=AUTH_ERRORS + COMMON_ERRORS, include=USER_INCLUDE, fields=USER_FIELDS
)
UPDATE_ME = Operation(
    name="update", errors=AUTH_ERRORS + NOT_FOUND + CONFLICT + BODY_ERRORS + COMMON_ERRORS
)
DELETE_ME = Operation(
    name="delete",
    status_code=204,
    errors=AUTH_ERRORS + COMMON_ERRORS,
    description=(
        "회원 탈퇴. 개인정보를 익명화하고 모든 세션을 폐기한다. 로그인한 지 10분 안의 세션만 "
        "할 수 있다. 지났으면 401 auth.reauthentication_required이고, 다시 로그인해 받은 새 "
        "세션으로 부른다(refresh로는 풀리지 않는다)."
    ),
)
LIST = CollectionOperation(
    name="list",
    permission=USERS_READ.code,
    errors=AUTH_ERRORS + COMMON_ERRORS,
    include=USER_INCLUDE,
    fields=USER_FIELDS,
    sort=("createdAt", "name", "email"),
    filter=UserFilter,
)
GET = Operation(
    name="get",
    permission=USERS_READ.code,
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
    include=USER_INCLUDE,
    fields=USER_FIELDS,
)
UPDATE = Operation(
    name="update",
    permission=USERS_MANAGE.code,
    errors=AUTH_ERRORS + NOT_FOUND + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
    description="상태(비활성화)와 역할을 바꾼다.",
)
UserId = Annotated[uuid.UUID, Path(alias="id")]
Included = roles.RoleResource | files.FileResource


def user_resource(user: User, held: Sequence[roles.Role]) -> UserResource:
    """전체 속성의 사용자 리소스."""
    role_ids = [
        ResourceIdentifier[Literal["roles"]](type="roles", id=str(role.id)) for role in held
    ]
    return UserResource(
        type="users",
        id=str(user.id),
        attributes=UserAttributes(
            email=user.email,
            name=user.name,
            locale=user.locale,
            status=user.status,
            email_verified_at=user.email_verified_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
        ),
        relationships=UserRelationships(
            roles=ToMany[Literal["roles"]](data=role_ids),
            avatar=accounts.avatar_of(user),
        ),
    )


async def included_for(
    session: AsyncSession,
    storage: Storage,
    registry: PermissionRegistry,
    include: Iterable[str],
    found: Iterable[User],
    held: Iterable[roles.Role],
) -> list[Included]:
    """include 경로마다 포함 리소스. 역할은 사용자들이 가진 것, 아바타는 사용자들의 아바타다."""

    async def role_resources() -> list[Included]:
        return [roles.role_resource(role, registry) for role in held]

    async def avatars() -> list[Included]:
        avatar_ids = [user.avatar_id for user in found if user.avatar_id is not None]
        return list(await files.file_resources(session, storage, avatar_ids))

    loaders: dict[str, Callable[[], Awaitable[list[Included]]]] = {
        "roles": role_resources,
        "avatar": avatars,
    }
    return await load_included(include, loaders)


async def me_document(
    session: AsyncSession,
    storage: Storage,
    registry: PermissionRegistry,
    actor: Principal,
    include: Sequence[str] = (),
) -> UserMeDocument:
    user = await accounts.require_user(session, actor.user_id)
    held = (await roles.roles_by_user(session, [user.id]))[user.id]
    permissions = [roles.PermissionCode(code) for code in sorted(actor.permissions)]
    return UserMeDocument(
        data=user_resource(user, held),
        included=await included_for(session, storage, registry, include, [user], held),
        meta=UserMeDocumentMeta(permissions=permissions),
    )


@me.route("GET", "", GET_ME, response_model=UserMeDocument)
async def get_me(
    session: SessionDep,
    storage: StorageDep,
    registry: PermissionsDep,
    actor: PrincipalDep,
    query: Annotated[ResourceQuery, Depends(GET_ME)],
) -> Response:
    document = await me_document(session, storage, registry, actor, query.include)
    return render(document, fields=query.fields)


@me.route("PATCH", "", UPDATE_ME, response_model=UserMeDocument)
async def update_me(
    session: SessionDep,
    storage: StorageDep,
    registry: PermissionsDep,
    actor: PrincipalDep,
    document: JsonApiBody[UserMeUpdateDocument],
) -> Response:
    data = document.data
    require_matching_id(data.id, actor.user_id)
    avatar: str | MISSING | None = MISSING
    if data.relationships is not MISSING and data.relationships.avatar is not MISSING:
        identifier = data.relationships.avatar.data
        avatar = None if identifier is None else identifier.id
    attributes = data.attributes
    name = locale = None
    if attributes is not MISSING:
        name = None if attributes.name is MISSING else attributes.name
        locale = None if attributes.locale is MISSING else attributes.locale
    await profile.update_me(session, storage, actor, name=name, locale=locale, avatar=avatar)
    return render(await me_document(session, storage, registry, actor))


@me.route("DELETE", "", DELETE_ME, response_model=None)
async def delete_me(
    session: SessionDep, storage: StorageDep, actor: PrincipalDep, client: ClientDep
) -> Response:
    await profile.delete_me(session, storage, actor, client)
    return Response(status_code=204)


async def user_document(
    session: AsyncSession,
    storage: Storage,
    registry: PermissionRegistry,
    user: User,
    include: Sequence[str] = (),
) -> UserDocument:
    held = (await roles.roles_by_user(session, [user.id]))[user.id]
    included = await included_for(session, storage, registry, include, [user], held)
    return UserDocument(data=user_resource(user, held), included=included)


@users.route("GET", "", LIST, response_model=UserCollectionDocument)
async def list_users(
    request: Request,
    session: SessionDep,
    storage: StorageDep,
    registry: PermissionsDep,
    query: Annotated[CollectionQuery[UserFilter], Depends(LIST)],
) -> Response:
    wanted = query.filter
    found, total = await management.list_users(
        session,
        q=None if wanted.q is MISSING else wanted.q,
        status=None if wanted.status is MISSING else wanted.status,
        role_id=None if wanted.role is MISSING else wanted.role,
        sort=query.sort,
        window=query.page,
    )
    held = await roles.roles_by_user(session, [user.id for user in found])
    links, page = pagination(request, query.page, total)
    every_role = [role for user in found for role in held[user.id]]
    document = UserCollectionDocument(
        data=[user_resource(user, held[user.id]) for user in found],
        included=await included_for(session, storage, registry, query.include, found, every_role),
        links=links,
        meta=CollectionMeta(page=page),
    )
    return render(document, fields=query.fields)


@users.route("GET", "/{id}", GET, response_model=UserDocument)
async def get_user(
    user_id: UserId,
    session: SessionDep,
    storage: StorageDep,
    registry: PermissionsDep,
    query: Annotated[ResourceQuery, Depends(GET)],
) -> Response:
    user = await accounts.require_user(session, user_id)
    document = await user_document(session, storage, registry, user, query.include)
    return render(document, fields=query.fields)


@users.route("PATCH", "/{id}", UPDATE, response_model=UserDocument)
async def update_user(
    user_id: UserId,
    session: SessionDep,
    storage: StorageDep,
    registry: PermissionsDep,
    actor: PrincipalDep,
    client: ClientDep,
    document: JsonApiBody[UserUpdateDocument],
) -> Response:
    data = document.data
    require_matching_id(data.id, user_id)
    status = None
    if data.attributes is not MISSING and data.attributes.status is not MISSING:
        status = data.attributes.status
    role_ids = None
    if data.relationships is not MISSING and data.relationships.roles is not MISSING:
        role_ids = [identifier.id for identifier in data.relationships.roles.data]
    user = await management.update_user(
        session, registry, actor, client, user_id, status=status, role_ids=role_ids
    )
    return render(await user_document(session, storage, registry, user))
