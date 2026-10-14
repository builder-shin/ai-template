export { AuthModule } from "./auth.module.js";
export { SessionsService } from "./sessions.service.js";
export { SessionsRepository, type SessionRow, type RefreshRow } from "./sessions.repository.js";
export { JwtPrincipalResolver } from "./principal.resolver.js";
export {
  onSessionsRevoked,
  type SessionRevocation,
  type SessionRevokedReason,
  SESSION_REVOKED_REASONS,
} from "./session-events.js";
export { registerAuthJobs } from "./jobs.js";
export { AuthRepository, type AuthUser, type NewUser } from "./repository.js";
export { RegistrationService } from "./registration.service.js";
export { VerificationService } from "./verification.service.js";
export { AuthMails } from "./mails.js";
export { PasswordsService } from "./passwords.service.js";
export { purgeExpired } from "./purge.js";
export {
  registrationCreateDocumentSchema,
  emailVerificationRequestCreateDocumentSchema,
  emailVerificationCreateDocumentSchema,
  sessionCreateDocumentSchema,
  sessionRevocationCreateDocumentSchema,
  passwordResetRequestCreateDocumentSchema,
  passwordResetCreateDocumentSchema,
  passwordChangeCreateDocumentSchema,
} from "./schemas.js";

export { OAuthClient } from "./oauth/client.js";
export { OAuthState } from "./oauth/state.js";
export { OAuthService } from "./oauth/oauth.service.js";
export { identityFrom } from "./oauth/identity.js";
export { linkAccount } from "./oauth/link.js";
export { challengeFor, verifiesCodeChallenge } from "./oauth/pkce.js";
export type { OAuthProvider, ProviderIdentity } from "./oauth/providers.js";
