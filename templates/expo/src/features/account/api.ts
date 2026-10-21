import type { createApiClient } from "../../lib/api/client";
import type { components } from "../../lib/api/generated/schema";
export class AccountApi {
  constructor(private readonly client: ReturnType<typeof createApiClient>) {}
  async me(signal?: AbortSignal) {
    const { data } = await this.client.GET("/me", {
      params: { query: { include: "avatar" } },
      ...(signal ? { signal } : {}),
    });
    if (!data) throw new Error("Missing account response.");
    return data;
  }
  async update(
    id: string,
    input: Pick<
      components["schemas"]["UserMeUpdateDocument"]["data"],
      "attributes" | "relationships"
    >,
  ) {
    const { data } = await this.client.PATCH("/me", {
      body: { data: { type: "users", id, ...input } },
    });
    if (!data) throw new Error("Missing updated account.");
    return data;
  }
  async sessions(page = 1, signal?: AbortSignal) {
    const { data } = await this.client.GET("/sessions", {
      params: { query: { "page[number]": page, "page[size]": 20, sort: "-lastUsedAt" } },
      ...(signal ? { signal } : {}),
    });
    if (!data) throw new Error("Missing sessions response.");
    return data;
  }
  async revoke(id: string) {
    await this.client.DELETE("/sessions/{id}", { params: { path: { id } } });
  }
  async revokeOthers() {
    await this.revokeScope("others");
  }
  async revokeAll() {
    await this.revokeScope("all");
  }
  private async revokeScope(scope: "others" | "all") {
    await this.client.POST("/session-revocations", {
      body: { data: { type: "session-revocations", attributes: { scope } } },
    });
  }
}
