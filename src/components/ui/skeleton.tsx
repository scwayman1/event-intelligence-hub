import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0",
        "before:-translate-x-full before:animate-[shimmer_2s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

/** A row skeleton useful for table/list loading states */
function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4 rounded", i === 0 ? "w-32" : "w-20")}
        />
      ))}
    </div>
  );
}

/** A card skeleton useful for metric/panel loading states */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("glass-panel p-5 space-y-3", className)}>
      <Skeleton className="h-3 w-24 rounded" />
      <Skeleton className="h-7 w-16 rounded" />
      <Skeleton className="h-3 w-32 rounded" />
    </div>
  );
}

export { Skeleton, SkeletonRow, SkeletonCard };
