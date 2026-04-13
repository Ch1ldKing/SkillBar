import "server-only";

import { runAgentWork } from "@/lib/claude-agent";
import {
  addAgentMessage,
  completeAgentTurn,
  getAnthropicConfig,
  getPendingAgentWork,
  hasAnthropicCredentials,
  markAgentError,
  markAgentThinking,
} from "@/lib/skillbar-store";
import type { AgentWork } from "@/lib/skillbar-store";

type SchedulerState = {
  activeAgentIds: Set<string>;
  interval: NodeJS.Timeout | null;
  started: boolean;
  ticking: boolean;
};

const MAX_CONCURRENT_AGENTS = 5;
const SCHEDULER_INTERVAL_MS = 2_000;

const globalForScheduler = globalThis as typeof globalThis & {
  __skillBarScheduler?: SchedulerState;
};

function getSchedulerState() {
  if (!globalForScheduler.__skillBarScheduler) {
    globalForScheduler.__skillBarScheduler = {
      activeAgentIds: new Set<string>(),
      interval: null,
      started: false,
      ticking: false,
    };
  }

  return globalForScheduler.__skillBarScheduler;
}

async function launchAgentWork(work: AgentWork) {
  const state = getSchedulerState();
  const anthropic = getAnthropicConfig();
  const agentId = work.agent.id;

  if (!hasAnthropicCredentials(anthropic)) {
    state.activeAgentIds.delete(agentId);
    return;
  }

  markAgentThinking(agentId);

  try {
    const result = await runAgentWork(work, anthropic);

    if (result.message) {
      addAgentMessage(agentId, result.message);
    }

    completeAgentTurn(agentId, {
      sessionId: result.sessionId,
      visibleSeq: work.visibleSeq,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SkillBar 调度器捕获了未知错误。";
    markAgentError(agentId, message);
  } finally {
    state.activeAgentIds.delete(agentId);
    void tickScheduler();
  }
}

export async function tickScheduler() {
  const state = getSchedulerState();

  if (state.ticking) {
    return;
  }

  state.ticking = true;

  try {
    const anthropic = getAnthropicConfig();
    if (!hasAnthropicCredentials(anthropic)) {
      return;
    }

    const availableSlots = MAX_CONCURRENT_AGENTS - state.activeAgentIds.size;
    if (availableSlots <= 0) {
      return;
    }

    const workItems = getPendingAgentWork(availableSlots).filter(
      (work) => !state.activeAgentIds.has(work.agent.id),
    );

    for (const work of workItems) {
      state.activeAgentIds.add(work.agent.id);
      void launchAgentWork(work);
    }
  } finally {
    state.ticking = false;
  }
}

export function ensureSkillBarScheduler() {
  const state = getSchedulerState();

  if (state.started) {
    return;
  }

  state.interval = setInterval(() => {
    void tickScheduler();
  }, SCHEDULER_INTERVAL_MS);

  state.interval.unref?.();
  state.started = true;
}

export function kickSkillBarScheduler() {
  ensureSkillBarScheduler();
  void tickScheduler();
}

export function resetSkillBarSchedulerState() {
  const state = getSchedulerState();
  state.activeAgentIds.clear();
}
