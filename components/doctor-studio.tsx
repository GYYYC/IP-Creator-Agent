"use client";

import { createMultipartUploader, upload } from "@vercel/blob/client";
import { ChangeEvent, useEffect, useRef, useState } from "react";

type ContentMode = "graphic" | "video";
type ScriptTab = "original" | "rewritten";

type DoctorOutput = {
  assistantMessage?: string;
  mainIssue?: string;
  evidence?: string;
  timeline?: Array<{ label?: string; title?: string; description?: string; time?: string; role?: string; script?: string }>;
  actions?: string[];
  rewrittenScript?: {
    title?: string;
    body?: string;
    targetDurationSeconds?: number;
    targetWordCountRange?: string;
    estimatedWordCount?: number;
    segments?: Array<{ label?: string; script?: string; note?: string }>;
    revisionNotes?: string[];
  } | null;
  _aiStatus?: string;
};

type ApiSession = {
  id: string;
  contentMode?: ContentMode;
  input?: Record<string, unknown>;
  output: DoctorOutput;
  writebackCandidates: unknown[];
};

type ArtifactResponse = {
  artifact: {
    id: string;
  };
};

type RegisteredArtifactInput = {
  file: File;
  kind: string;
  visualRole: "content" | "data";
};

type ArtifactRegistrationInput = {
  kind: string;
  mimeType: string;
  fileName: string;
  sizeBytes?: number;
  storageKey?: string;
  url?: string;
  extractedText?: string;
  extractedJson?: Record<string, unknown>;
};

type RetentionImageInput = {
  fileName: string;
  dataUrl: string;
};

type FrameTimePlan = {
  source: "user" | "retention" | "duration";
  times: number[];
  reason?: string;
};

type VideoMetadata = {
  fileName: string;
  durationSeconds: number;
  width: number;
  height: number;
};

type TranscriptUtterance = {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
};

type VideoTranscript = {
  fileName: string;
  text: string;
  durationSeconds: number;
  estimatedWordCount: number;
  status: string;
  utterances?: TranscriptUtterance[];
  url?: string;
  message?: string;
};

type BlobUploadResult = {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
};

type BlobUploadOutcome = {
  blob: BlobUploadResult | null;
  status: "ok" | "timeout" | "failed";
  message?: string;
};

type TranscriptionAudioFileResult = {
  file: File;
  fileName: string;
  contentType: string;
  audioFormat: "wav";
  sampleRate: number;
  channels: number;
  bits: number;
};

type ScriptLengthGuide = {
  basis: "transcript" | "duration" | "unknown";
  targetDurationSeconds: number;
  originalWordCount: number;
  minWordCount: number;
  maxWordCount: number;
  instruction: string;
};

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type BlobClientTokenResponse = {
  type: "blob.generate-client-token";
  clientToken: string;
};

async function postJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readApiResponse<T>(response);

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url);
  const payload = await readApiResponse<T>(response);

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}

async function postFormData<T>(url: string, body: FormData) {
  const response = await fetch(url, {
    method: "POST",
    body
  });
  const payload = await readApiResponse<T>(response);

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();

  if (!text.trim()) {
    return {
      ok: false,
      error: `接口返回了空响应（HTTP ${response.status}）。请查看 Vercel 对应请求日志。`
    };
  }

  try {
    const payload = JSON.parse(text) as ApiResponse<T>;

    if (!response.ok && payload.ok) {
      return { ok: false, error: `请求失败：HTTP ${response.status}` };
    }

    return payload;
  } catch {
    return {
      ok: false,
      error: text.trim()
        ? `请求失败：HTTP ${response.status} ${text.slice(0, 160)}`
        : `请求失败：HTTP ${response.status}`
    };
  }
}

async function retrieveBlobClientToken(params: {
  pathname: string;
  multipart: boolean;
  file: File;
  uploadClient: string;
  kind?: "doctor-video" | "doctor-audio";
}) {
  const response = await fetch("/api/uploads/blob", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: {
        pathname: params.pathname,
        multipart: params.multipart,
        clientPayload: JSON.stringify({
          uploadClient: params.uploadClient,
          kind: params.kind || "doctor-video",
          fileName: params.file.name,
          sizeBytes: params.file.size,
          contentType: params.file.type || "application/octet-stream"
        })
      }
    })
  });
  const text = await response.text();
  let payload: BlobClientTokenResponse | { ok: false; error: string } | null = null;

  if (text.trim()) {
    try {
      payload = JSON.parse(text) as BlobClientTokenResponse | { ok: false; error: string };
    } catch {
      payload = null;
    }
  }

  if (!response.ok || !payload || !("clientToken" in payload)) {
    const message =
      payload && "error" in payload
        ? payload.error
        : `没有拿到 Blob 上传授权（HTTP ${response.status}）。`;
    throw new Error(message);
  }

  return payload.clientToken;
}

const DIRECT_TRANSCRIPTION_FILE_LIMIT_BYTES = 4 * 1024 * 1024;
const MANUAL_MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;
const MANUAL_MULTIPART_PART_BYTES = 5 * 1024 * 1024;
const BLOB_UPLOAD_MIN_TIMEOUT_MS = 5 * 60 * 1000;
const BLOB_UPLOAD_MAX_TIMEOUT_MS = 45 * 60 * 1000;
const BLOB_UPLOAD_TIMEOUT_PER_MB_MS = 3000;
const TRANSCRIPTION_AUDIO_SAMPLE_RATE = 16000;
const TRANSCRIPTION_AUDIO_CHANNELS = 1;
const TRANSCRIPTION_AUDIO_BITS = 16;
const VISUAL_IMAGE_MAX_SIDE = 1280;
const VIDEO_FRAME_MAX_SIDE = 960;
const VISUAL_JPEG_QUALITY = 0.72;
const VIDEO_FRAME_JPEG_QUALITY = 0.7;
const MAX_VIDEO_FRAME_ARTIFACTS = 6;

const fallbackOutput: DoctorOutput = {
  mainIssue: "第 15 秒开始交代背景，信息密度突然下降，观众在这里流失最明显。",
  evidence: "半自动模式会结合留存截图说明、关键时间点和补充数据分析。",
  timeline: [
    {
      label: "0s - 5s",
      title: "身份建立很快",
      description: "一开始就让人知道这是来自真实经历的判断，信任建立得不错。"
    },
    {
      label: "15s - 22s",
      title: "明显掉点出现",
      description: "进入背景铺陈后，信息密度下降，留存从 72% 掉到 41%。"
    },
    {
      label: "28s - 45s",
      title: "方法段把人拉回来",
      description: "具体方法出现后，评论区开始出现高价值问题和收藏意图。"
    }
  ],
  actions: ["把结论提前到前 8 秒", "背景只保留一句", "方法部分改成 3 个短动作", "结尾改成让评论区说出自己最卡的地方"]
};

