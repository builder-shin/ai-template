import { resources } from "@/resources";
import { ResourcePage } from "@/components/resource/page";
export default async function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  return <ResourcePage registry={resources} type={type} id={id} screen="edit" />;
}
