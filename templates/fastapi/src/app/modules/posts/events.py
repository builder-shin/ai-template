"""posts의 실시간 채널과 이벤트(계약의 x-realtime-channels, x-realtime-events).

- 채널 posts는 발행된 글의 이벤트다. 익명 연결도 구독한다.
- 채널 posts:all은 모든 글의 이벤트다.
  구독하려면 posts:manage가 있어야 한다.
- 작성자의 user:{id} 룸에도 보낸다.
- service가 쓰기의 commit 전에 이벤트를 넣는다(queue). 페이로드는 commit한 뒤에 만든다.
  - 만들면 post.created다.
    발행 상태로 만들면 post.published도 보낸다.
  - 발행하면(draft → published) post.published다.
  - 그 밖의 변경은 post.updated다.
    고친 뒤 발행된 글이면 posts에도 보낸다.
  - 지우면 post.deleted다.
    발행된 글이었으면 posts에도 보낸다.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.models import Document, JsonApiModel, ResourceIdentifier
from app.core.jsonapi.rendering import document_content
from app.core.realtime import Channel, ConditionalRoom, EventSpec, PayloadBuilder, queue, user_room
from app.modules.posts.models import Post, PostStatus
from app.modules.posts.permissions import POSTS_MANAGE
from app.modules.posts.schemas import (
    PostCreatedEventDocument,
    PostDeletedEventDocument,
    PostPublishedEventDocument,
    PostResource,
    PostType,
    PostUpdatedEventDocument,
    post_resource,
)

PUBLIC_CHANNEL = Channel("posts", None, "발행된 글의 이벤트. 익명 연결도 구독할 수 있다.")
ALL_CHANNEL = Channel("posts:all", POSTS_MANAGE.code, "모든 글의 이벤트.")
CHANNELS = (PUBLIC_CHANNEL, ALL_CHANNEL)

CREATED = "post.created"
UPDATED = "post.updated"
PUBLISHED = "post.published"
DELETED = "post.deleted"
AUTHOR_ROOM = "user:{authorId}"  # 계약의 표기. 실제 룸은 user_room(작성자 id)이다.
PRIVATE_ROOMS = (ALL_CHANNEL.name, AUTHOR_ROOM)

EVENTS = (
    EventSpec(CREATED, PRIVATE_ROOMS, PostCreatedEventDocument),
    EventSpec(
        UPDATED,
        PRIVATE_ROOMS,
        PostUpdatedEventDocument,
        (ConditionalRoom(PUBLIC_CHANNEL.name, "published"),),
    ),
    EventSpec(PUBLISHED, (PUBLIC_CHANNEL.name, *PRIVATE_ROOMS), PostPublishedEventDocument),
    EventSpec(
        DELETED,
        PRIVATE_ROOMS,
        PostDeletedEventDocument,
        (ConditionalRoom(PUBLIC_CHANNEL.name, "wasPublished"),),
    ),
)


def _rooms(post: Post, *, public: bool) -> list[str]:
    rooms = [ALL_CHANNEL.name, user_room(post.author_id)]
    return [PUBLIC_CHANNEL.name, *rooms] if public else rooms


def _document(model: type[Document[PostResource]], post: Post) -> PayloadBuilder:
    return lambda: document_content(model(data=post_resource(post)))


def created(session: AsyncSession, post: Post) -> None:
    queue(session, CREATED, _rooms(post, public=False), _document(PostCreatedEventDocument, post))
    if post.status is PostStatus.PUBLISHED:
        published(session, post)


def published(session: AsyncSession, post: Post) -> None:
    queue(
        session, PUBLISHED, _rooms(post, public=True), _document(PostPublishedEventDocument, post)
    )


def updated(session: AsyncSession, post: Post, *, was: PostStatus) -> None:
    """고친 글을 알린다.

    초안에서 발행으로 바뀌었으면 post.published다.
    그 밖에는 post.updated다.
    """
    public = post.status is PostStatus.PUBLISHED
    if public and was is not PostStatus.PUBLISHED:
        published(session, post)
        return
    queue(session, UPDATED, _rooms(post, public=public), _document(PostUpdatedEventDocument, post))


def deleted(session: AsyncSession, post: Post) -> None:
    identifier = ResourceIdentifier[PostType](type="posts", id=str(post.id))
    document: JsonApiModel = PostDeletedEventDocument(data=identifier)
    public = post.status is PostStatus.PUBLISHED
    queue(session, DELETED, _rooms(post, public=public), lambda: document_content(document))
