import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ensureSkillBarScheduler,
  kickSkillBarScheduler,
} from "@/lib/skillbar-scheduler";
import {
  UserInputGuardUnavailableError,
  isUserInputAllowed,
} from "@/lib/input-guard";
import {
  addUserMessage,
  getAnthropicConfig,
  getSnapshot,
} from "@/lib/skillbar-store";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  content: z.string().trim().min(1, "消息不能为空。"),
});

export async function POST(request: Request) {
  ensureSkillBarScheduler();
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "请先登录后再发送消息。" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "消息格式错误。" },
      { status: 400 },
    );
  }

  let allowed = true;

  try {
    allowed = await isUserInputAllowed(parsed.data.content, getAnthropicConfig());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof UserInputGuardUnavailableError
            ? error.message
            : error instanceof Error
              ? error.message
              : "消息校验失败。",
      },
      {
        status: error instanceof UserInputGuardUnavailableError ? 503 : 500,
      },
    );
  }

  if (!allowed) {
    return NextResponse.json(getSnapshot(session.user));
  }

  try {
    const snapshot = addUserMessage(session.user, parsed.data.content);
    kickSkillBarScheduler();
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
