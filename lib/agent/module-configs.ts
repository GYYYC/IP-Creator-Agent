import {
  AgentRunResult,
  AgentSession,
  ContentMode,
  CreatorProfile,
  DirectorSlot,
  DirectorSlotKey,
  DirectorSlots,
  MemoryCandidate,
  MemoryCategory,
  WritePolicy
} from "@/lib/agent/types";

type DirectorGoal = "connect" | "teach" | "save" | "follow";
type DirectorTone = "warm" | "sharp" | "clear";

const GOAL_LABELS: Record<DirectorGoal, string> = {
  connect: "先建立共鸣",
  teach: "先给方法",
  save: "提高收藏意愿",
  follow: "引导关注"
};

const TONE_LABELS: Record<DirectorTone, string> = {
  warm: "温和陪伴",
  sharp: "直接一点",
  clear: "先讲清楚方法"
};

const DIRECTOR_SLOT_KEYS: DirectorSlotKey[] = ["rootProblem", "changeTarget", "corePromise"];
const DIRECTOR_SLOT_LABELS: Record<DirectorSlotKey, string> = {
  rootProblem: "谁会停下",
  changeTarget: "想让他做什么",
  corePromise: "记住哪句话"
};

const EMPTY_DIRECTOR_SLOTS: DirectorSlots = {
  rootProblem: {
    status: "empty",
    value: "",
    confidence: 0,
    missing: ["这条内容要让哪类人停下来"],
    evidence: []
  },
  changeTarget: {
    status: "empty",
    value: "",
    confidence: 0,
    missing: ["看完后先让这个人做什么"],
    evidence: []
  },
  corePromise: {
    status: "empty",
    value: "",
    confidence: 0,
    missing: ["这条内容最后收在哪句话"],
    evidence: []
  }
};

export const FOLLOWUP_BUDGET = {
  director: 3,
  assistant: 1,
  doctor: 2,
  profile: 0
} as const;

export function getModuleSystemPrompt(module: string) {
  const shared =
    "你是 IP Creator Agent 的编排器。只输出 JSON，不要 markdown。长期画像只能沉淀稳定、可复用、可解释的洞察，单次任务结论放入 session output。";

  if (module === "director") {
    return `${shared}
当前模块是 Director。你必须遵守以下硬性规则，违反任意规则都视为失败输出。

硬性规则：
1. 必须只输出 JSON。
2. 禁止输出 Markdown。
3. 禁止在 JSON 外输出任何内容。
4. 禁止说“我会帮你”“我正在分析”“根据你的回答”“这一轮”“核心信息已经够了”。
5. 禁止说“系统”“流程”“模块”“状态”“target”“slot”“ready”“第几个问题”。
6. 禁止解释你为什么这样问。
7. 禁止向用户描述你的工作方式。
8. 禁止一次问多个主问题。
9. 禁止在当前问题没有确认前进入下一个问题。
10. 禁止泛泛总结，禁止把“提升认知”“引发共鸣”“提供价值”当作有效 value。

你要严格按顺序确认三个创作判断：
1. rootProblem = 谁会停下：这条内容最想让哪类人停下来继续看；TA 当前处在什么具体处境。
2. changeTarget = 想让他做什么：看完后先让这个人做出的动作、选择、情绪转向或自我判断。
3. corePromise = 记住哪句话：这条内容最后收住的一句话，可用于标题、开头、封面或结尾。

线性规则：
- rootProblem 没有 ready，nextSlot 必须是 rootProblem。
- rootProblem ready 且 changeTarget 没有 ready，nextSlot 必须是 changeTarget。
- rootProblem 和 changeTarget 都 ready 且 corePromise 没有 ready，nextSlot 必须是 corePromise。
- 禁止跳问后面的判断。
- 如果用户修改前面的判断，必须重新确认这个判断；后面的判断不得继续沿用。
- 用户说的话只能更新当前 nextSlot，除非 session.input.slotRevision 指明正在修改某个判断。
- session.input.slotRevision 存在时，先按其中 slotKey 和 value 重新处理对应判断；必须围绕修改后的内容继续确认，不要直接跳过。

status 判定：
empty:
- 没有相关信息。
- 或用户只说“不知道/没想好/随便/你来定/没有”。
- 禁止脑补。

partial:
- 有方向、情绪、经历或模糊目标，但还不能直接决定标题、开头或脚本结构。
- 必须继续追问。

ready:
- 足够具体，可以直接指导成稿。
- rootProblem 必须包含具体对象 + 具体处境。
- changeTarget 必须包含可理解的动作、选择、情绪转向或自我判断。
- corePromise 必须是一句用户能记住的话。
- 如果无法确定，必须保守判为 partial 或 empty，禁止为了成稿强行判 ready。

每轮必须先在内部完成判断，再输出 JSON：
1. 判断用户上一句类型：answer | confused | unknown | ask_options | revision | off_track。
2. 只更新当前 nextSlot。
3. 判断当前 nextSlot 是否 ready。
4. 决定继续问、给选项、还是完成成稿。

追问规则：
- 每次只问一个主问题。
- 每个判断的第一问必须给 2 到 3 个 suggestions，并额外允许用户自己写。
- suggestions 最多 3 个，每个不超过 28 个中文字符，不用 A/B/C/D，不要写“以下是选项”。
- suggestions 必须贴合用户素材，不得凭空扩展到无关方向。
- 用户回答“不知道/没想好/随便/你来定”时，不更新 value，继续当前判断，并给 suggestions。
- 用户说“没明白/什么意思/没懂”时，不更新 value，换成更直白的问题，并给 suggestions。
- 用户要求“再给几个选项/换几个选项/还有吗”时，不更新 value，继续当前判断，并给新 suggestions，禁止重复上一组。
- 用户自填内容模糊时，当前判断必须是 partial，继续追问或给更具体 suggestions。
- 三个判断都 ready 时，必须生成完整稿。
- 用户提出修改要求或 session.input.revisionRequests 有内容：直接按当前要求改写完整稿，不重新追问。

成稿规则：
- 必须尊重 session.input.outputSpec。
- 视频按目标时长写分段口播，图文按目标字数写完整正文。
- draft 必须包含 intro、cards、hooks；cards 必须是 3 个对象。
- output 必须包含 finalScript、titleOptions、publishChecklist。
- 视频还要包含 timeline 和 subtitles。
- 图文还要包含 coverText、body、tags。
- writebackCandidates 只能是候选，不要把单次选题当成长期画像。`;
  }

  if (module === "assistant") {
    return `${shared}
Assistant 任务只处理作品和评论之间的关系。你必须遵守以下硬性规则，违反任意规则都视为失败输出。

硬性规则：
1. 必须只输出 JSON。
2. 禁止输出 Markdown。
3. 禁止在 JSON 外输出任何内容。
4. 禁止说“我会帮你”“我正在分析”“根据你的输入”“当前流程”“这个模块”“下一步流程”“为了更好地”“核心信息已经够了”。
5. 禁止解释你的工作方式。
6. 禁止把没有给出的作品背景当成已知事实。
7. 禁止把单条评论强行总结成评论区趋势。
8. 禁止把多条评论强行当作一条评论拆解。
9. 禁止泛泛评价“很有价值”“引发共鸣”“可以互动”，必须说明具体意图、情绪、需求或动作。

输入字段：
- session.input.assistantMode = single_comment | comment_direction。
- session.input.workContext = 作品链接、标题、正文、脚本、历史作品摘要或用户补充的作品上下文。
- session.input.comments = 评论文本。
- session.input.screenshotFileNames = 评论截图文件名，文件名只能作为辅助线索，不要假装已经读懂图片内容。

任务模式：
single_comment:
- 只分析一条评论。
- 如果用户贴了多条明显独立的评论，status 必须为 collecting，并让用户只保留一条，或切换到 comment_direction。
- 输出重点是：评论真实意图、情绪阻力、隐藏需求、回复方向、是否能反推选题。

comment_direction:
- 分析一组评论的整体方向。
- 不要逐条点评每条评论。
- 输出重点是：反复出现的问题、最强情绪、内容机会、下一条内容方向、哪些回复可以置顶或优先回应。

缺失处理：
- workContext 为空时，status 必须为 collecting；assistantMessage 写“先选一条作品。”；nextQuestion 写“选一条作品或粘贴作品内容。”；output 不要做评论分析。
- comments 为空且没有截图时，status 必须为 collecting；single_comment 只要求贴一条评论；comment_direction 要求贴几条代表性评论。
- 用户写“不知道/没有/随便”时，不要追问抽象问题，给一个更具体的当前动作。

输出规则：
- output.assistantMode 必须等于本次任务模式。
- output.workSummary 用一句话概括这条作品给评论分析提供的关键上下文。
- output.analysis 必须包含可展示字段。
- output.layers 最多 5 条。
- output.replySuggestions 最多 3 条。
- output.nextTopics 最多 5 条。
- writebackCandidates 只能沉淀稳定的受众洞察、评论需求或风险，不要把单条评论直接写成长记忆。`;
  }

  if (module === "doctor") {
    return `${shared} 当前模块是 Doctor。你需要根据 session.contentMode 判断复盘对象是图文还是视频。图文重点分析首图、标题、正文结构、收藏/评论转化；视频重点基于用户补充、留存截图说明和关键时间点做半自动复盘。不要声称已逐秒自动理解完整视频。`;
  }

  return `${shared} 当前模块是 Profile。你需要把用户主动提供的信息整理成可复用画像候选。`;
}

