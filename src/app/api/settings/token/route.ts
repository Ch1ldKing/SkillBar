import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { saveAnthropicConfig } from "@/lib/skillbar-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  apiKey: z.string(),
  authToken: z.string(),
  baseUrl: z.string(),
});

export async function POST(request: Request) {
  ensureSkillBarScheduler();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Anthropic 配置格式错误。" }, { status: 400 });
  }

  try {
    return NextResponse.json(saveAnthropicConfig(parsed.data));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "保存 Anthropic 配置失败。",
      },
      { status: 400 },
    );
  }
}
