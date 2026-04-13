import { NextResponse } from "next/server";
import { z } from "zod";

import { kickSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSessionFromRequest } from "@/lib/session";
import { addUserMessage } from "@/lib/skillbar-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  content: z.string().trim().min(1, "消息不能为空。"),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "消息格式错误。" },
      { status: 400 },
    );
  }

  try {
    const snapshot = await addUserMessage(session.user, parsed.data.content);
    kickSkillBarScheduler();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发送消息失败。" },
      { status: 400 },
    );
  }
}
