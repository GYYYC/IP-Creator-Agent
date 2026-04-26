import { jsonError, jsonOk } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { runAgentSession } from "@/lib/agent/orchestrator";
import { getStore } from "@/lib/agent/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const profile = await getOrCreateProfile();
  const { id } = await context.params;
  const store = await getStore();
  const session = store.sessions.find(
    (item) => item.id === id && item.profileId === profile.id
  );

  if (!session) {
    return jsonError("Session not found.", 404);
  }

  const nextSession = await runAgentSession(session, profile);

  return jsonOk({ session: nextSession });
}