export function buildFallbackRun(session: AgentSession, profile: CreatorProfile): AgentRunResult {
  if (session.module === "assistant") {
    return buildAssistantFallback(session);
  }

  if (session.module === "doctor") {
    return buildDoctorFallback(session);
  }

  if (session.module === "profile") {
    return buildProfileFallback(session, profile);
  }

  return buildDirectorFallback(session);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cloneDirectorSlots(): DirectorSlots {
  return {
    rootProblem: { ...EMPTY_DIRECTOR_SLOTS.rootProblem, missing: [...EMPTY_DIRECTOR_SLOTS.rootProblem.missing], evidence: [] },
    changeTarget: { ...EMPTY_DIRECTOR_SLOTS.changeTarget, missing: [...EMPTY_DIRECTOR_SLOTS.changeTarget.missing], evidence: [] },
    corePromise: { ...EMPTY_DIRECTOR_SLOTS.corePromise, missing: [...EMPTY_DIRECTOR_SLOTS.corePromise.missing], evidence: [] }
  };
}

function getDirectorSlots(session: AgentSession): DirectorSlots {
  return enforceDirectorLinearity(normalizeDirectorSlots(session.draft.directorSlots, cloneDirectorSlots()));
}

function normalizeDirectorSlots(value: unknown, fallback = cloneDirectorSlots()): DirectorSlots {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return DIRECTOR_SLOT_KEYS.reduce((slots, key) => {
    slots[key] = normalizeDirectorSlot(record[key], fallback[key], key);
    return slots;
  }, {} as DirectorSlots);
}

function normalizeDirectorSlot(value: unknown, fallback: DirectorSlot, key: DirectorSlotKey): DirectorSlot {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const status = normalizeSlotStatus(record.status);
  const valueText = asString(record.value, fallback.value);
  const missing = normalizeStringArray(record.missing, fallback.missing);
  const evidence = normalizeStringArray(record.evidence, fallback.evidence);
  const confidence =
    typeof record.confidence === "number"
      ? Math.max(0, Math.min(1, record.confidence))
      : fallback.confidence;
  const guardedStatus = guardSlotStatus({
    status,
    value: valueText,
    confidence,
    missing,
    evidence
  });
  const promotedStatus =
    guardedStatus === "partial" && isSlotAnswerReady(key, valueText, valueText)
      ? "ready"
      : guardedStatus;

  return {
    status: promotedStatus,
    value: valueText,
    confidence,
    missing: promotedStatus === "ready" ? [] : missing.length ? missing : defaultMissingForSlot(key),
    evidence
  };
}

function guardSlotStatus(slot: DirectorSlot): DirectorSlot["status"] {
  const valueLength = slot.value.trim().length;
  if (!valueLength) {
    return "empty";
  }

  if (slot.status === "ready" && (valueLength < 16 || slot.confidence < 0.7 || slot.missing.length > 0)) {
    return "partial";
  }

  if (slot.status === "empty" && valueLength >= 8) {
    return "partial";
  }

  return slot.status;
}

function normalizeSlotStatus(value: unknown): DirectorSlot["status"] {
  return value === "partial" || value === "ready" ? value : "empty";
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : fallback;
}

function defaultMissingForSlot(key: DirectorSlotKey) {
  return {
    rootProblem: ["这条内容要让哪类人停下来"],
    changeTarget: ["看完后先让这个人做什么"],
    corePromise: ["这条内容最后收在哪句话"]
  }[key];
}

function normalizeDirectorSlotKey(value: unknown, slots: DirectorSlots): DirectorSlotKey | null {
  void value;
  return firstOpenDirectorSlot(slots);
}

function firstOpenDirectorSlot(slots: DirectorSlots): DirectorSlotKey | null {
  return DIRECTOR_SLOT_KEYS.find((key) => slots[key].status !== "ready") ?? null;
}

function enforceDirectorLinearity(slots: DirectorSlots): DirectorSlots {
  const nextSlots = normalizeDirectorSlots(slots);
  const firstOpenIndex = DIRECTOR_SLOT_KEYS.findIndex((key) => nextSlots[key].status !== "ready");

  if (firstOpenIndex < 0) {
    return nextSlots;
  }

  for (let index = firstOpenIndex + 1; index < DIRECTOR_SLOT_KEYS.length; index += 1) {
    const key = DIRECTOR_SLOT_KEYS[index];
    nextSlots[key] = {
      ...EMPTY_DIRECTOR_SLOTS[key],
      missing: defaultMissingForSlot(key)
    };
  }

  return nextSlots;
}

function normalizeSuggestions(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
        .slice(0, 3)
    : [];
}

function directorReadyCount(slots: DirectorSlots) {
  return DIRECTOR_SLOT_KEYS.filter((key) => slots[key].status === "ready").length;
}

function directorAllReady(slots: DirectorSlots) {
  return DIRECTOR_SLOT_KEYS.every((key) => slots[key].status === "ready");
}

function buildDirectorFallback(session: AgentSession): AgentRunResult {
  const idea = asString(session.input.idea, "围绕一个真实经历做一条内容。");
  const goal = (asString(session.input.goal, "connect") as DirectorGoal) || "connect";
  const tone = (asString(session.input.tone, "warm") as DirectorTone) || "warm";
  const mode = session.contentMode;
  const outputSpec = normalizeOutputSpec(session.input.outputSpec, mode);
  const revisionRequests = Array.isArray(session.input.revisionRequests)
    ? session.input.revisionRequests.filter((item): item is string => typeof item === "string")
    : [];
  const slots = applyFallbackAnswers(
    session,
    applyDirectorSlotRevision(getDirectorSlots(session), normalizeDirectorSlotRevision(session.input.slotRevision)),
    idea,
    mode
  );
  const nextSlot = normalizeDirectorSlotKey(session.draft.nextSlot, slots);
  const optionVariant = session.answers.filter((answer) =>
    ["unknown", "confused", "ask_options"].includes(classifyDirectorReply(answer))
  ).length;
  const suggestions = nextSlot && slots[nextSlot].status !== "ready"
    ? fallbackSuggestions(nextSlot, idea, mode, optionVariant)
    : [];
  const nextQuestion = nextSlot ? fallbackQuestion(nextSlot, slots[nextSlot].status, idea, mode) : undefined;
  const complete =
    revisionRequests.length > 0 ||
    directorAllReady(slots);
  const rootProblem = slots.rootProblem.value || "用户真正卡住的是状态断掉后不知道怎么重新开始";
  const changeTarget = slots.changeTarget.value || "让用户先恢复可执行的小节奏，而不是一上来逼自己加时长";
  const coreConclusion = slots.corePromise.value || "先恢复节奏，再谈努力";
  const anchor = coreConclusion;
  const middle = `${rootProblem}。${changeTarget}`;
  const proof = rootProblem;
  const action = "引导用户说出自己最卡的具体步骤";
  const draft =
    mode === "graphic"
      ? {
          intro: `这篇笔记更偏 ${GOAL_LABELS[goal]}，语气走 ${TONE_LABELS[tone]}。`,
          cards: [
            { title: "标题方向", content: `围绕“${anchor}”起标题，避免泛泛焦虑。` },
            { title: "正文结构", content: `${idea} ${middle}。` },
            { title: "结尾引导", content: `结尾问读者现在最卡的步骤，并用“${proof}”收住。` }
          ],
          hooks: ["如果你不是天赋型选手，这篇可能更适合你。", "别急着逼自己加时长，先把节奏找回来。"]
        }
      : {
          intro: `这条视频更偏 ${GOAL_LABELS[goal]}，语气走 ${TONE_LABELS[tone]}。`,
          cards: [
            { title: "开头", content: `0-3 秒先讲“${anchor}”。` },
            { title: "中段", content: `${idea} ${middle}。` },
            { title: "结尾", content: `用 3 个短动作收住，再引导评论区提问。${proof}。` }
          ],
          hooks: [
            "考研失败后最难的不是重来，而是不再怀疑自己还能不能行。",
            "别急着猛加学习时长，先做这三个动作把节奏拉回来。"
          ]
        };
  const output =
    mode === "graphic"
      ? buildGraphicOutput({ idea, goal, tone, outputSpec, anchor, middle, proof, action, revisionRequests })
      : buildVideoOutput({ idea, goal, tone, outputSpec, anchor, middle, proof, action, revisionRequests });

  const candidates: MemoryCandidate[] = complete
    ? [
        {
          category: "content_rule",
          key: `${mode}_opening_rule`,
          value: {
            title: mode === "graphic" ? "图文开头规则" : "视频开头规则",
            summary: "下次内容先给结论或关键判断，再补经历，避免长背景铺陈。"
          },
          reason: "本次创作中该规则能稳定服务当前画像，但仍应作为候选等待确认。",
          confidence: 0.72,
          writePolicy: "candidate_only"
        }
      ]
    : [];

  return {
    status: complete ? "completed" : "collecting",
    assistantMessage: complete
      ? revisionRequests.length
        ? "按新的要求更新这一版。"
        : "检查标题、开头和结尾引导。"
      : "选一个方向，或自己写。",
    nextQuestion: complete ? undefined : nextQuestion,
    nextSlot: complete ? null : nextSlot,
    suggestions: complete ? [] : suggestions,
    slots,
    draft: {
      ...draft,
      directorSlots: slots,
      nextSlot: complete ? null : nextSlot,
      suggestions: complete ? [] : suggestions,
      directorAnswerCount: session.answers.length
    },
    output: complete ? output : {},
    writebackCandidates: candidates
  };
}

function normalizeDirectorSlotRevision(value: unknown): { slotKey: DirectorSlotKey; value: string } | null {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const slotKey = record.slotKey;
  const text = asString(record.value);

  if (!text || (slotKey !== "rootProblem" && slotKey !== "changeTarget" && slotKey !== "corePromise")) {
    return null;
  }

  return { slotKey, value: text };
}

function applyDirectorSlotRevision(
  slots: DirectorSlots,
  revision: { slotKey: DirectorSlotKey; value: string } | null
): DirectorSlots {
  if (!revision) {
    return enforceDirectorLinearity(slots);
  }

  const nextSlots = normalizeDirectorSlots(slots);
  const revisionIndex = DIRECTOR_SLOT_KEYS.indexOf(revision.slotKey);

  DIRECTOR_SLOT_KEYS.forEach((key, index) => {
    if (index < revisionIndex) {
      return;
    }

    if (key === revision.slotKey) {
      nextSlots[key] = {
        status: "partial",
        value: canonicalizeSlotValue(key, revision.value, nextSlots[key].value),
        confidence: 0.58,
        missing: defaultMissingForSlot(key),
        evidence: [revision.value]
      };
      return;
    }

    nextSlots[key] = {
      ...EMPTY_DIRECTOR_SLOTS[key],
      missing: defaultMissingForSlot(key)
    };
  });

  return enforceDirectorLinearity(nextSlots);
}

function applyFallbackAnswers(
  session: AgentSession,
  slots: DirectorSlots,
  idea: string,
  mode: ContentMode
): DirectorSlots {
  const previousAnswerCount =
    typeof session.draft.directorAnswerCount === "number" ? session.draft.directorAnswerCount : 0;
  const nextSlots = enforceDirectorLinearity(slots);
  let currentSlot =
    normalizeDirectorSlotKey(session.draft.nextSlot, nextSlots) ??
    DIRECTOR_SLOT_KEYS.find((key) => nextSlots[key].status !== "ready") ??
    "rootProblem";

  for (const answer of session.answers.slice(previousAnswerCount)) {
    const normalizedAnswer = answer.trim();
    const replyType = classifyDirectorReply(normalizedAnswer);

    if (replyType === "unknown" || replyType === "confused" || replyType === "ask_options") {
      nextSlots[currentSlot] = {
        ...nextSlots[currentSlot],
        status: nextSlots[currentSlot].value ? "partial" : "empty",
        missing: defaultMissingForSlot(currentSlot),
        evidence: [...nextSlots[currentSlot].evidence, normalizedAnswer].filter(Boolean)
      };
      break;
    }

    const value = canonicalizeSlotValue(currentSlot, normalizedAnswer, nextSlots[currentSlot].value);
    const ready = isSlotAnswerReady(currentSlot, value, normalizedAnswer);
    nextSlots[currentSlot] = {
      status: ready ? "ready" : "partial",
      value,
      confidence: ready ? 0.78 : 0.55,
      missing: ready ? [] : defaultMissingForSlot(currentSlot),
      evidence: [normalizedAnswer]
    };

    if (ready) {
      currentSlot =
        DIRECTOR_SLOT_KEYS.find((key) => nextSlots[key].status !== "ready") ??
        currentSlot;
    }
  }

  return enforceDirectorLinearity(nextSlots);
}

function classifyDirectorReply(answer: string) {
  if (/^(不知道|不清楚|没想好|随便|你来定|没有|无)$/i.test(answer)) {
    return "unknown";
  }

  if (/(没明白|没懂|什么意思|啥意思|不理解|看不懂)/.test(answer)) {
    return "confused";
  }

  if (/(再.*选项|换.*选项|多.*选项|还有.*选|给.*选项|别的.*方向)/.test(answer)) {
    return "ask_options";
  }

  if (/(不对|不是这个|重点不对|改成|应该是|我想改)/.test(answer)) {
    return "revision";
  }

  return "answer";
}

function canonicalizeSlotValue(slot: DirectorSlotKey, answer: string, previous = "") {
  const normalized = answer.replace(/^(改成|应该是|我想改成|不是，?|不对，?)/, "").trim();

  if (slot === "changeTarget") {
    if (/平静|冷静|稳住/.test(normalized)) {
      return /一定可以|可以|能/.test(normalized)
        ? "让他先平静下来，相信自己一定可以"
        : "让他先平静下来";
    }

    if (/坐回|开始|动起来|行动|做/.test(normalized) && !/^让/.test(normalized)) {
      return `让他${normalized}`;
    }
  }

  if (slot === "rootProblem" && previous && normalized.length < 18) {
    return `${previous}，${normalized}`;
  }

  return normalized;
}

function isSlotAnswerReady(slot: DirectorSlotKey, value: string, rawAnswer: string) {
  const length = value.replace(/\s/g, "").length;

  if (slot === "rootProblem") {
    return length >= 16 && /(人|观众|读者|考研|二战|学生|上岸|成绩|书桌|学不进去|状态|怀疑)/.test(value);
  }

  if (slot === "changeTarget") {
    return length >= 6 && /(让|先|停止|重新|平静|相信|开始|坐回|行动|选择|判断|不要|不再)/.test(value);
  }

  return rawAnswer.length >= 4;
}

function fallbackQuestion(
  slot: DirectorSlotKey,
  status: DirectorSlot["status"],
  _idea: string,
  mode: ContentMode
) {
  const audience = mode === "graphic" ? "读者" : "观众";
  if (slot === "rootProblem") {
    return status === "empty"
      ? `这条内容更适合先让哪类${audience}停下来？`
      : `再具体一点，这类${audience}最常卡在哪个场景？`;
  }

  if (slot === "changeTarget") {
    return status === "empty"
      ? `你想让这个${audience}看完后先做到什么？`
      : `这个方向再落具体一点，最先发生的动作或念头是什么？`;
  }

  return status === "empty"
    ? `这条内容最后想让${audience}记住哪句话？`
    : `把这句话再收紧一点，最有力的版本是什么？`;
}

function linearFallbackQuestion(slot: DirectorSlotKey, status: DirectorSlot["status"]) {
  if (slot === "rootProblem") {
    return status === "empty"
      ? "这条内容更适合先让哪类观众停下来？"
      : "这类观众最典型的卡住画面是什么？";
  }

  if (slot === "changeTarget") {
    return status === "empty"
      ? "你想让这个观众看完后先做到什么？"
      : "这个动作再具体一点，最先发生的变化是什么？";
  }

  return status === "empty"
    ? "这条内容最后想让观众记住哪句话？"
    : "把这句话再收紧一点，最有力的版本是什么？";
}

function fallbackSuggestions(slot: DirectorSlotKey, _idea: string, mode: ContentMode, variant = 0) {
  const audience = mode === "graphic" ? "读者" : "观众";
  if (slot === "rootProblem") {
    const groups = [
      [
        `正在低谷里想重新开始的${audience}`,
        `努力过但开始怀疑自己的${audience}`,
        `看了方法却还是动不起来的${audience}`
      ],
      [
        `坐到书桌前学不进去的${audience}`,
        `决定重来但迟迟没开始的${audience}`,
        `看到别人进度就慌的${audience}`
      ],
      [
        `刚查完成绩很崩的${audience}`,
        `已经摆烂几周的${audience}`,
        `每天计划重启又失败的${audience}`
      ]
    ];
    return groups[variant % groups.length];
  }

  if (slot === "changeTarget") {
    const groups = [
      ["先平静下来", "重新坐回书桌前", "停止拿自己和别人比"],
      ["先完成一个小任务", "把任务拆到能开始", "不再用低效否定自己"],
      ["先承认自己还想重来", "先把今天稳住", "先恢复每天打开书的动作"]
    ];
    return groups[variant % groups.length];
  }

  const groups = [
    ["平静下来，我一定可以", "先坐回来，再谈效率", "能开始一点，就在恢复"],
    ["不是你不行，是还没缓过来", "先稳住，再重新开始", "回来这一步已经很重要"],
    ["别急着证明，先回来", "今天能开始，就不算输", "先把自己从慌里拉回来"]
  ];
  return groups[variant % groups.length];
}

function normalizeOutputSpec(value: unknown, mode: ContentMode) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    duration: asString(record.duration, mode === "video" ? "60 秒" : ""),
    wordCount: asString(record.wordCount, mode === "graphic" ? "800 字" : ""),
    structure: asString(record.structure, "经历 + 方法 + 行动"),
    platform: asString(record.platform, "小红书"),
    publishGoal: asString(record.publishGoal, "收藏和评论")
  };
}

