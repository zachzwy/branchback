import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { getSession } from "@/lib/firebase/session";
import { compileAndPersistBrief } from "@/server/brief/persist";
import { RateLimitExceededError, rateLimitResponse } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RouteCtx {
  params: Promise<{ projectId: string }>;
}

export async function POST(_req: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { projectId } = await ctx.params;
  const repo = getRepository();
  const workspace = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  if (!workspace) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  let brief;
  try {
    brief = await compileAndPersistBrief({
      repo,
      userId: session.uid,
      workspace,
      triggeredByDecisionId: workspace.project.currentDecisionId,
    });
  } catch (err) {
    if (err instanceof RateLimitExceededError) return rateLimitResponse(err);
    throw err;
  }

  return NextResponse.json({ brief });
}
