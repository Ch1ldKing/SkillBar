import { NextResponse } from "next/server";

import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSessionFromRequest } from "@/lib/session";
import { getSnapshot } from "@/lib/skillbar-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  ensureSkillBarScheduler();
  return NextResponse.json(await getSnapshot(session.user));
}
