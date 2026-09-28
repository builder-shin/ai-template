"""이름 규칙: 복수형 kebab-case 이름에서 모든 표기를 만들고, 골든 모듈의 이름을 바꾼다."""

import re
from dataclasses import dataclass
from typing import Literal

# 이름이 길면 바꾼 문자열과 주석이 줄 길이(100)를 넘는다. 테스트가 이 길이의 이름으로 확인한다.
# 단수형(--singular로 준 것 포함)도 이 길이를 넘지 않는다.
MAX_NAME = 20
_NAME = re.compile(r"[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*")
_WORD = re.compile(r"[a-z][a-z0-9]*")
# 골든 모듈의 이름. 대문자(POSTS, POST), Pascal(Posts, Post), 소문자(posts, post) 순으로 찾는다.
_GOLDEN_WORD = re.compile(
    r"(?<![A-Za-z0-9])(?P<upper>POSTS?)(?![A-Za-z0-9])"
    r"|(?P<pascal>Posts?)(?![a-z])"
    r"|(?<![A-Za-z0-9])posts?(?![a-z0-9])"
)
# 계약에 정의된 posts의 값(에러 코드 post.invalid_transition, 감사 행위 post.deleted_by_admin).
# 새 모듈은 계약에 제 값을 더하기 전까지 이 값을 쓰므로 문서와 테스트에서도 바꾸지 않는다.
CONTRACT_SUFFIXES = (".invalid_transition", ".deleted_by_admin")

type Mode = Literal["name", "text", "table"]


class GenerateError(Exception):
    """만들 수 없다. 메시지는 고치는 방법을 담는다."""


@dataclass(frozen=True, slots=True)
class Names:
    kebab: str  # comments, blog-posts
    kebab_one: str  # comment, blog-post
    snake: str  # comments, blog_posts
    snake_one: str  # comment, blog_post
    pascal: str  # Comments, BlogPosts
    pascal_one: str  # Comment, BlogPost
    upper: str  # COMMENTS, BLOG_POSTS
    upper_one: str  # COMMENT, BLOG_POST


def singular(word: str) -> str | None:
    """영어 복수형의 단수형. 복수형이 아니면 None이다."""
    if word.endswith("ies") and len(word) > 3:
        return word[:-3] + "y"
    if word.endswith(("sses", "xes", "ches", "shes")):
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss") and len(word) > 1:
        return word[:-1]
    return None


def names_for(name: str, singular_form: str | None = None) -> Names:
    if not _NAME.fullmatch(name):
        raise GenerateError(
            f"{name}: 이름은 영어 소문자 복수형 kebab-case로 쓴다(예: comments, blog-posts)."
        )
    if len(name) > MAX_NAME:
        raise GenerateError(f"{name}: 이름은 {MAX_NAME}자 이하로 쓴다.")
    words = name.split("-")
    last = singular_form or singular(words[-1])
    if last is None or not _WORD.fullmatch(last) or last == words[-1]:
        raise GenerateError(
            f"{name}: 복수형으로 쓴다. 단수형이 규칙과 다르면 --singular로 끝 단어의 단수형을 준다."
        )
    ones = [*words[:-1], last]
    if len("-".join(ones)) > MAX_NAME:
        raise GenerateError(f"{name}: 단수형({'-'.join(ones)})도 {MAX_NAME}자 이하로 쓴다.")
    return Names(
        kebab=name,
        kebab_one="-".join(ones),
        snake="_".join(words),
        snake_one="_".join(ones),
        pascal="".join(word.capitalize() for word in words),
        pascal_one="".join(word.capitalize() for word in ones),
        upper="_".join(word.upper() for word in words),
        upper_one="_".join(word.upper() for word in ones),
    )


def rename(value: str, names: Names, mode: Mode) -> str:
    """골든 모듈의 이름(posts, post, Posts, Post, POSTS, POST)을 새 이름으로 바꾼다.

    - name(식별자): snake, Pascal, UPPER.
    - text(문자열과 주석): 리소스 이름(type, 경로, 권한 코드)은 kebab이고, `_`에 붙은 식별자
      (posts_cache)는 snake다. 대문자 단어(HTTP 메서드 "POST")와 계약의 값은 바꾸지 않는다.
    - table(테이블과 제약 이름): snake.
    한 번에 바꾸므로 새 이름에 post가 들어 있어도(blog-posts) 다시 바뀌지 않는다.
    """

    def replace(found: re.Match[str]) -> str:
        word = found.group()
        plural = word.lower() == "posts"
        if found.group("upper"):
            if mode != "name":
                return word
            return names.upper if plural else names.upper_one
        if found.group("pascal"):
            return names.pascal if plural else names.pascal_one
        start, end = found.span()
        if mode == "text" and value.startswith(CONTRACT_SUFFIXES, end) and not plural:
            return word
        joined = "_" in (value[start - 1 : start], value[end : end + 1])
        if mode == "text" and not joined:
            return names.kebab if plural else names.kebab_one
        return names.snake if plural else names.snake_one

    if mode == "table":  # SQLAlchemy가 enum 이름을 클래스 이름으로 짓는다(PostStatus → poststatus)
        value = value.replace("poststatus", f"{names.pascal_one.lower()}status")
    return _GOLDEN_WORD.sub(replace, value)
