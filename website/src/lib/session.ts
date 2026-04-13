import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

async function getPageSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getOptionalSession() {
  try {
    return await getPageSession();
  } catch (error) {
    console.error("[skillbar-website] Failed to load optional session", error);
    return null;
  }
}

export async function getSessionFromRequest(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export async function requirePageSession() {
  const session = await getPageSession();

  if (!session) {
    redirect("/");
  }

  return session;
}
