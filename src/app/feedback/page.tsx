import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { ProfileMenu } from "@/components/profile-menu";
import { requireSession } from "@/lib/firebase/session";

export const metadata: Metadata = {
  title: "Send Feedback | Branchback",
};

export default async function FeedbackPage() {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-[72px] items-center gap-4 border-b border-border/60 bg-background px-8">
        <BrandMark href="/" />
        <div className="ml-auto">
          <ProfileMenu user={session} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Feedback
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Send feedback
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Share bugs, rough edges, or ideas that would make Branchback easier
            to use.
          </p>
        </div>

        <section className="rounded-xl border border-border/60 bg-background p-6">
          <FeedbackForm userEmail={session.email} />
        </section>
      </main>
    </div>
  );
}
