import "server-only";

import { consumeLLMQuota } from "@/server/rateLimit";

// One-shot prose LLM call against the configured OpenAI-compatible endpoint.
// Mirrors the env-var contract used by src/server/orchestrator/openai.ts but
// without `response_format: json_object` — callers want free prose, not a
// structured action. Used by the /clarify endpoint where the model needs to
// compare options conversationally rather than emit a recommendation/question.

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface Config {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

function loadConfig(): Config {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Clarification requires an OpenAI-compatible LLM.",
    );
  }
  const baseUrl = process.env.LLM_BASE_URL;
  if (!baseUrl) {
    throw new Error("LLM_BASE_URL is not set.");
  }
  const model = process.env.LLM_MODEL;
  if (!model) {
    throw new Error("LLM_MODEL is not set.");
  }
  return {
    baseUrl,
    model,
    apiKey,
    temperature: process.env.LLM_TEMPERATURE
      ? Number(process.env.LLM_TEMPERATURE)
      : 0.5,
    maxTokens: process.env.LLM_CLARIFY_MAX_TOKENS
      ? Number(process.env.LLM_CLARIFY_MAX_TOKENS)
      : 600,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? "60000"),
  };
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

export interface DirectLLMResult {
  content: string;
  modelId: string;
  providerId: "openai";
  latencyMs: number;
}

export async function callDirectLLM(
  messages: Message[],
  userId: string,
): Promise<DirectLLMResult> {
  await consumeLLMQuota(userId);
  const cfg = loadConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  const start = Date.now();

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`llm_http_${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as ChatResponse;
  if (data.error?.message) throw new Error(`llm_error: ${data.error.message}`);
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("llm_empty_response");
  return {
    content,
    modelId: cfg.model,
    providerId: "openai",
    latencyMs: Date.now() - start,
  };
}
