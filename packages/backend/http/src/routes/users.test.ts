import { OpenAPIHono } from '@hono/zod-openapi';
import {
  createExecutionContext as createExecutionContextRaw,
  waitOnExecutionContext as waitOnExecutionContextRaw,
} from 'cloudflare:test';
import { env as testEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, UserCreatedNotifier } from '@cfreact-template-backend/domain';
import { openApiApp } from '@cfreact-template-backend/http';
import { DrizzleUserRepository, createDrizzleClient } from '@cfreact-template-backend/persistence';
import type { Bindings } from '@cfreact-template-backend/types';
import {
  CreateUser,
  GetUser,
  ListUsers,
  type UsersUseCases,
} from '@cfreact-template-backend/usecases';

interface UserResponse {
  id: number;
  name: string;
  email: string;
  createdAt?: unknown;
}

interface ErrorResponse {
  error: string;
}

const env = testEnv as unknown as Bindings;

const notifyUserCreated = vi.fn(async (_user: User): Promise<void> => {
  return;
});

const userCreatedNotifier: UserCreatedNotifier = {
  notifyUserCreated: (user) => notifyUserCreated(user),
};

const createUsersUseCases = () => {
  const drizzle = createDrizzleClient(env.DB);
  const repository = new DrizzleUserRepository(drizzle);

  return {
    listUsers: new ListUsers(repository),
    createUser: new CreateUser(repository, userCreatedNotifier),
    getUser: new GetUser(repository),
  } satisfies UsersUseCases;
};

const app = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: {
    usersUseCases: UsersUseCases;
  };
}>();

app.use('*', async (c, next) => {
  c.set('usersUseCases', createUsersUseCases());
  await next();
});

app.route('/', openApiApp);

function createExecutionContext(): ExecutionContext {
  return createExecutionContextRaw();
}

function waitOnExecutionContext(ctx: ExecutionContext): Promise<void> {
  return waitOnExecutionContextRaw(ctx);
}

describe('Users API', () => {
  beforeEach(() => {
    notifyUserCreated.mockReset();
    notifyUserCreated.mockResolvedValue(undefined);
  });

  describe('GET /api/v1/users', () => {
    it('空のリストを返す', async () => {
      const request = new Request('http://localhost/api/v1/users');
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const data = await response.json<UserResponse[]>();
      expect(data).toEqual([]);
    });

    it('既存ユーザーのリストを返す', async () => {
      await env.DB.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
        .bind('Alice', 'alice@example.com')
        .run();
      await env.DB.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
        .bind('Bob', 'bob@example.com')
        .run();

      const request = new Request('http://localhost/api/v1/users');
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const data = await response.json<UserResponse[]>();
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
      expect(data[1]).toMatchObject({ name: 'Bob', email: 'bob@example.com' });
    });
  });

  describe('POST /api/v1/users', () => {
    it('新しいユーザーを作成する', async () => {
      const newUser = {
        name: 'Charlie',
        email: 'charlie@example.com',
      };

      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(201);
      const data = await response.json<UserResponse>();
      expect(data).toMatchObject(newUser);
      expect(data.id).toBeDefined();
    });

    it('名前が空の場合はエラーを返す', async () => {
      const invalidUser = {
        name: '',
        email: 'test@example.com',
      };

      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidUser),
      });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const data = await response.json<ErrorResponse>();
      expect(data.error).toBe('Name and email are required');
    });

    it('ユーザー作成時に通知送信を実行する', async () => {
      const newUser = {
        name: 'Email Trigger User',
        email: 'email-trigger@example.com',
      };

      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(201);
      expect(notifyUserCreated).toHaveBeenCalledTimes(1);
      const firstCall = notifyUserCreated.mock.calls[0];
      if (firstCall == null) {
        throw new Error('notifyUserCreated should have been called');
      }
      const [createdUser] = firstCall;
      expect(createdUser).toMatchObject(newUser);
    });

    it('通知送信に失敗してもユーザー作成は成功する', async () => {
      notifyUserCreated.mockRejectedValueOnce(new Error('email delivery failed'));

      const newUser = {
        name: 'Notification Failure User',
        email: 'notification-failure@example.com',
      };

      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(201);
      expect(notifyUserCreated).toHaveBeenCalledTimes(1);
    });

    it('メールが空の場合はエラーを返す', async () => {
      const invalidUser = {
        name: 'Test User',
        email: '',
      };

      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidUser),
      });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const data = await response.json<ErrorResponse>();
      expect(data.error).toBe('Name and email are required');
    });

    it('重複したメールアドレスはエラーを返す', async () => {
      await env.DB.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
        .bind('Existing', 'existing@example.com')
        .run();

      const duplicateUser = {
        name: 'Duplicate',
        email: 'existing@example.com', // 同じメールアドレス
      };

      const request = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateUser),
      });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      // UNIQUE 制約違反は usecase の例外として 400 に変換される
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('指定されたIDのユーザーを返す', async () => {
      const createRequest = new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'David', email: 'david@example.com' }),
      });
      const createCtx = createExecutionContext();
      const createResponse = await app.fetch(createRequest, env, createCtx);
      await waitOnExecutionContext(createCtx);

      expect(createResponse.status).toBe(201);
      const createdUser = await createResponse.json<UserResponse>();

      const request = new Request(`http://localhost/api/v1/users/${String(createdUser.id)}`);
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const data = await response.json<UserResponse>();
      expect(data).toMatchObject({
        id: createdUser.id,
        name: 'David',
        email: 'david@example.com',
      });
    });

    it('存在しないIDの場合は404を返す', async () => {
      const request = new Request('http://localhost/api/v1/users/999');
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      const data = await response.json<ErrorResponse>();
      expect(data.error).toBe('User not found');
    });
  });
});
