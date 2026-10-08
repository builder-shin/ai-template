import { resources } from "@/resources";
import { ResourcePage } from "@/components/resource/page";
import type { ResourceSearchParams } from "@/lib/resources/query";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<ResourceSearchParams>;
}) {
  const { type } = await params;
  return (
    <ResourcePage
      registry={resources}
      type={type}
      screen="list"
      searchParams={await searchParams}
    />
  );
}
