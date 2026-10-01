import type { ReactNode } from "react";
import { PostRealtime } from "../../../../features/posts";

export default async function PostLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PostRealtime key={id} id={id}>
      {children}
    </PostRealtime>
  );
}
