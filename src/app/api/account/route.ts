import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { getAdminAuth } from "@/lib/firebase/admin";
import { clearSession, getSession } from "@/lib/firebase/session";

export const runtime = "nodejs";

function isUserAlreadyDeleted(err: unknown): boolean {
  return (err as { code?: string }).code === "auth/user-not-found";
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  await getRepository().deleteUserData({ userId: session.uid });

  try {
    await getAdminAuth().deleteUser(session.uid);
  } catch (err) {
    if (!isUserAlreadyDeleted(err)) {
      throw err;
    }
  }

  await clearSession();
  return NextResponse.json({ ok: true });
}
