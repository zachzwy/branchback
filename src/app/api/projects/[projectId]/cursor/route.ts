import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import { getSession } from "@/lib/firebase/session";
import { compileProductStory } from "@/server/productStory/compile";

export const runtime = "nodejs";

const PatchSchema = z.object({
  decisionId: z.string().min(1),
});

interface RouteCtx {
  params: Promise<{ projectId: string }>;
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { projectId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const repo = getRepository();
  try {
    const result = await repo.setCursor({
      userId: session.uid,
      projectId,
      decisionId: parsed.data.decisionId,
    });

    // Re-snapshot Product Story off the new cursor's lineage so the right
    // panel matches the cursor after cross-branch jumps. Phases are already
    // recomputed by setCursor; the workspace re-read picks them up.
    const refreshed = await repo.getProjectWorkspace({
      userId: session.uid,
      projectId,
    });
    if (refreshed) {
      const payload = compileProductStory({
        decisions: refreshed.decisions,
        edges: refreshed.edges,
        cursorId: refreshed.project.currentDecisionId,
      });
      await repo.insertProductStateSnapshot({
        userId: session.uid,
        projectId,
        payload,
        triggeredByDecisionId: parsed.data.decisionId,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    const status =
      msg === "decision_not_found"
        ? 404
        : msg === "project_forbidden"
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
