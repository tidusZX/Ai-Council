import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Mirrors PostingPlanCard's outer shape so the skeleton-to-content
 * transition doesn't shift the layout: dark summary bar at the top,
 * 4 week-blocks each containing ~2 placeholder rows, and a small
 * format-mix legend at the bottom.
 */
export function PlanSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {/* Summary bar */}
      <div className="rounded-xl bg-zinc-900 px-6 py-5 space-y-3">
        <Skeleton className="bg-zinc-700 h-3 w-32" />
        <Skeleton className="bg-zinc-700 h-4 w-3/4" />
        <div className="flex gap-3">
          <Skeleton className="bg-zinc-700 h-3 w-20" />
          <Skeleton className="bg-zinc-700 h-3 w-24" />
          <Skeleton className="bg-zinc-700 h-3 w-16" />
        </div>
      </div>

      {/* 4 weeks of placeholder picks */}
      {[1, 2, 3, 4].map((week) => (
        <div key={week} className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <div className="grid gap-3">
            {[0, 1].map((slot) => (
              <div
                key={slot}
                className="rounded-xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-4 w-20 rounded" />
                    </div>
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                  <div className="text-right space-y-1">
                    <Skeleton className="h-7 w-10 ml-auto" />
                    <Skeleton className="h-3 w-12 ml-auto" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Format mix legend */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24 rounded" />
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-6 w-28 rounded" />
          <Skeleton className="h-6 w-16 rounded" />
        </div>
      </div>
    </div>
  )
}
