import { jsonError, jsonOk } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { runAgentSession } from "@/lib/agent/orchestrator";
import { getProfileById, getSessionBundle, pruneSessionArtifactVisualData } from "@/lib/agent/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const currentProfile = await getOrCreateProfile();
  const { id } = await context.params;
  const bundle = await getSessionBundle(id, { includeVisualData: true });

  if (!bundle) {
    return jsonError("Session not found.", 404);
  }

  const profile = (await getProfileById(bundle.session.profileId)) ?? currentProfile;
  const nextSession = await runAgentSession(bundle.session, profile, bundle.artifacts);
  await pruneSessionArtifactVisualData(nextSession);

  return jsonOk({ session: nextSession });
}
