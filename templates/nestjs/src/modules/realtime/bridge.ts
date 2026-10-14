import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { RealtimePublisher } from "../../core/realtime/publisher.js";
import { ControlChannel } from "../../core/realtime/control-channel.js";
import { onSessionsRevoked } from "../auth/index.js";
@Injectable()
export class SessionRealtimeBridge implements OnModuleDestroy {
  private unregister: (() => void) | undefined;
  constructor(
    @Inject(RealtimePublisher) private readonly publisher: RealtimePublisher,
    @Inject(ControlChannel) private readonly control: ControlChannel,
  ) {}
  register(): void {
    if (this.unregister) return;
    this.unregister = onSessionsRevoked((afterCommit, event) => {
      this.publisher.queue(afterCommit, "session.revoked", ["user:" + event.userId], () => ({
        meta: { reason: event.reason },
      }));
      afterCommit(() => this.control.publishRecheck(event.userId));
    });
  }
  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = undefined;
  }
}
