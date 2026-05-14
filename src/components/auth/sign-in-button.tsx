"use client";

import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { toast } from "sonner";
import { toastThrownError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFirebaseAuth, googleProvider, appleProvider } from "@/lib/firebase/client";

type AuthMode = "sign-in" | "sign-up";

export function SignInButton() {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const finishSignIn = async (idToken: string) => {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      throw new Error("session_exchange_failed");
    }
    const next = search.get("from") ?? "/";
    router.replace(next);
    router.refresh();
  };

  const onGoogleClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken(true);
      await finishSignIn(idToken);
    } catch (err) {
      toastThrownError(err, "Sign-in failed");
      setPending(false);
    }
  };

  const onEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const auth = getFirebaseAuth();
      if (mode === "sign-up") {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const trimmedName = name.trim();
        if (trimmedName) {
          await updateProfile(cred.user, { displayName: trimmedName });
        }
        await sendEmailVerification(cred.user);
        await signOut(auth);
        setMode("sign-in");
        setPassword("");
        toast.success("Check your email to verify your account.", {
          description: "After verifying, come back here and sign in.",
        });
        setPending(false);
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);
      await cred.user.reload();
      if (!auth.currentUser?.emailVerified) {
        await sendEmailVerification(auth.currentUser ?? cred.user);
        await signOut(auth);
        toast.error("Please verify your email first", {
          description: "We sent a new verification email.",
        });
        setPending(false);
        return;
      }
      const idToken = await cred.user.getIdToken(true);
      await finishSignIn(idToken);
    } catch (err) {
      toastThrownError(
        err,
        mode === "sign-up" ? "Sign-up failed" : "Sign-in failed",
      );
      setPending(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-border/60 bg-background p-5 text-left">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition data-[active=true]:bg-background data-[active=true]:shadow-sm"
          data-active={mode === "sign-in"}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("sign-up")}
          className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition data-[active=true]:bg-background data-[active=true]:shadow-sm"
          data-active={mode === "sign-up"}
        >
          Sign up
        </button>
      </div>

      <form
        onSubmit={onEmailSubmit}
        className="flex flex-col gap-3"
        autoComplete="off"
      >
        {mode === "sign-up" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              placeholder="Your name"
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            placeholder="john@polaris.com"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={6}
            placeholder="At least 6 characters"
            required
          />
        </label>
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? mode === "sign-up"
              ? "Creating account..."
              : "Signing in..."
            : mode === "sign-up"
              ? "Create account"
              : "Sign in with email"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        size="lg"
        variant="outline"
        onClick={onGoogleClick}
        disabled={pending}
      >
        Continue with Google
      </Button>
    </div>
  );
}
