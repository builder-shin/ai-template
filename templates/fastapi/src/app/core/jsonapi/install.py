"""앱에 JSON:API 공통 계층을 건다. main.create_app과 공통 계층의 테스트가 같은 함수를 쓴다."""

from fastapi import FastAPI

from app.core.jsonapi.errors import install_error_handlers
from app.core.jsonapi.negotiation import JsonApiNegotiationMiddleware
from app.core.logging import TraceIdMiddleware


def install_jsonapi(app: FastAPI) -> None:
    """에러 문서, 콘텐츠 협상(415/406), 요청마다 trace id를 건다.

    - OpenAPI 후처리는 앱 클래스(JsonApiApp)가 한다.
    - 입력용과 출력용 스키마를 나누지 않는다. 나누면 `-Input`, `-Output` 이름이 붙는다.
    - 미들웨어는 나중에 더한 것이 바깥이다. trace id가 가장 바깥이라 협상 에러에도 같은 id가 붙는다.
    """
    app.separate_input_output_schemas = False
    install_error_handlers(app)
    app.add_middleware(JsonApiNegotiationMiddleware)
    app.add_middleware(TraceIdMiddleware)
