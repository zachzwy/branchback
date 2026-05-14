import "server-only";

import { makeSynthesizer, type SynthProvider } from "./_shared";
import { consumeLLMQuota } from "@/server/rateLimit";
import type { BriefSynthesizer } from "./types";

const DEFAULT_MAX_TOKENS = 768;

interface OpenAIConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

function loadConfig(): OpenAIConfig {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. The OpenAI-compatible brief synthesizer requires an API key.",
    );
  }
  const baseUrl = process.env.LLM_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "LLM_BASE_URL is not set. Point it at an OpenAI-compatible /chat/completions root.",
    );
  }
  const model =
    process.env.LLM_BRIEF_MODEL ?? process.env.LLM_MODEL;
  if (!model) {
    throw new Error(
      "LLM_MODEL (or LLM_BRIEF_MODEL) is not set. Set it to the model identifier expected by your provider.",
    );
  }
  const tempRaw =
    process.env.LLM_BRIEF_TEMPERATURE ?? process.env.LLM_TEMPERATURE;
  const maxTokRaw =
    process.env.LLM_BRIEF_MAX_TOKENS ?? process.env.LLM_MAX_TOKENS;
  return {
    baseUrl,
    model,
    apiKey,
    temperature: tempRaw ? Number(tempRaw) : 0.5,
    maxTokens: maxTokRaw ? Number(maxTokRaw) : DEFAULT_MAX_TOKENS,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? "60000"),
  };
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function callOpenAI(
  cfg: OpenAIConfig,
  prompt: string,
  userId: string,
): Promise<{ content: string }> {
  await consumeLLMQuota(userId);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);

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
        messages: [{ role: "user", content: prompt }],
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        response_format: { type: "json_object" },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`llm_http_${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as OpenAIChatResponse;
  if (data.error?.message) throw new Error(`llm_error: ${data.error.message}`);
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("llm_empty_response");
  return { content };
}

function buildProvider(): SynthProvider {
  const cfg = loadConfig();
  return {
    modelId: cfg.model,
    providerId: "openai",
    routingPolicy: "openai_compatible",
    moduleBase: "brief_synthesizer_openai",
    call: (prompt, ctx) => callOpenAI(cfg, prompt, ctx.userId),
  };
}

export function createOpenAIBriefSynthesizer(): BriefSynthesizer {
  return makeSynthesizer(buildProvider);
}
