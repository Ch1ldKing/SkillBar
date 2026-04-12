import "server-only";

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import path from "path";

import type {
  AnthropicSettingsSnapshot,
  SkillBarMessage,
  SkillBarParticipant,
  SkillBarSnapshot,
} from "@/lib/skillbar-types";

type SqliteDatabase = Database.Database;

type SettingsRow = {
  value: string;
};

type ParticipantRow = {
  id: string;
  name: string;
  kind: "human" | "agent";
  skill_content: string | null;
  session_id: string | null;
  last_seen_seq: number;
  needs_greeting: number;
  status: "idle" | "thinking" | "error";
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  seq: number;
  id: string;
  sender_id: string | null;
  sender_name: string;
  sender_kind: "human" | "agent" | "system";
  content: string;
  created_at: number;
};

type PendingSummaryRow = {
  total: number;
  latestSeq: number | null;
};

export type AgentRecord = {
  id: string;
  name: string;
  skillContent: string;
  sessionId: string | null;
  lastSeenSeq: number;
  needsGreeting: boolean;
  status: "idle" | "thinking" | "error";
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AgentWork =
  | {
      kind: "greeting";
      agent: AgentRecord;
      visibleSeq: number;
      members: string[];
    }
  | {
      kind: "reply";
      agent: AgentRecord;
      visibleSeq: number;
      members: string[];
      messages: SkillBarMessage[];
      omittedCount: number;
    }
  | {
      kind: "proactive-question";
      agent: AgentRecord;
      visibleSeq: number;
      members: string[];
      idleForMs: number;
      recentMessages: SkillBarMessage[];
    };

const HUMAN_ID = "local-human";
const API_KEY_KEY = "anthropic_api_key";
const AUTH_TOKEN_KEY = "anthropic_auth_token";
const BASE_URL_KEY = "anthropic_base_url";
const DB_DIRECTORY = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIRECTORY, "skillbar.sqlite");
const GREETING_DELAY_MIN_MS = 1_500;
const GREETING_DELAY_JITTER_MS = 8_500;
const REPLY_DELAY_MIN_MS = 2_500;
const REPLY_DELAY_JITTER_MS = 12_000;
const PROACTIVE_IDLE_MIN_MS = 90_000;
const PROACTIVE_IDLE_JITTER_MS = 60_000;
const SAME_SPEAKER_PROACTIVE_PENALTY_MS = 30_000;
const PROACTIVE_CONTEXT_LIMIT = 10;
const ENV_KEY_BY_SETTING = {
  [API_KEY_KEY]: "ANTHROPIC_API_KEY",
  [AUTH_TOKEN_KEY]: "ANTHROPIC_AUTH_TOKEN",
  [BASE_URL_KEY]: "ANTHROPIC_BASE_URL",
} as const;

export type AnthropicConfig = {
  apiKey: string | null;
  authToken: string | null;
  baseUrl: string | null;
};

export type AnthropicConfigInput = {
  apiKey: string;
  authToken: string;
  baseUrl: string;
};

const globalForSkillBar = globalThis as typeof globalThis & {
  __skillBarDb?: SqliteDatabase;
};

function now() {
  return Date.now();
}

