"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type ContentMode = "graphic" | "video";
type AssistantTaskMode = "single_comment" | "comment_direction";

type AssistantAnalysis = {
  commentIntent?: string;
  audienceEmotion?: string;
  hiddenNeed?: string;
  contentOpportunity?: string;
  replyDirection?: string;
  nextContentDirection?: string;
  sectionDirection?: string;
};

type AssistantOutput = {
  assistantMessage?: string;
  assistantMode?: AssistantTaskMode;
  workSummary?: string;
  analysis?: AssistantAnalysis;
  layers?: Array<{ type: string; quote: string; action: string }>;
  risks?: string[];
  commentStrategy?: {
    priority?: string;
    goal?: string;
    replyGoal?: string;
    tone?: string;
    directions?: unknown[];
    avoid?: unknown[];
    nextMove?: string;
  };
  replySuggestions?: unknown[];
  nextTopics?: unknown[];
};

type ApiSession = {
  id: string;
  contentMode?: ContentMode;
  input?: Record<string, unknown>;
  output: AssistantOutput;
  writebackCandidates: unknown[];
};

type HistoryEntry = {
  id: string;
  module: "director" | "doctor" | "assistant";
  moduleLabel: string;
  title: string;
  status: string;
  updatedAt: string;
  summary: string;
};

type ArtifactResponse = {
  artifact: {
    id: string;
  };
};

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const COMMENT_SCREENSHOT_MAX_SIDE = 1280;
const COMMENT_SCREENSHOT_JPEG_QUALITY = 0.78;

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

const CONTENT_MODE_CONFIG: Record<
  ContentMode,
  {
    label: string;
    sourceType: string;
    workPlaceholder: string;
    workUploadLabel: string;
    workUploadHint: string;
  }
> = {
  graphic: {
    label: "图文作品",
    sourceType: "图文作品",
    workPlaceholder: "粘贴作品链接、标题、正文、首图文案，或从最近复盘里选一条作品。",
    workUploadLabel: "上传这篇作品",
    workUploadHint: "支持首图、正文截图或 txt/md 正文文件。"
  },
  video: {
    label: "视频作品",
    sourceType: "视频作品",
    workPlaceholder: "粘贴视频链接、标题、脚本、口播内容，或从最近复盘里选一条作品。",
    workUploadLabel: "上传这条视频的内容截图",
    workUploadHint: "支持封面、关键画面、字幕截图或 txt/md 口播稿。"
  }
};

const TASK_CONFIG: Record<
  AssistantTaskMode,
  {
    label: string;
    title: string;
    materialLabel: string;
    uploadLabel: string;
    uploadHint: string;
    placeholder: string;
    actionLabel: string;
    loadingLabel: string;
    resultLabel: string;
    resultTitle: string;
  }
> = {
  single_comment: {
    label: "只看一条评论",
    title: "拆这一条评论",
    materialLabel: "只贴一条评论",
    uploadLabel: "上传这条评论的截图",
    uploadHint: "适合处理质疑、追问、求方法、强情绪反馈。",
    placeholder: "例如：能不能出一期在职考研怎么切换工作和学习状态？我每天回家都学不进去。",
    actionLabel: "拆这条评论",
    loadingLabel: "正在拆这条评论",
    resultLabel: "单条评论",
    resultTitle: "这条评论在说什么"
  },
  comment_direction: {
    label: "看评论区方向",
    title: "看这一组评论",
    materialLabel: "贴几条代表性评论",
    uploadLabel: "上传评论区截图",
    uploadHint: "适合看高频追问、争议点、下一条内容方向。",
    placeholder: "每行一条，优先放高赞、追问、争议、反复出现的问题。",
    actionLabel: "看评论区方向",
    loadingLabel: "正在看方向",
    resultLabel: "评论区方向",
    resultTitle: "评论区在指向哪里"
  }
};

const fallbackOutput: AssistantOutput = {
  assistantMode: "single_comment",
  workSummary: "作品围绕在职考研状态切换展开。",
  analysis: {
    commentIntent: "这不是普通留言，而是在请求一个能马上照做的方法。",
    audienceEmotion: "焦虑、疲惫，还有一点想重新开始但怕失败。",
    hiddenNeed: "用户想知道下班后怎样进入学习状态，而不是再听一遍自律口号。",
    contentOpportunity: "可以延展成一条关于在职备考状态切换的内容。",
    replyDirection: "先接住真实处境，再承诺会拆一个更具体的方法。",
    nextContentDirection: "讲下班后 15 分钟内重新坐回书桌的动作。"
  },
  layers: [
    {
      type: "高价值评论",
      quote: "能不能出一期在职考研如何切换工作和学习状态？",
      action: "优先回复，并进入下一期选题池。"
    }
  ],
  risks: [],
  commentStrategy: {
    priority: "先回复能延展成选题的问题",
    replyGoal: "把真实问题接成下一期内容入口",
    tone: "先共情，再给一个明确承诺",
    avoid: ["不要只回复“下期安排”", "不要直接反驳负面评论"],
    nextMove: "把高频问题整理成一条新内容"
  },
  replySuggestions: [
    "你这个问题特别真实，我自己二战时最难的也不是学不会，而是每天都很难重新进入状态。后面我整理一套更适合在职备考的切换方法。"
  ],
  nextTopics: ["在职考研如何切换工作和学习状态"]
};

