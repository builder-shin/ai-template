import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { SETTINGS, type Settings } from "../config/settings.js";
import { STORAGE_CLIENTS, storageClients, type StorageClients } from "./client.js";
@Injectable()
class StorageLifecycle implements OnApplicationShutdown {
  constructor(@Inject(STORAGE_CLIENTS) private readonly clients: StorageClients) {}
  onApplicationShutdown(): void {
    this.clients.internal.destroy();
    this.clients.public.destroy();
  }
}
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_CLIENTS,
      inject: [SETTINGS],
      useFactory: (settings: Settings) => storageClients(settings),
    },
    StorageLifecycle,
  ],
  exports: [STORAGE_CLIENTS],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class StorageModule {}
