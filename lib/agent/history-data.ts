import { getOrCreateProfile, getProfileForRead } from "@/lib/agent/identity";
import { getStore } from "@/lib/agent/store";
import { AgentSession, BrainMemoryEntry } from "@/lib/agent/types";

type RecordModule = Exclude<AgentSession["module"], "profile">;

export type HistoryEntry = {
  id: string;
  module: RecordModule;
  moduleLabel: string;
  title: string;
  status: string;
  updatedAt: string;
  summary: string;
  href: string;
  artifacts: Array<{ id: string; kind: string; fileName: string }>;
  writebacks: Array<{ id: string; category: string; summary: string }>;
};

export async function getHistoryData(options: { createProfile?: boolean } = {}): Promise<{ entries: HistoryEntry[] }> {
  const profile = options.createProfile ? await getOrCreateProfile() : await getProfileForRead();
  const store = await getStore();
  const memories = store.memories.filter((memory) => memory.profileId === profile.id);
  const artifacts = store.artifacts.filter((artifact) => artifact.profileId === profile.id);
  const sessions = store.sessions
    .filter((session): session is AgentSession & { module: RecordModule } =>
      session.profileId === profile.id && session.module !== "profile"
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    entries: sessions.map((session) => {
      const sessionMemories = memories.filter((memory) => memory.sourceSessionId === session.id);
      const sessionArtifacts = artifacts.filter((artifact) => session.artifactIds.includes(artifact.id));

      return {
        id: session.id,
        module: session.module,
        moduleLabel: moduleLabel(session.module),
        title: sessionTitle(session),
        status: session.status,
        updatedAt: session.updatedAt,
        summary: sessionSummary(session),
        href: `${moduleHref(session.module)}?sessionId=${encodeURIComponent(session.id)}`,
        artifacts: sessionArtifacts.map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          fileName: artifact.fileName
        })),
        writebacks: sessionMemories.map((memory) => ({
          id: memory.id,
          category: memory.category,
          summary: memorySummary(memory)
        }))
      };
    })
  };
}

function moduleLabel(module: AgentSession["module"]) {
  return {
    director: "脚本创作",
    doctor: "内容复盘",
    assistant: "评论处理",
    profile: "个人画像"
  }[module];
}

function moduleHref(module: AgentSession["module"]) {
  return {
    director: "/director",
    doctor: "/doctor",
    assistant: "/assistant",
    profile: "/profile"
  }[module];
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

  return moduleLabel(session.module);
}

function sessionSummary(session: AgentSession) {
  const output = session.output as Record<string, unknown>;

  if (typeof output.finalScript === "string") {
    return output.finalScript.slice(0, 120);
  }

  if (typeof output.mainIssue === "string") {
    return output.mainIssue;
  }

  if (typeof output.assistantMessage === "string") {
    return output.assistantMessage;
  }

  if (typeof session.input.comments === "string") {
    return session.input.comments.slice(0, 120);
  }

  return session.status === "completed" ? "已完成" : "进行中";
}

function memorySummary(memory: BrainMemoryEntry) {
  return String(memory.value.summary ?? memory.value.body ?? memory.value.title ?? memory.key);
}
