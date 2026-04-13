import "server-only";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateBackend, createDeepAgent } from "deepagents";

import { assertAgentRuntimeReady } from "@/lib/config";
import { getDatabaseUrl } from "@/lib/db";
import type { AgentWork } from "@/lib/skillbar-store";

type AgentTurnResult = {
  message: string | null;
};

const globalForDeepAgent = globalThis as typeof globalThis & {
  __skillBarWebsiteCheckpointerPromise?: Promise<PostgresSaver>;
};

async function getCheckpointer() {
  if (!globalForDeepAgent.__skillBarWebsiteCheckpointerPromise) {
    globalForDeepAgent.__skillBarWebsiteCheckpointerPromise = (async () => {
      const checkpointer = PostgresSaver.fromConnString(getDatabaseUrl());
      await checkpointer.setup();
      return checkpointer;
    })();
  }

  return globalForDeepAgent.__skillBarWebsiteCheckpointerPromise;
}

function buildSystemPrompt(agentName: string, skillContent: string) {
  return `
你不是 AI 助手，也不是主持人。你现在是一个真实群聊成员，名字叫“${agentName}”。

下面是你的完整心智背景，请严格按它的身份、口吻、偏好、价值观与边界发言：

<skill>
${skillContent}
</skill>

群聊规则：
- 这是某个用户私有的 SkillBar 群聊，不要提及其他用户、租户、工作区。
- 默认使用简体中文发言，除非你的人设明确要求其他语言。
- 你最终只能输出一条可以直接发到群聊里的消息正文。
- 不要输出名字前缀，不要加引号，不要使用 Markdown，不要解释你内部做了什么。
- 即使你在内部使用了计划、子代理或文件能力，最终对外依然只发一条自然群聊消息。
- 如果当前不需要你发言，请只输出 [pass]。
`.trim();
}

function buildPrompt(work: AgentWork) {
  const memberLine = `当前群成员：${work.members.join("、")}`;

  if (work.kind === "greeting") {
    return `
${memberLine}

你刚刚进入 SkillBar 群聊。请按照你的人设，向群里所有人打一个自然的招呼。
只输出一条你要发到群里的消息正文。
`.trim();
  }

  const messageLines = work.messages
    .map(
      (message) =>
        `[#${message.seq}] ${message.senderName}${message.senderKind === "system" ? "（系统）" : ""}: ${message.content}`,
    )
    .join("\n");

  const omittedPrefix =
    work.omittedCount > 0 ? `还有 ${work.omittedCount} 条更早的新消息没有展开。\n` : "";

  return `
${memberLine}

以下是你上次查看之后，群里出现的新消息：
${omittedPrefix}${messageLines}

请根据你的人设判断是否有必要自然地回复一条群消息。
如果无需回复，只输出 [pass]。
如果需要回复，只输出一条要发送到群里的消息正文。
`.trim();
}

function extractTextContent(content: unknown) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (typeof part === "string") {
        return [part.trim()];
      }

      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return [part.text.trim()];
      }

      return [];
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeOutput(agentName: string, content: string | null) {
  if (!content) {
    return null;
  }

  const trimmed = content.trim();

  if (!trimmed || /^\[pass\]$/i.test(trimmed)) {
    return null;
  }

  return trimmed.replace(new RegExp(`^${agentName}\\s*[:：]\\s*`, "i"), "").trim() || null;
}

export async function resetAgentThread(threadId: string) {
  const checkpointer = await getCheckpointer();
  await checkpointer.deleteThread(threadId);
}

export async function runAgentWork(work: AgentWork): Promise<AgentTurnResult> {
  const runtime = assertAgentRuntimeReady();
  const checkpointer = await getCheckpointer();
  const agent = createDeepAgent({
    backend: new StateBackend(),
    checkpointer,
    model: runtime.model,
    name: `skillbar-${work.agent.id}`,
    systemPrompt: buildSystemPrompt(work.agent.name, work.agent.skillContent),
  });

  const result = await agent.invoke(
    {
      messages: [{ content: buildPrompt(work), role: "user" }],
    },
    {
      configurable: {
        thread_id: work.agent.threadId,
      },
      context: {
        agentId: work.agent.id,
        userId: work.userId,
      },
    },
  );

  const assistantMessage = [...result.messages]
    .reverse()
    .find((message) => message.getType() === "ai");

  return {
    message: normalizeOutput(
      work.agent.name,
      assistantMessage ? extractTextContent(assistantMessage.content) : null,
    ),
  };
}
