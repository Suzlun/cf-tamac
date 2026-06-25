import { computeSha256Hex } from './domain/security';
import { createModelIoBytes } from './harness/model-io';

import type { AgentWorkersAiBinding } from './env';
import type { ModelProvider, ModelProviderRequest, ModelProviderResult } from './harness/model-io';

/**
 * Workers AI binding を pure ModelProvider interface に適合させます。
 *
 * @remarks
 * platform runtime binding はこの adapter 境界に閉じ込め、domain/harness/storage 層へは
 * `ModelProvider` interface だけを渡します。binding がない場合は provider call 前に
 * `missing_binding` を返し、raw prompt/completion は repository へ保存しません。
 *
 * @example
 * ```ts
 * const provider = createWorkersAiModelProvider(env.AI);
 * const result = await provider.invoke(request);
 * ```
 */
export function createWorkersAiModelProvider(ai: AgentWorkersAiBinding | undefined): ModelProvider {
  return {
    async invoke(request: ModelProviderRequest): Promise<ModelProviderResult> {
      if (ai === undefined) {
        return {
          category: 'missing_binding',
          retryable: false,
          safeMessage: 'Workers AI binding is not configured for this Agent Worker.',
          status: 'error',
        };
      }
      if (request.policy.provider !== 'workers-ai') {
        return {
          category: 'unsupported_provider',
          retryable: false,
          safeMessage: 'Only workers-ai provider is supported.',
          status: 'error',
        };
      }
      if (!request.policy.modelId.startsWith('@cf/')) {
        return {
          category: 'unsupported_model',
          retryable: false,
          safeMessage: 'Workers AI model_id must use an @cf/ model.',
          status: 'error',
        };
      }
      return invokeWorkersAi(ai, request);
    },
  };
}

async function invokeWorkersAi(
  ai: AgentWorkersAiBinding,
  request: ModelProviderRequest
): Promise<ModelProviderResult> {
  const startedAt = Date.now();
  try {
    const output = await ai.run(request.policy.modelId, {
      ...buildWorkersAiGenerationParameters(request),
      prompt: request.promptText,
    });
    const outputText = extractOutputText(output);
    if (outputText === undefined) {
      return {
        category: 'provider_invalid_response',
        retryable: true,
        safeMessage: 'Workers AI response did not contain text output.',
        status: 'error',
      };
    }
    return {
      latencyMs: Date.now() - startedAt,
      outputText,
      responseDigest: {
        algorithm: 'sha-256',
        byteLength: createModelIoBytes(outputText).byteLength,
        digestHex: await computeSha256Hex(createModelIoBytes(outputText)),
      },
      status: 'ok',
    };
  } catch (error) {
    return normalizeWorkersAiError(error);
  }
}

function buildWorkersAiGenerationParameters(request: ModelProviderRequest): Record<string, number> {
  return {
    max_tokens: request.generationParameters.maxOutputTokens ?? 1024,
    ...(request.generationParameters.temperature === undefined
      ? {}
      : { temperature: request.generationParameters.temperature }),
    ...(request.generationParameters.topP === undefined
      ? {}
      : { top_p: request.generationParameters.topP }),
  };
}

function extractOutputText(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (typeof output !== 'object' || output === null) return undefined;
  const candidate = output as Partial<{
    readonly response: unknown;
    readonly result: unknown;
    readonly text: unknown;
  }>;
  if (typeof candidate.response === 'string') return candidate.response;
  if (typeof candidate.text === 'string') return candidate.text;
  if (typeof candidate.result === 'string') return candidate.result;
  return undefined;
}

function normalizeWorkersAiError(error: unknown): ModelProviderResult {
  const message = error instanceof Error ? error.message : '';
  if (/timeout/i.test(message)) {
    return {
      category: 'provider_timeout',
      retryable: true,
      safeMessage: 'Workers AI provider timed out.',
      status: 'error',
    };
  }
  if (/rate|429/i.test(message)) {
    return {
      category: 'provider_rate_limited',
      retryable: true,
      safeMessage: 'Workers AI provider rate limited the request.',
      status: 'error',
    };
  }
  return {
    category: 'provider_unavailable',
    retryable: true,
    safeMessage: 'Workers AI provider invocation failed.',
    status: 'error',
  };
}
