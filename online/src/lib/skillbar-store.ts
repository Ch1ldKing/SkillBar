import "server-only";

import { randomInt, randomUUID } from "crypto";

import { normalizeAgentName } from "@/lib/agent-name";
import { getDatabase } from "@/lib/db";
import type {
  RuntimeSnapshot,
  SkillBarMessage,
  SkillBarParticipant,
  SkillBarSnapshot,
  ViewerSnapshot,
} from "@/lib/skillbar-types";

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
  last_message_at: number | null;
  consecutive_message_count: number;
  burst_message_limit: number;
  cooldown_until: number | null;
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
  earliestCreatedAt: number | null;
  latestCreatedAt: number | null;
};

type ViewerUser = {
  email: string;
  id: string;
  name?: string | null;
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
  lastMessageAt: number | null;
  consecutiveMessageCount: number;
  burstMessageLimit: number;
  cooldownUntil: number | null;
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

type WorkCandidate = {
  dueAt: number;
  pendingSinceAt: number;
  work: AgentWork;
};

const PARTICIPANT_SELECT_COLUMNS = `
  id,
  name,
  kind,
  skill_content,
  session_id,
  last_seen_seq,
  needs_greeting,
  status,
  last_error,
  last_message_at,
  consecutive_message_count,
  burst_message_limit,
  cooldown_until,
  created_at,
  updated_at
`;

const GREETING_DELAY_MIN_MS = 1_500;
const GREETING_DELAY_JITTER_MS = 8_500;
const REPLY_DELAY_MIN_MS = 2_500;
const REPLY_DELAY_JITTER_MS = 12_000;
const PROACTIVE_IDLE_MIN_MS = 90_000;
const PROACTIVE_IDLE_JITTER_MS = 60_000;
const SAME_SPEAKER_PROACTIVE_PENALTY_MS = 30_000;
const PROACTIVE_CONTEXT_LIMIT = 10;
const CONSECUTIVE_MESSAGE_WINDOW_MS = 10_000;
const LAZY_BURST_LIMIT_MIN = 1;
const LAZY_BURST_LIMIT_MAX = 5;
const LAZY_COOLDOWN_MIN_MS = 30_000;
const LAZY_COOLDOWN_MAX_MS = 120_000;
const DEFAULT_MESSAGE_INTERVAL_MS = 60_000;

export type AnthropicConfig = {
  apiKey: string | null;
  authToken: string | null;
  baseUrl: string | null;
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

function drawBurstMessageLimit() {
  return randomInt(LAZY_BURST_LIMIT_MIN, LAZY_BURST_LIMIT_MAX + 1);
}

function drawCooldownDelayMs() {
  return randomInt(LAZY_COOLDOWN_MIN_MS, LAZY_COOLDOWN_MAX_MS + 1);
}

function normalizeBurstMessageLimit(limit: number) {
  if (limit >= LAZY_BURST_LIMIT_MIN && limit <= LAZY_BURST_LIMIT_MAX) {
    return limit;
  }

  return drawBurstMessageLimit();
}

function buildNextLazyState(agent: AgentRecord, sentAt: number) {
  const isConsecutive =
    typeof agent.lastMessageAt === "number" &&
    sentAt - agent.lastMessageAt < CONSECUTIVE_MESSAGE_WINDOW_MS;

  const burstMessageLimit = isConsecutive
    ? normalizeBurstMessageLimit(agent.burstMessageLimit)
    : drawBurstMessageLimit();
  const consecutiveMessageCount = isConsecutive ? agent.consecutiveMessageCount + 1 : 1;

  if (consecutiveMessageCount >= burstMessageLimit) {
    return {
      burstMessageLimit: drawBurstMessageLimit(),
      consecutiveMessageCount: 0,
      cooldownUntil: sentAt + drawCooldownDelayMs(),
      lastMessageAt: sentAt,
    };
  }

  return {
    burstMessageLimit,
    consecutiveMessageCount,
    cooldownUntil: null,
    lastMessageAt: sentAt,
  };
}

function sortWorkCandidates(left: WorkCandidate, right: WorkCandidate) {
  if (left.pendingSinceAt !== right.pendingSinceAt) {
    return left.pendingSinceAt - right.pendingSinceAt;
  }

  if (left.dueAt !== right.dueAt) {
    return left.dueAt - right.dueAt;
  }

  if (left.work.agent.updatedAt !== right.work.agent.updatedAt) {
    return left.work.agent.updatedAt - right.work.agent.updatedAt;
  }

  return left.work.agent.createdAt - right.work.agent.createdAt;
}

function normalizeOptionalEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function displayNameFromUser(user: Pick<ViewerUser, "email" | "name">) {
  if (user.name?.trim()) {
    return user.name.trim();
  }

  const [prefix] = user.email.split("@");
  return prefix || "SkillBar User";
}

function humanParticipantIdFromUserId(userId: string) {
  return `human:${userId}`;
}

function getMessageIntervalMs() {
  const raw = process.env.SKILLBAR_MESSAGE_INTERVAL_MS?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_MESSAGE_INTERVAL_MS;

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MESSAGE_INTERVAL_MS;
  }

  return Math.floor(parsed);
}

function isAdminUser(user: Pick<ViewerUser, "email"> | null | undefined) {
  if (!user) {
    return false;
  }

  const admins = (process.env.SKILLBAR_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(user.email.trim().toLowerCase());
}

function ensureSchema() {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('human', 'agent')),
      skill_content TEXT,
      session_id TEXT,
      last_seen_seq INTEGER NOT NULL DEFAULT 0,
      needs_greeting INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'thinking', 'error')),
      last_error TEXT,
      last_message_at INTEGER,
      consecutive_message_count INTEGER NOT NULL DEFAULT 0,
      burst_message_limit INTEGER NOT NULL DEFAULT 0,
      cooldown_until INTEGER,
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
    CREATE INDEX IF NOT EXISTS idx_participants_name ON participants(name);
  `);

  db.prepare(
    `
      UPDATE participants
      SET status = 'idle', updated_at = ?
      WHERE kind = 'agent' AND status = 'thinking'
    `,
  ).run(now());
}

function mapParticipant(row: ParticipantRow): SkillBarParticipant {
  return {
    createdAt: row.created_at,
    hasSession: Boolean(row.session_id),
    id: row.id,
    kind: row.kind,
    lastError: row.last_error,
    name: row.name,
    needsGreeting: Boolean(row.needs_greeting),
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): SkillBarMessage {
  return {
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    senderId: row.sender_id,
    senderKind: row.sender_kind,
    senderName: row.sender_name,
    seq: row.seq,
  };
}

function mapAgent(row: ParticipantRow): AgentRecord {
  return {
    burstMessageLimit: row.burst_message_limit,
    consecutiveMessageCount: row.consecutive_message_count,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,
    id: row.id,
    lastError: row.last_error,
    lastMessageAt: row.last_message_at,
    lastSeenSeq: row.last_seen_seq,
    name: row.name,
    needsGreeting: Boolean(row.needs_greeting),
    sessionId: row.session_id,
    skillContent: row.skill_content ?? "",
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function insertMessage(
  senderId: string | null,
  senderName: string,
  senderKind: "human" | "agent" | "system",
  content: string,
  createdAt = now(),
) {
  const db = getDatabase();

  db.prepare(
    `
      INSERT INTO messages (id, sender_id, sender_name, sender_kind, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), senderId, senderName, senderKind, content, createdAt);
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
          ${PARTICIPANT_SELECT_COLUMNS}
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
          ${PARTICIPANT_SELECT_COLUMNS}
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
          MAX(seq) AS latestSeq,
          MIN(created_at) AS earliestCreatedAt,
          MAX(created_at) AS latestCreatedAt
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

