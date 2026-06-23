import { cn } from './cn';

/**
 * shadcn-style Table component set customized to the control-room theme.
 *
 * Composes Table / TableHeader / TableBody / TableRow / TableHead / TableCell
 * using plain HTML table elements with `--line` borders, `--signal` headers,
 * and `--paper` cell text per the wireframe §4.7 token mapping.
 */
const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-auto">
    <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
  </div>
);
Table.displayName = 'Table';

const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />
);
TableHeader.displayName = 'TableHeader';

const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
);
TableBody.displayName = 'TableBody';

const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn('border-b border-border transition-colors hover:bg-paper/5', className)}
    {...props}
  />
);
TableRow.displayName = 'TableRow';

const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      'h-10 px-3 text-left align-middle font-mono text-xs uppercase tracking-wider text-primary',
      className
    )}
    {...props}
  />
);
TableHead.displayName = 'TableHead';

const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('p-3 align-middle font-mono text-sm text-foreground', className)} {...props} />
);
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
