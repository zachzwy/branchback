import { BrandMark } from "@/components/brand-mark";
import { ProfileMenu } from "@/components/profile-menu";
import { WorkspaceTabs, type WorkspaceTab } from "./workspace-tabs";

interface HeaderUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

interface Props {
  projectId: string;
  projectName: string;
  activeTab: WorkspaceTab;
  briefReady: boolean;
  user: HeaderUser;
}

export function WorkspaceHeader({
  projectId,
  projectName,
  activeTab,
  briefReady,
  user,
}: Props) {
  return (
    <header className="relative z-50 flex h-[72px] items-center gap-4 border-b border-border/60 bg-background/80 px-8 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-4">
        <BrandMark href="/" className="text-foreground" />
        <span className="hidden truncate text-sm text-muted-foreground sm:inline">
          {projectName}
        </span>
      </div>
      <div className="ml-auto flex h-10 items-center gap-3">
        <div className="hidden md:block">
          <WorkspaceTabs
            active={activeTab}
            projectId={projectId}
            briefReady={briefReady}
          />
        </div>
        <ProfileMenu user={user}>
          <WorkspaceTabs
            active={activeTab}
            projectId={projectId}
            briefReady={briefReady}
            className="flex-col !items-start gap-0"
          />
        </ProfileMenu>
      </div>
    </header>
  );
}
