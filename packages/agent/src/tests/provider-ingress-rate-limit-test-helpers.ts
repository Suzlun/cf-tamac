/**
 * Provider ingress RateLimit binding を決定論的に再現する Agent test helper です。
 *
 * @remarks
 * production binding と同じ `limit({ key })` 形状を保ちながら、test は key ごとの許可・拒否・例外を
 * 明示できます。helper は network/state side effect を持たず、呼び出し履歴だけを assertion 用に保持します。
 */
export function createProviderIngressRateLimitStub(
  input: {
    readonly limit?: (input: { readonly key: string }) => unknown;
  } = {}
): {
  readonly binding: RateLimit;
  readonly calls: readonly { readonly key: string }[];
} {
  const calls: { readonly key: string }[] = [];
  return {
    binding: {
      // production guard と同じ invocation count を検査できるよう、key を記録してから指定 outcome を返します。
      limit: (request: { readonly key: string }) => {
        calls.push({ key: request.key });
        return Promise.resolve(
          input.limit === undefined ? { success: true } : input.limit(request)
        );
      },
    } as unknown as RateLimit,
    calls,
  };
}

/**
 * 既存 Agent test env factory へ追加する常時許可 RateLimit binding を作成します。
 *
 * @remarks
 * Provider ingress を扱わない test が新しい required env contract を満たしつつ、既存 Client Service/
 * binary/fail-closed test の intent を変えないようにします。
 */
export function createAllowingProviderIngressRateLimitStub(): RateLimit {
  return createProviderIngressRateLimitStub().binding;
}
