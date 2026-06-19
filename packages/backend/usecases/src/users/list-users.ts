import type { User, UserRepository } from '@cfreact-template-backend/domain';

/** Use case to list all users. */
export class ListUsers {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(): Promise<User[]> {
    return this.userRepository.findAll();
  }
}
