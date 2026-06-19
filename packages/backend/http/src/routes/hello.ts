import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppVariables } from '@cfreact-template-backend/http/context';
import { helloResponseSchema } from '@cfreact-template-backend/http/schemas';
import type { Bindings } from '@cfreact-template-backend/types';

const helloRoute = createRoute({
  method: 'get',
  path: '/hello',
  tags: ['hello'],
  operationId: 'getHello',
  summary: 'Returns greeting',
  responses: {
    200: {
      description: 'Greeting response',
      content: {
        'application/json': {
          schema: helloResponseSchema,
        },
      },
    },
  },
});

/** Register hello routes on the OpenAPI-enabled app. */
const registerHelloRoutes = (app: OpenAPIHono<{ Bindings: Bindings; Variables: AppVariables }>) => {
  app.openapi(helloRoute, (c) =>
    c.json(
      {
        message: 'Hello from Hono + Cloudflare Workers',
        timestamp: new Date().toISOString(),
      },
      200
    )
  );
};

export { registerHelloRoutes };
