import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/return-to";
import { getSessionState } from "@/lib/server-session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  const state = await getSessionState();
  if (state.state === "authenticated") redirect(returnTo);

  return (
    <main id="main" className="auth-page">
      <div className="auth-card">
        <h1>Sign in to HelpHarbor</h1>
        {params.expired === "1" || state.state === "expired" ? (
          <p className="notice" role="status">
            Your session has ended. Sign in again to continue.
          </p>
        ) : null}
        {state.state === "unavailable" ? (
          <p className="form-error" role="alert">
            HelpHarbor is unavailable right now ({state.reason}).
          </p>
        ) : null}
        <LoginForm returnTo={returnTo} />
      </div>
    </main>
  );
}
