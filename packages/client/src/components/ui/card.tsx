import { cn } from './cn';

/**
 * shadcn-style Card component customized to the control-room theme.
 *
 * Composes Card / CardHeader / CardTitle / CardDescription / CardContent
 * using the control-room `--panel`, `--line`, and `--signal` tokens via
 * Tailwind semantic slots (`bg-card`, `border-border`, `text-card-foreground`).
 */
const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'rounded-2xl border border-border bg-card text-card-foreground shadow-[0_24px_80px_rgba(0,0,0,0.42)]',
      className
    )}
    {...props}
  />
);
Card.displayName = 'Card';

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
);
CardHeader.displayName = 'CardHeader';

const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('font-serif text-2xl leading-tight tracking-tight', className)} {...props} />
);
CardTitle.displayName = 'CardTitle';

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);
CardDescription.displayName = 'CardDescription';

const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6 pt-0', className)} {...props} />
);
CardContent.displayName = 'CardContent';

const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center p-6 pt-0', className)} {...props} />
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
