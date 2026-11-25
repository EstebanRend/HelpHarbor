export const DEFAULT_AFTER_LOGIN = "/console";

/**
 * Only same-site paths are allowed after sign-in, so a crafted
 * `?returnTo=https://evil.example` or `//evil.example` cannot redirect away.
 */
export function safeReturnTo(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  try {
    const url = new URL(candidate, "http://helpharbor.invalid");
    if (url.origin !== "http://helpharbor.invalid" || url.pathname.startsWith("/login")) return DEFAULT_AFTER_LOGIN;
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}

export function loginUrl(returnTo: string, expired = false): string {
  const params = new URLSearchParams();
  if (expired) params.set("expired", "1");
  params.set("returnTo", safeReturnTo(returnTo));
  return `/login?${params.toString()}`;
}
