import "server-only";

import { createHash } from "node:crypto";

export function sha256(input: unknown): string {
  const text =
    typeof input === "string" ? input : JSON.stringify(input ?? null);
  return createHash("sha256").update(text).digest("hex");
}