function fileNames(files: File[]) {
  if (!files.length) {
    return ["还没有选择文件"];
  }

  return files.map((file) => file.name);
}

function mergeFileList(current: File[], nextFiles: File[]) {
  const seen = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
  const merged = [...current];

  for (const file of nextFiles) {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(file);
    }
  }

  return merged;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || /\.(txt|md|markdown)$/i.test(file.name);
}

function asText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(
      record.title ??
        record.text ??
        record.scenario ??
        record.why ??
        record.detail ??
        JSON.stringify(record)
    );
  }

  return "";
}

function firstReplyText(value: unknown[] | undefined) {
  const first = value?.[0];
  if (typeof first === "string") {
    return first;
  }

  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    const suggestions = Array.isArray(record.suggestions) ? record.suggestions : [];
    return suggestions.map(asText).filter(Boolean).join(" / ") || asText(first);
  }

  return "";
}

async function imageFileToDataUrl(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片读取失败。"));
      image.src = objectUrl;
    });

    const scale = Math.min(
      1,
      COMMENT_SCREENSHOT_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("图片处理失败。");
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", COMMENT_SCREENSHOT_JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function workFileToArtifactPayload(file: File, mode: ContentMode) {
  const base = {
    kind: mode === "graphic" ? "graphic_post" : "image",
    mimeType: file.type || "application/octet-stream",
    fileName: file.name,
    sizeBytes: file.size
  };

  if (isImageFile(file)) {
    return {
      ...base,
      extractedJson: {
        visualDataUrl: await imageFileToDataUrl(file),
        visualRole: "work_content",
        sourceFileName: file.name
      }
    };
  }

  if (isTextFile(file)) {
    return {
      ...base,
      kind: "text",
      mimeType: file.type || "text/plain",
      extractedText: await file.text(),
      extractedJson: {
        visualRole: "work_content",
        sourceFileName: file.name
      }
    };
  }

  return {
    ...base,
    extractedJson: {
      visualRole: "work_content",
      sourceFileName: file.name
    }
  };
}

function normalizeTaskMode(value: unknown): AssistantTaskMode {
  return value === "comment_direction" ? "comment_direction" : "single_comment";
}

function workTextFromEntry(entry: HistoryEntry) {
  return [entry.title, entry.summary].filter(Boolean).join("\n");
}

function analysisRows(output: AssistantOutput, taskMode: AssistantTaskMode) {
  const analysis = output.analysis ?? {};

  if (taskMode === "comment_direction") {
    return [
      { label: "反复出现的问题", value: analysis.sectionDirection ?? output.commentStrategy?.priority },
      { label: "最强情绪", value: analysis.audienceEmotion },
      { label: "隐藏需求", value: analysis.hiddenNeed },
      { label: "内容机会", value: analysis.contentOpportunity },
      { label: "下一条回应", value: analysis.nextContentDirection ?? output.commentStrategy?.nextMove }
    ].filter((item) => item.value);
  }

  return [
    { label: "真实意图", value: analysis.commentIntent },
    { label: "情绪阻力", value: analysis.audienceEmotion },
    { label: "隐藏需求", value: analysis.hiddenNeed },
    { label: "回复方向", value: analysis.replyDirection ?? output.commentStrategy?.replyGoal },
    { label: "可延展选题", value: analysis.contentOpportunity }
  ].filter((item) => item.value);
}

