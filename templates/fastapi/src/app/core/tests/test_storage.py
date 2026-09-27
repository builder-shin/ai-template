"""스토리지 클라이언트: 스토리지가 멈춰도 호출이 스레드를 오래 잡지 않는다."""

from app.core.config import Settings
from app.core.storage import create_client


def test_calls_give_up_quickly(settings: Settings) -> None:
    # botocore 스텁은 Config의 옵션을 속성으로 선언하지 않아 vars()로 읽는다.
    options = vars(create_client(settings).meta.config)
    assert (options["connect_timeout"], options["read_timeout"]) == (2, 5)
    assert options["retries"] == {"mode": "standard", "total_max_attempts": 2}