function getLastHumanMessageAt(participantId: string) {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT MAX(created_at) AS lastMessageAt
        FROM messages
        WHERE sender_id = ?
          AND sender_kind = 'human'
      `,
    )
    .get(participantId) as { lastMessageAt: number | null };

  return row.lastMessageAt ?? null;
}

function buildRuntimeSnapshot(): RuntimeSnapshot {
  return {
    ready: hasAnthropicCredentials(getAnthropicConfig()),
  };
}

function buildViewerSnapshot(user?: ViewerUser | null): ViewerSnapshot {
  const messageIntervalMs = getMessageIntervalMs();

  if (!user) {
    return {
      authenticated: false,
      canSendMessage: false,
      email: null,
      id: null,
      isAdmin: false,
      messageIntervalMs,
      name: null,
      nextAllowedMessageAt: null,
      participantId: null,
      remainingCooldownMs: 0,
    };
  }

  const participantId = humanParticipantIdFromUserId(user.id);
  const admin = isAdminUser(user);
  const lastMessageAt = getLastHumanMessageAt(participantId);
  const nextAllowedMessageAt =
    admin || lastMessageAt === null ? null : lastMessageAt + messageIntervalMs;
  const remainingCooldownMs = nextAllowedMessageAt
    ? Math.max(nextAllowedMessageAt - now(), 0)
    : 0;

  return {
    authenticated: true,
    canSendMessage: admin || remainingCooldownMs === 0,
    email: user.email,
    id: user.id,
    isAdmin: admin,
    messageIntervalMs,
    name: displayNameFromUser(user),
    nextAllowedMessageAt,
    participantId,
    remainingCooldownMs,
  };
}

function ensureHumanParticipant(user: ViewerUser) {
  const db = getDatabase();
  const participantId = humanParticipantIdFromUserId(user.id);
  const timestamp = now();

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
        last_message_at,
        consecutive_message_count,
        burst_message_limit,
        cooldown_until,
        created_at,
        updated_at
      ) VALUES (?, ?, 'human', NULL, NULL, 0, 0, 'idle', NULL, NULL, 0, 0, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `,
  ).run(participantId, displayNameFromUser(user), timestamp, timestamp);

  return participantId;
}

