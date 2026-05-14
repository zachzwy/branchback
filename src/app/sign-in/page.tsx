import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import { BrandMark } from "@/components/brand-mark";
import { getSession } from "@/lib/firebase/session";

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[72px] items-center px-8">
        <BrandMark href="/" />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6 py-10 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Sign in or create an account
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Branchback keeps your reasoning trail private to you. Use email or
            Google to start a project.
          </p>
        </div>
        <SignInButton />
        <p className="text-xs leading-relaxed text-muted-foreground">
          By continuing, you agree to the{" "}
          <Link
            href="/terms"
            className="underline underline-offset-3 transition hover:text-foreground"
          >
            Terms of Service
          </Link>{" "}
          and acknowledge the{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-3 transition hover:text-foreground"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
