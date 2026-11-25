"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { loginErrorMessage, postJson } from "@/lib/auth-client";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await postJson("/api/v1/auth/login", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (result.ok) {
      router.replace(returnTo);
      router.refresh();
      return;
    }
    setBusy(false);
    setError(loginErrorMessage(result.code));
  }

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      <label htmlFor="email">Work email</label>
      <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
