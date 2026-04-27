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
${resultSchemaForModule(session.module)}`,
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

function resultSchemaForModule(module: AgentSession["module"]) {
  if (module === "director") {
    return `{
  "status": "collecting|ready|completed",
  "assistantMessage": "给用户看的简短说明",
  "nextQuestion": "如果还需要追问，给出下一问；否则为空字符串",
  "nextSlot": "rootProblem|changeTarget|corePromise|null",
  "replyType": "answer|confused|unknown|ask_options|revision|off_track",
  "nextAction": "ask|offer_options|draft",
  "suggestions": [],
  "slots": {
    "rootProblem": { "status": "empty|partial|ready", "value": "", "confidence": 0, "missing": [], "evidence": [] },
    "changeTarget": { "status": "empty|partial|ready", "value": "", "confidence": 0, "missing": [], "evidence": [] },
    "corePromise": { "status": "empty|partial|ready", "value": "", "confidence": 0, "missing": [], "evidence": [] }
  },
  "draft": {},
  "output": {},
  "writebackCandidates": []
}`;
  }

  if (module === "assistant") {
    return `{
  "status": "collecting|completed",
  "assistantMessage": "给用户看的简短说明",
  "nextQuestion": "如果还需要补材料，给出下一句；否则为空字符串",
  "draft": {},
  "output": {
    "assistantMode": "single_comment|comment_direction",
    "workSummary": "一句话概括作品上下文",
    "analysis": {
      "commentIntent": "",
      "audienceEmotion": "",
      "hiddenNeed": "",
      "contentOpportunity": "",
      "replyDirection": "",
      "nextContentDirection": "",
      "sectionDirection": ""
    },
    "layers": [{ "type": "", "quote": "", "action": "" }],
    "risks": [],
    "commentStrategy": {
      "priority": "",
      "replyGoal": "",
      "tone": "",
      "directions": [],
      "avoid": [],
      "nextMove": ""
    },
    "replySuggestions": [],
    "nextTopics": []
  },
  "writebackCandidates": []
}`;
  }

  return `{
  "status": "collecting|ready|completed",
  "assistantMessage": "给用户看的简短说明",
  "nextQuestion": "如果还需要追问，给出下一问；否则为空字符串",
  "draft": {},
  "output": {},
  "writebackCandidates": []
}`;
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
