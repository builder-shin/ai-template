import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/index.js";
import { RealtimeController, RealtimeGateway } from "./controller.js";
import { RealtimeService } from "./service.js";
@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
