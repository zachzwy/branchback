import Link from "next/link";
import { Check } from "lucide-react";
import type { AcknowledgementPayload } from "@/lib/db/types";

export function AcknowledgementBar({
  projectId,
  payload,
}: {
  projectId: string;
  payload: AcknowledgementPayload;
}) {
  return (
    <div className="flex max-w-[90%] items-center gap-3 self-start rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-2 text-[15.6px] text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
      <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
      <div className="flex-1 leading-snug">
        <span className="font-medium">Noted: </span>
        <span>{payload.text}</span>
        {payload.affects.length > 0 && (
          <span className="text-emerald-800/80 dark:text-emerald-200/80">
            {" — shapes "}
            {payload.affects.join(", ")}
            {"."}
          </span>
        )}
      </div>
      <Link
        href={`/p/${projectId}/trail#decision-${payload.decisionId}`}
        className="shrink-0 text-emerald-800 underline-offset-2 transition hover:underline dark:text-emerald-200"
      >
        view reasoning →
      </Link>
    </div>
  );
}
