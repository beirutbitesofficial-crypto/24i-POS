/** Shown instantly while a back-office page loads (also prefetched for sidebar links). */
export default function Loading() {
  return (
    <div className="animate-fade-in" aria-busy="true">
      <div className="mb-6 space-y-3">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-8 w-64" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
      </div>
      <div className="rounded-2xl border border-ivory-300 bg-ivory-50 p-5">
        <div className="skeleton mb-5 h-5 w-48" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-10" style={{ opacity: 1 - i * 0.12 }} />)}
        </div>
      </div>
    </div>
  );
}
