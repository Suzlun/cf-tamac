import type { UsersUseCases } from '@cfreact-template-backend/usecases';

/** Hono context variables injected by server app wiring. */
export interface AppVariables {
  usersUseCases: UsersUseCases;
}
