import { applyMemoryCandidates, loadBrain } from "@/lib/agent/brain";
import { jsonOk, readJson } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { upsertProfile } from "@/lib/agent/store";
import { MemoryCandidate } from "@/lib/agent/types";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getOrCreateProfile();
  const brain = await loadBrain(profile);

  return jsonOk({
    profile,
    memories: brain.memories
  });
}

export async function PATCH(request: Request) {
  const profile = await getOrCreateProfile();
  const body = await readJson(request);
  const now = new Date().toISOString();
  const nextProfile = {
    ...profile,
    displayName: typeof body.displayName === "string" ? body.displayName : profile.displayName,
    identity: mergeObject(profile.identity, body.identity),
    audience: mergeObject(profile.audience, body.audience),
    style: mergeObject(profile.style, body.style),
    platform: mergeObject(profile.platform, body.platform),
    updatedAt: now
  };

  await upsertProfile(nextProfile);

  const candidates = Array.isArray(body.writebackCandidates)
    ? (body.writebackCandidates as MemoryCandidate[])
    : [];

  if (candidates.length > 0) {
    await applyMemoryCandidates({
      profile: nextProfile,
      module: "profile",
      sessionId: "manual_profile_update",
      artifactIds: [],
      candidates,
      confirmedOnly: true
    });
  }

  return jsonOk({ profile: nextProfile });
}

function mergeObject(
  current: Record<string, unknown>,
  value: unknown
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return current;
  }

  return {
    ...current,
    ...(value as Record<string, unknown>)
  };
}
