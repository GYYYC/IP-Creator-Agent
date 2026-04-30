import { get } from "@vercel/blob";
import { verifyBlobSourceToken } from "@/lib/agent/blob-source-token";
import { jsonError } from "@/lib/agent/http";

export async function serveSignedAudioSource(request: Request, method: "GET" | "HEAD") {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const sig = url.searchParams.get("sig") || "";
  const payload = verifyBlobSourceToken(token, sig);

  if (!payload) {
    console.warn(`[Doctor] audio source rejected: reason=invalid-token path=${url.pathname}`);
    return jsonError("Audio source token is invalid or expired.", 401);
  }

  try {
    const result = await get(payload.pathname, {
      access: "private",
      useCache: false
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      console.warn(
        `[Doctor] audio source missing: pathname=${payload.pathname} status=${result?.statusCode ?? "none"}`
      );
      return jsonError("Audio source not found.", 404);
    }

    const contentType = payload.contentType || result.blob.contentType || "application/octet-stream";
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes"
    });

    if (typeof result.blob.size === "number") {
      headers.set("Content-Length", String(result.blob.size));
    }

    console.info(
      `[Doctor] audio source served: method=${method} pathname=${payload.pathname} type=${contentType} size=${result.blob.size ?? "unknown"}`
    );

    if (method === "HEAD") {
      result.stream.cancel().catch(() => undefined);
      return new Response(null, { headers });
    }

    return new Response(result.stream, {
      headers
    });
  } catch (error) {
    console.warn(
      `[Doctor] audio source fetch failed: ${error instanceof Error ? error.message : "unknown error"}`
    );

    return jsonError("Audio source fetch failed.", 500);
  }
}
