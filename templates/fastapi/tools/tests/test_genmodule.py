"""모듈 생성기(gen:module): 이름 규칙, 이름 바꾸기, 표시 처리, 프로젝트 사본에 만든 결과."""

import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pytest
from alembic.script import ScriptDirectory

from tools.genmodule.generate import generate, review_list
from tools.genmodule.names import MAX_NAME, GenerateError, Mode, Names, names_for, rename
from tools.genmodule.transform import transform_python

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 9, 28, 12, 0)
# 프로젝트에 있을 법하지 않은 이름을 쓴다. 사용자가 만든 모듈이 있어도 테스트가 같게 돈다.
# LONGEST는 가장 긴 이름이다. 바꾼 문자열과 주석도 줄 길이(100)를 넘지 않아야 한다.
LONGEST = "sample-gadget-probes"
SAMPLE = "sample-widgets"


def test_names_come_from_the_plural_kebab_case_name() -> None:
    assert names_for("blog-posts") == Names(
        kebab="blog-posts",
        kebab_one="blog-post",
        snake="blog_posts",
        snake_one="blog_post",
        pascal="BlogPosts",
        pascal_one="BlogPost",
        upper="BLOG_POSTS",
        upper_one="BLOG_POST",
    )
    singulars = {name: names_for(name).kebab_one for name in ("categories", "boxes", "comments")}
    assert singulars == {"categories": "category", "boxes": "box", "comments": "comment"}
    assert names_for("statuses", "status").pascal_one == "Status"
    assert len(LONGEST) == MAX_NAME


@pytest.mark.parametrize(
    ("name", "singular", "reason"),
    [
        ("Comments", None, "kebab-case"),
        ("blog_posts", None, "kebab-case"),
        ("comment", None, "복수형"),
        ("news", "news", "복수형"),  # 단수형과 복수형이 같다
        ("a" * MAX_NAME + "s", None, f"{MAX_NAME}자 이하"),
    ],
)
def test_names_that_do_not_fit_the_rules_are_refused(
    name: str, singular: str | None, reason: str
) -> None:
    with pytest.raises(GenerateError, match=reason):
        names_for(name, singular)


@pytest.mark.parametrize(
    ("value", "mode", "expected"),
    [
        ("POSTS_MANAGE", "name", "BLOG_POSTS_MANAGE"),
        ("PostStatus", "name", "BlogPostStatus"),
        ("add_post", "name", "add_blog_post"),
        ('"posts:manage"', "text", '"blog-posts:manage"'),
        ('"/api/v1/posts"', "text", '"/api/v1/blog-posts"'),
        ('"listPosts"', "text", '"listBlogPosts"'),
        ("# 공개 목록 캐시(posts_cache)", "text", "# 공개 목록 캐시(blog_posts_cache)"),
        ('"POST"', "text", '"POST"'),  # HTTP 메서드
        ('"post.invalid_transition"', "text", '"post.invalid_transition"'),  # 계약의 값
        ('"Postgres posted"', "text", '"Postgres posted"'),
        ('"ix_posts_status"', "table", '"ix_blog_posts_status"'),
        ('"poststatus"', "table", '"blogpoststatus"'),
    ],
)
def test_rename_follows_the_casing_of_each_place(value: str, mode: Mode, expected: str) -> None:
    assert rename(value, names_for("blog-posts"), mode) == expected


SOURCE = '''"""posts 모듈."""

from app.modules.posts.models import Post

__all__ = ["POSTS_CREATE", "Post"]
POSTS_CREATE = "posts:create"
CODE = ErrorCode.POST_INVALID_TRANSITION  # gen:module: 그대로
SEED = 1  # gen:module: 빼기
# gen:module: 빼기 시작
def seed_posts() -> None: ...
# gen:module: 빼기 끝


class Post(Base):
    __tablename__ = "posts"


async def create(api, post_id) -> None:
    await api.post(f"{POSTS_CREATE}/{post_id}", json={"type": "posts"})
    route("POST", "/posts")
'''

EXPECTED = '''"""comments 모듈."""

from app.modules.comments.models import Comment

__all__ = ["COMMENTS_CREATE", "Comment"]
COMMENTS_CREATE = "comments:create"
CODE = ErrorCode.POST_INVALID_TRANSITION  # gen:module: 그대로


class Comment(Base):
    __tablename__ = "comments"


async def create(api, comment_id) -> None:
    await api.post(f"{COMMENTS_CREATE}/{comment_id}", json={"type": "comments"})
    route("POST", "/comments")
'''


