import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

import type { ReactNode } from 'react';

type SortDirection = 'ascending' | 'descending' | 'none';

interface DataTableHeader {
  readonly label: string;
  readonly content?: ReactNode;
  readonly ariaSort?: SortDirection;
}

interface DataTableProps {
  readonly headers: readonly (string | DataTableHeader)[];
  readonly rows: readonly (readonly ReactNode[])[];
  readonly ariaLabel?: string;
}

/**
 * Management Client の一覧表示に使う responsive data table です。
 *
 * @param headers - header label または `aria-sort` と custom content を持つ header 定義です。
 * @param rows - header 順に並んだ cell React node の二次元配列です。空配列の場合は table body が空で描画されます。
 * @param ariaLabel - table の用途を支援技術へ伝える任意 label です。
 * @returns shadcn/ui `Table` primitive を使った table wrapper を返します。
 *
 * @remarks
 * 各 cell には対応する header label を `data-label` として付け、小さい画面で label/value pair として読めるようにします。
 * この component は表示専用で、sort 状態の変更や network access などの副作用は持ちません。row の長さが header より短い場合、
 * 存在しない header label は空文字として扱います。
 *
 * @example
 * ```tsx
 * <DataTable
 *   ariaLabel="Managed Agents"
 *   headers={[{ label: 'Agent ID', ariaSort: 'ascending' }, 'Status']}
 *   rows={[[agent.agentId, agent.status]]}
 * />
 * ```
 */
export function DataTable({ headers, rows, ariaLabel }: DataTableProps) {
  const normalizedHeaders = headers.map(normalizeHeader);
  return (
    // table-only responsive shim class は使わず、Shadcn Table primitive と data-label で対応する。
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table aria-label={ariaLabel}>
        <TableHeader>
          <TableRow>
            {normalizedHeaders.map((header, index) => (
              <TableHead
                key={`th-${String(index)}`}
                aria-sort={header.ariaSort}
                className="h-12 px-4 text-xs uppercase tracking-wide"
              >
                {header.content ?? header.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={`row-${String(rowIndex)}`}>
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={`cell-${String(rowIndex)}-${String(cellIndex)}`}
                  data-label={normalizedHeaders.at(cellIndex)?.label ?? ''}
                  className="px-4 py-3 align-top leading-6"
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function normalizeHeader(header: string | DataTableHeader): DataTableHeader {
  if (typeof header === 'string') {
    return { label: header };
  }
  return header;
}
