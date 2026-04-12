import "server-only";

import {
  query,
  type SDKAssistantMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { AgentWork, AnthropicConfig } from "@/lib/skillbar-store";
import type { SkillBarMessage } from "@/lib/skillbar-types";

type AgentTurnResult = {
  sessionId: string | null;
  message: string | null;
};

function buildSystemPrompt(agentName: string, skillContent: string) {
  return `
你不是 AI 助手，也不是主持人。你现在是一个真实群聊成员，名字叫“${agentName}”。

下面是你的完整心智背景，请严格按它的身份、口吻、偏好、价值观与边界发言：

<skill>
${skillContent}
</skill>

群聊行为规则：
- 这是一个名为 SkillBar 的本地群聊
- 默认使用简体中文发言，除非你的人设明确要求其他语言
- 你在群里发言时，只输出一条可以直接发出去的消息正文
- 不要输出名字前缀，不要加引号，不要使用 Markdown，不要解释自己在做什么
- 发言保持像真实群聊，尽量简短、自然、有人味
- 如果当前不需要你发言，请只输出 [pass]
- 不要在结束一句话时输出句号
`.trim();
}

function formatMessageLines(messages: SkillBarMessage[]) {
  return messages
    .map(
      (message) =>
        `[#${message.seq}] ${message.senderName}${message.senderKind === "system" ? "（系统）" : ""}: ${message.content}`,
    )
    .join("\n");
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

  if (work.kind === "proactive-question") {
    const silenceInSeconds = Math.max(1, Math.round(work.idleForMs / 1000));
    const recentMessageLines = formatMessageLines(work.recentMessages);
    const historyBlock = recentMessageLines
      ? `最近几条群聊如下：\n${recentMessageLines}`
      : "群里最近还没有形成明确话题。";

    return `
${memberLine}

群里已经安静了大约 ${silenceInSeconds} 秒。
${historyBlock}

请完全按照你的人设，主动抛出一个自然的问题来重新打开话题。
要求：
- 问题必须符合你的兴趣、价值观和表达习惯。
- 随机挑一个你自己真的会关心的切入点。
- 像真实群聊发言，尽量简短、自然，不要像主持人控场。
- 只输出一条可以直接发出去的问题正文，不要解释。
`.trim();
  }

  const messageLines = formatMessageLines(work.messages);

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

function extractAssistantText(message: SDKAssistantMessage) {
  return message.message.content
    .flatMap((block) => {
      if (block.type !== "text") {
        return [];
      }

      return [block.text.trim()];
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

function buildEnv(config: AnthropicConfig) {
  const env = {
    ...process.env,
  };

  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;

  if (config.apiKey) {
    env.ANTHROPIC_API_KEY = config.apiKey;
  }

  if (config.authToken) {
    env.ANTHROPIC_AUTH_TOKEN = config.authToken;
  }

  if (config.baseUrl) {
    env.ANTHROPIC_BASE_URL = config.baseUrl;
  }

  env.CLAUDE_AGENT_SDK_CLIENT_APP = "skillbar/0.1.0";

  return env;
}

export async function runAgentWork(
  work: AgentWork,
  anthropic: AnthropicConfig,
): Promise<AgentTurnResult> {
  const stream = query({
    prompt: buildPrompt(work),
    options: {
      cwd: process.cwd(),
      env: buildEnv(anthropic),
      maxTurns: 1,
      permissionMode: "dontAsk",
      persistSession: true,
      resume: work.agent.sessionId ?? undefined,
      stderr: (data) => {
        if (data.trim()) {
          console.error(`[SkillBar:${work.agent.name}] ${data.trim()}`);
        }
      },
      systemPrompt: buildSystemPrompt(work.agent.name, work.agent.skillContent),
      thinking: { type: "disabled" },
      tools: [],
    },
  });

  let sessionId = work.agent.sessionId;
  let assistantText: string | null = null;
  let resultMessage: SDKResultMessage | null = null;

  for await (const message of stream) {
    if ("session_id" in message && !sessionId) {
      sessionId = message.session_id ?? null;
    }

    if (message.type === "assistant") {
      const text = extractAssistantText(message);
      if (text) {
        assistantText = text;
      }
    }

    if (message.type === "result") {
      resultMessage = message;
    }
  }

  if (!resultMessage) {
    throw new Error("Claude Agent 没有返回结果。");
  }

  if (resultMessage.subtype !== "success") {
    throw new Error(resultMessage.errors.join("; ") || "Claude Agent 调用失败。");
  }

  const fallback = resultMessage.result?.trim() || null;

  return {
    sessionId,
    message: normalizeOutput(work.agent.name, assistantText ?? fallback),
  };
}
