import { NextResponse } from "next/server";

import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSnapshot } from "@/lib/skillbar-store";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureSkillBarScheduler();
  const session = await getSessionFromRequest(request);
  return NextResponse.json(getSnapshot(session?.user ?? null));
}
