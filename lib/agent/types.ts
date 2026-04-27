export type ContentMode = "graphic" | "video";
export type AgentModule = "director" | "doctor" | "assistant" | "profile";
export type SessionStatus = "draft" | "collecting" | "ready" | "completed";
export type ArtifactKind =
  | "video"
  | "image"
  | "retention_chart"
  | "comment_screenshot"
  | "graphic_post"
  | "history_work"
  | "text";
export type MemoryCategory =
  | "identity"
  | "audience"
  | "style"
  | "content_rule"
  | "performance_pattern"
  | "comment_insight"
  | "topic_opportunity"
  | "risk";
export type WritePolicy = "user_confirmed" | "repeated_signal" | "candidate_only";
export type DirectorSlotKey = "rootProblem" | "changeTarget" | "corePromise";
export type DirectorSlotStatus = "empty" | "partial" | "ready";

export type DirectorSlot = {
  status: DirectorSlotStatus;
  value: string;
  confidence: number;
  missing: string[];
  evidence: string[];
};

export type DirectorSlots = Record<DirectorSlotKey, DirectorSlot>;

export type CreatorProfile = {
  id: string;
  anonId: string;
  displayName: string;
  identity: Record<string, unknown>;
  audience: Record<string, unknown>;
  style: Record<string, unknown>;
  platform: Record<string, unknown>;
  brainSnapshot: BrainSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type BrainSnapshot = {
  title: string;
  subtitle: string;
  tags: string[];
  notes: Array<{
    title: string;
    body: string;
    category: MemoryCategory;
  }>;
};

export type BrainMemoryEntry = {
  id: string;
  profileId: string;
  category: MemoryCategory;
  key: string;
  value: Record<string, unknown>;
  sourceModule: AgentModule;
  sourceSessionId?: string;
  sourceArtifactIds: string[];
  confidence: number;
  writePolicy: WritePolicy;
  createdAt: string;
};

export type ArtifactRecord = {
  id: string;
  profileId: string;
  sessionId?: string;
  kind: ArtifactKind;
  mimeType: string;
  fileName: string;
  storageKey?: string;
  url?: string;
  sizeBytes?: number;
  analysisStatus: "pending" | "ready" | "failed";
  extractedText?: string;
  extractedJson?: Record<string, unknown>;
  createdAt: string;
};

export type AgentSession = {
  id: string;
  profileId: string;
  module: AgentModule;
  contentMode: ContentMode;
  status: SessionStatus;
  input: Record<string, unknown>;
  followupBudget: number;
  askedQuestions: string[];
  answers: string[];
  draft: Record<string, unknown>;
  output: Record<string, unknown>;
  writebackCandidates: MemoryCandidate[];
  artifactIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MemoryCandidate = {
  category: MemoryCategory;
  key: string;
  value: Record<string, unknown>;
  reason: string;
  confidence: number;
  writePolicy: WritePolicy;
};

export type AgentRunResult = {
  status: SessionStatus;
  assistantMessage: string;
  nextQuestion?: string;
  nextSlot?: DirectorSlotKey | null;
  suggestions?: string[];
  slots?: DirectorSlots;
  draft: Record<string, unknown>;
  output: Record<string, unknown>;
  writebackCandidates: MemoryCandidate[];
};

export type AgentStoreShape = {
  profiles: CreatorProfile[];
  memories: BrainMemoryEntry[];
  sessions: AgentSession[];
  artifacts: ArtifactRecord[];
};
