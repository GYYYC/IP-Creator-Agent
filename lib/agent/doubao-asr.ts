import { randomUUID } from "node:crypto";

type DoubaoAsrOptions = {
  sourceUrl?: string;
  audioFormat: "pcm" | "wav" | "mp3" | "ogg";
  sampleRate?: number;
  channels?: number;
  bits?: number;
  language?: string;
  fileName?: string;
};

type DoubaoQueryResponse = {
  result?: {
    text?: string;
    utterances?: Array<{ text?: string }>;
  };
};

type DoubaoAudioPayload = {
  url: string;
  format: "raw" | "wav" | "mp3" | "ogg";
  codec?: "raw" | "opus";
  rate?: number;
  bits?: number;
  channel?: number;
  language?: string;
};

const DOUBAO_DEFAULT_SUBMIT_ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit";
const DOUBAO_DEFAULT_QUERY_ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query";
const DOUBAO_DEFAULT_RESOURCE_ID = "volc.seedasr.auc";
const DOUBAO_PROCESSING_CODES = new Set(["20000001", "20000002"]);
const DOUBAO_TIMEOUT_MS = Number(
  process.env.DOUBAO_ASR_TIMEOUT_MS ||
    process.env.AI_TRANSCRIPTION_TIMEOUT_MS ||
    process.env.AI_REQUEST_TIMEOUT_MS ||
    120000
);
const DOUBAO_POLL_INTERVAL_MS = Number(process.env.DOUBAO_ASR_POLL_INTERVAL_MS || 2000);

export function isDoubaoTranscriptionConfigured() {
  return Boolean(
    process.env.DOUBAO_ASR_API_KEY ||
      (process.env.DOUBAO_ASR_APP_KEY && process.env.DOUBAO_ASR_ACCESS_KEY)
  );
}

export function getDoubaoAsrModelName() {
  return process.env.DOUBAO_ASR_RESOURCE_ID || DOUBAO_DEFAULT_RESOURCE_ID;
}

