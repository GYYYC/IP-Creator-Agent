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
const databaseUrl = pickDatabaseUrl();
const poolConnectionString = normalizeDatabaseUrlForPg(databaseUrl);
const STRIPPED_ARTIFACT_JSON_SQL = "data #- '{extractedJson,visualDataUrl}'";

let writeQueue: Promise<void> = Promise.resolve();
let pool: Pool | null = null;
let databaseReady: Promise<void> | null = null;

function useDatabase() {
  return Boolean(databaseUrl);
}

function pickDatabaseUrl() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_POSTGRES_URL,
    process.env.SUPABASE_POSTGRES_PRISMA_URL,
    process.env.SUPABASE_POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_POSTGRES_URL,
    process.env.DATABASE_POSTGRES_PRISMA_URL,
    process.env.DATABASE_POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING
  ];

  return candidates.find(isPostgresUrl) ?? "";
}

function isPostgresUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function normalizeDatabaseUrlForPg(value: string) {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get("sslmode");

    if (isSupabasePoolerUrl(url) && (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca")) {
      url.searchParams.set("sslmode", "no-verify");
      return url.toString();
    }

    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
    }

    return url.toString();
  } catch {
    return value;
  }
}

function isSupabasePoolerUrl(url: URL) {
  return url.hostname.endsWith(".pooler.supabase.com") || url.hostname.endsWith(".supabase.co");
}

function isLocalDatabaseUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return value.includes("localhost");
  }
}

