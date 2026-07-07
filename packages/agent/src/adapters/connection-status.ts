/**
 * Adapter connection を Agent-owned storage で追跡する status 一覧です。
 *
 * @remarks
 * Integration adapter への接続は active、disabled、deleted の状態だけを永続化します。
 * Provider 固有の接続状態や Client 管理 ledger の値はここへ混在させません。
 */
export const adapterConnectionStatuses = ['active', 'disabled', 'deleted'] as const;

/**
 * Adapter connection status の union 型です。
 *
 * @remarks
 * `adapterConnectionStatuses` から導出し、repository row と domain view の接続状態を同じ集合へ固定します。
 */
export type AdapterConnectionStatus = (typeof adapterConnectionStatuses)[number];
