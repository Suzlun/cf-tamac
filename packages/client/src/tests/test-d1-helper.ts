import { DatabaseSync } from 'node:sqlite';

import type {
  D1Database,
  D1ExecResult,
  D1PreparedStatement,
  D1Result,
} from '@cloudflare/workers-types';

/**
 * Create an in-memory D1Database-compatible stub backed by node:sqlite.
 *
 * This helper lets repository tests execute real SQL against the Client D1
 * migration without requiring Cloudflare Workers bindings or Agent Service
 * resources. It is test-only and must not be imported by production code.
 */
export function createTestD1Database(): D1Database {
  const db = new DatabaseSync(':memory:');
  // D1 と同じ foreign-key 制約を有効にし、credential reference の atomic batch failure を test double でも再現する。
  db.exec('PRAGMA foreign_keys = ON');
  return createD1FromSqlite(db);
}

function createD1FromSqlite(db: DatabaseSync): D1Database {
  const instance = {
    prepare(sql: string): D1PreparedStatement {
      return createPreparedStatement(db, sql);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      // Cloudflare D1 `batch()` と同じく全 statement を一つの transaction で実行し、phase failure が
      // managed Agent/credential/signing/attempt metadata の部分更新を残さないことを repository tests で検証する。
      db.exec('BEGIN');
      try {
        for (const stmt of statements) {
          results.push(await stmt.run<T>());
        }
        db.exec('COMMIT');
        return results;
      } catch (error) {
        // 途中 statement が失敗した場合は preimage を完全復元し、test double が production D1 atomicity と異なる挙動にならないようにする。
        db.exec('ROLLBACK');
        throw error;
      }
    },
    exec(query: string): Promise<D1ExecResult> {
      db.exec(query);
      return Promise.resolve({ count: 0, duration: 0 });
    },
    dump(): Promise<ArrayBuffer> {
      return Promise.resolve(new ArrayBuffer(0));
    },
  };
  return instance as unknown as D1Database;
}

function createPreparedStatement(db: DatabaseSync, sql: string): D1PreparedStatement {
  const statement = db.prepare(sql);

  function toSqlValue(value: unknown): string | number | null | Uint8Array {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    return JSON.stringify(value);
  }

  function buildResult<T>(results: unknown[], changes = 0): D1Result<T> {
    return {
      success: true,
      results: results.map((row) =>
        row !== null && typeof row === 'object'
          ? Object.fromEntries(Object.entries(row as Record<string, unknown>))
          : {}
      ) as T[],
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changes,
        served_by: 'test',
        timed_out: false,
        changed_db: false,
      },
    };
  }

  function bound(values: unknown[]): D1PreparedStatement {
    return {
      bind(...bindValues: unknown[]): D1PreparedStatement {
        return bound([...values, ...bindValues]);
      },
      all<T = unknown>(...args: unknown[]): Promise<D1Result<T>> {
        const params = args.length > 0 ? args : values;
        const rows = statement.all(...params.map(toSqlValue)) as unknown[];
        return Promise.resolve(buildResult<T>(rows));
      },
      first<T = unknown>(...args: unknown[]): Promise<T | null> {
        const params = args.length > 0 ? args : values;
        const row = statement.get(...params.map(toSqlValue));
        if (row === undefined) {
          return Promise.resolve(null);
        }
        return Promise.resolve(
          Object.fromEntries(Object.entries(row as Record<string, unknown>)) as T
        );
      },
      run<T = unknown>(...args: unknown[]): Promise<D1Result<T>> {
        const params = args.length > 0 ? args : values;
        const execution = statement.run(...params.map(toSqlValue));
        // node:sqlite の changes を D1 meta へ写し、conditional state transition の postcondition を repository tests で検証可能にする。
        return Promise.resolve(buildResult<T>([], Number(execution.changes)));
      },
      raw<T = unknown[]>(...args: unknown[]): Promise<T[]> {
        const params = args.length > 0 ? args : values;
        const rows = statement.all(...params.map(toSqlValue)) as Record<string, unknown>[];
        return Promise.resolve(rows.map((row) => Object.values(row) as T));
      },
    } as unknown as D1PreparedStatement;
  }

  return bound([]);
}

/**
 * Apply the Client D1 foundation migration to a test database.
 *
 * @remarks 0001 + 0002 + 0004 を適用し、管理対象 Agent 台帳・外部 credential 参照・
 * 暗号化済み Client Service signing key store、registration attempt/reconciliation metadata を揃える。
 */
export async function applyClientMigration(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS client_managed_agents (
      agent_id TEXT PRIMARY KEY,
      agent_rpc_origin TEXT NOT NULL,
      display_name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      last_opened_at_ms INTEGER,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
       signing_issuer TEXT,
       signing_key_id TEXT,
       signing_public_fingerprint TEXT,
       signing_last_verified_at_ms INTEGER,
       registration_state TEXT NOT NULL DEFAULT 'active',
       registration_attempt_id TEXT,
       initialization_idempotency_key TEXT,
        registration_request_digest TEXT,
        registration_model_policy_ref TEXT,
       registration_last_failure_phase TEXT,
       registration_last_failure_category TEXT,
       registration_last_failure_correlation_id TEXT
    );

    CREATE TABLE IF NOT EXISTS client_agent_credential_refs (
      agent_id TEXT NOT NULL,
      credential_ref TEXT NOT NULL,
      key_id TEXT NOT NULL,
      public_fingerprint TEXT NOT NULL,
      masked_hint TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (agent_id, credential_ref),
      FOREIGN KEY (agent_id) REFERENCES client_managed_agents(agent_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS client_signing_keys (
      issuer TEXT NOT NULL,
      key_id TEXT NOT NULL,
      public_jwk TEXT NOT NULL,
      public_fingerprint TEXT NOT NULL,
      private_jwk_ciphertext TEXT NOT NULL,
      status TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      last_used_at_ms INTEGER,
      PRIMARY KEY (issuer, key_id)
    );`
  );
}