const MODE_CONFIG: Record<
  ContentMode,
  {
    label: string;
    title: string;
    contentLabel: string;
    contentHint: string;
    contentAccept: string;
    dataLabel: string;
    dataHint: string;
    statsPlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
    resultLabel: string;
  }
> = {
  graphic: {
    label: "图文",
    title: "把这篇图文的材料给我",
    contentLabel: "上传图文素材",
    contentHint: "首图、正文截图、标题页都可以先放进来。",
    contentAccept: "image/*,.txt,.md,.pdf",
    dataLabel: "上传数据截图（可选）",
    dataHint: "浏览、点赞、收藏、评论数据有就补充。",
    statsPlaceholder: "例如：浏览 1.8w，点赞 900，收藏 680，评论 96，收藏率高但评论少",
    notesLabel: "想让 Doctor 看哪里",
    notesPlaceholder: "例如：帮我看首图有没有把价值讲清楚；第二屏开始讲经历，会不会太慢；结尾评论引导够不够具体。",
    resultLabel: "结构记录"
  },
  video: {
    label: "视频",
    title: "把这条视频的材料给我",
    contentLabel: "上传视频素材",
    contentHint: "原片、片段、关键帧都可以先放进来。",
    contentAccept: "video/*,image/*",
    dataLabel: "上传留存曲线（可选）",
    dataHint: "有留存曲线就放，没有也可以只写说明。",
    statsPlaceholder: "例如：播放 2.1w，点赞 1.2k，收藏 420，评论 138，完播率 24%",
    notesLabel: "想让 Doctor 看哪里",
    notesPlaceholder: "例如：帮我看前 3 秒能不能抓住人；20 秒开始讲方法会不会太晚；结尾想引导评论但不想太硬。",
    resultLabel: "时间轴"
  }
};

function fileNames(files: File[]) {
  if (!files.length) {
    return ["还没有选择文件"];
  }

  return files.map((file) => file.name);
}

function hasDoctorOutput(output: DoctorOutput | undefined) {
  return Boolean(
    output?.mainIssue ||
      output?.evidence ||
      output?.timeline?.length ||
      output?.actions?.length
  );
}

function completionMessage(output: DoctorOutput) {
  if (output._aiStatus === "missing_api_key") {
    return "线上没有读取到模型 API Key，这次先显示基础判断。";
  }

  if (output._aiStatus) {
    return "模型这次没有返回可用结果，先显示基础判断。";
  }

  return "复盘完成";
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg)$/i.test(file.name);
}

function safeUploadPath(fileName: string) {
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");

  return `doctor/videos/${Date.now()}-${safeName || "video.mp4"}`;
}

function blobUploadTimeoutMs(fileSize: number) {
  const sizeMb = Math.ceil(fileSize / (1024 * 1024));

  return Math.min(
    BLOB_UPLOAD_MAX_TIMEOUT_MS,
    Math.max(BLOB_UPLOAD_MIN_TIMEOUT_MS, sizeMb * BLOB_UPLOAD_TIMEOUT_PER_MB_MS)
  );
}

function formatMinutes(ms: number) {
  return Math.max(1, Math.round(ms / 60000));
}

function countTextUnits(text: string) {
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = text
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+/g)?.length ?? 0;

  return cjkCount + latinCount;
}

function normalizeTranscriptUtterances(value: unknown): TranscriptUtterance[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): TranscriptUtterance | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      const startTimeSeconds =
        typeof record.startTimeSeconds === "number"
          ? record.startTimeSeconds
          : typeof record.startTimeMs === "number"
            ? Math.round((record.startTimeMs / 1000) * 10) / 10
            : undefined;
      const endTimeSeconds =
        typeof record.endTimeSeconds === "number"
          ? record.endTimeSeconds
          : typeof record.endTimeMs === "number"
            ? Math.round((record.endTimeMs / 1000) * 10) / 10
            : startTimeSeconds;

      if (!text || typeof startTimeSeconds !== "number" || typeof endTimeSeconds !== "number") {
        return null;
      }

      return {
        text,
        startTimeSeconds,
        endTimeSeconds,
        startTimeMs:
          typeof record.startTimeMs === "number"
            ? record.startTimeMs
            : Math.round(startTimeSeconds * 1000),
        endTimeMs:
          typeof record.endTimeMs === "number"
            ? record.endTimeMs
            : Math.round(endTimeSeconds * 1000)
      };
    })
    .filter((item): item is TranscriptUtterance => Boolean(item));
}

function formatTranscriptTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatTranscriptTimeRange(utterance: TranscriptUtterance) {
  return `${formatTranscriptTime(utterance.startTimeSeconds)}-${formatTranscriptTime(
    utterance.endTimeSeconds
  )}`;
}

function transcriptTextForArtifact(transcript: VideoTranscript) {
  if (!transcript.utterances?.length) {
    return transcript.text;
  }

  return transcript.utterances
    .map((utterance) => `[${formatTranscriptTimeRange(utterance)}] ${utterance.text}`)
    .join("\n");
}

function estimateWordRangeFromDuration(durationSeconds: number) {
  const duration = Math.max(0, durationSeconds);

  if (!duration) {
    return {
      minWordCount: 220,
      maxWordCount: 320
    };
  }

  return {
    minWordCount: Math.max(80, Math.round(duration * 3.7)),
    maxWordCount: Math.max(120, Math.round(duration * 5.3))
  };
}

