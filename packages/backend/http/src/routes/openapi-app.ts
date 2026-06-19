import { OpenAPIHono, type Hook } from '@hono/zod-openapi';

import type { AppVariables } from '@cfreact-template-backend/http/context';
import type { Bindings } from '@cfreact-template-backend/types';

import { registerHelloRoutes } from './hello';
import { registerUsersRoutes } from './users';

interface ApiEnv {
  Bindings: Bindings;
  Variables: AppVariables;
}

const validationErrorHook: Hook<unknown, ApiEnv, string, Response | undefined> = (result, c) => {
  if (result.success) {
    return;
  }

  const combined = result.error.issues.map((issue) => issue.message).join(', ');
  const message = combined === '' ? 'Invalid request' : combined;

  return c.json({ error: message }, 400);
};

/** OpenAPI-enabled Hono app for API routes. */
const openApiApp = new OpenAPIHono<ApiEnv>({
  defaultHook: validationErrorHook,
}).basePath('/api/v1');

registerHelloRoutes(openApiApp);
registerUsersRoutes(openApiApp);

/** Generate the OpenAPI document for the registered routes. */
const getOpenApiDocument = (...args: Parameters<typeof openApiApp.getOpenAPIDocument>) =>
  openApiApp.getOpenAPIDocument(...args);

export { getOpenApiDocument, openApiApp };
