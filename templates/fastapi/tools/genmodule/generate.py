"""모듈 만들기: 검사하고, 새 모듈과 마이그레이션 초안을 쓰고, 등록한다. poe 명령의 본체다."""

import ast
import builtins
import keyword
import re
import secrets
import subprocess
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from alembic.script import ScriptDirectory

from tools.genmodule.names import GenerateError, Names, names_for, rename
from tools.genmodule.transform import bindings, directive, transform_python

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = "posts"
MODULES = Path("src/app/modules")
VERSIONS = Path("migrations/versions")
RESERVED = frozenset({"tests"})
_TO_REVIEW = ("그대로", "고칠 곳")


@dataclass(frozen=True, slots=True)
class Generated:
    module: Path
    migration: Path
    registered: tuple[Path, ...]  # 등록을 더한 파일


def _check_names(names: Names, golden: Iterable[str]) -> None:
    """새 이름이 파이썬 예약어·내장 이름이나 골든 모듈이 이미 쓰는 이름과 겹치면 실패한다.

    예: authors는 author(글의 작성자 변수)와, sessions는 session(DB 세션 인자)과 겹친다.
    """
    for word in (names.snake, names.snake_one):
        if word in RESERVED or keyword.iskeyword(word) or keyword.issoftkeyword(word):
            raise GenerateError(f"{names.kebab}: {word}는 예약어라 쓸 수 없다. 다른 이름을 쓴다.")
        if hasattr(builtins, word):
            raise GenerateError(f"{names.kebab}: {word}는 파이썬 내장 이름이다. 다른 이름을 쓴다.")
    bound = set[str]().union(*(bindings(source) for source in golden))
    unchanged = {name for name in bound if rename(name, names, "name") == name}
    renamed = {rename(name, names, "name") for name in bound - unchanged}
    if clashes := sorted(renamed & unchanged):
        raise GenerateError(
            f"{names.kebab}: 골든 모듈이 이미 쓰는 이름({', '.join(clashes)})과 겹친다. "
            "다른 이름을 쓴다(예: 앞에 말을 붙인다)."
        )


def _insert_after(text: str, anchor: str, addition: str, where: str) -> str:
    if anchor not in text:
        raise GenerateError(f"{where}에 `{anchor.strip()}`이 없다. 새 모듈을 손으로 등록한다.")
    return text.replace(anchor, anchor + addition, 1)


def _add_module_import(text: str, module: str) -> str:
    """`from app.modules import ...` 문에 모듈을 더한다.

    ruff가 줄을 늘려 괄호로 감싸도(이전 gen:module이 이미 여럿을 더했으면 그렇다) `ast`로
    문장의 시작·끝 줄을 찾아 통째로 한 줄로 다시 쓰므로, 줄 나눔 여부와 상관없이 읽는다.
    """
    found = next(
        (
            node
            for node in ast.walk(ast.parse(text))
            if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module == "app.modules"
        ),
        None,
    )
    if found is None:
        raise GenerateError("registry.py에 `from app.modules import ...` 한 줄이 없다.")
    imported = sorted({*(alias.name for alias in found.names), module})
    lines = text.splitlines(keepends=True)
    end = found.end_lineno or found.lineno
    lines[found.lineno - 1 : end] = [f"from app.modules import {', '.join(imported)}\n"]
    return "".join(lines)


def _registrations(root: Path, names: Names) -> dict[Path, str]:
    """registry.py, main.py의 TAGS, roles의 PermissionCode에 새 모듈을 더한 내용."""
    registry = root / MODULES / "registry.py"
    text = _add_module_import(registry.read_text(encoding="utf-8"), names.snake)
    for anchor in (
        "    *posts.ROUTERS,\n",
        "    *posts.PERMISSIONS,\n",
        "files.add_read_rule(posts.cover_image_readable)\n",
        "files.add_reference_check(posts.cover_image_references)\n",
    ):
        added = anchor.replace("posts.", f"{names.snake}.")
        text = _insert_after(text, anchor, added, "registry.py")
    main = root / "src/app/main.py"
    tags = main.read_text(encoding="utf-8")
    if f'    "{names.kebab}",\n' in tags:
        raise GenerateError(f"{names.kebab}: main.py의 TAGS에 이미 있는 태그다. 다른 이름을 쓴다.")
    tags = _insert_after(tags, '    "posts",\n', f'    "{names.kebab}",\n', "main.py의 TAGS")
    schemas = root / MODULES / "roles/schemas.py"
    codes = (
        f'    {names.upper}_CREATE = "{names.kebab}:create"\n'
        f'    {names.upper}_MANAGE = "{names.kebab}:manage"\n'
    )
    anchor = '    POSTS_MANAGE = "posts:manage"\n'
    enum = _insert_after(schemas.read_text(encoding="utf-8"), anchor, codes, "PermissionCode")
    return {registry: text, main: tags, schemas: enum}


def _revision(text: str, field: str) -> str | None:
    found = re.search(rf'^{field}: [^=]+= "([0-9a-f]+)"', text, re.MULTILINE)
    return None if found is None else found.group(1)