function buildScriptLengthGuide(params: {
  videoMetadata: VideoMetadata[];
  transcripts: VideoTranscript[];
}): ScriptLengthGuide {
  const usableTranscripts = params.transcripts.filter((item) => item.text.trim());
  const transcriptWordCount = usableTranscripts.reduce(
    (total, item) => total + (item.estimatedWordCount || countTextUnits(item.text)),
    0
  );
  const targetDurationSeconds =
    usableTranscripts.reduce((total, item) => total + item.durationSeconds, 0) ||
    params.videoMetadata.reduce((total, item) => total + item.durationSeconds, 0);

  if (transcriptWordCount) {
    return {
      basis: "transcript",
      targetDurationSeconds,
      originalWordCount: transcriptWordCount,
      minWordCount: Math.max(80, Math.round(transcriptWordCount * 0.85)),
      maxWordCount: Math.max(120, Math.round(transcriptWordCount * 1.15)),
      instruction: "优先贴近原口播字数，上下浮动不超过 15%。"
    };
  }

  if (targetDurationSeconds) {
    const range = estimateWordRangeFromDuration(targetDurationSeconds);

    return {
      basis: "duration",
      targetDurationSeconds,
      originalWordCount: 0,
      minWordCount: range.minWordCount,
      maxWordCount: range.maxWordCount,
      instruction: "没有口播稿时，按视频时长估算脚本字数。"
    };
  }

  return {
    basis: "unknown",
    targetDurationSeconds: 60,
    originalWordCount: 0,
    minWordCount: 220,
    maxWordCount: 320,
    instruction: "素材没有明确时长时，按一条 60 秒短视频控制篇幅。"
  };
}

function getSessionTranscripts(session: ApiSession | null): VideoTranscript[] {
  const value = session?.input?.audioTranscripts;

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): VideoTranscript | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";

      if (!text) {
        return null;
      }

      return {
        fileName: typeof record.fileName === "string" ? record.fileName : "视频口播",
        text,
        durationSeconds:
          typeof record.durationSeconds === "number" ? record.durationSeconds : 0,
        estimatedWordCount:
          typeof record.estimatedWordCount === "number"
            ? record.estimatedWordCount
            : countTextUnits(text),
        status: typeof record.status === "string" ? record.status : "ok",
        utterances: normalizeTranscriptUtterances(record.utterances),
        url: typeof record.url === "string" ? record.url : undefined,
        message: typeof record.message === "string" ? record.message : undefined
      };
    })
    .filter((item): item is VideoTranscript => Boolean(item));
}

function getScriptBody(output: DoctorOutput) {
  return typeof output.rewrittenScript?.body === "string"
    ? output.rewrittenScript.body.trim()
    : "";
}

function normalizeDoctorTimeline(
  items: DoctorOutput["timeline"],
  fallbackText?: string,
  transcripts: VideoTranscript[] = []
): Array<{ label: string; title: string; description: string }> {
  const fallbackParts = typeof fallbackText === "string"
    ? fallbackText
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const normalized = (items ?? [])
    .map((item, index) => {
      if (isPlaceholderDoctorTimelineItem(item)) {
        return null;
      }

      const label = item.label?.trim() || item.time?.trim() || `第 ${index + 1} 个掉点`;
      const title = item.title?.trim() || item.role?.trim() || "这一段需要重点复盘";
      const description =
        item.description?.trim() ||
        item.script?.trim() ||
        fallbackParts[index] ||
        fallbackParts.at(-1) ||
        "结合这一段检查信息密度、信任感和观众继续看下去的理由。";

      return { label, title, description };
    })
    .filter((item): item is { label: string; title: string; description: string } =>
      Boolean(item?.label || item?.title || item?.description)
    );

  if (normalized.length) {
    return normalized;
  }

  const evidenceTimeline = buildTimelineFromEvidence(fallbackParts);

  if (evidenceTimeline.length) {
    return evidenceTimeline;
  }

  return buildTimelineFromTranscripts(transcripts);
}

function isPlaceholderDoctorTimelineItem(
  item: NonNullable<DoctorOutput["timeline"]>[number]
) {
  const label = item.label?.trim() || item.time?.trim() || "";
  const title = item.title?.trim() || item.role?.trim() || "";
  const description = item.description?.trim() || item.script?.trim() || "";

  return (
    (!item.label && !item.title && !item.description && Boolean(item.time || item.role || item.script)) ||
    (/^\d+$/.test(label) && title === "拍摄段落") ||
    title === "拍摄段落" ||
    /完整口播稿对应内容拍摄|按完整口播稿/.test(description)
  );
}

function buildTimelineFromEvidence(parts: string[]) {
  const timePattern =
    /((?:\d{1,2}:)?\d{1,2}(?:\.\d+)?\s*(?:-|~|—|–|到)\s*(?:\d{1,2}:)?\d{1,2}(?:\.\d+)?\s*(?:s|秒)?)/i;

  return parts
    .map((part) => {
      const match = part.match(timePattern);

      if (!match) {
        return null;
      }

      const label = match[1].replace(/\s+/g, "").replace(/秒/g, "s");
      const rest = part.replace(match[0], "").replace(/^[:：,，\s-]+/, "").trim();
      const [firstSentence = rest] = rest.split(/[。；;]/);

      return {
        label,
        title: firstSentence.trim() || "这一段是关键掉点",
        description: rest || part
      };
    })
    .filter((item): item is { label: string; title: string; description: string } => Boolean(item));
}

function buildTimelineFromTranscripts(transcripts: VideoTranscript[]) {
  const utterances = transcripts
    .flatMap((transcript) => transcript.utterances ?? [])
    .filter((utterance) => utterance.text.trim())
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  if (!utterances.length) {
    const text = transcripts.map((transcript) => transcript.text).filter(Boolean).join("\n").trim();

    return text
      ? [
          {
            label: "口播稿",
            title: "先按原文复盘",
            description: `原文内容是：“${text.slice(0, 140)}${text.length > 140 ? "..." : ""}”。建议重新分析一次，让 Doctor 根据带时间口播稿生成具体掉点。`
          }
        ]
      : [];
  }

  const itemCount = Math.min(5, utterances.length);
  const chunkSize = Math.max(1, Math.ceil(utterances.length / itemCount));
  const titles = ["开头信息进入速度", "承诺和方法是否清楚", "中段信息推进", "后段是否继续给价值", "结尾行动是否明确"];

  return Array.from({ length: itemCount })
    .map((_, index) => {
      const chunk = utterances.slice(index * chunkSize, (index + 1) * chunkSize);

      if (!chunk.length) {
        return null;
      }

      const text = chunk.map((utterance) => utterance.text).join("");
      const start = chunk[0];
      const end = chunk[chunk.length - 1];

      return {
        label: formatTranscriptTimeRange({
          ...start,
          endTimeMs: end.endTimeMs,
          endTimeSeconds: end.endTimeSeconds
        }),
        title: titles[index] || "这一段需要重点复盘",
        description: `这一段原文是：“${text.slice(0, 120)}${text.length > 120 ? "..." : ""}”。如果这里没有继续给出判断、方法或转折，就会让观众感觉信息停住；建议把具体收益或下一步动作提前。`
      };
    })
    .filter((item): item is { label: string; title: string; description: string } => Boolean(item));
}

