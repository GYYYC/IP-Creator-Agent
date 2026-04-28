import { get } from "@vercel/blob";

type JsonRecord = Record<string, unknown>;

type AiProvider = "openai" | "anthropic";
type ModelImageInput = {
  dataUrl: string;
  label?: string;
};

const DEFAULT_BASE_URL =
  process.env.OPENAI_BASE_URL ||
  process.env.AI_BASE_URL ||
  process.env.ANTHROPIC_BASE_URL ||
  "https://api.openai.com";
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 25000);
const TRANSCRIPTION_TIMEOUT_MS = Number(
  process.env.AI_TRANSCRIPTION_TIMEOUT_MS ||
  process.env.AI_REQUEST_TIMEOUT_MS ||
  90000
);
const TRANSCRIPTION_SOURCE_RETRY_STATUSES = new Set([403, 404, 408, 425, 429, 500, 502, 503, 504]);

function getProvider(): AiProvider {
  if (process.env.AI_PROVIDER === "anthropic") {
    return "anthropic";
  }

  if (process.env.AI_PROVIDER === "openai") {
    return "openai";
  }

  return process.env.ANTHROPIC_AUTH_TOKEN && !process.env.OPENAI_API_KEY
    ? "anthropic"
    : "openai";
}

function getModel(provider: AiProvider) {
  if (provider === "anthropic") {
    return (
      process.env.ANTHROPIC_MODEL ||
      process.env.AI_MODEL ||
      process.env.OPENAI_MODEL ||
      "claude-3-5-haiku-20241022"
    );
  }

  return process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-5.4";
}

function getApiKey() {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    ""
  );
}

function getTranscriptionApiKey() {
  return process.env.OPENAI_TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
}

function hasExplicitTranscriptionConfig() {
  return Boolean(
    process.env.OPENAI_TRANSCRIPTION_BASE_URL ||
      process.env.OPENAI_TRANSCRIPTION_API_KEY ||
      process.env.OPENAI_TRANSCRIPTION_MODEL ||
      process.env.AI_TRANSCRIPTION_MODEL
  );
}

function getTranscriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL || process.env.AI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
}

function getChatCompletionsUrl() {
  const baseUrl = DEFAULT_BASE_URL.replace(/\/+$/, "");
  return baseUrl.endsWith("/v1")
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
}

function getMessagesUrl() {
  const baseUrl = DEFAULT_BASE_URL.replace(/\/+$/, "");
  return baseUrl.endsWith("/v1") ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
}

function getAudioTranscriptionsUrl() {
  const baseUrl = (
    process.env.OPENAI_TRANSCRIPTION_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.AI_BASE_URL ||
    "https://api.openai.com"
  ).replace(/\/+$/, "");

  return baseUrl.endsWith("/v1")
    ? `${baseUrl}/audio/transcriptions`
    : `${baseUrl}/v1/audio/transcriptions`;
}

function canUseTranscriptionEndpoint() {
  const baseUrl = (
    process.env.OPENAI_TRANSCRIPTION_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.AI_BASE_URL ||
    "https://api.openai.com"
  ).replace(/\/+$/, "");

  return hasExplicitTranscriptionConfig() || baseUrl === "https://api.openai.com" || baseUrl === "https://api.openai.com/v1";
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed) as JsonRecord;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Model response did not include JSON.");
  }

  return JSON.parse(match[0]) as JsonRecord;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  return {
    mediaType: match[1],
    base64: match[2]
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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

async function fetchTranscriptionSource(url: string) {
  const retryDelays = [400, 1000, 2000, 4000];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        cache: "no-store"
      },
      TRANSCRIPTION_TIMEOUT_MS
    );

    if (
      response.ok ||
      !TRANSCRIPTION_SOURCE_RETRY_STATUSES.has(response.status) ||
      attempt === retryDelays.length
    ) {
      return response;
    }

    response.body?.cancel().catch(() => undefined);
    await wait(retryDelays[attempt]);
  }

  throw new Error("unreachable");
}

