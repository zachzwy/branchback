import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth } from "./admin";
import { SESSION_COOKIE } from "./session-cookie-name";

export { SESSION_COOKIE };
export const SESSION_TTL_MS = 60 * 60 * 24 * 5 * 1000;

export async function createSession(idToken: string): Promise<string> {
  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_TTL_MS,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return sessionCookie;
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieValue = await readSessionCookie();
  if (!cookieValue) return null;
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(cookieValue, true);
    const picture = (decoded.picture as string | undefined) ?? null;
    const name = (decoded.name as string | undefined) ?? null;
    if (picture && name && decoded.email) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        name,
        picture,
      };
    }
    let user: Awaited<ReturnType<typeof auth.getUser>> | null = null;
    try {
      user = await auth.getUser(decoded.uid);
    } catch {}
    return {
      uid: decoded.uid,
      email: decoded.email ?? user?.email ?? null,
      name: name ?? user?.displayName ?? null,
      picture: picture ?? user?.photoURL ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}
