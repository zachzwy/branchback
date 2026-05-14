"use client";

import { useContext, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MenuContext } from "@/components/profile-menu";

export type WorkspaceTab = "conversation" | "graph";
export type ProjectNavTab = WorkspaceTab | "brief";

interface Props {
  active: ProjectNavTab;
  projectId: string;
  briefReady?: boolean;
  className?: string;
}

const TABS: { key: ProjectNavTab; label: string }[] = [
  { key: "conversation", label: "Conversation" },
  { key: "graph", label: "Decision Graph" },
  { key: "brief", label: "Brief" },
];

export function WorkspaceTabs({
  active,
  projectId,
  briefReady = true,
  className = "",
}: Props) {
  const [notReadyOpen, setNotReadyOpen] = useState(false);
  const menu = useContext(MenuContext);

  return (
    <>
      <div className={cn("flex items-center gap-1 text-sm", className)}>
        {TABS.map((t) => {
          const isMobile = className.includes("flex-col");
          const itemClassName = cn(
            isMobile
              ? "flex w-full items-center px-5 py-3 text-sm font-medium transition hover:bg-accent hover:text-foreground"
              : "rounded-full px-3 py-1 transition",
            active === t.key
              ? isMobile
                ? "bg-foreground/5 text-foreground"
                : "bg-foreground/5 font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          );
          const href =
            t.key === "conversation"
              ? `/p/${projectId}`
              : t.key === "graph"
                ? `/p/${projectId}?tab=graph`
                : `/p/${projectId}/brief`;
          return (
            <Link
              key={t.key}
              href={href}
              className={itemClassName}
              onClick={(event) => {
                if (t.key === "brief") {
                  if (!briefReady) {
                    event.preventDefault();
                    setNotReadyOpen(true);
                  } else {
                    if (menu) menu.close();
                  }
                  return;
                }
                try {
                  localStorage.setItem("branchback:lastTab", t.key);
                } catch {}
                if (menu) menu.close();
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Dialog open={notReadyOpen} onOpenChange={setNotReadyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Brief is not ready yet</DialogTitle>
            <DialogDescription>
              Finish the remaining planning phases before generating the
              Product Founder Brief.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setNotReadyOpen(false)}>
              Keep working
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
