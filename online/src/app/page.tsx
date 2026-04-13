import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SkillBarApp } from "@/components/skillbar-app";
import type { SkillBarBootstrap } from "@/lib/skillbar-types";

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

function normalizeOrigin(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getBootstrapUrlFromHeaders(headerStore: Headers) {
  const backendOrigin = process.env.SKILLBAR_BACKEND_ORIGIN?.trim();

  if (backendOrigin) {
    return `${normalizeOrigin(backendOrigin)}/api/bootstrap`;
  }

  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

  if (!host) {
    throw new Error("Unable to determine the current request host.");
  }

  const protocol =
    headerStore.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");

  return `${protocol}://${host}/api/bootstrap`;
}

async function loadBootstrap() {
  const headerStore = await headers();
  const url = getBootstrapUrlFromHeaders(headerStore);
  const forwardedHeaders = new Headers();
  const cookie = headerStore.get("cookie");
  const userAgent = headerStore.get("user-agent");
  const forwardedHost = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const forwardedProto = headerStore.get("x-forwarded-proto");

  if (cookie) {
    forwardedHeaders.set("cookie", cookie);
  }

  if (userAgent) {
    forwardedHeaders.set("user-agent", userAgent);
  }

  if (forwardedHost) {
    forwardedHeaders.set("x-forwarded-host", forwardedHost);
  }

  if (forwardedProto) {
    forwardedHeaders.set("x-forwarded-proto", forwardedProto);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: forwardedHeaders,
  });

  if (!response.ok) {
    throw new Error(`Failed to load SkillBar bootstrap data: ${response.status}`);
  }

  return (await response.json()) as SkillBarBootstrap;
}

export default async function Home({ searchParams }: HomeProps) {
  const [params, bootstrap] = await Promise.all([searchParams, loadBootstrap()]);

  if (typeof params.code === "string" && typeof params.state === "string") {
    const normalized = normalizeSearchParams(params).toString();

    if (bootstrap.authProviders.linuxdo && !bootstrap.authProviders.github) {
      redirect(`/api/auth/oauth2/callback/linuxdo?${normalized}`);
    }

    if (bootstrap.authProviders.github && !bootstrap.authProviders.linuxdo) {
      redirect(`/api/auth/callback/github?${normalized}`);
    }
  }

  return (
    <SkillBarApp
      authProviders={bootstrap.authProviders}
      initialSnapshot={bootstrap.snapshot}
    />
  );
}
