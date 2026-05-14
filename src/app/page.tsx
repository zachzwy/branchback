import { IntakeForm } from "@/components/intake/intake-form";
import { ProjectList } from "@/components/intake/project-list";
import { MarketingHome } from "@/components/marketing/marketing-home";
import { BrandMark } from "@/components/brand-mark";
import { ProfileMenu } from "@/components/profile-menu";
import { getRepository } from "@/lib/db";
import { getSession } from "@/lib/firebase/session";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    return <MarketingHome />;
  }

  const projects = await getRepository().listProjects({ userId: session.uid });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[72px] items-center justify-between px-8">
        <BrandMark href="/" />
        <div className="flex h-10 items-center gap-3 text-sm">
          <ProfileMenu user={session} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-stretch justify-center gap-12 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
            Branchback
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight">
            What are you building?
          </h1>
          <p className="text-balance text-sm leading-relaxed text-muted-foreground">
            Start with anything rough. We work through it together and quietly
            track every key decision along the way.
          </p>
        </div>

        <div className="flex flex-col gap-12">
          <IntakeForm />
          <ProjectList projects={projects} />
        </div>
      </main>

      <footer className="px-8 py-6 text-center text-[11px] text-muted-foreground">
        Every decision we make together will be quietly tracked, and you can
        revisit any of them at any time.
      </footer>
    </div>
  );
}
