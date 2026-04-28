"use client";

import { upload } from "@vercel/blob/client";
import { ChangeEvent, useEffect, useRef, useState } from "react";

type ContentMode = "graphic" | "video";

type DoctorOutput = {
  mainIssue?: string;
  evidence?: string;
  timeline?: Array<{ label: string; title: string; description: string }>;
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

type VideoTranscript = {
  fileName: string;
  text: string;
  durationSeconds: number;
  estimatedWordCount: number;
  status: string;
  url?: string;
  message?: string;
};

type BlobUploadResult = {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
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

async function postJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url);
  const payload = (await response.json()) as ApiResponse<T>;

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
  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}

const TRANSCRIPTION_FILE_LIMIT_BYTES = 24 * 1024 * 1024;

const fallbackOutput: DoctorOutput = {
  mainIssue: "第 15 秒开始交代背景，信息密度突然下降，观众在这里流失最明显。",
  evidence: "半自动模式会结合留存截图说明、关键时间点和补充数据分析。",
  timeline: [
    {
      label: "0s - 5s",
      title: "身份建立很快",
      description: "一开始就让人知道这是二战过来人的真实经验，信任建立得不错。"
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
  return file.type.startsWith("video/");
}

function safeUploadPath(fileName: string) {
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");

  return `doctor/videos/${Date.now()}-${safeName || "video.mp4"}`;
}

function countTextUnits(text: string) {
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = text
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+/g)?.length ?? 0;

  return cjkCount + latinCount;
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

async function fileToVisualDataUrl(file: File) {
  if (!isImageFile(file)) {
    return undefined;
  }

  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
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

  return canvas.toDataURL("image/jpeg", 0.82);
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

function normalizeFrameTimes(times: number[], duration: number, limit = 8) {
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

async function uploadVideoToBlob(file: File): Promise<BlobUploadResult | null> {
  try {
    return await upload(safeUploadPath(file.name), file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      handleUploadUrl: "/api/uploads/blob",
      multipart: true,
      clientPayload: JSON.stringify({
        kind: "doctor-video",
        fileName: file.name
      })
    });
  } catch (error) {
    console.warn(
      `[Doctor] Blob upload failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
    return null;
  }
}

async function transcribeVideoFile(
  file: File,
  durationSeconds: number,
  blob: BlobUploadResult | null
): Promise<VideoTranscript> {
  if (blob?.url) {
    try {
      return await postJson<VideoTranscript>("/api/doctor/transcribe", {
        url: blob.url,
        fileName: file.name,
        contentType: file.type,
        durationSeconds
      });
    } catch (error) {
      return {
        fileName: file.name,
        text: "",
        durationSeconds,
        estimatedWordCount: 0,
        status: "request_error",
        url: blob.url,
        message: error instanceof Error ? error.message : "这次没有拿到口播转写。"
      };
    }
  }

  if (file.size > TRANSCRIPTION_FILE_LIMIT_BYTES) {
    return {
      fileName: file.name,
      text: "",
      durationSeconds,
      estimatedWordCount: 0,
      status: "too_large",
      message: "视频较大，这次先按关键画面和你的说明分析。"
    };
  }

  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("durationSeconds", String(durationSeconds || 0));

    return await postFormData<VideoTranscript>("/api/doctor/transcribe", formData);
  } catch (error) {
    return {
      fileName: file.name,
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
    const maxSide = 1600;
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
      const visualDataUrl = canvas.toDataURL("image/jpeg", 0.82);
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
  const config = MODE_CONFIG[mode];
  const output = hasDoctorOutput(session?.output) ? session!.output : fallbackOutput;
  const scriptBody = getScriptBody(output);
  const transcripts = getSessionTranscripts(session);
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
        const blob = await uploadVideoToBlob(file);

        if (blob?.url) {
          artifactPayloads.push({
            kind: "video",
            mimeType: file.type,
            fileName: file.name,
            sizeBytes: file.size,
            url: blob.url,
            storageKey: blob.pathname,
            extractedJson: {
              durationSeconds: metadata.durationSeconds,
              width: metadata.width,
              height: metadata.height,
              uploadMode: "vercel_blob"
            }
          });
        }

        setMessage(`正在识别 ${file.name} 的口播`);
        const transcript = await transcribeVideoFile(file, metadata.durationSeconds, blob);
        audioTranscripts.push(transcript);

        if (transcript.text.trim()) {
          artifactPayloads.push({
            kind: "text",
            mimeType: "text/plain",
            fileName: `${file.name} 口播稿.txt`,
            extractedText: transcript.text,
            extractedJson: {
              sourceFileName: file.name,
              transcriptStatus: transcript.status,
              durationSeconds: metadata.durationSeconds,
              estimatedWordCount: transcript.estimatedWordCount
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

        <aside className="doctor-side-stack" ref={resultRef}>
          <section className="surface-card glass doctor-result-card">
            <div className="doctor-result-scroll">
              <span className="label">本次结论</span>
              <h3>这次先改这几件事</h3>
              <div className="callout warning">
                <strong>主要问题</strong>
                <p>{output.mainIssue}</p>
              </div>
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

          {scriptBody ? (
            <section className="surface-card glass doctor-script-card">
              <div className="doctor-script-head">
                <div>
                  <span className="label">重写稿</span>
                  <h3>{output.rewrittenScript?.title || "这一版脚本"}</h3>
                </div>
                {output.rewrittenScript?.targetWordCountRange ? (
                  <span className="status-badge">
                    {output.rewrittenScript.targetWordCountRange}
                  </span>
                ) : null}
              </div>
              <div className="doctor-script-scroll">
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
              </div>
              <div className="page-actions doctor-result-actions">
                <button className="button-secondary" onClick={copyScript} type="button">
                  复制脚本
                </button>
              </div>
            </section>
          ) : null}

          {transcripts.length ? (
            <section className="surface-card glass doctor-transcript-card">
              <span className="label">口播稿</span>
              <h3>识别到的原视频内容</h3>
              <div className="doctor-transcript-scroll">
                {transcripts.map((transcript) => (
                  <div key={transcript.fileName}>
                    <strong>{transcript.fileName}</strong>
                    <p>{transcript.text}</p>
                  </div>
                ))}
              </div>
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

      <section className="surface-card glass result-panel">
        <span className="label">{config.resultLabel}</span>
        <h3>掉点记录</h3>
        <div className="timeline">
          {(output.timeline ?? []).map((item, index) => (
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
      </section>
    </>
  );
}
