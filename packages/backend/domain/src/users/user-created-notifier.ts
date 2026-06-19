import type { User } from './user';

/** Port to notify when a user is created. */
export interface UserCreatedNotifier {
  notifyUserCreated(user: User): Promise<void>;
}
