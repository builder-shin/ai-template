"""모듈 생성기(gen:module): 이름 규칙, 이름 바꾸기, 표시 처리, 프로젝트 사본에 만든 결과."""

import ast
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pytest
from alembic.script import ScriptDirectory

from tools.genmodule.generate import generate, review_list, summary
from tools.genmodule.names import MAX_NAME, GenerateError, Mode, Names, names_for, rename
from tools.genmodule.transform import transform_python

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 9, 28, 12, 0)
# 프로젝트에 있을 법하지 않은 이름을 쓴다. 사용자가 만든 모듈이 있어도 테스트가 같게 돈다.
# LONGEST는 가장 긴 이름이고, LONGEST_ONE은 단수형(--singular)이 가장 긴 이름이다. 바꾼 문자열과
# 주석도 줄 길이(100)를 넘지 않아야 한다.
LONGEST = "sample-gadget-probes"
LONGEST_ONE = ("sample-gadget-people", "person")
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
    assert names_for("people", "person").pascal_one == "Person"
    assert len(LONGEST) == len(names_for(*LONGEST_ONE).kebab_one) == MAX_NAME


def test_summary_shows_the_singular_forms() -> None:
    """규칙으로 만든 단수형이 틀리면(movies → movy) 생성 출력의 첫 줄에서 바로 보인다."""
    line = summary(names_for("movies"))
    assert "movy(Movy)" in line
    assert "--singular" in line


