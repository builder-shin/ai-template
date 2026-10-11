import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { RealtimePublisher } from "../../core/realtime/publisher.js";
import type { AfterCommit } from "../../core/db/unit-of-work.js";
import type { PostResource } from "./schemas.js";
export interface PostEventDeclaration {
  name: string;
  rooms: readonly string[];
  conditionalRooms?: readonly { room: string; when: string }[];
}
@Injectable()
export class PostEvents {
  private declarations: readonly PostEventDeclaration[] = [];
  constructor(private readonly publisher: RealtimePublisher) {}
  register(declarations: readonly PostEventDeclaration[]): void {
    this.declarations = declarations;
  }
  private queue(
    afterCommit: AfterCommit,
    name: string,
    post: z.infer<typeof PostResource>,
    wasPublished = false,
    identifier = false,
  ) {
    const declaration = this.declarations.find((e) => e.name === name);
    if (!declaration) throw new Error(`Missing event declaration ${name}`);
    const authorId = post.relationships.author.data?.id ?? "";
    const rooms = [
      ...declaration.rooms,
      ...(declaration.conditionalRooms ?? [])
        .filter((c) =>
          c.when === "published"
            ? post.attributes.status === "published"
            : c.when === "wasPublished" && wasPublished,
        )
        .map((c) => c.room),
    ].map((r) => r.replace("{authorId}", authorId));
    const snapshot = structuredClone(
      identifier ? { data: { type: "posts", id: post.id } } : { data: post },
    );
    this.publisher.queue(afterCommit, name, rooms, () => snapshot);
  }
  created(afterCommit: AfterCommit, post: z.infer<typeof PostResource>): void {
    this.queue(afterCommit, "post.created", post);
    if (post.attributes.status === "published") this.queue(afterCommit, "post.published", post);
  }
  updated(afterCommit: AfterCommit, post: z.infer<typeof PostResource>, was: string): void {
    if (post.attributes.status === "published" && was !== "published") {
      this.queue(afterCommit, "post.published", post);
      return;
    }
    this.queue(afterCommit, "post.updated", post);
    if (was === "published" && post.attributes.status !== "published")
      this.queue(afterCommit, "post.unpublished", post, true, true);
  }
  deleted(afterCommit: AfterCommit, post: z.infer<typeof PostResource>): void {
    this.queue(afterCommit, "post.deleted", post, post.attributes.status === "published", true);
  }
}
