import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { jsonError } from "@/lib/agent/http";

export const runtime = "nodejs";

const MAX_BLOB_UPLOAD_BYTES = Number(
  process.env.BLOB_MAX_UPLOAD_BYTES || 500 * 1024 * 1024
);

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonError("Blob storage is not configured.", 500);
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);

        return {
          allowedContentTypes:
            payload?.kind === "doctor-video"
              ? [
                  "video/mp4",
                  "video/webm",
                  "video/quicktime",
                  "video/x-m4v",
                  "application/octet-stream"
                ]
              : ["image/*", "video/*", "application/octet-stream"],
          maximumSizeInBytes: MAX_BLOB_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: clientPayload
        };
      }
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Blob upload failed.", 400);
  }
}

function parseClientPayload(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as { kind?: string };
  } catch {
    return null;
  }
}
