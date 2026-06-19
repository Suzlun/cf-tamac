import { useQuery } from '@tanstack/react-query';

import { helloApi } from '@cfreact-template-frontend/api';

/** Data exposed by the hello domain hook. */
interface HelloData {
  message: string;
  timestamp: Date | null;
  isLoading: boolean;
  error?: Error;
}

/** Actions exposed by the hello domain hook. */
interface HelloActions {
  refresh: () => void;
}

/** Fetch hello message data with refresh support. */
function useHello(): { data: HelloData; actions: HelloActions } {
  const query = useQuery({
    queryKey: ['hello'],
    queryFn: () => helloApi.get(),
  });

  const data: HelloData = {
    message: query.data?.message ?? '',
    timestamp: query.data?.timestamp ?? null,
    isLoading: query.isPending,
    error: query.error ?? undefined,
  };

  const actions: HelloActions = {
    refresh: () => {
      void query.refetch();
    },
  };

  return {
    data,
    actions,
  };
}

export type { HelloActions, HelloData };
export { useHello };
