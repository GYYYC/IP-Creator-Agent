import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AgentSession,
  AgentStoreShape,
  ArtifactRecord,
  BrainMemoryEntry,
  CreatorProfile
} from "@/lib/agent/types";

const EMPTY_STORE: AgentStoreShape = {
  profiles: [],
  memories: [],
  sessions: [],
  artifacts: []
};

const storeDirectory =
  process.env.AGENT_STORE_DIR ||
  (process.env.VERCEL ? path.join("/tmp", "ip-creator-agent") : path.join(process.cwd(), ".data"));
const storePath = path.join(storeDirectory, "agent-store.json");

let writeQueue: Promise<void> = Promise.resolve();

async function readStore(): Promise<AgentStoreShape> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentStoreShape>;

    return {
      profiles: parsed.profiles ?? [],
      memories: parsed.memories ?? [],
      sessions: parsed.sessions ?? [],
      artifacts: parsed.artifacts ?? []
    };
  } catch {
    return { ...EMPTY_STORE };
  }
}

async function writeStore(store: AgentStoreShape) {
  await mkdir(storeDirectory, { recursive: true });
  writeQueue = writeQueue.then(() =>
    writeFile(storePath, JSON.stringify(store, null, 2), "utf8")
  );

  await writeQueue;
}

export async function mutateStore<T>(
  mutator: (store: AgentStoreShape) => T | Promise<T>
): Promise<T> {
  const store = await readStore();
  const result = await mutator(store);
  await writeStore(store);
  return result;
}

export async function getStore() {
  return readStore();
}

export async function upsertProfile(profile: CreatorProfile) {
  return mutateStore((store) => {
    const index = store.profiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) {
      store.profiles[index] = profile;
    } else {
      store.profiles.push(profile);
    }

    return profile;
  });
}

export async function upsertSession(session: AgentSession) {
  return mutateStore((store) => {
    const index = store.sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) {
      store.sessions[index] = session;
    } else {
      store.sessions.push(session);
    }

    return session;
  });
}

export async function upsertArtifact(artifact: ArtifactRecord) {
  return mutateStore((store) => {
    const index = store.artifacts.findIndex((item) => item.id === artifact.id);
    if (index >= 0) {
      store.artifacts[index] = artifact;
    } else {
      store.artifacts.push(artifact);
    }

    return artifact;
  });
}

export async function insertMemory(memory: BrainMemoryEntry) {
  return mutateStore((store) => {
    store.memories.push(memory);
    return memory;
  });
}
