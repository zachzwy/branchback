import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { BriefActions } from "@/components/brief/brief-actions";
import { BriefVersionList } from "@/components/brief/version-list";
import { HandoffPromptsSection } from "@/components/brief/handoff-prompts";
import { ProfileMenu } from "@/components/profile-menu";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { getRepository } from "@/lib/db";
import type { DecisionNode, GeneratedBrief } from "@/lib/db/types";
import { getSession, requireSession } from "@/lib/firebase/session";
import { compileAndPersistBrief } from "@/server/brief/persist";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ v?: string }>;
}

interface BriefBundle {
  briefs: GeneratedBrief[]; // ordered ascending (v1 first)
  selected: GeneratedBrief | null;
  decisionsById: Map<string, DecisionNode>;
  isReady: boolean;
}

// Versioning model: each Generate / Regenerate writes a new GeneratedBrief
// row. Visiting /brief no longer recompiles; it loads the chosen version
// (?v= or latest) so users can revisit any prior brief verbatim. Only the
// first-ever visit triggers an initial compile, so the page always has
// something to show.
async function loadBriefBundle(args: {
  userId: string;
  projectId: string;
  versionId: string | null;
}): Promise<BriefBundle | null> {
  const repo = getRepository();
  const workspace = await repo.getProjectWorkspace({
    userId: args.userId,
    projectId: args.projectId,
  });
  if (!workspace) return null;
  const isReady = workspace.phases.every((p) => p.status === "complete");

  const decisionsById = new Map<string, DecisionNode>();
  for (const d of workspace.decisions) {
    decisionsById.set(d.id, d);
  }

  let briefs = await repo.listBriefs({
    userId: args.userId,
    projectId: args.projectId,
  });

  if (briefs.length === 0 && isReady) {
    const seed = await compileAndPersistBrief({
      repo,
      userId: args.userId,
      workspace,
      triggeredByDecisionId: workspace.project.currentDecisionId,
    });
    briefs = [seed];
  }
  if (briefs.length === 0) {
    return { briefs, selected: null, decisionsById, isReady };
  }

  const selected =
    (args.versionId && briefs.find((b) => b.id === args.versionId)) ||
    briefs[briefs.length - 1];

  return { briefs, selected, decisionsById, isReady };
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const session = await getSession();
  if (!session) return { title: "Product Founder Brief | Branchback" };
  const { projectId } = await params;
  const { v } = await searchParams;
  const bundle = await loadBriefBundle({
    userId: session.uid,
    projectId,
    versionId: v ?? null,
  });
  if (!bundle) return { title: "Product Founder Brief | Branchback" };
  if (bundle.briefs.length === 0) {
    return { title: "Brief not ready | Branchback" };
  }
  if (!bundle.selected) return { title: "Brief not ready | Branchback" };
  return {
    title: `${bundle.selected.conceptName} Brief | Branchback`,
    description: bundle.selected.tagline,
  };
}

