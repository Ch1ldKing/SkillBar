import { SkillBarApp } from "@/components/skillbar-app";
import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSnapshot } from "@/lib/skillbar-store";

export const dynamic = "force-dynamic";

export default function Home() {
  ensureSkillBarScheduler();

  return <SkillBarApp initialSnapshot={getSnapshot()} />;
}
