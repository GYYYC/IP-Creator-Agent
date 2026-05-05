import { loadBrain } from "@/lib/agent/brain";
import { getOrCreateProfile, getProfileForRead } from "@/lib/agent/identity";
import { getSessionsByProfile } from "@/lib/agent/store";
import { AgentSession, BrainMemoryEntry } from "@/lib/agent/types";

type WorkSession = AgentSession & { module: Exclude<AgentSession["module"], "profile"> };

export type DashboardTask = {
  title: string;
  detail: string;
  href: string;
  action: string;
};

export type DashboardSignal = {
  label: string;
  value: string;
};

export type DashboardData = {
  tasks: DashboardTask[];
  signals: DashboardSignal[];
  recentItems: Array<{
    id: string;
    moduleLabel: string;
    title: string;
    content: string;
    href: string;
  }>;
  nextStep: DashboardTask;
  profileSnapshot: {
    title: string;
    subtitle: string;
    tags: string[];
    highlightTitle: string;
    highlightBody: string;
  };
};

export function emptyDashboardData(): DashboardData {
  return {
    tasks: [
      {
        title: "数据库暂时不可用",
        detail: "当前数据库流量额度已满，页面先进入保护模式。额度恢复后会重新显示历史数据。",
        href: "/profile",
        action: "查看画像"
      },
      {
        title: "继续完善内容",
        detail: "可以先检查环境额度或清理旧素材大字段，再继续使用创作流程。",
        href: "/director",
        action: "去创作"
      },
      {
        title: "稍后再看历史",
        detail: "历史数据没有被前端删除，只是数据库现在拒绝读取。",
        href: "/history",
        action: "去记录"
      }
    ],
    signals: [
      { label: "当前状态", value: "数据库额度已满" },
      { label: "历史数据", value: "等待数据库恢复读取" },
      { label: "建议动作", value: "清理大图字段或升级额度" },
      { label: "页面保护", value: "已避免直接崩页" }
    ],
    recentItems: [],
    nextStep: {
      title: "先恢复数据库读取",
      detail: "执行清理 SQL 或等待额度重置后，历史记录会重新显示。",
      href: "/history",
      action: "查看记录"
    },
    profileSnapshot: {
      title: "个人画像暂时无法读取",
      subtitle: "数据库额度已满",
      tags: ["保护模式"],
      highlightTitle: "数据没有被前端删除",
      highlightBody: "这是数据库拒绝读取导致的临时不可见。"
    }
  };
}

export async function getDashboardData(options: { createProfile?: boolean } = {}): Promise<DashboardData> {
  const profile = options.createProfile ? await getOrCreateProfile() : await getProfileForRead();
  const brain = await loadBrain(profile);
  const sessions = (await getSessionsByProfile(profile.id, 24))
    .filter((session): session is WorkSession =>
      session.profileId === profile.id && session.module !== "profile"
    );
  const memories = brain.memories;

  return {
    tasks: buildTasks(sessions, memories),
    signals: buildSignals(profile.brainSnapshot.notes, sessions, memories),
    recentItems: buildRecentItems(sessions, memories),
    nextStep: buildNextStep(sessions, memories),
    profileSnapshot: buildProfileSnapshot(profile)
  };
}

function buildProfileSnapshot(profile: Awaited<ReturnType<typeof getProfileForRead>>) {
  const notes = profile.brainSnapshot.notes;
  const role = asString(profile.identity.role) || profile.brainSnapshot.title;
  const audience = asString(profile.audience.target) || profile.brainSnapshot.subtitle;
  const tone = asString(profile.style.tone);
  const proof = asString(profile.identity.proof);
  const platform = normalizeStringList(profile.platform.primary).join(" / ");
  const formats = normalizeStringList(profile.platform.formats).join("与");
  const tags = [
    ...splitTags(tone),
    ...normalizeStringList(profile.platform.primary),
    ...normalizeStringList(profile.brainSnapshot.tags)
  ];
  const uniqueTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 3);

  return {
    title: role || "还没有填写长期定位",
    subtitle: [audience, [platform, formats].filter(Boolean).join(" · ")].filter(Boolean).join(" · "),
    tags: uniqueTags.length ? uniqueTags : ["先完善画像"],
    highlightTitle: notes[0]?.title ?? "当前定位",
    highlightBody: proof || notes[0]?.body || "去个人画像里补充定位后，这里会同步更新。"
  };
}

function buildTasks(sessions: WorkSession[], memories: BrainMemoryEntry[]) {
  const latestTopic = findMemory(memories, "topic_opportunity");
  const latestRisk = findMemory(memories, "performance_pattern") ?? findMemory(memories, "risk");
  const hasDirectorDraft = sessions.some(
    (session) => session.module === "director" && session.status === "completed"
  );

  return [
    {
      title: latestTopic ? "把评论里的问题写成新内容" : "先写一条新内容",
      detail: latestTopic
        ? memorySummary(latestTopic)
        : "围绕最近最想讲的经历，先产出一版可发布脚本。",
      href: "/director",
      action: hasDirectorDraft ? "继续写" : "开始写"
    },
    {
      title: latestRisk ? "复盘最近的掉点" : "复盘一条表现波动的内容",
      detail: latestRisk
        ? memorySummary(latestRisk)
        : "上传留存截图或关键时间点，先确认哪里需要改。",
      href: "/doctor",
      action: "去复盘"
    },
    {
      title: "处理评论区",
      detail: "先找出能变成下一期选题的问题，再决定置顶和回复。",
      href: "/assistant",
      action: "去处理"
    }
  ];
}

