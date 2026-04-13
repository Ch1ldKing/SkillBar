import "server-only";

import { headers } from "next/headers";

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
    console.error("[skillbar-online] Failed to load optional session", error);
    return null;
  }
}

export async function getSessionFromRequest(request: Request) {
  try {
    return await auth.api.getSession({
      headers: request.headers,
    });
  } catch (error) {
    console.error("[skillbar-online] Failed to load session from request", error);
    return null;
  }
}
