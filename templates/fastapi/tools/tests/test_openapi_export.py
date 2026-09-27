"""openapi.json 내보내기: 앱을 띄우지 않고 만든다. 헬스체크는 계약과 같은 모양이다."""

import json
from pathlib import Path
from typing import Any

import pytest

from tools.openapi_export import STALE, main, render_openapi

HEALTH_REPORT = {"$ref": "#/components/schemas/HealthReport"}


@pytest.fixture(scope="module")
def spec() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(render_openapi())
    return loaded


def test_health_operations_match_the_contract(spec: dict[str, Any]) -> None:
    live = spec["paths"]["/health/live"]["get"]
    ready = spec["paths"]["/health/ready"]["get"]
    assert (live["operationId"], ready["operationId"]) == ("Health_live", "Health_ready")
    assert live["tags"] == ready["tags"] == ["health"]
    assert live["description"] == "프로세스가 살아 있는지 확인한다."
    assert ready["description"] == (
        "DB, Redis, 스토리지 연결까지 확인한다. 하나라도 실패하면 503이다."
    )
    assert {status: response["description"] for status, response in ready["responses"].items()} == {
        "200": "The request has succeeded.",
        "503": "Service unavailable.",
    }
    for response in [*live["responses"].values(), *ready["responses"].values()]:
        assert response["content"] == {"application/json": {"schema": HEALTH_REPORT}}
    assert "security" not in live
    assert "security" not in ready


def test_health_report_schema_matches_the_contract(spec: dict[str, Any]) -> None:
    state = {"type": "string", "enum": ["ok", "unavailable"]}
    assert spec["components"]["schemas"]["HealthReport"] == {
        "type": "object",
        "required": ["status", "checks"],
        "properties": {
            "status": state,
            "checks": {
                "type": "object",
                "unevaluatedProperties": state,
                "description": '의존 대상별 상태. 예: { "database": "ok", "redis": "ok" }',
            },
        },
        "description": (
            "헬스체크 결과. JSON:API가 아닌 예외 엔드포인트라 application/json으로 응답한다."
        ),
    }


def test_fastapi_validation_error_is_not_exported() -> None:
    assert "HTTPValidationError" not in render_openapi()


def test_check_reports_a_stale_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    output = tmp_path / "openapi.json"
    output.write_text("{}\n", encoding="utf-8")
    assert main(["--check", "--output", str(output)]) == 1
    assert STALE in capsys.readouterr().err
    assert main(["--output", str(output)]) == 0
    assert main(["--check", "--output", str(output)]) == 0
    assert output.read_text(encoding="utf-8") == render_openapi()
