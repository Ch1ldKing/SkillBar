import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ensureSkillBarScheduler,
  kickSkillBarScheduler,
  resetSkillBarSchedulerState,
} from "@/lib/skillbar-scheduler";
import { resetSkillBarState, setSchedulerPaused } from "@/lib/skillbar-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["pause", "resume", "reset"]),
});

export async function POST(request: Request) {
  ensureSkillBarScheduler();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "控制指令格式错误。" }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case "pause":
        return NextResponse.json(setSchedulerPaused(true));
      case "resume": {
        const snapshot = setSchedulerPaused(false);
        kickSkillBarScheduler();
        return NextResponse.json(snapshot);
      }
      case "reset": {
        resetSkillBarSchedulerState();
        return NextResponse.json(resetSkillBarState());
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "执行控制指令失败。",
      },
      { status: 400 },
    );
  }
}
