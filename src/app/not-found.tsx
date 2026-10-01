import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl border border-line bg-panel p-6">
      <h1 className="text-lg font-semibold">Not in the universe</h1>
      <p className="mt-2 text-sm text-muted">That ticker is not one of the 100 companies in the current universe snapshot, and no previous ticker maps to it.</p>
      <Link href="/explorer" className="mt-4 inline-block text-sm text-cyan underline">Browse all companies</Link>
    </div>
  );
}
