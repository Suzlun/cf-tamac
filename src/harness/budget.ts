/**
 * Budget dimensions enforced before model or downstream harness work is committed.
 */
export const harnessBudgetDimensions = [
  'model_calls',
  'tool_calls',
  'tokens',
  'loops',
  'timeout',
  'cooldown',
  'daily_budget',
  'integration_budget',
  'tool_budget',
] as const;

/**
 * Harness budget dimension value.
 */
export type HarnessBudgetDimension = (typeof harnessBudgetDimensions)[number];

/**
 * Budget policy snapshot used by one AgentRun.
 */
export interface HarnessBudgetPolicy {
  readonly cooldownUntilMs?: number;
  readonly maxDailyCostUnits?: number;
  readonly maxIntegrationCallsPerRun?: number;
  readonly maxLoopsPerRun?: number;
  readonly maxModelCallsPerRun?: number;
  readonly maxTokensPerRun?: number;
  readonly maxToolCallsPerRun?: number;
  readonly maxToolCallsPerTool?: number;
  readonly timeoutMs?: number;
}

/**
 * Usage snapshot observed before the next harness step.
 */
export interface HarnessBudgetUsage {
  readonly dailyCostUnitsUsed: number;
  readonly integrationCallsUsed: Readonly<Record<string, number>>;
  readonly loopCount: number;
  readonly modelCalls: number;
  readonly runStartedAtMs: number;
  readonly tokens: number;
  readonly toolCalls: number;
  readonly toolCallsByTool: Readonly<Record<string, number>>;
}

/**
 * Increment requested by the next model or harness step.
 */
export interface HarnessBudgetRequest {
  readonly costUnits?: number;
  readonly integrationCalls?: number;
  readonly integrationId?: string;
  readonly loops?: number;
  readonly modelCalls?: number;
  readonly tokens?: number;
  readonly toolCalls?: number;
  readonly toolId?: string;
}

/**
 * Budget enforcement outcome before a harness step is committed.
 */
export interface HarnessBudgetDecision {
  readonly allowed: boolean;
  readonly dimension?: HarnessBudgetDimension;
  readonly limit?: number;
  readonly outcome: 'allow' | 'stop' | 'fail';
  readonly reason?: string;
  readonly used?: number;
}

/**
 * Enforce Run-level and aggregate budget policy before committing the next harness step.
 */
export function enforceHarnessBudgets(input: {
  readonly nowMs: number;
  readonly policy: HarnessBudgetPolicy;
  readonly request: HarnessBudgetRequest;
  readonly usage: HarnessBudgetUsage;
}): HarnessBudgetDecision {
  const checks: readonly HarnessBudgetDecision[] = [
    checkBudgetLimit(
      'model_calls',
      input.usage.modelCalls + (input.request.modelCalls ?? 0),
      input.policy.maxModelCallsPerRun,
      'fail'
    ),
    checkBudgetLimit(
      'tool_calls',
      input.usage.toolCalls + (input.request.toolCalls ?? 0),
      input.policy.maxToolCallsPerRun,
      'fail'
    ),
    checkBudgetLimit(
      'tokens',
      input.usage.tokens + (input.request.tokens ?? 0),
      input.policy.maxTokensPerRun,
      'fail'
    ),
    checkBudgetLimit(
      'loops',
      input.usage.loopCount + (input.request.loops ?? 0),
      input.policy.maxLoopsPerRun,
      'stop'
    ),
    checkTimeout(input.usage.runStartedAtMs, input.nowMs, input.policy.timeoutMs),
    checkCooldown(input.nowMs, input.policy.cooldownUntilMs),
    checkBudgetLimit(
      'daily_budget',
      input.usage.dailyCostUnitsUsed + (input.request.costUnits ?? 0),
      input.policy.maxDailyCostUnits,
      'fail'
    ),
    checkNamedBudgetLimit({
      currentValues: input.usage.integrationCallsUsed,
      dimension: 'integration_budget',
      increment: input.request.integrationCalls ?? 0,
      limit: input.policy.maxIntegrationCallsPerRun,
      name: input.request.integrationId,
      outcome: 'fail',
    }),
    checkNamedBudgetLimit({
      currentValues: input.usage.toolCallsByTool,
      dimension: 'tool_budget',
      increment: input.request.toolCalls ?? 0,
      limit: input.policy.maxToolCallsPerTool,
      name: input.request.toolId,
      outcome: 'fail',
    }),
  ];
  return checks.find((check) => !check.allowed) ?? { allowed: true, outcome: 'allow' };
}

/**
 * Create an empty budget usage snapshot for tests and initial Run execution.
 */
export function createEmptyHarnessBudgetUsage(runStartedAtMs: number): HarnessBudgetUsage {
  return {
    dailyCostUnitsUsed: 0,
    integrationCallsUsed: {},
    loopCount: 0,
    modelCalls: 0,
    runStartedAtMs,
    tokens: 0,
    toolCalls: 0,
    toolCallsByTool: {},
  };
}

function checkBudgetLimit(
  dimension: HarnessBudgetDimension,
  used: number,
  limit: number | undefined,
  outcome: 'stop' | 'fail'
): HarnessBudgetDecision {
  if (limit === undefined || used <= limit) return { allowed: true, outcome: 'allow' };
  return {
    allowed: false,
    dimension,
    limit,
    outcome,
    reason: `${dimension} budget exceeded`,
    used,
  };
}

function checkCooldown(nowMs: number, cooldownUntilMs: number | undefined): HarnessBudgetDecision {
  if (cooldownUntilMs === undefined || nowMs >= cooldownUntilMs) {
    return { allowed: true, outcome: 'allow' };
  }
  return {
    allowed: false,
    dimension: 'cooldown',
    limit: cooldownUntilMs,
    outcome: 'stop',
    reason: 'cooldown budget active',
    used: nowMs,
  };
}

function checkNamedBudgetLimit(input: {
  readonly currentValues: Readonly<Record<string, number>>;
  readonly dimension: HarnessBudgetDimension;
  readonly increment: number;
  readonly limit: number | undefined;
  readonly name?: string;
  readonly outcome: 'stop' | 'fail';
}): HarnessBudgetDecision {
  if (input.limit === undefined || input.name === undefined) {
    return { allowed: true, outcome: 'allow' };
  }
  return checkBudgetLimit(
    input.dimension,
    (input.currentValues[input.name] ?? 0) + input.increment,
    input.limit,
    input.outcome
  );
}

function checkTimeout(
  runStartedAtMs: number,
  nowMs: number,
  timeoutMs: number | undefined
): HarnessBudgetDecision {
  if (timeoutMs === undefined || nowMs - runStartedAtMs <= timeoutMs) {
    return { allowed: true, outcome: 'allow' };
  }
  return {
    allowed: false,
    dimension: 'timeout',
    limit: timeoutMs,
    outcome: 'fail',
    reason: 'timeout budget exceeded',
    used: nowMs - runStartedAtMs,
  };
}