@pytest.mark.parametrize(
    ("name", "singular", "reason"),
    [
        ("Comments", None, "kebab-case"),
        ("blog_posts", None, "kebab-case"),
        ("comment", None, "복수형"),
        ("news", "news", "복수형"),  # 단수형과 복수형이 같다
        ("a" * MAX_NAME + "s", None, f"{MAX_NAME}자 이하"),
        ("sample-gadget-people", "personality", f"{MAX_NAME}자 이하"),  # 단수형이 25자
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
    """생성기가 읽고 쓰는 부분(모듈, main.py, 마이그레이션과 그 설정)만 복사한 프로젝트."""
    ignore = shutil.ignore_patterns("__pycache__")
    shutil.copytree(ROOT / "src/app/modules", tmp_path / "src/app/modules", ignore=ignore)
    shutil.copy2(ROOT / "src/app/main.py", tmp_path / "src/app/main.py")
    shutil.copytree(ROOT / "migrations", tmp_path / "migrations", ignore=ignore)
    shutil.copy2(ROOT / "pyproject.toml", tmp_path / "pyproject.toml")  # [tool.alembic]
    return tmp_path


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def files_in(project: Path) -> dict[Path, bytes]:
    return {path: path.read_bytes() for path in project.rglob("*") if path.is_file()}


def registry_import(source: str) -> ast.ImportFrom:
    """registry.py의 `from app.modules import ...` 문.

    ruff가 줄을 나눠도(괄호, 쉼표 끝) 읽을 수 있게 정규식이 아니라 ast로 본다.
    """
    return next(
        node
        for node in ast.walk(ast.parse(source))
        if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module == "app.modules"
    )


def imported_modules(source: str) -> list[str]:
    """registry.py의 `from app.modules import ...`가 들여오는 이름들."""
    return [alias.name for alias in registry_import(source).names]


def is_wrapped(source: str) -> bool:
    found = registry_import(source)
    return found.end_lineno != found.lineno


def wrap_registry_import(registry: Path) -> None:
    """registry.py의 import를 ruff가 감싼 모양(괄호 안에 한 줄에 하나, 쉼표 끝)으로 바꾼다.

    한 줄만 보는 정규식은 이미 감싼 import의 첫 줄만 바꿔 나머지 줄을 남긴다(모듈이 많은
    프로젝트에서 IndentationError). 그래서 ast로 문장의 줄 범위를 찾아 통째로 바꾸고, 이미
    감싼 import는 그대로 둔다.
    """
    source = read(registry)
    found = registry_import(source)
    if is_wrapped(source):
        return
    names = "".join(f"    {alias.name},\n" for alias in found.names)
    lines = source.splitlines(keepends=True)
    lines[found.lineno - 1 : found.end_lineno] = [f"from app.modules import (\n{names})\n"]
    registry.write_text("".join(lines), encoding="utf-8", newline="\n")


def ruff_format(path: Path) -> None:
    """run()처럼 ruff format으로 정리한다. 100칸을 넘는 import는 괄호로 감싼다."""
    command = ("format", "--config", str(ROOT / "pyproject.toml"), str(path))
    result = subprocess.run(
        [sys.executable, "-m", "ruff", *command], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_generate_copies_registers_and_chains_a_migration(project: Path) -> None:
    before = ScriptDirectory(str(project / "migrations")).get_heads()
    generated = generate(names_for(LONGEST), root=project, now=NOW)

    modules = project / "src/app/modules"
    golden = sorted(path.relative_to(modules / "posts") for path in modules.glob("posts/**/*.py"))
    made = sorted(path.relative_to(generated.module) for path in generated.module.rglob("*.py"))
    assert (generated.module, made) == (modules / "sample_gadget_probes", golden)
    registry = read(modules / "registry.py")
    packages = imported_modules(registry)
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


def test_generate_reads_an_already_wrapped_registry_import(project: Path) -> None:
    """ruff가 이미 괄호로 감싸 여러 줄로 늘어놓은(쉼표 끝) import 문도 통째로 읽는다.

    이전 gen:module이 이름을 여럿 더해 줄이 100칸을 넘으면 run()의 ruff format이 이렇게
    바꾼다. 한 줄만 보는 정규식은 `from app.modules import (` 한 줄만 보고 깨뜨린다.
    """
    registry = project / "src/app/modules/registry.py"
    wrap_registry_import(registry)

    generate(names_for(SAMPLE), root=project, now=NOW)

    new_text = read(registry)
    ast.parse(new_text)  # 쉼표 하나만 남는 등으로 깨지면 여기서 SyntaxError다
    assert "sample_widgets" in imported_modules(new_text)


def test_generating_twice_after_ruff_wrapped_the_registry_import(project: Path) -> None:
    """ruff가 감싼 registry에서 run()처럼 생성과 ruff format을 두 번 잇는다.

    모듈이 많은 프로젝트의 모양이다. 감싸는 도우미도 이미 감싼 import를 그대로 둔다.
    """
    registry = project / "src/app/modules/registry.py"
    wrap_registry_import(registry)
    ruff_format(registry)  # 쉼표 끝이라 ruff도 감싼 채로 둔다
    wrapped = read(registry)
    assert is_wrapped(wrapped)
    wrap_registry_import(registry)
    assert read(registry) == wrapped

    for name in (LONGEST, SAMPLE):
        generate(names_for(name), root=project, now=NOW)
        ruff_format(registry)

    packages = imported_modules(read(registry))
    assert {"sample_gadget_probes", "sample_widgets"} <= set(packages)
    assert packages == sorted(packages)


def write_revision(path: Path, revision: str, down: str | tuple[str, str]) -> None:
    """head 계산만 확인하는 최소한의 마이그레이션 파일(빈 upgrade/downgrade)을 쓴다."""
    path.write_text(
        f'"""{revision}"""\n'
        "\n"
        "from collections.abc import Sequence\n"
        "\n"
        f'revision: str = "{revision}"\n'
        f"down_revision: str | Sequence[str] | None = {down!r}\n"
        "branch_labels: str | Sequence[str] | None = None\n"
        "depends_on: str | Sequence[str] | None = None\n"
        "\n\n"
        "def upgrade() -> None: ...\n"
        "\n\n"
        "def downgrade() -> None: ...\n",
        encoding="utf-8",
        newline="\n",
    )


def test_generate_chains_after_a_merge_revision(project: Path) -> None:
    """down_revision이 튜플인 merge 리비전 뒤에도 head 하나로 보고 새 리비전을 잇는다.

    문자열 정규식으로 부모를 세면 튜플 down_revision을 세지 못해, merge로 만든 head를
    head가 아닌 것으로 잘못 본다(alembic merge가 바로 이 모양을 만든다).
    """
    versions = project / "migrations/versions"
    (head,) = ScriptDirectory(str(project / "migrations")).get_heads()
    write_revision(versions / "branch_a.py", "branch0000a1", head)
    write_revision(versions / "branch_b.py", "branch0000b1", head)
    write_revision(versions / "merge_ab.py", "mergeab00001", ("branch0000a1", "branch0000b1"))

    generated = generate(names_for(SAMPLE), root=project, now=NOW)

    scripts = ScriptDirectory(str(project / "migrations"))
    (new_head,) = scripts.get_heads()
    assert new_head in generated.migration.name
    revision = scripts.get_revision(new_head)
    assert revision is not None
    assert revision.down_revision == "mergeab00001"


@pytest.mark.parametrize(("name", "singular"), [(LONGEST, None), LONGEST_ONE])
def test_generated_code_passes_format_and_lint(
    project: Path, name: str, singular: str | None
) -> None:
    generated = generate(names_for(name, singular), root=project, now=NOW)
    paths = [str(path) for path in (generated.module, generated.migration, *generated.registered)]
    config = ("--config", str(ROOT / "pyproject.toml"))
    # 테스트 폴더 예외(S101 등)는 프로젝트 안의 경로에만 맞으므로, 경로와 상관없는 규칙만 본다.
    rules = ("--select", "E,F,W,I,RUF022")
    commands = [("format", *config, *paths), ("check", *config, *rules, "--fix", *paths)]
    for command in commands:
        result = subprocess.run(
            [sys.executable, "-m", "ruff", *command],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
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
        ("refresh-tokens", "테이블"),  # auth 모듈의 테이블
        ("user-roles", "테이블"),  # roles 모듈의 테이블
    ],
)
def test_nothing_is_written_when_a_check_fails(project: Path, name: str, reason: str) -> None:
    snapshot = files_in(project)
    with pytest.raises(GenerateError, match=reason):
        generate(names_for(name), root=project, now=NOW)
    assert files_in(project) == snapshot


def test_a_broken_revision_file_stops_before_writing(project: Path) -> None:
    """Alembic이 읽지 못하는 리비전 파일은 트레이스백 대신 GenerateError다. 아무것도 쓰지 않는다."""
    broken = project / "migrations/versions/broken.py"
    broken.write_text('revision = "broken000001"\ndown_revision = (\n', encoding="utf-8")
    snapshot = files_in(project)
    with pytest.raises(GenerateError, match="마이그레이션을 읽지 못했다"):
        generate(names_for(SAMPLE), root=project, now=NOW)
    assert files_in(project) == snapshot


def test_the_revision_folder_follows_the_alembic_config(project: Path) -> None:
    """리비전 폴더는 경로를 박아 두지 않고 pyproject.toml의 [tool.alembic]에서 읽는다."""
    (project / "migrations").rename(project / "db")
    config = project / "pyproject.toml"
    location = 'script_location = "%(here)s/migrations"'
    assert location in read(config)
    moved = read(config).replace(location, 'script_location = "%(here)s/db"')
    config.write_text(moved, encoding="utf-8", newline="\n")

    generated = generate(names_for(SAMPLE), root=project, now=NOW)

    assert generated.migration.parent == project / "db/versions"
    (head,) = ScriptDirectory(str(project / "db")).get_heads()
    assert head in generated.migration.name
