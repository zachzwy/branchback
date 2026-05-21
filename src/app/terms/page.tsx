import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ProfileMenu } from "@/components/profile-menu";
import { getSession } from "@/lib/firebase/session";

export const metadata: Metadata = {
  title: "Terms of Service | Branchback",
};

const sections = [
  {
    title: "Using Branchback",
    body: "Branchback helps founders and product teams structure early product thinking, capture decisions, and generate planning artifacts. You agree to use the service only for lawful purposes and in a way that does not interfere with the service or other users.",
  },
  {
    title: "Accounts and security",
    body: "You are responsible for the activity that happens through your account. Keep your credentials secure, use accurate account information, and tell us if you believe your account has been compromised.",
  },
  {
    title: "Your content",
    body: "You retain ownership of the ideas, notes, messages, decisions, briefs, and other materials you submit. You grant Branchback the limited rights needed to host, process, display, and operate the service for your account.",
  },
  {
    title: "Generated output",
    body: "Branchback may use automated systems to organize inputs and draft plans. Generated output can be incomplete, outdated, or inaccurate. You are responsible for reviewing and validating output before relying on it for business, legal, financial, technical, or operational decisions.",
  },
  {
    title: "Acceptable use",
    body: "Do not upload content that is unlawful, infringing, malicious, deceptive, or intended to harm people, systems, or the service. Do not attempt to reverse engineer, scrape, overload, bypass access controls, or misuse Branchback infrastructure.",
  },
  {
    title: "Privacy",
    body: "Our Privacy Policy explains how we collect, use, retain, and protect information connected with the service. By using Branchback, you acknowledge that policy.",
  },
  {
    title: "Service changes",
    body: "Branchback is evolving. We may add, change, suspend, or remove features as the product develops. We will try to avoid unnecessary disruption, but uninterrupted or error-free availability is not guaranteed.",
  },
  {
    title: "Account deletion",
    body: "You may delete your account from Account Settings. Deletion is intended to remove your Branchback account and saved project data. Some limited records may be retained when required for security, fraud prevention, legal compliance, or backup integrity.",
  },
  {
    title: "No warranties",
    body: "The service is provided as is and as available, without warranties of any kind to the fullest extent permitted by law. Branchback does not warrant that the service will meet every requirement or that generated output will be accurate or fit for a particular purpose.",
  },
  {
    title: "Limitation of liability",
    body: "To the fullest extent permitted by law, Branchback will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, data, goodwill, or business opportunities.",
  },
  {
    title: "Updates to these terms",
    body: "We may update these terms as the product, law, or business needs change. The updated version will be posted here with a new effective date. Continued use of Branchback after an update means you accept the revised terms.",
  },
];

export default async function TermsPage() {
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
          <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Legal
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Terms of service
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective May 2, 2026
          </p>
        </div>

        <section className="space-y-6 rounded-xl border border-border/60 bg-background p-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            These Terms of Service govern your access to and use of Branchback.
            They are written for clarity, but they do not replace formal legal
            advice for your specific circumstances.
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
              Questions about these terms can be sent through the{" "}
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
