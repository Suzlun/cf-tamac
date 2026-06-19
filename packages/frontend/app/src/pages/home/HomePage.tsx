import { Link as RouterLink } from 'react-router';

import type { HelloData } from '@cfreact-template-frontend/domain';
import { useHello } from '@cfreact-template-frontend/domain';
import {
  Alert,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Spinner,
} from '@cfreact-template-frontend/ui';

const techStackItems = [
  'React 19',
  'Vite 8',
  'React Router 7',
  'TanStack Query 5',
  'shadcn/ui',
  'Hono 4',
  'Drizzle ORM 0.45',
  'TypeScript 5.9',
  'Cloudflare Workers',
];

function HeroSection({ onRefresh, isLoading }: { onRefresh: () => void; isLoading: boolean }) {
  return (
    <section className="rounded-xl border bg-muted/40 p-6 sm:p-8">
      <div className="flex max-w-2xl flex-col gap-4">
        <Badge variant="outline" className="w-fit">
          Cloudflare · React · Hono
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Welcome to cfreact-template
        </h1>
        <p className="text-muted-foreground">
          フルスタックで Workers を動かすためのスターター。React + TanStack Query + Hono + Drizzle
          をすぐに試せます。
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg">
            <RouterLink to="/users">View Users</RouterLink>
          </Button>
          <Button variant="outline" size="lg" onClick={onRefresh} disabled={isLoading}>
            Refresh Hello API
          </Button>
        </div>
      </div>
    </section>
  );
}

function ApiHealthCard({ data }: { data: HelloData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Health</CardTitle>
        <CardDescription>Live response from /api/v1/hello</CardDescription>
      </CardHeader>
      <CardContent>
        {data.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-5 w-2/5" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              <span>Fetching latest message...</span>
            </div>
          </div>
        )}

        {data.error != null && (
          <Alert variant="destructive" className="mt-1">
            <AlertTitle>Error loading data</AlertTitle>
            {data.error.message}
          </Alert>
        )}

        {data.timestamp != null && (
          <div className="mt-1 space-y-3">
            <p className="font-semibold">{data.message}</p>
            <p className="text-sm text-muted-foreground">
              Timestamp: {data.timestamp.toLocaleString()}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>200 OK</Badge>
              <Badge variant="outline">Workers</Badge>
              <Badge variant="outline">Hono</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TechStackCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tech Stack</CardTitle>
        <CardDescription>What powers this template</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {techStackItems.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Landing page with hello API status and tech stack overview. */
function HomePage() {
  const { data, actions } = useHello();

  return (
    <div className="space-y-8">
      <div className="grid items-stretch gap-6 lg:grid-cols-[1.4fr_1fr]">
        <HeroSection onRefresh={actions.refresh} isLoading={data.isLoading} />
        <ApiHealthCard data={data} />
      </div>

      <TechStackCard />
    </div>
  );
}

export { HomePage };
