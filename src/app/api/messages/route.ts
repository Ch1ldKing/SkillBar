import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { addUserMessage } from "@/lib/skillbar-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  content: z.string().trim().min(1, "消息不能为空。"),
});

export async function POST(request: Request) {
  ensureSkillBarScheduler();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "消息格式错误。" },
      { status: 400 },
    );
  }

  try {
    const snapshot = addUserMessage(parsed.data.content);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "发送消息失败。",
      },
      { status: 400 },
    );
  }
}
