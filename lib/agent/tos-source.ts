import { randomUUID } from "node:crypto";
import { TosClient } from "@volcengine/tos-sdk";

type TosUploadInput = {
  file: File;
  prefix?: string;
};

type TosUploadResult = {
  key: string;
  signedUrl: string;
  contentType: string;
  sizeBytes: number;
  host: string;
};

const TOS_DEFAULT_TTL_SECONDS = 30 * 60;
const TOS_VERIFY_TIMEOUT_MS = Number(process.env.TOS_SOURCE_VERIFY_TIMEOUT_MS || 15000);

let tosClient: TosClient | null = null;

export function isTosConfigured() {
  return Boolean(
    process.env.TOS_ACCESS_KEY_ID &&
      process.env.TOS_SECRET_ACCESS_KEY &&
      process.env.TOS_BUCKET &&
      process.env.TOS_REGION &&
      process.env.TOS_ENDPOINT
  );
}

export async function uploadPrivateTosObject(params: TosUploadInput): Promise<TosUploadResult> {
  const bucket = getRequiredEnv("TOS_BUCKET");
  const contentType = params.file.type || "application/octet-stream";
  const key = safeTosObjectKey(params.file.name, params.prefix || "doctor/audio");
  const body = Buffer.from(await params.file.arrayBuffer());
  const client = getTosClient();

  await client.putObject({
    bucket,
    key,
    body,
    contentLength: body.byteLength,
    contentType
  });

  const signedUrl = client.getPreSignedUrl({
    bucket,
    key,
    method: "GET",
    expires: Number(process.env.TOS_PUBLIC_URL_TTL_SECONDS || TOS_DEFAULT_TTL_SECONDS),
    response: {
      contentType
    }
  });

  console.info(
    `[TOS] uploaded private object: bucket=${bucket} key=${key} bytes=${body.byteLength} type=${contentType}`
  );

  return {
    key,
    signedUrl,
    contentType,
    sizeBytes: body.byteLength,
    host: safeUrlHost(signedUrl)
  };
}

export async function verifyPrivateTosSourceUrl(source: TosUploadResult) {
  const response = await fetchWithTimeout(source.signedUrl, {
    method: "GET",
    headers: {
      Range: "bytes=0-31"
    },
    cache: "no-store"
  });
  const contentType = response.headers.get("content-type") || "unknown";
  const contentLength = response.headers.get("content-length") || "unknown";

  response.body?.cancel().catch(() => undefined);
  console.info(
    `[TOS] signed URL self-check: key=${source.key} host=${source.host} status=${response.status} type=${contentType} length=${contentLength} bytes=${source.sizeBytes}`
  );

  if (!response.ok && response.status !== 206) {
    throw new Error(
      `TOS signed URL self-check failed: key=${source.key} host=${source.host} status=${response.status}`
    );
  }

  return {
    status: response.status,
    contentType,
    contentLength
  };
}

function getTosClient() {
  if (!tosClient) {
    tosClient = new TosClient({
      accessKeyId: getRequiredEnv("TOS_ACCESS_KEY_ID"),
      accessKeySecret: getRequiredEnv("TOS_SECRET_ACCESS_KEY"),
      bucket: getRequiredEnv("TOS_BUCKET"),
      region: getRequiredEnv("TOS_REGION"),
      endpoint: normalizeTosEndpoint(getRequiredEnv("TOS_ENDPOINT")),
      requestTimeout: Number(process.env.TOS_REQUEST_TIMEOUT_MS || 120000),
      connectionTimeout: Number(process.env.TOS_CONNECTION_TIMEOUT_MS || 10000)
    });
  }

  return tosClient;
}

function safeTosObjectKey(fileName: string, prefix: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const extension = fileName.match(/\.[a-z0-9]+$/i)?.[0] || ".bin";
  const safeName = baseName.replace(/[^\w.\-]+/g, "_") || "audio";
  const safePrefix = prefix.replace(/^\/+|\/+$/g, "") || "doctor/audio";

  return `${safePrefix}/${Date.now()}-${randomUUID()}-${safeName}${extension}`;
}

function normalizeTosEndpoint(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function safeUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOS_VERIFY_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function getRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is not configured.`);
  }

  return value;
}
