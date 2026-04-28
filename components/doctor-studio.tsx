"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";

type ContentMode = "graphic" | "video";

type DoctorOutput = {
  mainIssue?: string;
  evidence?: string;
  timeline?: Array<{ label: string; title: string; description: string }>;
  actions?: string[];
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

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/");
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
  const [mode, setMode] = useState<ContentMode>("video");
  const [contentFiles, setContentFiles] = useState<File[]>([]);
  const [dataFiles, setDataFiles] = useState<File[]>([]);
  const [stats, setStats] = useState("");
  const [notes, setNotes] = useState("");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const config = MODE_CONFIG[mode];
  const output = hasDoctorOutput(session?.output) ? session!.output : fallbackOutput;
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
          dataFileNames: fileNames(dataFiles)
        }
      });
      const run = await postJson<{ session: ApiSession }>(
        `/api/sessions/${created.session.id}/run`
      );
      setSession(run.session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "暂时没有连上后端，已保留当前输入。");
    } finally {
      setLoading(false);
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
      <div className="task-dashboard-grid">
        <section className="surface-card glass">
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

        <aside className="surface-card glass">
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
          <div className="page-actions">
            <Link className="button-primary" href="/director">
              按结论重写脚本
            </Link>
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
