import type { createApiClient } from "../../lib/api/client";
import type { components } from "../../lib/api/generated/schema";
export type PostDocument = components["schemas"]["PostDocument"];
export type PostCollection = components["schemas"]["PostCollectionDocument"];
export type PostResource = components["schemas"]["PostResource"];
export type PostCreateInput = Pick<
  components["schemas"]["PostCreateDocument"]["data"],
  "attributes" | "relationships"
>;
export type PostUpdateInput = Pick<
  components["schemas"]["PostUpdateDocument"]["data"],
  "attributes" | "relationships"
>;
export interface PostListInput {
  page?: number;
  size?: number;
  author?: string;
  status?: components["schemas"]["PostStatus"];
  q?: string;
}
export class PostsApi {
  constructor(private readonly client: ReturnType<typeof createApiClient>) {}
  async list(input: PostListInput, signal?: AbortSignal): Promise<PostCollection> {
    const { data } = await this.client.GET("/posts", {
      params: {
        query: {
          "page[number]": input.page ?? 1,
          "page[size]": input.size ?? 20,
          include: "author,coverImage",
          sort: "-createdAt",
          ...(input.author ? { "filter[author]": input.author } : {}),
          ...(input.status ? { "filter[status]": input.status } : {}),
          ...(input.q ? { "filter[q]": input.q } : {}),
        },
      },
      ...(signal ? { signal } : {}),
    });
    if (!data) throw new Error("Missing posts response.");
    return data;
  }
  async get(id: string, signal?: AbortSignal): Promise<PostDocument> {
    const { data } = await this.client.GET("/posts/{id}", {
      params: { path: { id }, query: { include: "author,coverImage" } },
      ...(signal ? { signal } : {}),
    });
    if (!data) throw new Error("Missing post response.");
    return data;
  }
  async create(input: PostCreateInput): Promise<PostDocument> {
    const { data } = await this.client.POST("/posts", {
      body: { data: { type: "posts", ...input } },
    });
    if (!data) throw new Error("Missing created post.");
    return data;
  }
  async update(id: string, input: PostUpdateInput): Promise<PostDocument> {
    const { data } = await this.client.PATCH("/posts/{id}", {
      params: { path: { id } },
      body: { data: { type: "posts", id, ...input } },
    });
    if (!data) throw new Error("Missing updated post.");
    return data;
  }
  async remove(id: string): Promise<void> {
    await this.client.DELETE("/posts/{id}", { params: { path: { id } } });
  }
}
