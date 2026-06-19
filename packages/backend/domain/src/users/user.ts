/** User entity shape exposed by the domain. */
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

/** Input required to create a user. */
export interface CreateUserInput {
  name: string;
  email: string;
}

/** Normalized input accepted by user creation persistence ports. */
export interface ValidCreateUserInput {
  name: string;
  email: string;
}

/** Stable error code for invalid create-user input. */
export const INVALID_CREATE_USER_INPUT_ERROR_CODE = 'INVALID_CREATE_USER_INPUT' as const;

/** Field keys validated for user creation input. */
export type InvalidCreateUserInputField = 'name' | 'email';

/** Domain error for invalid user creation input. */
export class InvalidCreateUserInputError extends Error {
  readonly code = INVALID_CREATE_USER_INPUT_ERROR_CODE;

  constructor(readonly field: InvalidCreateUserInputField) {
    super('Name and email are required');
    this.name = 'InvalidCreateUserInputError';
  }
}

/** Normalize and validate user creation input against domain invariants. */
export const normalizeCreateUserInput = (input: CreateUserInput): ValidCreateUserInput => {
  const name = input.name.trim();
  const email = input.email.trim();

  if (name === '') {
    throw new InvalidCreateUserInputError('name');
  }

  if (email === '') {
    throw new InvalidCreateUserInputError('email');
  }

  return { name, email };
};
