import { getOrCreateProfile } from "@/lib/agent/identity";
import { jsonError, jsonOk, readJson } from "@/lib/agent/http";
import { deleteSessions } from "@/lib/agent/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJson(request);
  const rawSessionIds = body.sessionIds;

  if (!Array.isArray(rawSessionIds)) {
    return jsonError("请选择要删除的记录。");
  }

  const sessionIds = rawSessionIds
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (!sessionIds.length) {
    return jsonError("请选择要删除的记录。");
  }

  const profile = await getOrCreateProfile();
  const result = await deleteSessions(sessionIds, profile.id);

  return jsonOk(result);
}
