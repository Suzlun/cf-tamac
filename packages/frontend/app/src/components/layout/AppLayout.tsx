import { Link as RouterLink, Outlet } from 'react-router';

import { Button } from '@cfreact-template-frontend/ui';

/** Shared layout for the main app routes. */
function AppLayout() {
  return (
    <div className="min-h-screen bg-background pb-10 text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4">
          <RouterLink to="/" className="text-lg font-semibold tracking-tight">
            cfreact-template
          </RouterLink>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <Button asChild variant="ghost">
              <RouterLink to="/">Home</RouterLink>
            </Button>
            <Button asChild variant="ghost">
              <RouterLink to="/users">Users</RouterLink>
            </Button>
          </nav>
        </div>
      </header>

      <main className="container py-6 sm:py-8">
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export { AppLayout };
