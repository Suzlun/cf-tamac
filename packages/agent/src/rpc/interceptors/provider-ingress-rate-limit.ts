import { Code } from '@connectrpc/connect';

import type { AgentRpcGuardRejection } from './types';
import type { AgentWorkerEnv } from '../../env';

const providerIngressRateLimitMaterialVersion = 'tamac/provider-ingress-rate-limit/v1\0';

/**
 * Provider ingress の pre-auth rate-limit 拒否を観測するための固定 reason です。
 *
 * @remarks
 * この列挙値は安全な集計用途だけに使い、IP、Agent ID、Installation ID、署名、payload、request ID を
 * 含めません。外部 response は reason にかかわらず同じ safe message に正規化されます。
 *
 * @example
 * ```ts
 * const reason: ProviderIngressRateLimitDenialReason = 'rate_limit_exceeded';
 * ```
 */
export type ProviderIngressRateLimitDenialReason =
  | 'rate_limit_binding_failure'
  | 'rate_limit_exceeded'
  | 'trusted_source_invalid';

/**
 * Provider ingress の pre-auth rate-limit 拒否を Worker outer layer へ安全に通知する値です。
 *
 * @remarks
 * `service` と `method` は generated RPC inventory から解決済みであり、caller 提供の body identity は
 * 入れません。observer は response decision を変更できず、監視出力の failure も request 処理へ伝播させません。
 *
 * @example
 * ```ts
 * observer({ method: 'PublishEvent', reason: 'rate_limit_exceeded', service });
 * ```
 */
export interface ProviderIngressRateLimitDenial {
  readonly method: string;
  readonly reason: ProviderIngressRateLimitDenialReason;
  readonly service: string;
}

/**
 * Provider ingress rate-limit 拒否を安全な Worker observability 層へ渡す callback です。
 *
 * @remarks
 * callback は `ProviderIngressRateLimitDenial` の allowlisted field だけを受け取り、raw request や
 * identity を受け取りません。callback の例外は adapter が握りつぶし、pre-auth fail-closed response を保ちます。
 *
 * @example
 * ```ts
 * const observer: ProviderIngressRateLimitDenialObserver = (denial) => console.warn(denial);
 * ```
 */
export type ProviderIngressRateLimitDenialObserver = (
  denial: ProviderIngressRateLimitDenial
) => void;

/**
 * Rate Limiting API が許可・拒否・異常を判定した後の Provider ingress guard 結果です。
 *
 * @remarks
 * `denied` は常に同一の `resource_exhausted` response を返す材料であり、reason は Worker の安全な counter
 * だけへ使います。`allowed` は raw body decode と detached signature 検証へ進めます。
 *
 * @example
 * ```ts
 * const result = await inspectProviderIngressRateLimit({ env, operation, request });
 * if (result.status === 'denied') return result.rejection;
 * ```
 */
export type ProviderIngressRateLimitInspection =
  | { readonly status: 'allowed' }
  | {
      readonly denial: ProviderIngressRateLimitDenial;
      readonly rejection: AgentRpcGuardRejection;
      readonly status: 'denied';
    };

interface ProviderIngressRateLimiter {
  limit(input: { readonly key: string }): Promise<unknown>;
}

interface ProviderIngressRateLimitOutcome {
  readonly success: boolean;
}

/**
 * Provider ingress pre-auth traffic allowance を trusted edge source と generated procedure で評価します。
 *
 * @remarks
 * `CF-Connecting-IP` は一つの canonical IPv4/IPv6 literal、`CF-Worker` は不在でなければなりません。
 * bucket key は固定 version、正規化済み source、generated service/method だけを SHA-256/base64url 化します。
 * binding が無い、壊れている、throw/reject する、または不正 outcome を返す場合も同じ安全な拒否にして、
 * raw body、署名、Durable Object state へ触れません。
 *
 * @param input Worker env、HTTP request、path classification 済み generated operation です。
 * @returns allowance があれば `allowed`、それ以外は safe rejection と counter 用 denial です。
 * @throws この関数は RateLimit binding 例外を内部で fail closed に変換するため、通常の拒否では送出しません。
 * @example
 * ```ts
 * const decision = await inspectProviderIngressRateLimit({ env, operation, request });
 * ```
 */
