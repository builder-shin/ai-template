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
export {
  registrationCreateDocumentSchema,
  emailVerificationRequestCreateDocumentSchema,
  emailVerificationCreateDocumentSchema,
  sessionCreateDocumentSchema,
  sessionRevocationCreateDocumentSchema,
} from "./schemas.js";
