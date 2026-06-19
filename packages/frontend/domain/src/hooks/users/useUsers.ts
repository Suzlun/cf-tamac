import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { usersApi } from '@cfreact-template-frontend/api';
import type { CreateUserPayload, User } from '@cfreact-template-frontend/api/types';

/** Data exposed by the users domain hook. */
interface UsersData {
  list: User[];
  isLoading: boolean;
  isSubmitting: boolean;
  error?: Error;
  form: CreateUserPayload & { isValid: boolean };
}

/** Actions exposed by the users domain hook. */
interface UsersActions {
  reload: () => void;
  updateName: (value: string) => void;
  updateEmail: (value: string) => void;
  submit: () => Promise<void>;
}

/** Fetch users and manage user creation form state. */
function useUsers(): { data: UsersData; actions: UsersActions } {
  const queryClient = useQueryClient();
  const formState = useState<CreateUserPayload>({ name: '', email: '' });
  const [form] = formState;

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const createUser = useMutation({
    mutationFn: (payload: CreateUserPayload) => usersApi.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const isValid = form.name.trim() !== '' && form.email.trim() !== '';

  const data: UsersData = {
    list: usersQuery.data ?? [],
    isLoading: usersQuery.isPending,
    isSubmitting: createUser.isPending,
    error: usersQuery.error ?? createUser.error ?? undefined,
    form: { ...form, isValid },
  };

  const actions: UsersActions = {
    reload: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    updateName: (value: string) => {
      formState[1]((prev) => ({ ...prev, name: value }));
    },
    updateEmail: (value: string) => {
      formState[1]((prev) => ({ ...prev, email: value }));
    },
    submit: async () => {
      if (!isValid) {
        return;
      }
      await createUser.mutateAsync(formState[0]);
      formState[1]({ name: '', email: '' });
    },
  };

  return {
    data,
    actions,
  };
}

export type { UsersActions, UsersData };
export { useUsers };
