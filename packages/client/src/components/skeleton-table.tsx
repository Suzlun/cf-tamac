import { Skeleton } from './ui/skeleton';

interface SkeletonTableProps {
  readonly rows?: number;
  readonly columns?: number;
}

/**
 * Pulsing placeholder rows for list views while Server Actions fetch data.
 *
 * Built on the shadcn-style `Skeleton` primitive with the existing
 * `skeleton-pulse` keyframe retained via the `state-loading` class per the
 * wireframe §5.1 `SkeletonTable` mapping.
 */
export function SkeletonTable({ rows = 4, columns = 4 }: SkeletonTableProps) {
  return (
    <div className="state-loading space-y-3" aria-busy="true" aria-label="Loading table">
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
