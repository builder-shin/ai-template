import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./users.tsp";

using Http;
using OpenAPI;

namespace Platform;

model RegistrationAttributes {
  email: string;
  createdAt: utcDateTime;
}

model RegistrationRelationships {
  user: JsonApi.ToOne<"users">;
}

model RegistrationCreateAttributes {
  @format("email") email: string;
  @minLength(8) @maxLength(128) password: string;
  @minLength(1) @maxLength(100) name: string;

  /** 생략하면 Accept-Language로 정한다. */
  locale?: Locale;
}

model RegistrationResource is JsonApi.ResourceWithRelationships<
  "registrations",
  RegistrationAttributes,
  RegistrationRelationships
>;

model RegistrationDocument is JsonApi.Document<RegistrationResource>;
model RegistrationCreateDocument is JsonApi.CreateDocument<
  "registrations",
  RegistrationCreateAttributes
>;

model EmailVerificationRequestCreateAttributes {
  @format("email") email: string;
}

model EmailVerificationRequestCreateDocument is JsonApi.CreateDocument<
  "email-verification-requests",
  EmailVerificationRequestCreateAttributes
>;

model EmailVerificationAttributes {
  verifiedAt: utcDateTime;
}

model EmailVerificationCreateAttributes {
  /** 인증 메일에 담긴 토큰. */
  token: string;
}

model EmailVerificationResource is JsonApi.Resource<
  "email-verifications",
  EmailVerificationAttributes
>;

model EmailVerificationDocument is JsonApi.Document<EmailVerificationResource>;
model EmailVerificationCreateDocument is JsonApi.CreateDocument<
  "email-verifications",
  EmailVerificationCreateAttributes
>;

model PasswordResetRequestCreateAttributes {
  @format("email") email: string;
}

model PasswordResetRequestCreateDocument is JsonApi.CreateDocument<
  "password-reset-requests",
  PasswordResetRequestCreateAttributes
>;

model PasswordResetAttributes {
  createdAt: utcDateTime;
}

model PasswordResetCreateAttributes {
  /** 재설정 메일에 담긴 토큰. */
  token: string;

  @minLength(8) @maxLength(128) password: string;
}

model PasswordResetResource is JsonApi.Resource<"password-resets", PasswordResetAttributes>;
model PasswordResetDocument is JsonApi.Document<PasswordResetResource>;
model PasswordResetCreateDocument is JsonApi.CreateDocument<
  "password-resets",
  PasswordResetCreateAttributes
>;

model PasswordChangeAttributes {
  createdAt: utcDateTime;
}

model PasswordChangeCreateAttributes {
  currentPassword: string;
  @minLength(8) @maxLength(128) newPassword: string;
}

model PasswordChangeResource is JsonApi.Resource<"password-changes", PasswordChangeAttributes>;
model PasswordChangeDocument is JsonApi.Document<PasswordChangeResource>;
model PasswordChangeCreateDocument is JsonApi.CreateDocument<
  "password-changes",
  PasswordChangeCreateAttributes
>;

union OAuthProvider {
  "google",
  "kakao",
  "naver",
}

@route("/api/v1/registrations")
@tag("registrations")
interface Registrations {
  /** 가입하고 인증 메일을 보낸다. 이미 쓰는 이메일이면 validation.already_taken(422). */
  @post
  create(...JsonApi.Body<RegistrationCreateDocument>):
    | JsonApi.Created<RegistrationDocument>
    | CreateErrors
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/email-verification-requests")
@tag("email-verifications")
interface EmailVerificationRequests {
  /** 인증 메일을 다시 보낸다. 계정이 있는지 드러내지 않도록 항상 202를 돌려준다. */
  @post
  create(...JsonApi.Body<EmailVerificationRequestCreateDocument>):
    | JsonApi.Accepted
    | CreateErrors
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/email-verifications")
@tag("email-verifications")
interface EmailVerifications {
  /** 토큰이 틀리거나 만료되면 auth.verification_token_invalid(422). */
  @post
  create(...JsonApi.Body<EmailVerificationCreateDocument>):
    | JsonApi.Created<EmailVerificationDocument>
    | CreateErrors
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/password-reset-requests")
@tag("passwords")
interface PasswordResetRequests {
  /** 재설정 메일을 보낸다. 계정이 있는지 드러내지 않도록 항상 202를 돌려준다. */
  @post
  create(...JsonApi.Body<PasswordResetRequestCreateDocument>):
    | JsonApi.Accepted
    | CreateErrors
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/password-resets")
@tag("passwords")
interface PasswordResets {
  /** 토큰으로 비밀번호를 바꾸고 모든 세션을 폐기한다. */
  @post
  create(...JsonApi.Body<PasswordResetCreateDocument>):
    | JsonApi.Created<PasswordResetDocument>
    | CreateErrors
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/password-changes")
@tag("passwords")
@useAuth(BearerAuth)
interface PasswordChanges {
  /** 현재 세션을 뺀 나머지 세션을 폐기하고 남은 비밀번호 재설정 토큰을 지운다. 사용자별 엄격한 레이트 리밋이 있다. */
  @post
  create(...JsonApi.Body<PasswordChangeCreateDocument>):
    | JsonApi.Created<PasswordChangeDocument>
    | AuthErrors
    | Conflict
    | BodyErrors
    | CommonErrors;
}

/** 소셜 로그인 리다이렉트. 본문이 없는 JSON:API 예외 엔드포인트다. */
@route("/api/v1/oauth/{provider}")
@tag("oauth")
interface OAuth {
  /** 제공자 로그인 화면으로 보낸다. redirectUri는 허용 목록으로 검사한다. state와 PKCE(S256)를 붙인다. 세 제공자 모두 PKCE를 지원한다. codeChallenge는 BFF가 만든 code verifier의 S256 challenge(base64url, 43자)다. 콜백이 넘긴 1회용 코드는 같은 verifier(`POST /sessions`의 codeVerifier)로만 토큰으로 바꿀 수 있다(로그인 CSRF 방지). */
  @get
  @route("authorize")
  authorize(@path provider: OAuthProvider, @query redirectUri: url, @query codeChallenge: string):
    | {
        @statusCode _: 302;
        @header location: url;
      }
    | BadRequest
    | NotFound
    | TooManyRequests
    | InternalServerError;

  /** 제공자가 돌아오는 곳. 성공하면 1회용 코드(60초)를 code로 붙여 프론트 콜백으로 보낸다. 실패하면 code 대신 error(auth.oauth_denied, auth.oauth_failed, auth.account_deactivated)를 붙여 보낸다. state가 없거나 만료됐으면 돌려보낼 곳을 모르므로 400이다. */
  @get
  @route("callback")
  callback(
    @path provider: OAuthProvider,
    @query state: string,
    @query code?: string,
    @query error?: string,
  ):
    | {
        @statusCode _: 302;
        @header location: url;
      }
    | BadRequest
    | NotFound
    | TooManyRequests
    | InternalServerError;
}
