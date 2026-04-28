import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { jsonError } from "@/lib/agent/http";

export const runtime = "nodejs";

const DEFAULT_MAX_BLOB_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const CLIENT_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_BLOB_UPLOAD_BYTES = Number(
  process.env.BLOB_MAX_UPLOAD_BYTES || DEFAULT_MAX_BLOB_UPLOAD_BYTES
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
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        const payload = parseClientPayload(clientPayload);
        const options = {
          maximumSizeInBytes: MAX_BLOB_UPLOAD_BYTES,
          validUntil: Date.now() + CLIENT_TOKEN_TTL_MS,
          addRandomSuffix: true,
          tokenPayload: clientPayload
        };

        console.info(
          `[Blob] token request: client=${payload?.uploadClient ?? "legacy"} kind=${payload?.kind ?? "unknown"} multipart=${multipart} size=${payload?.sizeBytes ?? "unknown"} contentType=${payload?.contentType ?? "unknown"} pathname=${pathname}`
        );

        if (payload?.kind === "doctor-video") {
          return options;
        }

        return {
          ...options,
          allowedContentTypes: ["image/*", "video/*", "application/octet-stream"]
        };
      }
    });

    return Response.json(result);
  } catch (error) {
    console.warn(`[Blob] upload handler failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return jsonError(error instanceof Error ? error.message : "Blob upload failed.", 400);
  }
}

function parseClientPayload(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as {
      uploadClient?: string;
      kind?: string;
      sizeBytes?: number;
      contentType?: string;
    };
  } catch {
    return null;
  }
}
