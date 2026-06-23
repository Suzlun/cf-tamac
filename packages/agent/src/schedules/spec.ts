import { createAgentDomainError } from '../domain/errors';

import type { AgentScheduleRuntimePlan } from './types';

/**
 * Schedule spec の解析結果です。
 */
export interface ParsedAgentScheduleSpec {
  readonly intervalSeconds?: number;
  readonly kind: 'one_shot' | 'interval';
  readonly nextFireAtMs: number;
  readonly runtimePlan: AgentScheduleRuntimePlan;
}

/**
 * `schedule_spec` 文字列を Agents SDK 登録用の plan へ変換します。
 *
 * @param scheduleSpec RPC で受け取った schedule specification です。
 * @param nowMs 現在時刻の Unix milliseconds です。
 * @returns one-shot または interval の runtime plan を返します。
 * @throws AgentDomainError 空文字、不正 JSON、過去時刻、非正 interval の場合に発生します。
 */
export function parseAgentScheduleSpec(
  scheduleSpec: string,
  nowMs: number
): ParsedAgentScheduleSpec {
  const trimmed = scheduleSpec.trim();
  if (trimmed === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'schedule_spec is required.' });
  }
  const json = parseJsonScheduleSpec(trimmed);
  if (json !== undefined) return jsonToScheduleSpec(json, nowMs);
  if (trimmed.startsWith('every:')) return parseIntervalSpec(trimmed.slice(6), nowMs);
  if (trimmed.startsWith('interval:')) return parseIntervalSpec(trimmed.slice(9), nowMs);
  if (trimmed.startsWith('delay:')) return parseDelaySpec(trimmed.slice(6), nowMs);
  if (trimmed.startsWith('at:')) return parseAtSpec(trimmed.slice(3), nowMs);
  return parseAtSpec(trimmed, nowMs);
}

function parseJsonScheduleSpec(value: string): Readonly<Record<string, unknown>> | undefined {
  if (!value.startsWith('{')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw createAgentDomainError({ kind: 'validation', message: 'schedule_spec JSON is invalid.' });
  }
  if (isRecord(parsed)) return parsed;
  throw createAgentDomainError({
    kind: 'validation',
    message: 'schedule_spec JSON must be an object.',
  });
}

function jsonToScheduleSpec(
  value: Readonly<Record<string, unknown>>,
  nowMs: number
): ParsedAgentScheduleSpec {
  const type = typeof value.type === 'string' ? value.type : undefined;
  if (type === 'interval' || type === 'every')
    return parseIntervalSpec(value.intervalSeconds, nowMs);
  if (type === 'delay') return parseDelaySpec(value.delaySeconds, nowMs);
  if (type === 'one-shot' || type === 'one_shot' || type === 'at') {
    return parseAtSpec(value.atUnixMs ?? value.at, nowMs);
  }
  throw createAgentDomainError({
    kind: 'validation',
    message: 'schedule_spec type is unsupported.',
  });
}

function parseIntervalSpec(rawSeconds: unknown, nowMs: number): ParsedAgentScheduleSpec {
  const intervalSeconds = parsePositiveNumber(rawSeconds, 'interval_seconds');
  const nextFireAtMs = nowMs + intervalSeconds * 1000;
  return {
    intervalSeconds,
    kind: 'interval',
    nextFireAtMs,
    runtimePlan: { intervalSeconds, kind: 'interval', nextFireAtMs },
  };
}

function parseDelaySpec(rawSeconds: unknown, nowMs: number): ParsedAgentScheduleSpec {
  const delaySeconds = parsePositiveNumber(rawSeconds, 'delay_seconds');
  const nextFireAtMs = nowMs + delaySeconds * 1000;
  return {
    kind: 'one_shot',
    nextFireAtMs,
    runtimePlan: { kind: 'one_shot', nextFireAtMs, when: delaySeconds },
  };
}

function parseAtSpec(rawAt: unknown, nowMs: number): ParsedAgentScheduleSpec {
  const nextFireAtMs = parseFutureUnixMs(rawAt, nowMs);
  return {
    kind: 'one_shot',
    nextFireAtMs,
    runtimePlan: { kind: 'one_shot', nextFireAtMs, when: new Date(nextFireAtMs) },
  };
}

function parsePositiveNumber(value: unknown, fieldName: string): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(scalarScheduleValueToString(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createAgentDomainError({ kind: 'validation', message: `${fieldName} must be positive.` });
  }
  return parsed;
}

function parseFutureUnixMs(value: unknown, nowMs: number): number {
  const raw = scalarScheduleValueToString(value).trim();
  const numeric = typeof value === 'number' || /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  const parsed = Number.isFinite(numeric) ? numeric : Date.parse(raw);
  if (!Number.isFinite(parsed) || parsed <= nowMs) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'schedule fire time must be future.',
    });
  }
  return parsed;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarScheduleValueToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}
