import { NextResponse } from "next/server";

import { authProviderFlags } from "@/lib/auth";
import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSessionFromRequest } from "@/lib/session";
import { getSnapshot } from "@/lib/skillbar-store";
import type { SkillBarBootstrap } from "@/lib/skillbar-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureSkillBarScheduler();
  const session = await getSessionFromRequest(request);

  return NextResponse.json({
    authProviders: authProviderFlags,
    snapshot: getSnapshot(session?.user ?? null),
  } satisfies SkillBarBootstrap);
}
