"""글의 도메인 규칙(순수 함수): 전이 표, 보기와 고치기, 목록의 초안."""

import uuid
from datetime import UTC, datetime

import pytest

from app.core.access import Principal
from app.modules.posts.models import Post, PostStatus
from app.modules.posts.policies import can_edit, can_transition, can_view, sees_drafts

DRAFT, PUBLISHED = PostStatus.DRAFT, PostStatus.PUBLISHED
AUTHOR = uuid.uuid7()


def principal(user_id: uuid.UUID | None = None, *permissions: str) -> Principal:
    return Principal(
        user_id=user_id or uuid.uuid7(),
        session_id=uuid.uuid7(),
        permissions=frozenset(permissions),
        logged_in_at=datetime.now(UTC),
    )


def post(status: PostStatus) -> Post:
    return Post(author_id=AUTHOR, title="제목", body="본문", status=status)


@pytest.mark.parametrize(
    ("current", "wanted"),
    [(DRAFT, DRAFT), (DRAFT, PUBLISHED), (PUBLISHED, DRAFT), (PUBLISHED, PUBLISHED)],
)
def test_draft_and_published_go_both_ways(current: PostStatus, wanted: PostStatus) -> None:
    assert can_transition(current, wanted)


def test_a_transition_missing_from_the_table_is_refused() -> None:
    publish_only = {(DRAFT, PUBLISHED)}
    assert not can_transition(PUBLISHED, DRAFT, publish_only)
    assert can_transition(PUBLISHED, PUBLISHED, publish_only)


VIEWERS = {
    "anonymous": None,
    "author": principal(AUTHOR, "posts:create"),
    "member": principal(None, "posts:create"),
    "manager": principal(None, "posts:manage"),
}


@pytest.mark.parametrize(
    ("viewer", "views_draft", "edits"),
    [
        ("anonymous", False, False),
        ("author", True, True),
        ("member", False, False),
        ("manager", True, True),
    ],
)
def test_who_views_and_edits(viewer: str, views_draft: bool, edits: bool) -> None:
    who = VIEWERS[viewer]
    assert can_view(post(PUBLISHED), who)
    assert can_view(post(DRAFT), who) is views_draft
    assert (can_edit(post(DRAFT), who), can_edit(post(PUBLISHED), who)) == (edits, edits)


def test_drafts_show_in_a_list_for_managers_and_for_my_own_posts() -> None:
    assert sees_drafts(VIEWERS["manager"], None)
    assert sees_drafts(VIEWERS["author"], AUTHOR)
    assert not sees_drafts(VIEWERS["author"], None)
    assert not sees_drafts(VIEWERS["member"], AUTHOR)
    assert not sees_drafts(None, AUTHOR)
