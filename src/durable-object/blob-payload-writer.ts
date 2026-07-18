import type {
  AgentImmutableBlobWriteInput,
  AgentImmutableBlobWriteResult,
  AgentImmutableBlobWriter,
} from '../storage';

/**
 * Agent-owned R2 へ Event payload などの immutable blob を書き込む入力です。
 *
 * @remarks
 * Durable Object 境界だけが `R2Bucket` を受け取り、domain/storage 層には blob writer の抽象だけを
 * 渡します。これにより Client D1 や外部 storage へ payload 副作用が漏れず、Agent Worker の
 * `AGENT_BLOBS` binding だけを副作用点として固定できます。
 *
 * @example
 * ```ts
 * await writeAgentBlobPayload({ blob, bucket: env.AGENT_BLOBS });
 * ```
 */
export interface WriteAgentBlobPayloadInput {
  /** Agent-owned R2 bucket binding です。 */
  readonly bucket: R2Bucket;
  /** storage 層が生成した immutable object key、body、digest metadata です。 */
  readonly blob: AgentImmutableBlobWriteInput;
}

/**
 * Agent-owned R2 bucket binding を storage 層用の blob writer 関数へ変換します。
 *
 * @param bucket Agent Worker が所有する `AGENT_BLOBS` R2 bucket binding です。
 * @returns storage/domain 層へ渡せる immutable blob writer です。
 * @throws R2 put が失敗した場合、Cloudflare runtime の例外をそのまま呼び出し元へ伝播します。
 * @example
 * ```ts
 * const writer = createAgentBlobPayloadWriter(env.AGENT_BLOBS);
 * ```
 */
export function createAgentBlobPayloadWriter(bucket: R2Bucket): AgentImmutableBlobWriter {
  // bucket そのものは Durable Object 境界に閉じ、下位層には writer callback だけを渡します。
  return (blob) => writeAgentBlobPayload({ blob, bucket });
}

/**
 * Agent-owned R2 へ immutable blob payload を書き込み、保存済み metadata だけを返します。
 *
 * @param input Agent-owned R2 bucket と、保存対象 blob の key/body/digest metadata です。
 * @returns repository が参照として保存できる object key、byte size、content type、sha256 です。
 * @throws R2 put が失敗した場合、Event append を完了させず呼び出し元へ失敗を伝播します。
 * @example
 * ```ts
 * const descriptor = await writeAgentBlobPayload({ blob, bucket: env.AGENT_BLOBS });
 * ```
 */
export async function writeAgentBlobPayload(
  input: WriteAgentBlobPayloadInput
): Promise<AgentImmutableBlobWriteResult> {
  // AIAgent から注入された bucket は AGENT_BLOBS であり、ここが AGENT_BLOBS.put 副作用の実行点です。
  // R2 object metadata に digest と content type を保存し、payload 完全性検証の材料を残します。
  await input.bucket.put(input.blob.key, input.blob.body, {
    customMetadata: { sha256: input.blob.sha256 },
    httpMetadata: { contentType: input.blob.contentType },
  });
  // 呼び出し元へは immutable blob の安全な参照 metadata だけを返し、body は再露出しません。
  return {
    byteSize: input.blob.body.byteLength,
    contentType: input.blob.contentType,
    key: input.blob.key,
    sha256: input.blob.sha256,
  };
}
