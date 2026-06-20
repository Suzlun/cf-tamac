import { RouterProvider } from 'react-router';

import { QueryProvider } from '@cf-tamac-frontend/domain';

import { router } from './router';

/** Root application component with data providers and routing. */
function App() {
  return (
    <QueryProvider>
      <RouterProvider router={router} />
    </QueryProvider>
  );
}

export { App };
