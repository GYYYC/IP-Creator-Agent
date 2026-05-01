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
    utterances?: Array<{
      text?: string;
      start_time?: number;
      end_time?: number;
    }>;
  };
};

export type TimedTranscriptUtterance = {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
};

export type DoubaoTranscriptionResult = {
  text: string;
  utterances?: TimedTranscriptUtterance[];
  model: string;
  status: string;
  provider: "doubao_auc";
  taskId?: string;
  logId?: string;
  statusCode?: string;
  message?: string;
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

class DoubaoAucError extends Error {
  constructor(
    message: string,
    public readonly stage: "submit" | "query",
    public readonly httpStatus: number,
    public readonly statusCode: string,
    public readonly logId: string
  ) {
    super(message);
  }
}

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
  let requestId = "";
  let latestLogId = "";
  let latestStatusCode = "";

  if (!apiKey && (!appKey || !accessKey)) {
    console.warn("[Doubao ASR] skipped: missing Doubao ASR credentials.");
    return {
      text: "",
      model: resourceId,
      status: "missing_api_key",
      provider: "doubao_auc"
    } satisfies DoubaoTranscriptionResult;
  }

  if (!params.sourceUrl) {
    console.warn("[Doubao ASR] skipped: AUC transcription requires a source URL.");
    return {
      text: "",
      model: resourceId,
      status: "missing_source_url",
      provider: "doubao_auc"
    } satisfies DoubaoTranscriptionResult;
  }

  try {
    requestId = randomUUID();
    const authHeaders = buildDoubaoAuthHeaders({ apiKey, appKey, accessKey });
    const startedAt = Date.now();

    console.info(
      `[Doubao ASR] submitting AUC task: resource=${resourceId} requestId=${requestId} format=${params.audioFormat} file=${params.fileName ?? "unknown"} sourcePath=${safeLogUrlPath(params.sourceUrl)}`
    );

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
    latestLogId = submitResult.logId;
    latestStatusCode = submitResult.statusCode;

    const queryResult = await queryDoubaoTask({
      endpoint: queryEndpoint,
      authHeaders,
      resourceId,
      requestId,
      startedAt
    });
    latestLogId = queryResult.logId || latestLogId;
    latestStatusCode = queryResult.statusCode || latestStatusCode;
    const text = queryResult.text;
    const utterances = queryResult.utterances;

    console.info(
      `[Doubao ASR] completed AUC task: resource=${resourceId} requestId=${requestId} chars=${text.length} utterances=${utterances.length}`
    );

    return {
      text: text.trim(),
      utterances: utterances.length ? utterances : undefined,
      model: resourceId,
      status: text.trim()
        ? "ok"
        : latestStatusCode === "20000003"
          ? "silent_audio"
          : "empty_response",
      provider: "doubao_auc",
      taskId: requestId,
      logId: latestLogId || undefined,
      statusCode: latestStatusCode || undefined
    } satisfies DoubaoTranscriptionResult;
  } catch (error) {
    if (error instanceof DoubaoAucError) {
      latestLogId = error.logId || latestLogId;
      latestStatusCode = error.statusCode || latestStatusCode;
    }

    console.warn(
      `[Doubao ASR] request error: file=${params.fileName ?? "unknown"} ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );

    return {
      text: "",
      model: resourceId,
      status: latestStatusCode ? statusForDoubaoCode(latestStatusCode) : "request_error",
      provider: "doubao_auc",
      taskId: requestId || undefined,
      logId: latestLogId || undefined,
      statusCode: latestStatusCode || undefined,
      message: error instanceof Error ? error.message : "豆包 AUC 请求失败。"
    } satisfies DoubaoTranscriptionResult;
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
  language?: string;
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
        show_utterances: true
      }
    })
  });
  const status = response.headers.get("x-api-status-code") || "";
  const message = decodeURIComponent(response.headers.get("x-api-message") || "");
  const logId = response.headers.get("x-tt-logid") || "";

  if (!response.ok || status !== "20000000") {
    const body = await response.text();
    throw new DoubaoAucError(
      `submit failed http=${response.status} status=${status || "missing"} message=${message || "unknown"} logId=${logId || "unknown"} body=${body.slice(0, 500)}`,
      "submit",
      response.status,
      status,
      logId
    );
  }

  return { logId, statusCode: status };
}

async function queryDoubaoTask(params: {
  endpoint: string;
  authHeaders: Record<string, string>;
  resourceId: string;
  requestId: string;
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
        "X-Api-Request-Id": params.requestId
      },
      body: "{}"
    });
    const status = response.headers.get("x-api-status-code") || "";
    const message = decodeURIComponent(response.headers.get("x-api-message") || "");
    const logId = response.headers.get("x-tt-logid") || "";

    if (DOUBAO_PROCESSING_CODES.has(status)) {
      continue;
    }

    if (status === "20000003") {
      return {
        text: "",
        utterances: [],
        logId,
        statusCode: status
      };
    }

    if (!response.ok || status !== "20000000") {
      const body = await response.text();
      throw new DoubaoAucError(
        `query failed http=${response.status} status=${status || "missing"} message=${message || "unknown"} logId=${logId || "unknown"} body=${body.slice(0, 500)}`,
        "query",
        response.status,
        status,
        logId
      );
    }

    const data = (await response.json()) as DoubaoQueryResponse;

    return {
      text: extractDoubaoText(data),
      utterances: extractDoubaoUtterances(data),
      logId,
      statusCode: status
    };
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
  language?: string;
}): DoubaoAudioPayload {
  const payload: DoubaoAudioPayload = {
    url: params.sourceUrl,
    format: toDoubaoAucFormat(params.audioFormat)
  };

  if (params.language) {
    payload.language = params.language;
  }

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

function extractDoubaoUtterances(payload: DoubaoQueryResponse): TimedTranscriptUtterance[] {
  return (
    payload.result?.utterances
      ?.map((item) => {
        const text = typeof item.text === "string" ? item.text.trim() : "";
        const startTimeMs = typeof item.start_time === "number" ? item.start_time : 0;
        const endTimeMs = typeof item.end_time === "number" ? item.end_time : startTimeMs;

        if (!text) {
          return null;
        }

        return {
          text,
          startTimeMs,
          endTimeMs,
          startTimeSeconds: Math.round((startTimeMs / 1000) * 10) / 10,
          endTimeSeconds: Math.round((endTimeMs / 1000) * 10) / 10
        };
      })
      .filter((item): item is TimedTranscriptUtterance => Boolean(item)) || []
  );
}

function toDoubaoAucFormat(audioFormat: "pcm" | "wav" | "mp3" | "ogg") {
  return audioFormat === "pcm" ? "raw" : audioFormat;
}

function normalizeDoubaoLanguage(language?: string) {
  if (!language || language === "zh") {
    return undefined;
  }

  return language;
}

function statusForDoubaoCode(statusCode: string) {
  if (statusCode === "20000000") {
    return "ok";
  }

  if (statusCode === "20000003") {
    return "silent_audio";
  }

  if (statusCode) {
    return `doubao_${statusCode}`;
  }

  return "empty_response";
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