function formatCooldownMessage(remainingCooldownMs: number) {
  const seconds = Math.max(1, Math.ceil(remainingCooldownMs / 1000));
  return `发送太快了，请在 ${seconds} 秒后再试。`;
}

export function hasAnthropicCredentials(config: Pick<AnthropicConfig, "apiKey" | "authToken">) {
  return Boolean(config.apiKey || config.authToken);
}

export function getAnthropicConfig(): AnthropicConfig {
  return {
    apiKey: normalizeOptionalEnvValue(process.env.ANTHROPIC_API_KEY),
    authToken: normalizeOptionalEnvValue(process.env.ANTHROPIC_AUTH_TOKEN),
    baseUrl: normalizeOptionalEnvValue(process.env.ANTHROPIC_BASE_URL),
  };
}

export function getSnapshot(user?: ViewerUser | null) {
  ensureSchema();

  return {
    latestSeq: getLatestSeq(),
    messages: listMessageRows().map(mapMessage),
    participants: listParticipantRows().map(mapParticipant),
    runtime: buildRuntimeSnapshot(),
    viewer: buildViewerSnapshot(user),
  } satisfies SkillBarSnapshot;
}

export function upsertAgentFromSkill(name: string, skillContent: string) {
  ensureSchema();

  const db = getDatabase();
  const trimmedName = name.trim();
  const normalizedName = normalizeAgentName(name);
  const trimmedSkill = skillContent.trim();

  if (!trimmedName) {
    throw new Error("这个 Skill 的原主人姓名不能为空。");
  }

  if (!normalizedName) {
    throw new Error("Agent 名字里至少要有一个文字或数字。");
  }

  if (!trimmedSkill) {
    throw new Error("SKILL.md 不能为空。");
  }

  const existingAgents = db
    .prepare(
      `
        SELECT
          ${PARTICIPANT_SELECT_COLUMNS}
        FROM participants
        WHERE kind = 'agent'
        ORDER BY created_at ASC
      `,
    )
    .all() as ParticipantRow[];
  const existing = existingAgents.find(
    (participant) => normalizeAgentName(participant.name) === normalizedName,
  );

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
          last_message_at = NULL,
          consecutive_message_count = 0,
          burst_message_limit = ?,
          cooldown_until = NULL,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(trimmedSkill, drawBurstMessageLimit(), updatedAt, existing.id);

    insertMessage(
      null,
      "System",
      "system",
      `${existing.name} 带着新的 Skill 重新进入了群聊。`,
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
          last_message_at,
          consecutive_message_count,
          burst_message_limit,
          cooldown_until,
          created_at,
          updated_at
        ) VALUES (?, ?, 'agent', ?, NULL, 0, 1, 'idle', NULL, NULL, 0, ?, NULL, ?, ?)
      `,
    ).run(randomUUID(), trimmedName, trimmedSkill, drawBurstMessageLimit(), updatedAt, updatedAt);

    insertMessage(null, "System", "system", `${trimmedName} 进入了群聊。`);
  }

  return getSnapshot();
}

export function addUserMessage(user: ViewerUser | null | undefined, content: string) {
  ensureSchema();

  if (!user) {
    throw new Error("请先登录后再发送消息。");
  }

  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("消息不能为空。");
  }

  const viewer = buildViewerSnapshot(user);

  if (!viewer.canSendMessage) {
    throw new Error(formatCooldownMessage(viewer.remainingCooldownMs));
  }

  const participantId = ensureHumanParticipant(user);
  insertMessage(participantId, displayNameFromUser(user), "human", trimmed);

  return getSnapshot(user);
}

export function addAgentMessage(agentId: string, content: string) {
  ensureSchema();

  const db = getDatabase();
  const agent = db
    .prepare(
      `
        SELECT
          ${PARTICIPANT_SELECT_COLUMNS}
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

  const sentAt = now();
  const nextLazyState = buildNextLazyState(mapAgent(agent), sentAt);

  db.transaction(() => {
    insertMessage(agent.id, agent.name, "agent", trimmed, sentAt);
    db.prepare(
      `
        UPDATE participants
        SET
          last_message_at = ?,
          consecutive_message_count = ?,
          burst_message_limit = ?,
          cooldown_until = ?
        WHERE id = ?
      `,
    ).run(
      nextLazyState.lastMessageAt,
      nextLazyState.consecutiveMessageCount,
      nextLazyState.burstMessageLimit,
      nextLazyState.cooldownUntil,
      agentId,
    );
  })();
}

