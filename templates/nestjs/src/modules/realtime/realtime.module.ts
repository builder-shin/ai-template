import { Module, type DynamicModule, type INestApplicationContext } from "@nestjs/common";
import { TicketStore } from "../../core/realtime/tickets.js";
import { RealtimePublisher, RuntimeRealtimePublisher } from "../../core/realtime/publisher.js";
import { ControlChannel } from "../../core/realtime/control-channel.js";
import { AuthModule } from "../auth/index.js";
import { RealtimeController } from "./controller.js";
import { RealtimeGateway } from "./gateway.js";
import { SessionRecheck } from "./recheck.js";
import { SessionRealtimeBridge } from "./bridge.js";
function unavailable(): never {
  throw new Error("인프라가 없는 앱에서는 티켓을 발급할 수 없다");
}
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class RealtimeModule {
  static register(
    infrastructure: boolean,
    auth: DynamicModule = AuthModule.register(infrastructure),
  ): DynamicModule {
    return {
      module: RealtimeModule,
      imports: infrastructure ? [auth] : [],
      controllers: [RealtimeController],
      providers: infrastructure
        ? [
            TicketStore,
            RuntimeRealtimePublisher,
            { provide: RealtimePublisher, useExisting: RuntimeRealtimePublisher },
            ControlChannel,
            SessionRecheck,
            RealtimeGateway,
            SessionRealtimeBridge,
          ]
        : [
            {
              provide: TicketStore,
              useValue: { issue: unavailable, consume: unavailable } satisfies Pick<
                TicketStore,
                "issue" | "consume"
              >,
            },
            {
              provide: SessionRealtimeBridge,
              useValue: { register: () => {} } satisfies Pick<SessionRealtimeBridge, "register">,
            },
          ],
      exports: [
        TicketStore,
        SessionRealtimeBridge,
        ...(infrastructure
          ? [RealtimePublisher, RuntimeRealtimePublisher, ControlChannel, SessionRecheck]
          : []),
      ],
    };
  }
}
export function registerRealtime(app: INestApplicationContext): void {
  app.get<SessionRealtimeBridge>(SessionRealtimeBridge).register();
}
