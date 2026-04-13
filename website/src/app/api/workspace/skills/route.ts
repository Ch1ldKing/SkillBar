import { NextResponse } from "next/server";

import { kickSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSessionFromRequest } from "@/lib/session";
import { upsertAgentFromSkill } from "@/lib/skillbar-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("skill");
  const ownerName = formData.get("ownerName");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传一个 SKILL.md 文件。" }, { status: 400 });
  }

  if (typeof ownerName !== "string" || !ownerName.trim()) {
    return NextResponse.json({ error: "请输入这个 Skill 的原主人姓名。" }, { status: 400 });
  }

  try {
    const snapshot = await upsertAgentFromSkill(session.user, ownerName, await file.text());
    kickSkillBarScheduler();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传 Skill 失败。" },
      { status: 400 },
    );
  }
}
