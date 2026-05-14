import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { getSession } from "@/lib/firebase/session";
import { compileAndPersistBrief } from "@/server/brief/persist";
import { buildExportZip } from "@/server/export/build";
import { RateLimitExceededError, rateLimitResponse } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RouteCtx {
  params: Promise<{ projectId: string }>;
}

export async function GET(_req: Request, ctx: RouteCtx) {
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

  // Include the latest brief — generate one on the fly if none has been
  // persisted yet (e.g. user hits export before visiting /brief).
  let brief = await repo.getLatestBrief({
    userId: session.uid,
    projectId,
  });
  if (!brief) {
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
  }

  const { filename, buffer } = await buildExportZip({
    project: workspace.project,
    messages: workspace.messages,
    decisions: workspace.decisions,
    edges: workspace.edges,
    brief,
  });

  // RFC 5987 filename* covers non-ASCII concept names; the plain filename=
  // form is the fallback for older clients.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-length": String(buffer.length),
      "content-disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
      "cache-control": "no-store",
    },
  });
}