async function fileToVisualDataUrl(file: File) {
  if (!isImageFile(file)) {
    return undefined;
  }

  const bitmap = await createImageBitmap(file);
  const maxSide = VISUAL_IMAGE_MAX_SIDE;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    return undefined;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", VISUAL_JPEG_QUALITY);
}

function waitForMediaEvent(target: HTMLMediaElement, eventName: string) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, handleEvent);
      target.removeEventListener("error", handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("视频素材暂时没有读取成功。"));
    };

    target.addEventListener(eventName, handleEvent, { once: true });
    target.addEventListener("error", handleError, { once: true });
  });
}

function normalizeFrameTimes(times: number[], duration: number, limit = MAX_VIDEO_FRAME_ARTIFACTS) {
  const max = Math.max(0, duration);

  return Array.from(
    new Set(
      times
        .filter((time) => Number.isFinite(time))
        .map((time) => Math.min(max, Math.max(0, Math.round(time * 10) / 10)))
    )
  )
    .sort((a, b) => a - b)
    .slice(0, limit);
}

function aroundTime(time: number) {
  return [time - 2, time, time + 2];
}

function frameTimesForDuration(duration: number) {
  if (duration <= 15) {
    return normalizeFrameTimes([0, 1, 3, duration / 2, duration - 1], duration);
  }

  if (duration <= 60) {
    return normalizeFrameTimes([0, 1, 3, 8, 15, duration / 2, duration - 5], duration);
  }

  if (duration <= 180) {
    return normalizeFrameTimes(
      [0, 1, 3, 8, 15, 30, duration * 0.5, duration - 8],
      duration
    );
  }

  return normalizeFrameTimes(
    [0, 1, 3, 8, 15, 30, duration * 0.25, duration * 0.5, duration - 10],
    duration
  );
}

function frameTimesFromText(text: string, duration: number) {
  const normalized = text.replace(/０/g, "0").replace(/１/g, "1").replace(/２/g, "2")
    .replace(/３/g, "3").replace(/４/g, "4").replace(/５/g, "5")
    .replace(/６/g, "6").replace(/７/g, "7").replace(/８/g, "8")
    .replace(/９/g, "9");
  const times: number[] = [];
  const firstSeconds = normalized.match(/前\s*(\d+(?:\.\d+)?)\s*(秒|s|S)/);

  if (firstSeconds) {
    const end = Number(firstSeconds[1]);
    return normalizeFrameTimes([0, 1, 3, end], duration);
  }

  if (/(开头|前面|前段|前半段|起手|前\s*3\s*(秒|s|S))/.test(normalized)) {
    times.push(0, 1, 3, 8);
  }

  if (/(结尾|最后|尾段|收尾)/.test(normalized)) {
    times.push(duration - 8, duration - 5, duration - 2);
  }

  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/g)) {
    times.push(Number(match[1]) * 60 + Number(match[2]));
  }

  for (const match of normalized.matchAll(
    /(\d+(?:\.\d+)?)\s*(?:-|~|～|到|至)\s*(\d+(?:\.\d+)?)\s*(秒|s|S)/g
  )) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    times.push(start, (start + end) / 2, end);
  }

  const exactTimes = Array.from(
    normalized.matchAll(/(?<!播放|浏览|点赞|收藏|评论)(\d+(?:\.\d+)?)\s*(秒|s|S)/g)
  ).map((match) => Number(match[1]));

  if (exactTimes.length === 1) {
    times.push(...aroundTime(exactTimes[0]));
  } else {
    for (const time of exactTimes) {
      times.push(time);
    }
  }

  return normalizeFrameTimes(times, duration);
}

async function resolveFrameTimePlan(params: {
  duration: number;
  notes: string;
  stats: string;
  retentionImages: RetentionImageInput[];
}) {
  const fromUser = frameTimesFromText(`${params.notes}\n${params.stats}`, params.duration);

  if (fromUser.length) {
    return {
      source: "user",
      times: fromUser,
      reason: "按你写的时间点取关键画面"
    } satisfies FrameTimePlan;
  }

  if (params.retentionImages.length) {
    try {
      const result = await postJson<{ times: number[]; reason?: string }>(
        "/api/doctor/frame-times",
        {
          duration: params.duration,
          notes: params.notes,
          stats: params.stats,
          images: params.retentionImages
        }
      );
      const times = normalizeFrameTimes(result.times ?? [], params.duration);

      if (times.length) {
        return {
          source: "retention",
          times,
          reason: result.reason || "按留存图里的掉点取关键画面"
        } satisfies FrameTimePlan;
      }
    } catch {
      // Fall through to the duration-aware default.
    }
  }

  return {
    source: "duration",
    times: frameTimesForDuration(params.duration),
    reason: "按视频长度取开头、转折和结尾画面"
  } satisfies FrameTimePlan;
}