export function AssistantStudio({ initialSessionId }: { initialSessionId?: string } = {}) {
  const [mode, setMode] = useState<ContentMode>("graphic");
  const [taskMode, setTaskMode] = useState<AssistantTaskMode>("single_comment");
  const [workContext, setWorkContext] = useState("");
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [workFiles, setWorkFiles] = useState<File[]>([]);
  const [comments, setComments] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const contentConfig = CONTENT_MODE_CONFIG[mode];
  const taskConfig = TASK_CONFIG[taskMode];
  const output = session?.output ?? fallbackOutput;
  const hasWork = Boolean(workContext.trim() || workFiles.length > 0);
  const hasMaterial = Boolean(comments.trim() || commentFiles.length > 0);
  const canAnalyze = hasWork && hasMaterial;
  const workOptions = useMemo(
    () =>
      historyEntries
        .filter((entry) => entry.module === "doctor")
        .slice(0, 6),
    [historyEntries]
  );
  const rows = analysisRows(output, output.assistantMode ?? taskMode);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const data = await fetchJson<{ entries: HistoryEntry[] }>("/api/history");
        if (!cancelled) {
          setHistoryEntries(data.entries);
        }
      } catch {
        if (!cancelled) {
          setHistoryEntries([]);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

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

        setMode(loadedSession.contentMode ?? "graphic");
        setTaskMode(normalizeTaskMode(input.assistantMode));
        setWorkContext(typeof input.workContext === "string" ? input.workContext : "");
        setSelectedWorkId(typeof input.selectedWorkId === "string" ? input.selectedWorkId : "");
        setWorkFiles([]);
        setComments(typeof input.comments === "string" ? input.comments : "");
        setCommentFiles([]);
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

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    setCommentFiles((current) => mergeFileList(current, nextFiles));
    setSession(null);
    setMessage("");
    event.target.value = "";
  }

  function handleWorkFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    setWorkFiles((current) => mergeFileList(current, nextFiles));
    setSelectedWorkId("");
    setSession(null);
    setMessage("");
    event.target.value = "";
  }

  function switchMode(nextMode: ContentMode) {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setSession(null);
    setMessage("");
  }

  function switchTask(nextTaskMode: AssistantTaskMode) {
    if (nextTaskMode === taskMode) {
      return;
    }

    setTaskMode(nextTaskMode);
    setSession(null);
    setMessage("");
  }

  function selectWork(entry: HistoryEntry) {
    setSelectedWorkId(entry.id);
    setWorkContext(workTextFromEntry(entry));
    setWorkFiles([]);
    setSession(null);
    setMessage("");
  }

  function handleRecentWorkChange(value: string) {
    if (!value) {
      setSelectedWorkId("");
      return;
    }

    const entry = workOptions.find((item) => item.id === value);
    if (entry) {
      selectWork(entry);
    }
  }

  async function runAssistant() {
    if (!canAnalyze) {
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const workArtifacts = await Promise.all(
        workFiles.map(async (file) =>
          postJson<ArtifactResponse>("/api/artifacts/register", await workFileToArtifactPayload(file, mode))
        )
      );
      const commentArtifacts = await Promise.all(
        commentFiles.map(async (file) => {
          const visualDataUrl = await imageFileToDataUrl(file);

          return postJson<ArtifactResponse>("/api/artifacts/register", {
            kind: "comment_screenshot",
            mimeType: file.type,
            fileName: file.name,
            sizeBytes: file.size,
            extractedJson: {
              visualDataUrl,
              visualRole: "comment_screenshot",
              sourceFileName: file.name
            }
          });
        })
      );
      const artifacts = [...commentArtifacts, ...workArtifacts];
      const created = await postJson<{ session: ApiSession }>("/api/sessions", {
        module: "assistant",
        contentMode: mode,
        artifactIds: artifacts.map((item) => item.artifact.id),
        input: {
          assistantMode: taskMode,
          workContext,
          selectedWorkId,
          comments,
          sourceType: contentConfig.sourceType,
          workFileNames: fileNames(workFiles),
          screenshotFileNames: fileNames(commentFiles)
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
      setMessage("已写回个人画像。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "写回失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="task-dashboard-grid">
        <section className="surface-card glass assistant-input-panel">
          <span className="label">输入</span>
          <h3>{taskConfig.title}</h3>

          <div className="assistant-step-block">
            <div className="section-line-head">
              <strong>作品</strong>
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
            </div>
            <div className="input-group">
              <div className="assistant-field-head">
                <label htmlFor="assistant-work">作品内容、链接或脚本</label>
                {workOptions.length ? (
                  <select
                    aria-label="使用最近复盘作品"
                    className="recent-work-select"
                    onChange={(event) => handleRecentWorkChange(event.target.value)}
                    value={selectedWorkId}
                  >
                    <option value="">使用最近复盘作品</option>
                    {workOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <textarea
                id="assistant-work"
                onChange={(event) => {
                  setWorkContext(event.target.value);
                  setSelectedWorkId("");
                  setSession(null);
                }}
                placeholder={contentConfig.workPlaceholder}
                rows={5}
                value={workContext}
              />
            </div>
            <label className="upload-card profile-upload-card">
              <strong>{contentConfig.workUploadLabel}</strong>
              <span>{contentConfig.workUploadHint}</span>
              <input
                accept="image/*,.txt,.md,.markdown"
                className="file-input"
                multiple
                onChange={handleWorkFiles}
                type="file"
              />
            </label>
            <div className="selected-files">
              {fileNames(workFiles).map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            {workFiles.length ? (
              <button
                className="button-secondary"
                onClick={() => {
                  setWorkFiles([]);
                  setSession(null);
                  setMessage("");
                }}
                type="button"
              >
                清空作品素材
              </button>
            ) : null}
          </div>

          <div className="assistant-step-block">
            <strong>选任务</strong>
            <div className="mode-switch">
              <button
                className={`mode-chip ${taskMode === "single_comment" ? "active" : ""}`}
                onClick={() => switchTask("single_comment")}
                type="button"
              >
                只看一条评论
              </button>
              <button
                className={`mode-chip ${taskMode === "comment_direction" ? "active" : ""}`}
                onClick={() => switchTask("comment_direction")}
                type="button"
              >
                看评论区方向
              </button>
            </div>
          </div>

          <div className="assistant-step-block">
            <label className="upload-card profile-upload-card">
              <strong>{taskConfig.uploadLabel}</strong>
              <span>{taskConfig.uploadHint}</span>
              <input
                accept="image/*"
                className="file-input"
                multiple
                onChange={handleFiles}
                type="file"
              />
            </label>
            <div className="selected-files">
              {fileNames(commentFiles).map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            {commentFiles.length ? (
              <button
                className="button-secondary"
                onClick={() => {
                  setCommentFiles([]);
                  setSession(null);
                  setMessage("");
                }}
                type="button"
              >
                清空截图
              </button>
            ) : null}
            <div className="input-group">
              <label htmlFor="assistant-comments">{taskConfig.materialLabel}</label>
              <textarea
                id="assistant-comments"
                onChange={(event) => {
                  setComments(event.target.value);
                  setSession(null);
                }}
                placeholder={taskConfig.placeholder}
                rows={taskMode === "single_comment" ? 5 : 10}
                value={comments}
              />
            </div>
          </div>

          <button
            className="button-primary"
            disabled={!canAnalyze || loading}
            onClick={runAssistant}
            type="button"
          >
            {loading ? taskConfig.loadingLabel : taskConfig.actionLabel}
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </section>

        <aside className="surface-card glass">
          <span className="label">{(output.assistantMode && TASK_CONFIG[output.assistantMode]?.resultLabel) ?? taskConfig.resultLabel}</span>
          <h3>{(output.assistantMode && TASK_CONFIG[output.assistantMode]?.resultTitle) ?? taskConfig.resultTitle}</h3>
          {output.workSummary ? (
            <div className="callout">
              <strong>作品判断</strong>
              <p>{output.workSummary}</p>
            </div>
          ) : null}
          {rows.length ? (
            <div className="action-bullets">
              {rows.map((item) => (
                <div className="bullet-row" key={`${item.label}-${item.value}`}>
                  <span className="bullet-dot" />
                  <span>
                    <strong>{item.label}</strong>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          ) : output.assistantMessage ? (
            <div className="callout">
              <p>{output.assistantMessage}</p>
            </div>
          ) : null}
          {output.commentStrategy ? (
            <div className="callout">
              <strong>{output.commentStrategy.priority ?? output.commentStrategy.goal ?? "先处理高价值问题"}</strong>
              {output.commentStrategy.replyGoal ? <p>{output.commentStrategy.replyGoal}</p> : null}
              {output.commentStrategy.tone ? <p>{output.commentStrategy.tone}</p> : null}
              {output.commentStrategy.nextMove ? <p>{output.commentStrategy.nextMove}</p> : null}
            </div>
          ) : null}
          <div className="callout">
            <strong>回复草稿</strong>
            <p>{firstReplyText(output.replySuggestions) || "先选作品，再贴评论。"}</p>
          </div>
          {session?.writebackCandidates.length ? (
            <button
              className="button-secondary"
              disabled={loading}
              onClick={writeBack}
              type="button"
            >
              写回个人画像
            </button>
          ) : null}
        </aside>
      </div>

      <section className="surface-card glass result-panel">
        <span className="label">当前识别结果</span>
        <h3>{taskMode === "single_comment" ? "这条评论值得怎样处理" : "这些方向值得先处理"}</h3>
        <div className="action-list">
          {(output.layers ?? []).map((item) => (
            <div className="action-row" key={`${item.type}-${item.quote}`}>
              <div>
                <strong>{item.type}</strong>
                <div>{item.quote}</div>
              </div>
              <span className="muted">{item.action}</span>
            </div>
          ))}
        </div>
        {output.nextTopics?.length ? (
          <div className="action-bullets">
            {output.nextTopics.map((item) => (
              <div className="bullet-row" key={asText(item)}>
                <span className="bullet-dot" />
                <span>{asText(item)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {output.risks?.length ? (
          <div className="callout warning">
            <strong>先避开</strong>
            <div className="action-bullets">
              {output.risks.map((item) => (
                <div className="bullet-row" key={item}>
                  <span className="bullet-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
