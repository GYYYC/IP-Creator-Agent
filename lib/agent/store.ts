import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
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
const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

let writeQueue: Promise<void> = Promise.resolve();
let pool: Pool | null = null;
let databaseReady: Promise<void> | null = null;

function useDatabase() {
  return Boolean(databaseUrl);
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function ensureDatabase() {
  if (!useDatabase()) {
    return;
  }

  databaseReady ??= getPool().query(`
    create table if not exists agent_profiles (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists agent_memories (
      id text primary key,
      profile_id text not null,
      data jsonb not null,
      created_at timestamptz not null default now()
    );

    create table if not exists agent_sessions (
      id text primary key,
      profile_id text not null,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists agent_artifacts (
      id text primary key,
      profile_id text not null,
      session_id text,
      data jsonb not null,
      created_at timestamptz not null default now()
    );

    create index if not exists agent_memories_profile_idx on agent_memories (profile_id, created_at desc);
    create index if not exists agent_sessions_profile_idx on agent_sessions (profile_id, updated_at desc);
    create index if not exists agent_artifacts_profile_idx on agent_artifacts (profile_id, created_at desc);
  `).then(() => undefined);

  await databaseReady;
}

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

async function readDatabaseStore(): Promise<AgentStoreShape> {
  await ensureDatabase();
  const client = await getPool().connect();

  try {
    const [profiles, memories, sessions, artifacts] = await Promise.all([
      client.query<{ data: CreatorProfile }>("select data from agent_profiles order by updated_at desc"),
      client.query<{ data: BrainMemoryEntry }>("select data from agent_memories order by created_at desc"),
      client.query<{ data: AgentSession }>("select data from agent_sessions order by updated_at desc"),
      client.query<{ data: ArtifactRecord }>("select data from agent_artifacts order by created_at desc")
    ]);

    return {
      profiles: profiles.rows.map((row) => row.data),
      memories: memories.rows.map((row) => row.data),
      sessions: sessions.rows.map((row) => row.data),
      artifacts: artifacts.rows.map((row) => row.data)
    };
  } finally {
    client.release();
  }
}

async function upsertDatabaseProfile(profile: CreatorProfile) {
  await ensureDatabase();
  await getPool().query(
    `insert into agent_profiles (id, data, updated_at)
     values ($1, $2::jsonb, $3)
     on conflict (id)
     do update set data = excluded.data, updated_at = excluded.updated_at`,
    [profile.id, JSON.stringify(profile), profile.updatedAt]
  );

  return profile;
}

async function upsertDatabaseSession(session: AgentSession) {
  await ensureDatabase();
  await getPool().query(
    `insert into agent_sessions (id, profile_id, data, updated_at)
     values ($1, $2, $3::jsonb, $4)
     on conflict (id)
     do update set profile_id = excluded.profile_id, data = excluded.data, updated_at = excluded.updated_at`,
    [session.id, session.profileId, JSON.stringify(session), session.updatedAt]
  );

  return session;
}

async function upsertDatabaseArtifact(artifact: ArtifactRecord) {
  await ensureDatabase();
  await getPool().query(
    `insert into agent_artifacts (id, profile_id, session_id, data, created_at)
     values ($1, $2, $3, $4::jsonb, $5)
     on conflict (id)
     do update set profile_id = excluded.profile_id, session_id = excluded.session_id, data = excluded.data`,
    [
      artifact.id,
      artifact.profileId,
      artifact.sessionId ?? null,
      JSON.stringify(artifact),
      artifact.createdAt
    ]
  );

  return artifact;
}

async function insertDatabaseMemory(memory: BrainMemoryEntry) {
  await ensureDatabase();
  await getPool().query(
    `insert into agent_memories (id, profile_id, data, created_at)
     values ($1, $2, $3::jsonb, $4)
     on conflict (id) do nothing`,
    [memory.id, memory.profileId, JSON.stringify(memory), memory.createdAt]
  );

  return memory;
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
  if (useDatabase()) {
    return readDatabaseStore();
  }

  return readStore();
}

export async function upsertProfile(profile: CreatorProfile) {
  if (useDatabase()) {
    return upsertDatabaseProfile(profile);
  }

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
  if (useDatabase()) {
    return upsertDatabaseSession(session);
  }

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
  if (useDatabase()) {
    return upsertDatabaseArtifact(artifact);
  }

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
  if (useDatabase()) {
    return insertDatabaseMemory(memory);
  }

  return mutateStore((store) => {
    store.memories.push(memory);
    return memory;
  });
}
