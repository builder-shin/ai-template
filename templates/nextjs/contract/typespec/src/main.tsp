import "@typespec/http";
import "@typespec/openapi";
import "./jsonapi.tsp";
import "./errors.tsp";
import "./realtime.tsp";
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
@extension(
  "x-realtime-channels",
  #[
    #{
      name: "posts",
      permission: null,
      description: "발행된 글의 이벤트. 익명 연결도 구독할 수 있다.",
    },
    #{ name: "posts:all", permission: "posts:manage", description: "모든 글의 이벤트." }
  ]
)
@extension(
  "x-realtime-events",
  #[
    #{
      name: "session.revoked",
      rooms: #["user:{userId}"],
      payload: "SessionRevokedEventDocument",
    },
    #{ name: "me.updated", rooms: #["user:{userId}"], payload: "UserMeUpdatedEventDocument" },
    #{
      name: "post.created",
      rooms: #["posts:all", "user:{authorId}"],
      payload: "PostCreatedEventDocument",
    },
    #{
      name: "post.updated",
      rooms: #["posts:all", "user:{authorId}"],
      conditionalRooms: #[#{ room: "posts", when: "published" }],
      payload: "PostUpdatedEventDocument",
    },
    #{
      name: "post.published",
      rooms: #["posts", "posts:all", "user:{authorId}"],
      payload: "PostPublishedEventDocument",
    },
    #{ name: "post.unpublished", rooms: #["posts"], payload: "PostUnpublishedEventDocument" },
    #{
      name: "post.deleted",
      rooms: #["posts:all", "user:{authorId}"],
      conditionalRooms: #[#{ room: "posts", when: "wasPublished" }],
      payload: "PostDeletedEventDocument",
    }
  ]
)
@extension(
  "x-realtime-messages",
  #[
    #{ name: "subscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
    #{ name: "unsubscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" }
  ]
)
namespace Platform;
