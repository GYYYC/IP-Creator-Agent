import { jsonError, jsonOk, readJson } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";
import { getSessionById, upsertSession } from "@/lib/agent/store";

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

  const session = await getSessionById(id);

  if (!session) {
    return jsonError("Session not found.", 404);
  }

  const targetSlot = normalizeDirectorSlotKey(body.targetSlot);
  const isSlotRevision = body.kind === "slot_revision" && session.module === "director" && targetSlot;
  const isRevision =
    !isSlotRevision &&
    (body.kind === "revision" ||
    session.status === "completed");
  const revisionRequests = Array.isArray(session.input.revisionRequests)
    ? session.input.revisionRequests.filter((item): item is string => typeof item === "string")
    : [];
  const inputWithoutSlotRevision = { ...session.input };
  delete inputWithoutSlotRevision.slotRevision;

  const nextSession = await upsertSession({
    ...session,
    answers: isRevision || isSlotRevision
      ? session.answers
      : [...session.answers, answer],
    input: isSlotRevision
      ? {
          ...inputWithoutSlotRevision,
          slotRevision: {
            slotKey: targetSlot,
            value: answer
          }
        }
      : isRevision
      ? {
          ...inputWithoutSlotRevision,
          revisionRequests: [...revisionRequests, answer]
        }
      : inputWithoutSlotRevision,
    status: isRevision ? "completed" : "collecting",
    updatedAt: new Date().toISOString()
  });

  return jsonOk({ session: nextSession });
}

function normalizeDirectorSlotKey(value: unknown) {
  return value === "rootProblem" || value === "changeTarget" || value === "corePromise"
    ? value
    : null;
}
