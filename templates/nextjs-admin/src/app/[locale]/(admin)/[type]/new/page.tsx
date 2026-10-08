import { resources } from "@/resources";
import { ResourcePage } from "@/components/resource/page";
export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  return <ResourcePage registry={resources} type={(await params).type} screen="create" />;
}
