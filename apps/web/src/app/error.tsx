"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="auth-page">
      <div className="auth-card">
        <h1>Something went wrong</h1>
        <p className="form-error" role="alert">
          {error.digest ? `Reference ${error.digest}. ` : null}HelpHarbor could not load this page.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
