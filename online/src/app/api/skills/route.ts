import { NextResponse } from "next/server";

import {
  ensureSkillBarScheduler,
  kickSkillBarScheduler,
} from "@/lib/skillbar-scheduler";
import { upsertAgentFromSkill } from "@/lib/skillbar-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  ensureSkillBarScheduler();
  const formData = await request.formData();
  const file = formData.get("skill");
  const ownerName = formData.get("ownerName");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传一个 SKILL.md 文件。" }, { status: 400 });
  }

  if (typeof ownerName !== "string" || !ownerName.trim()) {
    return NextResponse.json({ error: "请输入这个 Skill 的原主人姓名。" }, { status: 400 });
  }

  const content = await file.text();

  try {
    const snapshot = upsertAgentFromSkill(ownerName, content);
    kickSkillBarScheduler();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传 Skill 失败。" },
      { status: 400 },
    );
  }
}
