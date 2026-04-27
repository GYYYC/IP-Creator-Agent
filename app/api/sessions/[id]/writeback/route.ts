import { applyMemoryCandidates } from "@/lib/agent/brain";
import { jsonError, jsonOk } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { getStore } from "@/lib/agent/store";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const currentProfile = await getOrCreateProfile();
  const { id } = await context.params;
  const store = await getStore();
  const session = store.sessions.find((item) => item.id === id);

  if (!session) {
    return jsonError("Session not found.", 404);
  }

  const profile = store.profiles.find((item) => item.id === session.profileId) ?? currentProfile;
  const entries = await applyMemoryCandidates({
    profile,
    module: session.module,
    sessionId: session.id,
    artifactIds: session.artifactIds,
    candidates: session.writebackCandidates,
    confirmedOnly: true
  });

  return jsonOk({ entries });
}