def _migration(root: Path, names: Names, now: datetime) -> tuple[Path, str]:
    """posts 테이블을 만드는 리비전을 복사해, 새 테이블을 만드는 초안을 head 뒤에 잇는다."""
    texts = {path: path.read_text(encoding="utf-8") for path in (root / VERSIONS).glob("*.py")}
    golden = next(
        (text for text in texts.values() if 'create_table(\n        "posts",' in text), None
    )
    if golden is None:
        raise GenerateError(
            "posts 테이블을 만드는 마이그레이션이 없다. db:revision으로 초안을 만든다."
        )
    # 문자열 정규식이 아니라 Alembic으로 head를 찾는다. merge 리비전은 down_revision이
    # 튜플("a", "b")이라 정규식으로는 부모로 세지 못해 head가 아닌 것도 head로 잘못 본다.
    # Alembic이 각 리비전 파일을 import해서 읽으므로, .pyc 캐시가 생기지 않게 잠깐 끈다
    # (검사에 실패해도 아무것도 쓰지 않는다는 약속을 캐시 파일이 깨지 않게 한다).
    previous_bytecode, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        heads = sorted(ScriptDirectory(str(root / "migrations")).get_heads())
    finally:
        sys.dont_write_bytecode = previous_bytecode
    if len(heads) != 1:
        raise GenerateError(f"마이그레이션 head가 하나가 아니다({heads}). 먼저 하나로 합친다.")
    old_revision, old_parent = _revision(golden, "revision"), _revision(golden, "down_revision")
    revision = secrets.token_hex(6)
    body = transform_python(golden[golden.index('"""', 3) + 3 :], names, table=True)
    body = body.replace(f'"{old_revision}"', f'"{revision}"')
    body = body.replace(f'"{old_parent}"', f'"{heads[0]}"')
    header = (
        f'"""{names.snake}: {names.kebab} 테이블(gen:module이 만든 초안)\n\n'
        f"Revision ID: {revision}\nRevises: {heads[0]}\nCreate Date: {now:%Y-%m-%d %H:%M:%S}\n"
        '"""'
    )
    path = root / VERSIONS / f"{now:%Y_%m_%d_%H%M}-{revision}_{names.snake}.py"
    return path, header + body


def generate(names: Names, *, root: Path = ROOT, now: datetime | None = None) -> Generated:
    """새 모듈과 마이그레이션 초안을 만들고 등록한다. 모두 검사한 뒤에만 파일을 쓴다."""
    source = root / MODULES / GOLDEN
    target = root / MODULES / names.snake
    if target.exists():
        raise GenerateError(f"{target.relative_to(root).as_posix()}이 이미 있다. 다른 이름을 쓴다.")
    golden = {
        path.relative_to(source): path.read_text(encoding="utf-8")
        for path in sorted(source.rglob("*.py"))
        if "__pycache__" not in path.relative_to(source).parts
    }
    _check_names(names, golden.values())
    writes: dict[Path, str] = {}
    for relative, text in golden.items():
        out = target / Path(*(rename(part, names, "name") for part in relative.parts))
        writes[out] = transform_python(text, names)
    migration, text = _migration(root, names, now or datetime.now())
    writes[migration] = text
    registered = _registrations(root, names)
    writes.update(registered)
    for path, content in writes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
    return Generated(target, migration, tuple(registered))


def review_list(generated: Generated, root: Path = ROOT) -> list[str]:
    """만든 파일에 남은 `그대로`·`고칠 곳` 표시를 `경로:줄 내용`으로 모은다."""
    found: list[str] = []
    for file in [*sorted(generated.module.rglob("*.py")), generated.migration]:
        for number, line in enumerate(file.read_text(encoding="utf-8").splitlines(), 1):
            said = directive(line)
            if said is not None and said.startswith(_TO_REVIEW):
                where = file.relative_to(root).as_posix()
                found.append(f"{where}:{number} {line.strip()}")
    return found


NEXT_STEPS = """
다음을 새 모듈에 맞게 고친다(골든 모듈 posts를 그대로 복사했다).
- models.py와 schemas.py: 속성과 관계(title, body, status, author, coverImage는 posts의 것이다)
- policies.py와 service.py: 보기·고치기 규칙, 상태와 전이 표, 캐시 예시
- 문서, 주석, API 설명: 골든 모듈은 글을 설명한다
- 에러 코드와 감사 행위: 새 값을 계약에 더한 뒤 바꾼다(지금은 posts의 값을 쓴다)
- 가입한 사람(member)이 쓰게 하려면 권한을 roles의 시스템 역할에 더한다(admin은 모든 권한을 가진다)
- registry.py: 커버 이미지를 쓰지 않으면 파일 읽기 규칙과 참조 확인을 지운다
- 모델을 고친 뒤 마이그레이션 초안을 지우고 다시 만든다: uv run poe db:revision "<무엇을 바꾸는지>"
- 끝나면 uv run poe gen, uv run poe check
"""


def _python(*args: str) -> int:
    sys.stdout.flush()  # 앞서 찍은 줄이 자식 프로세스의 출력보다 먼저 나오게 한다
    return subprocess.run([sys.executable, "-m", *args], cwd=ROOT, check=False).returncode


def run(name: str, singular_form: str | None = None) -> int:
    """poe gen:module의 본체. 만든 뒤 ruff로 정리하고 openapi.json을 다시 쓴다."""
    try:
        generated = generate(names_for(name, singular_form))
    except GenerateError as error:
        print(f"gen:module: {error}", file=sys.stderr)
        return 1
    written = [generated.module, generated.migration, *generated.registered]
    paths = [path.relative_to(ROOT).as_posix() for path in written]
    print(f"만들었다: {paths[0]}, {paths[1]}")
    print(f"등록했다: {', '.join(paths[2:])}")
    failed = (
        _python("ruff", "format", "--quiet", *paths)
        or _python("ruff", "check", "--fix", "--quiet", *paths)
        or _python("tools.openapi_export")
    )
    if review := review_list(generated):
        print("\n골든 모듈이 표시한 고칠 곳:")
        print("\n".join(f"- {item}" for item in review))
    print(NEXT_STEPS.rstrip())
    if failed:
        print("\n정리(ruff, openapi.json)가 실패했다. 위 출력을 보고 고친다.", file=sys.stderr)
    return failed
