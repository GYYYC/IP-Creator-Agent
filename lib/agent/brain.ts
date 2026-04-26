import { createId } from "@/lib/agent/identity";
import { getStore, insertMemory, upsertProfile } from "@/lib/agent/store";
import {
  AgentModule,
  BrainMemoryEntry,
  CreatorProfile,
  MemoryCandidate
} from "@/lib/agent/types";

const MAX_BRAIN_NOTES = 8;

export async function loadBrain(profile: CreatorProfile) {
  const store = await getStore();
  const memories = store.memories
    .filter((item) => item.profileId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    profile,
    memories,
    snapshot: profile.brainSnapshot
  };
}

export function summarizeBrainForPrompt(profile: CreatorProfile) {
  return {
    identity: profile.identity,
    audience: profile.audience,
    style: profile.style,
    platform: profile.platform,
    memory: profile.brainSnapshot.notes.map((note) => ({
      category: note.category,
      title: note.title,
      body: note.body
    }))
  };
}

export function isSafeForAutomaticWriteback(candidate: MemoryCandidate) {
  return candidate.writePolicy !== "candidate_only" && candidate.confidence >= 0.75;
}

export async function applyMemoryCandidates(params: {
  profile: CreatorProfile;
  module: AgentModule;
  sessionId: string;
  artifactIds: string[];
  candidates: MemoryCandidate[];
  confirmedOnly?: boolean;
}) {
  const now = new Date().toISOString();
  const accepted = params.candidates.filter((candidate) =>
    params.confirmedOnly ? true : isSafeForAutomaticWriteback(candidate)
  );

  const entries: BrainMemoryEntry[] = [];
  for (const candidate of accepted) {
    entries.push(
      await insertMemory({
        id: createId("mem"),
        profileId: params.profile.id,
        category: candidate.category,
        key: candidate.key,
        value: candidate.value,
        sourceModule: params.module,
        sourceSessionId: params.sessionId,
        sourceArtifactIds: params.artifactIds,
        confidence: candidate.confidence,
        writePolicy: params.confirmedOnly ? "user_confirmed" : candidate.writePolicy,
        createdAt: now
      })
    );
  }

  if (entries.length > 0) {
    const nextNotes = dedupeNotes([
      ...entries.map((entry) => ({
        title: String(entry.value.title ?? entry.key),
        body: String(entry.value.summary ?? entry.value.body ?? ""),
        category: entry.category
      })),
      ...params.profile.brainSnapshot.notes
    ]).slice(0, MAX_BRAIN_NOTES);

    await upsertProfile({
      ...params.profile,
      brainSnapshot: {
        ...params.profile.brainSnapshot,
        notes: nextNotes
      },
      updatedAt: now
    });
  }

  return entries;
}

function dedupeNotes(notes: CreatorProfile["brainSnapshot"]["notes"]) {
  const seen = new Set<string>();

  return notes.filter((note) => {
    const key = `${note.category}:${note.title.trim()}:${note.body.trim()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
