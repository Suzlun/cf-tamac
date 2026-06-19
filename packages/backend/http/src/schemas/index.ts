import { extendZodWithOpenApi } from '@hono/zod-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/** Standard error response payload. */
const errorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi('ErrorResponse');

/** Hello response payload for connectivity checks. */
const helloResponseSchema = z
  .object({
    message: z.string(),
    timestamp: z.iso.datetime(),
  })
  .openapi('HelloResponse');

/** User response payload for API responses. */
const userResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    email: z.string().openapi({ format: 'email' }),
    createdAt: z.iso.datetime(),
  })
  .openapi('User');

/** Input payload to create a user. */
const createUserInputSchema = z
  .object({
    name: z.string(),
    email: z.string().openapi({ format: 'email' }),
  })
  .openapi('CreateUserInput');

/** User id params payload for single-user endpoints. */
const userIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'Invalid id')
    .transform((value) => Number(value))
    .openapi({ type: 'integer', format: 'int64' }),
});

/** Response payload for listing users. */
const usersListResponseSchema = z.array(userResponseSchema);

export {
  createUserInputSchema,
  errorResponseSchema,
  helloResponseSchema,
  userIdParamsSchema,
  userResponseSchema,
  usersListResponseSchema,
};
