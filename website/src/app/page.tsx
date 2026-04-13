import { redirect } from "next/navigation";

import { LandingShell } from "@/components/landing-shell";
import { WorkspaceShell } from "@/components/workspace-shell";
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

  if (session) {
    ensureSkillBarScheduler();

    return (
      <WorkspaceShell
        currentUser={{
          email: session.user.email,
          image: session.user.image ?? null,
          name: session.user.name ?? null,
        }}
        initialSnapshot={await getSnapshot(session.user)}
      />
    );
  }

  if (typeof params.code === "string" && typeof params.state === "string") {
    const normalized = normalizeSearchParams(params).toString();

    // Local OAuth providers are sometimes configured to redirect to `/`.
    // If there is only one enabled provider, forward the callback to Better Auth's real endpoint.
    if (authProviderFlags.linuxdo && !authProviderFlags.github) {
      redirect(`/api/auth/oauth2/callback/linuxdo?${normalized}`);
    }

    if (authProviderFlags.github && !authProviderFlags.linuxdo) {
      redirect(`/api/auth/callback/github?${normalized}`);
    }
  }

  return (
    <LandingShell providers={authProviderFlags} />
  );
}