function buildSignals(
  notes: Array<{ title: string; body: string }>,
  sessions: WorkSession[],
  memories: BrainMemoryEntry[]
) {
  const latestDirector = sessions.find((session) => session.module === "director");
  const latestAssistant = sessions.find((session) => session.module === "assistant");
  const latestRule = findMemory(memories, "content_rule") ?? findMemory(memories, "performance_pattern");

  return [
    { label: "当前路线", value: notes[0]?.body ?? "先稳定定位" },
    { label: "最近成稿", value: latestDirector ? sessionTitle(latestDirector) : "还没有新脚本" },
    { label: "评论机会", value: latestAssistant ? sessionTitle(latestAssistant) : "等待评论输入" },
    { label: "下次规则", value: latestRule ? memorySummary(latestRule) : notes[3]?.body ?? "先给结论" }
  ];
}

function buildRecentItems(sessions: WorkSession[], _memories: BrainMemoryEntry[]) {
  return sessions.slice(0, 4).map((session) => ({
    id: session.id,
    moduleLabel: moduleLabel(session.module),
    title: sessionTitle(session),
    content: sessionSummary(session),
    href: `${moduleHref(session.module)}?sessionId=${encodeURIComponent(session.id)}`
  }));
}

function buildNextStep(sessions: WorkSession[], memories: BrainMemoryEntry[]) {
  const latestTopic = findMemory(memories, "topic_opportunity");
  const latestRisk = findMemory(memories, "performance_pattern") ?? findMemory(memories, "risk");

  if (latestTopic) {
    return {
      title: "先把评论需求变成下一条内容",
      detail: memorySummary(latestTopic),
      href: "/director",
      action: "去写脚本"
    };
  }

  if (latestRisk) {
    return {
      title: "先改最容易掉人的位置",
      detail: memorySummary(latestRisk),
      href: "/doctor",
      action: "去复盘"
    };
  }

  if (!sessions.length) {
    return {
      title: "先完成一条可发布内容",
      detail: "从一个真实经历开始，补齐问题后拿到完整稿。",
      href: "/director",
      action: "开始写"
    };
  }

  return {
    title: "继续处理最近一条记录",
    detail: sessionTitle(sessions[0]),
    href: `${moduleHref(sessions[0].module)}?sessionId=${encodeURIComponent(sessions[0].id)}`,
    action: "继续"
  };
}

function findMemory(memories: BrainMemoryEntry[], category: BrainMemoryEntry["category"]) {
  return memories.find((memory) => memory.category === category);
}

function memorySummary(memory: BrainMemoryEntry) {
  return String(memory.value.summary ?? memory.value.body ?? memory.value.title ?? memory.key);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function splitTags(value: string) {
  return value
    .split(/[、，,；;+\n/·]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sessionTitle(session: AgentSession) {
  const output = session.output as Record<string, unknown>;
  const titleOptions = Array.isArray(output.titleOptions) ? output.titleOptions : [];
  const nextTopics = Array.isArray(output.nextTopics) ? output.nextTopics : [];

  if (typeof titleOptions[0] === "string") {
    return titleOptions[0];
  }

  if (typeof nextTopics[0] === "string") {
    return nextTopics[0];
  }

  if (nextTopics[0] && typeof nextTopics[0] === "object") {
    const topic = nextTopics[0] as Record<string, unknown>;
    if (typeof topic.title === "string") {
      return topic.title;
    }
  }

  if (typeof output.mainIssue === "string") {
    return output.mainIssue;
  }

  if (typeof session.input.idea === "string") {
    return session.input.idea;
  }

  return `${moduleLabel(session.module)} · ${session.status === "completed" ? "已完成" : "进行中"}`;
}

function sessionSummary(session: AgentSession) {
  const output = session.output as Record<string, unknown>;

  if (typeof output.finalScript === "string") {
    return output.finalScript.slice(0, 88);
  }

  if (typeof output.mainIssue === "string") {
    return output.mainIssue;
  }

  if (typeof output.assistantMessage === "string") {
    return output.assistantMessage;
  }

  if (typeof session.input.comments === "string") {
    return session.input.comments.slice(0, 88);
  }

  return session.status === "completed" ? "已完成" : "还在处理";
}

function moduleHref(module: WorkSession["module"]) {
  return {
    director: "/director",
    doctor: "/doctor",
    assistant: "/assistant"
  }[module];
}

function moduleLabel(module: AgentSession["module"]) {
  return {
    director: "脚本创作",
    doctor: "内容复盘",
    assistant: "评论处理",
    profile: "个人画像"
  }[module];
}
