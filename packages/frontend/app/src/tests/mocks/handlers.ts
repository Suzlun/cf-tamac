import { http, HttpResponse } from 'msw';

interface MockUser {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

const initialUsers: MockUser[] = [
  {
    id: 1,
    name: 'Test User 1',
    email: 'test1@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Test User 2',
    email: 'test2@example.com',
    createdAt: '2024-01-02T00:00:00.000Z',
  },
];

let users: MockUser[] = [...initialUsers];

const resetMockData = () => {
  users = [...initialUsers];
};

/** MSW handlers for client-side API mocking. */
const handlers = [
  // GET /api/v1/users
  http.get('/api/v1/users', () => {
    return HttpResponse.json(users);
  }),

  // POST /api/v1/users
  http.post('/api/v1/users', async ({ request }) => {
    // Artificial delay so UI can show a loading state.
    await new Promise((resolve) => setTimeout(resolve, 75));

    const body = (await request.json()) as { name: string; email: string };
    const nextId = Math.max(0, ...users.map((u) => u.id)) + 1;
    const newUser: MockUser = {
      id: nextId,
      name: body.name,
      email: body.email,
      createdAt: new Date().toISOString(),
    };
    users = [...users, newUser];
    return HttpResponse.json(newUser, { status: 201 });
  }),

  // GET /api/v1/users/:id
  http.get('/api/v1/users/:id', ({ params }) => {
    const { id } = params;
    const userId = Number(id);
    const found = users.find((u) => u.id === userId);
    if (found == null) {
      return HttpResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    return HttpResponse.json(found);
  }),
];

export { handlers, resetMockData };
