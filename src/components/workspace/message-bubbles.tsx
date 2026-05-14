import { cn } from "@/lib/utils";

export function AssistantBubble({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <div
      className={cn(
        "max-w-[80%] self-start rounded-2xl rounded-bl-sm border px-4 py-2.5 text-[14px] leading-relaxed",
        tone === "default"
          ? "border-border/60 bg-background"
          : "border-transparent bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

export function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-[14px] leading-relaxed text-background">
      {children}
    </div>
  );
}

export function AgentLabel() {
  return (
    <div className="self-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Branchback
    </div>
  );
}
