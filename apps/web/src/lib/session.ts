import { ErrorEnvelopeSchema, SessionResponseSchema, type SessionResponse } from "@helpharbor/contracts";

export type SessionState =
  | { state: "authenticated"; session: SessionResponse }
  | { state: "anonymous" }
  | { state: "expired" }
  | { state: "unavailable"; reason: string };

/**
 * Resolves the signed-in user on the server by forwarding the browser's
 * cookies to `GET /api/v1/auth/session`. Never throws.
 */
export async function fetchSession(
  baseUrl: string,
  cookieHeader: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionState> {
  if (!cookieHeader) return { state: "anonymous" };
  let response: Response;
  try {
    response = await fetchImpl(new URL("/api/v1/auth/session", baseUrl), {
      headers: { cookie: cookieHeader, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    return { state: "unavailable", reason: "API is unreachable" };
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const parsed = SessionResponseSchema.safeParse(body);
    return parsed.success
      ? { state: "authenticated", session: parsed.data }
      : { state: "unavailable", reason: "API returned an unexpected session payload" };
  }
  if (response.status === 401) {
    const code = ErrorEnvelopeSchema.safeParse(body).data?.error.code;
    return code === "session_expired" ? { state: "expired" } : { state: "anonymous" };
  }
  return { state: "unavailable", reason: `API responded with HTTP ${response.status}` };
}