function buildVideoOutput(params: {
  idea: string;
  goal: DirectorGoal;
  tone: DirectorTone;
  outputSpec: ReturnType<typeof normalizeOutputSpec>;
  anchor: string;
  middle: string;
  proof: string;
  action: string;
  revisionRequests: string[];
}) {
  const revision = params.revisionRequests.at(-1);
  const opening =
    "如果你也有一段时间完全学不进去，先别急着骂自己。真正要先恢复的，不是学习时长，而是你每天还能坐回书桌前的节奏。";
  const body =
    "我二战那段时间最崩的地方，是明明知道该学什么，但一打开书就开始怀疑自己。后来我没有再逼自己一天学十几个小时，而是先做三件很小的事。第一，把每天的任务缩到不会失败的程度。第二，只盯住当天最重要的一块，不再用别人的进度吓自己。第三，每天结束前留一句复盘：今天哪一步让我重新动起来了。";
  const ending =
    "如果你现在也卡在重启状态这一步，可以先在评论区留一句：你最难开始的是哪一科。我会按大家的问题继续拆。";

  return {
    type: "video_script",
    spec: {
      duration: params.outputSpec.duration,
      platform: params.outputSpec.platform,
      structure: params.outputSpec.structure,
      goal: GOAL_LABELS[params.goal],
      tone: TONE_LABELS[params.tone]
    },
    titleOptions: [
      "考研失败后，先别急着逼自己加时长",
      "状态崩掉时，先做这 3 个动作",
      "二战重启最重要的不是鸡血"
    ],
    timeline: [
      {
        time: "0-3s",
        role: "抓住停留",
        script: params.anchor || opening,
        visual: "正脸开场，字幕只保留一句核心判断。"
      },
      {
        time: "3-18s",
        role: "建立共鸣",
        script: opening,
        visual: "切到书桌、计划本、暂停的计时器。"
      },
      {
        time: "18-48s",
        role: "给出方法",
        script: `${params.middle} ${body}`,
        visual: "每个动作配一行大字，不要堆满屏。"
      },
      {
        time: "48-60s",
        role: "引导互动",
        script: `${params.proof} ${params.action || ending}`,
        visual: "回到正脸，结尾字幕停 1 秒。"
      }
    ],
    finalScript: `${revision ? `这版按“${revision}”调整。\n\n` : ""}${opening}\n\n${body}\n\n${ending}`,
    subtitles: ["先恢复节奏", "任务小到不会失败", "别拿别人进度吓自己", "评论区留下你最卡的一科"],
    publishChecklist: ["前 3 秒先给判断", "背景不要超过 2 句", "方法控制在 3 个动作", "结尾只问一个问题"]
  };
}

