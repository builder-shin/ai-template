export type StrictRule =
  | "login.ip"
  | "login.identifier"
  | "registration.ip"
  | "mail.ip"
  | "mail.email"
  | "password_change.user";
export const STRICT_RULES: Readonly<
  Record<
    StrictRule,
    {
      setting:
        | "RATE_LIMIT_LOGIN_IP"
        | "RATE_LIMIT_LOGIN_IDENTIFIER"
        | "RATE_LIMIT_REGISTRATION_IP"
        | "RATE_LIMIT_MAIL_IP"
        | "RATE_LIMIT_MAIL_EMAIL"
        | "RATE_LIMIT_PASSWORD_CHANGE_USER";
      windowSeconds: 60 | 3600;
    }
  >
> = {
  "login.ip": { setting: "RATE_LIMIT_LOGIN_IP", windowSeconds: 60 },
  "login.identifier": { setting: "RATE_LIMIT_LOGIN_IDENTIFIER", windowSeconds: 60 },
  "registration.ip": { setting: "RATE_LIMIT_REGISTRATION_IP", windowSeconds: 3600 },
  "mail.ip": { setting: "RATE_LIMIT_MAIL_IP", windowSeconds: 3600 },
  "mail.email": { setting: "RATE_LIMIT_MAIL_EMAIL", windowSeconds: 3600 },
  "password_change.user": { setting: "RATE_LIMIT_PASSWORD_CHANGE_USER", windowSeconds: 3600 },
};
