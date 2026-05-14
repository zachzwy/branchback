import { toast } from "sonner";

function formatRetryIn(retryAt: string): string {
  const ms = new Date(retryAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "a moment";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

// Show a user-friendly toast for a non-OK fetch Response. Never leaks raw
// server text to the UI.
export async function toastResponseError(
  res: Response,
  fallbackTitle: string,
): Promise<void> {
  if (res.status === 429) {
    let limit = 100;
    let retryAt: string | null = null;
    try {
      const body = (await res.json()) as { retryAt?: string; limit?: number };
      retryAt = body.retryAt ?? null;
      if (body.limit) limit = body.limit;
    } catch {
      // ignore parse failure — fall through to generic message
    }
    toast.error("Daily AI limit reached", {
      description: retryAt
        ? `You've used all ${limit} AI calls in the last 24h. Resets in ${formatRetryIn(retryAt)}.`
        : "Try again later.",
    });
    return;
  }
  if (res.status === 401) {
    toast.error("Please sign in again");
    return;
  }
  toast.error(fallbackTitle, { description: "Please try again." });
}

const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong password.",
  "auth/user-not-found": "No account with that email.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "That doesn't look like a valid email.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/popup-blocked": "Sign-in popup was blocked. Allow popups and try again.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/too-many-requests": "Too many attempts. Try again later.",
};

// Show a user-friendly toast for a caught (non-Response) error such as a
// network failure, clipboard rejection, or auth SDK error. Never leaks raw
// error.message text.
export function toastThrownError(err: unknown, fallbackTitle: string): void {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === "string" && FIREBASE_AUTH_MESSAGES[code]) {
    toast.error(fallbackTitle, { description: FIREBASE_AUTH_MESSAGES[code] });
    return;
  }
  toast.error(fallbackTitle, { description: "Please try again." });
}