def test_transform_renames_tokens_and_follows_the_markers() -> None:
    assert transform_python(SOURCE, names_for("comments")) == EXPECTED


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """생성기가 읽고 쓰는 부분(모듈, main.py, 마이그레이션)만 복사한 프로젝트."""
    ignore = shutil.ignore_patterns("__pycache__")
    shutil.copytree(ROOT / "src/app/modules", tmp_path / "src/app/modules", ignore=ignore)
    shutil.copy2(ROOT / "src/app/main.py", tmp_path / "src/app/main.py")
    shutil.copytree(ROOT / "migrations", tmp_path / "migrations", ignore=ignore)
    return tmp_path


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_generate_copies_registers_and_chains_a_migration(project: Path) -> None:
    before = ScriptDirectory(str(project / "migrations")).get_heads()
    generated = generate(names_for(LONGEST), root=project, now=NOW)

    modules = project / "src/app/modules"
    golden = sorted(path.relative_to(modules / "posts") for path in modules.glob("posts/**/*.py"))
    made = sorted(path.relative_to(generated.module) for path in generated.module.rglob("*.py"))
    assert (generated.module, made) == (modules / "sample_gadget_probes", golden)
    registry = read(modules / "registry.py")
    imported = re.search(r"^from app\.modules import (.+)$", registry, re.MULTILINE)
    assert imported is not None
    packages = imported.group(1).split(", ")
    assert "sample_gadget_probes" in packages
    assert packages == sorted(packages)
    for line in (
        "    *sample_gadget_probes.ROUTERS,\n",
        "    *sample_gadget_probes.PERMISSIONS,\n",
        "files.add_read_rule(sample_gadget_probes.cover_image_readable)\n",
        "files.add_reference_check(sample_gadget_probes.cover_image_references)\n",
    ):
        assert line in registry
    assert '    "posts",\n    "sample-gadget-probes",\n' in read(project / "src/app/main.py")
    codes = read(modules / "roles/schemas.py")
    assert 'SAMPLE_GADGET_PROBES_MANAGE = "sample-gadget-probes:manage"' in codes

    scripts = ScriptDirectory(str(project / "migrations"))
    (head,) = scripts.get_heads()
    revision = scripts.get_revision(head)
    assert revision is not None
    assert (revision.down_revision, generated.migration.name) == (
        before[0],
        f"2026_09_28_1200-{head}_sample_gadget_probes.py",
    )
    assert 'op.create_table(\n        "sample_gadget_probes",' in read(generated.migration)

    # 골든 모듈의 이름이 남은 곳은 표시한 줄, HTTP 메서드, 계약의 값뿐이다.
    allowed = re.compile(
        r'gen:module: 그대로|"POST"|\.post\(|post\.(invalid_transition|deleted_by)'
    )
    leftovers = [
        f"{path.name}:{number}"
        for path in [*generated.module.rglob("*.py"), generated.migration]
        for number, line in enumerate(read(path).splitlines(), 1)
        if re.search("post", line, re.IGNORECASE) and not allowed.search(line)
    ]
    assert leftovers == []


def test_generated_code_passes_format_and_lint(project: Path) -> None:
    generated = generate(names_for(LONGEST), root=project, now=NOW)
    paths = [str(path) for path in (generated.module, generated.migration, *generated.registered)]
    config = ("--config", str(ROOT / "pyproject.toml"))
    # 테스트 폴더 예외(S101 등)는 프로젝트 안의 경로에만 맞으므로, 경로와 상관없는 규칙만 본다.
    rules = ("--select", "E,F,W,I,RUF022")
    commands = [("format", *config, *paths), ("check", *config, *rules, "--fix", *paths)]
    for command in commands:
        result = subprocess.run(
            [sys.executable, "-m", "ruff", *command], capture_output=True, text=True, check=False
        )
        assert result.returncode == 0, result.stdout + result.stderr
    for path in [*generated.module.rglob("*.py"), generated.migration]:
        compile(read(path), str(path), "exec")


def test_review_list_points_at_the_marked_lines(project: Path) -> None:
    generated = generate(names_for(SAMPLE), root=project, now=NOW)
    marked = {item.split(":")[0] for item in review_list(generated, project)}
    folder = "src/app/modules/sample_widgets"
    assert marked == {
        f"{folder}/permissions.py",
        f"{folder}/policies.py",
        f"{folder}/service.py",
        f"{folder}/tests/test_write.py",
    }


@pytest.mark.parametrize(
    ("name", "reason"),
    [
        ("files", "이미 있다"),
        ("authors", "겹친다"),  # author, author_id
        ("registrations", "TAGS"),  # auth 모듈의 태그와 경로
        ("lists", "내장 이름"),
        ("classes", "예약어"),
    ],
)
def test_nothing_is_written_when_a_check_fails(project: Path, name: str, reason: str) -> None:
    snapshot = {path: path.read_bytes() for path in project.rglob("*") if path.is_file()}
    with pytest.raises(GenerateError, match=reason):
        generate(names_for(name), root=project, now=NOW)
    assert {path: path.read_bytes() for path in project.rglob("*") if path.is_file()} == snapshot