function buildGraphicOutput(params: {
  idea: string;
  goal: DirectorGoal;
  tone: DirectorTone;
  outputSpec: ReturnType<typeof normalizeOutputSpec>;
  anchor: string;
  middle: string;
  proof: string;
  action: string;
  revisionRequests: string[];
}) {
  const revision = params.revisionRequests.at(-1);
  const body =
    "考研失败后，我最怕的不是重新学一遍，而是每天坐到书桌前都会怀疑自己是不是不适合这条路。\n\n后来我发现，状态崩掉的时候，不要先给自己排特别狠的计划。计划越狠，越容易再次证明“我做不到”。真正有用的是先把节奏拉回来。\n\n第一步，把任务缩小到不会失败。不要一上来就要求自己学满十小时，先完成一件能让你重新开始的小事。\n\n第二步，只盯住今天最重要的一块。别人学到哪里不重要，你今天能不能把最该补的地方推进一点，才重要。\n\n第三步，每晚写一句复盘。不是写长篇日记，只写今天哪个动作让你重新动起来了。\n\n如果你现在也处在重启阶段，先别急着证明自己很努力。先证明自己还能回来。";

  return {
    type: "graphic_note",
    spec: {
      wordCount: params.outputSpec.wordCount,
      platform: params.outputSpec.platform,
      structure: params.outputSpec.structure,
      goal: GOAL_LABELS[params.goal],
      tone: TONE_LABELS[params.tone]
    },
    titleOptions: [
      "考研失败后，我是这样重新进入状态的",
      "状态崩掉时，别先逼自己加时长",
      "二战重启真正有用的 3 个动作"
    ],
    coverText: "先恢复节奏，再谈努力",
    body: `${revision ? `这版按“${revision}”调整。\n\n` : ""}${body}`,
    finalScript: `${revision ? `这版按“${revision}”调整。\n\n` : ""}${body}\n\n结尾可以问：你现在最难重新开始的是哪一科？`,
    tags: ["考研二战", "学习方法", "考研心态", "普通人备考"],
    publishChecklist: ["首图先给结论", "正文每段只讲一个动作", "结尾问具体问题", "标题避免泛泛焦虑"]
  };
}

