"""앱에 JSON:API 공통 계층을 건다. main.create_app과 공통 계층의 테스트가 같은 함수를 쓴다."""

from fastapi import FastAPI

from app.core.jsonapi.body_limit import BodyLimitMiddleware
from app.core.jsonapi.errors import install_error_handlers
from app.core.jsonapi.negotiation import JsonApiNegotiationMiddleware
from app.core.logging import TraceIdMiddleware
from app.core.ratelimit import GlobalRateLimitMiddleware


def install_jsonapi(app: FastAPI, *, rate_limit: bool = False) -> None:
    """에러 문서, 콘텐츠 협상(415/406), 본문 한도(413), 요청마다 trace id를 건다.

    - OpenAPI 후처리는 앱 클래스(JsonApiApp)가 한다.
    - 입력용과 출력용 스키마를 나누지 않는다. 나누면 `-Input`, `-Output` 이름이 붙는다.
    - 미들웨어는 나중에 더한 것이 바깥이다. trace id가 가장 바깥이라 협상 에러에도 같은 id가 붙는다.
      본문 한도는 협상 안쪽이라 415·406이 413보다 먼저다.
    - rate_limit이면 IP별 전역 레이트 리밋을 trace id와 협상 사이에 단다. 협상에 실패하는 요청도
      센다. app.state.settings와 app.state.redis가 있어야 한다(create_app이 시작할 때 둔다).
    """
    app.separate_input_output_schemas = False
    install_error_handlers(app)
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(JsonApiNegotiationMiddleware)
    if rate_limit:
        app.add_middleware(GlobalRateLimitMiddleware)
    app.add_middleware(TraceIdMiddleware)