function hasSslMode(value: string) {
  try {
    return new URL(value).searchParams.has("sslmode");
  } catch {
    return false;
  }
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: poolConnectionString,
      ...(!hasSslMode(poolConnectionString) ? { ssl: !isLocalDatabaseUrl(poolConnectionString) } : {})
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
    const profiles = await client.query<{ data: CreatorProfile }>(
      "select data from agent_profiles order by updated_at desc"
    );
    const memories = await client.query<{ data: BrainMemoryEntry }>(
      "select data from agent_memories order by created_at desc"
    );
    const sessions = await client.query<{ data: AgentSession }>(
      "select data from agent_sessions order by updated_at desc"
    );
    const artifacts = await client.query<{ data: ArtifactRecord }>(
      `select ${STRIPPED_ARTIFACT_JSON_SQL} as data from agent_artifacts order by created_at desc`
    );

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

function stripArtifactVisualData(artifact: ArtifactRecord): ArtifactRecord {
  if (!artifact.extractedJson || typeof artifact.extractedJson.visualDataUrl !== "string") {
    return artifact;
  }

  const { visualDataUrl: _visualDataUrl, ...extractedJson } = artifact.extractedJson;

  return {
    ...artifact,
    extractedJson
  };
}

export async function getProfileById(profileId: string) {
  if (useDatabase()) {
    await ensureDatabase();
    const result = await getPool().query<{ data: CreatorProfile }>(
      "select data from agent_profiles where id = $1 limit 1",
      [profileId]
    );

    return result.rows[0]?.data ?? null;
  }

  const store = await readStore();
  return store.profiles.find((profile) => profile.id === profileId) ?? null;
}

export async function getProfileByAnonId(anonId: string) {
  if (useDatabase()) {
    await ensureDatabase();
    const result = await getPool().query<{ data: CreatorProfile }>(
      "select data from agent_profiles where data->>'anonId' = $1 order by updated_at desc limit 1",
      [anonId]
    );

    return result.rows[0]?.data ?? null;
  }

  const store = await readStore();
  return store.profiles.find((profile) => profile.anonId === anonId) ?? null;
}

export async function getMemoriesByProfile(profileId: string, limit = 50) {
  if (useDatabase()) {
    await ensureDatabase();
    const result = await getPool().query<{ data: BrainMemoryEntry }>(
      `select data from agent_memories
       where profile_id = $1
       order by created_at desc
       limit $2`,
      [profileId, limit]
    );

    return result.rows.map((row) => row.data);
  }

  const store = await readStore();
  return store.memories
    .filter((memory) => memory.profileId === profileId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getSessionsByProfile(profileId: string, limit = 50) {
  if (useDatabase()) {
    await ensureDatabase();
    const result = await getPool().query<{ data: AgentSession }>(
      `select data from agent_sessions
       where profile_id = $1
       order by updated_at desc
       limit $2`,
      [profileId, limit]
    );

    return result.rows.map((row) => row.data);
  }

  const store = await readStore();
  return store.sessions
    .filter((session) => session.profileId === profileId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function getArtifactsForSessions(profileId: string, sessions: AgentSession[]) {
  const sessionIds = sessions.map((session) => session.id);
  const artifactIds = Array.from(new Set(sessions.flatMap((session) => session.artifactIds ?? [])));

  if (useDatabase()) {
    await ensureDatabase();
    const result = await getPool().query<{ data: ArtifactRecord }>(
      `select ${STRIPPED_ARTIFACT_JSON_SQL} as data
       from agent_artifacts
       where profile_id = $1
       and (session_id = any($2::text[]) or id = any($3::text[]))
       order by created_at desc`,
      [profileId, sessionIds, artifactIds]
    );

    return result.rows.map((row) => stripArtifactVisualData(row.data));
  }

  const sessionIdSet = new Set(sessionIds);
  const artifactIdSet = new Set(artifactIds);
  const store = await readStore();
  return store.artifacts
    .filter((artifact) =>
      artifact.profileId === profileId &&
      (artifactIdSet.has(artifact.id) || Boolean(artifact.sessionId && sessionIdSet.has(artifact.sessionId)))
    )
    .map(stripArtifactVisualData);
}

export async function getSessionById(sessionId: string) {
  if (useDatabase()) {
    await ensureDatabase();
    const result = await getPool().query<{ data: AgentSession }>(
      "select data from agent_sessions where id = $1 limit 1",
      [sessionId]
    );

    return result.rows[0]?.data ?? null;
  }

  const store = await readStore();
  return store.sessions.find((session) => session.id === sessionId) ?? null;
}

export async function getSessionBundle(
  sessionId: string,
  options: { includeVisualData?: boolean } = {}
) {
  if (useDatabase()) {
    await ensureDatabase();
    const client = await getPool().connect();

    try {
      const sessionResult = await client.query<{ data: AgentSession }>(
        "select data from agent_sessions where id = $1 limit 1",
        [sessionId]
      );
      const session = sessionResult.rows[0]?.data ?? null;

      if (!session) {
        return null;
      }

      const artifactIds = session.artifactIds ?? [];
      const dataExpression = options.includeVisualData ? "data" : STRIPPED_ARTIFACT_JSON_SQL;
      const artifactResult = await client.query<{ data: ArtifactRecord }>(
        `select ${dataExpression} as data
         from agent_artifacts
         where profile_id = $1
         and (session_id = $2 or id = any($3::text[]))
         order by created_at asc`,
        [session.profileId, session.id, artifactIds]
      );
      const artifacts = artifactResult.rows.map((row) =>
        options.includeVisualData ? row.data : stripArtifactVisualData(row.data)
      );

      return { session, artifacts };
    } finally {
      client.release();
    }
  }

  const store = await readStore();
  const session = store.sessions.find((item) => item.id === sessionId) ?? null;

  if (!session) {
    return null;
  }

  const artifacts = store.artifacts
    .filter((artifact) => session.artifactIds.includes(artifact.id) || artifact.sessionId === session.id)
    .map((artifact) => options.includeVisualData ? artifact : stripArtifactVisualData(artifact));

  return { session, artifacts };
}

export async function pruneSessionArtifactVisualData(session: AgentSession) {
  const artifactIds = session.artifactIds ?? [];

  if (useDatabase()) {
    await ensureDatabase();
    await getPool().query(
      `update agent_artifacts
       set data = data #- '{extractedJson,visualDataUrl}'
       where profile_id = $1
       and (session_id = $2 or id = any($3::text[]))
       and data #>> '{extractedJson,visualDataUrl}' is not null`,
      [session.profileId, session.id, artifactIds]
    );

    return;
  }

  await mutateStore((store) => {
    store.artifacts = store.artifacts.map((artifact) =>
      artifact.profileId === session.profileId &&
      (artifact.sessionId === session.id || artifactIds.includes(artifact.id))
        ? stripArtifactVisualData(artifact)
        : artifact
    );
  });
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

async function deleteDatabaseSessions(sessionIds: string[], profileId: string) {
  await ensureDatabase();
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const existing = await client.query<{ id: string; data: AgentSession }>(
      "select id, data from agent_sessions where profile_id = $1 and id = any($2::text[])",
      [profileId, sessionIds]
    );
    const deletedIds = existing.rows.map((row) => row.id);
    const deletedArtifactIds = existing.rows.flatMap((row) => row.data.artifactIds ?? []);

    if (deletedIds.length) {
      await client.query(
        `delete from agent_artifacts
         where profile_id = $1
         and (session_id = any($2::text[]) or id = any($3::text[]))`,
        [profileId, deletedIds, deletedArtifactIds]
      );
      await client.query(
        "delete from agent_memories where profile_id = $1 and data->>'sourceSessionId' = any($2::text[])",
        [profileId, deletedIds]
      );
      await client.query(
        "delete from agent_sessions where profile_id = $1 and id = any($2::text[])",
        [profileId, deletedIds]
      );
    }

    await client.query("commit");
    return { deletedIds };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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

export async function deleteSessions(sessionIds: string[], profileId: string) {
  const ids = Array.from(new Set(sessionIds.map((id) => id.trim()).filter(Boolean)));

  if (!ids.length) {
    return { deletedIds: [] };
  }

  if (useDatabase()) {
    return deleteDatabaseSessions(ids, profileId);
  }

  return mutateStore((store) => {
    const deletedSessions = store.sessions.filter(
      (session) => session.profileId === profileId && ids.includes(session.id)
    );
    const deletedIds = deletedSessions.map((session) => session.id);

    if (!deletedIds.length) {
      return { deletedIds };
    }

    const deletedIdSet = new Set(deletedIds);
    const deletedArtifactIds = new Set(deletedSessions.flatMap((session) => session.artifactIds));
    store.sessions = store.sessions.filter((session) => !deletedIdSet.has(session.id));
    store.artifacts = store.artifacts.filter(
      (artifact) =>
        artifact.profileId !== profileId ||
        (!deletedArtifactIds.has(artifact.id) && (!artifact.sessionId || !deletedIdSet.has(artifact.sessionId)))
    );
    store.memories = store.memories.filter(
      (memory) => memory.profileId !== profileId || !memory.sourceSessionId || !deletedIdSet.has(memory.sourceSessionId)
    );

    return { deletedIds };
  });
}
