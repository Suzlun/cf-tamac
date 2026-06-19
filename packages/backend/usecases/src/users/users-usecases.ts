import type { CreateUser } from './create-user';
import type { GetUser } from './get-user';
import type { ListUsers } from './list-users';

/** Use case instances for user-related operations. */
export interface UsersUseCases {
  listUsers: ListUsers;
  createUser: CreateUser;
  getUser: GetUser;
}
