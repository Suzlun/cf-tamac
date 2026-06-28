import Link from 'next/link';

import { Button } from './ui/button';

interface PageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

interface PaginationBarProps {
  readonly basePath: string;
  readonly page: PageInfo;
  readonly pageSize?: number;
  readonly currentPageToken?: string;
  readonly extraQuery?: Readonly<Record<string, string | undefined>>;
}

/**
 * Agent-owned list view 用の cursor-based pagination bar。
 *
 * @param basePath - pagination link の route path。
 * @param page - Server Action が返した Browser-safe page metadata。
 * @param pageSize - Agent RPC へ送る visual page size。未指定時は 25。
 * @param currentPageToken - 現在 page の opaque cursor。
 * @param extraQuery - filter 条件を維持するための query parameter。
 * @returns 前後 page link と cursor scope 表示。
 * @throws 例外は送出しない。opaque cursor は復号せず URL query として渡す。
 * @example
 * ```tsx
 * <PaginationBar basePath="/agents/a/threads" page={page} />
 * ```
 */
export function PaginationBar({
  basePath,
  page,
  pageSize = 25,
  currentPageToken,
  extraQuery = {},
}: PaginationBarProps) {
  const nextHref = buildPageHref(basePath, {
    ...extraQuery,
    pageToken: page.nextPageToken,
    pageSize: String(pageSize),
  });
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" size="sm" disabled aria-disabled="true">
        Previous
      </Button>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Page size: {pageSize} · result count: {page.resultCount} · cursor scope:{' '}
        {page.cursorScope ?? 'agent scoped'}
      </span>
      {page.nextPageToken === undefined ? (
        <Button type="button" variant="outline" size="sm" disabled aria-disabled="true">
          Next
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={nextHref} aria-label="Next page">
            Next
          </Link>
        </Button>
      )}
      {currentPageToken === undefined ? null : (
        <span className="text-xs text-muted-foreground">current cursor: {currentPageToken}</span>
      )}
    </nav>
  );
}

function buildPageHref(
  basePath: string,
  query: Readonly<Record<string, string | undefined>>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, value);
    }
  }
  const queryString = params.toString();
  return queryString === '' ? basePath : `${basePath}?${queryString}`;
}
