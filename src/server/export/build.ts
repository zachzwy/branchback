import "server-only";

import JSZip from "jszip";
import {
  PHASE_TITLES,
  type BriefHandoffPrompt,
  type ConversationMessage,
  type DecisionEdge,
  type DecisionNode,
  type GeneratedBrief,
  type Project,
} from "@/lib/db/types";
import { classifyDecisions } from "@/lib/graph/lineage";

function slugify(s: string): string {
  const out = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "export";
}

function escMermaidLabel(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/\(/g, "&#40;")
    .replace(/\)/g, "&#41;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .replace(/\r?\n/g, "<br/>");
}

export function renderFinalBriefMd(brief: GeneratedBrief): string {
  const lines: string[] = [];
  lines.push(`# ${brief.conceptName}`);
  lines.push("");
  lines.push(`> ${brief.tagline}`);
  lines.push("");
  lines.push("## Elevator pitch");
  lines.push("");
  lines.push(brief.elevatorPitch ?? `${brief.conceptName}: ${brief.tagline}`);
  lines.push("");
  lines.push(
    `_Compiled ${brief.createdAt}. ${brief.decisionCount} ${
      brief.decisionCount === 1 ? "decision" : "decisions"
    } across ${brief.phasesCompleted}/${brief.phasesTotal} phases._`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  const sections = [...brief.sections].sort((a, b) => a.ordinal - b.ordinal);
  for (const s of sections) {
    lines.push(`## ${s.title}`);
    lines.push("");
    lines.push(s.body);
    if (s.bullets.length > 0) {
      lines.push("");
      for (const b of s.bullets) lines.push(`- ${b}`);
    }
    lines.push("");
  }

  if (brief.openQuestions.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Open questions");
    lines.push("");
    for (const q of brief.openQuestions) {
      lines.push(`- **${q.phaseTitle}** - ${q.text}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderHandoffMd(
  handoff: BriefHandoffPrompt,
  conceptName: string,
): string {
  const lines: string[] = [];
  lines.push(`# Handoff - ${handoff.title}`);
  lines.push("");
  lines.push(`> ${handoff.description}`);
  lines.push("");
  lines.push(`_Source product: ${conceptName}_`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(handoff.prompt);
  lines.push("");
  return lines.join("\n");
}

function quote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => (l.length ? `> ${l}` : ">"))
    .join("\n");
}

function renderMessageMd(
  msg: ConversationMessage,
  decisionsById: Map<string, DecisionNode>,
): string[] {
  const who = msg.role === "user" ? "User" : msg.role === "assistant" ? "Agent" : "System";
  const head = `### Turn ${msg.turnIndex} - ${who} / ${msg.kind}`;
  const lines: string[] = [head, ""];

  switch (msg.payload.kind) {
    case "raw_idea":
      lines.push(quote(msg.payload.data.text));
      break;
    case "question": {
      const d = msg.payload.data;
      lines.push(`**Phase:** \`${d.phaseKey}\` (${PHASE_TITLES[d.phaseKey]})`);
      lines.push("");
      lines.push(d.text);
      break;
    }
    case "answer":
      lines.push(quote(msg.payload.data.text));
      break;
    case "recommendation": {
      const d = msg.payload.data;
      lines.push(`**Phase:** \`${d.phaseKey}\` (${PHASE_TITLES[d.phaseKey]})`);
      lines.push("");
      lines.push(`**Prompt:** ${d.prompt}`);
      lines.push("");
      lines.push(
        `**Recommended (${d.recommended.confidence}% confidence):** ${d.recommended.title}`,
      );
      lines.push(quote(d.recommended.rationale));
      lines.push("");
      lines.push(
        `**Alternative (${d.alternative.confidence}% confidence):** ${d.alternative.title}`,
      );
      lines.push(quote(d.alternative.rationale));
      if (d.confirmedChoiceId) {
        const chosen =
          d.confirmedChoiceId === d.recommended.id
            ? d.recommended
            : d.confirmedChoiceId === d.alternative.id
              ? d.alternative
              : null;
        lines.push("");
        lines.push(`**User confirmed:** ${chosen?.title ?? d.confirmedChoiceId}`);
      }
      break;
    }
    case "acknowledgement": {
      const d = msg.payload.data;
      lines.push(d.text);
      const decision = decisionsById.get(d.decisionId);
      if (decision) {
        lines.push("");
        lines.push(
          `> Decision recorded: **${decision.title}** / phase \`${decision.phaseKey}\``,
        );
        if (d.affects.length > 0) {
          lines.push(`> Affects: ${d.affects.join(", ")}`);
        }
      }
      break;
    }
  }

  return lines;
}

export function renderChatHistoryMd(args: {
  messages: ConversationMessage[];
  decisions: DecisionNode[];
}): string {
  const decisionsById = new Map(args.decisions.map((d) => [d.id, d]));
  const lines: string[] = ["# Conversation", ""];

  for (const msg of [...args.messages].sort((a, b) => a.turnIndex - b.turnIndex)) {
    lines.push(...renderMessageMd(msg, decisionsById));
    lines.push("");
  }

  return lines.join("\n");
}

export function renderGraphMermaidMd(args: {
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  project: Project;
}): string {
  const idIdx = new Map<string, string>();
  args.decisions.forEach((d, i) => idIdx.set(d.id, `n${i}`));
  const classification = classifyDecisions({
    decisions: args.decisions,
    edges: args.edges,
    cursorId: args.project.currentDecisionId,
  });

  const m: string[] = [];
  m.push("flowchart LR");
  m.push("  classDef onpath fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a");
  m.push(
    "  classDef offpath fill:#f1f5f9,stroke:#94a3b8,color:#334155",
  );
  m.push("  classDef cursor stroke-width:3px,stroke:#2563eb");
  m.push("");

  for (const d of args.decisions) {
    const id = idIdx.get(d.id);
    if (!id) continue;
    const label = `<b>${escMermaidLabel(d.title)}</b><br/>${escMermaidLabel(
      PHASE_TITLES[d.phaseKey],
    )}`;
    m.push(`  ${id}["${label}"]`);
  }
  m.push("");

  const onPath: string[] = [];
  const offPath: string[] = [];
  for (const d of args.decisions) {
    const cls = classification.get(d.id);
    const id = idIdx.get(d.id);
    if (!id) continue;
    if (cls === "on_path") onPath.push(id);
    else offPath.push(id);
  }
  if (onPath.length) m.push(`  class ${onPath.join(",")} onpath`);
  if (offPath.length) m.push(`  class ${offPath.join(",")} offpath`);
  if (
    args.project.currentDecisionId &&
    idIdx.has(args.project.currentDecisionId)
  ) {
    m.push(`  class ${idIdx.get(args.project.currentDecisionId)} cursor`);
  }
  m.push("");

  for (const e of args.edges) {
    const from = idIdx.get(e.fromNodeId);
    const to = idIdx.get(e.toNodeId);
    if (!from || !to) continue;
    switch (e.relationship) {
      case "follows":
        m.push(`  ${from} --> ${to}`);
        break;
      case "informs":
      case "depends_on":
        m.push(`  ${from} -- "${e.relationship}" --> ${to}`);
        break;
    }
  }

  const cursorTitle = args.project.currentDecisionId
    ? args.decisions.find((d) => d.id === args.project.currentDecisionId)?.title
    : null;

  const out: string[] = [];
  out.push("# Decision Graph");
  out.push("");
  out.push(
    `> ${args.decisions.length} decisions / ${args.edges.length} edges.`,
  );
  if (cursorTitle) {
    out.push(`> Cursor: **${cursorTitle}**`);
  }
  out.push("");
  out.push("```mermaid");
  out.push(m.join("\n"));
  out.push("```");
  out.push("");
  return out.join("\n");
}

export function renderGraphJson(args: {
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  project: Project;
}): string {
  const payload = {
    project: {
      id: args.project.id,
      name: args.project.name,
      currentDecisionId: args.project.currentDecisionId,
      planningDepth: args.project.planningDepth,
      createdAt: args.project.createdAt,
      updatedAt: args.project.updatedAt,
    },
    decisions: args.decisions,
    edges: args.edges,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ExportInputs {
  project: Project;
  messages: ConversationMessage[];
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  brief: GeneratedBrief;
}

export interface ExportArtifact {
  filename: string;
  buffer: Buffer;
}

export async function buildExportZip(input: ExportInputs): Promise<ExportArtifact> {
  const zip = new JSZip();

  zip.file("final-brief.md", renderFinalBriefMd(input.brief));

  const handoffsDir = zip.folder("handoffs");
  if (handoffsDir) {
    for (const h of input.brief.handoffPrompts ?? []) {
      handoffsDir.file(
        `${slugify(h.key)}.md`,
        renderHandoffMd(h, input.brief.conceptName),
      );
    }
  }

  zip.file(
    "conversation.md",
    renderChatHistoryMd({
      messages: input.messages,
      decisions: input.decisions,
    }),
  );
  zip.file(
    "decision-graph.md",
    renderGraphMermaidMd({
      decisions: input.decisions,
      edges: input.edges,
      project: input.project,
    }),
  );
  zip.file(
    "decision-graph.json",
    renderGraphJson({
      decisions: input.decisions,
      edges: input.edges,
      project: input.project,
    }),
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${slugify(input.brief.conceptName || input.project.name)}-export.zip`;
  return { filename, buffer };
}
