import {
  AgentRunResult,
  AgentSession,
  ContentMode,
  CreatorProfile,
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

export const FOLLOWUP_BUDGET = {
  director: 5,
  assistant: 1,
  doctor: 2,
  profile: 0
} as const;

export function getModuleSystemPrompt(module: string) {
  const shared =
    "你是 IP Creator Agent 的编排器。只输出 JSON，不要 markdown。长期画像只能沉淀稳定、可复用、可解释的洞察，单次任务结论放入 session output。";

  if (module === "director") {
    return `${shared} 当前模块是 Director。你需要用 2 到 5 轮有限追问补齐内容，不要机械问满；信息足够后输出完整可发布稿，不要只给提纲。每次只问一个核心问题，可以带 3 到 4 个短选项，但选项必须完整表达含义，不要只输出 A/B/C。必须尊重 session.input.outputSpec：视频按目标时长写分段口播，图文按目标字数写完整正文。draft 必须包含 intro、cards、hooks；cards 必须是 3 个对象，视频对应开头/中段/结尾，图文对应标题方向/正文结构/结尾引导。output 必须包含 finalScript、titleOptions、publishChecklist；视频还要包含 timeline 和 subtitles，图文还要包含 coverText、body、tags。若 session.input.revisionRequests 有内容，直接解释或改写当前完整稿，不要重新追问。不要把“能给我选项吗”这类辅助请求写进草稿。writebackCandidates 只能是候选，不要把单次选题当成长期画像。`;
  }

  if (module === "assistant") {
    return `${shared} 当前模块是 Assistant。你需要根据 session.contentMode 判断这批评论来自图文还是视频，分析评论文本和评论截图材料，输出评论分层、高价值评论、风险、回复建议、评论区引导方向 commentStrategy 和下一期选题。高频需求可作为候选写回。`;
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

function buildDirectorFallback(session: AgentSession): AgentRunResult {
  const idea = asString(session.input.idea, "围绕一个真实经历做一条内容。");
  const goal = (asString(session.input.goal, "connect") as DirectorGoal) || "connect";
  const tone = (asString(session.input.tone, "warm") as DirectorTone) || "warm";
  const mode = session.contentMode;
  const outputSpec = normalizeOutputSpec(session.input.outputSpec, mode);
  const revisionRequests = Array.isArray(session.input.revisionRequests)
    ? session.input.revisionRequests.filter((item): item is string => typeof item === "string")
    : [];
  const questions =
    mode === "graphic"
      ? [
          "这篇内容最想解决读者的哪个具体问题？",
          "你手里最能证明这件事的细节是什么？",
          "读者看完之后，你希望他先做哪一步？",
          "这篇内容最不能写偏的地方是什么？"
        ]
      : [
          "这条内容最想解决观众的哪个具体问题？",
          "你手里最能证明这件事的细节是什么？",
          "观众看完之后，你希望他先做哪一步？",
          "这条内容最不能拍偏的地方是什么？"
        ];

  const nextQuestion = questions[session.answers.length];
  const complete = revisionRequests.length > 0 || session.answers.length >= session.followupBudget || !nextQuestion;
  const anchor = session.answers[0] || "先把最想让人记住的一句话抛出来";
  const middle = session.answers[1] || "用真实经历承接，再给可执行方法";
  const proof = session.answers[2] || "用一个具体细节证明你真的经历过";
  const action = session.answers[3] || "引导观众把自己最卡的地方留在评论区";
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
        ? "我按你的要求改好了，下面这版可以继续调整。"
        : "这一版已经可以直接拿去发布前再过一遍。"
      : "我先补齐一个关键点，再继续整理草稿。",
    nextQuestion: complete ? undefined : nextQuestion,
    draft,
    output: complete ? output : {},
    writebackCandidates: candidates
  };
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

function buildAssistantFallback(session: AgentSession): AgentRunResult {
  const text = asString(session.input.comments, "能不能出一期在职考研如何切换工作和学习状态？");
  const modeLabel = session.contentMode === "graphic" ? "图文评论" : "视频评论";
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
    assistantMessage: "评论已经分层，优先处理能延展为下一期内容的问题。",
    draft: {},
    output: {
      layers: [
        {
          type: `${modeLabel} · 高价值评论`,
          quote: text,
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
  const draft =
    typeof value.draft === "object" && value.draft
      ? mergeDraft(value.draft as Record<string, unknown>, fallback.draft)
      : fallback.draft;

  return {
    status:
      value.status === "collecting" || value.status === "ready" || value.status === "completed"
        ? value.status
        : fallback.status,
    assistantMessage: asString(value.assistantMessage, fallback.assistantMessage),
    nextQuestion: asString(value.nextQuestion, fallback.nextQuestion),
    draft,
    output:
      typeof value.output === "object" && value.output
        ? { ...fallback.output, ...(value.output as Record<string, unknown>) }
        : fallback.output,
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
