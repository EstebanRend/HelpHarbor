import type { SessionResponse } from "@helpharbor/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginUrl } from "./return-to";
import { fetchSession, type SessionState } from "./session";

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:4000";
}

async function cookieHeader(): Promise<string | undefined> {
  const header = (await cookies()).toString();
  return header === "" ? undefined : header;
}

export async function getSessionState(): Promise<SessionState> {
  return fetchSession(apiBaseUrl(), await cookieHeader());
}

/**
 * For protected pages: returns the session, or redirects to sign-in
 * (with `expired=1` when the API says the session timed out).
 */
export async function requireSession(currentPath: string): Promise<SessionResponse> {
  const state = await getSessionState();
  if (state.state === "authenticated") return state.session;
  if (state.state === "unavailable") throw new Error(state.reason);
  redirect(loginUrl(currentPath, state.state === "expired"));
}

/** Server-side GET to the API on behalf of the signed-in user. */
export async function apiGet(path: string): Promise<Response> {
  return fetch(new URL(path, apiBaseUrl()), {
    headers: { cookie: (await cookieHeader()) ?? "", accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
}
