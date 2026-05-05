import { jsonError, jsonOk } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { getSessionBundle } from "@/lib/agent/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  await getOrCreateProfile();
  const { id } = await context.params;
  const bundle = await getSessionBundle(id);

  if (!bundle) {
    return jsonError("Session not found.", 404);
  }

  return jsonOk(bundle);
}
