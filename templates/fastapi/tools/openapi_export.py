"""앱을 띄우지 않고 openapi.json을 내보낸다(`uv run poe gen`). `--check`는 최신인지만 본다.

check의 generated 단계가 `--check`로 돌고, contract 단계가 룰셋 번들로 이 파일을 검사한다.
"""

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from app.main import create_app

OUTPUT = Path(__file__).resolve().parent.parent / "openapi.json"
STALE = "openapi.json이 최신이 아니다. uv run poe gen으로 다시 만든다."


def render_openapi() -> str:
    """앱의 OpenAPI 문서를 JSON 텍스트로 만든다(2칸 들여쓰기, 한글 그대로, 끝에 줄바꿈)."""
    return json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="openapi.json을 내보낸다.")
    parser.add_argument("--output", type=Path, default=OUTPUT, help="쓸 파일")
    parser.add_argument("--check", action="store_true", help="쓰지 않고 최신인지만 본다")
    args = parser.parse_args(argv)
    output: Path = args.output
    content = render_openapi()
    if args.check:
        current = output.read_text(encoding="utf-8") if output.exists() else ""
        if current != content:
            print(STALE, file=sys.stderr)
            return 1
        return 0
    output.write_text(content, encoding="utf-8", newline="\n")
    print(f"{output.name}을 새로 썼다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
