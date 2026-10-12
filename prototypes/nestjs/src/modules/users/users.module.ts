import { Module } from "@nestjs/common";
import { RolesModule } from "../roles/index.js";
import { UsersRepository } from "./repository.js";
import { UsersService } from "./service.js";
import { UsersController } from "./controller.js";
@Module({
  imports: [RolesModule],
  providers: [UsersRepository, UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
