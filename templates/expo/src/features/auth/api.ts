import type { createApiClient } from "../../lib/api/client";
import type { components } from "../../lib/api/generated/schema";
export class AuthApi {
  constructor(private readonly client: ReturnType<typeof createApiClient>) {}
  async register(attributes: components["schemas"]["RegistrationCreateAttributes"]) {
    await this.client.POST("/registrations", {
      body: { data: { type: "registrations", attributes } },
    });
  }
  async requestVerification(email: string) {
    await this.client.POST("/email-verification-requests", {
      body: { data: { type: "email-verification-requests", attributes: { email } } },
    });
  }
  async verify(token: string) {
    await this.client.POST("/email-verifications", {
      body: { data: { type: "email-verifications", attributes: { token } } },
    });
  }
  async requestReset(email: string) {
    await this.client.POST("/password-reset-requests", {
      body: { data: { type: "password-reset-requests", attributes: { email } } },
    });
  }
  async reset(token: string, password: string) {
    await this.client.POST("/password-resets", {
      body: { data: { type: "password-resets", attributes: { token, password } } },
    });
  }
}
