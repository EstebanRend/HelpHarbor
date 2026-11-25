import { CSRF_HEADER_NAME, ErrorEnvelopeSchema } from "@helpharbor/contracts";

export type ApiResult = { ok: true; body: unknown } | { ok: false; status: number; code: string };

/** Same-origin JSON POST from the browser; `/api/*` is proxied to the API by Next.js. */
export async function postJson(
  path: string,
  body: unknown,
  csrfToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, body: json };
  const code = ErrorEnvelopeSchema.safeParse(json).data?.error.code ?? "request_failed";
  return { ok: false, status: response.status, code };
}

/** True when the API says the session is gone and the user must sign in again. */
export function isSessionLost(result: ApiResult): boolean {
  return !result.ok && result.status === 401;
}

export function loginErrorMessage(code: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "validation_failed":
      return "Enter a valid email address and your password.";
    case "network_error":
      return "Can't reach HelpHarbor. Check your connection and try again.";
    default:
      return "Sign-in failed. Try again in a moment.";
  }
}
