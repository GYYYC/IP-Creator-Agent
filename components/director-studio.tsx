"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Mode = "graphic" | "video";
type Goal = "connect" | "teach" | "save" | "follow";
type Tone = "warm" | "sharp" | "clear";
type DirectorSlotKey = "rootProblem" | "changeTarget" | "corePromise";
type DirectorSlotStatus = "empty" | "partial" | "ready";

type ThreadMessage = {
  role: "assistant" | "user";
  text: string;
};

type DirectorSlot = {
  status: DirectorSlotStatus;
  value: string;
  confidence: number;
  missing: string[];
  evidence: string[];
};

type DirectorSlots = Record<DirectorSlotKey, DirectorSlot>;

type DirectorDraft = {
  intro?: string;
  cards?: Array<{ title: string; content: string }>;
  hooks?: string[];
  directorSlots?: DirectorSlots;
  nextSlot?: DirectorSlotKey | null;
  suggestions?: string[];
};

type DirectorOutput = {
  assistantMessage?: string;
  type?: string;
  spec?: Record<string, string>;
  titleOptions?: string[];
  coverText?: string;
  body?: string;
  finalScript?: string;
  timeline?: Array<{ time: string; role: string; script: string; visual?: string }>;
  subtitles?: string[];
  tags?: string[];
  publishChecklist?: string[];
};

type ApiSession = {
  id: string;
  status: "draft" | "collecting" | "ready" | "completed";
  contentMode?: Mode;
  input?: Record<string, unknown>;
  followupBudget: number;
  askedQuestions: string[];
  answers: string[];
  draft: DirectorDraft;
  output: DirectorOutput;
  writebackCandidates: unknown[];
};

type ArtifactResponse = {
  artifact: {
    id: string;
  };
};

type ApiResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

const MODE_CONFIG: Record<
  Mode,
  {
    label: string;
    materialLabel: string;
    placeholder: string;
    primaryLabels: string[];
  }
> = {
  graphic: {
    label: "图文",
    materialLabel: "这篇笔记现在有的想法、经历或素材",
    placeholder:
      "例如：我想写一篇关于真实经历的笔记，想讲清楚一个常见误区，以及普通人第一步该怎么做。",
    primaryLabels: ["标题方向", "正文结构", "结尾引导"]
  },
  video: {
    label: "视频",
    materialLabel: "这条视频现在有的想法、经历或素材",
    placeholder:
      "例如：我想做一期真实经验视频，想讲一个容易踩坑的场景，再给出 3 个能立刻执行的小动作。",
    primaryLabels: ["开头", "中段", "结尾"]
  }
};

const SLOT_LABELS: Record<DirectorSlotKey, string> = {
  rootProblem: "谁会停下",
  changeTarget: "想让他做什么",
  corePromise: "记住哪句话"
};

const SLOT_STATUS_LABELS: Record<DirectorSlotStatus, string> = {
  empty: "待定",
  partial: "进行中",
  ready: "已定"
};

const SLOT_DONE_LABELS: Record<DirectorSlotKey, string> = {
  rootProblem: "已定人群",
  changeTarget: "动作清楚了",
  corePromise: "这句能收住"
};

const EMPTY_SLOTS: DirectorSlots = {
  rootProblem: {
    status: "empty",
    value: "",
    confidence: 0,
    missing: [],
    evidence: []
  },
  changeTarget: {
    status: "empty",
    value: "",
    confidence: 0,
    missing: [],
    evidence: []
  },
  corePromise: {
    status: "empty",
    value: "",
    confidence: 0,
    missing: [],
    evidence: []
  }
};

const GOAL_LABELS: Record<Goal, string> = {
  connect: "先建立共鸣",
  teach: "先给方法",
  save: "提高收藏意愿",
  follow: "引导关注"
};

const TONE_LABELS: Record<Tone, string> = {
  warm: "温和陪伴",
  sharp: "直接一点",
  clear: "先讲清楚方法"
};

type OutputSpec = {
  duration: string;
  wordCount: string;
  structure: string;
  platform: string;
  publishGoal: string;
};

const WORD_COUNT_PRESETS = ["300 字", "500 字", "800 字", "1200 字"];

function fileNames(files: File[]) {
  if (!files.length) {
    return ["还没有选择文件"];
  }

  return files.map((file) => file.name);
}