function normalizeAssistantMode(value: unknown) {
  return value === "comment_direction" ? "comment_direction" : "single_comment";
}

function buildAssistantFallback(session: AgentSession): AgentRunResult {
  const assistantMode = normalizeAssistantMode(session.input.assistantMode);
  const workContext = asString(session.input.workContext);
  const comments = asString(session.input.comments);
  const text = comments || "能不能出一期在职考研如何切换工作和学习状态？";
  const sourceType = asString(
    session.input.sourceType,
    session.contentMode === "graphic" ? "图文作品" : "视频作品"
  );
  const screenshotFileNames = normalizeStringArray(session.input.screenshotFileNames).filter(
    (name) => name !== "还没有选择文件"
  );
  const missingWork = !workContext;
  const missingMaterial = !comments && !screenshotFileNames.length;

  if (missingWork || missingMaterial) {
    const nextQuestion = missingWork
      ? "选一条作品或粘贴作品内容。"
      : assistantMode === "single_comment"
        ? "只贴一条评论。"
        : "贴几条代表性评论。";

    return {
      status: "collecting",
      assistantMessage: missingWork ? "先选一条作品。" : nextQuestion,
      nextQuestion,
      draft: {},
      output: {
        assistantMode,
        assistantMessage: missingWork ? "先选一条作品。" : nextQuestion
      },
      writebackCandidates: []
    };
  }

  const candidate: MemoryCandidate = {
    category: "topic_opportunity",
    key: "comment_topic_request",
    value: {
      title: "评论区选题机会",
      summary: "用户持续关心在职考研状态切换、时间管理和低焦虑执行方法。"
    },
    reason: "评论表达了可延展成下一期内容的真实需求。",
    confidence: 0.7,
    writePolicy: "candidate_only"
  };

  return {
    status: "completed",
    assistantMessage:
      assistantMode === "single_comment"
        ? "这条评论可以延展成下一条内容。"
        : "评论区已经指向下一条内容方向。",
    draft: {},
    output: {
      assistantMode,
      workSummary: `${sourceType} 的评论重点落在“状态切换”和“低焦虑执行”上。`,
      analysis:
        assistantMode === "single_comment"
          ? {
              commentIntent: "这条评论不是随口提问，而是在请求一个能马上照做的方法。",
              audienceEmotion: "疲惫、焦虑，想重新开始但担心再次失败。",
              hiddenNeed: "用户想知道下班后怎么进入学习状态，而不是再听自律口号。",
              contentOpportunity: "可以延展成一条在职备考状态切换内容。",
              replyDirection: "先接住处境，再承诺拆具体方法。",
              nextContentDirection: "讲下班后 15 分钟内重新坐回书桌的动作。"
            }
          : {
              sectionDirection: "评论区反复在问状态切换、时间管理和低焦虑执行。",
              audienceEmotion: "大家不是不想学，而是被疲惫和失败感拖住。",
              hiddenNeed: "用户需要一套下班后还能启动的小动作。",
              contentOpportunity: "下一条内容可以专门回应在职备考如何重新进入状态。",
              replyDirection: "优先回复最具体的问题，把它置顶成下一期入口。",
              nextContentDirection: "做一条“下班后学不进去怎么办”的内容。"
            },
      layers: [
        {
          type: assistantMode === "single_comment" ? "高价值评论" : "高频方向",
          quote: text,
          action:
            assistantMode === "single_comment"
              ? "优先回复，并进入下一期选题池。"
              : "整理成下一条内容的主线。"
        }
      ],
      risks: [],
      commentStrategy: {
        priority:
          assistantMode === "single_comment"
            ? "先回复能延展成选题的问题"
            : "先抓反复出现的问题",
        replyGoal: "把真实问题接成下一期内容入口",
        tone: "先共情，再给一个明确承诺",
        avoid: ["不要只回复“下期安排”", "不要直接反驳负面评论"],
        nextMove:
          assistantMode === "single_comment"
            ? "把这条问题整理成一条新内容"
            : "把评论区高频问题整理成一条新内容"
      },
      replySuggestions: [
        "你这个问题特别真实，我自己二战时最难的也不是学不会，而是每天都很难重新进入状态。后面我整理一套更适合在职备考的切换方法。"
      ],
      nextTopics: ["在职考研如何切换工作和学习状态"]
    },
    writebackCandidates: [candidate]
  };
}

