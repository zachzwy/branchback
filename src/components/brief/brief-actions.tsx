"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { toastResponseError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";

interface Props {
  projectId: string;
}

// Pull a filename out of a Content-Disposition header. Falls back to null so
// the caller can synthesize a default. Handles both `filename="x.zip"` and
// the RFC 5987 `filename*=UTF-8''x.zip` form.
function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

export function BriefActions({ projectId }: Props) {
  const router = useRouter();
  const [regenPending, startRegen] = useTransition();
  const [exportPending, startExport] = useTransition();

  const regenerate = () => {
    startRegen(async () => {
      const res = await fetch(`/api/projects/${projectId}/brief/regenerate`, {
        method: "POST",
      });
      if (!res.ok) {
        await toastResponseError(res, "Could not regenerate brief");
        return;
      }
      // Navigate to /brief without ?v= so the page resolves to the new
      // latest version. router.refresh() alone keeps the user pinned to
      // whatever ?v= they were viewing — which would hide the freshly
      // generated brief behind the historical snapshot they came from.
      router.replace(`/p/${projectId}/brief`);
      router.refresh();
      toast.success("Brief regenerated from the latest decisions.");
    });
  };

  const exportZip = () => {
    startExport(async () => {
      const res = await fetch(`/api/projects/${projectId}/export`);
      if (!res.ok) {
        await toastResponseError(res, "Could not export");
        return;
      }
      const blob = await res.blob();
      const filename =
        parseFilenameFromContentDisposition(res.headers.get("content-disposition")) ??
        `${projectId}-export.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export ready.");
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={regenerate}
        disabled={regenPending}
        className="rounded-full"
      >
        <RefreshCw className="size-3.5" />
        {regenPending ? "Regenerating…" : "Regenerate"}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={exportZip}
        disabled={exportPending}
        className="rounded-full"
      >
        <Download className="size-3.5" />
        {exportPending ? "Exporting…" : "Export"}
      </Button>
    </div>
  );
}
