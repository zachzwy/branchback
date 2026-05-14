import { NextResponse } from "next/server";
import { z } from "zod";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebase/admin";
import { clearSession, createSession } from "@/lib/firebase/session";

export const runtime = "nodejs";

const PostSchema = z.object({ idToken: z.string().min(10) });

function isMissingAdminCredentials(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("Could not load the default credentials") ||
    message.includes("failed to fetch a valid Google OAuth2 access token")
  );
}

function isUnverifiedPasswordUser(decoded: DecodedIdToken): boolean {
  return (
    decoded.firebase.sign_in_provider === "password" &&
    decoded.email_verified !== true
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id_token" }, { status: 400 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(parsed.data.idToken);
    if (isUnverifiedPasswordUser(decoded)) {
      return NextResponse.json(
        { error: "email_not_verified" },
        { status: 403 },
      );
    }
    await createSession(parsed.data.idToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissingAdminCredentials(err)) {
      return NextResponse.json(
        {
          error: "firebase_admin_credentials_missing",
          detail:
            "Google sign-in succeeded, but the server cannot create a Firebase session cookie without Admin SDK credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS when running against the real Firebase project.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "verification_failed", detail: (err as Error).message },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