export async function inspectProviderIngressRateLimit(input: {
  readonly env: AgentWorkerEnv;
  readonly operation: { readonly method: string; readonly service: string };
  readonly request: Request;
}): Promise<ProviderIngressRateLimitInspection> {
  // Worker subrequest や曖昧な forwarded header を trusted source と誤認せず、edge 直結 request だけに閉じます。
  const source = normalizeTrustedProviderIngressSource(input.request);
  if (source === undefined) {
    return createDeniedInspection(input.operation, 'trusted_source_invalid');
  }

  let key: string;
  let rateLimiter: ProviderIngressRateLimiter | undefined;
  try {
    // body identity と無関係な固定 material を hash 化し、bucket key から caller-controlled metadata を除外します。
    key = await createProviderIngressRateLimitKey({ operation: input.operation, source });
    // deployment misconfiguration で binding getter 自体が失敗しても、pre-auth boundary から外へ送出しません。
    rateLimiter = getProviderIngressRateLimiter(input.env);
  } catch {
    return createDeniedInspection(input.operation, 'rate_limit_binding_failure');
  }
  if (rateLimiter === undefined) {
    return createDeniedInspection(input.operation, 'rate_limit_binding_failure');
  }

  try {
    // RateLimit API は request ごとに一度だけ呼び、allowance 決定後まで raw request を消費しません。
    const outcome = await rateLimiter.limit({ key });
    if (!isRateLimitOutcome(outcome)) {
      return createDeniedInspection(input.operation, 'rate_limit_binding_failure');
    }
    if (outcome.success) return { status: 'allowed' };
    return createDeniedInspection(input.operation, 'rate_limit_exceeded');
  } catch {
    // binding の reject detail は外部へ出さず、pre-auth denial へ畳み込んで attacker feedback を固定します。
    return createDeniedInspection(input.operation, 'rate_limit_binding_failure');
  }
}

/**
 * Provider ingress bucket key を決定論的に生成します。
 *
 * @remarks
 * source は trusted edge validation 済みの IPv4/IPv6 literal、operation は generated inventory から
 * classification 済みの service/method です。返値には hash 化済み key だけを返し、source は保持しません。
 *
 * @param input 正規化済み source と generated operation です。
 * @returns `pir1:` prefix と SHA-256 base64url digest から成る RateLimit key です。
 * @throws Web Crypto digest が利用できない runtime では例外を送出し、caller が fail closed に変換します。
 * @example
 * ```ts
 * const key = await createProviderIngressRateLimitKey({ operation, source: '203.0.113.10' });
 * ```
 */
