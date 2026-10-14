import { Emitter } from "@socket.io/redis-emitter";
import type { RealtimeEventName } from "./declarations.js";
export interface PublishPort {
  publish(channel: string, message: Buffer): Promise<number>;
}
export class RealtimeEmitter {
  constructor(
    private readonly port: PublishPort,
    private readonly prefix: string,
  ) {}
  async publish(
    name: RealtimeEventName,
    rooms: readonly string[],
    payload: unknown,
  ): Promise<void> {
    const pending: Promise<number>[] = [];
    // 설치된 emitter가 publish Promise를 버리므로 각 발행의 포트에서 따로 수집한다.
    const emitter = new Emitter(
      {
        publish: (channel: string, message: Buffer) => {
          const result = this.port.publish(channel, message);
          pending.push(result);
          return result;
        },
      },
      { key: `${this.prefix}:socket.io` },
    );
    emitter.to([...rooms]).emit(name, payload);
    await Promise.all(pending);
  }
}
