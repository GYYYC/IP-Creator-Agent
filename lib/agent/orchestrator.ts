import { loadBrain, summarizeBrainForPrompt } from "@/lib/agent/brain";
import { callJsonModel } from "@/lib/agent/llm";
import {
  buildFallbackRun,
  getModuleSystemPrompt,
  normalizeRunResult
} from "@/lib/agent/module-configs";
import { getStore, upsertSession } from "@/lib/agent/store";
import { AgentRunResult, AgentSession, CreatorProfile } from "@/lib/agent/types";

export async function runAgentSession(
  session: AgentSession,
  profile: CreatorProfile
): Promise<AgentSession> {
  const brain = await loadBrain(profile);
  const store = await getStore();
  const artifacts = store.artifacts.filter((artifact) => session.artifactIds.includes(artifact.id));
  const fallback = buildFallbackRun(session, profile);

  const result = normalizeRunResult(
    await callJsonModel({
      system: `${getModuleSystemPrompt(session.module)}
必须返回如下 JSON 字段：
{
  "status": "collecting|ready|completed",
  "assistantMessage": "给用户看的简短说明",
  "nextQuestion": "如果还需要追问，给出下一问；否则为空字符串",
  "draft": {},
  "output": {},
  "writebackCandidates": []
}`,
      user: {
        brain: summarizeBrainForPrompt(brain.profile),
        recentMemories: brain.memories.slice(0, 8),
        session,
        artifacts
      },
      fallback
    }),
    fallback
  );

  const nextSession = mergeRunIntoSession(session, result);
  return upsertSession(nextSession);
}

function mergeRunIntoSession(session: AgentSession, result: AgentRunResult): AgentSession {
  const now = new Date().toISOString();
  const askedQuestions =
    result.nextQuestion && !session.askedQuestions.includes(result.nextQuestion)
      ? [...session.askedQuestions, result.nextQuestion]
      : session.askedQuestions;

  return {
    ...session,
    status: result.status,
    askedQuestions,
    draft: result.draft,
    output: {
      ...result.output,
      assistantMessage: result.assistantMessage
    },
    writebackCandidates: result.writebackCandidates,
    updatedAt: now
  };
}
