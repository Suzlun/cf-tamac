CREATE TABLE IF NOT EXISTS client_managed_agents (
  agent_id TEXT PRIMARY KEY,
  agent_rpc_origin TEXT NOT NULL,
  display_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  last_opened_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
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
