import { loadBrain, summarizeBrainForPrompt } from "@/lib/agent/brain";
import { callJsonModel } from "@/lib/agent/llm";
import {
  buildFallbackRun,
  getModuleSystemPrompt,
  normalizeRunResult
} from "@/lib/agent/module-configs";
import { getStore, upsertSession } from "@/lib/agent/store";
import { AgentRunResult, AgentSession, ArtifactRecord, CreatorProfile } from "@/lib/agent/types";

export async function runAgentSession(
  session: AgentSession,
  profile: CreatorProfile
): Promise<AgentSession> {
  const brain = await loadBrain(profile);
  const store = await getStore();
  const artifacts = store.artifacts.filter((artifact) => session.artifactIds.includes(artifact.id));
  const promptArtifacts =
    session.module === "doctor" ? artifacts.map(stripVisualDataFromArtifact) : artifacts;
  const fallback = buildFallbackRun(session, profile);
  const visualInputs = session.module === "doctor" ? buildVisualInputs(artifacts) : [];

  const rawResult = await callJsonModel({
    system: `${getModuleSystemPrompt(session.module)}
必须返回如下 JSON 字段：
${resultSchemaForModule(session.module)}`,
    user: {
      brain: summarizeBrainForPrompt(brain.profile),
      recentMemories: brain.memories.slice(0, 8),
      session,
      artifacts: promptArtifacts,
      visualInputs: visualInputs.map((item) => ({
        label: item.label
      }))
    },
    fallback,
    images: visualInputs
  });
  const result = normalizeRunResult(
    rawResult,
    fallback
  );

  if (session.module === "doctor" && typeof rawResult.__aiStatus === "string") {
    result.output = {
      ...result.output,
      _aiStatus: rawResult.__aiStatus
    };
  }

  const nextSession = mergeRunIntoSession(session, result);
  return upsertSession(nextSession);
}

function stripVisualDataFromArtifact(artifact: ArtifactRecord): ArtifactRecord {
  if (!artifact.extractedJson?.visualDataUrl) {
    return artifact;
  }

  const { visualDataUrl: _visualDataUrl, ...extractedJson } = artifact.extractedJson;

  return {
    ...artifact,
    extractedJson
  };
}

function buildVisualInputs(artifacts: ArtifactRecord[]) {
  return artifacts
    .map((artifact) => {
      const dataUrl =
        artifact.extractedJson &&
        typeof artifact.extractedJson.visualDataUrl === "string" &&
        artifact.extractedJson.visualDataUrl.startsWith("data:image/")
          ? artifact.extractedJson.visualDataUrl
          : "";

      if (!dataUrl) {
        return null;
      }

      const role =
        artifact.extractedJson && typeof artifact.extractedJson.visualRole === "string"
          ? artifact.extractedJson.visualRole
          : artifact.kind;
      const frameTime =
        artifact.extractedJson && typeof artifact.extractedJson.frameTimeSeconds === "number"
          ? ` @ ${artifact.extractedJson.frameTimeSeconds}s`
          : "";
      const sourceFile =
        artifact.extractedJson && typeof artifact.extractedJson.sourceFileName === "string"
          ? ` from ${artifact.extractedJson.sourceFileName}`
          : "";
      const frameSource =
        artifact.extractedJson && typeof artifact.extractedJson.frameSelectionSource === "string"
          ? ` frameSelectionSource=${artifact.extractedJson.frameSelectionSource}`
          : "";
      const frameReason =
        artifact.extractedJson && typeof artifact.extractedJson.frameSelectionReason === "string"
          ? ` reason=${artifact.extractedJson.frameSelectionReason}`
          : "";

      return {
        dataUrl,
        label: `${role}${frameTime}${sourceFile}${frameSource}${frameReason}: ${artifact.fileName}`
      };
    })
    .filter((item): item is { dataUrl: string; label: string } => Boolean(item))
    .slice(0, 8);
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

  if (module === "doctor") {
    return `{
  "status": "completed",
  "assistantMessage": "给用户看的简短说明",
  "nextQuestion": "",
  "draft": {},
  "output": {
    "mainIssue": "这条作品当前最该优先修正的问题",
    "evidence": "引用用户填写的说明、关键时间点、数据或文件名作为判断依据",
    "timeline": [{ "label": "片段或位置", "title": "这一段的问题或优势", "description": "具体判断" }],
    "actions": ["下一版具体怎么改"],
    "rewrittenScript": null
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
