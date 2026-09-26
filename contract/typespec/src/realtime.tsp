import "./jsonapi.tsp";
import "./resources/posts.tsp";

namespace Platform;

// Socket.IO 이벤트 페이로드. 이벤트 목록과 받는 곳은 main.tsp의 x-realtime-events에 있다.
union SessionRevokedReason {
  "logout",
  "password_reset",
  "account_deactivated",
  "revoked",
}

model SessionRevokedEventDocument {
  meta: {
    reason: SessionRevokedReason;
  };
}

/** 클라이언트는 이 이벤트를 받으면 GET /me를 다시 부른다. */
model UserMeUpdatedEventDocument {
  meta: {
    changed: ("roles" | "status" | "profile")[];
  };
}

model PostCreatedEventDocument is JsonApi.Document<PostResource>;
model PostUpdatedEventDocument is JsonApi.Document<PostResource>;
model PostPublishedEventDocument is JsonApi.Document<PostResource>;

model PostDeletedEventDocument {
  data: JsonApi.ResourceIdentifier<"posts">;
}
