import { expect, it } from "vitest";
import { STRICT_RULES } from "../rules.js";
it.each([
  ["login.ip", "RATE_LIMIT_LOGIN_IP", 60],
  ["login.identifier", "RATE_LIMIT_LOGIN_IDENTIFIER", 60],
  ["registration.ip", "RATE_LIMIT_REGISTRATION_IP", 3600],
  ["mail.ip", "RATE_LIMIT_MAIL_IP", 3600],
  ["mail.email", "RATE_LIMIT_MAIL_EMAIL", 3600],
  ["password_change.user", "RATE_LIMIT_PASSWORD_CHANGE_USER", 3600],
] as const)("엄격 규칙 %s의 설정과 윈도를 선언한다", (rule, setting, windowSeconds) => {
  expect(STRICT_RULES[rule]).toEqual({ setting, windowSeconds });
});
