"""메일 템플릿 검사.

모듈의 메일 템플릿은 src/app/modules/<모듈>/templates/<로케일>/<이름>.subject.txt, .txt, .html이다.
로케일은 ko와 en이고, 메일마다 모든 로케일에 세 파일이 있어야 한다.
"""

from pathlib import Path, PurePosixPath

from tools.checks import Problem
from tools.files import project_files

RULE = "mail-template"
LOCALES = ("ko", "en")
KINDS = (".subject.txt", ".txt", ".html")
LAYOUT = "메일 템플릿은 templates/<로케일>/<이름>.subject.txt, .txt, .html 꼴로 둔다."
MISSING = "파일이 없다. 메일마다 로케일(ko, en)별로 .subject.txt, .txt, .html 세 파일을 둔다."


def _split(file_name: str) -> tuple[str, str] | None:
    """verify.subject.txt → (verify, .subject.txt). 알려진 종류가 아니면 None."""
    for kind in KINDS:
        if file_name.endswith(kind) and len(file_name) > len(kind):
            return file_name.removesuffix(kind), kind
    return None


def check(root: Path) -> list[Problem]:
    problems: list[Problem] = []
    found: dict[str, set[tuple[str, str, str]]] = {}  # templates 폴더 → {(메일, 로케일, 종류)}
    for name in project_files(root):
        parts = PurePosixPath(name).parts
        if len(parts) < 6 or parts[:3] != ("src", "app", "modules") or parts[4] != "templates":
            continue
        split = _split(parts[-1]) if len(parts) == 7 else None
        if split is None:
            problems.append(Problem(name, 1, RULE, LAYOUT))
        elif parts[5] not in LOCALES:
            message = f"지원하지 않는 로케일({parts[5]})이다. ko, en 폴더에 둔다."
            problems.append(Problem(name, 1, RULE, message))
        else:
            found.setdefault("/".join(parts[:5]), set()).add((split[0], parts[5], split[1]))
    for folder, files in found.items():
        for mail in sorted({mail for mail, _, _ in files}):
            for locale in LOCALES:
                for kind in KINDS:
                    if (mail, locale, kind) not in files:
                        problems.append(
                            Problem(f"{folder}/{locale}/{mail}{kind}", 1, RULE, MISSING)
                        )
    return problems
