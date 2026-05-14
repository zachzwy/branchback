import "server-only";

import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";

const DEFAULT_WINDOW_HOURS = 24;

function getLimit(): number {
  const raw = process.env.LLM_RATE_LIMIT_PER_DAY;
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function getWindowMs(): number {
  const raw = process.env.LLM_RATE_LIMIT_WINDOW_HOURS;
  const hours = raw ? Number(raw) : DEFAULT_WINDOW_HOURS;
  const safeHours =
    Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_WINDOW_HOURS;
  return Math.floor(safeHours * 60 * 60 * 1000);
}

export class RateLimitExceededError extends Error {
  readonly retryAt: string;
  readonly limit: number;
  constructor(retryAt: string, limit: number) {
    super("rate_limited");
    this.name = "RateLimitExceededError";
    this.retryAt = retryAt;
    this.limit = limit;
  }
}

export async function consumeLLMQuota(userId: string): Promise<void> {
  const limit = getLimit();
  if (limit <= 0) return;
  const windowMs = getWindowMs();
  const result = await getRepository().consumeLLMQuota({
    userId,
    limit,
    windowMs,
  });
  if (!result.allowed) {
    throw new RateLimitExceededError(result.resetAt, limit);
  }
}

export function rateLimitResponse(err: RateLimitExceededError): NextResponse {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((new Date(err.retryAt).getTime() - Date.now()) / 1000),
  );
  return NextResponse.json(
    { error: "rate_limited", retryAt: err.retryAt, limit: err.limit },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}
