/**
 * Server Action mutation に渡す browser-safe idempotency key を生成する。
 *
 * @returns 現在時刻と乱数を組み合わせた一回限りの key 文字列。
 * @remarks
 * この key は認証 secret ではなく、同一 command の重複送信を Agent 側で識別するための補助値。
 * Client D1 や browser storage へ永続化せず、mutation 実行時に必要な範囲だけで使用する。
 */
export function generateIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
