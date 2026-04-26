import { jsonError, jsonOk, readJson } from "@/lib/agent/http";
import { createId, getOrCreateProfile } from "@/lib/agent/identity";
import { FOLLOWUP_BUDGET, normalizeContentMode } from "@/lib/agent/module-configs";
import { upsertSession } from "@/lib/agent/store";
import { AgentModule, AgentSession } from "@/lib/agent/types";

export const runtime = "nodejs";

const MODULES: AgentModule[] = ["director", "doctor", "assistant", "profile"];

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  const body = await readJson(request);
  const module = normalizeModule(body.module);

  if (!module) {
    return jsonError("Unsupported module.");
  }

  const now = new Date().toISOString();
  const session: AgentSession = {
    id: createId("session"),
    profileId: profile.id,
    module,
    contentMode: normalizeContentMode(body.contentMode),
    status: "draft",
    input: normalizeRecord(body.input),
    followupBudget: FOLLOWUP_BUDGET[module],
    askedQuestions: [],
    answers: [],
    draft: {},
    output: {},
    writebackCandidates: [],
    artifactIds: Array.isArray(body.artifactIds) ? body.artifactIds.filter(isString) : [],
    createdAt: now,
    updatedAt: now
  };

  await upsertSession(session);

  return jsonOk({ session });
}

function normalizeModule(value: unknown): AgentModule | null {
  return typeof value === "string" && MODULES.includes(value as AgentModule)
    ? (value as AgentModule)
    : null;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
