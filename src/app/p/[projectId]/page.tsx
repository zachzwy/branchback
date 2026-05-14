import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationPanel } from "@/components/workspace/conversation-panel";
import { PhaseSidebar } from "@/components/workspace/phase-sidebar";
import { ProductStoryPanel } from "@/components/workspace/product-story-panel";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import type { WorkspaceTab } from "@/components/workspace/workspace-tabs";
import { DecisionGraph } from "@/components/graph/decision-graph";
import { getRepository } from "@/lib/db";
import { getSession, requireSession } from "@/lib/firebase/session";
import { summarizeProductTitle } from "@/server/productSummary";
import { isBriefStale } from "@/server/brief/compile";

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string; d?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const session = await getSession();
  if (!session) return { title: "Branchback" };
  const { projectId } = await params;
  const workspace = await getRepository().getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  if (!workspace) return { title: "Branchback" };
  const title = summarizeProductTitle({
    project: workspace.project,
    decisions: workspace.decisions,
    snapshot: workspace.latestSnapshot,
  });
  return { title: `${title} | Branchback` };
}

function resolveTab(raw: string | undefined): WorkspaceTab {
  return raw === "graph" ? "graph" : "conversation";
}

export default async function WorkspacePage({
  params,
  searchParams,
}: PageProps) {
  const session = await requireSession();
  const { projectId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = resolveTab(tabParam);

  const repo = getRepository();
  const [snapshot, briefs] = await Promise.all([
    repo.getProjectWorkspace({ userId: session.uid, projectId }),
    repo.listBriefs({ userId: session.uid, projectId }),
  ]);
  if (!snapshot) notFound();

  const projectTitle = summarizeProductTitle({
    project: snapshot.project,
    decisions: snapshot.decisions,
    snapshot: snapshot.latestSnapshot,
  });

  const latestBrief = briefs[briefs.length - 1] ?? null;
  const isComplete = snapshot.phases.every((p) => p.status === "complete");
  const isStale = latestBrief
    ? isBriefStale(
        latestBrief,
        snapshot.decisions,
        snapshot.edges,
        snapshot.project.currentDecisionId,
      )
    : true;

  return (
    <div className="flex h-screen flex-col">
      <WorkspaceHeader
        projectId={snapshot.project.id}
        projectName={projectTitle}
        activeTab={tab}
        briefReady={isComplete}
        user={session}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PhaseSidebar phases={snapshot.phases} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {tab === "graph" ? (
            <DecisionGraph
              project={snapshot.project}
              decisions={snapshot.decisions}
              edges={snapshot.edges}
              briefs={briefs}
            />
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
              <ConversationPanel
                projectId={snapshot.project.id}
                messages={snapshot.messages}
                isComplete={isComplete}
                latestBriefId={!isStale && latestBrief ? latestBrief.id : null}
              />
              <ProductStoryPanel
                payload={snapshot.latestSnapshot?.payload ?? null}
                decisionsCount={snapshot.decisions.length}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
