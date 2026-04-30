import { createHmac, timingSafeEqual } from "node:crypto";

type BlobSourcePayload = {
  pathname: string;
  contentType?: string;
  fileName?: string;
  exp: number;
};

const TOKEN_TTL_SECONDS = Number(process.env.DOUBAO_ASR_SOURCE_URL_TTL_SECONDS || 30 * 60);

export function createSignedBlobSourceUrl(params: {
  origin: string;
  pathname: string;
  contentType?: string;
  fileName?: string;
}) {
  const payload: BlobSourcePayload = {
    pathname: params.pathname,
    contentType: params.contentType,
    fileName: params.fileName,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  };
  const token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signToken(token);
  const fileName = safeSourceFileName(params.fileName || params.pathname);
  const url = new URL(`/api/doctor/audio-source/${encodeURIComponent(fileName)}`, params.origin);

  url.searchParams.set("token", token);
  url.searchParams.set("sig", sig);

  return url.toString();
}

function safeSourceFileName(fileName: string) {
  const name = fileName.split("/").pop() || "audio.pcm";
  const safeName = name.replace(/[^\w.\-]+/g, "_");

  return /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName || "audio"}.pcm`;
}

export function verifyBlobSourceToken(token: string, signature: string) {
  if (!token || !signature || !safeEqual(signature, signToken(token))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as BlobSourcePayload;

    if (!payload.pathname || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function signToken(token: string) {
  return createHmac("sha256", getSigningSecret()).update(token).digest("base64url");
}

function getSigningSecret() {
  const secret =
    process.env.BLOB_SOURCE_SIGNING_SECRET ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.DOUBAO_ASR_API_KEY ||
    "";

  if (!secret) {
    throw new Error("Blob source signing secret is not configured.");
  }

  return secret;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
