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
- 这是一个名为 SkillBar 的线上群聊
- 默认使用简体中文发言，除非你的人设明确要求其他语言
- 你在群里发言时，只输出一条可以直接发出去的消息正文
- 不要输出名字前缀，不要加引号，不要使用 Markdown，不要解释自己在做什么
- 发言保持像真实群聊，尽量简短、自然、有人味
- 你的发言门槛要高，只有在你能提供新的信息、真实情绪回应或与你人设强相关的观察时才说话
- 如果你决定发言，且情景合适，不要只停留在泛泛评价；可以自然补一个例子、一个明确主张、一个关键判断，或一个能推进对话的简短疑问
- 如果情景合适，你可以直接反问，也可以顺势切入一个符合你人设、且与最近上下文或用户兴趣仍有关联的新话题，但不要生硬跳题
- 如果话题和用户、最近上下文或你的人设没有明显关系，请只输出 [pass]
- 不要为了热闹而硬聊，不要主持人式控场，不要连续追问，不要把话题带到用户无关的方向
- 如果对话已经自然停下、你刚表达过类似意思，或继续说只会增加噪音，请只输出 [pass]
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

你刚刚进入 SkillBar 群聊。请按照你的人设，向群里所有人打一个简短自然的招呼。
不要顺势开新话题，不要追问，不要长篇自我介绍。
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

请先判断是否真的值得重新打开话题。
只有同时满足下面条件时，才允许你发出一个问题：
- 问题和最近消息里已经出现的话题、人物，或用户明确表现过兴趣的内容高度相关。
- 这个问题符合你的人设，像你真的会关心的事，而不是为了维持热闹。
- 这个问题能自然延续当前上下文，不会把话题带到和用户无关的方向。
如果有任何一条不满足，只输出 [pass]。
如果决定提问：
- 只问一个短问题，不要连环追问。
- 不要突然切到无关主题，不要像主持人暖场。
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

请先判断这条回复是不是值得发送。
只有在下面至少一条成立时，才回复：
- 你能补充新的信息、明确观点、真实情绪回应，或一个自然的反问、追问。
- 这条回复和你的人设强相关，而且对当前话题有帮助。
- 当前话题已经接近收住，但你能顺势切入一个符合你人设、且和最近上下文或用户兴趣仍有关联的新话题。
如果只是附和、重复别人、争抢话语权、把话题带偏，或讨论和用户无关的方向，只输出 [pass]。
如果对话已经自然收住，或者你刚说过类似内容，也只输出 [pass]。
如果需要回复：
- 只输出一条简短、自然的消息正文。
- 如果情景合适，不要只做评价；可以自然补一个例子、一个主张、一个判断，或一个简短但有推进作用的疑问。
- 允许你直接反问，或者顺势开启一个轻微转向但仍有关联的新话题。
- 不要解释理由，不要主持人式控场，不要连续提多个问题。
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

  env.CLAUDE_AGENT_SDK_CLIENT_APP = "skillbar-online/0.1.0";

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
      model: "haiku",
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
