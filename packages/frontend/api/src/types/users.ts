/** User record mapped for client consumption. */
interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

/** Payload to create a new user. */
interface CreateUserPayload {
  name: string;
  email: string;
}

export type { CreateUserPayload, User };
