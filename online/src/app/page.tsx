import { redirect } from "next/navigation";

import { SkillBarApp } from "@/components/skillbar-app";
import { authProviderFlags } from "@/lib/auth";
import { ensureSkillBarScheduler } from "@/lib/skillbar-scheduler";
import { getSnapshot } from "@/lib/skillbar-store";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function normalizeSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  const normalized = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      normalized.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        normalized.append(key, item);
      }
    }
  }

  return normalized;
}

export default async function Home({ searchParams }: HomeProps) {
  const [params, session] = await Promise.all([searchParams, getOptionalSession()]);

  if (typeof params.code === "string" && typeof params.state === "string") {
    const normalized = normalizeSearchParams(params).toString();

    if (authProviderFlags.linuxdo && !authProviderFlags.github) {
      redirect(`/api/auth/oauth2/callback/linuxdo?${normalized}`);
    }

    if (authProviderFlags.github && !authProviderFlags.linuxdo) {
      redirect(`/api/auth/callback/github?${normalized}`);
    }
  }

  ensureSkillBarScheduler();

  return (
    <SkillBarApp
      authProviders={authProviderFlags}
      initialSnapshot={getSnapshot(session?.user ?? null)}
    />
  );
}
