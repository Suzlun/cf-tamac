import { eq } from 'drizzle-orm';

import { users } from '@cfreact-template-backend/drizzle';

import type { User, UserRepository, ValidCreateUserInput } from '@cfreact-template-backend/domain';

import type { DrizzleClient } from './db';

/** Drizzle-backed implementation of the user repository. */
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findAll(): Promise<User[]> {
    const rows = await this.db.select().from(users).all();
    return rows.map((row) => this.mapRow(row));
  }

  async findById(id: number): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.id, id)).get();

    if (row == null) {
      return null;
    }

    return this.mapRow(row);
  }

  async create(input: ValidCreateUserInput): Promise<User> {
    const [row] = await this.db.insert(users).values(input).returning();
    if (row == null) {
      throw new Error('Failed to create user');
    }
    return this.mapRow(row);
  }

  private mapRow(row: (typeof users)['$inferSelect']): User {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt,
    };
  }
}
