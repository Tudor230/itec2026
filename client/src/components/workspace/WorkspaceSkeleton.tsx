export default function WorkspaceSkeleton() {
  return (
    <div className="m-0 h-dvh w-screen overflow-hidden bg-[var(--bg-base)] p-0">
      <div className="flex h-full w-full flex-col">
        {/* Top Bar Skeleton */}
        <div className="h-[52px] border-b border-[var(--line)] bg-[rgba(255,255,255,0.05)] flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--line)] animate-pulse" />
            <div className="space-y-1">
              <div className="w-16 h-2 bg-[var(--line)] animate-pulse rounded" />
              <div className="w-24 h-3 bg-[var(--line)] animate-pulse rounded" />
            </div>
          </div>
          <div className="w-48 h-8 rounded-full bg-[var(--line)] animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="w-24 h-8 rounded-lg bg-[var(--line)] animate-pulse" />
            <div className="w-8 h-8 rounded-full bg-[var(--line)] animate-pulse" />
          </div>
        </div>

        {/* Tabs Skeleton */}
        <div className="h-[44px] border-b border-[var(--line)] bg-[rgba(255,255,255,0.02)] flex items-center px-4 gap-2">
          <div className="w-32 h-7 rounded-lg bg-[var(--line)] animate-pulse" />
          <div className="w-32 h-7 rounded-lg bg-[var(--line)] animate-pulse opacity-60" />
          <div className="w-32 h-7 rounded-lg bg-[var(--line)] animate-pulse opacity-40" />
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Skeleton */}
          <div className="w-[260px] border-r border-[var(--line)] bg-[rgba(255,255,255,0.01)] p-4 space-y-4">
            <div className="w-full h-8 rounded-lg bg-[var(--line)] animate-pulse" />
            <div className="space-y-3 pt-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[var(--line)] animate-pulse" />
                  <div className={i % 2 === 0 ? "w-24 h-3 bg-[var(--line)] animate-pulse rounded" : "w-32 h-3 bg-[var(--line)] animate-pulse rounded"} />
                </div>
              ))}
            </div>
          </div>

          {/* Main Content Skeleton */}
          <div className="flex-1 flex flex-col p-6 space-y-4">
             <div className="w-3/4 h-4 bg-[var(--line)] animate-pulse rounded" />
             <div className="w-full h-[1px] bg-[var(--line)]" />
             <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
                   <div key={i} className="flex gap-4">
                      <div className="w-8 h-3 bg-[var(--line)] animate-pulse rounded opacity-40 shrink-0" />
                      <div className="w-full h-3 bg-[var(--line)] animate-pulse rounded" 
                           style={{ width: `${Math.floor(Math.random() * 40) + 60}%` }} />
                   </div>
                ))}
             </div>
          </div>

          {/* Right Rail Skeleton */}
          <div className="w-[48px] border-l border-[var(--line)] bg-[rgba(255,255,255,0.02)] flex flex-col items-center py-4 gap-4">
            <div className="w-8 h-8 rounded-lg bg-[var(--line)] animate-pulse" />
            <div className="w-8 h-8 rounded-lg bg-[var(--line)] animate-pulse" />
          </div>
        </div>

        {/* Bottom Drawer Skeleton */}
        <div className="h-[40px] border-t border-[var(--line)] bg-[rgba(255,255,255,0.05)] flex items-center px-4 gap-4">
           {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="w-20 h-4 bg-[var(--line)] animate-pulse rounded opacity-60" />
           ))}
        </div>
      </div>
    </div>
  )
}