function uploadedMaterialText(files: File[], mode: Mode) {
  if (!files.length) {
    return "";
  }

  return `${mode === "video" ? "视频素材" : "图文素材"}：${files.map((file) => file.name).join("、")}`;
}

function modePreset(mode: Mode, goal: Goal, outputSpec: OutputSpec) {
  if (mode === "graphic") {
    return [
      { label: "当前模式", value: "图文笔记" },
      { label: "目标字数", value: outputSpec.wordCount },
      { label: "内容结构", value: outputSpec.structure },
      { label: "主要目标", value: GOAL_LABELS[goal] }
    ];
  }

  return [
    { label: "当前模式", value: "视频脚本" },
    { label: "目标时长", value: outputSpec.duration },
    { label: "内容结构", value: outputSpec.structure },
    { label: "主要目标", value: GOAL_LABELS[goal] }
  ];
}

function buildDraft(mode: Mode, goal: Goal, tone: Tone, idea: string, answers: string[]) {
  const trimmedIdea =
    idea.trim() || (mode === "graphic" ? "这篇笔记先围绕一个真实经历展开。" : "这条视频先围绕一个真实经历展开。");
  const anchor =
    answers[0] || (mode === "graphic" ? "先把最值得收藏的一句话提出来。" : "先把最想让人记住的一句话提出来。");
  const middle =
    answers[1] || (mode === "graphic" ? "正文里先交代你经历了什么，再给可执行方法。" : "中段先快速交代发生了什么，再切进方法。");
  const proof =
    answers[2] || (mode === "graphic" ? "结尾要把情绪和行动一起收住。" : "最后用一个细节把真实感立住。");

  if (mode === "graphic") {
    return {
      intro: `这篇笔记会更偏 ${GOAL_LABELS[goal]}，语气走 ${TONE_LABELS[tone]}。`,
      cards: [
        {
          title: "标题方向",
          content: `围绕“${anchor}”来起标题，避免从泛泛焦虑切入。`
        },
        {
          title: "正文结构",
          content: `${trimmedIdea} ${middle}`
        },
        {
          title: "结尾引导",
          content: `结尾不要空收，直接问读者：你现在最卡的那一步是什么？ ${proof}`
        }
      ],
      hooks: [
        "如果你不是天赋型选手，这篇可能更适合你。",
        "真正有用的不是硬扛，而是先找到一个能开始的小动作。"
      ]
    };
  }

  return {
    intro: `这条视频更偏 ${GOAL_LABELS[goal]}，语气走 ${TONE_LABELS[tone]}。`,
    cards: [
      {
        title: "开头",
        content: `先把“${anchor}”抛出来，再决定要不要补一句自己的经历。`
      },
      {
        title: "中段",
        content: `${trimmedIdea} ${middle}`
      },
      {
        title: "结尾",
        content: `结尾用 3 个短动作收住，再把观众的问题往评论区引。 ${proof}`
      }
    ],
    hooks: [
      "如果你也卡在这一步，先别急着硬扛。",
      "今天不讲大道理，只讲一个能立刻开始的小动作。"
    ]
  };
}

