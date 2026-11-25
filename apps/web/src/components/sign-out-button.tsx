"use client";

import { useState } from "react";
import { postJson } from "@/lib/auth-client";

export function SignOutButton({ csrfToken }: { csrfToken: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    // A 401 means the session already ended; either way the user lands on sign-in.
    await postJson("/api/v1/auth/logout", undefined, csrfToken);
    window.location.assign("/login");
  }

  return (
    <button type="button" className="link-button" onClick={() => void signOut()} disabled={busy}>
      Sign out
    </button>
  );
}
