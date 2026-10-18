import { expect, it, vi } from "vitest";
import type { Settings } from "../../../core/config/settings.js";
import { JsonLogger } from "../../../core/logging/json-logger.js";
import { errorObjectSchema } from "../../../core/jsonapi/errors.js";
import { TicketStore } from "../../../core/realtime/tickets.js";
import { ControlChannel } from "../../../core/realtime/control-channel.js";
import { RuntimeRealtimePublisher } from "../../../core/realtime/publisher.js";
import { redisFixture } from "../../../core/realtime/tests/redis-fixture.js";
import type { Principal } from "../../../core/security/principal.js";
import { AuthRepository, JwtPrincipalResolver, SessionsRepository } from "../../auth/index.js";
import { RolesAdminService } from "../../roles/index.js";
import { adminFixture, admin, uid, otherId, customId } from "../../users/tests/admin-fixture.js";
import {
  RealtimeGateway,
  SessionRecheck,
  type RealtimeServer,
  type RealtimeSocket,
} from "../index.js";

function socket(principal?: Principal, rooms: string[] = [], auth: object = {}) {
  const memberships = new Set(rooms);
  return {
    data: { principal },
    rooms: memberships,
    handshake: { auth },
    join: vi.fn((room: string) => {
      memberships.add(room);
      return Promise.resolve();
    }),
    leave: vi.fn((room: string) => {
      memberships.delete(room);
      return Promise.resolve();
    }),
    disconnect: vi.fn(),
  };
}
function transport(sockets: ReturnType<typeof socket>[]) {
  let middleware: ((s: RealtimeSocket, next: (e?: Error) => void) => void) | undefined;
  const server = {
    sockets: { sockets: new Map(sockets.map((s, i) => [String(i), s])) },
    use: (handler: typeof middleware) => {
      middleware = handler;
    },
  } as unknown as RealtimeServer;
  return {
    server,
    authenticate: (s: ReturnType<typeof socket>) =>
      new Promise<Error | undefined>((resolve) => {
        if (!middleware) throw new Error("인증 미들웨어가 없다");
        middleware(s as unknown as RealtimeSocket, resolve);
      }),
  };
}
function fixture(
  resolver: Pick<JwtPrincipalResolver, "resolveSession"> = {
    resolveSession: (p) => Promise.resolve({ ...p, permissions: new Set() }),
  },
) {
  const redis = redisFixture();
  const logger = new JsonLogger([]);
  const tickets = new TicketStore(redis.redis);
  const control = new ControlChannel(redis.redis, logger);
  const recheck = new SessionRecheck(resolver as JwtPrincipalResolver, logger);
  const gateway = new RealtimeGateway(
    tickets,
    new RuntimeRealtimePublisher(redis.redis),
    control,
    recheck,
  );
  return { redis, logger, tickets, control, recheck, gateway };
}

it("소비한 티켓은 connect_error 코드 메시지와 ErrorObject로 거절한다", async () => {
  const f = fixture();
  const wire = transport([]);
  f.gateway.afterInit(wire.server);
  const ticket = await f.tickets.issue({
    userId: otherId,
    sessionId: "s2",
    permissions: new Set(),
  });
  const first = socket(undefined, [], { ticket });
  expect(await wire.authenticate(first)).toBeUndefined();
  expect(first.rooms.has("user:" + otherId)).toBe(true);
  const again = await wire.authenticate(socket(undefined, [], { ticket }));
  expect(again?.message).toBe("auth.token_invalid");
  expect(errorObjectSchema.parse((again as Error & { data: unknown }).data)).toMatchObject({
    status: "401",
    code: "auth.token_invalid",
  });
});

it.each(["subscribe", "unsubscribe"] as const)(
  "%s의 빈 값과 여러 페이로드는 channel 위치로 ack를 보낸다",
  async (event) => {
    const f = fixture();
    const s = socket();
    for (const payload of [
      undefined,
      [{ channel: "posts" }, { channel: "posts" }],
      { channel: "unknown" },
      {},
    ]) {
      expect(await f.gateway[event](s as unknown as RealtimeSocket, payload)).toMatchObject({
        ok: false,
        error: {
          status: "422",
          code: "validation.invalid_choice",
          source: { pointer: "/channel" },
        },
      });
    }
    expect(s.join).not.toHaveBeenCalled();
    expect(s.leave).not.toHaveBeenCalled();
  },
);

it("역할 변경 commit의 제어 메시지는 최신 권한을 읽어 구독 자격을 잃은 연결만 끊는다", async () => {
  const db = adminFixture();
  const role = db.state.roles.find((r) => r.id === customId);
  if (!role) throw new Error("편집자 역할이 없다");
  role.permissions = ["posts:manage"];
  db.state.assignments.push({ userId: otherId, roleId: customId });
  const resolver = new JwtPrincipalResolver(
    db.unit,
    new SessionsRepository(),
    new AuthRepository(),
    db.roles,
    {} as Settings,
  );
  const initial = await resolver.resolveSession({ userId: otherId, sessionId: "s2" });
  expect(initial.permissions.has("posts:manage")).toBe(true);
  const subscriber = socket(initial, ["posts:all", "user:" + otherId]);
  const publicOnly = socket({ ...initial, sessionId: "s3" }, ["posts"]);
  const unrelated = socket({ ...initial, userId: uid }, ["posts:all"]);
  const anonymous = socket(undefined, ["posts"]);
  const wire = transport([subscriber, publicOnly, unrelated, anonymous]);
  const f = fixture(resolver);
  let checked: (() => void) | undefined;
  const complete = new Promise<void>((resolve) => {
    checked = resolve;
  });
  await f.control.subscribe(async (userId) => {
    expect(db.trace.at(-1)).toBe("commit");
    await f.recheck.run(userId, wire.server);
    checked?.();
  });
  try {
    await new RolesAdminService(db.unit, db.roles, f.control).update(admin, customId, {
      permissions: ["posts:create"],
    });
    await complete;
    expect(subscriber.data.principal?.permissions.has("posts:manage")).toBe(false);
    expect(subscriber.disconnect).toHaveBeenCalledExactlyOnceWith(true);
    expect(subscriber.leave).not.toHaveBeenCalled();
    expect(publicOnly.disconnect).not.toHaveBeenCalled();
    expect(unrelated.disconnect).not.toHaveBeenCalled();
    expect(anonymous.disconnect).not.toHaveBeenCalled();
    expect(f.redis.events).toContain("control");
  } finally {
    await f.control.onModuleDestroy();
    db.close();
  }
});
