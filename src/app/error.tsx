"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl border border-neg/50 bg-panel p-6" role="alert">
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "An unexpected error occurred while reading the analytics database."}</p>
      {error.digest ? <p className="mt-1 text-2xs text-faint">Reference {error.digest}</p> : null}
      <button type="button" onClick={reset} className="mt-4 border border-cyan/60 px-3 py-1 text-sm text-cyan">
        Try again
      </button>
    </div>
  );
}
