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
    contentLabel: "上传图文内容",
    contentHint: "首图、正文截图、标题页都可以放进来。",
    contentAccept: "image/*,.txt,.md,.pdf",
    dataLabel: "上传图文数据截图",
    dataHint: "浏览、点赞、收藏、评论数据都可以。",
    statsPlaceholder: "例如：浏览 1.8w，点赞 900，收藏 680，评论 96，收藏率高但评论少",
    notesLabel: "图文结构和数据说明",
    notesPlaceholder: "例如：首图讲失败经历，第二屏才给方法；收藏不错，但评论主要在问模板。",
    resultLabel: "结构记录"
  },
  video: {
    label: "视频",
    title: "把这条视频的材料给我",
    contentLabel: "上传视频或关键帧",
    contentHint: "用于对齐开头、转折和方法段。",
    contentAccept: "video/*,image/*",
    dataLabel: "上传留存曲线截图",
    dataHint: "用于定位掉点和回升的位置。",
    statsPlaceholder: "例如：播放 2.1w，点赞 1.2k，收藏 420，评论 138，完播率 24%",
    notesLabel: "留存截图和关键时间点说明",
    notesPlaceholder: "例如：15 秒左右留存从 72% 掉到 41%，当时正在讲失败后的背景。",
    resultLabel: "时间轴"
  }
};

function fileNames(files: File[]) {
  if (!files.length) {
    return ["还没有选择文件"];
  }

  return files.map((file) => file.name);
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
  const output = session?.output ?? fallbackOutput;
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
      const artifacts = await Promise.all(
        [
          ...contentFiles.map((file) => ({
            file,
            kind: mode === "video" ? "video" : "graphic_post"
          })),
          ...dataFiles.map((file) => ({
            file,
            kind: mode === "video" ? "retention_chart" : "image"
          }))
        ].map(({ file, kind }) =>
          postJson<ArtifactResponse>("/api/artifacts/register", {
            kind,
            mimeType: file.type,
            fileName: file.name,
            sizeBytes: file.size
          })
        )
      );
      const created = await postJson<{ session: ApiSession }>("/api/sessions", {
        module: "doctor",
        contentMode: mode,
        artifactIds: artifacts.map((item) => item.artifact.id),
        input: {
          stats,
          notes,
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
