import { Skeleton } from './ui/skeleton';

interface SkeletonTableProps {
  readonly rows?: number;
  readonly columns?: number;
}

/**
 * Pulsing placeholder rows for list views while Server Actions fetch data.
 *
 * Built on the shadcn-style `Skeleton` primitive（`animate-pulse` は Skeleton 側で提供）。
 */
export function SkeletonTable({ rows = 4, columns = 4 }: SkeletonTableProps) {
  return (
    // Skeleton 自体が pulse 表示を持つため、独自の loading class は使わない。
    <div className="space-y-3" aria-busy="true" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
