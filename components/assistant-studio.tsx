"use client";

import { ChangeEvent, useEffect, useState } from "react";

type ContentMode = "graphic" | "video";

type AssistantOutput = {
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

type ArtifactResponse = {
  artifact: {
    id: string;
  };
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

const fallbackOutput: AssistantOutput = {
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
    "你这个问题特别真实，我自己二战的时候最难的也不是学不会，而是每天都很难重新进入状态。后面我整理一套更适合在职备考的切换方法，下期专门讲这个。"
  ],
  nextTopics: ["在职考研如何切换工作和学习状态"]
};

const MODE_CONFIG: Record<
  ContentMode,
  {
    label: string;
    title: string;
    sourceLabel: string;
    uploadLabel: string;
    uploadHint: string;
    placeholder: string;
  }
> = {
  graphic: {
    label: "图文评论",
    title: "把这篇图文的评论放进来",
    sourceLabel: "图文评论文本",
    uploadLabel: "上传图文评论截图",
    uploadHint: "适合放首评区、私信反馈、收藏需求截图。",
    placeholder: "例如：这套时间表能不能做成模板？我基础差也能用吗？"
  },
  video: {
    label: "视频评论",
    title: "把这条视频的评论放进来",
    sourceLabel: "视频评论文本",
    uploadLabel: "上传视频评论截图",
    uploadHint: "适合放高赞评论、争议评论、追问截图。",
    placeholder: "例如：能不能出一期在职考研怎么切换工作和学习状态？我每天回家都学不进去。"
  }
};

function fileNames(files: File[]) {
  if (!files.length) {
    return ["还没有选择文件"];
  }

  return files.map((file) => file.name);
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

export function AssistantStudio({ initialSessionId }: { initialSessionId?: string } = {}) {
  const [mode, setMode] = useState<ContentMode>("graphic");
  const [comments, setComments] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const config = MODE_CONFIG[mode];
  const output = session?.output ?? fallbackOutput;
  const canAnalyze = comments.trim() || commentFiles.length > 0;

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
    setCommentFiles(Array.from(event.target.files ?? []));
    setSession(null);
    setMessage("");
  }

  function switchMode(nextMode: ContentMode) {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setSession(null);
    setMessage("");
  }

  async function runAssistant() {
    if (!canAnalyze) {
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const artifacts = await Promise.all(
        commentFiles.map((file) =>
          postJson<ArtifactResponse>("/api/artifacts/register", {
            kind: "comment_screenshot",
            mimeType: file.type,
            fileName: file.name,
            sizeBytes: file.size
          })
        )
      );
      const created = await postJson<{ session: ApiSession }>("/api/sessions", {
        module: "assistant",
        contentMode: mode,
        artifactIds: artifacts.map((item) => item.artifact.id),
        input: {
          comments,
          sourceType: mode === "graphic" ? "图文评论" : "视频评论",
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
      setMessage("已把这轮评论洞察写回个人画像。");
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
              图文评论
            </button>
            <button
              className={`mode-chip ${mode === "video" ? "active" : ""}`}
              onClick={() => switchMode("video")}
              type="button"
            >
              视频评论
            </button>
          </div>
          <label className="upload-card profile-upload-card">
            <strong>{config.uploadLabel}</strong>
            <span>{config.uploadHint}</span>
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
          <div className="input-group">
            <label htmlFor="assistant-comments">{config.sourceLabel}</label>
            <textarea
              id="assistant-comments"
              onChange={(event) => setComments(event.target.value)}
              placeholder={config.placeholder}
              rows={10}
              value={comments}
            />
          </div>
          <button
            className="button-primary"
            disabled={!canAnalyze || loading}
            onClick={runAssistant}
            type="button"
          >
            {loading ? "正在分析评论" : "分析评论"}
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </section>

        <aside className="surface-card glass">
          <span className="label">处理顺序</span>
          <h3>优先这样做</h3>
          {output.commentStrategy ? (
            <div className="callout">
              <strong>{output.commentStrategy.priority ?? output.commentStrategy.goal ?? "先带出下一期选题"}</strong>
              {output.commentStrategy.replyGoal ? <p>{output.commentStrategy.replyGoal}</p> : null}
              {output.commentStrategy.tone ? <p>{output.commentStrategy.tone}</p> : null}
              {output.commentStrategy.nextMove ? <p>{output.commentStrategy.nextMove}</p> : null}
              {output.commentStrategy.directions?.length ? (
                <div className="action-bullets">
                  {output.commentStrategy.directions.map((item) => (
                    <div className="bullet-row" key={asText(item)}>
                      <span className="bullet-dot" />
                      <span>{asText(item)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="action-bullets">
            {(output.nextTopics ?? []).map((item) => (
              <div className="bullet-row" key={asText(item)}>
                <span className="bullet-dot" />
                <span>{asText(item)}</span>
              </div>
            ))}
          </div>
          <div className="callout">
            <strong>回复草稿</strong>
            <p>{firstReplyText(output.replySuggestions)}</p>
          </div>
          {output.commentStrategy?.avoid?.length ? (
            <div className="callout warning">
              <strong>先别这样回</strong>
              <div className="action-bullets">
                {output.commentStrategy.avoid.map((item) => (
                  <div className="bullet-row" key={asText(item)}>
                    <span className="bullet-dot" />
                    <span>{asText(item)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
        <h3>这些评论值得先处理</h3>
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
      </section>
    </>
  );
}