function hashSeed(value: string) {
  let hash = 2_166_136_261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function getJitteredDelay(seed: string, minMs: number, jitterMs: number) {
  if (jitterMs <= 0) {
    return minMs;
  }

  return minMs + (hashSeed(seed) % (jitterMs + 1));
}

function getDatabase() {
  if (!globalForSkillBar.__skillBarDb) {
    mkdirSync(DB_DIRECTORY, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('human', 'agent')),
        skill_content TEXT,
        session_id TEXT,
        last_seen_seq INTEGER NOT NULL DEFAULT 0,
        needs_greeting INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'thinking', 'error')),
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        sender_id TEXT,
        sender_name TEXT NOT NULL,
        sender_kind TEXT NOT NULL CHECK (sender_kind IN ('human', 'agent', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_participants_kind ON participants(kind);
    `);

    const seedTime = now();
    db.prepare(
      `
        INSERT OR IGNORE INTO participants (
          id,
          name,
          kind,
          skill_content,
          session_id,
          last_seen_seq,
          needs_greeting,
          status,
          last_error,
          created_at,
          updated_at
        ) VALUES (?, ?, 'human', NULL, NULL, 0, 0, 'idle', NULL, ?, ?)
      `,
    ).run(HUMAN_ID, "你", seedTime, seedTime);

    db.prepare(
      "UPDATE participants SET status = 'idle', updated_at = ? WHERE kind = 'agent' AND status = 'thinking'",
    ).run(seedTime);

    globalForSkillBar.__skillBarDb = db;
  }

  return globalForSkillBar.__skillBarDb;
}

function mapParticipant(row: ParticipantRow): SkillBarParticipant {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    needsGreeting: Boolean(row.needs_greeting),
    hasSession: Boolean(row.session_id),
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): SkillBarMessage {
  return {
    seq: row.seq,
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderKind: row.sender_kind,
    content: row.content,
    createdAt: row.created_at,
  };
}

function mapAgent(row: ParticipantRow): AgentRecord {
  return {
    id: row.id,
    name: row.name,
    skillContent: row.skill_content ?? "",
    sessionId: row.session_id,
    lastSeenSeq: row.last_seen_seq,
    needsGreeting: Boolean(row.needs_greeting),
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSetting(key: string) {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as SettingsRow | undefined;

  return row?.value ?? null;
}

function getSettingWithEnvFallback(key: keyof typeof ENV_KEY_BY_SETTING) {
  const storedValue = getSetting(key);
  if (storedValue) {
    return storedValue;
  }

  const envValue = process.env[ENV_KEY_BY_SETTING[key]];
  if (!envValue) {
    return null;
  }

  return normalizeSettingValue(envValue);
}

function normalizeSettingValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasAnthropicCredentials(config: Pick<AnthropicConfig, "apiKey" | "authToken">) {
  return Boolean(config.apiKey || config.authToken);
}

function buildAnthropicSnapshot(config: AnthropicConfig): AnthropicSettingsSnapshot {
  return {
    apiKeyConfigured: Boolean(config.apiKey),
    authTokenConfigured: Boolean(config.authToken),
    baseUrlConfigured: Boolean(config.baseUrl),
    credentialsConfigured: hasAnthropicCredentials(config),
  };
}

function setSetting(key: string, value: string) {
  const db = getDatabase();

  db.prepare(
    `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
  ).run(key, value, now());
}

function deleteSetting(key: string) {
  const db = getDatabase();
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

function insertMessage(
  senderId: string | null,
  senderName: string,
  senderKind: "human" | "agent" | "system",
  content: string,
) {
  const db = getDatabase();

  db.prepare(
    `
      INSERT INTO messages (id, sender_id, sender_name, sender_kind, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), senderId, senderName, senderKind, content, now());
}

function getLatestSeq() {
  const db = getDatabase();
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS latestSeq FROM messages")
    .get() as { latestSeq: number };

  return row.latestSeq;
}

function listParticipantRows() {
  const db = getDatabase();

  return db
    .prepare(
      `
        SELECT
          id,
          name,
          kind,
          skill_content,
          session_id,
          last_seen_seq,
          needs_greeting,
          status,
          last_error,
          created_at,
          updated_at
        FROM participants
        ORDER BY
          CASE kind WHEN 'human' THEN 0 ELSE 1 END,
          created_at ASC
      `,
    )
    .all() as ParticipantRow[];
}

function listMessageRows(limit?: number) {
  const db = getDatabase();

  if (!limit) {
    return db
      .prepare(
        `
          SELECT
            seq,
            id,
            sender_id,
            sender_name,
            sender_kind,
            content,
            created_at
          FROM messages
          ORDER BY seq ASC
        `,
      )
      .all() as MessageRow[];
  }

  return db
    .prepare(
      `
        SELECT * FROM (
          SELECT
            seq,
            id,
            sender_id,
            sender_name,
            sender_kind,
            content,
            created_at
          FROM messages
          ORDER BY seq DESC
          LIMIT ?
        )
        ORDER BY seq ASC
      `,
    )
    .all(limit) as MessageRow[];
}

function getAgentRows() {
  const db = getDatabase();

  return db
    .prepare(
      `
        SELECT
          id,
          name,
          kind,
          skill_content,
          session_id,
          last_seen_seq,
          needs_greeting,
          status,
          last_error,
          created_at,
          updated_at
        FROM participants
        WHERE kind = 'agent'
        ORDER BY updated_at ASC, created_at ASC
      `,
    )
    .all() as ParticipantRow[];
}

function getVisibleMessageSummary(agentId: string, lastSeenSeq: number) {
  const db = getDatabase();

  return db
    .prepare(
      `
        SELECT
          COUNT(*) AS total,
          MAX(seq) AS latestSeq
        FROM messages
        WHERE seq > ?
          AND (sender_id IS NULL OR sender_id != ?)
      `,
    )
    .get(lastSeenSeq, agentId) as PendingSummaryRow;
}

function getVisibleMessages(agentId: string, lastSeenSeq: number, limit = 18) {
  const db = getDatabase();

  return db
    .prepare(
      `
        SELECT * FROM (
          SELECT
            seq,
            id,
            sender_id,
            sender_name,
            sender_kind,
            content,
            created_at
          FROM messages
          WHERE seq > ?
            AND (sender_id IS NULL OR sender_id != ?)
          ORDER BY seq DESC
          LIMIT ?
        )
        ORDER BY seq ASC
      `,
    )
    .all(lastSeenSeq, agentId, limit) as MessageRow[];
}

function getLatestMessageRow() {
  const db = getDatabase();

  return db
    .prepare(
      `
        SELECT
          seq,
          id,
          sender_id,
          sender_name,
          sender_kind,
          content,
          created_at
        FROM messages
        ORDER BY seq DESC
        LIMIT 1
      `,
    )
    .get() as MessageRow | undefined;
}

export function getAnthropicConfig(): AnthropicConfig {
  return {
    apiKey: getSettingWithEnvFallback(API_KEY_KEY),
    authToken: getSettingWithEnvFallback(AUTH_TOKEN_KEY),
    baseUrl: getSettingWithEnvFallback(BASE_URL_KEY),
  };
}

export function saveAnthropicConfig(input: AnthropicConfigInput) {
  const config = {
    apiKey: normalizeSettingValue(input.apiKey),
    authToken: normalizeSettingValue(input.authToken),
    baseUrl: normalizeSettingValue(input.baseUrl),
  } satisfies AnthropicConfig;

  if (!config.apiKey && !config.authToken && !config.baseUrl) {
    deleteSetting(API_KEY_KEY);
    deleteSetting(AUTH_TOKEN_KEY);
    deleteSetting(BASE_URL_KEY);
    return getSnapshot();
  }

  if (!hasAnthropicCredentials(config)) {
    throw new Error("ANTHROPIC_API_KEY 和 ANTHROPIC_AUTH_TOKEN 至少填写一个。");
  }

  if (config.baseUrl) {
    try {
      new URL(config.baseUrl);
    } catch {
      throw new Error("ANTHROPIC_BASE_URL 必须是合法 URL。");
    }
  }

  if (config.apiKey) {
    setSetting(API_KEY_KEY, config.apiKey);
  } else {
    deleteSetting(API_KEY_KEY);
  }

  if (config.authToken) {
    setSetting(AUTH_TOKEN_KEY, config.authToken);
  } else {
    deleteSetting(AUTH_TOKEN_KEY);
  }

  if (config.baseUrl) {
    setSetting(BASE_URL_KEY, config.baseUrl);
  } else {
    deleteSetting(BASE_URL_KEY);
  }

  const db = getDatabase();
  db.prepare(
    `
      UPDATE participants
      SET
        status = 'idle',
        last_error = NULL,
        updated_at = ?
      WHERE kind = 'agent' AND status = 'error'
    `,
  ).run(now());

  return getSnapshot();
}

export function getSnapshot() {
  const anthropic = buildAnthropicSnapshot(getAnthropicConfig());

  return {
    anthropic,
    participants: listParticipantRows().map(mapParticipant),
    messages: listMessageRows().map(mapMessage),
    latestSeq: getLatestSeq(),
  } satisfies SkillBarSnapshot;
}

export function upsertAgentFromSkill(name: string, skillContent: string) {
  const db = getDatabase();
  const trimmedName = name.trim();
  const trimmedSkill = skillContent.trim();

  if (!trimmedName) {
    throw new Error("这个 Skill 的原主人姓名不能为空。");
  }

  if (!trimmedSkill) {
    throw new Error("SKILL.md 不能为空。");
  }

  const existing = db
    .prepare(
      `
        SELECT
          id,
          name,
          kind,
          skill_content,
          session_id,
          last_seen_seq,
          needs_greeting,
          status,
          last_error,
          created_at,
          updated_at
        FROM participants
        WHERE name = ?
      `,
    )
    .get(trimmedName) as ParticipantRow | undefined;

  if (existing && existing.kind !== "agent") {
    throw new Error(`名字“${trimmedName}”已经被占用。`);
  }

  const updatedAt = now();

  if (existing) {
    db.prepare(
      `
        UPDATE participants
        SET
          skill_content = ?,
          session_id = NULL,
          last_seen_seq = 0,
          needs_greeting = 1,
          status = 'idle',
          last_error = NULL,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(trimmedSkill, updatedAt, existing.id);

    insertMessage(
      null,
      "System",
      "system",
      `${trimmedName} 带着新的 Skill 重新进入了群聊。`,
    );
  } else {
    db.prepare(
      `
        INSERT INTO participants (
          id,
          name,
          kind,
          skill_content,
          session_id,
          last_seen_seq,
          needs_greeting,
          status,
          last_error,
          created_at,
          updated_at
        ) VALUES (?, ?, 'agent', ?, NULL, 0, 1, 'idle', NULL, ?, ?)
      `,
    ).run(randomUUID(), trimmedName, trimmedSkill, updatedAt, updatedAt);

    insertMessage(null, "System", "system", `${trimmedName} 进入了群聊。`);
  }

  return getSnapshot();
}

export function addUserMessage(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("消息不能为空。");
  }

  insertMessage(HUMAN_ID, "你", "human", trimmed);
  return getSnapshot();
}

export function addAgentMessage(agentId: string, content: string) {
  const db = getDatabase();
  const agent = db
    .prepare(
      `
        SELECT
          id,
          name,
          kind,
          skill_content,
          session_id,
          last_seen_seq,
          needs_greeting,
          status,
          last_error,
          created_at,
          updated_at
        FROM participants
        WHERE id = ? AND kind = 'agent'
      `,
    )
    .get(agentId) as ParticipantRow | undefined;

  if (!agent) {
    throw new Error("Agent 不存在。");
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }

  insertMessage(agent.id, agent.name, "agent", trimmed);
}

export function markAgentThinking(agentId: string) {
  const db = getDatabase();

  db.prepare(
    `
      UPDATE participants
      SET
        status = 'thinking',
        last_error = NULL,
        updated_at = ?
      WHERE id = ?
    `,
  ).run(now(), agentId);
}

export function completeAgentTurn(agentId: string, args: {
  sessionId: string | null;
  visibleSeq: number;
}) {
  const db = getDatabase();

  db.prepare(
    `
      UPDATE participants
      SET
        session_id = COALESCE(?, session_id),
        last_seen_seq = CASE
          WHEN ? > last_seen_seq THEN ?
          ELSE last_seen_seq
        END,
        needs_greeting = 0,
        status = 'idle',
        last_error = NULL,
        updated_at = ?
      WHERE id = ?
    `,
  ).run(args.sessionId, args.visibleSeq, args.visibleSeq, now(), agentId);
}

export function markAgentError(agentId: string, error: string, sessionId?: string | null) {
  const db = getDatabase();

  db.prepare(
    `
      UPDATE participants
      SET
        session_id = COALESCE(?, session_id),
        status = 'error',
        last_error = ?,
        updated_at = ?
      WHERE id = ?
    `,
  ).run(sessionId ?? null, error, now(), agentId);
}

export function getPendingAgentWork(limit: number) {
  const agents = getAgentRows().map(mapAgent);
  const members = listParticipantRows()
    .filter((participant) => participant.kind === "human" || participant.kind === "agent")
    .map((participant) => participant.name);
  const currentTime = now();
  const latestSeq = getLatestSeq();
  const latestMessage = getLatestMessageRow();
  const recentMessages = listMessageRows(PROACTIVE_CONTEXT_LIMIT).map(mapMessage);
  const hasThinkingAgent = agents.some((agent) => agent.status === "thinking");
  let hasPendingConversation = false;

  const work: AgentWork[] = [];
  const proactiveCandidates: Array<{
    dueAt: number;
    work: AgentWork;
  }> = [];

  for (const agent of agents) {
    if (work.length >= limit) {
      break;
    }

    if (agent.status === "thinking" || agent.status === "error") {
      continue;
    }

    if (agent.needsGreeting || !agent.sessionId) {
      hasPendingConversation = true;

      const greetingDueAt =
        agent.updatedAt +
        getJitteredDelay(
          `greeting:${agent.id}:${agent.updatedAt}`,
          GREETING_DELAY_MIN_MS,
          GREETING_DELAY_JITTER_MS,
        );

      if (currentTime < greetingDueAt) {
        continue;
      }

      work.push({
        kind: "greeting",
        agent,
        members,
        visibleSeq: latestSeq,
      });
      continue;
    }

    const summary = getVisibleMessageSummary(agent.id, agent.lastSeenSeq);
    if (!summary.total || !summary.latestSeq) {
      continue;
    }

    hasPendingConversation = true;

    const messages = getVisibleMessages(agent.id, agent.lastSeenSeq).map(mapMessage);
    const latestVisibleMessage = messages[messages.length - 1];
    const replyDueAt =
      (latestVisibleMessage?.createdAt ?? currentTime) +
      getJitteredDelay(
        `reply:${agent.id}:${summary.latestSeq}`,
        REPLY_DELAY_MIN_MS,
        REPLY_DELAY_JITTER_MS,
      );

    if (currentTime < replyDueAt) {
      continue;
    }

    work.push({
      kind: "reply",
      agent,
      members,
      messages,
      omittedCount: Math.max(summary.total - messages.length, 0),
      visibleSeq: summary.latestSeq,
    });
  }

  if (work.length >= limit || !latestMessage || hasPendingConversation || hasThinkingAgent) {
    return work;
  }

  for (const agent of agents) {
    if (work.length >= limit) {
      break;
    }

    if (agent.status === "thinking" || agent.status === "error") {
      continue;
    }

    if (agent.needsGreeting || !agent.sessionId) {
      continue;
    }

    const anchorTime = Math.max(latestMessage.created_at, agent.updatedAt);
    const selfPenalty = latestMessage.sender_id === agent.id ? SAME_SPEAKER_PROACTIVE_PENALTY_MS : 0;
    const proactiveDelay =
      getJitteredDelay(
        `proactive:${agent.id}:${latestSeq}:${anchorTime}`,
        PROACTIVE_IDLE_MIN_MS,
        PROACTIVE_IDLE_JITTER_MS,
      ) + selfPenalty;
    const proactiveDueAt = anchorTime + proactiveDelay;

    if (currentTime < proactiveDueAt) {
      continue;
    }

    proactiveCandidates.push({
      dueAt: proactiveDueAt,
      work: {
        kind: "proactive-question",
        agent,
        members,
        visibleSeq: latestSeq,
        idleForMs: currentTime - latestMessage.created_at,
        recentMessages,
      },
    });
  }

  proactiveCandidates
    .sort((left, right) => {
      if (left.dueAt !== right.dueAt) {
        return left.dueAt - right.dueAt;
      }

      if (left.work.agent.updatedAt !== right.work.agent.updatedAt) {
        return left.work.agent.updatedAt - right.work.agent.updatedAt;
      }

      return left.work.agent.createdAt - right.work.agent.createdAt;
    })
    .slice(0, 1)
    .forEach((candidate) => {
      work.push(candidate.work);
    });

  return work;
}
