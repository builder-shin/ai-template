import { Module } from "@nestjs/common";
import { UsersModule } from "../users/index.js";
import { MailSender } from "../../core/mail/sender.js";
import { AuthController } from "./controller.js";
import { AuthRepository } from "./repository.js";
import { Authenticator } from "./authenticator.service.js";
import { AccountsService } from "./accounts.service.js";
import { SessionsService } from "./sessions.service.js";
import { VerificationMailService } from "./mails.service.js";
@Module({
  imports: [UsersModule],
  providers: [
    MailSender,
    AuthRepository,
    Authenticator,
    AccountsService,
    SessionsService,
    VerificationMailService,
  ],
  controllers: [AuthController],
  exports: [Authenticator],
})
export class AuthModule {}
