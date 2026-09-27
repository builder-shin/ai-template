"""골든 모듈 posts의 공개 인터페이스.

권한은 M2부터 둔다(member 역할이 posts:create를 받는다). 나머지 계층은 M3에서 채운다.
"""

from app.modules.posts.permissions import PERMISSIONS, POSTS_CREATE, POSTS_MANAGE

__all__ = ["PERMISSIONS", "POSTS_CREATE", "POSTS_MANAGE"]
