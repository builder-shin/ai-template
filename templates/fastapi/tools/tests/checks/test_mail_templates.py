"""메일 템플릿 검사: 로케일(ko, en)마다 .subject.txt, .txt, .html이 모두 있어야 한다."""

from tools.checks.mail_templates import check
from tools.tests.checks import Tree

BASE = "src/app/modules/users/templates"
KINDS = (".subject.txt", ".txt", ".html")


def test_modules_without_templates_pass(tree: Tree) -> None:
    tree.write("src/app/modules/posts/__init__.py")
    assert check(tree.root) == []


def test_reports_missing_files_and_bad_layout(tree: Tree) -> None:
    for locale in ("ko", "en"):
        for kind in KINDS:
            tree.write(f"{BASE}/{locale}/verify{kind}", "x")
    for kind in KINDS:
        tree.write(f"{BASE}/ko/reset{kind}", "x")
    tree.write(f"{BASE}/en/reset.txt", "x")
    tree.write(f"{BASE}/ja/verify.txt", "x")
    tree.write(f"{BASE}/ko/notes.md", "x")
    missing = "파일이 없다. 메일마다 로케일(ko, en)별로 .subject.txt, .txt, .html 세 파일을 둔다."
    assert [str(problem) for problem in check(tree.root)] == [
        f"{BASE}/ja/verify.txt:1 mail-template — 지원하지 않는 로케일(ja)이다. ko, en 폴더에 둔다.",
        f"{BASE}/ko/notes.md:1 mail-template — "
        "메일 템플릿은 templates/<로케일>/<이름>.subject.txt, .txt, .html 꼴로 둔다.",
        f"{BASE}/en/reset.subject.txt:1 mail-template — {missing}",
        f"{BASE}/en/reset.html:1 mail-template — {missing}",
    ]