export async function transcribeWithDoubaoAsr(params: DoubaoAsrOptions) {
  const apiKey = process.env.DOUBAO_ASR_API_KEY || "";
  const appKey = process.env.DOUBAO_ASR_APP_KEY || "";
  const accessKey = process.env.DOUBAO_ASR_ACCESS_KEY || "";
  const resourceId = getDoubaoAsrModelName();
  const submitEndpoint = process.env.DOUBAO_ASR_SUBMIT_ENDPOINT || DOUBAO_DEFAULT_SUBMIT_ENDPOINT;
  const queryEndpoint = process.env.DOUBAO_ASR_QUERY_ENDPOINT || DOUBAO_DEFAULT_QUERY_ENDPOINT;

  if (!apiKey && (!appKey || !accessKey)) {
    console.warn("[Doubao ASR] skipped: missing Doubao ASR credentials.");
    return {
      text: "",
      model: resourceId,
      status: "missing_api_key"
    };
  }

  if (!params.sourceUrl) {
    console.warn("[Doubao ASR] skipped: AUC transcription requires a source URL.");
    return {
      text: "",
      model: resourceId,
      status: "missing_source_url"
    };
  }

  try {
    const requestId = randomUUID();
    const authHeaders = buildDoubaoAuthHeaders({ apiKey, appKey, accessKey });
    const startedAt = Date.now();

    console.info(
      `[Doubao ASR] submitting AUC task: resource=${resourceId} requestId=${requestId} format=${params.audioFormat} file=${params.fileName ?? "unknown"} sourcePath=${safeLogUrlPath(params.sourceUrl)}`
    );
    await verifySourceUrl(params.sourceUrl);

    const submitResult = await submitDoubaoTask({
      endpoint: submitEndpoint,
      authHeaders,
      resourceId,
      requestId,
      sourceUrl: params.sourceUrl,
      audioFormat: params.audioFormat,
      sampleRate: params.sampleRate || 16000,
      bits: params.bits || 16,
      channels: params.channels || 1,
      language: normalizeDoubaoLanguage(params.language)
    });

    const text = await queryDoubaoTask({
      endpoint: queryEndpoint,
      authHeaders,
      resourceId,
      requestId,
      logId: submitResult.logId,
      startedAt
    });

    console.info(
      `[Doubao ASR] completed AUC task: resource=${resourceId} requestId=${requestId} chars=${text.length}`
    );

    return {
      text: text.trim(),
      model: resourceId,
      status: text.trim() ? "ok" : "empty_response"
    };
  } catch (error) {
    console.warn(
      `[Doubao ASR] request error: file=${params.fileName ?? "unknown"} ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );

    return {
      text: "",
      model: resourceId,
      status: "request_error"
    };
  }
}

async function verifySourceUrl(sourceUrl: string) {
  try {
    const response = await fetchWithTimeout(sourceUrl, {
      method: "HEAD",
      cache: "no-store"
    });

    console.info(
      `[Doubao ASR] source self-check: status=${response.status} type=${response.headers.get("content-type") || "unknown"} length=${response.headers.get("content-length") || "unknown"} path=${safeLogUrlPath(sourceUrl)}`
    );

    if (!response.ok) {
      const fallback = await fetchWithTimeout(sourceUrl, {
        method: "GET",
        headers: {
          Range: "bytes=0-31"
        },
        cache: "no-store"
      });
      fallback.body?.cancel().catch(() => undefined);
      console.info(
        `[Doubao ASR] source GET fallback: status=${fallback.status} type=${fallback.headers.get("content-type") || "unknown"} length=${fallback.headers.get("content-length") || "unknown"} path=${safeLogUrlPath(sourceUrl)}`
      );
    }
  } catch (error) {
    console.warn(
      `[Doubao ASR] source self-check failed: ${error instanceof Error ? error.message : "unknown error"} path=${safeLogUrlPath(sourceUrl)}`
    );
  }
}

async function submitDoubaoTask(params: {
  endpoint: string;
  authHeaders: Record<string, string>;
  resourceId: string;
  requestId: string;
  sourceUrl: string;
  audioFormat: "pcm" | "wav" | "mp3" | "ogg";
  sampleRate: number;
  bits: number;
  channels: number;
  language: string;
}) {
  const response = await fetchWithTimeout(params.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...params.authHeaders,
      "X-Api-Resource-Id": params.resourceId,
      "X-Api-Request-Id": params.requestId,
      "X-Api-Sequence": "-1"
    },
    body: JSON.stringify({
      user: {
        uid: "ip-creator-agent"
      },
      audio: {
        ...buildDoubaoAudioPayload({
          sourceUrl: params.sourceUrl,
          audioFormat: params.audioFormat,
          sampleRate: params.sampleRate,
          bits: params.bits,
          channels: params.channels,
          language: params.language
        })
      },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
        enable_ddc: false,
        enable_speaker_info: false,
        enable_channel_split: false,
        show_utterances: false,
        vad_segment: false,
        sensitive_words_filter: ""
      }
    })
  });
  const status = response.headers.get("x-api-status-code") || "";
  const message = decodeURIComponent(response.headers.get("x-api-message") || "");
  const logId = response.headers.get("x-tt-logid") || "";

  if (!response.ok || status !== "20000000") {
    const body = await response.text();
    throw new Error(
      `submit failed http=${response.status} status=${status || "missing"} message=${message || "unknown"} logId=${logId || "unknown"} body=${body.slice(0, 500)}`
    );
  }

  return { logId };
}

async function queryDoubaoTask(params: {
  endpoint: string;
  authHeaders: Record<string, string>;
  resourceId: string;
  requestId: string;
  logId: string;
  startedAt: number;
}) {
  while (Date.now() - params.startedAt < DOUBAO_TIMEOUT_MS) {
    await wait(DOUBAO_POLL_INTERVAL_MS);

    const response = await fetchWithTimeout(params.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...params.authHeaders,
        "X-Api-Resource-Id": params.resourceId,
        "X-Api-Request-Id": params.requestId,
        ...(params.logId ? { "X-Tt-Logid": params.logId } : {})
      },
      body: "{}"
    });
    const status = response.headers.get("x-api-status-code") || "";
    const message = decodeURIComponent(response.headers.get("x-api-message") || "");
    const logId = response.headers.get("x-tt-logid") || "";

    if (DOUBAO_PROCESSING_CODES.has(status)) {
      continue;
    }

    if (!response.ok || status !== "20000000") {
      const body = await response.text();
      throw new Error(
        `query failed http=${response.status} status=${status || "missing"} message=${message || "unknown"} logId=${logId || "unknown"} body=${body.slice(0, 500)}`
      );
    }

    const data = (await response.json()) as DoubaoQueryResponse;

    return extractDoubaoText(data);
  }

  throw new Error("query timeout");
}

function buildDoubaoAuthHeaders(params: { apiKey: string; appKey: string; accessKey: string }): Record<string, string> {
  if (params.apiKey) {
    return {
      "X-Api-Key": params.apiKey
    };
  }

  return {
    "X-Api-App-Key": params.appKey,
    "X-Api-Access-Key": params.accessKey
  };
}

function buildDoubaoAudioPayload(params: {
  sourceUrl: string;
  audioFormat: "pcm" | "wav" | "mp3" | "ogg";
  sampleRate: number;
  bits: number;
  channels: number;
  language: string;
}): DoubaoAudioPayload {
  const payload: DoubaoAudioPayload = {
    url: params.sourceUrl,
    format: toDoubaoAucFormat(params.audioFormat),
    language: params.language
  };

  if (params.audioFormat === "pcm") {
    payload.codec = "raw";
    payload.rate = params.sampleRate;
    payload.bits = params.bits;
    payload.channel = params.channels;
  }

  if (params.audioFormat === "ogg") {
    payload.codec = "opus";
  }

  return payload;
}

function extractDoubaoText(payload: DoubaoQueryResponse) {
  const text = payload.result?.text;

  if (typeof text === "string") {
    return text;
  }

  return (
    payload.result?.utterances
      ?.map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("")
      .trim() || ""
  );
}

function toDoubaoAucFormat(audioFormat: "pcm" | "wav" | "mp3" | "ogg") {
  return audioFormat === "pcm" ? "raw" : audioFormat;
}

function normalizeDoubaoLanguage(language?: string) {
  if (!language || language === "zh") {
    return "zh-CN";
  }

  return language;
}

function safeLogUrlPath(value: string) {
  try {
    const url = new URL(value);

    return url.pathname;
  } catch {
    return "invalid-url";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOUBAO_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