export async function transcribeAudioFile(params: {
  file: File;
  language?: string;
}) {
  const apiKey = getTranscriptionApiKey();
  const model = getTranscriptionModel();

  if (!apiKey) {
    console.warn("[AI] transcription skipped: missing transcription API key.");
    return {
      text: "",
      model,
      status: "missing_api_key"
    };
  }

  if (!canUseTranscriptionEndpoint()) {
    console.warn("[AI] transcription skipped: transcription endpoint is not configured.");
    return {
      text: "",
      model,
      status: "transcription_not_configured"
    };
  }

  const formData = new FormData();
  formData.append("file", params.file, params.file.name);
  formData.append("model", model);
  formData.append("response_format", "json");

  if (params.language) {
    formData.append("language", params.language);
  }

  const url = getAudioTranscriptionsUrl();

  try {
    console.info(
      `[AI] transcribing audio: model=${model} bytes=${params.file.size} url=${url}`
    );
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData
      },
      TRANSCRIPTION_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[AI] transcription failed: status=${response.status} model=${model} body=${errorText.slice(0, 500)}`
      );
      return {
        text: "",
        model,
        status: `request_failed_${response.status}`
      };
    }

    const data = (await response.json()) as { text?: string };

    return {
      text: typeof data.text === "string" ? data.text.trim() : "",
      model,
      status: data.text ? "ok" : "empty_response"
    };
  } catch (error) {
    console.warn(
      `[AI] transcription error: model=${model} ${error instanceof Error ? error.message : "unknown error"}`
    );
    return {
      text: "",
      model,
      status: "request_error"
    };
  }
}

export async function transcribeAudioUrl(params: {
  url: string;
  fileName: string;
  contentType?: string;
  language?: string;
}) {
  try {
    const response = await fetchTranscriptionSource(params.url);

    if (!response.ok) {
      console.warn(
        `[AI] transcription source fetch failed: status=${response.status} url=${params.url}`
      );
      return {
        text: "",
        model: getTranscriptionModel(),
        status: `source_failed_${response.status}`
      };
    }

    const blob = await response.blob();
    const file = new File([blob], params.fileName, {
      type: params.contentType || blob.type || "application/octet-stream"
    });

    return transcribeAudioFile({
      file,
      language: params.language
    });
  } catch (error) {
    console.warn(
      `[AI] transcription source fetch error: ${error instanceof Error ? error.message : "unknown error"}`
    );
    return {
      text: "",
      model: getTranscriptionModel(),
      status: "source_request_error"
    };
  }
}

export async function transcribeAudioBlobPath(params: {
  pathname: string;
  fileName: string;
  contentType?: string;
  language?: string;
}) {
  try {
    const result = await get(params.pathname, {
      access: "private",
      useCache: false
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return {
        text: "",
        model: getTranscriptionModel(),
        status: result ? `source_failed_${result.statusCode}` : "source_not_found"
      };
    }

    const blob = await new Response(result.stream).blob();
    const file = new File([blob], params.fileName, {
      type: params.contentType || result.blob.contentType || blob.type || "application/octet-stream"
    });

    return transcribeAudioFile({
      file,
      language: params.language
    });
  } catch (error) {
    console.warn(
      `[AI] transcription private blob fetch error: ${error instanceof Error ? error.message : "unknown error"}`
    );
    return {
      text: "",
      model: getTranscriptionModel(),
      status: "source_request_error"
    };
  }
}

export async function callJsonModel(params: {
  system: string;
  user: JsonRecord;
  fallback: JsonRecord;
  images?: ModelImageInput[];
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[AI] skipped: missing API key in server environment.");
    return {
      ...params.fallback,
      __aiStatus: "missing_api_key"
    };
  }

  const provider = getProvider();
  const model = getModel(provider);

  try {
    const url = provider === "anthropic" ? getMessagesUrl() : getChatCompletionsUrl();
    const images = params.images?.filter((image) => image.dataUrl.startsWith("data:image/")) ?? [];
    const userText = JSON.stringify(params.user);
    console.info(
      `[AI] calling model: provider=${provider} model=${model} images=${images.length} userBytes=${userText.length}`
    );
    const openAiUserContent = images.length
      ? [
          {
            type: "text",
            text: userText
          },
          ...images.map((image) => ({
            type: "image_url",
            image_url: {
              url: image.dataUrl,
              detail: "high"
            }
          }))
        ]
      : userText;
    const anthropicUserContent = images.length
      ? [
          {
            type: "text",
            text: userText
          },
          ...images.flatMap((image) => {
            const parsed = parseDataUrl(image.dataUrl);

            if (!parsed) {
              return [];
            }

            return [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: parsed.mediaType,
                  data: parsed.base64
                }
              }
            ];
          })
        ]
      : JSON.stringify(params.user);
    const response = await fetchWithTimeout(
      url,
      provider === "anthropic"
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
              model,
              max_tokens: 1800,
              temperature: 0.4,
              system: params.system,
              messages: [
                {
                  role: "user",
                  content: anthropicUserContent
                }
              ]
            })
          }
        : {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model,
              temperature: 0.4,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: params.system
                },
                {
                  role: "user",
                  content: openAiUserContent
                }
              ]
            })
          }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[AI] request failed: provider=${provider} status=${response.status} model=${model} url=${url} body=${errorText.slice(0, 500)}`
      );
      return {
        ...params.fallback,
        __aiStatus: `request_failed_${response.status}`
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      content?: Array<{ type?: string; text?: string }>;
    };
    const content =
      provider === "anthropic"
        ? data.content?.find((item) => item.type === "text" || item.text)?.text
        : data.choices?.[0]?.message?.content;

    if (!content) {
      console.warn(`[AI] empty response: provider=${provider} model=${model}`);
      return {
        ...params.fallback,
        __aiStatus: "empty_response"
      };
    }

    return extractJson(content);
  } catch (error) {
    console.warn(
      `[AI] request error: provider=${provider} model=${model} ${error instanceof Error ? error.message : "unknown error"}`
    );
    return {
      ...params.fallback,
      __aiStatus: "request_error"
    };
  }
}