async function readVideoMetadata(file: File): Promise<VideoMetadata> {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.muted = true;
  video.preload = "metadata";
  video.playsInline = true;

  try {
    await waitForMediaEvent(video, "loadedmetadata");

    return {
      fileName: file.name,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}

async function uploadVideoToBlob(
  file: File,
  onProgress?: (percentage: number) => void
): Promise<BlobUploadOutcome> {
  const controller = new AbortController();
  let timeoutId: number | undefined;
  const timeoutMs = blobUploadTimeoutMs(file.size);
  const pathname = safeUploadPath(file.name);

  const uploadTask = uploadVideoWithBlobStrategy(file, pathname, controller.signal, onProgress)
    .then((blob): BlobUploadOutcome => ({ blob, status: "ok" }))
    .catch((error): BlobUploadOutcome => {
      const reason = error instanceof Error ? error.message : "unknown error";
      console.warn(`[Doctor] Blob upload failed: ${reason}`);

      return {
        blob: null,
        status: "failed",
        message: `视频没有传到 Blob：${reason}`
      };
    });

  const timeoutTask = new Promise<BlobUploadOutcome>((resolve) => {
    timeoutId = window.setTimeout(() => {
      controller.abort();
      resolve({
        blob: null,
        status: "timeout",
        message: `视频上传超过 ${formatMinutes(timeoutMs)} 分钟，已先按关键画面分析。`
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([uploadTask, timeoutTask]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function uploadVideoWithBlobStrategy(
  file: File,
  pathname: string,
  abortSignal: AbortSignal,
  onProgress?: (percentage: number) => void
) {
  if (file.size > MANUAL_MULTIPART_THRESHOLD_BYTES) {
    return uploadVideoWithManualMultipart(file, pathname, abortSignal, onProgress);
  }

  return upload(pathname, file, {
    access: "private",
    contentType: file.type || "application/octet-stream",
    handleUploadUrl: "/api/uploads/blob",
    multipart: false,
    abortSignal,
    onUploadProgress: (progress) => {
      onProgress?.(Math.max(0, Math.min(100, Math.round(progress.percentage))));
    },
    clientPayload: JSON.stringify({
      uploadClient: "doctor-video-v3-single-put",
      kind: "doctor-video",
      fileName: file.name,
      sizeBytes: file.size,
      contentType: file.type || "application/octet-stream"
    })
  });
}

async function uploadVideoWithManualMultipart(
  file: File,
  pathname: string,
  abortSignal: AbortSignal,
  onProgress?: (percentage: number) => void
) {
  const token = await retrieveBlobClientToken({
    pathname,
    multipart: true,
    file,
    uploadClient: "doctor-video-v3-manual-multipart",
    kind: "doctor-video"
  });
  const uploader = await createMultipartUploader(pathname, {
    access: "private",
    token,
    contentType: file.type || "application/octet-stream",
    abortSignal
  });
  const parts = [];
  let partNumber = 1;

  for (let offset = 0; offset < file.size; offset += MANUAL_MULTIPART_PART_BYTES) {
    const end = Math.min(file.size, offset + MANUAL_MULTIPART_PART_BYTES);
    const partBlob = file.slice(offset, end, "application/octet-stream");
    const part = await uploader.uploadPart(partNumber, partBlob);
    parts.push(part);
    onProgress?.(Math.max(0, Math.min(99, Math.round((end / file.size) * 100))));
    partNumber += 1;
  }

  const blob = await uploader.complete(parts);
  onProgress?.(100);

  return blob;
}

async function prepareTranscriptionAudioFile(file: File): Promise<TranscriptionAudioFileResult | null> {
  try {
    const audioFile = await extractWavAudioFile(file);

    if (!audioFile) {
      return null;
    }

    return {
      file: audioFile,
      fileName: audioFile.name,
      contentType: audioFile.type || "audio/wav",
      audioFormat: "wav",
      sampleRate: TRANSCRIPTION_AUDIO_SAMPLE_RATE,
      channels: TRANSCRIPTION_AUDIO_CHANNELS,
      bits: TRANSCRIPTION_AUDIO_BITS
    };
  } catch (error) {
    console.warn(
      `[Doctor] transcription audio extraction failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return null;
  }
}

async function extractWavAudioFile(file: File): Promise<File | null> {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  const audioContext = new AudioContextConstructor();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    if (!audioBuffer.numberOfChannels || !audioBuffer.duration) {
      return null;
    }

    const pcm = resampleToMonoPcm16(audioBuffer, TRANSCRIPTION_AUDIO_SAMPLE_RATE);
    const wav = wrapPcm16InWav({
      pcm,
      sampleRate: TRANSCRIPTION_AUDIO_SAMPLE_RATE,
      channels: TRANSCRIPTION_AUDIO_CHANNELS,
      bits: TRANSCRIPTION_AUDIO_BITS
    });
    const safeBaseName = file.name.replace(/\.[^.]+$/, "") || "video";

    return new File([wav], `${safeBaseName}.wav`, {
      type: "audio/wav"
    });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function resampleToMonoPcm16(audioBuffer: AudioBuffer, targetSampleRate: number) {
  const sourceSampleRate = audioBuffer.sampleRate;
  const targetLength = Math.max(1, Math.round(audioBuffer.duration * targetSampleRate));
  const output = new ArrayBuffer(targetLength * 2);
  const view = new DataView(output);
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index)
  );

  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * (sourceSampleRate / targetSampleRate);
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, audioBuffer.length - 1);
    const ratio = sourcePosition - leftIndex;
    const sample =
      channels.reduce((sum, channel) => {
        const left = channel[leftIndex] ?? 0;
        const right = channel[rightIndex] ?? left;

        return sum + left + (right - left) * ratio;
      }, 0) / channels.length;
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcmSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

    view.setInt16(index * 2, Math.round(pcmSample), true);
  }

  return output;
}

function wrapPcm16InWav(params: {
  pcm: ArrayBuffer;
  sampleRate: number;
  channels: number;
  bits: number;
}) {
  const headerBytes = 44;
  const dataBytes = params.pcm.byteLength;
  const output = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(output);
  const bytesPerSample = params.bits / 8;
  const blockAlign = params.channels * bytesPerSample;
  const byteRate = params.sampleRate * blockAlign;

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, params.channels, true);
  view.setUint32(24, params.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, params.bits, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  new Uint8Array(output, headerBytes).set(new Uint8Array(params.pcm));

  return output;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

async function transcribeVideoFile(
  file: File,
  durationSeconds: number
): Promise<VideoTranscript> {
  const audio = await prepareTranscriptionAudioFile(file);

  if (!audio?.file) {
    return {
      fileName: file.name,
      text: "",
      durationSeconds,
      estimatedWordCount: 0,
      status: "audio_extraction_failed",
      message: "没有从视频中提取到可识别音频，这次先按关键画面和你的说明分析。"
    };
  }

  if (audio.file.size > DIRECT_TRANSCRIPTION_FILE_LIMIT_BYTES) {
    return {
      fileName: audio.fileName,
      text: "",
      durationSeconds,
      estimatedWordCount: 0,
      status: "audio_too_large_for_direct_asr",
      message: "提取出的音频超过当前直传限制，这次先按关键画面和你的说明分析。"
    };
  }

  try {
    const formData = new FormData();
    formData.append("file", audio.file, audio.fileName);
    formData.append("durationSeconds", String(durationSeconds || 0));
    formData.append("audioFormat", audio.audioFormat);
    formData.append("sampleRate", String(audio.sampleRate));
    formData.append("channels", String(audio.channels));
    formData.append("bits", String(audio.bits));

    return await postFormData<VideoTranscript>("/api/doctor/transcribe", formData);
  } catch (error) {
    console.warn(
      `[Doctor] direct audio transcription failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return {
      fileName: audio.fileName,
      text: "",
      durationSeconds,
      estimatedWordCount: 0,
      status: "request_error",
      message: error instanceof Error ? error.message : "这次没有拿到口播转写。"
    };
  }
}

async function extractVideoFrameArtifacts(
  file: File,
  params: {
    notes: string;
    stats: string;
    retentionImages: RetentionImageInput[];
  }
): Promise<ArtifactRegistrationInput[]> {
  if (!isVideoFile(file)) {
    return [];
  }

  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.muted = true;
  video.preload = "metadata";
  video.playsInline = true;

  try {
    await waitForMediaEvent(video, "loadedmetadata");
    await waitForMediaEvent(video, "loadeddata").catch(() => undefined);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const plan = await resolveFrameTimePlan({
      duration,
      notes: params.notes,
      stats: params.stats,
      retentionImages: params.retentionImages
    });
    const maxSide = VIDEO_FRAME_MAX_SIDE;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      return [];
    }

    const frameArtifacts: ArtifactRegistrationInput[] = [];
    const baseName = file.name.replace(/\.[^.]+$/, "");

    for (const time of plan.times) {
      const safeTime = Math.min(time, Math.max(0, duration - 0.1));
      if (Math.abs(video.currentTime - safeTime) > 0.05) {
        video.currentTime = safeTime;
        await waitForMediaEvent(video, "seeked");
      }
      context.drawImage(video, 0, 0, width, height);
      const visualDataUrl = canvas.toDataURL("image/jpeg", VIDEO_FRAME_JPEG_QUALITY);
      frameArtifacts.push({
        kind: "image",
        mimeType: "image/jpeg",
        fileName: `${baseName} ${time}s frame.jpg`,
        extractedJson: {
          visualDataUrl,
          visualRole: "video_frame",
          frameTimeSeconds: time,
          frameSelectionSource: plan.source,
          frameSelectionReason: plan.reason,
          sourceFileName: file.name
        }
      });
    }

    return frameArtifacts;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}

export function DoctorStudio({ initialSessionId }: { initialSessionId?: string } = {}) {
  const resultRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<ContentMode>("video");
  const [contentFiles, setContentFiles] = useState<File[]>([]);
  const [dataFiles, setDataFiles] = useState<File[]>([]);
  const [stats, setStats] = useState("");
  const [notes, setNotes] = useState("");
  const [followup, setFollowup] = useState("");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [scriptTab, setScriptTab] = useState<ScriptTab>("rewritten");
  const config = MODE_CONFIG[mode];
  const sessionOutput = session?.output;
  const output =
    hasDoctorOutput(sessionOutput) || sessionOutput?.assistantMessage
      ? sessionOutput!
      : fallbackOutput;
  const scriptBody = getScriptBody(output);
  const transcripts = getSessionTranscripts(session);
  const timelineItems = normalizeDoctorTimeline(output.timeline, output.evidence || output.mainIssue, transcripts);
  const hasTranscriptEvidence = transcripts.length > 0;
  const hasTimelineEvidence = timelineItems.length > 0;
  const hasEvidence = hasTimelineEvidence;
  const hasScriptWorkspace = Boolean(session?.id || scriptBody || hasTranscriptEvidence);
  const canAnalyze = stats.trim() || notes.trim() || contentFiles.length > 0 || dataFiles.length > 0;

  useEffect(() => {
    if (!initialSessionId) {
      return;
    }

    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      setMessage("");
      try {
        const data = await fetchJson<{ session: ApiSession }>(`/api/sessions/${initialSessionId}`);

        if (cancelled) {
          return;
        }

        const loadedSession = data.session;
        const input = loadedSession.input ?? {};

        setMode(loadedSession.contentMode ?? "video");
        setStats(typeof input.stats === "string" ? input.stats : "");
        setNotes(typeof input.notes === "string" ? input.notes : "");
        setContentFiles([]);
        setDataFiles([]);
        setSession(loadedSession);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "这条记录暂时没有打开成功。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [initialSessionId]);

  useEffect(() => {
    if (scriptTab === "original" && !hasTranscriptEvidence && (session?.id || scriptBody)) {
      setScriptTab("rewritten");
    }
  }, [hasTranscriptEvidence, scriptBody, scriptTab, session?.id]);

  function switchMode(nextMode: ContentMode) {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setContentFiles([]);
    setDataFiles([]);
    setSession(null);
    setMessage("");
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>, type: "content" | "data") {
    const files = Array.from(event.target.files ?? []);

    if (type === "content") {
      setContentFiles(files);
    } else {
      setDataFiles(files);
    }

    setSession(null);
    setMessage("");
  }

  async function runDoctor() {
    if (!canAnalyze) {
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      setMessage("正在读取素材");
      const artifactInputs: RegisteredArtifactInput[] = [
        ...contentFiles.map((file) => ({
          file,
          kind: mode === "video" ? "video" : "graphic_post",
          visualRole: "content" as const
        })),
        ...dataFiles.map((file) => ({
          file,
          kind: mode === "video" ? "retention_chart" : "image",
          visualRole: "data" as const
        }))
      ];
      const artifactPayloads: ArtifactRegistrationInput[] = [];
      const retentionImages: RetentionImageInput[] = [];
      const videoFiles: File[] = [];
      const videoMetadata: VideoMetadata[] = [];
      const audioTranscripts: VideoTranscript[] = [];

      for (const { file, kind, visualRole } of artifactInputs) {
        const visualDataUrl = await fileToVisualDataUrl(file);
        artifactPayloads.push({
          kind,
          mimeType: file.type,
          fileName: file.name,
          sizeBytes: file.size,
          extractedJson: visualDataUrl
            ? {
                visualDataUrl,
                visualRole
              }
            : undefined
        });

        if (mode === "video" && visualRole === "content" && isVideoFile(file)) {
          videoFiles.push(file);
        }

        if (mode === "video" && visualRole === "data" && visualDataUrl) {
          retentionImages.push({
            fileName: file.name,
            dataUrl: visualDataUrl
          });
        }
        }

      for (const file of videoFiles) {
        setMessage(`正在读取 ${file.name} 的时长`);
        const metadata = await readVideoMetadata(file).catch(() => ({
          fileName: file.name,
          durationSeconds: 0,
          width: 0,
          height: 0
        }));
        videoMetadata.push(metadata);

        setMessage(`正在上传 ${file.name}`);
        const uploadResult = await uploadVideoToBlob(file, (percentage) => {
          setMessage(`正在上传 ${file.name} ${percentage}%`);
        });
        const blob = uploadResult.blob;

        if (blob?.url) {
          artifactPayloads.push({
            kind: "video",
            mimeType: file.type,
            fileName: file.name,
            sizeBytes: file.size,
            url: blob.url,
            storageKey: blob.pathname,
            extractedJson: {
              downloadUrl: blob.downloadUrl,
              durationSeconds: metadata.durationSeconds,
              width: metadata.width,
              height: metadata.height,
              uploadMode: "vercel_blob"
            }
          });
        } else if (file.size > DIRECT_TRANSCRIPTION_FILE_LIMIT_BYTES) {
          setMessage(uploadResult.message || `${file.name} 没有传到 Blob，这次先按关键画面分析。`);
        }

        setMessage(`正在识别 ${file.name} 的口播`);
        const transcript = await transcribeVideoFile(file, metadata.durationSeconds);
        audioTranscripts.push(transcript);

        if (transcript.text.trim()) {
          artifactPayloads.push({
            kind: "text",
            mimeType: "text/plain",
            fileName: `${file.name} 口播稿.txt`,
            extractedText: transcriptTextForArtifact(transcript),
            extractedJson: {
              sourceFileName: file.name,
              transcriptStatus: transcript.status,
              durationSeconds: metadata.durationSeconds,
              estimatedWordCount: transcript.estimatedWordCount,
              utterances: transcript.utterances ?? []
            }
          });
        }

        setMessage(`正在提取 ${file.name} 的关键画面`);
        artifactPayloads.push(
          ...(await extractVideoFrameArtifacts(file, {
            notes,
            stats,
            retentionImages
          }))
        );
      }

      setMessage("正在分析作品");
      const artifacts = await Promise.all(
        artifactPayloads.map((payload) =>
          postJson<ArtifactResponse>("/api/artifacts/register", payload)
        )
      );
      const created = await postJson<{ session: ApiSession }>("/api/sessions", {
        module: "doctor",
        contentMode: mode,
        artifactIds: artifacts.map((item) => item.artifact.id),
        input: {
          stats,
          notes,
          analysisFocus: notes,
          sourceType: mode === "graphic" ? "图文复盘" : "视频复盘",
          contentFileNames: fileNames(contentFiles),
          dataFileNames: fileNames(dataFiles),
          videoMetadata,
          audioTranscripts,
          scriptLengthGuide: buildScriptLengthGuide({
            videoMetadata,
            transcripts: audioTranscripts
          })
        }
      });
      const run = await postJson<{ session: ApiSession }>(
        `/api/sessions/${created.session.id}/run`
      );
      const nextSession = hasDoctorOutput(run.session.output)
        ? run.session
        : {
            ...run.session,
            output: fallbackOutput
          };
      setSession(nextSession);
      setMessage(
        hasDoctorOutput(run.session.output)
          ? completionMessage(run.session.output)
          : "这次先按当前素材给出基础判断，可以补充时间点或留存图再跑一次。"
      );
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "暂时没有连上后端，已保留当前输入。");
    } finally {
      setLoading(false);
    }
  }

  async function handleFollowup() {
    const answer = followup.trim();

    if (!session?.id || !answer) {
      return;
    }

    setLoading(true);
    setMessage("正在继续分析");
    try {
      await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/respond`, {
        answer,
        kind: "revision"
      });
      const run = await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/run`);
      const nextSession = hasDoctorOutput(run.session.output)
        ? run.session
        : {
            ...run.session,
            output: session.output
          };

      setSession(nextSession);
      setFollowup("");
      setMessage(
        hasDoctorOutput(run.session.output)
          ? completionMessage(run.session.output)
          : "这次没有返回新的诊断内容，先保留上一版结果。"
      );
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "继续分析失败，请再试一次。");
    } finally {
      setLoading(false);
    }
  }

  async function handleRewriteScript() {
    if (!session?.id) {
      return;
    }

    const guide = session.input?.scriptLengthGuide as ScriptLengthGuide | undefined;
    const range = guide
      ? `${guide.minWordCount}-${guide.maxWordCount} 字`
      : "尽量和原作品字数一致";
    const answer = [
      "按本次诊断结论直接重写这条作品。",
      `字数要求：${range}，不要明显长于原作品。`,
      "如果有口播稿，保留原视频主旨和核心表达，不要换成另一个选题。",
      "输出一版可以直接拍摄或发布的完整脚本。"
    ].join("\n");

    setLoading(true);
    setMessage("正在重写脚本");
    try {
      await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/respond`, {
        answer,
        kind: "revision"
      });
      const run = await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/run`);
      const nextSession = hasDoctorOutput(run.session.output)
        ? run.session
        : {
            ...run.session,
            output: session.output
          };

      setSession(nextSession);
      setMessage(
        getScriptBody(run.session.output)
          ? "脚本已重写"
          : "这次没有返回完整脚本，先保留诊断结论。"
      );
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重写失败，请再试一次。");
    } finally {
      setLoading(false);
    }
  }

  async function copyScript() {
    if (!scriptBody) {
      return;
    }

    try {
      await navigator.clipboard.writeText(scriptBody);
      setMessage("脚本已复制");
    } catch {
      setMessage("复制失败，可以直接选中脚本文本。");
    }
  }

  async function writeBack() {
    if (!session?.id) {
      return;
    }

    setLoading(true);
    try {
      await postJson(`/api/sessions/${session.id}/writeback`);
      setMessage("已把这轮复盘规则写回个人画像。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "写回失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="task-dashboard-grid doctor-workbench-grid">
        <section className="surface-card glass doctor-input-card" id="doctor-input">
          <span className="label">输入</span>
          <h3>{config.title}</h3>
          <div className="mode-switch">
            <button
              className={`mode-chip ${mode === "graphic" ? "active" : ""}`}
              onClick={() => switchMode("graphic")}
              type="button"
            >
              图文
            </button>
            <button
              className={`mode-chip ${mode === "video" ? "active" : ""}`}
              onClick={() => switchMode("video")}
              type="button"
            >
              视频
            </button>
          </div>
          <div className="upload-grid">
            <label className="upload-card profile-upload-card">
              <strong>{config.contentLabel}</strong>
              <span>{config.contentHint}</span>
              <input
                accept={config.contentAccept}
                className="file-input"
                multiple
                onChange={(event) => handleFiles(event, "content")}
                type="file"
              />
            </label>
            <label className="upload-card profile-upload-card">
              <strong>{config.dataLabel}</strong>
              <span>{config.dataHint}</span>
              <input
                accept="image/*"
                className="file-input"
                multiple
                onChange={(event) => handleFiles(event, "data")}
                type="file"
              />
            </label>
          </div>
          <div className="profile-file-grid">
            <div className="callout">
              <strong>已选内容</strong>
              <div className="selected-files">
                {fileNames(contentFiles).map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>
            <div className="callout">
              <strong>已选数据</strong>
              <div className="selected-files">
                {fileNames(dataFiles).map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="doctor-stats">补充关键数据</label>
            <input
              id="doctor-stats"
              onChange={(event) => setStats(event.target.value)}
              placeholder={config.statsPlaceholder}
              type="text"
              value={stats}
            />
          </div>
          <div className="input-group">
            <label htmlFor="doctor-notes">{config.notesLabel}</label>
            <textarea
              id="doctor-notes"
              onChange={(event) => setNotes(event.target.value)}
              placeholder={config.notesPlaceholder}
              rows={5}
              value={notes}
            />
            <p className="field-hint">
              {mode === "video"
                ? "没有留存曲线也可以，写清楚你想看的片段、开头、转折、方法段或结尾。"
                : "可以只写你想看的首图、正文、标题、评论引导或转化问题。"}
            </p>
          </div>
          <button
            className="button-primary"
            disabled={!canAnalyze || loading}
            onClick={runDoctor}
            type="button"
          >
            {loading ? "正在复盘" : "开始复盘"}
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </section>

        {hasEvidence ? (
          <section className="surface-card glass doctor-evidence-card">
            <div className="doctor-evidence-head">
              <div>
                <span className="label">复盘证据</span>
                <h3>掉点记录</h3>
              </div>
            </div>

            <div className="doctor-evidence-scroll">
              <div className="timeline doctor-evidence-timeline">
                {timelineItems.map((item, index) => (
                  <div
                    className={`timeline-item ${index === 1 ? "warning" : "success"}`}
                    key={item.label}
                  >
                    <strong>{item.label}</strong>
                    <div>{item.title}</div>
                    <p>{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <aside className="doctor-output-stack" ref={resultRef}>
          <section className="surface-card glass doctor-result-card">
            <div className="doctor-result-scroll">
              <span className="label">本次结论</span>
              <h3>这次先改这几件事</h3>
              {output.mainIssue ? (
                <div className="callout warning">
                  <strong>主要问题</strong>
                  <p>{output.mainIssue}</p>
                </div>
              ) : output.assistantMessage ? (
                <div className="callout warning">
                  <strong>AI 判断</strong>
                  <p>{output.assistantMessage}</p>
                </div>
              ) : null}
              {output.evidence ? (
                <div className="callout">
                  <strong>判断依据</strong>
                  <p>{output.evidence}</p>
                </div>
              ) : null}
              <div className="action-bullets">
                {(output.actions ?? []).map((item) => (
                  <div className="bullet-row" key={item}>
                    <span className="bullet-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="page-actions doctor-result-actions">
              <button
                className="button-primary"
                disabled={!session?.id || loading}
                onClick={handleRewriteScript}
                type="button"
              >
                按结论重写脚本
              </button>
              {session?.writebackCandidates.length ? (
                <button
                  className="button-secondary"
                  disabled={loading}
                  onClick={writeBack}
                  type="button"
                >
                  保存为复盘规则
                </button>
              ) : null}
            </div>
          </section>

          {hasScriptWorkspace ? (
            <section className="surface-card glass doctor-script-card">
              <div className="doctor-script-head">
                <div>
                  <span className="label">口播稿</span>
                  <h3>
                    {scriptTab === "original"
                      ? "改前口播稿"
                      : output.rewrittenScript?.title || "修改后的口播稿"}
                  </h3>
                </div>
                {hasTranscriptEvidence || session?.id || scriptBody ? (
                  <div aria-label="口播稿版本" className="doctor-script-tabs" role="tablist">
                    {hasTranscriptEvidence ? (
                      <button
                        aria-selected={scriptTab === "original"}
                        className={`mode-chip ${scriptTab === "original" ? "active" : ""}`}
                        onClick={() => setScriptTab("original")}
                        role="tab"
                        type="button"
                      >
                        改前口播
                      </button>
                    ) : null}
                    {session?.id || scriptBody ? (
                      <button
                        aria-selected={scriptTab === "rewritten"}
                        className={`mode-chip ${scriptTab === "rewritten" ? "active" : ""}`}
                        onClick={() => setScriptTab("rewritten")}
                        role="tab"
                        type="button"
                      >
                        改后口播
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="doctor-script-scroll">
                {scriptTab === "original" && hasTranscriptEvidence ? (
                  <div className="doctor-transcript-list doctor-script-transcript-list">
                    {transcripts.map((transcript) => (
                      <div className="doctor-transcript-source" key={transcript.fileName}>
                        <strong>{transcript.fileName}</strong>
                        {transcript.utterances?.length ? (
                          transcript.utterances.map((utterance, index) => (
                            <p className="doctor-transcript-line" key={`${utterance.startTimeMs}-${index}`}>
                              <span>{formatTranscriptTimeRange(utterance)}</span>
                              {utterance.text}
                            </p>
                          ))
                        ) : (
                          <p className="doctor-transcript-line">{transcript.text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {scriptTab === "rewritten" ? (
                  scriptBody ? (
                    <>
                      {output.rewrittenScript?.segments?.length ? (
                        <div className="doctor-script-segments">
                          {output.rewrittenScript.segments.map((segment, index) => (
                            <div className="callout" key={`${segment.label || "segment"}-${index}`}>
                              <strong>{segment.label || `第 ${index + 1} 段`}</strong>
                              <p>{segment.script}</p>
                              {segment.note ? <span>{segment.note}</span> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <pre>{scriptBody}</pre>
                    </>
                  ) : (
                    <div className="callout doctor-script-empty">
                      <strong>还没有改后口播稿</strong>
                      <p>点击生成后，这里会放修改后的口播稿，方便和改前版本切换对照。</p>
                      <button
                        className="button-secondary"
                        disabled={!session?.id || loading}
                        onClick={handleRewriteScript}
                        type="button"
                      >
                        按结论重写脚本
                      </button>
                    </div>
                  )
                ) : null}
              </div>
              {scriptBody && scriptTab === "rewritten" ? (
                <div className="page-actions doctor-result-actions">
                  <button className="button-secondary" onClick={copyScript} type="button">
                    复制改后口播
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {session ? (
            <section className="surface-card glass doctor-followup-card">
              <div>
                <strong>继续问 Doctor</strong>
                <p>对这次诊断有疑惑，或想单独拆某一帧、某一句、某个掉点。</p>
              </div>
              <textarea
                onChange={(event) => setFollowup(event.target.value)}
                placeholder="例如：为什么你觉得 15 秒这里会掉？结尾应该怎么改得不生硬？"
                rows={3}
                value={followup}
              />
              <button
                className="button-secondary"
                disabled={!followup.trim() || loading}
                onClick={handleFollowup}
                type="button"
              >
                继续分析
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
