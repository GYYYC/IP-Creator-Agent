import { jsonOk, readJson } from "@/lib/agent/http";
import { getOrCreateProfile } from "@/lib/agent/identity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  const body = await readJson(request);
  const fileName = typeof body.fileName === "string" ? body.fileName : "upload";
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");

  return jsonOk({
    mode: process.env.BLOB_READ_WRITE_TOKEN ? "vercel_blob_ready" : "register_only",
    profileId: profile.id,
    storageKey: `profiles/${profile.id}/${crypto.randomUUID()}-${safeName}`,
    note:
      "Client-side Blob upload should use this storageKey. If BLOB_READ_WRITE_TOKEN is missing, register the artifact metadata and keep demo analysis text-based."
  });
}
