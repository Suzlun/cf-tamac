import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS class names with conflict resolution.
 *
 * Combines `clsx` conditional class joining with `tailwind-merge` deduplication
 * so shadcn-style components can override base classes safely.
 */
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs));
}
