-- 0004_managed_agent_registration_reconciliation.sql
-- Client-owned managed Agent ledger に登録 attempt の再実行・照合 metadata を追加する。
-- Agent domain snapshot や credential secret は保存せず、create flow の安全な状態遷移だけを記録する。

-- 既存の初期化済み registry row は migration 時点で active として扱う。
-- 新規 create attempt は repository が initializing を明示的に保存し、response 不確定時だけ reconciliation_required に遷移する。
ALTER TABLE client_managed_agents ADD COLUMN registration_state TEXT NOT NULL DEFAULT 'active'
  CHECK (registration_state IN ('initializing', 'active', 'reconciliation_required'));
ALTER TABLE client_managed_agents ADD COLUMN registration_attempt_id TEXT;
ALTER TABLE client_managed_agents ADD COLUMN initialization_idempotency_key TEXT;
ALTER TABLE client_managed_agents ADD COLUMN registration_request_digest TEXT;
-- これは Agent config snapshot ではなく、再照合で requested policy と同一性を確認する create attempt intent である。
ALTER TABLE client_managed_agents ADD COLUMN registration_model_policy_ref TEXT;

-- cleanup failure は Browser へ返さない。server-only repository が phase/category/correlation を保持し、
-- 同じ attempt の状態確認 action と運用調査にだけ使用する。
ALTER TABLE client_managed_agents ADD COLUMN registration_last_failure_phase TEXT;
ALTER TABLE client_managed_agents ADD COLUMN registration_last_failure_category TEXT;
ALTER TABLE client_managed_agents ADD COLUMN registration_last_failure_correlation_id TEXT;
