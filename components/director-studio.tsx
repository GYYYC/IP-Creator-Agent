"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "graphic" | "video";
type Goal = "connect" | "teach" | "save" | "follow";
type Tone = "warm" | "sharp" | "clear";

type ThreadMessage = {
  role: "assistant" | "user";
  text: string;
};

type ChoiceSet = {
  question: string;
  options: Array<{
    key: string;
    text: string;
  }>;
};

type DirectorDraft = {
  intro?: string;
  cards?: Array<{ title: string; content: string }>;
  hooks?: string[];
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
    questions: string[];
    primaryLabels: string[];
  }
> = {
  graphic: {
    label: "图文",
    materialLabel: "这篇笔记现在有的想法、经历或素材",
    placeholder:
      "例如：我想写一篇关于考研失败后如何重新进入状态的笔记，想讲自己二战时是怎么一点点恢复节奏的。",
    questions: [
      "这篇内容最想解决读者的哪个具体问题？",
      "你手里最能证明这件事的细节是什么？",
      "读者看完之后，你希望他先做哪一步？"
    ],
    primaryLabels: ["标题方向", "正文结构", "结尾引导"]
  },
  video: {
    label: "视频",
    materialLabel: "这条视频现在有的想法、经历或素材",
    placeholder:
      "例如：我想做一期关于考研失败后如何重新进入状态的视频，想讲自己二战时最难熬的那一个月。",
    questions: [
      "这条内容最想解决观众的哪个具体问题？",
      "你手里最能证明这件事的细节是什么？",
      "观众看完之后，你希望他先做哪一步？"
    ],
    primaryLabels: ["开头", "中段", "结尾"]
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
        "我二战那段时间最痛苦的，不是学不会，而是每天都怀疑自己。"
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
      "如果你也经历过一次考研失败，你会知道最难的不是重来，而是不再怀疑自己还能不能行。",
      "考研失败后别急着猛加时长，先把学习节奏重新拉回来。今天只讲我二战时最有用的三个动作。"
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

function isOptionRequest(value: string) {
  return /选项|选择|举例|不知道|怎么答|给我/.test(value);
}

function normalizeChoiceKey(value: string) {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^[A-D]/);
  return match?.[0] ?? "";
}

function buildChoiceSet(question: string, mode: Mode, idea: string): ChoiceSet {
  const topic = idea.trim() || (mode === "video" ? "这条视频" : "这篇笔记");

  if (question.includes("记住") || question.includes("收藏")) {
    return {
      question,
      options: [
        { key: "A", text: "失败后最先要恢复的不是学习时长，而是每天能坐回书桌前的节奏。" },
        { key: "B", text: "普通人二战最难的不是重学，而是不被上一次失败拖着走。" },
        { key: "C", text: "状态崩掉时，不要先逼自己鸡血，先做一个小到不会失败的动作。" },
        { key: "D", text: "这条内容想让观众相信：低谷期也能用很小的步骤重新启动。" }
      ]
    };
  }

  if (question.includes("经历") || question.includes("方法")) {
    return {
      question,
      options: [
        { key: "A", text: "先讲一个真实崩溃场景，再给出 3 个恢复节奏的动作。" },
        { key: "B", text: "先直接给方法，再用自己的二战经历证明这些动作有效。" },
        { key: "C", text: "先讲观众最熟悉的痛点，再把经历和方法穿插起来。" },
        { key: "D", text: "先抛一个反常识判断，再解释自己是怎么一步步验证的。" }
      ]
    };
  }

  if (question.includes("细节") || question.includes("证明")) {
    return {
      question,
      options: [
        { key: "A", text: "最崩溃时连续几天打开书却一个字都看不进去。" },
        { key: "B", text: "看到同学进度很快，自己连朋友圈都不敢点开。" },
        { key: "C", text: "给自己排了很狠的计划，但只撑了三天就彻底断掉。" },
        { key: "D", text: "真正拉回状态的是每天只完成一个最小学习动作。" }
      ]
    };
  }

  return {
    question,
    options: [
      { key: "A", text: `围绕“${topic}”先讲一个最真实的低谷瞬间。` },
      { key: "B", text: `围绕“${topic}”先给一个最能帮到人的具体动作。` },
      { key: "C", text: `围绕“${topic}”先讲一个观众会立刻共鸣的判断。` },
      { key: "D", text: `围绕“${topic}”先把失败前后的变化讲清楚。` }
    ]
  };
}

function formatChoiceSet(choiceSet: ChoiceSet) {
  return choiceSet.options.map((option) => `${option.key}. ${option.text}`).join("\n");
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [revisionInput, setRevisionInput] = useState("");
  const [writebackMessage, setWritebackMessage] = useState("");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [sideMessages, setSideMessages] = useState<ThreadMessage[]>([]);
  const [choiceSet, setChoiceSet] = useState<ChoiceSet | null>(null);

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
        setStarted(true);
        setAnswers(loadedSession.answers);
        setSession(loadedSession);
        setRevisionInput("");
        setWritebackMessage("");
        setSideMessages([]);
        setChoiceSet(null);
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
  const maxTurns = session?.followupBudget ?? config.questions.length;
  const isFinished =
    started &&
    (session?.status === "completed" || sessionAnswers.length >= maxTurns);
  const currentQuestion =
    started && !isFinished
      ? (session?.askedQuestions[session.askedQuestions.length - 1] ??
        config.questions[sessionAnswers.length])
      : null;

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

    const items: ThreadMessage[] = [
      {
        role: "assistant",
        text: `收到，你现在想做一条${config.label}内容。我会边问边整理草稿，先把最关键的信息补齐。`
      }
    ];

    const questions = session?.askedQuestions.length ? session.askedQuestions : config.questions;

    questions.forEach((question, index) => {
      if (index === 0 || sessionAnswers[index - 1]) {
        items.push({ role: "assistant", text: question });
      }

      if (sessionAnswers[index]) {
        items.push({ role: "user", text: sessionAnswers[index] });
      }
    });

    if (isFinished) {
      items.push({
        role: "assistant",
        text: `可以了，这一轮核心信息已经够了。我先按现在这版给你整理草稿，你还可以继续回来补细节。`
      });
    }

    return [...items, ...sideMessages];
  }, [config.label, config.questions, isFinished, session?.askedQuestions, sessionAnswers, sideMessages, started]);

  const draftNote = !started
    ? `先把素材放进来，马上整理第一版${mode === "graphic" ? "笔记" : "脚本"}。`
    : sessionAnswers.length === 0
      ? `已根据你的素材生成第一版${mode === "graphic" ? "笔记结构" : "脚本结构"}。`
      : `最近一轮已经写进草稿：${sessionAnswers[sessionAnswers.length - 1]}`;
  const finalScript = output.finalScript ?? "";
  const titleOptions = output.titleOptions ?? [];
  const publishChecklist = output.publishChecklist ?? [];
  const timeline = output.timeline ?? [];
  const tags = output.tags ?? [];
  const wordCountPreset = WORD_COUNT_PRESETS.includes(outputSpec.wordCount)
    ? outputSpec.wordCount
    : "custom";
  const customWordCount = outputSpec.wordCount.replace(/[^\d]/g, "");

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
    setRevisionInput("");
    setSession(null);
    setApiError("");
    setWritebackMessage("");
    setSideMessages([]);
    setChoiceSet(null);
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

  async function handleStart() {
    if (!idea.trim()) {
      return;
    }

    setLoading(true);
    setApiError("");
    try {
      const created = await postJson<{ session: ApiSession }>("/api/sessions", {
        module: "director",
        contentMode: mode,
        input: {
          idea,
          goal,
          tone,
          outputSpec
        }
      });
      const run = await postJson<{ session: ApiSession }>(
        `/api/sessions/${created.session.id}/run`
      );

      setStarted(true);
      setSession(run.session);
      setAnswers(run.session.answers);
      setSideMessages([]);
      setChoiceSet(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "暂时没有连上后端，已先保留本地草稿。");
      setStarted(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!currentAnswer.trim() || !currentQuestion) {
      return;
    }

    const answer = currentAnswer.trim();
    if (isOptionRequest(answer) && currentQuestion) {
      const nextChoiceSet = buildChoiceSet(currentQuestion, mode, idea);
      setChoiceSet(nextChoiceSet);
      setSideMessages((value) => [
        ...value,
        { role: "user", text: answer },
        {
          role: "assistant",
          text: `可以，选一个最接近你的，也可以直接改写成你自己的版本：\n${formatChoiceSet(nextChoiceSet)}`
        }
      ]);
      setCurrentAnswer("");
      return;
    }

    const choiceKey = normalizeChoiceKey(answer);
    const expandedAnswer =
      choiceSet?.options.find((option) => option.key === choiceKey)?.text ?? answer;

    setLoading(true);
    setApiError("");
    try {
      if (!session) {
        setAnswers((value) => [...value, expandedAnswer]);
        return;
      }

      await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/respond`, {
        answer: expandedAnswer
      });
      const run = await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/run`);
      setSession(run.session);
      setAnswers(run.session.answers);
      setChoiceSet(null);
      setSideMessages([]);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "这一轮没有连上后端，已先写入本地草稿。");
      setAnswers((value) => [...value, expandedAnswer]);
    } finally {
      setCurrentAnswer("");
      setLoading(false);
    }
  }

  async function handleRevision() {
    if (!session?.id || !revisionInput.trim()) {
      return;
    }

    setLoading(true);
    setApiError("");
    setWritebackMessage("");
    try {
      await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/respond`, {
        answer: revisionInput.trim(),
        kind: "revision"
      });
      const run = await postJson<{ session: ApiSession }>(`/api/sessions/${session.id}/run`);
      setSession(run.session);
      setRevisionInput("");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "这一轮没有连上后端，请稍后再试。");
    } finally {
      setLoading(false);
    }
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
          <p>选好模式和规格，再顺着当前问题往下写。</p>
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
          <div className="input-group">
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

          <div className="input-group">
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
            <p className="field-hint">先定顺序，后面可以继续改。</p>
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="director-idea">{config.materialLabel}</label>
          <textarea
            id="director-idea"
            onChange={(event) => setIdea(event.target.value)}
            placeholder={config.placeholder}
            rows={10}
            value={idea}
          />
        </div>

        <div className="director-inline-grid">
          <div className="input-group">
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

          <div className="input-group">
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
                disabled={!idea.trim() || loading}
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
                <span className="label">共创中</span>
                <h3>{isFinished ? "这一轮已经写完" : `第 ${sessionAnswers.length + 1} 轮问题`}</h3>
              </div>
              <span className="muted">
                已回答 {sessionAnswers.length} / 最多 {maxTurns}
              </span>
            </div>

            {!isFinished ? (
              <div className="callout">
                <strong>当前问题</strong>
                <p>{currentQuestion}</p>
              </div>
            ) : null}

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

            {!isFinished ? (
              <div className="input-group">
                <label htmlFor="director-answer">直接回答这一轮问题</label>
                <textarea
                  id="director-answer"
                  onChange={(event) => setCurrentAnswer(event.target.value)}
                  placeholder="像聊天一样回答就行；也可以输入 A/B/C/D 选择上面的选项。"
                  rows={4}
                  value={currentAnswer}
                />
                {choiceSet ? (
                  <div className="director-choice-grid">
                    {choiceSet.options.map((option) => (
                      <button
                        className="choice-chip"
                        key={option.key}
                        onClick={() => setCurrentAnswer(`${option.key}. ${option.text}`)}
                        type="button"
                      >
                        <strong>{option.key}</strong>
                        <span>{option.text}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="director-thread-actions">
                  <button
                    className="button-primary"
                    disabled={loading}
                    onClick={handleSubmitAnswer}
                    type="button"
                  >
                    {loading ? "正在改稿" : "提交这轮回答"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={loading || !currentQuestion}
                    onClick={() => {
                      if (!currentQuestion) {
                        return;
                      }

                      const nextChoiceSet = buildChoiceSet(currentQuestion, mode, idea);
                      setChoiceSet(nextChoiceSet);
                      setSideMessages((value) => [
                        ...value,
                        {
                          role: "assistant",
                          text: `可以，选一个最接近你的，也可以直接改写成你自己的版本：\n${formatChoiceSet(nextChoiceSet)}`
                        }
                      ]);
                    }}
                    type="button"
                  >
                    给我选项
                  </button>
                  <button className="button-secondary" onClick={() => resetFlow()} type="button">
                    重新开始
                  </button>
                </div>
                {apiError ? <p className="muted">{apiError}</p> : null}
              </div>
            ) : (
              <div className="input-group">
                <label htmlFor="director-revision">继续改这一版</label>
                <textarea
                  id="director-revision"
                  onChange={(event) => setRevisionInput(event.target.value)}
                  placeholder="例如：把开头写得更直接一点，或者解释一下第二段为什么这样写。"
                  rows={4}
                  value={revisionInput}
                />
                <div className="director-thread-actions">
                  <button
                    className="button-primary"
                    disabled={loading || !revisionInput.trim() || !session}
                    onClick={handleRevision}
                    type="button"
                  >
                    {loading ? "正在调整" : "继续调整"}
                  </button>
                  <button className="button-secondary" onClick={() => resetFlow()} type="button">
                    写下一条
                  </button>
                </div>
                {apiError ? <p className="muted">{apiError}</p> : null}
              </div>
            )}
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
