import { get } from "@vercel/blob";
import { verifyBlobSourceToken } from "@/lib/agent/blob-source-token";
import { jsonError } from "@/lib/agent/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const sig = url.searchParams.get("sig") || "";
  const payload = verifyBlobSourceToken(token, sig);

  if (!payload) {
    return jsonError("Audio source token is invalid or expired.", 401);
  }

  try {
    const result = await get(payload.pathname, {
      access: "private",
      useCache: false
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return jsonError("Audio source not found.", 404);
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": payload.contentType || result.blob.contentType || "application/octet-stream",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.warn(
      `[Doctor] audio source fetch failed: ${error instanceof Error ? error.message : "unknown error"}`
    );

    return jsonError("Audio source fetch failed.", 500);
  }
}
