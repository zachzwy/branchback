import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { DeleteAccountButton } from "@/components/account/delete-account-button";
import { BrandMark } from "@/components/brand-mark";
import { ProfileMenu } from "@/components/profile-menu";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/firebase/session";

export const metadata: Metadata = {
  title: "Account Settings | Branchback",
};

export default async function AccountSettingsPage() {
  const session = await requireSession();
  const displayName = session.name ?? session.email?.split("@")[0] ?? "Account";

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-[72px] items-center gap-4 border-b border-border/60 bg-background px-8">
        <BrandMark href="/" />
        <div className="ml-auto">
          <ProfileMenu user={session} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Account
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Account settings
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Review the Google profile currently connected to Branchback.
          </p>
        </div>

        <section className="rounded-xl border border-border/60 bg-background p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-lg font-semibold text-white dark:bg-blue-500">
              {session.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.picture}
                  alt={`${displayName} profile photo`}
                  className="size-full object-cover"
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">
                {displayName}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {session.email ?? "No email available"}
              </div>
            </div>
            <Badge variant="secondary">Google account</Badge>
          </div>

          <div className="mt-6 grid gap-3 text-sm">
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Mail className="size-4" />
                Email
              </div>
              <div className="break-words font-medium">
                {session.email ?? "No email available"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-destructive/30 bg-background p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-base font-semibold tracking-tight">
                Delete account
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Permanently delete your Branchback account and saved projects.
                This action cannot be undone.
              </p>
            </div>
            <DeleteAccountButton email={session.email} />
          </div>
        </section>
      </main>
    </div>
  );
}
