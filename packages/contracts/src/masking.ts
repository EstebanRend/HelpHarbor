/**
 * Helpers for keeping personal data out of logs, error reports and fixtures
 * shown in docs. They are deliberately lossy: the result is meant for a human
 * to recognise ("which account was that?"), not to look anything up.
 */

const EMAIL_PATTERN = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** `marta.admin@acme-cloud.example` → `m***@acme-cloud.example`. Anything that is not an email becomes `***`. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return "***";
  return `${trimmed[0]}***@${trimmed.slice(at + 1).toLowerCase()}`;
}

/** `Marta Ruiz` → `M. R.`; keeps initials only. */
export function maskName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}.`);
  return initials.length > 0 ? initials.join(" ") : "***";
}

/** Masks every email address inside free text, such as an error message or stack trace. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, (_match, local: string, domain: string) => `${local[0]}***@${domain.toLowerCase()}`);
}
