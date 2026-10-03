"""개발 실행기는 프로젝트 DB 소유권을 확인한 뒤에만 서버를 띄운다."""

import pytest

from app.core.config import Settings
from tools import dev


@pytest.mark.parametrize("owned", [False, True])
def test_dev_checks_database_ownership_before_preflight_and_start(
    monkeypatch: pytest.MonkeyPatch, owned: bool
) -> None:
    settings = Settings.model_construct()
    events: list[str] = []

    def guard(value: Settings) -> None:
        assert value is settings
        events.append("guard")
        if not owned:
            raise SystemExit("다른 프로젝트의 DB — 이 프로젝트의 setup을 실행한다")

    def preflight(value: Settings) -> None:
        assert value is settings
        events.append("preflight")

    def start(*args: object, **kwargs: object) -> int:
        events.append("start")
        return 7

    monkeypatch.setattr(dev, "load_settings", lambda: settings)
    monkeypatch.setattr(dev, "require_project_database", guard, raising=False)
    monkeypatch.setattr(dev, "preflight", preflight)
    monkeypatch.setattr(dev, "run_all", start)
    if owned:
        assert dev.main() == 7
        assert events == ["guard", "preflight", "start"]
    else:
        with pytest.raises(SystemExit, match="다른 프로젝트의 DB"):
            dev.main()
        assert events == ["guard"]
