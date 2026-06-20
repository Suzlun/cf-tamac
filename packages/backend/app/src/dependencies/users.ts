import {
  CloudflareUserCreatedNotifier,
  createDrizzleClient,
  DrizzleUserRepository,
} from '@cf-tamac-backend/persistence';
import type { Bindings } from '@cf-tamac-backend/types';
import { CreateUser, GetUser, ListUsers, type UsersUseCases } from '@cf-tamac-backend/usecases';

/** Build user use cases with persistence dependencies. */
export const createUsersUseCases = (bindings: Bindings): UsersUseCases => {
  const drizzle = createDrizzleClient(bindings.DB);
  const repository = new DrizzleUserRepository(drizzle);
  const userCreatedNotifier = new CloudflareUserCreatedNotifier(bindings.EMAIL, {
    from: bindings.EMAIL_FROM,
    to: bindings.EMAIL_TO,
  });

  return {
    listUsers: new ListUsers(repository),
    createUser: new CreateUser(repository, userCreatedNotifier),
    getUser: new GetUser(repository),
  };
};
