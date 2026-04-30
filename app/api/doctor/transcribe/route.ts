import { jsonError, jsonOk } from "@/lib/agent/http";
import { createSignedBlobSourceUrl } from "@/lib/agent/blob-source-token";
import { getDoubaoAsrModelName } from "@/lib/agent/doubao-asr";
import {
  transcribeAudioBlobPath,
  transcribeAudioFile,
  transcribeAudioUrl,
  usesDoubaoTranscriptionProvider
} from "@/lib/agent/llm";
import {
  isTosConfigured,
  uploadPrivateTosObject,
  verifyPrivateTosSourceUrl
} from "@/lib/agent/tos-source";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TRANSCRIPTION_BYTES = Number(
  process.env.DOUBAO_ASR_DIRECT_UPLOAD_MAX_BYTES ||
    process.env.AI_TRANSCRIPTION_MAX_BYTES ||
    4 * 1024 * 1024
);

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    const url = typeof body.url === "string" ? body.url : "";
    const storageKey = typeof body.storageKey === "string" ? body.storageKey : "";
    const fileName = typeof body.fileName === "string" ? body.fileName : "video.mp4";
    const durationSeconds = Number(body.durationSeconds || 0);
    const audioFormat = parseAudioFormat(body.audioFormat);
    const sampleRate = parsePositiveNumber(body.sampleRate);
    const channels = parsePositiveNumber(body.channels);
    const bits = parsePositiveNumber(body.bits);

    if (!url && !storageKey) {
      return jsonError("URL or storageKey is required.");
    }

    if (usesDoubaoTranscriptionProvider()) {
      return jsonError("Doubao ASR requires direct audio upload so the server can store it in TOS.", 400);
    }

    const result = storageKey
      ? await transcribeAudioBlobPath({
          pathname: storageKey,
          fileName,
          contentType: typeof body.contentType === "string" ? body.contentType : undefined,
          sourceUrl: createSignedBlobSourceUrl({
            origin: getRequestOrigin(request),
            pathname: storageKey,
            contentType: typeof body.contentType === "string" ? body.contentType : undefined,
            fileName
          }),
          language: "zh",
          audioFormat,
          sampleRate,
          channels,
          bits
        })
      : await transcribeAudioUrl({
          url,
          fileName,
          contentType: typeof body.contentType === "string" ? body.contentType : undefined,
          language: "zh",
          audioFormat,
          sampleRate,
          channels,
          bits
        });
    const text = result.text.trim();

    return jsonOk({
      text,
      fileName,
      url,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      estimatedWordCount: estimateWordCount(text),
      model: result.model,
      status: result.status,
      ...transcriptionDiagnostics(result),
      message:
        result.status === "ok"
          ? "已识别口播内容。"
          : transcriptionMessage(result.status, result)
    });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("File is required.");
  }

  const durationSeconds = Number(formData.get("durationSeconds") || 0);
  const audioFormat = parseAudioFormat(formData.get("audioFormat"));
  const sampleRate = parsePositiveNumber(formData.get("sampleRate"));
  const channels = parsePositiveNumber(formData.get("channels"));
  const bits = parsePositiveNumber(formData.get("bits"));

  if (file.size > MAX_TRANSCRIPTION_BYTES) {
    return jsonError("audio_too_large_for_direct_asr", 413);
  }

  const result = usesDoubaoTranscriptionProvider()
    ? await transcribePrivateUploadedFile({
        file,
        audioFormat,
        sampleRate,
        channels,
        bits
      })
    : await transcribeAudioFile({
        file,
        language: "zh",
        audioFormat,
        sampleRate,
        channels,
        bits
      });
  const text = result.text.trim();

  return jsonOk({
    text,
    fileName: file.name,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    estimatedWordCount: estimateWordCount(text),
    model: result.model,
    status: result.status,
    ...transcriptionDiagnostics(result),
    message:
      result.status === "ok"
        ? "已识别口播内容。"
        : transcriptionMessage(result.status, result)
  });
}

function parseAudioFormat(value: unknown) {
  return value === "pcm" || value === "wav" || value === "mp3" || value === "ogg" ? value : undefined;
}

async function transcribePrivateUploadedFile(params: {
  file: File;
  audioFormat?: "pcm" | "wav" | "mp3" | "ogg";
  sampleRate?: number;
  channels?: number;
  bits?: number;
}) {
  if (!isTosConfigured()) {
    console.warn("[Doubao ASR] skipped: TOS is not configured for private source audio.");
    return {
      text: "",
      model: getDoubaoAsrModelName(),
      status: "missing_tos_config",
      provider: "doubao_auc",
      source: "tos",
      message: "TOS is not configured for Doubao ASR source audio."
    };
  }

  try {
    const tosSource = await uploadPrivateTosObject({
      file: params.file,
      prefix: "doctor/audio"
    });
    await verifyPrivateTosSourceUrl(tosSource);
    console.info(
      `[Doubao ASR] using TOS source audio: file=${params.file.name} key=${tosSource.key} host=${tosSource.host}`
    );

    const result = await transcribeAudioFile({
      file: params.file,
      sourceUrl: tosSource.signedUrl,
      audioFormat: params.audioFormat,
      sampleRate: params.sampleRate,
      channels: params.channels,
      bits: params.bits
    });

    return {
      ...result,
      source: "tos"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "TOS source audio failed.";
    console.warn(`[Doubao ASR] TOS source failed: file=${params.file.name} ${message}`);

    return {
      text: "",
      model: getDoubaoAsrModelName(),
      status: message.includes("self-check")
        ? "tos_source_self_check_failed"
        : "tos_source_error",
      provider: "doubao_auc",
      source: "tos",
      message
    };
  }
}

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ||
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");

  return host ? `${forwardedProto}://${host}` : new URL(request.url).origin;
}

function transcriptionDiagnostics(result: unknown) {
  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const diagnostics: Record<string, string> = {};

  for (const key of ["provider", "source", "taskId", "logId", "statusCode"]) {
    if (typeof record[key] === "string" && record[key]) {
      diagnostics[key] = record[key];
    }
  }

  return diagnostics;
}

function transcriptionMessage(status: string, result: unknown) {
  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};

  if (typeof record.message === "string" && record.message) {
    return record.message;
  }

  if (status === "audio_too_large_for_direct_asr") {
    return "提取出的音频超过当前直传限制，这次先按关键画面和你的说明分析。";
  }

  if (status === "missing_tos_config") {
    return "TOS 音频源没有配置完整，豆包暂时无法读取音频。";
  }

  if (status === "tos_source_self_check_failed") {
    return "TOS 预签名音频链接自检失败，已停止提交豆包任务。";
  }

  if (status === "silent_audio") {
    return "豆包没有检测到可识别的人声，这次先按关键画面和你的说明分析。";
  }

  return "这次没有拿到口播转写，继续按关键画面和你的说明分析。";
}

function estimateWordCount(text: string) {
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = text
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+/g)?.length ?? 0;

  return cjkCount + latinCount;
}