export async function createProviderIngressRateLimitKey(input: {
  readonly operation: { readonly method: string; readonly service: string };
  readonly source: string;
}): Promise<string> {
  // NUL 区切りの固定順 material は field 境界を曖昧にせず、key version 更新も安全に分離します。
  const material = `${providerIngressRateLimitMaterialVersion}${input.source}\0${input.operation.service}\0${input.operation.method}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  // RateLimit key は ASCII へ閉じ、source や procedure の平文を binding/log API に渡しません。
  return `pir1:${encodeBase64Url(new Uint8Array(digest))}`;
}

function createDeniedInspection(
  operation: { readonly method: string; readonly service: string },
  reason: ProviderIngressRateLimitDenialReason
): ProviderIngressRateLimitInspection {
  return {
    denial: { method: operation.method, reason, service: operation.service },
    rejection: {
      code: Code.ResourceExhausted,
      message: 'Provider ingress traffic cannot be accepted at this time.',
      reason,
    },
    status: 'denied',
  };
}

function normalizeTrustedProviderIngressSource(request: Request): string | undefined {
  // CF-Worker が存在する request は Worker subrequest なので、spoof 可能な forwarding chain を trusted にしません。
  if (request.headers.has('CF-Worker')) return undefined;
  const rawSource = request.headers.get('CF-Connecting-IP');
  // Headers API が結合した複数値、空白、空値を拒否し、一つの edge-provided literal だけを許可します。
  if (
    rawSource === null ||
    rawSource === '' ||
    rawSource !== rawSource.trim() ||
    rawSource.includes(',')
  ) {
    return undefined;
  }
  return normalizeIpv4Literal(rawSource) ?? normalizeIpv6Literal(rawSource);
}

function getProviderIngressRateLimiter(
  env: AgentWorkerEnv
): ProviderIngressRateLimiter | undefined {
  // deployment misconfiguration では required TypeScript binding でも runtime value を信頼せず shape を検証します。
  const candidate: unknown = env.PROVIDER_INGRESS_RATE_LIMITER;
  return isProviderIngressRateLimiter(candidate) ? candidate : undefined;
}

function isProviderIngressRateLimiter(value: unknown): value is ProviderIngressRateLimiter {
  // runtime binding を record として narrow してから method shape を確認し、`any`/Reflect を rate-limit call へ流しません。
  return isUnknownRecord(value) && typeof value.limit === 'function';
}

function isRateLimitOutcome(value: unknown): value is ProviderIngressRateLimitOutcome {
  return isUnknownRecord(value) && typeof value.success === 'boolean';
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function normalizeIpv4Literal(value: string): string | undefined {
  const octets = value.split('.');
  if (octets.length !== 4) return undefined;
  const normalized: string[] = [];
  for (const octet of octets) {
    // leading-zero IPv4 forms は URL/parser 差で別値になるため受け入れず、10進 canonical literal を要求します。
    if (!/^(?:0|[1-9]\d{0,2})$/u.test(octet)) return undefined;
    const numeric = Number(octet);
    if (numeric > 255) return undefined;
    normalized.push(String(numeric));
  }
  return normalized.join('.');
}

function normalizeIpv6Literal(value: string): string | undefined {
  if (value.includes(':::')) return undefined;
  const doubleColonIndex = value.indexOf('::');
  if (doubleColonIndex !== -1 && value.includes('::', doubleColonIndex + 2)) return undefined;
  const hasCompression = doubleColonIndex !== -1;
  const [leftText, rightText] = hasCompression ? value.split('::') : [value, ''];
  if (leftText === undefined || rightText === undefined) return undefined;
  const left = splitIpv6Parts(leftText);
  const right = splitIpv6Parts(rightText);
  if (left === undefined || right === undefined) return undefined;
  const groups = [...left, ...right];
  if ((hasCompression && groups.length >= 8) || (!hasCompression && groups.length !== 8)) {
    return undefined;
  }
  const expanded = hasCompression
    ? [...left, ...Array.from({ length: 8 - groups.length }, () => '0'), ...right]
    : groups;
  return compressIpv6Groups(expanded);
}

function splitIpv6Parts(value: string): string[] | undefined {
  if (value === '') return [];
  const parts = value.split(':');
  const groups: string[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.includes('.')) {
      // IPv4 tail は IPv6 literal の最後の component だけに限定し、二つの 16-bit group へ正規化します。
      if (index !== parts.length - 1) return undefined;
      const ipv4 = normalizeIpv4Literal(part);
      if (ipv4 === undefined) return undefined;
      const octets = ipv4.split('.').map(Number);
      const first = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
      const second = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
      groups.push(first.toString(16), second.toString(16));
      continue;
    }
    if (!/^[\da-fA-F]{1,4}$/u.test(part)) return undefined;
    groups.push(part.toLowerCase());
  }
  return groups;
}

function compressIpv6Groups(groups: readonly string[]): string {
  const normalized = groups.map((group) => {
    const withoutLeadingZeros = group.replace(/^0+/u, '');
    return withoutLeadingZeros === '' ? '0' : withoutLeadingZeros;
  });
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (const [index, group] of [...normalized, 'not-zero'].entries()) {
    if (group === '0') {
      if (runStart === -1) runStart = index;
      continue;
    }
    const length = runStart === -1 ? 0 : index - runStart;
    if (length > bestLength && length >= 2) {
      bestStart = runStart;
      bestLength = length;
    }
    runStart = -1;
  }
  if (bestStart === -1) return normalized.join(':');
  const left = normalized.slice(0, bestStart).join(':');
  const right = normalized.slice(bestStart + bestLength).join(':');
  return left === '' && right === ''
    ? '::'
    : left === ''
      ? `::${right}`
      : right === ''
        ? `${left}::`
        : `${left}::${right}`;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
