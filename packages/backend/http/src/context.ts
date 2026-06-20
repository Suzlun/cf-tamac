import type { UsersUseCases } from '@cf-tamac-backend/usecases';

/** Hono context variables injected by server app wiring. */
export interface AppVariables {
  usersUseCases: UsersUseCases;
}