function buildDoctorFallback(session: AgentSession): AgentRunResult {
  const isGraphic = session.contentMode === "graphic";
  const notes = asString(
    session.input.notes,
    isGraphic ? "首图先讲背景，第二屏才进入方法，收藏高但评论少。" : "15 秒后开始讲背景，留存下降明显。"
  );
  const candidate: MemoryCandidate = {
    category: "performance_pattern",
    key: isGraphic ? "graphic_late_value_drop" : "early_context_drop",
    value: {
      title: isGraphic ? "图文价值点出现偏晚" : "前段背景铺陈掉点",
      summary: isGraphic
        ? "图文首屏如果先铺经历，读者不容易立刻判断是否值得收藏；下次应把结论或模板价值提前。"
        : "视频前 15 秒后如果进入长背景，留存容易下滑；下次应先给结论或动作。"
    },
    reason: "来自本次复盘，需要未来更多内容验证后再自动写入长期规则。",
    confidence: 0.68,
    writePolicy: "candidate_only"
  };

  return {
    status: "completed",
    assistantMessage: isGraphic
      ? "这次先看首图、正文结构和互动转化，给出下一版图文修改方向。"
      : "这次复盘先按半自动材料定位掉点，重点给出下一版脚本修改方向。",
    draft: {},
    output: isGraphic
      ? {
          mainIssue: "价值点出现偏晚，读者要滑到第二屏后才知道这篇为什么值得收藏。",
          evidence: notes,
          timeline: [
            { label: "首图", title: "判断不够快", description: "首屏需要先给结论、模板或结果，不要先铺长经历。" },
            { label: "正文前段", title: "方法进入偏慢", description: "经历可以保留，但要压成一句后马上给动作。" },
            { label: "结尾", title: "互动问题需要更具体", description: "不要泛泛问感受，直接问读者最卡的科目或时间段。" }
          ],
          actions: ["首图先给可收藏结论", "正文前三段直接给步骤", "经历压缩成一句证明可信度", "结尾问一个具体问题"]
        }
      : {
          mainIssue: "前 15 秒后信息密度下降，背景铺陈让观众流失。",
          evidence: notes,
          timeline: [
            { label: "0s - 5s", title: "身份建立", description: "真实经历能建立信任。" },
            { label: "15s - 22s", title: "明显掉点", description: "开始铺背景后信息密度下降。" },
            { label: "28s - 45s", title: "方法段回升", description: "具体动作出现后更适合保留。" }
          ],
          actions: ["把结论提前到前 8 秒", "背景只保留一句", "方法部分改成 3 个短动作", "结尾引导评论区说出卡点"]
        },
    writebackCandidates: [candidate]
  };
}

