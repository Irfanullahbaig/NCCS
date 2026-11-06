export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
    </div>
  );
}
