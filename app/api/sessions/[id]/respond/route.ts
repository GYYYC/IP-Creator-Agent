import { jsonError, jsonOk, readJson } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { getStore, upsertSession } from "@/lib/agent/store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  await getOrCreateProfile();
  const { id } = await context.params;
  const body = await readJson(request);
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";

  if (!answer) {
    return jsonError("Answer is required.");
  }

  const store = await getStore();
  const session = store.sessions.find((item) => item.id === id);

  if (!session) {
    return jsonError("Session not found.", 404);
  }

  const isRevision =
    body.kind === "revision" ||
    session.status === "completed" ||
    session.answers.length >= session.followupBudget;
  const revisionRequests = Array.isArray(session.input.revisionRequests)
    ? session.input.revisionRequests.filter((item): item is string => typeof item === "string")
    : [];

  const nextSession = await upsertSession({
    ...session,
    answers: isRevision
      ? session.answers
      : [...session.answers, answer].slice(0, session.followupBudget),
    input: isRevision
      ? {
          ...session.input,
          revisionRequests: [...revisionRequests, answer].slice(-8)
        }
      : session.input,
    status: isRevision ? "completed" : "collecting",
    updatedAt: new Date().toISOString()
  });

  return jsonOk({ session: nextSession });
}
