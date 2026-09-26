import "@typespec/http";
import "@typespec/openapi";
import "./jsonapi.tsp";
import "./errors.tsp";
import "./resources/health.tsp";
import "./resources/roles.tsp";
import "./resources/files.tsp";
import "./resources/users.tsp";
import "./resources/posts.tsp";
import "./resources/audit-logs.tsp";
import "./resources/auth.tsp";
import "./resources/sessions.tsp";

using Http;
using OpenAPI;

/** AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다. */
@service(#{ title: "AI Template Platform API" })
@info(#{ version: "1.0.0" })
@server("http://localhost:8000", "로컬 개발 서버")
namespace Platform;
