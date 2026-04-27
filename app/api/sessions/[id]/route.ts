import { jsonError, jsonOk } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { getStore } from "@/lib/agent/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  await getOrCreateProfile();
  const { id } = await context.params;
  const store = await getStore();
  const session = store.sessions.find((item) => item.id === id);

  if (!session) {
    return jsonError("Session not found.", 404);
  }

  const artifacts = store.artifacts.filter((artifact) =>
    session.artifactIds.includes(artifact.id)
  );

  return jsonOk({ session, artifacts });
}
