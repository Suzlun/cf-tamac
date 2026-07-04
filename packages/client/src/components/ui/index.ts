/**
 * Shadcn UI primitive のバレルエクスポート。
 *
 * `cn` ヘルパーは `src/lib/utils.ts` に一本化しており（タスク1.4）、
 * 重複していた `./cn` からは再エクスポートしない。
 * 各 application composition は原則として個別の `./<component>` を直接 import するが、
 * 一括取得が必要な場面のために主要 primitive をここで公開する。
 *
 * Agent RPC / credential / server-only module には一切依存しない表示専用 primitive である。
 */
export { cn } from '@cf-tamac/client/lib/utils';

export { Badge, badgeVariants, type BadgeProps } from './badge';
export { Button, buttonVariants, type ButtonProps } from './button';
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card';
export { Input } from './input';
export { Label } from './label';
export { Alert, AlertTitle, AlertDescription } from './alert';
export { Skeleton } from './skeleton';
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table';
export { Separator } from './separator';
export { Textarea } from './textarea';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './select';
export {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  Form,
  useFormField,
} from './form';