async function postJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
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

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSlotStatus(value: unknown): DirectorSlotStatus {
  return value === "partial" || value === "ready" ? value : "empty";
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function normalizeSlot(source: unknown): DirectorSlot {
  const record = asRecord(source);
  const rawValue = asString(record.value);
  const slotValue = isDirectorNonAnswer(rawValue) ? "" : rawValue;
  const status = slotValue ? normalizeSlotStatus(record.status) : "empty";

  return {
    status,
    value: slotValue,
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
    missing: normalizeStringList(record.missing),
    evidence: normalizeStringList(record.evidence)
  };
}

function isDirectorNonAnswer(value: string) {
  const normalized = value.replace(/\s/g, "");

  if (!normalized) {
    return false;
  }

  return (
    /^(不知道|不清楚|没想好|随便|你来定|没有|无)$/i.test(normalized) ||
    /(我也不知道|不知道.*(帮我|你帮|总结|想|定)|不清楚.*(帮我|你帮|总结|想|定)|没想好.*(帮我|你帮|总结|想|定)|帮我总结|帮我想|帮我定|你帮我总结|你帮我想|你帮我定|你来总结|你来想|你来定)/.test(normalized)
  );
}

function normalizeSlots(value: unknown): DirectorSlots {
  const record = asRecord(value);

  return {
    rootProblem: normalizeSlot(record.rootProblem ?? EMPTY_SLOTS.rootProblem),
    changeTarget: normalizeSlot(record.changeTarget ?? EMPTY_SLOTS.changeTarget),
    corePromise: normalizeSlot(record.corePromise ?? EMPTY_SLOTS.corePromise)
  };
}

export function DirectorStudio({ initialSessionId }: { initialSessionId?: string } = {}) {
  const [mode, setMode] = useState<Mode>("video");
  const [goal, setGoal] = useState<Goal>("connect");
  const [tone, setTone] = useState<Tone>("warm");
  const [outputSpec, setOutputSpec] = useState<OutputSpec>({
    duration: "60 秒",
    wordCount: "800 字",
    structure: "经历 + 方法 + 行动",
    platform: "小红书",
    publishGoal: "收藏和评论"
  });
  const [idea, setIdea] = useState("");
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [writebackMessage, setWritebackMessage] = useState("");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [sideMessages, setSideMessages] = useState<ThreadMessage[]>([]);
  const [editingSlot, setEditingSlot] = useState<DirectorSlotKey | null>(null);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!initialSessionId) {
      return;
    }

    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      setApiError("");
      try {
        const data = await fetchJson<{ session: ApiSession }>(`/api/sessions/${initialSessionId}`);

        if (cancelled) {
          return;
        }

        const loadedSession = data.session;
        const input = asRecord(loadedSession.input);
        const loadedSpec = asRecord(input.outputSpec);
        const nextMode = loadedSession.contentMode ?? "video";

        setMode(nextMode);
        setGoal((asString(input.goal, "connect") as Goal) || "connect");
        setTone((asString(input.tone, "warm") as Tone) || "warm");
        setOutputSpec((current) => ({
          ...current,
          duration: asString(loadedSpec.duration, nextMode === "video" ? current.duration : ""),
          wordCount: asString(loadedSpec.wordCount, nextMode === "graphic" ? current.wordCount : ""),
          structure: asString(loadedSpec.structure, current.structure),
          platform: asString(loadedSpec.platform, current.platform),
          publishGoal: asString(loadedSpec.publishGoal, current.publishGoal)
        }));
        setIdea(asString(input.idea));
        setMaterialFiles([]);
        setStarted(true);
        setAnswers(loadedSession.answers);
        setSession(loadedSession);
        setWritebackMessage("");
        setSideMessages([]);
      } catch (error) {
        if (!cancelled) {
          setApiError(error instanceof Error ? error.message : "这条记录暂时没有打开成功。");
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

  const config = MODE_CONFIG[mode];
  const stats = modePreset(mode, goal, outputSpec);
  const sessionAnswers = session?.answers ?? answers;
  const output = session?.output ?? {};
  const savedAssistantMessage =
    typeof output.assistantMessage === "string" ? output.assistantMessage.trim() : "";
  const slots = normalizeSlots(session?.draft?.directorSlots);
  const suggestions = session?.draft?.suggestions ?? [];
  const nextSlot = session?.draft?.nextSlot ?? null;
  const revisionRequests = Array.isArray(session?.input?.revisionRequests)
    ? session.input.revisionRequests.filter((item): item is string => typeof item === "string")
    : [];
  const isDraftReady = started && (session?.status === "completed" || Boolean(output.finalScript));
  const currentQuestion =
    editingSlot
      ? `把“${SLOT_LABELS[editingSlot]}”改成什么？`
      : started && session?.status === "collecting"
      ? (session?.askedQuestions[session.askedQuestions.length - 1] ?? "")
      : "";
  const visibleSuggestions = currentQuestion && !editingSlot ? suggestions : [];

  const localDraft = useMemo(
    () => buildDraft(mode, goal, tone, idea, sessionAnswers),
    [mode, goal, tone, idea, sessionAnswers]
  );
  const draft = {
    intro: session?.draft?.intro ?? localDraft.intro,
    cards: session?.draft?.cards?.length ? session.draft.cards : localDraft.cards,
    hooks: session?.draft?.hooks?.length ? session.draft.hooks : localDraft.hooks
  };

  const thread = useMemo<ThreadMessage[]>(() => {
    if (!started) {
      return [];
    }

    const items: ThreadMessage[] = [];
    const questions = session?.askedQuestions.length ? session.askedQuestions : [];

    if (savedAssistantMessage && !questions.includes(savedAssistantMessage)) {
      items.push({ role: "assistant", text: savedAssistantMessage });
    }

    questions.forEach((question, index) => {
      if (index === 0 || sessionAnswers[index - 1]) {
        items.push({ role: "assistant", text: question });
      }

      if (sessionAnswers[index]) {
        items.push({ role: "user", text: sessionAnswers[index] });
      }
    });

    revisionRequests.forEach((request) => {
      items.push({ role: "user", text: request });
    });

    return [...items, ...sideMessages];
  }, [revisionRequests, savedAssistantMessage, session?.askedQuestions, sessionAnswers, sideMessages, started]);

  const draftNote = !started
    ? `先写下这条${mode === "graphic" ? "笔记" : "视频"}的素材。`
    : sessionAnswers.length === 0
      ? "先选一个方向。"
      : isDraftReady
        ? "继续补充你想改的地方。"
        : `当前判断：${sessionAnswers[sessionAnswers.length - 1]}`;
  const finalScript = output.finalScript ?? "";
  const titleOptions = output.titleOptions ?? [];
  const publishChecklist = output.publishChecklist ?? [];
  const timeline = output.timeline ?? [];
  const tags = output.tags ?? [];
  const wordCountPreset = WORD_COUNT_PRESETS.includes(outputSpec.wordCount)
    ? outputSpec.wordCount
    : "custom";
  const customWordCount = outputSpec.wordCount.replace(/[^\d]/g, "");
  const canStart = Boolean(idea.trim() || materialFiles.length);

  function resetFlow(nextMode?: Mode) {
    if (nextMode) {
      setMode(nextMode);
      setOutputSpec((value) => ({
        ...value,
        duration: nextMode === "video" ? value.duration || "60 秒" : "",
        wordCount: nextMode === "graphic" ? value.wordCount || "800 字" : ""
      }));
    }

    setStarted(false);
    setAnswers([]);
    setCurrentAnswer("");
    setMaterialFiles([]);
    setSession(null);
    setApiError("");
    setWritebackMessage("");
    setSideMessages([]);
    setEditingSlot(null);
  }

  function updateOutputSpec(key: keyof OutputSpec, value: string) {
    setOutputSpec((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleModeChange(nextMode: Mode) {
    if (nextMode === mode) {
      return;
    }

    resetFlow(nextMode);
  }

  function handleMaterialFiles(event: ChangeEvent<HTMLInputElement>) {
    setMaterialFiles(Array.from(event.target.files ?? []));
    setSession(null);
    setStarted(false);
    setAnswers([]);
    setCurrentAnswer("");
    setApiError("");
  }

  async function handleStart() {
    if (!canStart) {
      return;
    }

    setLoading(true);
    setApiError("");
    try {
      const artifacts = await Promise.all(
        materialFiles.map((file) =>
          postJson<ArtifactResponse>("/api/artifacts/register", {
            kind: mode === "video" ? "video" : "graphic_post",
            mimeType: file.type,
            fileName: file.name,
            sizeBytes: file.size
          })
        )
      );
      const created = await postJson<{ session: ApiSession }>("/api/sessions", {
        module: "director",
        contentMode: mode,
        artifactIds: artifacts.map((item) => item.artifact.id),
        input: {
          idea: idea.trim() || uploadedMaterialText(materialFiles, mode),
          materialText: idea,
          goal,
          tone,
          outputSpec,
          materialFileNames: fileNames(materialFiles)
        }
      });
      const run = await postJson<{ session: ApiSession }>(
        `/api/sessions/${created.session.id}/run`
      );

      setStarted(true);
      setSession(run.session);
      setAnswers(run.session.answers);
      setSideMessages([]);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "暂时没有连上后端，已先保留本地草稿。");
      setStarted(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!currentAnswer.trim()) {
      return;
    }

    const answer = currentAnswer.trim();
    const isSlotEdit = Boolean(editingSlot);
    const isRevision = !isSlotEdit && (!currentQuestion || isDraftReady);

    setLoading(true);
    setApiError("");
    try {
      if (!session) {
        setAnswers((value) => [...value, answer]);
        return;
      }

      await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/respond`, {
        answer,
        ...(isSlotEdit ? { kind: "slot_revision", targetSlot: editingSlot } : {}),
        ...(isRevision ? { kind: "revision" } : {})
      });
      const run = await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/run`);
      setSession(run.session);
      setAnswers(run.session.answers);
      setSideMessages([]);
      setEditingSlot(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "没有保存成功，请再试一次。");
      if (!isRevision && !isSlotEdit) {
        setAnswers((value) => [...value, answer]);
      } else {
        setSideMessages((value) => [...value, { role: "user", text: answer }]);
      }
    } finally {
      setCurrentAnswer("");
      setLoading(false);
    }
  }

  function startSlotEdit(slotKey: DirectorSlotKey) {
    setEditingSlot(slotKey);
    setCurrentAnswer(slots[slotKey].value);
    window.requestAnimationFrame(() => answerRef.current?.focus());
  }

  async function writeBack() {
    if (!session?.id) {
      return;
    }

    setLoading(true);
    setApiError("");
    setWritebackMessage("");
    try {
      await postJson(`/api/sessions/${session.id}/writeback`);
      setWritebackMessage("已保存为下次创作会参考的规则。");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "这条规则暂时没有保存成功。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="director-workbench">
      <section className="panel glass director-input-panel">
        <div className="panel-title">
          <span className="label">共创台</span>
          <h2>{mode === "graphic" ? "先把这篇笔记的素材放进来" : "先把这条视频的素材放进来"}</h2>
          <p>写下素材，先抓住方向。</p>
        </div>

        <div className="mode-switch">
          <button
            className={`mode-chip ${mode === "graphic" ? "active" : ""}`}
            onClick={() => handleModeChange("graphic")}
            type="button"
          >
            图文
          </button>
          <button
            className={`mode-chip ${mode === "video" ? "active" : ""}`}
            onClick={() => handleModeChange("video")}
            type="button"
          >
            视频
          </button>
        </div>

        <div className="director-stats">
          {stats.map((item) => (
            <div className="director-stat glass" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="director-inline-grid">
          <div className="input-group director-control-field">
            <label htmlFor="director-size">
              {mode === "graphic" ? "这篇控制在多少字" : "这条控制在多长时间"}
            </label>
            {mode === "graphic" ? (
              <div className="field-stack">
                <select
                  id="director-size"
                  onChange={(event) => {
                    const value = event.target.value;
                    updateOutputSpec("wordCount", value === "custom" ? "" : value);
                  }}
                  value={wordCountPreset}
                >
                  {WORD_COUNT_PRESETS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                  <option value="custom">自定义</option>
                </select>
                {wordCountPreset === "custom" ? (
                  <input
                    aria-label="自定义字数"
                    inputMode="numeric"
                    onChange={(event) => {
                      const value = event.target.value.replace(/[^\d]/g, "");
                      updateOutputSpec("wordCount", value ? `${value} 字` : "");
                    }}
                    placeholder="输入目标字数"
                    type="text"
                    value={customWordCount}
                  />
                ) : null}
              </div>
            ) : (
              <select
                id="director-size"
                onChange={(event) => updateOutputSpec("duration", event.target.value)}
                value={outputSpec.duration}
              >
                <option value="30 秒">30 秒</option>
                <option value="45 秒">45 秒</option>
                <option value="60 秒">60 秒</option>
                <option value="90 秒">90 秒</option>
              </select>
            )}
          </div>

          <div className="input-group director-control-field">
            <label htmlFor="director-structure">内容展开顺序</label>
            <select
              id="director-structure"
              onChange={(event) => updateOutputSpec("structure", event.target.value)}
              value={outputSpec.structure}
            >
              <option value="经历 + 方法 + 行动">先讲经历，再给方法</option>
              <option value="痛点 + 清单 + 保存">先点痛点，再给清单</option>
              <option value="结论 + 反常识 + 例子">先给结论，再讲例子</option>
              <option value="故事 + 转折 + 评论引导">先讲故事，再引评论</option>
            </select>
            <p className="field-hint">选择这次先讲什么。</p>
          </div>
        </div>

        <div className="input-group director-material-field">
          <label htmlFor="director-idea">{config.materialLabel}</label>
          <textarea
            id="director-idea"
            onChange={(event) => setIdea(event.target.value)}
            placeholder={config.placeholder}
            rows={10}
            value={idea}
          />
        </div>

        <label className="upload-card profile-upload-card director-upload-card">
          <strong>{mode === "video" ? "上传视频素材" : "上传图文素材"}</strong>
          <span>
            {mode === "video"
              ? "原片、片段、口播参考都可以先放这里。"
              : "截图、首图、笔记草稿、评论截图都可以补充。"}
          </span>
          <input
            accept={mode === "video" ? "video/*" : "image/*,.txt,.md,.doc,.docx"}
            className="file-input"
            multiple
            onChange={handleMaterialFiles}
            type="file"
          />
          <div className="director-upload-selected">
            <strong>已选素材</strong>
            <div className="selected-files">
              {fileNames(materialFiles).map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
        </label>

        <div className="director-inline-grid">
          <div className="input-group director-control-field">
            <label htmlFor="director-goal">这条内容更想带来什么结果</label>
            <select
              id="director-goal"
              onChange={(event) => setGoal(event.target.value as Goal)}
              value={goal}
            >
              <option value="connect">先建立共鸣</option>
              <option value="teach">先给方法</option>
              <option value="save">提高收藏意愿</option>
              <option value="follow">引导关注</option>
            </select>
          </div>

          <div className="input-group director-control-field">
            <label htmlFor="director-tone">内容语气</label>
            <select
              id="director-tone"
              onChange={(event) => setTone(event.target.value as Tone)}
              value={tone}
            >
              <option value="warm">温和陪伴</option>
              <option value="sharp">直接一点</option>
              <option value="clear">先讲清楚方法</option>
            </select>
          </div>
        </div>

        {!started ? (
          <>
            <div className="director-action-bar">
              <button
                className="button-primary"
                disabled={!canStart || loading}
                onClick={handleStart}
                type="button"
              >
                {loading ? "正在整理" : "开始写"}
              </button>
            </div>
            {apiError ? <p className="muted">{apiError}</p> : null}
          </>
        ) : (
          <div className="surface-card glass director-thread-panel">
            <div className="director-thread-head">
              <div className="director-thread-title">
                <span className="label">{editingSlot ? SLOT_LABELS[editingSlot] : nextSlot ? SLOT_LABELS[nextSlot] : "继续打磨"}</span>
                <h3>{currentQuestion ? "回答这句" : "补充细节或提出修改要求"}</h3>
              </div>
              <span className="muted">{isDraftReady ? "可继续改" : "先定当前方向"}</span>
            </div>

            <div className="director-slot-strip" aria-label="内容方向">
              {(["rootProblem", "changeTarget", "corePromise"] as DirectorSlotKey[]).map((key) => (
                <button
                  className={`director-slot-pill ${slots[key].status} ${editingSlot === key ? "editing" : ""}`}
                  key={key}
                  onClick={() => startSlotEdit(key)}
                  type="button"
                >
                  <span>{SLOT_LABELS[key]}</span>
                  <strong>{SLOT_STATUS_LABELS[slots[key].status]}</strong>
                </button>
              ))}
            </div>

            <div className="director-target-list">
              {(["rootProblem", "changeTarget", "corePromise"] as DirectorSlotKey[])
                .filter((key) => slots[key].status === "ready" && slots[key].value)
                .map((key) => (
                  <div className="director-target-card" key={key}>
                    <div>
                      <span>{SLOT_DONE_LABELS[key]}</span>
                      <strong>{slots[key].value}</strong>
                    </div>
                    <button onClick={() => startSlotEdit(key)} type="button">
                      改一下
                    </button>
                  </div>
                ))}
            </div>

            <div className="director-thread">
              {thread.map((message, index) => (
                <div
                  className={`thread-bubble ${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <span>{message.role === "assistant" ? "助手" : "你"}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>

            <div className="input-group">
              <label htmlFor="director-answer">
                {editingSlot ? `修改${SLOT_LABELS[editingSlot]}` : currentQuestion ? "回答这句" : "继续补充"}
              </label>
              <textarea
                ref={answerRef}
                id="director-answer"
                onChange={(event) => setCurrentAnswer(event.target.value)}
                placeholder={
                  editingSlot
                    ? "写下你想改成的方向。"
                    : currentQuestion
                    ? "直接写你的判断，不用整理成完整句。"
                    : "例如：开头更直接一点；第二段加真实经历；结尾不要太像教程。"
                }
                rows={4}
                value={currentAnswer}
              />
              <div className="director-thread-actions">
                <button
                  className="button-primary"
                  disabled={loading || !currentAnswer.trim()}
                  onClick={handleSubmitAnswer}
                  type="button"
                  >
                  {loading ? "正在调整" : editingSlot ? "确认修改" : currentQuestion ? "提交回答" : "继续改"}
                </button>
                {editingSlot ? (
                  <button
                    className="button-ghost"
                    onClick={() => {
                      setEditingSlot(null);
                      setCurrentAnswer("");
                    }}
                    type="button"
                  >
                    先不改
                  </button>
                ) : null}
                <button className="button-secondary" onClick={() => resetFlow()} type="button">
                  写下一条
                </button>
              </div>
              {visibleSuggestions.length ? (
                <div className="director-suggestion-row" aria-label="可选方向">
                  {visibleSuggestions.map((suggestion) => (
                    <button
                      className="suggestion-chip"
                      key={suggestion}
                      onClick={() => setCurrentAnswer(suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                  <button
                    className="suggestion-chip self-write"
                    onClick={() => {
                      setCurrentAnswer("");
                      answerRef.current?.focus();
                    }}
                    type="button"
                  >
                    我自己写
                  </button>
                </div>
              ) : null}
              {apiError ? <p className="muted">{apiError}</p> : null}
            </div>
          </div>
        )}
      </section>

      <aside className="stack-layout director-output-rail">
        <div className="surface-card glass">
          <span className="label">{finalScript ? "完整成稿" : mode === "graphic" ? "笔记草稿" : "脚本草稿"}</span>
          <h3>{finalScript ? "先检查这版能不能直接用" : mode === "graphic" ? "这篇笔记现在整理到这里" : "这条视频现在整理到这里"}</h3>
          <div className="ghost-note">{draftNote}</div>
          <p>{draft.intro}</p>

          {titleOptions.length ? (
            <div className="list-grid">
              {titleOptions.map((item) => (
                <div className="director-hook-card" key={item}>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="preview-grid">
              {draft.cards.map((item, index) => (
                <div className="preview-card" key={config.primaryLabels[index]}>
                  <h4>{config.primaryLabels[index]}</h4>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {timeline.length ? (
          <div className="surface-card glass">
            <span className="label">拍摄时间轴</span>
            <h3>按这个顺序拍</h3>
            <div className="script-timeline">
              {timeline.map((item) => (
                <div className="script-timeline-item" key={`${item.time}-${item.role}`}>
                  <strong>{item.time} · {item.role}</strong>
                  <p>{item.script}</p>
                  {item.visual ? <span>{item.visual}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {finalScript ? (
          <div className="surface-card glass result-panel">
            <span className="label">{mode === "graphic" ? "正文" : "完整口播"}</span>
            <h3>{mode === "graphic" ? "这一版可以继续微调" : "这一版可以直接开拍前顺一遍"}</h3>
            {output.coverText ? (
              <div className="callout">
                <strong>首图文案</strong>
                <p>{output.coverText}</p>
              </div>
            ) : null}
            <div className="script-block">{finalScript}</div>
            {tags.length ? (
              <div className="mode-switch">
                {tags.map((tag) => (
                  <span className="tag" key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="surface-card glass">
            <span className="label">{mode === "graphic" ? "可直接试的开头" : "可直接开拍的开头"}</span>
            <h3>{mode === "graphic" ? "先挑一个更顺手的版本" : "先挑一个更像你的开场"}</h3>
            <div className="list-grid">
              {draft.hooks.map((item) => (
                <div className="director-hook-card" key={item}>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {publishChecklist.length || session?.writebackCandidates.length ? (
          <div className="surface-card glass">
            <span className="label">发布前看一眼</span>
            <h3>这一版先守住这些点</h3>
            {publishChecklist.length ? (
              <div className="action-bullets">
                {publishChecklist.map((item) => (
                  <div className="bullet-row" key={item}>
                    <span className="bullet-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {session?.writebackCandidates.length ? (
              <div className="page-actions">
                <button
                  className="button-secondary"
                  disabled={loading}
                  onClick={writeBack}
                  type="button"
                >
                  保存为创作规则
                </button>
                {writebackMessage ? <span className="muted">{writebackMessage}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
