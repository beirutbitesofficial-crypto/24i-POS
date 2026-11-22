export default function Loading() {
  return (
    <div className="flex h-dvh flex-col bg-ivory-100" aria-busy="true">
      <div className="h-16 bg-ink-900" />
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 p-4">
          <div className="mb-4 flex gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-11 w-28 rounded-xl" />)}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton h-[132px] rounded-2xl" />)}
          </div>
        </div>
        <div className="hidden w-[400px] border-s border-ivory-300 bg-ivory-50 lg:block" />
      </div>
    </div>
  );
}
