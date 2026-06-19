import { normalizeCreateUserInput } from '@cfreact-template-backend/domain';
import type {
  CreateUserInput,
  User,
  UserCreatedNotifier,
  UserRepository,
} from '@cfreact-template-backend/domain';

/** Use case to create a new user. */
export class CreateUser {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userCreatedNotifier: UserCreatedNotifier
  ) {}

  async execute(input: CreateUserInput): Promise<User> {
    const normalizedInput = normalizeCreateUserInput(input);

    const createdUser = await this.userRepository.create(normalizedInput);

    try {
      await this.userCreatedNotifier.notifyUserCreated(createdUser);
    } catch {
      // Notification failures must not block user creation.
    }

    return createdUser;
  }
}
