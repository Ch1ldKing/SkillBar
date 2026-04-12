import { NextResponse } from "next/server";

import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSnapshot } from "@/lib/skillbar-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ensureSkillBarScheduler();
  return NextResponse.json(getSnapshot());
}
