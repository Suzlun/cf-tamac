import { cn } from './cn';

/** Props for the shadcn-style Skeleton component. */
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * shadcn-style Skeleton placeholder with control-room pulse animation.
 *
 * Uses the existing `skeleton-pulse` keyframe from `globals.css` via the
 * `state-loading` class, combined with `--line` background for the pulsing
 * bar effect per the wireframe §4.5 `.state-loading` token.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn('state-loading rounded-md bg-line/40', className)} {...props} />;
}
