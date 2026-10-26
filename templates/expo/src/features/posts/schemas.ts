import { z } from "zod";
export const postSchema = z.object({
  title: z.string().trim().min(1, "postTitleLength").max(200, "postTitleLength"),
  body: z.string().max(100000, "postBodyLength"),
  status: z.enum(["draft", "published"]),
});
export function postId(value: unknown): string | null {
  const result = z.uuid().safeParse(value);
  return result.success ? result.data : null;
}
