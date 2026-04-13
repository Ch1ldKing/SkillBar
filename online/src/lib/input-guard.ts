import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { AnthropicConfig } from "@/lib/skillbar-store";

const INPUT_GUARD_MODEL = "gpt-5.4-mini";

const inputGuardResultSchema = z.object({
  allowed: z.boolean(),
});

export class UserInputGuardUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputGuardUnavailableError";
  }
}

function buildClient(config: AnthropicConfig) {
  return new Anthropic({
    apiKey: config.apiKey ?? undefined,
    authToken: config.authToken ?? undefined,
    baseURL: config.baseUrl ?? undefined,
    maxRetries: 1,
    timeout: 20_000,
  });
}

function buildGuardPrompt(content: string) {
  return `
请审核下面这条用户输入是否适合出现在公开群聊产品里。

<user_input>
${content}
</user_input>
`.trim();
}

export async function isUserInputAllowed(content: string, anthropic: AnthropicConfig) {
  if (!anthropic.apiKey && !anthropic.authToken) {
    throw new UserInputGuardUnavailableError("消息校验服务暂时不可用，请稍后再试。");
  }

  try {
    const client = buildClient(anthropic);
    const response = await client.messages.parse({
      model: INPUT_GUARD_MODEL,
      max_tokens: 128,
      temperature: 0,
      system: `
你是输入合规审核器
你的唯一任务是判断用户消息是否适合在公开群聊产品中展示。

判定为不允许的内容包括：
- 明显违法、犯罪协助、诈骗、钓鱼、盗号、恶意软件、洗钱或规避执法
- 暴力威胁、恐怖主义、教唆自残或自杀
- 涉及未成年人的色情内容
- 明确的人身攻击、仇恨、霸凌、人肉、泄露隐私、煽动歧视、引起矛盾、负能量很重（比如谁死了）
- 大量淫秽低俗或其他明显违规内容
- 明显的脏话
允许的内容包括：
- 正常聊天、提问、讨论、吐槽和观点表达
- 合法合规前提下的技术、学习、创作、工作交流
- 不带明显伤害指向的日常口语

请只根据消息文本本身判断，不要过度拦截。
你只需要返回一个 JSON，对应字段只有 allowed，值只能是 true 或 false。
`.trim(),
      messages: [{ role: "user", content: buildGuardPrompt(content) }],
      output_config: {
        format: zodOutputFormat(inputGuardResultSchema),
      },
    });

    const result = response.parsed_output;

    if (!result) {
      throw new Error("missing parsed output");
    }

    return result.allowed;
  } catch (error) {
    console.error("[skillbar-online] Failed to validate user input", error);
    throw new UserInputGuardUnavailableError("消息校验服务暂时不可用，请稍后再试。");
  }
}
