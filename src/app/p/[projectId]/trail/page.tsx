import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ d?: string }>;
}

// The reasoning trail used to live here as a linear list. The Decision Graph
// tab on the workspace now renders the same data as a graph; we keep this
// route alive only to redirect existing deep links.
export default async function ReasoningTrailRedirect({
  params,
  searchParams,
}: PageProps) {
  const { projectId } = await params;
  const { d } = await searchParams;
  const qs = new URLSearchParams({ tab: "graph" });
  if (d) qs.set("d", d);
  redirect(`/p/${projectId}?${qs.toString()}`);
}
