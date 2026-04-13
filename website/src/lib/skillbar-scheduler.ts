import "server-only";

import { getAgentRuntimeSummary } from "@/lib/config";
import { runAgentWork } from "@/lib/deep-agent";
import {
  addAgentMessage,
  completeAgentTurn,
  type AgentWork,
  getPendingAgentWork,
  markAgentError,
  markAgentThinking,
} from "@/lib/skillbar-store";

type SchedulerState = {
  activeAgentIds: Set<string>;
  interval: NodeJS.Timeout | null;
  started: boolean;
  ticking: boolean;
};

const MAX_CONCURRENT_AGENTS = 4;

const globalForScheduler = globalThis as typeof globalThis & {
  __skillBarWebsiteScheduler?: SchedulerState;
};

function getSchedulerState() {
  if (!globalForScheduler.__skillBarWebsiteScheduler) {
    globalForScheduler.__skillBarWebsiteScheduler = {
      activeAgentIds: new Set<string>(),
      interval: null,
      started: false,
      ticking: false,
    };
  }

  return globalForScheduler.__skillBarWebsiteScheduler;
}

async function launchAgentWork(agentId: string) {
  const state = getSchedulerState();
  const pendingWork = await getPendingAgentWork(MAX_CONCURRENT_AGENTS);
  const work = pendingWork.find((candidate: AgentWork) => candidate.agent.id === agentId);

  if (!work) {
    state.activeAgentIds.delete(agentId);
    return;
  }

  await markAgentThinking(agentId);

  try {
    const result = await runAgentWork(work);

    if (result.message) {
      await addAgentMessage(work.userId, agentId, result.message);
    }

    await completeAgentTurn(agentId, { visibleSeq: work.visibleSeq });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SkillBar 调度器捕获了未知错误。";
    await markAgentError(agentId, message);
  } finally {
    state.activeAgentIds.delete(agentId);
    void tickScheduler();
  }
}

export async function tickScheduler() {
  const state = getSchedulerState();

  if (state.ticking || !getAgentRuntimeSummary().ready) {
    return;
  }

  state.ticking = true;

  try {
    const availableSlots = MAX_CONCURRENT_AGENTS - state.activeAgentIds.size;

    if (availableSlots <= 0) {
      return;
    }

    const pendingWork = await getPendingAgentWork(availableSlots);
    const workItems = pendingWork.filter(
      (work: AgentWork) => !state.activeAgentIds.has(work.agent.id),
    );

    for (const work of workItems) {
      state.activeAgentIds.add(work.agent.id);
      void launchAgentWork(work.agent.id);
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
  }, 4000);

  state.interval.unref?.();
  state.started = true;
}

export function kickSkillBarScheduler() {
  ensureSkillBarScheduler();
  void tickScheduler();
}
