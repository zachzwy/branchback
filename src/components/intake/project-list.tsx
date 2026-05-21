import Link from "next/link";
import { FolderOpen } from "lucide-react";
import type { Project } from "@/lib/db/types";

interface Props {
  projects: Project[];
}

export function ProjectList({ projects }: Props) {
  if (projects.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        <FolderOpen className="size-3" />
        Recent Projects
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/p/${p.id}`}
            className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background p-4 transition hover:border-foreground/20 hover:bg-muted/30"
          >
            <div className="truncate text-sm font-medium">{p.name}</div>
            <div className="text-[13.2px] text-muted-foreground">
              Updated {new Date(p.updatedAt).toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
