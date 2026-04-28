"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { profileAssetInsights } from "@/lib/demo-data";

type AssetMode = "graphic" | "video";
type ProfileForm = {
  role: string;
  story: string;
  audience: string;
  tone: string;
};
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type ProfilePayload = {
  profile: {
    identity?: Record<string, unknown>;
    audience?: Record<string, unknown>;
    style?: Record<string, unknown>;
  };
};

const ASSET_MODE_CONFIG: Record<
  AssetMode,
  {
    label: string;
    contentLabel: string;
    contentHint: string;
    contentAccept: string;
    supportLabel: string;
    supportHint: string;
    supportAccept: string;
  }
> = {
  graphic: {
    label: "图文作品",
    contentLabel: "上传历史图文作品",
    contentHint: "支持首图、正文截图或笔记导出文件。",
    contentAccept: "image/*,.pdf,.txt,.md",
    supportLabel: "上传对应数据截图",
    supportHint: "例如浏览、点赞、收藏、评论数据截图。",
    supportAccept: "image/*"
  },
  video: {
    label: "视频作品",
    contentLabel: "上传历史视频作品",
    contentHint: "支持视频文件，用来识别稳定表达和内容风险。",
    contentAccept: "video/*",
    supportLabel: "上传留存或数据截图",
    supportHint: "例如留存曲线、播放、点赞、评论截图。",
    supportAccept: "image/*"
  }
};

function fileNames(files: File[]) {
  if (!files.length) {
    return ["还没有选择文件"];
  }

  return files.map((file) => file.name);
}

const EMPTY_PROFILE_FORM: ProfileForm = {
  role: "",
  story: "",
  audience: "",
  tone: ""
};

const DEFAULT_PROFILE_FORM: ProfileForm = {
  role: "我是二战上岸的人，不是天赋型选手，但我很擅长把复杂备考拆成普通人能执行的步骤。",
  story: "从崩溃式备考到重新建立节奏，这段经历最能代表我。",
  audience: "基础一般、容易焦虑、节奏总是断掉的考研人。",
  tone: "有方法、稳、愿意陪着走一段，但不会高高在上。"
};

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

async function patchJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "PATCH",
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

function profileFormFromPayload(payload: ProfilePayload): ProfileForm {
  const identity = payload.profile.identity ?? {};
  const audience = payload.profile.audience ?? {};
  const style = payload.profile.style ?? {};

  return {
    role: typeof identity.role === "string" ? identity.role : DEFAULT_PROFILE_FORM.role,
    story: typeof identity.proof === "string" ? identity.proof : DEFAULT_PROFILE_FORM.story,
    audience: typeof audience.target === "string" ? audience.target : DEFAULT_PROFILE_FORM.audience,
    tone: typeof style.tone === "string" ? style.tone : DEFAULT_PROFILE_FORM.tone
  };
}

