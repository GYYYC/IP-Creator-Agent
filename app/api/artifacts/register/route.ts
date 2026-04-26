import { jsonOk, readJson } from "@/lib/agent/http";
import { createId, getOrCreateProfile } from "@/lib/agent/identity";
import { upsertArtifact } from "@/lib/agent/store";
import { ArtifactKind, ArtifactRecord } from "@/lib/agent/types";

export const runtime = "nodejs";

const KIND_SET = new Set<ArtifactKind>([
  "video",
  "image",
  "retention_chart",
  "comment_screenshot",
  "graphic_post",
  "history_work",
  "text"
]);

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  const body = await readJson(request);
  const now = new Date().toISOString();
  const artifact: ArtifactRecord = {
    id: createId("artifact"),
    profileId: profile.id,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    kind: normalizeKind(body.kind),
    mimeType: typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream",
    fileName: typeof body.fileName === "string" ? body.fileName : "untitled",
    storageKey: typeof body.storageKey === "string" ? body.storageKey : undefined,
    url: typeof body.url === "string" ? body.url : undefined,
    sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : undefined,
    analysisStatus: "pending",
    extractedText: typeof body.extractedText === "string" ? body.extractedText : undefined,
    extractedJson:
      body.extractedJson && typeof body.extractedJson === "object" && !Array.isArray(body.extractedJson)
        ? (body.extractedJson as Record<string, unknown>)
        : undefined,
    createdAt: now
  };

  await upsertArtifact(artifact);

  return jsonOk({ artifact });
}

function normalizeKind(value: unknown): ArtifactKind {
  return typeof value === "string" && KIND_SET.has(value as ArtifactKind)
    ? (value as ArtifactKind)
    : "text";
}
