import { OAuthClient } from "./oauth/client.js";
import { OAuthState } from "./oauth/state.js";
import { OAuthService } from "./oauth/oauth.service.js";
import { Module, type DynamicModule } from "@nestjs/common";
import { JobsModule } from "../../core/jobs/jobs.module.js";
import { MailModule } from "../../core/mail/mail.module.js";
import { RolesModule } from "../roles/index.js";
import { AuthController } from "./controller.js";
import { AuthRepository } from "./repository.js";
import { RegistrationService } from "./registration.service.js";
import { VerificationService } from "./verification.service.js";
import { AuthMails } from "./mails.js";
import { SessionsRepository } from "./sessions.repository.js";
import { SessionsService } from "./sessions.service.js";
import { PasswordsService } from "./passwords.service.js";
import { JwtPrincipalResolver } from "./principal.resolver.js";
import { PasswordBootstrap } from "../../core/security/passwords.js";
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
        ? [
            OAuthClient,
            OAuthState,
            OAuthService,
            AuthRepository,
            RegistrationService,
            VerificationService,
            AuthMails,
            SessionsRepository,
            SessionsService,
            PasswordsService,
            JwtPrincipalResolver,
            PasswordBootstrap,
          ]
        : [
            {
              provide: OAuthService,
              useValue: { authorize: unavailable, callback: unavailable } satisfies Pick<
                OAuthService,
                "authorize" | "callback"
              >,
            },
            {
              provide: PasswordsService,
              useValue: {
                request: unavailable,
                reset: unavailable,
                change: unavailable,
              } satisfies Pick<PasswordsService, "request" | "reset" | "change">,
            },
            {
              provide: SessionsService,
              useValue: {
                createWithOAuthCode: unavailable,
                createWithPassword: unavailable,
                refresh: unavailable,
                list: unavailable,
                revokeCurrent: unavailable,
                revoke: unavailable,
                revokeOthers: unavailable,
                revokeAll: unavailable,
              } satisfies Pick<
                SessionsService,
                | "createWithOAuthCode"
                | "createWithPassword"
                | "refresh"
                | "list"
                | "revokeCurrent"
                | "revoke"
                | "revokeOthers"
                | "revokeAll"
              >,
            },
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
      exports: [
        OAuthService,
        RegistrationService,
        VerificationService,
        SessionsService,
        PasswordsService,
        ...(infrastructure ? [AuthMails, JwtPrincipalResolver] : []),
      ],
    };
  }
}