export function ProfileStudio() {
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [assetMode, setAssetMode] = useState<AssetMode>("video");
  const [contentFiles, setContentFiles] = useState<File[]>([]);
  const [supportFiles, setSupportFiles] = useState<File[]>([]);
  const [analysisApplied, setAnalysisApplied] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [message, setMessage] = useState("");

  const config = ASSET_MODE_CONFIG[assetMode];
  const insights = profileAssetInsights[assetMode];
  const canAnalyze = contentFiles.length > 0;
  const profileNotes = useMemo(
    () => [
      { title: "长期定位", body: profileForm.role || "先写下你希望被记住的身份。" },
      { title: "代表经历", body: profileForm.story || "补一段最能证明你可信的经历。" },
      { title: "目标受众", body: profileForm.audience || "明确你最想帮助哪类人。" },
      { title: "表达感受", body: profileForm.tone || "写清楚别人应该从你这里感受到什么。" }
    ],
    [profileForm]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const payload = await fetchJson<ProfilePayload>("/api/profile");

        if (!cancelled) {
          setProfileForm(profileFormFromPayload(payload));
          setProfileLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          setProfileForm(DEFAULT_PROFILE_FORM);
          setProfileLoaded(true);
          setProfileMessage(error instanceof Error ? error.message : "画像暂时没有读取成功。");
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSummary = useMemo(
    () => [
      `${config.label} ${contentFiles.length} 份`,
      `辅助截图 ${supportFiles.length} 份`
    ],
    [config.label, contentFiles.length, supportFiles.length]
  );

  function handleFiles(
    event: ChangeEvent<HTMLInputElement>,
    type: "content" | "support"
  ) {
    const files = Array.from(event.target.files ?? []);

    if (type === "content") {
      setContentFiles(files);
    } else {
      setSupportFiles(files);
    }

    setAnalysisApplied(false);
  }

  function switchMode(nextMode: AssetMode) {
    if (nextMode === assetMode) {
      return;
    }

    setAssetMode(nextMode);
    setContentFiles([]);
    setSupportFiles([]);
    setAnalysisApplied(false);
  }

  function updateProfileField(field: keyof ProfileForm, value: string) {
    setProfileMessage("");
    setProfileForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function saveProfileBasics() {
    setSavingProfile(true);
    setProfileMessage("");

    try {
      const payload = await patchJson<ProfilePayload>("/api/profile", {
        identity: {
          role: profileForm.role,
          proof: profileForm.story
        },
        audience: {
          target: profileForm.audience
        },
        style: {
          tone: profileForm.tone
        }
      });

      setProfileForm(profileFormFromPayload(payload));
      setProfileMessage("已保存画像。");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "保存失败，请稍后再试。");
    } finally {
      setSavingProfile(false);
    }
  }

  async function analyzeAndWriteBack() {
    if (!canAnalyze) {
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      await Promise.all(
        [...contentFiles, ...supportFiles].map((file) =>
          postJson("/api/artifacts/register", {
            kind: assetMode === "video" ? "history_work" : "graphic_post",
            mimeType: file.type,
            fileName: file.name,
            sizeBytes: file.size
          })
        )
      );

      const created = await postJson<{ session: { id: string } }>("/api/sessions", {
        module: "profile",
        contentMode: assetMode,
        input: {
          style: assetMode === "video" ? "真实经历 + 可执行动作" : "低门槛步骤 + 收藏友好结构",
          fileNames: fileNames(contentFiles),
          supportFileNames: fileNames(supportFiles)
        }
      });
      const run = await postJson<{ session: { id: string } }>(
        `/api/sessions/${created.session.id}/run`
      );
      await postJson(`/api/sessions/${run.session.id}/writeback`);
      setAnalysisApplied(true);
      setMessage("已把历史作品里的稳定风格写回共享画像。");
    } catch (error) {
      setAnalysisApplied(true);
      setMessage(error instanceof Error ? error.message : "暂时没有连上后端，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack-layout">
      <div className="profile-edit-grid">
        <section className="surface-card glass">
          <span className="label">基础信息</span>
          <h3>把你的长期定位写清楚</h3>
          {!profileLoaded ? <p className="muted">正在读取画像</p> : null}
          <div className="input-group">
            <label htmlFor="profile-role">最想让别人先记住你什么</label>
            <textarea
              disabled={!profileLoaded}
              id="profile-role"
              onChange={(event) => updateProfileField("role", event.target.value)}
              rows={5}
              value={profileForm.role}
            />
          </div>
          <div className="input-group">
            <label htmlFor="profile-story">最值得讲的经历</label>
            <textarea
              disabled={!profileLoaded}
              id="profile-story"
              onChange={(event) => updateProfileField("story", event.target.value)}
              rows={5}
              value={profileForm.story}
            />
          </div>
          <div className="input-group">
            <label htmlFor="profile-audience">你最想帮助哪类人</label>
            <textarea
              disabled={!profileLoaded}
              id="profile-audience"
              onChange={(event) => updateProfileField("audience", event.target.value)}
              rows={5}
              value={profileForm.audience}
            />
          </div>
          <div className="input-group">
            <label htmlFor="profile-tone">别人应该从你这里感受到什么</label>
            <textarea
              disabled={!profileLoaded}
              id="profile-tone"
              onChange={(event) => updateProfileField("tone", event.target.value)}
              rows={5}
              value={profileForm.tone}
            />
          </div>
          <div className="page-actions">
            <button
              className="button-primary"
              disabled={savingProfile || !profileLoaded}
              onClick={saveProfileBasics}
              type="button"
            >
              {savingProfile ? "正在保存" : "保存画像"}
            </button>
            {profileMessage ? <span className="muted">{profileMessage}</span> : null}
          </div>
        </section>

        <section className="surface-card glass">
          <span className="label">历史作品分析</span>
          <h3>把过去发过的内容继续写回画像</h3>

          <div className="mode-switch">
            <button
              className={`mode-chip ${assetMode === "graphic" ? "active" : ""}`}
              onClick={() => switchMode("graphic")}
              type="button"
            >
              图文作品
            </button>
            <button
              className={`mode-chip ${assetMode === "video" ? "active" : ""}`}
              onClick={() => switchMode("video")}
              type="button"
            >
              视频作品
            </button>
          </div>

          <div className="compact-stats">
            {selectedSummary.map((item) => (
              <div className="compact-stat" key={item}>
                <span>当前导入</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>

          <div className="upload-grid">
            <label className="upload-card profile-upload-card">
              <strong>{config.contentLabel}</strong>
              <span>{config.contentHint}</span>
              <input
                accept={config.contentAccept}
                className="file-input"
                onChange={(event) => handleFiles(event, "content")}
                type="file"
              />
            </label>

            <label className="upload-card profile-upload-card">
              <strong>{config.supportLabel}</strong>
              <span>{config.supportHint}</span>
              <input
                accept={config.supportAccept}
                className="file-input"
                multiple
                onChange={(event) => handleFiles(event, "support")}
                type="file"
              />
            </label>
          </div>

          <div className="profile-file-grid">
            <div className="callout">
              <strong>已选作品</strong>
              <div className="selected-files">
                {fileNames(contentFiles).map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>

            <div className="callout">
              <strong>已选辅助材料</strong>
              <div className="selected-files">
                {fileNames(supportFiles).map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="page-actions">
            <button
              className="button-primary"
              disabled={!canAnalyze || loading}
              onClick={analyzeAndWriteBack}
              type="button"
            >
              {loading ? "正在分析" : "分析并保存到画像"}
            </button>
            <span className="muted">
              {canAnalyze
                ? "只保存稳定风格、受众需求和可复用风险点。"
                : "先上传至少一条历史作品。"}
            </span>
          </div>
          {message ? <p className="muted">{message}</p> : null}
        </section>
      </div>

      <section className="surface-card glass result-panel">
        <span className="label">沉淀结果</span>
        <h3>这些信息会影响下一次创作和复盘</h3>

        {analysisApplied ? (
          <div className="analysis-grid">
            {insights.map((item) => (
              <div className="preview-card" key={item.title}>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="action-list">
            {profileNotes.map((note) => (
              <div className="action-row" key={note.title}>
                <div>
                  <strong>{note.title}</strong>
                  <div>{note.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
