import type {
  PublishDeliveryResultRequest,
  PublishIntegrationEventRequest,
  PublishToolResultRequest,
} from './generated/agent-rpc/cftamac/agent/v1_pb';

/**
 * Provider ingress の全 request が共有する、Installation principal の実行文脈です。
 *
 * @remarks
 * この値は Integration Provider の server-side boundary が、受信済み platform event または Provider operation
 * ごとに作成します。Client Service JWT、acting user、scope、private key は含めません。`timestampUnixMs`、`nonce`、
 * `idempotencyKey` は replay protection と detached signature の identity を同じ値に固定します。
 *
 * @example
 * ```ts
 * const invocation: ProviderIngressInvocationContext = {
 *   agentId: 'agent-alpha',
 *   installationId: 'installation-alpha',
 *   timestampUnixMs: 1_752_200_000_000,
 *   nonce: 'provider-nonce-001',
 *   idempotencyKey: 'provider-event-001',
 *   requestId: 'request-001',
 *   correlationId: 'correlation-001',
 * };
 * ```
 */
export interface ProviderIngressInvocationContext {
  /** detached signature と Protobuf body が scope する Agent aggregate ID です。 */
  readonly agentId: string;
  /** detached-signature principal を識別する active Integration Installation ID です。 */
  readonly installationId: string;
  /** Agent 側 replay/idempotency record と Protobuf body に渡す command identity です。 */
  readonly idempotencyKey: string;
  /** Agent audit metadata に渡す Provider server-generated request ID です。 */
  readonly requestId: string;
  /** Provider の安全な operation log を横断する secret-free correlation ID です。 */
  readonly correlationId: string;
  /** canonical signature と generated request timestamp に同じ base-10 Unix milliseconds で入る時刻です。 */
  readonly timestampUnixMs: number;
  /** Installation principal 単位で未使用でなければならない canonical detached-signature nonce です。 */
  readonly nonce: string;
}

/**
 * Provider が所有する Ed25519 detached-signature callback の設定です。
 *
 * @remarks
 * SDK は Provider private key、key store、platform credential を所有しません。`signDetached` には canonical text の
 * UTF-8 bytes だけを渡し、返却された raw Ed25519 signature bytes を generated Protobuf body に設定します。
 * callback が失敗した場合、SDK は request を送信しません。
 *
 * @example
 * ```ts
 * const signing: ProviderIngressSigningContext = {
 *   keyId: 'provider-key-001',
 *   algorithm: 'Ed25519',
 *   signDetached: (input) => providerSigner.sign(input),
 * };
 * ```
 */
export interface ProviderIngressSigningContext {
  /** Agent が Installation trust record から Provider public key を解決する key ID です。 */
  readonly keyId: string;
  /** Provider ingress の固定 detached-signature algorithm です。 */
  readonly algorithm: 'Ed25519';
  /** canonical UTF-8 input bytes を Ed25519 で署名して raw signature bytes を返す Provider-owned callback です。 */
  readonly signDetached: (input: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Provider ingress Connect transport と 3-operation aggregate を作る設定です。
 *
 * @remarks
 * `agentRpcOrigin` は Provider server-side configuration から解決した HTTPS Agent RPC origin です。SDK は任意の
 * metadata injection seam を公開せず、HTTP metadata を binary Protobuf content type、request ID、correlation ID
 * に限定します。
 *
 * @example
 * ```ts
 * const config: TamacProviderIngressClientConfig = { agentRpcOrigin, invocation, signing };
 * ```
 */
export interface TamacProviderIngressClientConfig {
  /** Provider が signed binary Connect request を送る Agent Worker origin です。 */
  readonly agentRpcOrigin: string;
  /** Agent、Installation、request/replay/correlation、timestamp、nonce を共有する Provider execution context です。 */
  readonly invocation: ProviderIngressInvocationContext;
  /** Provider-owned Ed25519 signer と Agent-visible key identity です。 */
  readonly signing: ProviderIngressSigningContext;
  /** test または Provider server runtime が供給する fetch implementation です。 */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Provider が Integration event を publish する際に指定する、SDK 管理外の generated request fields です。
 *
 * @remarks
 * Agent/Installation/idempotency identity と timestamp、nonce、digest、signature は Provider invocation/signing
 * context から SDK が一貫して設定します。caller はそれらを request input で上書きできません。
 */
export type TamacProviderPublishEventInput = Omit<
  PublishIntegrationEventRequest,
  | '$typeName'
  | 'agentId'
  | 'idempotencyKey'
  | 'installationId'
  | 'timestamp'
  | 'nonce'
  | 'rawBodyDigest'
  | 'signature'
  | 'connectionId'
> & {
  /** active Adapter connection ownership と canonical event identity を表す non-empty connection ID です。 */
  readonly connectionId: string;
};

/**
 * Provider が Tool result を publish する際に指定する、SDK 管理外の generated request fields です。
 *
 * @remarks
 * Agent/Installation/idempotency identity と timestamp、nonce、digest、signature は detached-signature context が
 * 所有します。caller は invocation、status、Provider operation、output reference/payload だけを指定します。
 */
export type TamacProviderPublishToolResultInput = Omit<
  PublishToolResultRequest,
  | '$typeName'
  | 'agentId'
  | 'idempotencyKey'
  | 'installationId'
  | 'timestamp'
  | 'nonce'
  | 'rawBodyDigest'
  | 'signature'
>;

/**
 * Provider が Delivery result を publish する際に指定する、SDK 管理外の generated request fields です。
 *
 * @remarks
 * Agent/Installation/idempotency identity と timestamp、nonce、digest、signature は detached-signature context が
 * 所有します。caller は delivery identity、resolved delivery context、result status、Provider operation を指定します。
 */
export type TamacProviderPublishDeliveryResultInput = Omit<
  PublishDeliveryResultRequest,
  | '$typeName'
  | 'agentId'
  | 'idempotencyKey'
  | 'installationId'
  | 'timestamp'
  | 'nonce'
  | 'rawBodyDigest'
  | 'signature'
  | 'deliveryContextId'
  | 'deliveryId'
> & {
  /** Agent-owned delivery record と result callback を対応付ける non-empty delivery ID です。 */
  readonly deliveryId: string;
  /** Agent-owned delivery capability ownership と canonical signature identity を表す non-empty context ID です。 */
  readonly deliveryContextId: string;
};
