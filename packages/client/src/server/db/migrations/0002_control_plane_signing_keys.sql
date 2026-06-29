-- 0002_control_plane_signing_keys.sql
-- Client D1 management ledger へ Ed25519 Client Service signing key store と
-- managed Agent の署名 identity metadata を追加する。
-- この migration は Client-owned 管理対象 Agent records と外部 credential references を壊さず、
-- 新規 table と nullable column を追加するだけである。

-- Client Service signing key store: Agent RPC bearer JWT 署名専用の Ed25519 鍵ペア。
-- private_jwk_ciphertext には CLIENT_CREDENTIAL_ENCRYPTION_KEY で暗号化した private JWK envelope だけを保存し、
-- 平文の秘密鍵、raw shared secret、JWT body は一切保存しない。
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
);

-- managed Agent ごとの署名 identity metadata。既存行を壊さないためすべて nullable。
-- key 未選択状態 (NULL) の場合は Agent RPC 呼び出し前に明示的な signing key selection を要求する。
-- Agent RPC 署名経路はこの metadata と client_signing_keys の組だけを正本とし、
-- Cloudflare ENV/Secret や credentialRef を経由しない。
ALTER TABLE client_managed_agents ADD COLUMN signing_issuer TEXT;
ALTER TABLE client_managed_agents ADD COLUMN signing_key_id TEXT;
ALTER TABLE client_managed_agents ADD COLUMN signing_public_fingerprint TEXT;
ALTER TABLE client_managed_agents ADD COLUMN signing_last_verified_at_ms INTEGER;
