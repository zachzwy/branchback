import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface LoadedPrompt {
  name: string;
  description: string;
  version: string;
  body: string;
  sourcePath: string;
  frontmatter: Record<string, string>;
}

const PROMPTS_ROOT = join(process.cwd(), "src", "server", "prompts");
const cache = new Map<string, LoadedPrompt>();

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function loadPrompt(relativePath: string): LoadedPrompt {
  const cached = cache.get(relativePath);
  if (cached) return cached;

  const sourcePath = join(PROMPTS_ROOT, relativePath);
  const raw = readFileSync(sourcePath, "utf8");

  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(`prompt_missing_frontmatter: ${relativePath}`);
  }
  const frontmatter = parseFrontmatter(match[1]);
  const body = raw.slice(match[0].length);

  const name = frontmatter.name ?? relativePath;
  const description = frontmatter.description ?? "";
  const version = frontmatter.version ?? "unversioned";
  if (!frontmatter.version) {
    throw new Error(`prompt_missing_version: ${relativePath}`);
  }

  const loaded: LoadedPrompt = {
    name,
    description,
    version,
    body,
    sourcePath,
    frontmatter,
  };
  cache.set(relativePath, loaded);
  return loaded;
}

export function render(
  body: string,
  vars: Record<string, string | number | boolean>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars)) {
      throw new Error(`prompt_missing_var: ${key}`);
    }
    return String(vars[key]);
  });
}

export function renderPrompt(
  relativePath: string,
  vars: Record<string, string | number | boolean>,
): { rendered: string; version: string } {
  const prompt = loadPrompt(relativePath);
  return { rendered: render(prompt.body, vars), version: prompt.version };
}
