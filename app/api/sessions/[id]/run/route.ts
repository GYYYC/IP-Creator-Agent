import { jsonError, jsonOk } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { runAgentSession } from "@/lib/agent/orchestrator";
import { getStore } from "@/lib/agent/store";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const nextSession = await runAgentSession(session, profile);

  return jsonOk({ session: nextSession });
}
