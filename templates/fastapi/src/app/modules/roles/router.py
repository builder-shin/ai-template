"""역할(Roles)과 권한(Permissions) API. 권한 선언은 각 operation의 permission이다."""

import uuid
from typing import Annotated

from fastapi import Depends, Path, Request, Response
from pydantic.experimental.missing_sentinel import MISSING

import app.modules.roles.service as service
from app.core.access import PermissionsDep, PrincipalDep
from app.core.clients import ClientDep
from app.core.db import SessionDep
from app.core.jsonapi.errors import require_matching_id
from app.core.jsonapi.media import JsonApiBody
from app.core.jsonapi.models import CollectionMeta
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CONFLICT,
    CREATE_ERRORS,
    NOT_FOUND,
    CollectionOperation,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.query import CollectionQuery, NoFilter, ResourceQuery
from app.core.jsonapi.rendering import pagination, render
from app.modules.roles.permissions import ROLES_MANAGE, ROLES_READ
from app.modules.roles.schemas import (
    PermissionCollectionDocument,
    RoleCollectionDocument,
    RoleCreateDocument,
    RoleDocument,
    RoleFilter,
    RoleUpdateDocument,
)

roles = JsonApiRouter(prefix="/roles", tag="roles", interface="Roles")
permissions = JsonApiRouter(prefix="/permissions", tag="permissions", interface="Permissions")

ROLE_FIELDS = ("roles",)
LIST = CollectionOperation(
    name="list",
    permission=ROLES_READ.code,
    errors=AUTH_ERRORS + COMMON_ERRORS,
    fields=ROLE_FIELDS,
    sort=("name", "createdAt"),
    filter=RoleFilter,
)
CREATE = Operation(
    name="create",
    status_code=201,
    permission=ROLES_MANAGE.code,
    errors=AUTH_ERRORS + CREATE_ERRORS + BODY_ERRORS + COMMON_ERRORS,
)
GET = Operation(
    name="get",
    permission=ROLES_READ.code,
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
    fields=ROLE_FIELDS,
)
UPDATE = Operation(
    name="update",
    permission=ROLES_MANAGE.code,
    errors=AUTH_ERRORS + NOT_FOUND + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
)
DELETE = Operation(
    name="delete",
    status_code=204,
    permission=ROLES_MANAGE.code,
    errors=AUTH_ERRORS + NOT_FOUND + (422,) + COMMON_ERRORS,
    description="시스템 역할은 지울 수 없다(role.system_role_protected, 422).",
)
PERMISSIONS_LIST = CollectionOperation(
    name="list",
    permission=ROLES_READ.code,
    errors=AUTH_ERRORS + COMMON_ERRORS,
    fields=("permissions",),
    sort=("id",),
    filter=NoFilter,
)
RoleId = Annotated[uuid.UUID, Path(alias="id")]


@roles.route("GET", "", LIST, response_model=RoleCollectionDocument)
async def list_roles(
    request: Request,
    session: SessionDep,
    registry: PermissionsDep,
    query: Annotated[CollectionQuery[RoleFilter], Depends(LIST)],
) -> Response:
    name_contains = None if query.filter.q is MISSING else query.filter.q
    found, total = await service.list_roles(session, name_contains, query.sort, query.page)
    links, page = pagination(request, query.page, total)
    document = RoleCollectionDocument(
        data=[service.role_resource(role, registry) for role in found],
        links=links,
        meta=CollectionMeta(page=page),
    )
    return render(document, fields=query.fields)


@roles.route("POST", "", CREATE, response_model=RoleDocument)
async def create_role(
    session: SessionDep,
    registry: PermissionsDep,
    actor: PrincipalDep,
    client: ClientDep,
    document: JsonApiBody[RoleCreateDocument],
) -> Response:
    role = await service.create_role(session, actor, client, document.data.attributes)
    return render(RoleDocument(data=service.role_resource(role, registry)), status_code=201)


@roles.route("GET", "/{id}", GET, response_model=RoleDocument)
async def get_role(
    role_id: RoleId,
    session: SessionDep,
    registry: PermissionsDep,
    query: Annotated[ResourceQuery, Depends(GET)],
) -> Response:
    role = await service.get_role(session, role_id)
    return render(RoleDocument(data=service.role_resource(role, registry)), fields=query.fields)


@roles.route("PATCH", "/{id}", UPDATE, response_model=RoleDocument)
async def update_role(
    role_id: RoleId,
    session: SessionDep,
    registry: PermissionsDep,
    actor: PrincipalDep,
    client: ClientDep,
    document: JsonApiBody[RoleUpdateDocument],
) -> Response:
    require_matching_id(document.data.id, role_id)
    role = await service.get_role(session, role_id)
    if document.data.attributes is not MISSING:
        role = await service.update_role(
            session, registry, actor, client, role, document.data.attributes
        )
    return render(RoleDocument(data=service.role_resource(role, registry)))


@roles.route("DELETE", "/{id}", DELETE, response_model=None)
async def delete_role(
    role_id: RoleId,
    session: SessionDep,
    registry: PermissionsDep,
    actor: PrincipalDep,
    client: ClientDep,
) -> Response:
    role = await service.get_role(session, role_id)
    await service.delete_role(session, registry, actor, client, role)
    return Response(status_code=204)


@permissions.route("GET", "", PERMISSIONS_LIST, response_model=PermissionCollectionDocument)
async def list_permissions(
    request: Request,
    registry: PermissionsDep,
    query: Annotated[CollectionQuery[NoFilter], Depends(PERMISSIONS_LIST)],
) -> Response:
    found, total = service.list_permissions(registry, query.sort, query.page)
    links, page = pagination(request, query.page, total)
    document = PermissionCollectionDocument(
        data=[service.permission_resource(permission) for permission in found],
        links=links,
        meta=CollectionMeta(page=page),
    )
    return render(document, fields=query.fields)
