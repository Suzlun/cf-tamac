import { createBrowserRouter } from 'react-router';

import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/home/HomePage';
import { UsersPage } from './pages/users/UsersPage';

/** App router definition with layout and page routes. */
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'users',
        element: <UsersPage />,
      },
    ],
  },
]);

export { router };