export function markAgentThinking(agentId: string) {
  ensureSchema();

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
  ensureSchema();

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
  ensureSchema();

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
  ensureSchema();

  if (limit <= 0) {
    return [];
  }

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

  const conversationCandidates: WorkCandidate[] = [];
  const proactiveCandidates: WorkCandidate[] = [];

  for (const agent of agents) {
    if (agent.status === "thinking" || agent.status === "error") {
      continue;
    }

    const lazyDueAt = agent.cooldownUntil ?? 0;

    if (agent.needsGreeting || !agent.sessionId) {
      hasPendingConversation = true;

      const greetingDueAt =
        agent.updatedAt +
        getJitteredDelay(
          `greeting:${agent.id}:${agent.updatedAt}`,
          GREETING_DELAY_MIN_MS,
          GREETING_DELAY_JITTER_MS,
        );
      const dueAt = Math.max(greetingDueAt, lazyDueAt);

      if (currentTime < dueAt) {
        continue;
      }

      conversationCandidates.push({
        dueAt,
        pendingSinceAt: agent.updatedAt,
        work: {
          agent,
          kind: "greeting",
          members,
          visibleSeq: latestSeq,
        },
      });
      continue;
    }

    const summary = getVisibleMessageSummary(agent.id, agent.lastSeenSeq);

    if (!summary.total || !summary.latestSeq) {
      continue;
    }

    hasPendingConversation = true;

    const replyDueAt =
      (summary.latestCreatedAt ?? currentTime) +
      getJitteredDelay(
        `reply:${agent.id}:${summary.latestSeq}`,
        REPLY_DELAY_MIN_MS,
        REPLY_DELAY_JITTER_MS,
      );
    const dueAt = Math.max(replyDueAt, lazyDueAt);

    if (currentTime < dueAt) {
      continue;
    }

    const messages = getVisibleMessages(agent.id, agent.lastSeenSeq).map(mapMessage);

    conversationCandidates.push({
      dueAt,
      pendingSinceAt: summary.earliestCreatedAt ?? messages[0]?.createdAt ?? agent.updatedAt,
      work: {
        agent,
        kind: "reply",
        members,
        messages,
        omittedCount: Math.max(summary.total - messages.length, 0),
        visibleSeq: summary.latestSeq,
      },
    });
  }

  const work = conversationCandidates
    .sort(sortWorkCandidates)
    .slice(0, limit)
    .map((candidate) => candidate.work);

  if (work.length >= limit || !latestMessage || hasPendingConversation || hasThinkingAgent) {
    return work;
  }

  for (const agent of agents) {
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
    const proactiveDueAt = Math.max(anchorTime + proactiveDelay, agent.cooldownUntil ?? 0);

    if (currentTime < proactiveDueAt) {
      continue;
    }

    proactiveCandidates.push({
      dueAt: proactiveDueAt,
      pendingSinceAt: anchorTime,
      work: {
        agent,
        kind: "proactive-question",
        members,
        recentMessages,
        visibleSeq: latestSeq,
        idleForMs: currentTime - latestMessage.created_at,
      },
    });
  }

  proactiveCandidates
    .sort(sortWorkCandidates)
    .slice(0, 1)
    .forEach((candidate) => {
      work.push(candidate.work);
    });

  return work;
}
