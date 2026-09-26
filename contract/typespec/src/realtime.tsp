import "./jsonapi.tsp";
import "./resources/posts.tsp";
import "./errors.tsp";

namespace Platform;

// Socket.IO 이벤트 페이로드. 이벤트 목록과 받는 곳은 main.tsp의 x-realtime-events에 있다.
union SessionRevokedReason {
  "logout",
  "password_reset",
  "account_deactivated",
  "revoked",
  "password_changed",
  "refresh_token_reused",
  "account_deleted",
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

/** 구독할 수 있는 채널. main.tsp의 x-realtime-channels와 같은 목록이다. */
union RealtimeChannel {
  "posts",
  "posts:all",
}

/** 클라이언트가 subscribe·unsubscribe 메시지로 보내는 페이로드. */
model RealtimeSubscription {
  channel: RealtimeChannel;
}

/** subscribe·unsubscribe에 대한 서버의 ack. ok가 false면 error가 있다(권한 없음 permission.denied, 모르는 채널 validation.invalid_choice). */
model RealtimeAck {
  ok: boolean;
  error?: ErrorObject;
}