export default async function BriefPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  const { projectId } = await params;
  const { v } = await searchParams;
  const bundle = await loadBriefBundle({
    userId: session.uid,
    projectId,
    versionId: v ?? null,
  });
  if (!bundle) notFound();
  if (bundle.briefs.length === 0) redirect(`/p/${projectId}`);
  if (!bundle.selected) redirect(`/p/${projectId}`);

  const { briefs, selected: brief, decisionsById } = bundle;
  const versionNumber = briefs.findIndex((b) => b.id === brief.id) + 1;
  const isLatest = brief.id === briefs[briefs.length - 1].id;
  const elevatorPitch =
    brief.elevatorPitch ??
    `${brief.conceptName}: ${brief.tagline}`;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-[72px] items-center gap-3 border-b border-border/60 bg-background px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark href="/" className="text-foreground" />
          <Link
            href={`/p/${projectId}`}
            className="hidden truncate text-sm text-muted-foreground transition hover:text-foreground sm:inline"
          >
            {brief.conceptName}
          </Link>
          <Badge variant="secondary" className="rounded-full text-[10px] sm:text-xs">
            v{versionNumber}
            {isLatest ? " · latest" : ""}
          </Badge>
        </div>
        <div className="ml-auto flex h-10 items-center gap-3">
          <div className="hidden md:block">
            <WorkspaceTabs active="brief" projectId={projectId} />
          </div>
          <ProfileMenu user={session}>
            <WorkspaceTabs
              active="brief"
              projectId={projectId}
              className="flex-col !items-start gap-0"
            />
          </ProfileMenu>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <BriefVersionList
          projectId={projectId}
          briefs={briefs}
          selectedBriefId={brief.id}
          decisionsById={decisionsById}
        />

        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
          <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-border/60 bg-foreground px-8 py-10 text-background">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-background/70">
                <BookOpen className="size-3.5" />
                Product Founder Brief — v{versionNumber}
                {!isLatest && " (historical)"}
              </div>
              <BriefActions
                projectId={projectId}
              />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-4xl font-semibold tracking-tight">
                {brief.conceptName}
              </h1>
              <div className="flex flex-col items-end text-[11px] text-background/70">
                <span>
                  {brief.decisionCount}{" "}
                  {brief.decisionCount === 1 ? "decision" : "decisions"} ·{" "}
                  {brief.phasesCompleted}/{brief.phasesTotal} phases done
                </span>
                <span>
                  {new Date(brief.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <Link
                  href={`/p/${projectId}/trail`}
                  className="mt-1 underline-offset-2 transition hover:underline"
                >
                  View source decisions →
                </Link>
              </div>
            </div>
            <p className="max-w-2xl text-base leading-relaxed text-background/80">
              {brief.tagline}
            </p>
            <div className="max-w-3xl rounded-lg border border-background/15 bg-background/10 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-background/60">
                Elevator pitch
              </div>
              <p className="mt-2 text-sm leading-relaxed text-background/85">
                {elevatorPitch}
              </p>
            </div>
          </section>

          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background px-4 py-2 text-xs text-muted-foreground">
            {isLatest
              ? "This is the latest brief. Click Regenerate to compile a new version from your current cursor."
              : "You're viewing a historical brief — a snapshot of an earlier version. Switch to the latest to regenerate."}
          </div>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {brief.sections.map((s) => (
              <article
                key={s.id}
                className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background p-5"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.title}
                </div>
                <div
                  className={cn(
                    "text-[14px] leading-relaxed",
                    s.isPlaceholder
                      ? "italic text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  {s.body}
                </div>
                {s.bullets.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                    {s.bullets.map((b, i) => (
                      <li key={`${s.id}-${i}`} className="flex gap-2">
                        <span className="text-muted-foreground/60">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.sourceDecisionIds.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {s.sourceDecisionIds.map((id) => (
                      <Link
                        key={id}
                        href={`/p/${projectId}?tab=graph&d=${id}`}
                        className="rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground transition hover:border-foreground hover:text-foreground"
                      >
                        view source
                      </Link>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>

          <section className="mt-8 rounded-xl border border-amber-200/70 bg-amber-50 p-5 dark:border-amber-900/40 dark:bg-amber-950/40">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold tracking-tight text-amber-900 dark:text-amber-100">
                {brief.openQuestions.length === 0
                  ? "No open questions remain — nice."
                  : `${brief.openQuestions.length} open question${
                      brief.openQuestions.length === 1 ? "" : "s"
                    } remain`}
              </div>
              {brief.openQuestions.length > 0 && (
                <Link
                  href={`/p/${projectId}`}
                  className="text-xs text-amber-900 underline-offset-2 transition hover:underline dark:text-amber-100"
                >
                  Resume clarifying →
                </Link>
              )}
            </div>
            {brief.openQuestions.length > 0 && (
              <ul className="flex flex-col gap-2 text-[13px]">
                {brief.openQuestions.map((q, i) => (
                  <li
                    key={`${q.phaseKey}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200/40 bg-background/40 px-3 py-2 dark:border-amber-900/30"
                  >
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-300 text-[10px] text-amber-800 dark:border-amber-900/60 dark:text-amber-200"
                    >
                      {q.phaseTitle}
                    </Badge>
                    <span className="flex-1 text-foreground">{q.text}</span>
                    <Link
                      href={`/p/${projectId}`}
                      className="flex items-center gap-1 text-xs text-amber-900 transition hover:underline dark:text-amber-100"
                    >
                      Resume <ArrowRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <HandoffPromptsSection prompts={brief.handoffPrompts ?? []} />
        </main>
      </div>
    </div>
  );
}