function buildProfileFallback(session: AgentSession, profile: CreatorProfile): AgentRunResult {
  const candidate: MemoryCandidate = {
    category: "style",
    key: "profile_declared_style",
    value: {
      title: "用户主动声明的表达风格",
      summary: asString(session.input.style, String(profile.style.tone ?? "陪伴感 + 方法论"))
    },
    reason: "用户在个人画像中主动提供，适合写入长期画像。",
    confidence: 0.9,
    writePolicy: "user_confirmed"
  };

  return {
    status: "completed",
    assistantMessage: "画像信息已整理成可复用记忆。",
    draft: {},
    output: {
      summary: "基础画像已更新，可继续被 Director、Doctor 和 Assistant 使用。"
    },
    writebackCandidates: [candidate]
  };
}

export function normalizeRunResult(value: Record<string, unknown>, fallback: AgentRunResult): AgentRunResult {
  const fallbackSlots = fallback.slots ?? normalizeDirectorSlots(fallback.draft.directorSlots);
  const rawDraft =
    typeof value.draft === "object" && value.draft
      ? (value.draft as Record<string, unknown>)
      : {};
  const hasDirectorSlots = Boolean(value.slots || rawDraft.directorSlots || fallback.slots || fallback.draft.directorSlots);
  const slots = hasDirectorSlots
    ? enforceDirectorLinearity(normalizeDirectorSlots(value.slots ?? rawDraft.directorSlots, fallbackSlots))
    : undefined;
  const rawNextSlot = value.nextSlot ?? rawDraft.nextSlot;
  const nextSlot = slots ? normalizeDirectorSlotKey(rawNextSlot, slots) : undefined;
  const rawSuggestions = normalizeSuggestions(value.suggestions ?? rawDraft.suggestions);
  const rawNextSlotMatches =
    rawNextSlot === nextSlot || (!rawNextSlot && nextSlot === fallback.nextSlot);
  const suggestions =
    nextSlot && slots?.[nextSlot]?.status !== "ready"
      ? rawNextSlotMatches && rawSuggestions.length
        ? rawSuggestions
        : fallbackSuggestions(nextSlot, "", "video")
      : [];
  const draft =
    typeof value.draft === "object" && value.draft
      ? mergeDraft(rawDraft, fallback.draft)
      : fallback.draft;
  const output =
    typeof value.output === "object" && value.output
      ? { ...fallback.output, ...(value.output as Record<string, unknown>) }
      : fallback.output;
  const status =
    value.status === "collecting" || value.status === "ready" || value.status === "completed"
      ? value.status
      : fallback.status;
  const guardedStatus =
    slots && status === "completed" && !directorAllReady(slots)
      ? "collecting"
      : status;
  const assistantMessage = asString(value.assistantMessage, fallback.assistantMessage);
  const nextQuestion =
    guardedStatus === "collecting" && nextSlot
      ? rawNextSlotMatches
        ? asString(value.nextQuestion, linearFallbackQuestion(nextSlot, slots?.[nextSlot]?.status ?? "empty"))
        : linearFallbackQuestion(nextSlot, slots?.[nextSlot]?.status ?? "empty")
      : undefined;

  return {
    status: guardedStatus,
    assistantMessage,
    nextQuestion,
    nextSlot: nextSlot ?? fallback.nextSlot,
    suggestions: suggestions.length ? suggestions : fallback.suggestions,
    slots: slots ?? fallback.slots,
    draft: slots
      ? {
          ...draft,
          directorSlots: slots,
          nextSlot: nextSlot ?? null,
          suggestions: suggestions.length ? suggestions : fallback.suggestions ?? []
        }
      : draft,
    output,
    writebackCandidates: normalizeMemoryCandidates(value.writebackCandidates, fallback.writebackCandidates)
  };
}

