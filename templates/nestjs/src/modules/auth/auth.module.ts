import { Module, type DynamicModule } from "@nestjs/common";
import { JobsModule } from "../../core/jobs/jobs.module.js";
import { MailModule } from "../../core/mail/mail.module.js";
import { RolesModule } from "../roles/index.js";
import { AuthController } from "./controller.js";
import { AuthRepository } from "./repository.js";
import { RegistrationService } from "./registration.service.js";
import { VerificationService } from "./verification.service.js";
import { AuthMails } from "./mails.js";
function unavailable(): never {
  throw new Error("인프라가 없는 앱에서는 인증 작업을 실행할 수 없다");
}
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class AuthModule {
  static register(infrastructure: boolean): DynamicModule {
    return {
      module: AuthModule,
      imports: infrastructure ? [RolesModule, JobsModule, MailModule] : [],
      controllers: [AuthController],
      providers: infrastructure
        ? [AuthRepository, RegistrationService, VerificationService, AuthMails]
        : [
            {
              provide: RegistrationService,
              useValue: { create: unavailable } satisfies Pick<RegistrationService, "create">,
            },
            {
              provide: VerificationService,
              useValue: { request: unavailable, verify: unavailable } satisfies Pick<
                VerificationService,
                "request" | "verify"
              >,
            },
          ],
      exports: [RegistrationService, VerificationService, ...(infrastructure ? [AuthMails] : [])],
    };
  }
}
