import "server-only";

import {
  RESPONSE_JSON_SCHEMA,
  makeChatOrchestrator,
  type ChatMessage,
  type ChatProvider,
} from "./_shared";
import type { Orchestrator } from "./types";

const DEFAULT_NUM_PREDICT = 256;

interface OllamaConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  numCtx: number | null;
  numPredict: number;
  timeoutMs: number;
}

function loadConfig(): OllamaConfig {
  const ctxRaw = process.env.OLLAMA_NUM_CTX;
  const predictRaw = process.env.OLLAMA_NUM_PREDICT;
  const tempRaw = process.env.OLLAMA_TEMPERATURE;
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    model: process.env.OLLAMA_MODEL ?? "gemma4:e2b",
    temperature: tempRaw ? Number(tempRaw) : 0.4,
    numCtx: ctxRaw ? Number(ctxRaw) : null,
    numPredict: predictRaw ? Number(predictRaw) : DEFAULT_NUM_PREDICT,
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? "60000"),
  };
}

interface OllamaChatResponse {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

async function callOllama(
  cfg: OllamaConfig,
  messages: ChatMessage[],
): Promise<{ content: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        think: false,
        format: RESPONSE_JSON_SCHEMA,
        messages,
        options: {
          temperature: cfg.temperature,
          num_predict: cfg.numPredict,
          ...(cfg.numCtx ? { num_ctx: cfg.numCtx } : {}),
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ollama_http_${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as OllamaChatResponse;
  if (data.error) throw new Error(`ollama_error: ${data.error}`);
  const content = data.message?.content ?? "";
  if (!content.trim()) throw new Error("ollama_empty_response");
  return { content };
}

function buildProvider(): ChatProvider {
  const cfg = loadConfig();
  return {
    modelId: cfg.model,
    providerId: "ollama",
    routingPolicy: "ollama_local",
    moduleBase: "orchestrator_ollama",
    call: (messages) => callOllama(cfg, messages),
  };
}

export function createOllamaOrchestrator(): Orchestrator {
  return makeChatOrchestrator(buildProvider);
}
