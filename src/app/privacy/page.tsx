import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ProfileMenu } from "@/components/profile-menu";
import { getSession } from "@/lib/firebase/session";

export const metadata: Metadata = {
  title: "Privacy Policy | Branchback",
};

const sections = [
  {
    title: "Information you provide",
    body: "We collect information you provide directly, including your account profile, project ideas, conversation messages, product decisions, generated briefs, feedback, and account deletion requests.",
  },
  {
    title: "Information from authentication providers",
    body: "When you sign in with Google or email, Firebase Authentication provides account information such as your user identifier, email address, display name, and profile photo when available.",
  },
  {
    title: "How we use information",
    body: "We use information to authenticate you, operate your workspace, save and restore projects, generate planning artifacts, maintain security, troubleshoot bugs, respond to feedback, and improve Branchback.",
  },
  {
    title: "Generated and derived data",
    body: "Branchback may derive structured decisions, summaries, project snapshots, briefs, and handoff prompts from your inputs. These derived records are treated as your project content inside your account.",
  },
  {
    title: "Service providers",
    body: "We may use trusted service providers for authentication, hosting, storage, analytics, email handling, error monitoring, and model processing. These providers process information only as needed to provide their services to Branchback.",
  },
  {
    title: "Sharing",
    body: "We do not sell your project content. We may disclose information when required by law, to protect rights and safety, to prevent abuse, or as part of a business transfer such as a merger, acquisition, or financing.",
  },
  {
    title: "Retention",
    body: "We retain account and project information while your account is active or as needed to provide the service. When you delete your account, Branchback attempts to remove your saved project data and authentication account, subject to legal, security, and backup limitations.",
  },
  {
    title: "Security",
    body: "We use reasonable technical and organizational measures designed to protect information. No online service can guarantee perfect security, so you should avoid submitting secrets or regulated data unless you are comfortable doing so.",
  },
  {
    title: "Your choices",
    body: "You can sign out from the profile menu and delete your account from Account Settings. You can also contact us through feedback if you have questions about access, correction, deletion, or privacy handling.",
  },
  {
    title: "Children",
    body: "Branchback is not intended for children under 13, and we do not knowingly collect personal information from children under 13.",
  },
  {
    title: "Policy updates",
    body: "We may update this policy as Branchback changes. The latest version will be posted here with an updated effective date.",
  },
];

export default async function PrivacyPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-[72px] items-center gap-4 border-b border-border/60 bg-background px-8">
        <BrandMark href="/" />
        {session && (
          <div className="ml-auto">
            <ProfileMenu user={session} />
          </div>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Legal
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Privacy policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective May 2, 2026
          </p>
        </div>

        <section className="space-y-6 rounded-xl border border-border/60 bg-background p-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            Branchback is designed for private product planning. This Privacy
            Policy explains what information we use, why we use it, and the
            choices you have.
          </p>
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="mb-2 text-base font-semibold text-foreground">
                {section.title}
              </h2>
              <p>{section.body}</p>
            </div>
          ))}
          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              Contact
            </h2>
            <p>
              Privacy questions can be sent through the{" "}
              <Link
                href="/feedback"
                className="text-foreground underline underline-offset-3"
              >
                feedback page
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
