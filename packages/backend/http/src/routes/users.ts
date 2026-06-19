import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';

import { InvalidCreateUserInputError } from '@cfreact-template-backend/domain';
import type { User } from '@cfreact-template-backend/domain';
import type { AppVariables } from '@cfreact-template-backend/http/context';
import {
  createUserInputSchema,
  errorResponseSchema,
  userIdParamsSchema,
  userResponseSchema,
  usersListResponseSchema,
} from '@cfreact-template-backend/http/schemas';
import type { Bindings } from '@cfreact-template-backend/types';
import type { UsersUseCases } from '@cfreact-template-backend/usecases';

const listUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  tags: ['users'],
  operationId: 'listUsers',
  summary: 'List all users',
  responses: {
    200: {
      description: 'List all users',
      content: {
        'application/json': {
          schema: usersListResponseSchema,
        },
      },
    },
  },
});

const createUserRoute = createRoute({
  method: 'post',
  path: '/users',
  tags: ['users'],
  operationId: 'createUser',
  summary: 'Create a new user',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createUserInputSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User created',
      content: {
        'application/json': {
          schema: userResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

const getUserRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  tags: ['users'],
  operationId: 'getUser',
  summary: 'Get a user by id',
  request: {
    params: userIdParamsSchema,
  },
  responses: {
    200: {
      description: 'User found',
      content: {
        'application/json': {
          schema: userResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

const toUserResponse = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt.toISOString(),
});

/** Register user routes on the OpenAPI-enabled app. */
const registerUsersRoutes = (app: OpenAPIHono<{ Bindings: Bindings; Variables: AppVariables }>) => {
  app.openapi(listUsersRoute, async (c) => {
    const { listUsers }: UsersUseCases = c.var.usersUseCases;
    const allUsers = await listUsers.execute();
    return c.json(
      allUsers.map((user) => toUserResponse(user)),
      200
    );
  });

  app.openapi(createUserRoute, async (c) => {
    const body = c.req.valid('json');
    const { createUser }: UsersUseCases = c.var.usersUseCases;

    try {
      const newUser = await createUser.execute(body);
      return c.json(toUserResponse(newUser), 201);
    } catch (error) {
      if (error instanceof InvalidCreateUserInputError) {
        return c.json({ error: error.message }, 400);
      }

      return c.json({ error: 'Failed to create user' }, 400);
    }
  });

  app.openapi(getUserRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { getUser }: UsersUseCases = c.var.usersUseCases;
    const user = await getUser.execute(id);

    if (user == null) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json(toUserResponse(user), 200);
  });
};

export { registerUsersRoutes };
