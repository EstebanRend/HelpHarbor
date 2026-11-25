"use client";

import type { MembershipSummary } from "@helpharbor/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isSessionLost, postJson } from "@/lib/auth-client";
import { loginUrl } from "@/lib/return-to";

interface Props {
  memberships: MembershipSummary[];
  activeSlug: string | null;
  csrfToken: string;
}

export function WorkspaceSwitcher({ memberships, activeSlug, csrfToken }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (memberships.length === 0) {
    return <span className="workspace">No workspace</span>;
  }
  if (memberships.length === 1) {
    return <span className="workspace">{memberships[0]?.tenant.name}</span>;
  }

  async function switchTo(tenantSlug: string) {
    setError(null);
    const result = await postJson("/api/v1/auth/switch-tenant", { tenantSlug }, csrfToken);
    if (isSessionLost(result)) {
      window.location.assign(loginUrl(window.location.pathname, true));
      return;
    }
    if (!result.ok) {
      setError("Could not switch workspace.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="workspace-switcher">
      <label htmlFor="workspace">Workspace</label>
      <select
        id="workspace"
        value={activeSlug ?? ""}
        disabled={pending}
        onChange={(event) => void switchTo(event.target.value)}
      >
        {memberships.map((m) => (
          <option key={m.tenant.slug} value={m.tenant.slug}>
            {m.tenant.name} ({m.role})
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" className="form-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
