"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import type { PlanningDepth } from "@/lib/db/types";
import { requireSession } from "@/lib/firebase/session";

const PlanningDepthEnum = z.enum(["fast", "deep", "handoff"]);

const CreateProjectSchema = z.object({
  rawIdea: z.string().trim().min(4, "Tell us a bit more about the idea."),
  planningDepth: PlanningDepthEnum.default("deep"),
});

export type CreateProjectFormState = {
  error?: string;
};

export async function createProjectAction(
  _prev: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  const session = await requireSession();

  const parsed = CreateProjectSchema.safeParse({
    rawIdea: formData.get("rawIdea"),
    planningDepth: formData.get("planningDepth") ?? "deep",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const repo = getRepository();
  const { projectId } = await repo.createProjectWithSeed({
    userId: session.uid,
    rawIdea: parsed.data.rawIdea,
    planningDepth: parsed.data.planningDepth as PlanningDepth,
  });

  redirect(`/p/${projectId}`);
}