function normalizeMemoryCandidates(value: unknown, fallback: MemoryCandidate[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const candidates = value
    .map((item, index): MemoryCandidate | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const category = normalizeMemoryCategory(record.category);
      const title = asString(record.title, asString(record.key, `${category}_${index + 1}`));
      const body = asString(
        record.body,
        record.value && typeof record.value === "object"
          ? asString((record.value as Record<string, unknown>).summary, asString((record.value as Record<string, unknown>).body))
          : ""
      );
      const valueRecord =
        record.value && typeof record.value === "object" && !Array.isArray(record.value)
          ? (record.value as Record<string, unknown>)
          : {
              title,
              summary: body || title
            };

      return {
        category,
        key: asString(record.key, title.replace(/\s+/g, "_").slice(0, 48)),
        value: valueRecord,
        reason: asString(record.reason, "本次任务中出现了可复用信号。"),
        confidence: typeof record.confidence === "number" ? record.confidence : 0.72,
        writePolicy: normalizeWritePolicy(record.writePolicy)
      };
    })
    .filter((item): item is MemoryCandidate => Boolean(item));

  return candidates.length ? candidates : fallback;
}

function normalizeMemoryCategory(value: unknown): MemoryCategory {
  if (
    value === "identity" ||
    value === "audience" ||
    value === "style" ||
    value === "content_rule" ||
    value === "performance_pattern" ||
    value === "comment_insight" ||
    value === "topic_opportunity" ||
    value === "risk"
  ) {
    return value;
  }

  if (value === "audience_insight") {
    return "audience";
  }

  return "content_rule";
}

function normalizeWritePolicy(value: unknown): WritePolicy {
  if (value === "user_confirmed" || value === "repeated_signal" || value === "candidate_only") {
    return value;
  }

  return "candidate_only";
}

function mergeDraft(
  draft: Record<string, unknown>,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const fallbackCards = Array.isArray(fallback.cards) ? fallback.cards : [];
  const draftCards = Array.isArray(draft.cards) ? draft.cards : [];
  const fallbackHooks = Array.isArray(fallback.hooks) ? fallback.hooks : [];
  const draftHooks = Array.isArray(draft.hooks) ? draft.hooks : [];

  return {
    ...fallback,
    ...draft,
    intro: asString(draft.intro, asString(fallback.intro)),
    cards: draftCards.length >= fallbackCards.length ? draftCards : fallbackCards,
    hooks: draftHooks.length ? draftHooks : fallbackHooks
  };
}

export function normalizeContentMode(value: unknown): ContentMode {
  return value === "graphic" ? "graphic" : "video";
}
