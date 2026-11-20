import { HealthResponseSchema, type HealthResponse } from "@helpharbor/contracts";

export type ApiStatus =
  | { state: "up"; health: HealthResponse }
  | { state: "down"; reason: string };

/** Interprets a health response body against the shared contract. */
export function readHealth(body: unknown): ApiStatus {
  const result = HealthResponseSchema.safeParse(body);
  return result.success
    ? { state: "up", health: result.data }
    : { state: "down", reason: "API returned an unexpected health payload" };
}

/** Server-side check used by the console header; never throws. */
export async function fetchApiStatus(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiStatus> {
  try {
    const response = await fetchImpl(new URL("/api/v1/health", baseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return { state: "down", reason: `API responded with HTTP ${response.status}` };
    return readHealth(await response.json());
  } catch {
    return { state: "down", reason: "API is unreachable" };
  }
}
