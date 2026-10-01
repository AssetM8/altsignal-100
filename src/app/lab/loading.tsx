export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-4" role="status" aria-label="Loading">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-20 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
      </div>
    </div>
  );
}
